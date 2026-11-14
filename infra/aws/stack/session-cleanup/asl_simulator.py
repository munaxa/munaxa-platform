"""A small, strict offline interpreter for the subset of Amazon States Language (JSONPath mode) that
session-cleanup/definition.asl.json uses. It exists so the cleanup's control flow can be tested
against a fake AWS with no network and no AWS account (Stage E blocker BE-2).

It is NOT Step Functions. What it models, from the ASL specification:
  - states Pass, Task, Choice, Wait, Parallel, Map (INLINE), Succeed, Fail;
  - InputPath, Parameters / ItemSelector (keys ending ".$"), ResultSelector, ResultPath (incl. null),
    OutputPath; context object paths "$$.Map.Item.Value";
  - JSONPath: dotted names, [n] indexes, and filters [?(@.key == literal)] followed by a projection;
  - intrinsics States.Array, States.ArrayLength, States.MathAdd, States.JsonToString, States.Format;
  - Choice rules And, Or, Not, IsPresent, IsBoolean, StringEquals, StringMatches, BooleanEquals,
    NumericEquals, NumericLessThan, NumericLessThanEquals;
  - Retry (first matching retrier, MaxAttempts, IntervalSeconds, BackoffRate) and Catch, where
    States.ALL matches every error except States.Runtime (which always fails the execution);
  - the state machine TimeoutSeconds against a simulated clock (Wait and retry intervals advance it).
What it cannot prove: the AWS SDK integration's real error names and response field names, IAM, and
service behaviour. Those are listed as unverified in the report and checked by the dry run (B-4).
"""

import copy
import fnmatch
import json
import re


class StatesError(Exception):
    """An ASL error with a name (e.g. SecretsManager.ResourceNotFoundException, States.Runtime)."""

    def __init__(self, name, cause=""):
        super().__init__(name)
        self.name = name
        self.cause = cause


class ExecutionFailed(Exception):
    def __init__(self, status, error, cause):
        super().__init__(f"{status} {error}")
        self.status = status
        self.error = error
        self.cause = cause


_MISSING = object()
_TOKEN = re.compile(r"\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]|\[\?\(@\.([A-Za-z_][A-Za-z0-9_]*)\s*==\s*([^)]+)\)\]")


def _literal(text):
    text = text.strip()
    if text in ("true", "false"):
        return text == "true"
    if text.startswith("'") and text.endswith("'"):
        return text[1:-1]
    return json.loads(text)


def _tokens(path):
    if path.startswith("$$"):
        root, rest = "context", path[2:]
    elif path.startswith("$"):
        root, rest = "input", path[1:]
    else:
        raise StatesError("States.Runtime", f"not a path: {path}")
    out, pos = [], 0
    while pos < len(rest):
        m = _TOKEN.match(rest, pos)
        if not m:
            raise StatesError("States.Runtime", f"unsupported path syntax: {path}")
        if m.group(1) is not None:
            out.append(("key", m.group(1)))
        elif m.group(2) is not None:
            out.append(("index", int(m.group(2))))
        else:
            out.append(("filter", m.group(3), _literal(m.group(4))))
        pos = m.end()
    return root, out


def get_path(path, data, context=None, missing_ok=False):
    root, tokens = _tokens(path)
    cur = context if root == "context" else data
    projecting = False
    for tok in tokens:
        if projecting:
            if tok[0] != "key":
                raise StatesError("States.Runtime", f"unsupported projection in {path}")
            cur = [item[tok[1]] for item in cur if isinstance(item, dict) and tok[1] in item]
            continue
        if tok[0] == "key":
            if not isinstance(cur, dict) or tok[1] not in cur:
                if missing_ok:
                    return _MISSING
                raise StatesError("States.Runtime", f"path {path} not found")
            cur = cur[tok[1]]
        elif tok[0] == "index":
            if not isinstance(cur, list) or tok[1] >= len(cur):
                if missing_ok:
                    return _MISSING
                raise StatesError("States.Runtime", f"path {path} not found")
            cur = cur[tok[1]]
        else:
            if not isinstance(cur, list):
                raise StatesError("States.Runtime", f"filter on a non-array in {path}")
            cur = [item for item in cur if isinstance(item, dict) and item.get(tok[1], _MISSING) == tok[2]]
            projecting = True
    return copy.deepcopy(cur)


