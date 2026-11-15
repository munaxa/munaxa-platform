"""Fake-AWS tests for the operator-credential connector scripts C-8G and C-24.

C-8G replaced C-8, C-8R, C-8v and C-16 in the L-A0 redesign (owner decision D-LA0, 15 Nov 2026,
report 2026-11-15-identity-stage-e-owner-decisions file 03): Secrets Manager generates the password
through CloudFormation, so no connector request or response carries it.

Run (offline; nothing here opens a network connection or reads a credential):

    python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'

Every script is first checked against the sandbox rules (sandbox_harness.check_source), then executed
the way the connector sandbox runs it, against FakeAws: an in-memory Secrets Manager, STS and
CloudTrail with injectable denials, timeouts, throttling, malformed responses and partial failures.
FakeAws refuses GetSecretValue and BatchGetSecretValue outright, so a test fails if a script ever
reads a value. The synthetic email and password below are test data, not real values.
"""

import asyncio
import copy
import datetime
import json
import os
import re
import sys
import unittest
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sandbox_harness as h  # noqa: E402

ACCOUNT = "229251310592"
REGION = "eu-central-1"
EMAIL = "synthetic.operator@munaxa-synthetic.net"  # synthetic, not the Testing operator address
GOOD_PW = "Zq7!mK2#vR9xT4pL8wN3sB6yH1cF5gJ0dQ2eA7uM"  # synthetic, 40 characters, passes isTrivial
TRIVIAL_PW = "abcdefgh" * 5  # contains the sequence abcdef: refused by isTrivial
PERSISTENT = "munaxa-nonprod/identity-operator"
BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
SECRET_NAME = PERSISTENT
DATA_KEY_ID = None  # filled from c8g at import time

SCRIPTS = {
    "c8g": "c8g-operator-secret-stack.py",
    "c24": "c24-custody-cloudtrail-check.py",
}
TEMPLATE_FILE = os.path.join(HERE, "..", "..", "..", "infra", "aws", "cloudformation", "identity-operator-secret.template.json")
STACK = "munaxa-nonprod-identity-operator-secret"
ROOT_ARN = f"arn:aws:iam::{ACCOUNT}:root"
READER_ARN = f"arn:aws:iam::{ACCOUNT}:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"


def source(key):
    with open(os.path.join(HERE, SCRIPTS[key]), encoding="utf-8") as f:
        return f.read()


DATA_KEY_ID = re.search(r'^DATA_KEY_ID = "([^"]+)"', source("c8g"), re.MULTILINE).group(1)


class Fault:
    """An injected outcome for the n-th call of one operation."""

    def __init__(self, kind, code=None, after=False):
        self.kind, self.code, self.after = kind, code, after


