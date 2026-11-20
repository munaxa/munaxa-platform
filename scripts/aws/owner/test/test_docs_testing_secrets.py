#!/usr/bin/env python3
"""Offline tests of scripts/aws/owner/docs-testing-secrets.sh. No AWS call, no network.

The script runs unchanged except for three test-only substitutions, each asserted to apply exactly once:
  1. `AWS = find_cli()`  -> the fake CLI (fake_aws.py) in a temporary directory, since the real one
     must be a root-owned AWS CLI v2 install;
  2. the body of `ask()` -> the next line of a prepared answers file (the real one reads /dev/tty);
  3. nothing else: the CloudShell credential check is satisfied by a fake container-credentials URI.
Every case checks: the exit status and the decisive line; no generated or typed value in the output;
no value in any CLI process's arguments or environment; the CLI's temporary home removed; the exact
writes (one PutSecretValue per bundle, fresh UUID v4 tokens, never VersionStages).

    python3 scripts/aws/owner/test/test_docs_testing_secrets.py
"""
import glob, json, os, warnings, re, shutil, subprocess, sys, tempfile, unittest
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "docs-testing-secrets.sh")
KMS = "arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37"
HOST = "munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com"
API, OP, MIG = "munaxa-nonprod/docs-api", "munaxa-nonprod/docs-operator", "munaxa-nonprod/docs-migrate"
PROV = "munaxa-nonprod/docs-provision/munaxa-internal"
RESEND = "re_FAKEVALUEresendKey0123456789"
CONTROL = "mxc_0b6f7c1e-2f43-4e7a-9d0c-1a2b3c4d5e6f_FAKEVALUEcontrolSecret0123456789abcdefABCD"
ADMIN_PW = "FAKEVALUE-admin-password-1234"
API_KEYS = ["DATABASE_URL", "TENANT_CATALOGUE", "REDIS_URL", "REDIS_PASSWORD", "JWT_ACCESS_SECRET",
            "SIGNATURE_WITNESS_SECRET", "AUDIT_CHECKPOINT_SECRET", "MFA_TOTP_SEALING_KEY",
            "METRICS_SCRAPE_TOKEN", "MAIL_RESEND_API_KEY", "CONTROL_PLANE_TOKEN"]

ASK_REAL = '''def ask(prompt, secret=False):
    """One line from the operator's terminal; hidden input for a secret. (Offline tests replace this.)"""
    try:
        if secret:
            with open("/dev/tty", "w") as out:
                return getpass.getpass(prompt, stream=out)
        with open("/dev/tty", "r") as tty:
            sys.stdout.write(prompt)
            sys.stdout.flush()
            return tty.readline().rstrip("\\n")
    except (OSError, EOFError):
        stop("NO_TERMINAL")
'''


