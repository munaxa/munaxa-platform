"""Fake-AWS tests for the Option A connector scripts C-8, C-8R, C-8v, C-16 and C-24 (Stage E blocker BE-8).

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
DATA_KEY_ID = None  # filled from c8v at import time

SCRIPTS = {
    "c8": "c8-create-operator-secrets.py",
    "c8r": "c8r-recover-operator-secrets.py",
    "c8v": "c8v-verify-operator-secrets.py",
    "c16": "c16-delete-bootstrap-secret.py",
    "c24": "c24-custody-cloudtrail-check.py",
}


def source(key):
    with open(os.path.join(HERE, SCRIPTS[key]), encoding="utf-8") as f:
        return f.read()


DATA_KEY_ID = re.search(r'^DATA_KEY_ID = "([^"]+)"', source("c8v"), re.MULTILINE).group(1)


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
        self.assertIn('OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT', source("c8"))
        self.assertIn('OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT', source("c8r"))
        self.assertIn("NO_ACCOUNT_CONFIRMED = False  # INPUT", source("c8r"))
        self.assertIn('T_CREATE = "<', source("c24"))
        for key in SCRIPTS:
            self.assertNotRegex(source(key), r"[A-Za-z0-9._%+-]+@(?!munaxa-synthetic)[A-Za-z0-9-]+\.(com|net|org|io)\b")


class C8(unittest.TestCase):
    def test_success_creates_both_secrets_and_returns_no_value(self):
        fake = FakeAws()
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["result"], "CREATED")
        self.assertEqual(r["persistent"]["name"], PERSISTENT)
        self.assertEqual(r["bootstrap"]["name"], BOOTSTRAP)
        self.assertEqual(leaks(r, fake), [])
        creates = fake.ops("CreateSecret")
        self.assertEqual([c[2]["Name"] for c in creates], [PERSISTENT, BOOTSTRAP])
        for c in creates:
            self.assertEqual(c[2]["KmsKeyId"], "alias/munaxa-nonprod-data")
            self.assertTrue(c[2]["ClientRequestToken"])
            self.assertIn(GOOD_PW, c[2]["SecretString"])
        self.assertEqual(json.loads(creates[0][2]["SecretString"])["IDENTITY_ORGANISATION"], "munaxa-group")
        self.assertNotIn("IDENTITY_ORGANISATION", json.loads(creates[1][2]["SecretString"]))

    def test_an_unedited_copy_aborts_before_any_call(self):
        fake = FakeAws()
        r = run("c8", fake)
        self.assertEqual(r, {"result": "ABORT", "code": "EMAIL_NOT_SET"})
        self.assertEqual(fake.calls, [])

    def test_a_malformed_or_reserved_email_aborts(self):
        for email, code in (("not-an-email", "EMAIL_MALFORMED"), ("a@b", "EMAIL_MALFORMED"),
                            ("x@example.com", "EMAIL_RESERVED_DOMAIN"), ("x@stage.invalid", "EMAIL_RESERVED_DOMAIN")):
            with self.subTest(email=email):
                fake = FakeAws()
                self.assertEqual(run("c8", fake, OPERATOR_EMAIL=email)["code"], code)
                self.assertEqual(fake.calls, [])

    def test_the_wrong_account_aborts_before_any_secrets_call(self):
        fake = FakeAws(account="111111111111")
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "WRONG_ACCOUNT")
        self.assertEqual([c[1] for c in fake.calls], ["GetCallerIdentity"])

    def test_a_denied_caller_check_aborts(self):
        fake = FakeAws()
        fake.fault("GetCallerIdentity", Fault("client", "AccessDenied"))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CALLER_AWS_AccessDenied")
        self.assertEqual(leaks(r, fake), [])

    def test_a_malformed_caller_response_aborts(self):
        fake = FakeAws()
        fake.overrides["GetCallerIdentity"] = lambda p: ["not", "a", "dict"]
        self.assertEqual(run("c8", fake, OPERATOR_EMAIL=EMAIL)["code"], "WRONG_ACCOUNT")

    def test_a_second_run_is_refused_and_changes_nothing(self):
        fake = FakeAws()
        run("c8", fake, OPERATOR_EMAIL=EMAIL)
        before = copy.deepcopy(fake.secrets)
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual((r["result"], r["code"], r["name"]), ("ABORT", "NAME_EXISTS", PERSISTENT))
        self.assertEqual(fake.secrets, before)

    def test_a_pending_deletion_name_is_refused(self):
        fake = FakeAws()
        fake.secrets[BOOTSTRAP] = {"ARN": fake.arn(BOOTSTRAP), "Name": BOOTSTRAP, "Tags": [], "KmsKeyId": "",
                                   "versions": {}, "DeletedDate": "2026-11-19T00:00:00Z"}
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual((r["code"], r["name"]), ("NAME_EXISTS", BOOTSTRAP))
        self.assertEqual(fake.ops("CreateSecret"), [])

    def test_a_denied_precheck_aborts(self):
        fake = FakeAws()
        fake.fault("DescribeSecret", Fault("client", "AccessDeniedException"))
        self.assertEqual(run("c8", fake, OPERATOR_EMAIL=EMAIL)["code"], "PRECHECK_AWS_AccessDeniedException")

    def test_a_trivial_password_is_regenerated(self):
        fake = FakeAws()
        fake.passwords = [TRIVIAL_PW, GOOD_PW]
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["result"], "CREATED")
        self.assertEqual(len(fake.ops("GetRandomPassword")), 2)
        self.assertNotIn(TRIVIAL_PW, json.dumps(fake.ops("CreateSecret")))

    def test_three_trivial_passwords_abort_without_a_secret(self):
        fake = FakeAws()
        fake.passwords = [TRIVIAL_PW, TRIVIAL_PW, TRIVIAL_PW, TRIVIAL_PW]
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "GENERATE_POLICY_RETRIES")
        self.assertEqual(fake.secrets, {})

    def test_a_malformed_password_response_aborts(self):
        fake = FakeAws()
        fake.overrides["GetRandomPassword"] = lambda p: {"Unexpected": "x"}
        self.assertEqual(run("c8", fake, OPERATOR_EMAIL=EMAIL)["code"], "GENERATE_PY_KEY")
        fake = FakeAws()
        fake.overrides["GetRandomPassword"] = lambda p: {"RandomPassword": 12345}
        self.assertEqual(run("c8", fake, OPERATOR_EMAIL=EMAIL)["code"], "GENERATE_POLICY_RETRIES")

    def test_a_denied_create_aborts_without_a_value(self):
        fake = FakeAws()
        fake.fault("CreateSecret", Fault("client", "AccessDeniedException"))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CREATE_PERSISTENT_AWS_AccessDeniedException")
        self.assertEqual(r["next"], "C-8v")
        self.assertEqual(fake.secrets, {})
        self.assertEqual(leaks(r, fake), [])

    def test_a_timeout_after_the_create_retries_idempotently(self):
        fake = FakeAws()
        fake.fault("CreateSecret", Fault("timeout", after=True))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["result"], "CREATED")
        creates = fake.ops("CreateSecret")
        self.assertEqual(len(creates), 3)
        self.assertEqual(creates[0][2]["ClientRequestToken"], creates[1][2]["ClientRequestToken"])
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 1)

    def test_throttling_is_retried_once_then_fails(self):
        fake = FakeAws()
        fake.fault("CreateSecret", Fault("client", "ThrottlingException"), Fault("client", "ThrottlingException"))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CREATE_PERSISTENT_AWS_ThrottlingException")
        self.assertEqual(len(fake.ops("CreateSecret")), 2)

    def test_partial_failure_keeps_the_persistent_secret_and_names_the_recovery(self):
        fake = FakeAws()
        fake.fault("CreateSecret", None, Fault("client", "LimitExceededException"))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CREATE_BOOTSTRAP_AWS_LimitExceededException")
        self.assertTrue(r["persistent_kept"])
        self.assertEqual(r["next"], "C-8v then C-8R")
        self.assertIn(PERSISTENT, fake.secrets)
        self.assertNotIn(BOOTSTRAP, fake.secrets)
        self.assertEqual(fake.ops("DeleteSecret"), [])
        self.assertEqual(leaks(r, fake), [])

    def test_a_malformed_create_response_fails_closed(self):
        fake = FakeAws()
        fake.overrides["CreateSecret"] = lambda p: None
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual((r["result"], r["code"]), ("ABORT", "CREATE_PERSISTENT_PY_OTHER"))

    def test_an_unexpected_exception_returns_a_code_only(self):
        fake = FakeAws()
        fake.fault("CreateSecret", Fault("runtime"))
        r = run("c8", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "CREATE_PERSISTENT_PY_OTHER")
        self.assertEqual(leaks(r, fake), [])


class C8R(unittest.TestCase):
    def partial(self):
        fake = FakeAws()
        fake.fault("CreateSecret", None, Fault("client", "LimitExceededException"))
        run("c8", fake, OPERATOR_EMAIL=EMAIL)
        fake.calls.clear()
        fake.passwords = ["Wk4$hT8@pN2&vB6*xM9!zR3%cL7^fJ1#dS5+gQ0="]
        return fake

    def test_it_needs_the_no_account_confirmation(self):
        fake = self.partial()
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL)
        self.assertEqual(r["code"], "NO_ACCOUNT_NOT_CONFIRMED")
        self.assertEqual(fake.calls, [])

    def test_recovery_rotates_the_persistent_secret_and_creates_the_bootstrap_secret(self):
        fake = self.partial()
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL, NO_ACCOUNT_CONFIRMED=True)
        self.assertEqual(r["result"], "CREATED")
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 2)
        self.assertIn(BOOTSTRAP, fake.secrets)
        put = fake.ops("PutSecretValue")[0][2]
        self.assertTrue(put["SecretId"].startswith(f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{PERSISTENT}-"))
        self.assertEqual(leaks(r, fake), [])
        self.assertNotIn("Wk4$", json.dumps(r))
        v = run("c8v", fake, EXPECTED_OPERATOR_VERSIONS=2)
        self.assertEqual(v["result"], "PASS")

    def test_recovery_refuses_when_the_bootstrap_secret_exists(self):
        fake = FakeAws()
        run("c8", fake, OPERATOR_EMAIL=EMAIL)
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL, NO_ACCOUNT_CONFIRMED=True)
        self.assertEqual(r["code"], "BOOTSTRAP_EXISTS")
        self.assertEqual(fake.ops("PutSecretValue"), [])

    def test_recovery_refuses_without_a_persistent_secret(self):
        fake = FakeAws()
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL, NO_ACCOUNT_CONFIRMED=True)
        self.assertEqual(r["code"], "PERSISTENT_AWS_ResourceNotFoundException")

    def test_a_timeout_on_the_rotation_retries_with_the_same_token(self):
        fake = self.partial()
        fake.fault("PutSecretValue", Fault("timeout", after=True))
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL, NO_ACCOUNT_CONFIRMED=True)
        self.assertEqual(r["result"], "CREATED")
        puts = fake.ops("PutSecretValue")
        self.assertEqual(len(puts), 2)
        self.assertEqual(puts[0][2]["ClientRequestToken"], puts[1][2]["ClientRequestToken"])
        self.assertEqual(len(fake.secrets[PERSISTENT]["versions"]), 2)

    def test_a_denied_bootstrap_create_keeps_the_rotated_secret(self):
        fake = self.partial()
        fake.fault("CreateSecret", Fault("client", "AccessDeniedException"))
        r = run("c8r", fake, OPERATOR_EMAIL=EMAIL, NO_ACCOUNT_CONFIRMED=True)
        self.assertEqual(r["code"], "CREATE_BOOTSTRAP_AWS_AccessDeniedException")
        self.assertTrue(r["persistent_kept"])
        self.assertEqual(leaks(r, fake), [])


class C8v(unittest.TestCase):
    def created(self):
        fake = FakeAws()
        run("c8", fake, OPERATOR_EMAIL=EMAIL)
        return fake

    def test_pass_after_c8(self):
        r = run("c8v", self.created(), EXPECTED_OPERATOR_VERSIONS=1)
        self.assertEqual(r["result"], "PASS")
        self.assertEqual(leaks(r, None), [])

    def test_every_drift_fails(self):
        drifts = {
            "tag": lambda f: f.secrets[PERSISTENT]["Tags"].pop(),
            "rotation": lambda f: f.secrets[BOOTSTRAP].__setitem__("RotationEnabled", True),
            "kms": lambda f: f.secrets[PERSISTENT].__setitem__("KmsKeyId", "alias/aws/secretsmanager"),
            "deleted": lambda f: f.secrets[BOOTSTRAP].__setitem__("DeletedDate", "2026-11-20T00:00:00Z"),
            "missing": lambda f: f.secrets.pop(BOOTSTRAP),
        }
        for name, change in drifts.items():
            with self.subTest(drift=name):
                fake = self.created()
                change(fake)
                self.assertEqual(run("c8v", fake, EXPECTED_OPERATOR_VERSIONS=1)["result"], "FAIL")

    def test_the_wrong_version_count_fails(self):
        self.assertEqual(run("c8v", self.created(), EXPECTED_OPERATOR_VERSIONS=2)["result"], "FAIL")

    def test_a_bad_input_aborts(self):
        fake = self.created()
        fake.calls.clear()
        self.assertEqual(run("c8v", fake, EXPECTED_OPERATOR_VERSIONS=3)["code"], "BAD_EXPECTED_VERSIONS")
        self.assertEqual(fake.calls, [])

    def test_a_malformed_response_fails_closed(self):
        fake = self.created()
        fake.overrides["ListSecretVersionIds"] = lambda p: {"Versions": "garbage"}
        r = run("c8v", fake, EXPECTED_OPERATOR_VERSIONS=1)
        self.assertEqual(r["result"], "FAIL")

    def test_a_denial_fails(self):
        fake = self.created()
        fake.fault("DescribeSecret", Fault("client", "AccessDeniedException"))
        r = run("c8v", fake, EXPECTED_OPERATOR_VERSIONS=1)
        self.assertEqual(r["result"], "FAIL")
        self.assertEqual(r[PERSISTENT]["error"], "AWS_AccessDeniedException")


class C16(unittest.TestCase):
    def created(self):
        fake = FakeAws()
        run("c8", fake, OPERATOR_EMAIL=EMAIL)
        fake.calls.clear()
        return fake

    def test_it_deletes_only_the_bootstrap_secret(self):
        fake = self.created()
        r = run("c16", fake)
        self.assertEqual(r["result"], "PASS")
        self.assertTrue(r["deleted"])
        self.assertIn(PERSISTENT, fake.secrets)
        self.assertNotIn(BOOTSTRAP, fake.secrets)
        deletes = fake.ops("DeleteSecret")
        self.assertEqual(len(deletes), 1)
        self.assertTrue(deletes[0][2]["SecretId"].startswith(f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{BOOTSTRAP}-"))
        self.assertIs(deletes[0][2]["ForceDeleteWithoutRecovery"], True)

    def test_a_second_run_is_success_without_a_delete(self):
        fake = self.created()
        run("c16", fake)
        fake.calls.clear()
        r = run("c16", fake)
        self.assertEqual((r["result"], r["already_absent"], r["deleted"]), ("PASS", True, False))
        self.assertEqual(fake.ops("DeleteSecret"), [])

    def test_a_name_mismatch_never_deletes(self):
        fake = self.created()
        fake.overrides["DescribeSecret"] = lambda p: {"Name": PERSISTENT, "ARN": fake.secrets[PERSISTENT]["ARN"]}
        r = run("c16", fake)
        self.assertEqual(r["code"], "NAME_MISMATCH")
        self.assertEqual(fake.ops("DeleteSecret"), [])

    def test_a_foreign_arn_never_deletes(self):
        fake = self.created()
        fake.overrides["DescribeSecret"] = lambda p: {
            "Name": BOOTSTRAP, "ARN": f"arn:aws:secretsmanager:{REGION}:999999999999:secret:{BOOTSTRAP}-AbCdEf"}
        self.assertEqual(run("c16", fake)["code"], "NAME_MISMATCH")
        self.assertEqual(fake.ops("DeleteSecret"), [])

    def test_throttling_is_retried(self):
        fake = self.created()
        fake.fault("DeleteSecret", Fault("client", "ThrottlingException"), Fault("timeout"))
        r = run("c16", fake)
        self.assertEqual(r["result"], "PASS")
        self.assertEqual(len(fake.ops("DeleteSecret")), 3)

    def test_a_delete_that_happened_before_a_timeout_is_absent_on_retry(self):
        fake = self.created()
        fake.fault("DeleteSecret", Fault("timeout", after=True))
        r = run("c16", fake)
        self.assertEqual(r["result"], "PASS")
        self.assertTrue(r["already_absent"])

    def test_a_denied_delete_fails(self):
        fake = self.created()
        fake.fault("DeleteSecret", Fault("client", "AccessDeniedException"))
        r = run("c16", fake)
        self.assertEqual((r["result"], r["code"]), ("FAIL", "DELETE_AWS_AccessDeniedException"))
        self.assertIn(BOOTSTRAP, fake.secrets)

    def test_a_missing_persistent_secret_fails(self):
        fake = self.created()
        fake.secrets.pop(PERSISTENT)
        r = run("c16", fake)
        self.assertEqual(r["result"], "FAIL")
        self.assertFalse(r["persistent_present"])

    def test_a_list_failure_fails(self):
        fake = self.created()
        fake.fault("ListSecrets", Fault("client", "AccessDeniedException"))
        r = run("c16", fake)
        self.assertEqual((r["result"], r["list_count_exact"]), ("FAIL", -1))

    def test_a_secret_that_never_disappears_fails_within_the_time_limit(self):
        fake = self.created()
        fake.op_DeleteSecret = lambda p: {"ARN": "x", "Name": BOOTSTRAP}  # accepted but nothing happens
        r = run("c16", fake)
        self.assertEqual(r["result"], "FAIL")
        self.assertFalse(r["describe_not_found"])

    def test_the_wrong_account_aborts(self):
        fake = self.created()
        fake.account = "111111111111"
        self.assertEqual(run("c16", fake)["code"], "WRONG_ACCOUNT")
        self.assertEqual(fake.ops("DeleteSecret"), [])


def event(name, who="root", secret=None, extra=None, role=None):
    ui = {"type": "Root"} if who == "root" else {
        "type": "AssumedRole", "sessionContext": {"sessionIssuer": {"userName": role or who}}}
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
        return [
            event("GetRandomPassword"),
            event("CreateSecret", secret=PERSISTENT), event("CreateSecret", secret=BOOTSTRAP),
            event("GetSecretValue", "role", BOOTSTRAP, role="munaxa-nonprod-identity-bootstrap-execution"),
            event("DescribeSecret", secret=BOOTSTRAP), event("DeleteSecret", secret=BOOTSTRAP),
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
            "value-read-of-identity-operator": event("GetSecretValue", "role", PERSISTENT, role="munaxa-nonprod-identity-bootstrap-execution"),
            "value-read-by-root": event("GetSecretValue", "root", BOOTSTRAP),
            "value-read-by-role:munaxa-shared-deployer-nonprod": event("GetSecretValue", "role", BOOTSTRAP, role="munaxa-shared-deployer-nonprod"),
            "delete-of-identity-operator": event("DeleteSecret", secret=PERSISTENT),
            "value-recorded-in-cloudtrail": event("CreateSecret", secret=BOOTSTRAP, extra={"requestParameters": {"name": BOOTSTRAP, "secretString": "x"}}),
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