class FakeAws:
    def __init__(self, account=ACCOUNT):
        self.account = account
        self.secrets = {}  # name -> record
        self.calls = []  # (service, operation, params deep copy)
        self.faults = {}  # operation -> list of Fault|None (consumed in order)
        self.passwords = [GOOD_PW]
        self.events = []  # CloudTrail events (dicts) for LookupEvents
        self.page_size = 50
        self.overrides = {}  # operation -> callable(params) returning a raw (possibly malformed) response
        self.suffix = 0
        self.stack = None
        self.rendered = {}
        self.final_status = "CREATE_COMPLETE"
        self.update_status = "UPDATE_COMPLETE"
        self.in_progress_polls = 0

    # --- helpers -------------------------------------------------------------------------------
    def fault(self, operation, *faults):
        self.faults.setdefault(operation, []).extend(faults)

    def err(self, code, operation, params):
        # The message deliberately carries the request, so a script that echoes it leaks.
        return h.ClientError(code, json.dumps(params, default=str), operation)

    def arn(self, name):
        self.suffix += 1
        return f"arn:aws:secretsmanager:{REGION}:{self.account}:secret:{name}-Ab{self.suffix:04d}"

    def find(self, secret_id):
        for rec in self.secrets.values():
            if secret_id in (rec["Name"], rec["ARN"]):
                return rec
        return None

    def ops(self, operation=None):
        return [c for c in self.calls if operation is None or c[1] == operation]

    # --- call_boto3 ----------------------------------------------------------------------------
    async def __call__(self, *, service_name, operation_name, region_name=None, params=None):
        params = params or {}
        if region_name != REGION:
            raise AssertionError(f"unexpected region {region_name}")
        if operation_name in h.FORBIDDEN_OPERATIONS:
            raise AssertionError(f"a connector script called {operation_name}")
        self.calls.append((service_name, operation_name, copy.deepcopy(params)))
        pending = self.faults.get(operation_name)
        f = pending.pop(0) if pending else None
        if f is not None and not f.after:
            self.raise_fault(f, operation_name, params)
        if operation_name in self.overrides:
            out = self.overrides[operation_name](params)
        else:
            out = getattr(self, "op_" + operation_name)(params)
        if f is not None and f.after:  # the change happened, but the caller sees a failure
            self.raise_fault(f, operation_name, params)
        return out

    def raise_fault(self, f, operation, params):
        if f.kind == "timeout":
            raise asyncio.TimeoutError()
        if f.kind == "client":
            raise self.err(f.code, operation, params)
        if f.kind == "runtime":
            raise RuntimeError("fake runtime failure " + json.dumps(params, default=str))
        raise AssertionError(f.kind)

    # --- STS -----------------------------------------------------------------------------------
    def op_GetCallerIdentity(self, params):
        return {"Account": self.account, "Arn": f"arn:aws:iam::{self.account}:root", "UserId": self.account}

    # --- Secrets Manager -----------------------------------------------------------------------
    def op_GetRandomPassword(self, params):
        assert params["PasswordLength"] == 40
        pw = self.passwords.pop(0) if len(self.passwords) > 1 else self.passwords[0]
        return {"RandomPassword": pw}

    def op_DescribeSecret(self, params):
        rec = self.find(params["SecretId"])
        if rec is None:
            raise self.err("ResourceNotFoundException", "DescribeSecret", params)
        out = {k: copy.deepcopy(v) for k, v in rec.items() if k in ("ARN", "Name", "Tags", "KmsKeyId", "Description")}
        out["RotationEnabled"] = rec.get("RotationEnabled", False)
        if rec.get("DeletedDate"):
            out["DeletedDate"] = rec["DeletedDate"]
        return out

    def op_CreateSecret(self, params):
        rec = self.secrets.get(params["Name"])
        token = params["ClientRequestToken"]
        if rec is not None:
            if token in rec["versions"] and rec["versions"][token]["value"] == params["SecretString"]:
                return {"ARN": rec["ARN"], "Name": rec["Name"], "VersionId": token}
            raise self.err("ResourceExistsException", "CreateSecret", params)
        self.secrets[params["Name"]] = {
            "ARN": self.arn(params["Name"]), "Name": params["Name"], "Tags": copy.deepcopy(params.get("Tags", [])),
            "KmsKeyId": "arn:aws:kms:%s:%s:key/%s" % (REGION, self.account, DATA_KEY_ID)
            if params.get("KmsKeyId") == "alias/munaxa-nonprod-data" else params.get("KmsKeyId"),
            "Description": params.get("Description"),
            "versions": {token: {"value": params["SecretString"], "stages": ["AWSCURRENT"]}},
        }
        rec = self.secrets[params["Name"]]
        return {"ARN": rec["ARN"], "Name": rec["Name"], "VersionId": token}

    def op_PutSecretValue(self, params):
        rec = self.find(params["SecretId"])
        if rec is None:
            raise self.err("ResourceNotFoundException", "PutSecretValue", params)
        token = params["ClientRequestToken"]
        if token in rec["versions"]:
            if rec["versions"][token]["value"] != params["SecretString"]:
                raise self.err("ResourceExistsException", "PutSecretValue", params)
            return {"ARN": rec["ARN"], "Name": rec["Name"], "VersionId": token}
        for v in rec["versions"].values():
            v["stages"] = ["AWSPREVIOUS"] if "AWSCURRENT" in v["stages"] else [s for s in v["stages"] if s != "AWSPREVIOUS"]
        rec["versions"][token] = {"value": params["SecretString"], "stages": ["AWSCURRENT"]}
        return {"ARN": rec["ARN"], "Name": rec["Name"], "VersionId": token}

    def op_ListSecretVersionIds(self, params):
        rec = self.find(params["SecretId"])
        if rec is None:
            raise self.err("ResourceNotFoundException", "ListSecretVersionIds", params)
        return {"Versions": [{"VersionId": k, "VersionStages": list(v["stages"])} for k, v in rec["versions"].items() if v["stages"]]}

    def op_DeleteSecret(self, params):
        rec = self.find(params["SecretId"])
        if rec is None:
            raise self.err("ResourceNotFoundException", "DeleteSecret", params)
        if params.get("ForceDeleteWithoutRecovery"):
            del self.secrets[rec["Name"]]
        else:
            rec["DeletedDate"] = "2026-11-20T12:00:00Z"
        return {"ARN": rec["ARN"], "Name": rec["Name"]}

    def op_ListSecrets(self, params):
        prefixes = [v for f in params.get("Filters", []) if f["Key"] == "name" for v in f["Values"]]
        out = []
        for rec in self.secrets.values():
            if rec.get("DeletedDate") and not params.get("IncludePlannedDeletion"):
                continue
            if all(rec["Name"].startswith(p) for p in prefixes):
                out.append({"Name": rec["Name"], "ARN": rec["ARN"]})
        return {"SecretList": out}

    # --- CloudFormation (renders the reviewed template the way AWS does, with a fake generator) -----
    def resolve(self, node, params):
        """Fn::Sub / Ref / Fn::If / Fn::Equals for the template's own shapes."""
        if isinstance(node, list):
            return [self.resolve(x, params) for x in node]
        if not isinstance(node, dict):
            return node
        if set(node) == {"Ref"}:
            return params[node["Ref"]] if node["Ref"] in params else self.ref(node["Ref"])
        if set(node) == {"Fn::Sub"}:
            text = node["Fn::Sub"]
            text = text.replace("${AWS::AccountId}", self.account)
            for k, v in params.items():
                text = text.replace("${" + k + "}", v)
            assert "${" not in text, text
            return text
        if set(node) == {"Fn::If"}:
            cond, yes, no = node["Fn::If"]
            return self.resolve(yes if self.conditions[cond] else no, params)
        return {k: self.resolve(v, params) for k, v in node.items()}

    def ref(self, logical):
        assert logical == "OperatorSecret"
        return self.secrets[SECRET_NAME]["ARN"]

    def render(self, template, params):
        for name, spec in template["Parameters"].items():
            value = params.get(name, spec.get("Default"))
            assert value is not None, name
            if "AllowedValues" in spec and value not in spec["AllowedValues"]:
                raise self.err("ValidationError", "CreateStack", {"parameter": name})
            if "AllowedPattern" in spec and not re.fullmatch(spec["AllowedPattern"], value):
                raise self.err("ValidationError", "CreateStack", {"parameter": name})
            params[name] = value
        self.conditions = {"WindowOpen": params["BootstrapReadWindow"] == "open"}
        res = template["Resources"]
        sec = res["OperatorSecret"]["Properties"]
        gen = sec["GenerateSecretString"]
        value = json.loads(self.resolve(gen["SecretStringTemplate"], params))
        rec = self.secrets.get(sec["Name"])
        previous = self.rendered.get("generate")
        rendered_generate = json.dumps(self.resolve(gen, params), sort_keys=True)
        if rec is None or rendered_generate != previous:
            pw = self.passwords.pop(0) if len(self.passwords) > 1 else self.passwords[0]
            assert len(pw) == gen["PasswordLength"] and not set(gen["ExcludeCharacters"]) & set(pw)
            value[gen["GenerateStringKey"]] = pw
            token = str(uuid.uuid4())
            if rec is None:
                self.secrets[sec["Name"]] = {
                    "ARN": self.arn(sec["Name"]), "Name": sec["Name"], "Tags": copy.deepcopy(sec["Tags"]),
                    "KmsKeyId": "arn:aws:kms:%s:%s:key/%s" % (REGION, self.account, DATA_KEY_ID), "Description": sec["Description"],
                    "versions": {}}
                rec = self.secrets[sec["Name"]]
            for v in rec["versions"].values():
                v["stages"] = ["AWSPREVIOUS"] if "AWSCURRENT" in v["stages"] else []
            rec["versions"][token] = {"value": json.dumps(value), "stages": ["AWSCURRENT"]}
        self.rendered["generate"] = rendered_generate
        policy = self.resolve(res["OperatorSecretPolicy"]["Properties"]["ResourcePolicy"], params)
        rec["policy"] = json.dumps(policy)

    def op_CreateStack(self, params):
        if self.stack is not None:
            token = params["ClientRequestToken"]
            if token == self.stack["token"]:
                return {"StackId": self.stack["id"]}
            raise self.err("AlreadyExistsException", "CreateStack", params)
        assert "Capabilities" not in params and "RoleARN" not in params
        template = json.loads(params["TemplateBody"])
        values = {p["ParameterKey"]: p["ParameterValue"] for p in params["Parameters"]}
        self.render(template, values)
        self.stack = {"id": f"arn:aws:cloudformation:{REGION}:{self.account}:stack/{STACK}/1", "status": self.final_status,
                      "template": params["TemplateBody"], "params": values, "tags": copy.deepcopy(params.get("Tags", [])),
                      "protection": params.get("EnableTerminationProtection") is True, "token": params["ClientRequestToken"]}
        return {"StackId": self.stack["id"]}

    def op_UpdateStack(self, params):
        if self.stack is None:
            raise self.err("ValidationError", "UpdateStack", params)
        assert params.get("UsePreviousTemplate") is True and "TemplateBody" not in params
        values = {}
        for p in params["Parameters"]:
            if p.get("UsePreviousValue"):
                assert "ParameterValue" not in p
                values[p["ParameterKey"]] = self.stack["params"][p["ParameterKey"]]
            else:
                values[p["ParameterKey"]] = p["ParameterValue"]
        if values == self.stack["params"]:
            raise self.err("ValidationError", "UpdateStack", {"message": "No updates are to be performed."})
        self.render(json.loads(self.stack["template"]), dict(values))
        self.stack["params"] = values
        self.stack["status"] = self.update_status
        return {"StackId": self.stack["id"]}

    def op_DescribeStacks(self, params):
        if self.stack is None:
            raise self.err("ValidationError", "DescribeStacks", params)
        status = self.stack["status"]
        if self.in_progress_polls:
            self.in_progress_polls -= 1
            status = "UPDATE_IN_PROGRESS" if status.startswith("UPDATE") else "CREATE_IN_PROGRESS"
        return {"Stacks": [{
            "StackId": self.stack["id"], "StackName": STACK, "StackStatus": status,
            "StackStatusReason": "reason quoting " + json.dumps(self.stack["params"]),
            "Parameters": [{"ParameterKey": k, "ParameterValue": "****" if k == "OperatorEmail" else v}
                           for k, v in self.stack["params"].items()],
            "Tags": copy.deepcopy(self.stack["tags"]), "EnableTerminationProtection": self.stack["protection"]}]}

    def op_GetTemplate(self, params):
        if self.stack is None:
            raise self.err("ValidationError", "GetTemplate", params)
        return {"TemplateBody": self.stack["template"]}

    def op_GetResourcePolicy(self, params):
        rec = self.find(params["SecretId"])
        if rec is None:
            raise self.err("ResourceNotFoundException", "GetResourcePolicy", params)
        out = {"ARN": rec["ARN"], "Name": rec["Name"]}
        if rec.get("policy"):
            out["ResourcePolicy"] = rec["policy"]
        return out

    # --- CloudTrail ----------------------------------------------------------------------------
    def op_LookupEvents(self, params):
        start = int(params.get("NextToken") or 0)
        page = self.events[start:start + self.page_size]
        out = {"Events": [{"CloudTrailEvent": e if isinstance(e, str) else json.dumps(e)} for e in page]}
        if start + self.page_size < len(self.events):
            out["NextToken"] = str(start + self.page_size)
        return out