class Harness:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="docs-secrets-test-")
        self.state = os.path.join(self.dir, "state.json")
        fake = os.path.join(self.dir, "aws")
        shutil.copy(os.path.join(HERE, "fake_aws.py"), fake)
        os.chmod(fake, 0o755)
        with open(os.path.join(self.dir, "STATE_POINTER"), "w") as f:
            f.write(self.state)
        self.answers = os.path.join(self.dir, "answers.txt")
        src = open(SCRIPT).read()
        assert src.count("AWS = find_cli()") == 1 and src.count(ASK_REAL) == 1, "substitution anchors moved"
        test_ask = (
            "_ANSWERS = None\n\n\ndef ask(prompt, secret=False):\n"
            "    global _ANSWERS\n"
            f"    if _ANSWERS is None:\n        _ANSWERS = open({self.answers!r}).read().split('\\n')\n"
            "    sys.stdout.write(prompt + ('<hidden>' if secret else '') + '\\n')\n"
            "    if not _ANSWERS:\n        stop('NO_TERMINAL')\n"
            "    return _ANSWERS.pop(0)\n")
        src = src.replace("AWS = find_cli()", f"AWS = {fake!r}").replace(ASK_REAL, test_ask)
        self.script = os.path.join(self.dir, "under-test.sh")
        with open(self.script, "w") as f:
            f.write(src)
        self.reset()

    def reset(self, account="229251310592"):
        secrets = {n: {"arn": f"arn:aws:secretsmanager:eu-central-1:229251310592:secret:{n}-{s}", "kms": KMS, "versions": []}
                   for n, s in ((API, "e4eCkd"), (OP, "pcZxyz"), (MIG, "PHRDZ5"))}
        json.dump({"account": account, "db_host": HOST, "secrets": secrets, "faults": {}}, open(self.state, "w"))
        for p in glob.glob(self.state + ".ops"):
            os.remove(p)

    def fault(self, key, code, count=1):
        s = json.load(open(self.state))
        s["faults"][key] = {"code": code, "count": count}
        json.dump(s, open(self.state, "w"))

    def run(self, *args, answers=()):
        with open(self.answers, "w") as f:
            f.write("\n".join(answers))
        before = set(glob.glob("/tmp/docs-secrets-cli-*"))
        env = {"PATH": "/usr/bin:/bin", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI": "/fake-credentials"}
        p = subprocess.run(["/bin/bash", "-p", self.script, *args], env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=120)
        out = p.stdout.decode()
        left = set(glob.glob("/tmp/docs-secrets-cli-*")) - before
        assert not left, "CLI temporary home left behind"
        return p.returncode, out

    def secrets(self):
        return json.load(open(self.state))["secrets"]

    def current(self, name):
        for v in self.secrets()[name]["versions"]:
            if "AWSCURRENT" in v["stages"]:
                return json.loads(v["string"])
        return None

    def ops(self):
        path = self.state + ".ops"
        return [json.loads(l) for l in open(path)] if os.path.exists(path) else []

    def all_values(self):
        vals = []
        for sec in self.secrets().values():
            for v in sec["versions"]:
                for x in json.loads(v["string"]).values():
                    vals.append(x)
                    try:
                        u = urlsplit(x)
                        if u.password:
                            vals.append(u.password)
                    except ValueError:
                        pass
        return vals


class DocsTestingSecretsTest(unittest.TestCase):
    def setUp(self):
        self.h = Harness()

    def tearDown(self):
        shutil.rmtree(self.h.dir, ignore_errors=True)

    def assertClean(self, out):
        self.assertNotIn("FAKEVALUE", out)
        for v in self.h.all_values():
            if len(v) >= 16 and v not in (self.tenant(),) and not v.startswith("Munaxa"):
                self.assertNotIn(v, out)
        self.assertFalse(any(o["leak"] for o in self.h.ops()), "a value reached a CLI argument or environment")
        self.assertNotIn("Traceback", out)

    def tenant(self):
        api = self.h.current(API)
        return json.loads(api["TENANT_CATALOGUE"])["tenants"][0]["id"] if api else None

    def puts(self):
        return [o for o in self.h.ops() if o["op"] in ("put-secret-value", "create-secret", "delete-secret")]

    def fill(self, resend=RESEND):
        rc, out = self.h.run("bundles", answers=["FILL", resend])
        self.assertEqual(rc, 0, out)
        return out

    # ---- bundles ------------------------------------------------------------------------------
    def test_first_fill_writes_three_consistent_bundles(self):
        out = self.fill()
        self.assertIn("BUNDLES VERIFIED", out)
        self.assertEqual([o["op"] for o in self.puts()], ["put-secret-value"] * 3)
        op, mig, api = self.h.current(OP), self.h.current(MIG), self.h.current(API)
        self.assertEqual(sorted(op), ["EDMS_APP_PASSWORD", "EDMS_BACKUP_PASSWORD"])
        self.assertEqual(list(mig), ["DATABASE_MIGRATION_URL"])
        self.assertEqual(sorted(api), sorted(API_KEYS))
        db = urlsplit(api["DATABASE_URL"])
        self.assertEqual((db.username, db.password, db.hostname, db.port, db.path, db.query),
                         ("edms_app", op["EDMS_APP_PASSWORD"], HOST, 5432, "/edms_munaxa_internal", "sslmode=require"))
        owner = urlsplit(mig["DATABASE_MIGRATION_URL"])
        self.assertEqual((owner.username, owner.hostname, owner.path), ("edms_owner", HOST, "/edms_munaxa_internal"))
        self.assertNotIn(owner.password, json.dumps(api))
        self.assertNotIn(op["EDMS_BACKUP_PASSWORD"], json.dumps(api))
        self.assertEqual(api["REDIS_URL"], f"redis://:{api['REDIS_PASSWORD']}@127.0.0.1:6379")
        cat = json.loads(api["TENANT_CATALOGUE"])
        self.assertEqual(cat["tenants"][0]["database"]["url"], api["DATABASE_URL"])
        self.assertEqual(cat["tenants"][0]["slug"], "munaxa-internal")
        self.assertEqual(cat["defaults"]["storage"]["container"], "munaxa-nonprod-docs-files-229251310592")
        self.assertEqual(api["MAIL_RESEND_API_KEY"], RESEND)
        self.assertTrue(api["CONTROL_PLANE_TOKEN"].startswith("pending-control-credential-"))
        self.assertGreaterEqual(min(len(api[k]) for k in API_KEYS if k != "MAIL_RESEND_API_KEY"), 32)
        self.assertIn(f"tenant_id       {self.tenant()}", out)
        self.assertIn("mail_key        resend", out)
        self.assertClean(out)

    def test_empty_resend_answer_stores_a_marked_placeholder(self):
        out = self.fill(resend="")
        self.assertTrue(self.h.current(API)["MAIL_RESEND_API_KEY"].startswith("pending-resend-key-"))
        self.assertIn("mail_key        placeholder", out)
        self.assertClean(out)

    def test_two_runs_generate_different_credentials(self):
        self.fill()
        first = self.h.current(API)
        self.h.reset()
        self.fill()
        second = self.h.current(API)
        for k in ("JWT_ACCESS_SECRET", "REDIS_PASSWORD", "DATABASE_URL", "TENANT_CATALOGUE"):
            self.assertNotEqual(first[k], second[k])

    def test_rerun_after_success_writes_nothing_and_verifies(self):
        self.fill()
        n = len(self.puts())
        rc, out = self.h.run("bundles", answers=[])
        self.assertEqual(rc, 0, out)
        self.assertIn("already_done", out)
        self.assertEqual(len(self.puts()), n)
        self.assertClean(out)

    def test_not_confirmed_writes_nothing(self):
        rc, out = self.h.run("bundles", answers=["fill", RESEND])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT NOT_CONFIRMED", out)
        self.assertEqual(self.puts(), [])

    def test_bad_resend_key_writes_nothing(self):
        rc, out = self.h.run("bundles", answers=["FILL", "FAKEVALUE-not-a-resend-key"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT RESEND_KEY_FORMAT", out)
        self.assertEqual(self.puts(), [])
        self.assertNotIn("FAKEVALUE", out)

    def test_wrong_account_stops_before_any_secret_call(self):
        self.h.reset(account="111111111111")
        rc, out = self.h.run("bundles", answers=["FILL", RESEND])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT WRONG_ACCOUNT", out)
        self.assertEqual([o["service"] for o in self.h.ops()], ["sts"])

    def test_partial_fill_resumes(self):
        # A first run that stops after docs-operator: the docs-migrate write fails once.
        _set_nth_put_fault(self.h, nth=2, code="InternalServiceError")
        rc, out = self.h.run("bundles", answers=["FILL", RESEND])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT AWS_ERROR put-secret-value InternalServiceError", out)
        self.assertIn("AFTER_WRITE_ATTEMPT", out)
        self.assertIn("ABORT WRITTEN_EARLIER_IN_THIS_RUN docs-operator", out)
        self.assertNotIn("NOTHING WRITTEN", out)
        app_pw = self.h.current(OP)["EDMS_APP_PASSWORD"]
        self.assertIsNone(self.h.current(MIG))
        rc, out = self.h.run("bundles", answers=["FILL", RESEND])
        self.assertEqual(rc, 0, out)
        self.assertEqual(urlsplit(self.h.current(API)["DATABASE_URL"]).password, app_pw)
        self.assertEqual(len(self.h.secrets()[OP]["versions"]), 1)
        self.assertClean(out)

    def test_bundle_with_two_versions_is_refused(self):
        self.fill()
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 0, out)
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 1)
        self.assertIn("A_BUNDLE_ALREADY_HAS_SEVERAL_VERSIONS", out)

    # ---- replace-key ---------------------------------------------------------------------------
    def test_replace_control_token_changes_only_that_key(self):
        self.fill()
        before = self.h.current(API)
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 0, out)
        after = self.h.current(API)
        self.assertEqual(after["CONTROL_PLANE_TOKEN"], CONTROL)
        self.assertEqual({k: v for k, v in after.items() if k != "CONTROL_PLANE_TOKEN"},
                         {k: v for k, v in before.items() if k != "CONTROL_PLANE_TOKEN"})
        stages = [v["stages"] for v in self.h.secrets()[API]["versions"]]
        self.assertEqual(stages, [["AWSPREVIOUS"], ["AWSCURRENT"]])
        self.assertIn("REPLACED VERIFIED", out)
        self.assertClean(out)

    def test_replace_resend_key_after_placeholder(self):
        self.fill(resend="")
        rc, out = self.h.run("replace-key", "MAIL_RESEND_API_KEY", answers=["REPLACE", RESEND])
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.h.current(API)["MAIL_RESEND_API_KEY"], RESEND)
        self.assertClean(out)

    def test_replace_with_a_malformed_token_writes_nothing(self):
        self.fill()
        n = len(self.puts())
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", "FAKEVALUE-not-mxc-0123456789abcdef0123"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT CONTROL_TOKEN_FORMAT", out)
        self.assertEqual(len(self.puts()), n)
        self.assertNotIn("FAKEVALUE", out)

    def test_replace_before_fill_is_refused(self):
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("BUNDLES_NOT_FILLED", out)

    def test_usage_refuses_other_keys(self):
        rc, out = self.h.run("replace-key", "JWT_ACCESS_SECRET")
        self.assertEqual(rc, 2)
        self.assertEqual(self.h.ops(), [])

    # ---- provision ----------------------------------------------------------------------------
    def test_provision_create_and_delete(self):
        self.fill()
        rc, out = self.h.run("provision-create", answers=["admin@example.test", "Test Admin", ADMIN_PW, ADMIN_PW, "CREATE"])
        self.assertEqual(rc, 0, out)
        prov = self.h.current(PROV)
        self.assertEqual(prov, {"TENANT_ID": self.tenant(), "ADMIN_EMAIL": "admin@example.test",
                                "ADMIN_NAME": "Test Admin", "ADMIN_PASSWORD": ADMIN_PW})
        self.assertEqual(self.h.secrets()[PROV]["kms"], KMS)
        self.assertNotIn(ADMIN_PW, out)
        rc, out = self.h.run("provision-create", answers=[])
        self.assertEqual(rc, 1)
        self.assertIn("PROVISION_SECRET_EXISTS", out)
        rc, out = self.h.run("provision-delete", answers=["DELETE"])
        self.assertEqual(rc, 0, out)
        self.assertNotIn(PROV, self.h.secrets())
        rc, out = self.h.run("provision-delete", answers=[])
        self.assertEqual(rc, 0, out)
        self.assertIn("ABSENT", out)

    def test_provision_password_mismatch_or_short_writes_nothing(self):
        self.fill()
        n = len(self.puts())
        rc, out = self.h.run("provision-create", answers=["admin@example.test", "Test Admin", ADMIN_PW, ADMIN_PW + "x", "CREATE"])
        self.assertIn("PASSWORDS_DIFFER", out)
        rc, out = self.h.run("provision-create", answers=["admin@example.test", "Test Admin", "short", "short", "CREATE"])
        self.assertIn("PASSWORD_LENGTH_OR_SPACES", out)
        pw = "my TEST ADMIN password 9"
        rc, out = self.h.run("provision-create", answers=["admin@example.test", "Test Admin", pw, pw, "CREATE"])
        self.assertIn("PASSWORD_CONTAINS_EMAIL_OR_NAME", out)
        self.assertEqual(len(self.puts()), n)
        self.assertNotIn(PROV, self.h.secrets())

    def test_status_prints_no_value(self):
        self.fill(resend="")
        rc, out = self.h.run("status")
        self.assertEqual(rc, 0, out)
        self.assertIn("mail_key        placeholder", out)
        self.assertIn("control_token   placeholder", out)
        self.assertIn("provision       munaxa-nonprod/docs-provision/munaxa-internal: absent", out)
        self.assertClean(out)

    def test_cli_runs_with_an_allowlisted_environment(self):
        self.fill()
        names = set()
        for o in self.h.ops():
            names.update(o["env_names"])
        allowed = {"PATH", "HOME", "LANG", "LC_ALL", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_REGION",
                   "AWS_DEFAULT_REGION", "AWS_PAGER", "AWS_CLI_AUTO_PROMPT", "AWS_RETRY_MODE", "AWS_MAX_ATTEMPTS",
                   "AWS_EC2_METADATA_DISABLED", "AWS_CLI_FILE_ENCODING", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
                   "PWD", "SHLVL", "_"}
        self.assertLessEqual(names, allowed, names - allowed)

    # ---- added 20 Nov: review findings 4 and 6 ---------------------------------------------
    def test_write_stored_but_cli_error_resumes_without_a_second_version(self):
        # The docs-migrate PutSecretValue is stored, but the CLI reports an error (a lost response).
        _set_nth_store_then_fail(self.h, nth=2)
        rc, out = self.h.run("bundles", answers=["FILL", RESEND])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT AWS_ERROR put-secret-value RequestTimeout", out)
        self.assertIn("ABORT AFTER_WRITE_ATTEMPT", out)
        self.assertIsNotNone(self.h.current(MIG))
        rc, out = self.h.run("bundles", answers=["FILL", RESEND])
        self.assertEqual(rc, 0, out)
        for name in (OP, MIG, API):
            self.assertEqual(len(self.h.secrets()[name]["versions"]), 1, name)
        self.assertEqual(urlsplit(self.h.current(API)["DATABASE_URL"]).password, self.h.current(OP)["EDMS_APP_PASSWORD"])
        self.assertClean(out)

    def test_second_replace_moves_awsprevious(self):
        self.fill(resend="")
        rc, out = self.h.run("replace-key", "MAIL_RESEND_API_KEY", answers=["REPLACE", RESEND])
        self.assertEqual(rc, 0, out)
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 0, out)
        stages = [v["stages"] for v in self.h.secrets()[API]["versions"]]
        self.assertEqual(stages, [[], ["AWSPREVIOUS"], ["AWSCURRENT"]])
        cur = self.h.current(API)
        self.assertEqual((cur["MAIL_RESEND_API_KEY"], cur["CONTROL_PLANE_TOKEN"]), (RESEND, CONTROL))
        self.assertClean(out)

    def test_second_run_while_one_holds_the_lock_stops_before_any_aws_call(self):
        import fcntl
        fd = os.open("/tmp/docs-testing-secrets.lock", os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            rc, out = self.h.run("status")
        finally:
            os.close(fd)
        self.assertEqual(rc, 1)
        self.assertIn("ABORT ANOTHER_RUN_IN_PROGRESS", out)
        self.assertEqual(self.h.ops(), [])

    def test_shell_tracing_does_not_print_the_container_token(self):
        with open(self.h.answers, "w") as f:
            f.write("")
        env = {"PATH": "/usr/bin:/bin", "AWS_CONTAINER_CREDENTIALS_FULL_URI": "http://127.0.0.1:1338/fake",
               "AWS_CONTAINER_AUTHORIZATION_TOKEN": "FAKEVALUE-container-token-0123456789"}
        p = subprocess.run(["/bin/bash", "-x", self.h.script, "status"], env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=120)
        out = p.stdout.decode()
        self.assertEqual(p.returncode, 0, out)
        self.assertNotIn("FAKEVALUE", out)

    def test_provision_delete_refuses_a_secret_without_the_purpose_tag(self):
        self.fill()
        s = json.load(open(self.h.state))
        s["secrets"][PROV] = {"arn": f"arn:aws:secretsmanager:eu-central-1:229251310592:secret:{PROV}-ZzZzZz",
                              "kms": KMS, "versions": [{"id": "11111111-1111-4111-8111-111111111111",
                                                        "string": "{}", "stages": ["AWSCURRENT"]}]}
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("provision-delete", answers=["DELETE"])
        self.assertEqual(rc, 1)
        self.assertIn("PROVISION_SECRET_NOT_MADE_BY_THIS_SCRIPT", out)
        self.assertIn(PROV, self.h.secrets())


def _set_nth_store_then_fail(h, nth):
    """Store the nth PutSecretValue, then make the CLI report an error for it (counted by fake_aws.py)."""
    s = json.load(open(h.state))
    s["faults"] = {}
    s["put_store_then_fail_at"] = {"nth": nth}
    json.dump(s, open(h.state, "w"))


def _set_nth_put_fault(h, nth, code):
    """Let nth-1 PutSecretValue calls through, fail the nth once (counted by fake_aws.py)."""
    s = json.load(open(h.state))
    s["faults"] = {}
    s["put_fail_at"] = {"nth": nth, "code": code}
    json.dump(s, open(h.state, "w"))


if __name__ == "__main__":
    warnings.simplefilter("ignore", ResourceWarning)
    unittest.main(verbosity=2)