def set_result(data, result_path, result):
    if result_path is None:
        return data
    if result_path == "$":
        return copy.deepcopy(result)
    root, tokens = _tokens(result_path)
    if root != "input" or any(t[0] != "key" for t in tokens):
        raise StatesError("States.Runtime", f"unsupported ResultPath {result_path}")
    data = copy.deepcopy(data) if isinstance(data, dict) else {}
    cur = data
    for tok in tokens[:-1]:
        if not isinstance(cur.get(tok[1]), dict):
            cur[tok[1]] = {}
        cur = cur[tok[1]]
    cur[tokens[-1][1]] = copy.deepcopy(result)
    return data


def _split_args(text):
    args, depth, buf, quoted = [], 0, "", False
    for ch in text:
        if ch == "'" and depth == 0:
            quoted = not quoted
        if ch == "," and depth == 0 and not quoted:
            args.append(buf.strip())
            buf = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        buf += ch
    if buf.strip():
        args.append(buf.strip())
    return args


def evaluate(expr, data, context):
    if expr.startswith("States."):
        name, _, rest = expr.partition("(")
        if not rest.endswith(")"):
            raise StatesError("States.Runtime", f"bad intrinsic {expr}")
        args = [evaluate(a, data, context) if a.startswith(("$", "States.")) else _literal(a) for a in _split_args(rest[:-1])]
        if name == "States.Array":
            return list(args)
        if name == "States.ArrayLength":
            if not isinstance(args[0], list):
                raise StatesError("States.Runtime", "ArrayLength of a non-array")
            return len(args[0])
        if name == "States.MathAdd":
            if not all(isinstance(a, int) and not isinstance(a, bool) for a in args):
                raise StatesError("States.Runtime", "MathAdd of a non-integer")
            return args[0] + args[1]
        if name == "States.JsonToString":
            return json.dumps(args[0], separators=(",", ":"), sort_keys=False)
        if name == "States.Format":
            template, values = args[0], list(args[1:])
            return re.sub(r"\{\}", lambda _m: str(values.pop(0)), template)
        raise StatesError("States.Runtime", f"unsupported intrinsic {name}")
    return get_path(expr, data, context)


def render(template, data, context):
    if isinstance(template, dict):
        out = {}
        for key, value in template.items():
            if key.endswith(".$"):
                out[key[:-2]] = evaluate(value, data, context)
            else:
                out[key] = render(value, data, context)
        return out
    if isinstance(template, list):
        return [render(v, data, context) for v in template]
    return copy.deepcopy(template)


def _matches(rule, data):
    if "And" in rule:
        return all(_matches(r, data) for r in rule["And"])
    if "Or" in rule:
        return any(_matches(r, data) for r in rule["Or"])
    if "Not" in rule:
        return not _matches(rule["Not"], data)
    value = get_path(rule["Variable"], data, missing_ok=True)
    if "IsPresent" in rule:
        return (value is not _MISSING) == rule["IsPresent"]
    if value is _MISSING:
        raise StatesError("States.Runtime", f"Choice variable {rule['Variable']} not found")
    if "IsBoolean" in rule:
        return isinstance(value, bool) == rule["IsBoolean"]
    if "StringEquals" in rule:
        return isinstance(value, str) and value == rule["StringEquals"]
    if "StringMatches" in rule:
        return isinstance(value, str) and fnmatch.fnmatchcase(value, rule["StringMatches"])
    if "BooleanEquals" in rule:
        return isinstance(value, bool) and value == rule["BooleanEquals"]
    number = isinstance(value, (int, float)) and not isinstance(value, bool)
    if "NumericEquals" in rule:
        return number and value == rule["NumericEquals"]
    if "NumericLessThan" in rule:
        return number and value < rule["NumericLessThan"]
    if "NumericLessThanEquals" in rule:
        return number and value <= rule["NumericLessThanEquals"]
    raise StatesError("States.Runtime", f"unsupported Choice rule {sorted(rule)}")


def _error_matches(names, error):
    if error == "States.Runtime":
        return False
    return error in names or "States.ALL" in names