def run(key, fake, **inputs):
    text = source(key)
    if inputs:
        text = h.set_inputs(text, **inputs)
    return h.run_script(text, fake)


def leaks(result, fake):
    """Every value that must never appear in a script's result."""
    text = json.dumps(result, default=str)
    found = [v for v in (EMAIL, GOOD_PW, TRIVIAL_PW, "munaxa-synthetic") if v in text]
    if '"SecretString"' in text or '"RandomPassword"' in text or "fake runtime failure" in text:
        found.append("message-or-field")
    return found


class SourceRules(unittest.TestCase):
    def test_every_script_passes_the_sandbox_rules(self):
        for key in SCRIPTS:
            with self.subTest(script=key):
                self.assertEqual(h.check_source(source(key)), [])

    def test_the_shared_helper_block_is_identical_everywhere(self):
        blocks = {h.shared_block(source(key)) for key in SCRIPTS}
        self.assertEqual(len(blocks), 1)

    def test_no_script_names_a_value_read(self):
        for key in SCRIPTS:
            tree_ops = re.findall(r'aws\("[a-z]+", "([A-Za-z]+)"', source(key))
            self.assertTrue(tree_ops, key)
            self.assertFalse(set(tree_ops) & h.FORBIDDEN_OPERATIONS, key)

    def test_the_rule_checker_refuses_what_the_sandbox_refused(self):
        bad = {
            "import os\nresult = 1\nresult": "import line 1",
            "result = type(1).__name__\nresult": "dunder-attribute __name__",
            "result = getattr(1, 'real')\nresult": "forbidden-name getattr",
            "result = 1": "last-statement-not-result",
            "async def f():\n    return await call_boto3(service_name='secretsmanager', operation_name='GetSecretValue', region_name='x', params={})\nresult = 1\nresult": "forbidden-operation GetSecretValue",
        }
        for text, problem in bad.items():
            with self.subTest(problem=problem):
                self.assertIn(problem, h.check_source(text))

    def test_the_committed_inputs_are_placeholders(self):
        self.assertIn('OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT', source("c8g"))
        self.assertIn('MODE = "status"  # INPUT', source("c8g"))
        self.assertIn("NO_ACCOUNT_CONFIRMED = False  # INPUT", source("c8g"))
        self.assertIn("EXPECTED_GENERATION = 0  # INPUT", source("c8g"))
        self.assertIn('T_CREATE = "<', source("c24"))
        for key in SCRIPTS:
            self.assertNotRegex(source(key), r"[A-Za-z0-9._%+-]+@(?!munaxa-synthetic)[A-Za-z0-9-]+\.(com|net|org|io)\b")


