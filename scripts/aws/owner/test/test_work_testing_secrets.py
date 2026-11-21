#!/usr/bin/env python3
"""Offline tests of scripts/aws/owner/work-testing-secrets.sh. No AWS call, no network.

Same harness as test_docs_testing_secrets.py (the fake CLI fake_aws.py, the two test-only
substitutions `AWS = find_cli()` and the body of `ask()`), with the two Work bundles.

    python3 scripts/aws/owner/test/test_work_testing_secrets.py
"""
import fcntl, glob, json, os, re, shutil, subprocess, sys, unittest, warnings
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_docs_testing_secrets as base  # noqa: E402

SCRIPT = os.path.join(HERE, "..", "work-testing-secrets.sh")
API, MIG = "munaxa-nonprod/work-api", "munaxa-nonprod/work-migrate"
HOST = base.HOST
URL = re.compile(r"postgresql://(work_app|work_owner):[0-9a-f]{64}@" + re.escape(HOST) + r":5432/work\?sslmode=require")
CONTROL = "mxc_0b6f7c1e-2f43-4e7a-9d0c-1a2b3c4d5e6f_FAKEVALUEcontrolSecret0123456789abcdefABCD"
CONTROL2 = "mxc_1c7a8d2f-3a54-4f8b-8e1d-2b3c4d5e6f70_FAKEVALUEsecondSecret0123456789abcdefABCD"
PLACEHOLDER = re.compile(r"pending-control-credential-[0-9a-f]{64}")
API_KEYS = ["DATABASE_URL", "PII_MATCH_SECRET", "CONTROL_PLANE_TOKEN"]