class Simulator:
    """Runs a definition against `aws`, an object with call(service, action, params) -> dict that raises
    StatesError for an API error. Records every Task call and the simulated elapsed seconds."""

    TASK_PREFIX = "arn:aws:states:::aws-sdk:"

    def __init__(self, definition, aws, max_transitions=5000):
        self.definition = definition
        self.aws = aws
        self.clock = 0
        self.transitions = 0
        self.max_transitions = max_transitions
        self.calls = []

    def run(self, execution_input):
        timeout = self.definition.get("TimeoutSeconds")
        try:
            output = self._run_machine(self.definition, copy.deepcopy(execution_input), {})
        except ExecutionFailed as failed:
            return {"status": failed.status, "error": failed.error, "cause": failed.cause, "seconds": self.clock}
        except StatesError as err:
            return {"status": "FAILED", "error": err.name, "cause": err.cause, "seconds": self.clock}
        if timeout is not None and self.clock > timeout:
            return {"status": "TIMED_OUT", "error": "States.Timeout", "cause": "", "seconds": self.clock}
        return {"status": "SUCCEEDED", "output": output, "seconds": self.clock}

    def _tick(self, seconds=0):
        self.transitions += 1
        if self.transitions > self.max_transitions:
            raise ExecutionFailed("FAILED", "Simulator.Loop", "too many transitions")
        self.clock += seconds
        timeout = self.definition.get("TimeoutSeconds")
        if timeout is not None and self.clock > timeout:
            raise ExecutionFailed("TIMED_OUT", "States.Timeout", "")

    def _run_machine(self, machine, data, context):
        name = machine["StartAt"]
        while True:
            self._tick()
            state = machine["States"][name]
            kind = state["Type"]
            if kind == "Succeed":
                return data
            if kind == "Fail":
                cause = state.get("Cause", "")
                if "CausePath" in state:
                    cause = evaluate(state["CausePath"], data, context)
                raise ExecutionFailed("FAILED", state.get("Error", ""), cause)
            if kind == "Choice":
                name = next((c["Next"] for c in state["Choices"] if _matches(c, data)), state.get("Default"))
                if name is None:
                    raise StatesError("States.NoChoiceMatched")
                continue
            effective = get_path(state["InputPath"], data, context) if "InputPath" in state else data
            try:
                result = self._execute(state, effective, data, context)
            except StatesError as err:
                if err.name == "States.Runtime":
                    raise
                handler = next((c for c in state.get("Catch", []) if _error_matches(c["ErrorEquals"], err.name)), None)
                if handler is None:
                    raise
                data = set_result(data, handler.get("ResultPath", "$"), {"Error": err.name, "Cause": err.cause})
                name = handler["Next"]
                continue
            data = set_result(data, state.get("ResultPath", "$"), result)
            if "OutputPath" in state:
                data = get_path(state["OutputPath"], data, context)
            if state.get("End"):
                return data
            name = state["Next"]

    def _execute(self, state, effective, data, context):
        kind = state["Type"]
        if kind == "Pass":
            if "Parameters" in state:
                return render(state["Parameters"], effective, context)
            if "Result" in state:
                return copy.deepcopy(state["Result"])
            return effective
        if kind == "Wait":
            self._tick(state["Seconds"])
            return effective
        if kind == "Task":
            return self._task(state, effective, context)
        if kind == "Parallel":
            results = []
            for branch in state["Branches"]:
                results.append(self._run_machine(branch, copy.deepcopy(effective), context))
            return results
        if kind == "Map":
            items = get_path(state["ItemsPath"], effective, context)
            if not isinstance(items, list):
                raise StatesError("States.Runtime", "ItemsPath is not an array")
            results = []
            for index, value in enumerate(items):
                item_context = dict(context, Map={"Item": {"Index": index, "Value": value}})
                item = render(state["ItemSelector"], effective, item_context) if "ItemSelector" in state else value
                results.append(self._run_machine(state["ItemProcessor"], item, item_context))
            return results
        raise StatesError("States.Runtime", f"unsupported state type {kind}")

    def _task(self, state, effective, context):
        resource = state["Resource"]
        if not resource.startswith(self.TASK_PREFIX):
            raise StatesError("States.Runtime", f"unsupported resource {resource}")
        service, _, action = resource[len(self.TASK_PREFIX):].partition(":")
        params = render(state.get("Parameters", {}), effective, context)
        attempts = {}
        while True:
            self._tick()
            try:
                self.calls.append((service, action, copy.deepcopy(params)))
                response = self.aws.call(service, action, params)
                break
            except StatesError as err:
                index = next((i for i, r in enumerate(state.get("Retry", [])) if _error_matches(r["ErrorEquals"], err.name)), None)
                if index is None:
                    raise
                retrier = state["Retry"][index]
                count = attempts.get(index, 0)
                if count >= retrier.get("MaxAttempts", 3):
                    raise
                attempts[index] = count + 1
                self._tick(retrier.get("IntervalSeconds", 1) * (retrier.get("BackoffRate", 2.0) ** count))
        if "ResultSelector" in state:
            response = render(state["ResultSelector"], response, context)
        return response


def load_definition(template_path, values):
    """Fill the ${name} placeholders the way Terraform's templatefile does for this file."""
    with open(template_path, encoding="utf-8") as handle:
        text = handle.read()
    for key, value in values.items():
        text = text.replace("${" + key + "}", value)
    if "${" in text:
        raise ValueError("unfilled template placeholder")
    return json.loads(text)