def run8g(fake, **inputs):
    return run("c8g", fake, **inputs)


def created(**kw):
    fake = FakeAws(**kw)
    r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
    assert r["result"] == "CREATED", r
    fake.calls.clear()
    return fake


def password_in_calls(fake):
    """L-A0 regression: no request the script sent may hold the generated password (or any value)."""
    text = json.dumps([c[2] for c in fake.calls], default=str)
    return GOOD_PW in text or '"SecretString":' in text or '"RandomPassword"' in text


class C8GTemplate(unittest.TestCase):
    def setUp(self):
        with open(TEMPLATE_FILE, encoding="utf-8") as f:
            self.t = json.load(f)

    def test_the_script_carries_exactly_the_reviewed_template(self):
        text = re.search(r"TEMPLATE_TEXT = r'''(.*?)'''", source("c8g"), re.S).group(1)
        self.assertEqual(json.loads(text), self.t)

    def test_the_password_is_generated_by_secrets_manager_never_supplied(self):
        sec = self.t["Resources"]["OperatorSecret"]
        self.assertNotIn("SecretString", sec["Properties"])
        g = sec["Properties"]["GenerateSecretString"]
        self.assertEqual((g["GenerateStringKey"], g["PasswordLength"], g["RequireEachIncludedType"], g["IncludeSpace"]),
                         ("IDENTITY_OWNER_PASSWORD", 40, True, False))
        self.assertEqual(set(g["ExcludeCharacters"]), set(chr(34) + chr(39) + chr(96) + chr(92)))
        self.assertNotIn("IDENTITY_OWNER_PASSWORD", g["SecretStringTemplate"]["Fn::Sub"])
        self.assertNotIn("Password", json.dumps(self.t["Parameters"]))

    def test_the_schema_matches_the_identity_bootstrap_task(self):
        sub = self.t["Resources"]["OperatorSecret"]["Properties"]["GenerateSecretString"]["SecretStringTemplate"]["Fn::Sub"]
        keys = set(json.loads(sub.replace("${OperatorEmail}", "a@b.cd").replace("${Generation}", "1")))
        self.assertEqual(keys, {"IDENTITY_OWNER_EMAIL", "IDENTITY_ORGANISATION", "IDENTITY_SECRET_GENERATION"})
        self.assertIn('"IDENTITY_ORGANISATION":"munaxa-group"', sub)

    def test_retained_named_encrypted_nonprod_only(self):
        sec = self.t["Resources"]["OperatorSecret"]
        self.assertEqual((sec["DeletionPolicy"], sec["UpdateReplacePolicy"]), ("Retain", "Retain"))
        p = sec["Properties"]
        self.assertEqual((p["Name"], p["KmsKeyId"]), (PERSISTENT, "alias/munaxa-nonprod-data"))
        self.assertNotIn("ReplicaRegions", p)
        self.assertNotIn("prod/", json.dumps(self.t).replace("nonprod/", ""))
        self.assertEqual(set(self.t["Resources"]), {"OperatorSecret", "OperatorSecretPolicy"})

    def test_the_email_is_a_noecho_parameter_that_cannot_break_the_json(self):
        e = self.t["Parameters"]["OperatorEmail"]
        self.assertIs(e["NoEcho"], True)
        self.assertNotIn("Default", e)
        for bad in ('a"b@munaxa-synthetic.net', "a" + chr(92) + "b@munaxa-synthetic.net", "a b@munaxa-synthetic.net", "x@y"):
            self.assertIsNone(re.fullmatch(e["AllowedPattern"], bad), bad)
        self.assertIsNotNone(re.fullmatch(e["AllowedPattern"], EMAIL))
        self.assertEqual(self.t["Parameters"]["BootstrapReadWindow"]["Default"], "closed")

    def test_the_policy_denies_reads_except_root_and_the_open_window(self):
        pol = self.t["Resources"]["OperatorSecretPolicy"]["Properties"]
        self.assertIs(pol["BlockPublicPolicy"], True)
        read, change = pol["ResourcePolicy"]["Statement"]
        self.assertEqual((read["Effect"], read["Principal"], read["Action"]), ("Deny", "*", ["secretsmanager:GetSecretValue"]))
        yes, no = read["Condition"]["StringNotEquals"]["aws:PrincipalArn"]["Fn::If"][1:]
        self.assertEqual([x["Fn::Sub"] for x in no], ["arn:aws:iam::${AWS::AccountId}:root"])
        self.assertEqual([x["Fn::Sub"] for x in yes], ["arn:aws:iam::${AWS::AccountId}:root",
                         "arn:aws:iam::${AWS::AccountId}:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"])
        self.assertEqual((change["Effect"], change["Principal"]), ("Deny", "*"))
        for action in ("secretsmanager:PutSecretValue", "secretsmanager:DeleteSecret", "secretsmanager:PutResourcePolicy",
                       "secretsmanager:DeleteResourcePolicy", "secretsmanager:UpdateSecretVersionStage", "secretsmanager:RotateSecret"):
            self.assertIn(action, change["Action"])
        self.assertNotIn("Allow", json.dumps(pol["ResourcePolicy"]))

    def test_the_reader_role_is_the_one_terraform_creates(self):
        with open(os.path.join(HERE, "..", "..", "..", "infra", "aws", "stack", "ops.tf"), encoding="utf-8") as f:
            ops = f.read()
        block = ops[ops.index('resource "aws_iam_role" "identity_bootstrap_execution"'):]
        block = block[:block.index("\n}\n")]
        self.assertIn('path                 = "/munaxa-shared/"', block)
        self.assertIn('"${local.prefix}-identity-bootstrap-execution"', block)
        self.assertTrue(READER_ARN.endswith(":role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"))


