"""H-20 enforced: tests for scripts/aws/session-cleanup-gate.sh and its step in aws-session.yml.

Offline only. A stub `aws` on PATH answers from the same fake AWS that test_session_cleanup_arm.py
uses for the connector gate, so each case runs through both and the two must agree (parity). A stub
`date` fixes the clock at the fake's 10:00 UTC. No credential, no network, no AWS call.

    python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'
"""

import copy
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_session_cleanup_arm as arm  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GATE = os.path.join(ROOT, "scripts", "aws", "session-cleanup-gate.sh")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "aws-session.yml")
NAME = arm.NAME
EXEC = f"arn:aws:states:eu-central-1:{arm.ACCOUNT}:execution:{NAME}:run-1"
READ_OPS = {"GetCallerIdentity", "DescribeStateMachine", "ListExecutions", "DescribeExecution",
            "GetSchedule", "ListSchedules", "DescribeAlarms"}
# The connector's eight checks, and the shell gate's names for them (its daily_enabled is split).
SHARED = {
    "state_machine_active": ["state_machine_active"],
    "succeeded_within_26h": ["succeeded_within_26h"],
    "last_success_was_real": ["last_success_was_real"],
    "none_running": ["none_running"],
    "daily_enabled": ["daily_enabled", "daily_role_and_input"],
    "alarms_present": ["alarms_present"],
    "alarms_not_in_alarm": ["alarms_not_in_alarm"],
    "no_stale_session_schedules": ["no_stale_session_schedules"],
}

# The stub: one process per CLI call. It maps the CLI arguments to the fake's operations, pops a
# queued fault per operation (persisted in the fixture), logs every call, and prints JSON like the
# AWS CLI (an error goes to stderr as "An error occurred (<Code>) when calling ...", exit 254).
STUB_AWS = r'''#!/usr/bin/env python3
import json, os, sys
fx_path, log_path = os.environ["STUB_FIXTURE"], os.environ["STUB_LOG"]
fx = json.load(open(fx_path))
args = sys.argv[1:]
def opt(name, many=False):
    if name not in args:
        return None
    i = args.index(name)
    if many:
        out = []
        for a in args[i + 1:]:
            if a.startswith("--"):
                break
            out.append(a)
        return out
    return args[i + 1]
assert opt("--region") == "eu-central-1" and opt("--output") == "json", args
pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
service, command = pos[0], pos[1]
ops = {("sts", "get-caller-identity"): "GetCallerIdentity",
       ("stepfunctions", "describe-state-machine"): "DescribeStateMachine",
       ("stepfunctions", "list-executions"): "ListExecutions",
       ("stepfunctions", "describe-execution"): "DescribeExecution",
       ("scheduler", "get-schedule"): "GetSchedule",
       ("scheduler", "list-schedules"): "ListSchedules",
       ("cloudwatch", "describe-alarms"): "DescribeAlarms"}
op = ops.get((service, command))
with open(log_path, "a") as f:
    f.write(json.dumps([op or (service + " " + command), args]) + "\n")
if op is None:
    sys.stderr.write("unexpected aws call\n")
    sys.exit(99)
def fail(code):
    sys.stderr.write("\nAn error occurred (%s) when calling the %s operation: secret-looking message arn:aws:x\n" % (code, op))
    sys.exit(254)
queue = fx["faults"].get(op) or []
if queue:
    fault = queue.pop(0)
    json.dump(fx, open(fx_path, "w"))
    if fault == "MALFORMED":
        print("this is not json {")
        sys.exit(0)
    if fault is not None:  # None: answer normally this time
        fail(fault)
if op == "GetCallerIdentity":
    out = {"Account": fx["account"], "Arn": "arn:aws:sts::x:assumed-role/y/z", "UserId": "u"}
elif op == "DescribeStateMachine":
    if fx["sm"] is None:
        fail("StateMachineDoesNotExist")
    out = fx["sm"]
elif op == "ListExecutions":
    src = fx["succeeded"] if opt("--status-filter") == "SUCCEEDED" else fx["running"]
    out = {"executions": src[: int(opt("--max-items"))]}
elif op == "DescribeExecution":
    out = {"executionArn": opt("--execution-arn"), "input": fx["inputs"].get(opt("--execution-arn"), "{}"), "status": "SUCCEEDED"}
elif op == "GetSchedule":
    name = opt("--name")
    if name not in fx["schedules"]:
        fail("ResourceNotFoundException")
    out = dict(fx["schedules"][name], Name=name)
    out.pop("ClientToken", None)
elif op == "ListSchedules":
    prefix = opt("--name-prefix")
    out = {"Schedules": [{"Name": n, "State": v.get("State")} for n, v in sorted(fx["schedules"].items()) if n.startswith(prefix)]}
elif op == "DescribeAlarms":
    names = opt("--alarm-names", many=True)
    out = {"MetricAlarms": [{"AlarmName": n, "StateValue": s} for n, s in fx["alarms"].items() if n in names], "CompositeAlarms": []}
print(json.dumps(out))
'''