class WorkHarness(base.Harness):
    def __init__(self):
        saved = base.SCRIPT
        base.SCRIPT = SCRIPT
        try:
            super().__init__()
        finally:
            base.SCRIPT = saved

    def reset(self, account="229251310592"):
        secrets = {n: {"arn": f"arn:aws:secretsmanager:eu-central-1:229251310592:secret:{n}-{s}", "kms": base.KMS, "versions": []}
                   for n, s in ((API, "Wk12Ab"), (MIG, "Wk34Cd"))}
        json.dump({"account": account, "db_host": HOST, "secrets": secrets, "faults": {}}, open(self.state, "w"))
        if os.path.exists(self.state + ".ops"):
            os.remove(self.state + ".ops")

    def run(self, *args, answers=()):
        with open(self.answers, "w") as f:
            f.write("\n".join(answers))
        before = set(glob.glob("/tmp/work-secrets-cli-*"))
        env = {"PATH": "/usr/bin:/bin", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI": "/fake-credentials"}
        p = subprocess.run(["/bin/bash", "-p", self.script, *args], env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=120)
        left = set(glob.glob("/tmp/work-secrets-cli-*")) - before
        assert not left, "CLI temporary home left behind"
        return p.returncode, p.stdout.decode()


class WorkTestingSecretsTest(unittest.TestCase):
    def setUp(self):
        self.h = WorkHarness()

    def tearDown(self):
        shutil.rmtree(self.h.dir, ignore_errors=True)

    def assertClean(self, out):
        self.assertNotIn("FAKEVALUE", out)
        for v in self.h.all_values():
            if len(v) >= 16:
                self.assertNotIn(v, out)
        self.assertFalse(any(o["leak"] for o in self.h.ops()), "a value reached a CLI argument or environment")
        self.assertNotIn("Traceback", out)

    def writes(self):
        return [o for o in self.h.ops() if o["op"] in ("put-secret-value", "create-secret", "delete-secret")]

    def fill(self, token=CONTROL):
        rc, out = self.h.run("bundles", answers=["FILL", token])
        self.assertEqual(rc, 0, out)
        return out

    # ---- bundles ------------------------------------------------------------------------------
    def test_fill_writes_two_bundles_db_bootstrap_and_work_accept(self):
        out = self.fill()
        self.assertIn("BUNDLES VERIFIED", out)
        api, mig = self.h.current(API), self.h.current(MIG)
        self.assertEqual(sorted(api), sorted(API_KEYS))
        self.assertEqual(list(mig), ["DATABASE_MIGRATION_URL"])
        self.assertRegex(api["DATABASE_URL"], URL)
        self.assertRegex(mig["DATABASE_MIGRATION_URL"], URL)
        app, owner = urlsplit(api["DATABASE_URL"]), urlsplit(mig["DATABASE_MIGRATION_URL"])
        self.assertEqual((app.username, app.hostname, app.port, app.path, app.query),
                         ("work_app", HOST, 5432, "/work", "sslmode=require"))
        self.assertEqual((owner.username, owner.path), ("work_owner", "/work"))
        self.assertNotEqual(app.password, owner.password)
        self.assertNotIn(owner.password, json.dumps(api))
        # Work: PII_MATCH_SECRET at least 32 characters and never the development default.
        self.assertRegex(api["PII_MATCH_SECRET"], r"^[A-Za-z0-9_-]{64}$")
        self.assertNotEqual(api["PII_MATCH_SECRET"], "development-only-people-match-secret-change-me")
        self.assertEqual(api["CONTROL_PLANE_TOKEN"], CONTROL)
        self.assertEqual([o["req_keys"] for o in self.writes()], [["ClientRequestToken", "SecretId", "SecretString"]] * 2)
        self.assertEqual([o["op"] for o in self.h.ops() if o["op"] == "get-secret-value"], ["get-secret-value"] * 2)
        vids = {v["id"] for n in (API, MIG) for v in self.h.secrets()[n]["versions"]}
        for name in ("work-migrate", "work-api"):
            m = re.search(rf"version_id      {name} ([0-9a-f-]{{36}})", out)
            self.assertIsNotNone(m, out)
            self.assertIn(m.group(1), vids)
        self.assertIn("control_token   mxc", out)
        self.assertClean(out)

    def test_writes_migrate_before_api(self):
        out = self.fill()
        order = [line.split()[1] for line in out.splitlines() if line.startswith("writing")]
        self.assertEqual(order, [MIG, API])

    def test_empty_token_answer_stores_a_marked_placeholder(self):
        out = self.fill(token="")
        tok = self.h.current(API)["CONTROL_PLANE_TOKEN"]
        self.assertRegex(tok, PLACEHOLDER)
        self.assertGreaterEqual(len(tok), 20)  # Work refuses a token under 20 characters
        self.assertIn("control_token   placeholder", out)
        self.assertIn("replace-key CONTROL_PLANE_TOKEN", out)
        self.assertClean(out)

    def test_two_fills_generate_different_credentials(self):
        self.fill()
        first = self.h.current(API), self.h.current(MIG)
        self.h.reset()
        self.fill()
        second = self.h.current(API), self.h.current(MIG)
        self.assertNotEqual(first[0]["DATABASE_URL"], second[0]["DATABASE_URL"])
        self.assertNotEqual(first[0]["PII_MATCH_SECRET"], second[0]["PII_MATCH_SECRET"])
        self.assertNotEqual(first[1]["DATABASE_MIGRATION_URL"], second[1]["DATABASE_MIGRATION_URL"])

    def test_rerun_after_success_writes_nothing_and_verifies(self):
        self.fill()
        n = len(self.writes())
        rc, out = self.h.run("bundles", answers=[])
        self.assertEqual(rc, 0, out)
        self.assertIn("already_done", out)
        self.assertIn("BUNDLES VERIFIED", out)
        self.assertEqual(len(self.writes()), n)
        self.assertClean(out)

    def test_not_confirmed_writes_nothing(self):
        rc, out = self.h.run("bundles", answers=["fill", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT NOT_CONFIRMED", out)
        self.assertIn("NOTHING WRITTEN BY THIS STEP", out)
        self.assertEqual(self.writes(), [])
        self.assertClean(out)

    def test_no_terminal_for_the_token_writes_nothing(self):
        rc, out = self.h.run("bundles", answers=["FILL"])  # no line left for the hidden token prompt
        self.assertEqual(rc, 1)
        self.assertIn("ABORT NO_TERMINAL", out)
        self.assertIn("NOTHING WRITTEN BY THIS STEP", out)
        self.assertEqual(self.writes(), [])

    def test_malformed_token_writes_nothing(self):
        for bad in ("FAKEVALUE-not-an-mxc-token-0123456789abcdef",
                    "mxc_not-a-uuid_FAKEVALUEcontrolSecret0123456789abcdefABCD",
                    "mxc_0b6f7c1e-2f43-4e7a-9d0c-1a2b3c4d5e6f_FAKEVALUEshort",
                    "mxc_0b6f7c1e-2f43-4e7a-9d0c-1a2b3c4d5e6f_FAKEVALUE has spaces 0123456789abcdef"):
            rc, out = self.h.run("bundles", answers=["FILL", bad])
            self.assertEqual(rc, 1, bad)
            self.assertIn("ABORT CONTROL_TOKEN_FORMAT", out)
            self.assertNotIn("FAKEVALUE", out)
        self.assertEqual(self.writes(), [])
        self.assertIsNone(self.h.current(API))

    def test_wrong_account_stops_before_any_secret_call(self):
        self.h.reset(account="111111111111")
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT WRONG_ACCOUNT", out)
        self.assertEqual([o["service"] for o in self.h.ops()], ["sts"])

    def test_wrong_kms_key_is_refused(self):
        s = json.load(open(self.h.state))
        s["secrets"][API]["kms"] = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-4000-8000-000000000000"
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT SECRET_KMS_KEY_MISMATCH munaxa-nonprod/work-api", out)
        self.assertEqual(self.writes(), [])

    def test_missing_bundle_is_refused(self):
        s = json.load(open(self.h.state))
        del s["secrets"][MIG]
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT SECRET_MISSING munaxa-nonprod/work-migrate", out)
        self.assertEqual(self.writes(), [])

    def test_partial_fill_resumes_and_keeps_the_owner_url(self):
        base._set_nth_put_fault(self.h, nth=2, code="InternalServiceError")
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT AWS_ERROR put-secret-value InternalServiceError", out)
        self.assertIn("ABORT WRITTEN_EARLIER_IN_THIS_RUN work-migrate", out)
        self.assertIn("AFTER_WRITE_ATTEMPT", out)
        self.assertNotIn("NOTHING WRITTEN", out)
        owner = self.h.current(MIG)["DATABASE_MIGRATION_URL"]
        self.assertIsNone(self.h.current(API))
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.h.current(MIG)["DATABASE_MIGRATION_URL"], owner)
        self.assertEqual(len(self.h.secrets()[MIG]["versions"]), 1)
        self.assertClean(out)

    def test_write_stored_but_cli_error_resumes_without_a_second_version(self):
        base._set_nth_store_then_fail(self.h, nth=2)
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT AWS_ERROR put-secret-value RequestTimeout", out)
        self.assertIn("ABORT AFTER_WRITE_ATTEMPT", out)
        self.assertIsNotNone(self.h.current(API))
        rc, out = self.h.run("bundles", answers=[])
        self.assertEqual(rc, 0, out)
        self.assertIn("already_done", out)
        for name in (MIG, API):
            self.assertEqual(len(self.h.secrets()[name]["versions"]), 1, name)
        self.assertClean(out)

    def test_api_before_migrate_is_refused(self):
        s = json.load(open(self.h.state))
        s["secrets"][API]["versions"] = [{"id": "11111111-1111-4111-8111-111111111111",
                                          "string": json.dumps({"DATABASE_URL": "postgresql://x"}), "stages": ["AWSCURRENT"]}]
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT UNEXPECTED_FILL_ORDER", out)
        self.assertEqual(self.writes(), [])

    def test_existing_api_bundle_with_wrong_shape_is_refused(self):
        self.fill()
        s = json.load(open(self.h.state))
        cur = json.loads(s["secrets"][API]["versions"][0]["string"])
        cur["PII_MATCH_SECRET"] = "development-only-people-match-secret-change-me"
        s["secrets"][API]["versions"][0]["string"] = json.dumps(cur)
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("bundles", answers=[])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT API_BUNDLE_CHECK_FAILED PII_MATCH_SECRET", out)
        self.assertNotIn("development-only", out)

    def test_bundle_with_two_versions_is_refused(self):
        self.fill(token="")
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 0, out)
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 1)
        self.assertIn("A_BUNDLE_ALREADY_HAS_SEVERAL_VERSIONS", out)

    # ---- replace-key ---------------------------------------------------------------------------
    def test_replace_token_after_placeholder_changes_only_that_key(self):
        self.fill(token="")
        before = self.h.current(API)
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 0, out)
        after = self.h.current(API)
        self.assertEqual(after["CONTROL_PLANE_TOKEN"], CONTROL)
        self.assertEqual({k: v for k, v in after.items() if k != "CONTROL_PLANE_TOKEN"},
                         {k: v for k, v in before.items() if k != "CONTROL_PLANE_TOKEN"})
        self.assertEqual([v["stages"] for v in self.h.secrets()[API]["versions"]], [["AWSPREVIOUS"], ["AWSCURRENT"]])
        self.assertEqual(len(self.h.secrets()[MIG]["versions"]), 1)
        self.assertIn("REPLACED VERIFIED", out)
        cur = [v["id"] for v in self.h.secrets()[API]["versions"] if "AWSCURRENT" in v["stages"]][0]
        self.assertIn(f"version_id      work-api {cur}", out)
        self.assertClean(out)

    def test_second_replace_moves_awsprevious(self):
        self.fill(token="")
        self.assertEqual(self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])[0], 0)
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL2])
        self.assertEqual(rc, 0, out)
        self.assertEqual([v["stages"] for v in self.h.secrets()[API]["versions"]], [[], ["AWSPREVIOUS"], ["AWSCURRENT"]])
        self.assertEqual(self.h.current(API)["CONTROL_PLANE_TOKEN"], CONTROL2)
        self.assertClean(out)

    def test_replace_with_the_same_token_writes_nothing(self):
        self.fill()
        n = len(self.writes())
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT SAME_VALUE", out)
        self.assertEqual(len(self.writes()), n)
        self.assertClean(out)

    def test_replace_with_a_malformed_or_empty_token_writes_nothing(self):
        self.fill(token="")
        n = len(self.writes())
        for bad in ("FAKEVALUE-not-mxc-0123456789abcdef0123", ""):
            rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", bad])
            self.assertEqual(rc, 1)
            self.assertIn("ABORT CONTROL_TOKEN_FORMAT", out)
            self.assertNotIn("FAKEVALUE", out)
        self.assertEqual(len(self.writes()), n)

    def test_replace_not_confirmed_writes_nothing(self):
        self.fill(token="")
        n = len(self.writes())
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["replace", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT NOT_CONFIRMED", out)
        self.assertEqual(len(self.writes()), n)

    def test_replace_before_fill_is_refused(self):
        rc, out = self.h.run("replace-key", "CONTROL_PLANE_TOKEN", answers=["REPLACE", CONTROL])
        self.assertEqual(rc, 1)
        self.assertIn("BUNDLES_NOT_FILLED", out)
        self.assertEqual(self.writes(), [])

    # ---- status, usage, process hygiene ----------------------------------------------------------
    def test_status_prints_no_value(self):
        self.fill(token="")
        rc, out = self.h.run("status")
        self.assertEqual(rc, 0, out)
        self.assertIn("STATUS OK", out)
        self.assertIn("control_token   placeholder", out)
        self.assertEqual(len(self.writes()), 2)
        self.assertClean(out)

    def test_status_on_empty_bundles_reads_no_value(self):
        rc, out = self.h.run("status")
        self.assertEqual(rc, 0, out)
        self.assertIn("bundle          munaxa-nonprod/work-api: empty", out)
        self.assertEqual([o for o in self.h.ops() if o["op"] == "get-secret-value"], [])

    def test_other_modes_and_keys_are_refused(self):
        for args in (["replace-key", "PII_MATCH_SECRET"], ["replace-key", "DATABASE_URL"], ["replace-key"],
                     ["replace-key", "CONTROL_PLANE_TOKEN", "extra"], ["provision-create"], ["bundles", "extra"],
                     ["status", "x"], []):
            rc, out = self.h.run(*args)
            self.assertEqual(rc, 2, args)
            self.assertIn("ABORT USAGE", out)
        self.assertEqual(self.h.ops(), [])

    def test_sourcing_is_refused(self):
        p = subprocess.run(["/bin/bash", "-c", f"source {self.h.script} status; echo rc=$?"],
                           env={"PATH": "/usr/bin:/bin"}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        out = p.stdout.decode()
        self.assertIn("ABORT SOURCED", out)
        self.assertIn("rc=1", out)
        self.assertEqual(self.h.ops(), [])

    def test_missing_cloudshell_credentials_stops_before_any_aws_call(self):
        with open(self.h.answers, "w") as f:
            f.write("")
        p = subprocess.run(["/bin/bash", "-p", self.h.script, "status"], env={"PATH": "/usr/bin:/bin"},
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        self.assertEqual(p.returncode, 1)
        self.assertIn("ABORT CLOUDSHELL_CREDENTIALS_MISSING", p.stdout.decode())
        self.assertEqual(self.h.ops(), [])

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

    def test_second_run_while_one_holds_the_lock_stops_before_any_aws_call(self):
        fd = os.open("/tmp/work-testing-secrets.lock", os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            rc, out = self.h.run("bundles", answers=["FILL", CONTROL])
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


if __name__ == "__main__":
    warnings.simplefilter("ignore", ResourceWarning)
    unittest.main(verbosity=2)