class C8G(unittest.TestCase):
    def test_create_generates_inside_aws_and_returns_no_value(self):
        fake = FakeAws()
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual((r["result"], r["stack_status"], r["mode"]), ("CREATED", "CREATE_COMPLETE", "create"))
        self.assertEqual(leaks(r, fake), [])
        self.assertFalse(password_in_calls(fake))
        create = fake.ops("CreateStack")[0][2]
        self.assertEqual({p["ParameterKey"]: p["ParameterValue"] for p in create["Parameters"]},
                         {"OperatorEmail": EMAIL, "Generation": "1", "BootstrapReadWindow": "closed"})
        self.assertIs(create["EnableTerminationProtection"], True)
        self.assertEqual(create["OnFailure"], "ROLLBACK")
        self.assertNotIn(EMAIL, create["TemplateBody"])
        value = json.loads(next(iter(fake.secrets[PERSISTENT]["versions"].values()))["value"])
        self.assertEqual(value, {"IDENTITY_OWNER_EMAIL": EMAIL, "IDENTITY_OWNER_PASSWORD": GOOD_PW,
                                 "IDENTITY_ORGANISATION": "munaxa-group", "IDENTITY_SECRET_GENERATION": "1"})
        fake.calls.clear()
        s = run8g(fake)
        self.assertEqual((s["result"], s["problems"], s["window_policy"], s["window_parameter"], s["generation"], s["versions"]),
                         ("PASS", [], "closed", "closed", "1", 1))
        self.assertEqual(leaks(s, fake), [])
        self.assertEqual(fake.ops("CreateStack") + fake.ops("UpdateStack"), [])

    def test_only_create_ever_sends_the_email(self):
        fake = created()
        for mode in ("open-window", "close-window", "status"):
            run8g(fake, MODE=mode, OPERATOR_EMAIL=EMAIL)
        run8g(fake, MODE="regenerate", EXPECTED_GENERATION=1, NO_ACCOUNT_CONFIRMED=True, OPERATOR_EMAIL=EMAIL)
        self.assertNotIn(EMAIL, json.dumps([c[2] for c in fake.calls]))
        self.assertFalse(password_in_calls(fake))

    def test_an_unedited_or_bad_email_aborts_before_any_call(self):
        for email, code in (("<IDENTITY_OPERATOR_EMAIL>", "EMAIL_NOT_SET"), ('a"b@munaxa-synthetic.net', "EMAIL_MALFORMED"),
                            ("ops@example.com", "EMAIL_RESERVED_DOMAIN"), ("ops@munaxa.test", "EMAIL_RESERVED_DOMAIN")):
            with self.subTest(email=email):
                fake = FakeAws()
                r = run8g(fake, MODE="create", OPERATOR_EMAIL=email)
                self.assertEqual((r["result"], r["code"]), ("ABORT", code))
                self.assertEqual([c for c in fake.calls if c[0] != "sts"], [])

    def test_an_unknown_mode_or_the_wrong_account_aborts(self):
        fake = FakeAws()
        self.assertEqual(run8g(fake, MODE="delete")["code"], "MODE_UNKNOWN")
        self.assertEqual(fake.calls, [])
        fake = FakeAws(account="111111111111")
        self.assertEqual(run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)["code"], "WRONG_ACCOUNT")
        self.assertEqual([c[1] for c in fake.calls], ["GetCallerIdentity"])

    def test_create_refuses_an_existing_stack_or_secret(self):
        fake = created()
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "STACK_EXISTS")
        for name in (PERSISTENT, BOOTSTRAP):
            with self.subTest(name=name):
                fake = FakeAws()
                fake.secrets[name] = {"ARN": fake.arn(name), "Name": name, "versions": {}}
                r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
                self.assertEqual((r["code"], r["name"]), ("SECRET_EXISTS", name))
                self.assertEqual(fake.ops("CreateStack"), [])

    def test_a_create_timeout_retries_with_the_same_token(self):
        fake = FakeAws()
        fake.fault("CreateStack", Fault("timeout", after=True))
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["result"], "CREATED")
        tokens = {c[2]["ClientRequestToken"] for c in fake.ops("CreateStack")}
        self.assertEqual((len(fake.ops("CreateStack")), len(tokens)), (2, 1))
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 1)

    def test_throttling_twice_aborts_with_a_code(self):
        fake = FakeAws()
        fake.fault("CreateStack", Fault("client", "Throttling"), Fault("client", "Throttling"))
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CREATE_AWS_Throttling")
        self.assertEqual(leaks(r, fake), [])

    def test_a_rolled_back_create_fails_without_the_reason(self):
        fake = FakeAws()
        fake.final_status = "ROLLBACK_COMPLETE"
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual((r["result"], r["code"]), ("FAIL", "STACK_ROLLBACK_COMPLETE"))
        self.assertEqual(leaks(r, fake), [])
        self.assertNotIn("reason", json.dumps(r))

    def test_a_slow_stack_is_reported_still_in_progress_within_the_time_limit(self):
        fake = FakeAws()
        fake.in_progress_polls = 100
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "STILL_IN_PROGRESS")
        fake = FakeAws()
        fake.in_progress_polls = 3
        self.assertEqual(run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)["result"], "CREATED")

    def test_the_window_opens_and_closes_through_the_policy(self):
        fake = created()
        r = run8g(fake, MODE="open-window")
        self.assertEqual(r["result"], "WINDOW_OPEN")
        upd = fake.ops("UpdateStack")[0][2]
        self.assertIs(upd["UsePreviousTemplate"], True)
        self.assertEqual(upd["Parameters"][0], {"ParameterKey": "OperatorEmail", "UsePreviousValue": True})
        s = run8g(fake)
        self.assertEqual((s["result"], s["window_policy"], s["window_parameter"]), ("PASS", "open", "open"))
        self.assertIn(READER_ARN, fake.secrets[PERSISTENT]["policy"])
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 1)  # a window change never regenerates
        self.assertEqual(run8g(fake, MODE="close-window")["result"], "WINDOW_CLOSED")
        self.assertNotIn(READER_ARN, fake.secrets[PERSISTENT]["policy"])
        fake.calls.clear()
        self.assertEqual(run8g(fake, MODE="close-window")["result"], "ALREADY_CLOSED")
        self.assertEqual(fake.ops("UpdateStack"), [])
        self.assertEqual(run8g(fake)["window_policy"], "closed")

    def test_a_window_change_refuses_a_drifted_template_or_an_unstable_stack(self):
        fake = created()
        t = json.loads(fake.stack["template"])
        t["Resources"]["OperatorSecretPolicy"]["Properties"]["ResourcePolicy"]["Statement"].pop()
        fake.stack["template"] = json.dumps(t)
        self.assertEqual(run8g(fake, MODE="open-window")["code"], "TEMPLATE_DRIFT")
        fake = created()
        fake.stack["status"] = "UPDATE_ROLLBACK_FAILED"
        self.assertEqual(run8g(fake, MODE="open-window")["code"], "STACK_UPDATE_ROLLBACK_FAILED")
        fake = FakeAws()
        self.assertEqual(run8g(fake, MODE="close-window")["code"], "STACK_ABSENT")
        self.assertEqual(fake.ops("UpdateStack"), [])

    def test_a_failed_window_update_is_reported(self):
        fake = created()
        fake.update_status = "UPDATE_ROLLBACK_COMPLETE"
        r = run8g(fake, MODE="open-window")
        self.assertEqual((r["result"], r["code"]), ("FAIL", "STACK_UPDATE_ROLLBACK_COMPLETE"))
        fake = created()
        fake.fault("UpdateStack", Fault("client", "AccessDenied"))
        self.assertEqual(run8g(fake, MODE="open-window")["code"], "UPDATE_AWS_AccessDenied")

    def test_regenerate_needs_confirmation_the_generation_and_a_closed_window(self):
        fake = created()
        self.assertEqual(run8g(fake, MODE="regenerate", EXPECTED_GENERATION=1)["code"], "NO_ACCOUNT_NOT_CONFIRMED")
        self.assertEqual(run8g(fake, MODE="regenerate", NO_ACCOUNT_CONFIRMED=True)["code"], "EXPECTED_GENERATION_NOT_SET")
        self.assertEqual(run8g(fake, MODE="regenerate", NO_ACCOUNT_CONFIRMED=True, EXPECTED_GENERATION=True)["code"], "EXPECTED_GENERATION_NOT_SET")
        self.assertEqual(run8g(fake, MODE="regenerate", NO_ACCOUNT_CONFIRMED=True, EXPECTED_GENERATION=2)["code"], "GENERATION_MISMATCH")
        run8g(fake, MODE="open-window")
        self.assertEqual(run8g(fake, MODE="regenerate", NO_ACCOUNT_CONFIRMED=True, EXPECTED_GENERATION=1)["code"], "WINDOW_OPEN")
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 1)

    def test_regenerate_makes_a_new_version_inside_aws(self):
        fake = created()
        fake.passwords = ["Xy9!" + "aB3#" * 9]
        r = run8g(fake, MODE="regenerate", NO_ACCOUNT_CONFIRMED=True, EXPECTED_GENERATION=1)
        self.assertEqual((r["result"], r["generation"]), ("REGENERATED", "2"))
        self.assertFalse(password_in_calls(fake))
        s = run8g(fake)
        self.assertEqual((s["result"], s["generation"], s["versions"], s["window_policy"]), ("PASS", "2", 2, "closed"))
        current = [v for v in fake.secrets[PERSISTENT]["versions"].values() if "AWSCURRENT" in v["stages"]]
        self.assertEqual(json.loads(current[0]["value"])["IDENTITY_SECRET_GENERATION"], "2")

    def test_status_reports_every_drift(self):
        def policy(fake, f):
            doc = json.loads(fake.secrets[PERSISTENT]["policy"])
            f(doc)
            fake.secrets[PERSISTENT]["policy"] = json.dumps(doc)
        read = lambda d: d["Statement"][0]
        cases = {
            "policy-readers": lambda fk: policy(fk, lambda d: read(d)["Condition"]["StringNotEquals"].update(
                {"aws:PrincipalArn": [ROOT_ARN, f"arn:aws:iam::{ACCOUNT}:role/munaxa-shared/munaxa-shared-deployer-nonprod"]})),
            "policy-statements": lambda fk: policy(fk, lambda d: d["Statement"].pop()),
            "policy-not-deny-all": lambda fk: policy(fk, lambda d: read(d).update(Effect="Allow")),
            "policy-read-actions": lambda fk: policy(fk, lambda d: read(d).update(Action=["secretsmanager:DescribeSecret"])),
            "policy-change-actions": lambda fk: policy(fk, lambda d: d["Statement"][1].update(Action=["secretsmanager:TagResource"])),
            "policy-changers": lambda fk: policy(fk, lambda d: d["Statement"][1]["Condition"]["StringNotEquals"].update(
                {"aws:PrincipalArn": READER_ARN})),
            "policy-malformed": lambda fk: fk.secrets[PERSISTENT].update(policy="{not json"),
            "window-mismatch": lambda fk: fk.stack["params"].update(BootstrapReadWindow="open"),
            "stack-tags": lambda fk: fk.stack.update(tags=[]),
            "termination-protection": lambda fk: fk.stack.update(protection=False),
            "template-drift": lambda fk: fk.stack.update(template=json.dumps({"Resources": {}})),
            "secret-tags": lambda fk: fk.secrets[PERSISTENT].update(Tags=[]),
            "kms-key": lambda fk: fk.secrets[PERSISTENT].update(KmsKeyId="arn:aws:kms:eu-central-1:229251310592:key/other"),
            "rotation-enabled": lambda fk: fk.secrets[PERSISTENT].update(RotationEnabled=True),
            "scheduled-for-deletion": lambda fk: fk.secrets[PERSISTENT].update(DeletedDate="2026-11-20T00:00:00Z"),
            "current-version": lambda fk: [v.update(stages=[]) for v in fk.secrets[PERSISTENT]["versions"].values()],
            "legacy-bootstrap-secret-present": lambda fk: fk.secrets.update({BOOTSTRAP: {"ARN": fk.arn(BOOTSTRAP), "Name": BOOTSTRAP, "versions": {}}}),
            "stack-status": lambda fk: fk.stack.update(status="UPDATE_ROLLBACK_COMPLETE"),
        }
        for problem, mutate in cases.items():
            with self.subTest(problem=problem):
                fake = created()
                mutate(fake)
                r = run8g(fake)
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(problem, r["problems"])
                self.assertEqual(leaks(r, fake), [])

    def test_status_of_nothing_and_of_failures(self):
        fake = FakeAws()
        self.assertEqual(run8g(fake)["result"], "ABSENT")
        fake = FakeAws()
        fake.fault("DescribeStacks", Fault("client", "AccessDenied"))
        self.assertEqual(run8g(fake)["code"], "DESCRIBE_STACK_AWS_AccessDenied")
        fake = created()
        fake.fault("GetResourcePolicy", Fault("client", "AccessDeniedException"))
        r = run8g(fake)
        self.assertEqual((r["result"], r["code"]), ("FAIL", "SECRET_AWS_AccessDeniedException"))
        fake = created()
        fake.overrides["DescribeStacks"] = lambda p: {"Stacks": "x"}
        self.assertEqual(run8g(fake)["code"], "DESCRIBE_STACK_MALFORMED")

    def test_an_unexpected_exception_returns_a_code_only(self):
        fake = FakeAws()
        fake.fault("DescribeStacks", Fault("runtime"))
        r = run8g(fake, MODE="create", OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "DESCRIBE_STACK_PY_OTHER")
        self.assertEqual(leaks(r, fake), [])