STUB_DATE = r'''#!/usr/bin/env bash
if [ "$#" -eq 2 ] && [ "$1" = "-u" ] && [ "$2" = "+%s" ]; then echo "$STUB_NOW"; exit 0; fi
exec /bin/date "$@"
'''


def stamp(value):
    return value.isoformat() if isinstance(value, datetime.datetime) else value


def fixture(fake):
    return json.loads(json.dumps({
        "account": fake.account, "sm": fake.sm, "running": fake.running, "inputs": fake.inputs,
        "succeeded": fake.succeeded, "schedules": fake.schedules, "alarms": fake.alarms,
        "faults": fake.faults,
    }, default=stamp))


def healthy():
    """The connector's healthy fake with a real execution ARN, and this session armed by `arm`."""
    fake = arm.Fake()
    fake.succeeded = [{"executionArn": EXEC, "status": "SUCCEEDED", "stopDate": arm.now() - datetime.timedelta(hours=3)}]
    fake.inputs = {EXEC: '{"dryRun": false}'}
    h = arm.hard_stop()
    out = arm.run(fake, MODE="arm", HARD_STOP_UTC=h)
    assert out["result"] == "ARMED", out
    fake.calls = []
    return fake, h


class Shell:
    def __init__(self):
        self.dir = tempfile.mkdtemp()
        os.mkdir(os.path.join(self.dir, "bin"))
        for name, text in (("aws", STUB_AWS), ("date", STUB_DATE)):
            path = os.path.join(self.dir, "bin", name)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            os.chmod(path, 0o755)

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def run(self, fake, hard_stop, extra_env=None):
        fx_path = os.path.join(self.dir, "fixture.json")
        log_path = os.path.join(self.dir, "calls.log")
        with open(fx_path, "w", encoding="utf-8") as f:
            json.dump(fixture(fake), f)
        if os.path.exists(log_path):
            os.remove(log_path)
        env = {"PATH": os.path.join(self.dir, "bin") + ":/usr/bin:/bin", "STUB_FIXTURE": fx_path, "STUB_LOG": log_path,
               "STUB_NOW": str(int(arm.now().timestamp())), "HOME": self.dir}
        if hard_stop is not None:
            env["HARD_STOP_UTC"] = hard_stop
        env.update(extra_env or {})
        p = subprocess.run(["bash", GATE], env=env, capture_output=True, text=True, timeout=60)
        checks, errors = {}, {}
        for line in p.stdout.splitlines():
            m = re.match(r"^check (\S+) (true|false)(?: (\S+))?$", line)
            if m:
                checks[m.group(1)] = m.group(2) == "true"
                if m.group(3):
                    errors[m.group(1)] = m.group(3)
        calls = []
        if os.path.exists(log_path):
            with open(log_path, encoding="utf-8") as f:
                calls = [json.loads(x)[0] for x in f if x.strip()]
        return {"code": p.returncode, "out": p.stdout, "err": p.stderr, "checks": checks, "errors": errors, "calls": calls}