def event(name, who="root", secret=None, extra=None, role=None, cfn=False):
    ui = {"type": "Root"} if who == "root" else {
        "type": "AssumedRole", "sessionContext": {"sessionIssuer": {"userName": role or who}}}
    if cfn:
        ui["invokedBy"] = "cloudformation.amazonaws.com"
    req = {} if secret is None else {"secretId": f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{secret}-AbCdEf"}
    ev = {"eventName": name, "userIdentity": ui, "requestParameters": req or None}
    ev.update(extra or {})
    return ev


class FakeTime:
    def __init__(self, step):
        self.t, self.step = 0.0, step

    def monotonic(self):
        self.t += self.step
        return self.t


class C24(unittest.TestCase):
    T = "2026-11-14T10:00:00Z"

    def normal(self):
        # C-8G create (CloudFormation generates and stores; Secrets Manager's own redaction marker),
        # the window opened, the identity-bootstrap task's reads, the window closed, C-8G status.
        return [
            event("DescribeSecret", secret=PERSISTENT),
            event("GetRandomPassword", cfn=True),
            event("CreateSecret", secret=PERSISTENT, cfn=True,
                  extra={"requestParameters": {"name": PERSISTENT, "secretString": "HIDDEN_DUE_TO_SECURITY_REASONS"}}),
            event("PutResourcePolicy", secret=PERSISTENT, cfn=True),
            event("PutResourcePolicy", secret=PERSISTENT, cfn=True),
            event("GetSecretValue", "role", PERSISTENT, role="munaxa-nonprod-identity-bootstrap-execution"),
            event("GetSecretValue", "role", "munaxa-nonprod/identity-migrate", role="munaxa-nonprod-identity-bootstrap-execution"),
            event("PutResourcePolicy", secret=PERSISTENT, cfn=True),
            event("GetResourcePolicy", secret=PERSISTENT), event("ListSecretVersionIds", secret=PERSISTENT),
        ]

    def run24(self, fake, **kw):
        text = h.set_inputs(source("c24"), T_CREATE=self.T)
        return h.run_script(text, fake, **kw)

    def test_unset_or_future_time_aborts(self):
        fake = FakeAws()
        self.assertEqual(run("c24", fake)["code"], "T_CREATE_NOT_SET")
        self.assertEqual(run("c24", fake, T_CREATE="2999-01-01T00:00:00Z")["code"], "T_CREATE_IN_FUTURE")
        self.assertEqual(fake.calls, [])

    def test_a_normal_session_passes(self):
        fake = FakeAws()
        fake.events = self.normal()
        r = self.run24(fake)
        self.assertEqual((r["result"], r["findings"], r["complete"]), ("PASS", [], True))
        self.assertEqual(fake.ops("LookupEvents")[0][2]["LookupAttributes"][0]["AttributeValue"], "secretsmanager.amazonaws.com")

    def test_every_custody_breach_fails(self):
        breaches = {
            "value-read-of-identity-operator-by-root": event("GetSecretValue", "root", PERSISTENT),
            "value-read-of-identity-operator-by-role:munaxa-nonprod-identity-execution":
                event("GetSecretValue", "role", PERSISTENT, role="munaxa-nonprod-identity-execution"),
            "value-read-by-root": event("GetSecretValue", "root", BOOTSTRAP),
            "password-generated-outside-cloudformation": event("GetRandomPassword"),
            "operator-secret-written-outside-cloudformation": event("PutSecretValue", secret=PERSISTENT),
            "operator-policy-changed-outside-cloudformation": event("DeleteResourcePolicy", secret=PERSISTENT),
            "legacy-bootstrap-secret-created": event("CreateSecret", secret=BOOTSTRAP, cfn=True),
            "value-read-by-role:munaxa-shared-deployer-nonprod": event("GetSecretValue", "role", BOOTSTRAP, role="munaxa-shared-deployer-nonprod"),
            "delete-of-identity-operator": event("DeleteSecret", secret=PERSISTENT),
            "value-recorded-in-cloudtrail": event("CreateSecret", secret=PERSISTENT, cfn=True,
                                                  extra={"requestParameters": {"name": PERSISTENT, "secretString": "x"}}),
            "batch-value-read": event("BatchGetSecretValue", "role", None, role="munaxa-nonprod-identity-bootstrap-execution"),
        }
        for finding, ev in breaches.items():
            with self.subTest(finding=finding):
                fake = FakeAws()
                fake.events = self.normal() + [ev]
                r = self.run24(fake)
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(finding, r["findings"])
                self.assertNotIn('"x"', json.dumps(r["counts"]))

    def test_pagination_reads_every_page(self):
        fake = FakeAws()
        fake.events = [event("DescribeSecret", secret=BOOTSTRAP)] * 120 + [event("DeleteSecret", secret=PERSISTENT)]
        r = self.run24(fake)
        self.assertEqual(r["pages"], 3)
        self.assertIn("delete-of-identity-operator", r["findings"])

    def test_the_time_guard_reports_incomplete_never_pass(self):
        fake = FakeAws()
        fake.events = [event("DescribeSecret", secret=BOOTSTRAP)] * 500
        r = self.run24(fake, overrides={"time": FakeTime(step=7.0)})
        self.assertEqual((r["result"], r["complete"]), ("INCOMPLETE", False))

    def test_a_denied_lookup_fails(self):
        fake = FakeAws()
        fake.fault("LookupEvents", Fault("client", "AccessDeniedException"))
        self.assertEqual(self.run24(fake)["code"], "LOOKUP_AWS_AccessDeniedException")

    def test_a_timeout_fails(self):
        fake = FakeAws()
        fake.fault("LookupEvents", Fault("timeout"))
        self.assertEqual(self.run24(fake)["code"], "LOOKUP_PY_TIMEOUT")

    def test_malformed_responses_fail_closed(self):
        for name, response in (("not-a-dict", lambda p: "garbage"), ("events-not-a-list", lambda p: {"Events": 3}),
                               ("bad-token", lambda p: {"Events": [], "NextToken": 5})):
            with self.subTest(case=name):
                fake = FakeAws()
                fake.overrides["LookupEvents"] = response
                self.assertEqual(self.run24(fake)["code"], "LOOKUP_MALFORMED")

    def test_malformed_events_fail(self):
        for raw in ("{not json", "[1, 2]", json.dumps({"eventName": "X", "userIdentity": "root"}),
                    json.dumps({"eventName": "X", "userIdentity": {}, "requestParameters": ["a"]})):
            with self.subTest(raw=raw):
                fake = FakeAws()
                fake.events = self.normal() + [raw]
                r = self.run24(fake)
                self.assertEqual(r["result"], "FAIL")
                self.assertIn("unparseable-event", r["findings"])

    def test_a_secret_string_never_reaches_the_result(self):
        fake = FakeAws()
        fake.events = [event("CreateSecret", secret=BOOTSTRAP, extra={"requestParameters": {"name": BOOTSTRAP, "secretString": GOOD_PW},
                                                                       "responseElements": {"x": EMAIL}})]
        r = self.run24(fake)
        self.assertEqual(leaks(r, fake), [])


if __name__ == "__main__":
    unittest.main()