class GateScript(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sh = Shell()

    @classmethod
    def tearDownClass(cls):
        cls.sh.close()

    def gate(self, fake, h, **env):
        return self.sh.run(fake, h, env)

    def assert_fails(self, r, check):
        self.assertEqual(r["code"], 1, r["out"] + r["err"])
        self.assertIn("H-20 gate: FAIL", r["out"])
        self.assertIs(r["checks"].get(check), False, r["out"])

    def test_a_healthy_armed_session_passes_reading_only(self):
        fake, h = healthy()
        r = self.gate(fake, h)
        self.assertEqual(r["code"], 0, r["out"] + r["err"])
        self.assertIn("H-20 gate: PASS", r["out"])
        self.assertEqual(len(r["checks"]), 10)
        self.assertTrue(all(r["checks"].values()), r["out"])
        self.assertTrue(set(r["calls"]) <= READ_OPS, r["calls"])

    def test_each_failure_fails_closed_on_its_own(self):
        p_name = lambda h: NAME + "-p-" + h[:10].replace("-", "") + "t" + h[11:13] + h[14:16]  # noqa: E731
        cases = {
            "missing state machine": ("state_machine_active", lambda f, h: setattr(f, "sm", None)),
            "inactive state machine": ("state_machine_active", lambda f, h: f.sm.update(status="DELETING")),
            "express state machine": ("state_machine_active", lambda f, h: f.sm.update(type="EXPRESS")),
            "no success": ("succeeded_within_26h", lambda f, h: setattr(f, "succeeded", [])),
            "expired success": ("succeeded_within_26h", lambda f, h: f.succeeded[0].update(stopDate=arm.now() - datetime.timedelta(hours=26, minutes=1))),
            "dry-run success": ("last_success_was_real", lambda f, h: f.inputs.update({EXEC: '{"dryRun": true}'})),
            "empty-input success": ("last_success_was_real", lambda f, h: f.inputs.update({EXEC: '{}'})),
            "running execution": ("none_running", lambda f, h: setattr(f, "running", [{"executionArn": EXEC + "2", "status": "RUNNING"}])),
            "disabled schedule": ("daily_enabled", lambda f, h: f.schedules[NAME + "-daily"].update(State="DISABLED")),
            "wrong target": ("daily_enabled", lambda f, h: f.schedules[NAME + "-daily"]["Target"].update(Arn=arm.SM + "-other")),
            "wrong role": ("daily_role_and_input", lambda f, h: f.schedules[NAME + "-daily"]["Target"].update(RoleArn=arm.ROLE + "-other")),
            "wrong input": ("daily_role_and_input", lambda f, h: f.schedules[NAME + "-daily"]["Target"].update(Input='{"dryRun": true}')),
            "missing daily": ("daily_enabled", lambda f, h: f.schedules.pop(NAME + "-daily")),
            "missing alarm": ("alarms_present", lambda f, h: f.alarms.pop(NAME + "-failed")),
            "alarm in ALARM": ("alarms_not_in_alarm", lambda f, h: f.alarms.update({NAME + "-not-run": "ALARM"})),
            "leftover P": ("no_stale_session_schedules", lambda f, h: f.schedules.update({NAME + "-p-20261119t1500": {"State": "ENABLED"}})),
            "leftover S": ("no_stale_session_schedules", lambda f, h: f.schedules.update({NAME + "-s-20261120t0930": {"State": "ENABLED"}})),
            "missing current P": ("own_session_armed", lambda f, h: f.schedules.pop(p_name(h))),
            "current P disabled": ("own_session_armed", lambda f, h: f.schedules[p_name(h)].update(State="DISABLED")),
            "current P keeps itself": ("own_session_armed", lambda f, h: f.schedules[p_name(h)].update(ActionAfterCompletion="NONE")),
            "current P dry run": ("own_session_armed", lambda f, h: f.schedules[p_name(h)]["Target"].update(Input='{"dryRun": true}')),
            "current P other time": ("own_session_armed", lambda f, h: f.schedules[p_name(h)].update(ScheduleExpression="at(2026-11-20T13:00:00)")),
            "access denied": ("alarms_present", lambda f, h: f.faults.update(DescribeAlarms=["AccessDeniedException"])),
            "malformed json": ("none_running", lambda f, h: f.faults.update(ListExecutions=[None, "MALFORMED"])),
        }
        for label, (check, change) in cases.items():
            with self.subTest(case=label):
                fake, h = healthy()
                change(fake, h)
                r = self.gate(fake, h)
                self.assert_fails(r, check)
                self.assertTrue(set(r["calls"]) <= READ_OPS, r["calls"])

    def test_the_real_cli_timestamp_format_and_a_future_stop_date(self):
        # AWS CLI v2 prints e.g. 2026-11-18T21:05:23.202000+00:00 (review L-4).
        fake, h = healthy()
        fake.succeeded[0]["stopDate"] = "2026-11-20T07:00:00.202000+00:00"
        self.assertEqual(self.gate(fake, h)["code"], 0)
        fake, h = healthy()
        fake.succeeded[0]["stopDate"] = "2026-11-20T07:00:00.202000+03:00"
        self.assert_fails(self.gate(fake, h), "succeeded_within_26h")
        fake, h = healthy()
        fake.succeeded[0]["stopDate"] = (arm.now() + datetime.timedelta(hours=1)).isoformat()
        self.assert_fails(self.gate(fake, h), "succeeded_within_26h")
        fake, h = healthy()
        fake.succeeded[0]["stopDate"] = 1763542800
        self.assert_fails(self.gate(fake, h), "succeeded_within_26h")

    def test_an_abort_leaves_every_check_false(self):
        fake, _ = healthy()
        r = self.gate(fake, "bad")
        self.assertEqual(len(r["checks"]), 10)
        self.assertFalse(any(r["checks"].values()))
        self.assertEqual(r["errors"], {})

    def test_missing_current_s_fails(self):
        fake, h = healthy()
        s = [n for n in fake.schedules if n.startswith(NAME + "-s-")]
        self.assertEqual(len(s), 1)
        fake.schedules.pop(s[0])
        r = self.gate(fake, h)
        self.assert_fails(r, "own_session_armed")
        self.assertTrue(r["errors"]["own_session_armed"].startswith("s-"), r["out"])

    def test_access_denied_everywhere_fails_with_codes_only(self):
        fake, h = healthy()
        for op in ("DescribeStateMachine", "ListExecutions", "GetSchedule", "ListSchedules", "DescribeAlarms"):
            fake.faults[op] = ["AccessDeniedException"] * 5
        r = self.gate(fake, h)
        self.assertEqual(r["code"], 1)
        self.assertFalse(any(r["checks"].values()), r["out"])
        self.assertEqual(r["errors"]["state_machine_active"], "AWS_AccessDeniedException")
        # Never the AWS message: the stub's message holds a marker that must not reach the log.
        self.assertNotIn("secret-looking", r["out"] + r["err"])

    def test_wrong_account_or_denied_caller_aborts(self):
        fake, h = healthy()
        fake.account = "111111111111"
        r = self.gate(fake, h)
        self.assertEqual(r["code"], 1)
        self.assertIn("abort WRONG_ACCOUNT", r["out"])
        fake, h = healthy()
        fake.faults["GetCallerIdentity"] = ["ExpiredToken"]
        r = self.gate(fake, h)
        self.assertEqual(r["code"], 1)
        self.assertIn("abort CALLER_AWS_ExpiredToken", r["out"])

    def test_a_missing_or_malformed_hard_stop_aborts_before_any_aws_call(self):
        fake, h = healthy()
        for bad in (None, "", "2026-11-20T12:00Z", "2026-11-20 12:00:00Z", "2026-11-20T12:00:30Z", "2026-13-20T12:00:00Z",
                    "2026-11-20T12:00:00Z; true", "$(id)"):
            with self.subTest(hard_stop=bad):
                r = self.gate(fake, bad)
                self.assertEqual(r["code"], 1)
                self.assertIn("abort HARD_STOP_SHAPE", r["out"])
                self.assertEqual(r["calls"], [])

    def test_a_hard_stop_too_near_too_far_or_past_21_utc_aborts(self):
        fake, _ = healthy()
        for bad, code in (("2026-11-20T10:20:00Z", "HARD_STOP_NOT_IN_1_TO_6_HOURS"),
                          ("2026-11-20T10:59:00Z", "HARD_STOP_NOT_IN_1_TO_6_HOURS"),
                          ("2026-11-20T09:00:00Z", "HARD_STOP_NOT_IN_1_TO_6_HOURS"),
                          ("2026-11-20T16:01:00Z", "HARD_STOP_NOT_IN_1_TO_6_HOURS"),
                          ("2026-11-20T15:00:00Z", None)):
            with self.subTest(hard_stop=bad):
                r = self.gate(fake, bad)
                self.assertEqual(r["code"], 1)
                if code:
                    self.assertIn("abort " + code, r["out"])
        # S at 21:00 or later crosses the backstop and R.
        late = arm.FixedDT(2026, 11, 20, 17, 0, 0, tzinfo=datetime.timezone.utc)
        r = self.sh.run(fake, "2026-11-20T20:30:00Z", {"STUB_NOW": str(int(late.timestamp()))})
        self.assertIn("abort SESSION_CROSSES_21_UTC", r["out"])

    def test_the_script_names_no_write_operation(self):
        with open(GATE, encoding="utf-8") as f:
            text = f.read()
        calls = re.findall(r"call \"\$[^\"]+\" (\S+) (\S+)", text)
        self.assertTrue(calls)
        for service, command in calls:
            self.assertRegex(command, r"^(get|list|describe)-", (service, command))
        self.assertNotRegex(text, r"\b(start-execution|stop-execution|create-schedule|delete-schedule|update-schedule|publish|subscribe|set-alarm-state|put-)")
        self.assertNotIn("get-secret-value", text)


class Parity(unittest.TestCase):
    """The shell gate and the connector gate agree on every shared condition."""

    @classmethod
    def setUpClass(cls):
        cls.sh = Shell()

    @classmethod
    def tearDownClass(cls):
        cls.sh.close()

    def compare(self, fake, h):
        connector = arm.run(copy.deepcopy(fake), HARD_STOP_UTC=h)
        shell = self.sh.run(fake, h)
        for check, names in SHARED.items():
            self.assertEqual(connector["checks"].get(check) is True, all(shell["checks"].get(n) is True for n in names),
                             (check, connector["checks"], shell["out"]))
        self.assertEqual(connector["result"] == "PASS", shell["code"] == 0, (connector, shell["out"]))

    def test_parity(self):
        p = lambda f: [n for n in f.schedules if n.startswith(NAME + "-p-")][0]  # noqa: E731
        changes = [
            lambda f: None,
            lambda f: setattr(f, "sm", None),
            lambda f: f.sm.update(status="DELETING"),
            lambda f: setattr(f, "succeeded", []),
            lambda f: f.succeeded[0].update(stopDate=arm.now() - datetime.timedelta(hours=27)),
            lambda f: f.inputs.update({EXEC: '{"dryRun": true}'}),
            lambda f: setattr(f, "running", [{"executionArn": EXEC + "2", "status": "RUNNING"}]),
            lambda f: f.schedules[NAME + "-daily"].update(State="DISABLED"),
            lambda f: f.schedules[NAME + "-daily"]["Target"].update(RoleArn="x"),
            lambda f: f.schedules[NAME + "-daily"]["Target"].update(Input="{}"),
            lambda f: f.alarms.pop(NAME + "-not-run"),
            lambda f: f.alarms.update({NAME + "-failed": "ALARM"}),
            lambda f: f.schedules.update({NAME + "-s-20261119t2030": {"State": "ENABLED"}}),
            lambda f: f.faults.update(DescribeAlarms=["AccessDenied"]),
            lambda f: f.faults.update(DescribeStateMachine=["AccessDenied"]),
        ]
        for i, change in enumerate(changes):
            with self.subTest(case=i):
                fake, h = healthy()
                change(fake)
                self.compare(fake, h)
        # Where they differ by design: the connector gate allows a session with no P or S; the
        # workflow refuses it (condition 10).
        fake, h = healthy()
        fake.schedules.pop(p(fake))
        self.assertEqual(arm.run(copy.deepcopy(fake), HARD_STOP_UTC=h)["result"], "PASS")
        self.assertEqual(self.sh.run(fake, h)["code"], 1)


def steps_of_job(text, job):
    """The steps of one job as [{name, id, if, body}], by indentation (no YAML library on the runner)."""
    m = re.search(rf"^  {job}:\n(.*?)(?=^  [a-z][a-z0-9_-]*:\n|\Z)", text, re.S | re.M)
    assert m, job
    body = m.group(1)
    steps_text = body[body.index("    steps:\n") + len("    steps:\n"):]
    chunks = re.split(r"^      - ", steps_text, flags=re.M)[1:]
    out = []
    for c in chunks:
        name = re.search(r"^(?:name: |uses: )(.+)$", c, re.M)
        sid = re.search(r"^        id: (\S+)$", c, re.M)
        cond = re.search(r"^        if: (?:>-\n((?:          .*\n)+)|(.+)$)", c, re.M)
        cond_text = ""
        if cond:
            cond_text = " ".join(x.strip() for x in (cond.group(1) or cond.group(2)).splitlines())
        out.append({"name": name.group(1).strip() if name else "", "id": sid.group(1) if sid else "", "if": cond_text, "body": c})
    return out


class Workflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(WORKFLOW, encoding="utf-8") as f:
            cls.text = f.read()
        cls.steps = steps_of_job(cls.text, "session")
        cls.names = [s["name"] for s in cls.steps]

    def step(self, name):
        return self.steps[self.names.index(name)]

    def test_the_gate_runs_for_up_only_and_before_every_up_change(self):
        gate = self.step("H-20 gate")
        self.assertEqual(gate["id"], "h20")
        self.assertEqual(gate["if"], "env.SESSION == 'up'")
        self.assertIn("scripts/aws/session-cleanup-gate.sh", gate["body"])
        self.assertIn("HARD_STOP_UTC: ${{ inputs.hard_stop_utc }}", gate["body"])
        i = self.names.index("H-20 gate")
        self.assertEqual(self.names[i - 1], "Does the nonprod stack exist")
        for later in ("terraform init", "Plan the switches", "Start the database", "Apply the switches"):
            self.assertLess(i, self.names.index(later), later)

    def test_every_up_change_step_names_the_gate(self):
        for name in ("terraform init", "Plan the switches", "Apply the switches"):
            with self.subTest(step=name):
                self.assertIn("(env.SESSION != 'up' || steps.h20.outcome == 'success')", self.step(name)["if"])
                self.assertNotIn("always()", self.step(name)["if"])
        start = self.step("Start the database")["if"]
        self.assertIn("steps.h20.outcome == 'success'", start)
        self.assertNotIn("always()", start)

    def test_the_gate_runs_as_the_session_deployer_with_the_input_in_env(self):
        run = self.step("H-20 gate")["body"].split("run: |", 1)[1]
        self.assertIn('AWS_SESSION_TOKEN="$DEPLOYER_AWS_SESSION_TOKEN"', run)
        self.assertNotIn("${{", run)

    def test_a_failed_gate_never_stops_the_database(self):
        # Review M-1: a refused `up` must not stop the database of a session that is already live.
        self.assertIn("steps.h20.outcome != 'failure'", self.step("Stop the database")["if"])

    def test_no_continue_on_error_anywhere(self):
        self.assertNotRegex(self.text, r"(?m)^\s*continue-on-error\s*:")

    def test_down_never_depends_on_the_gate(self):
        self.assertNotIn("h20", self.text.split("\n  session:\n", 1)[0])  # the database job
        stop = self.step("Stop the database")["if"]
        self.assertIn("env.SESSION == 'down' ||", stop)  # down stops whatever the gate did
        for name in ("terraform init", "Plan the switches", "Apply the switches"):
            # For down, env.SESSION != 'up' holds, so these never wait on a skipped gate.
            self.assertIn("env.SESSION != 'up' ||", self.step(name)["if"])

    def test_the_input_exists_and_is_not_required_for_down(self):
        m = re.search(r"(?ms)^      hard_stop_utc:\n(.*?)(?=^      [a-z_]+:\n|^  [a-z])", self.text)
        self.assertTrue(m)
        self.assertIn("required: false", m.group(1))
        self.assertIn("type: string", m.group(1))

    def test_operator_ranges_come_from_an_environment_variable_never_the_repository(self):
        # 21 Nov 2026 (OPERATOR-ACCESS.md): no Cloudflare Access; the operator host opens only from
        # the aws-nonprod-session variable OPERATOR_CIDRS, masked, and stays closed when it is unset.
        body = self.step("Plan the switches")["body"]
        self.assertIn("OPERATOR_CIDRS: ${{ vars.OPERATOR_CIDRS }}", body)
        run = body.split("run: |", 1)[1]
        self.assertNotIn("${{", run)
        self.assertIn("::add-mask::", run)
        self.assertIn('"${operator[@]}"', run)
        self.assertNotRegex(self.text.lower(), r"cloudflare|cf_access|operator_access")
        with open(os.path.join(os.path.dirname(WORKFLOW), "..", "..", "infra", "aws", "stack", "envs", "nonprod.tfvars"), encoding="utf-8") as f:
            self.assertRegex(f.read(), r"(?m)^operator_cidrs\s*=\s*\[\]")


class LiveSandboxErrors(unittest.TestCase):
    """18 Nov 2026: the live connector sandbox has no `ClientError` name, so `isinstance(e, ClientError)`
    raised NameError on every AWS error. Shared helpers v2 read the botocore `.response` instead."""

    def test_no_connector_script_names_client_error(self):
        for name in sorted(os.listdir(HERE)):
            if name.endswith(".py") and not name.startswith(("test_", "sandbox_")):
                with open(os.path.join(HERE, name), encoding="utf-8") as f:
                    with self.subTest(script=name):
                        self.assertEqual(arm.h.check_source(f.read()), [])
        self.assertIn("forbidden-name ClientError", arm.h.check_source("try:\n    x = 1\nexcept ClientError:\n    x = 2\nresult = x\nresult\n"))

    def test_an_aws_error_still_gives_its_code_without_the_name(self):
        fake = arm.Fake()
        fake.faults["DescribeAlarms"] = ["AccessDeniedException"]
        r = arm.run(fake)
        self.assertEqual(r["checks"]["alarms_error"], "AWS_AccessDeniedException")


if __name__ == "__main__":
    unittest.main()
