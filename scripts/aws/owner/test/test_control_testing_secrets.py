#!/usr/bin/env python3
"""Offline tests of scripts/aws/owner/control-testing-secrets.sh. No AWS call, no network.

Same harness as test_docs_testing_secrets.py (the fake CLI fake_aws.py, the two test-only
substitutions `AWS = find_cli()` and the body of `ask()`), with the two Control bundles.

    python3 scripts/aws/owner/test/test_control_testing_secrets.py
"""
import json, os, re, shutil, subprocess, sys, unittest, warnings
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_docs_testing_secrets as base  # noqa: E402

SCRIPT = os.path.join(HERE, "..", "control-testing-secrets.sh")
API, MIG = "munaxa-nonprod/control-api", "munaxa-nonprod/control-migrate"
HOST = base.HOST
URL = re.compile(r"postgresql://(control_app|control_owner):[0-9a-f]{64}@" + re.escape(HOST) + r":5432/control\?sslmode=require")


class ControlHarness(base.Harness):
    def __init__(self):
        saved = base.SCRIPT
        base.SCRIPT = SCRIPT
        try:
            super().__init__()
        finally:
            base.SCRIPT = saved

    def reset(self, account="229251310592"):
        secrets = {n: {"arn": f"arn:aws:secretsmanager:eu-central-1:229251310592:secret:{n}-{s}", "kms": base.KMS, "versions": []}
                   for n, s in ((API, "Ab12Cd"), (MIG, "Ef34Gh"))}
        json.dump({"account": account, "db_host": HOST, "secrets": secrets, "faults": {}}, open(self.state, "w"))
        if os.path.exists(self.state + ".ops"):
            os.remove(self.state + ".ops")

    def run(self, *args, answers=()):
        with open(self.answers, "w") as f:
            f.write("\n".join(answers))
        env = {"PATH": "/usr/bin:/bin", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI": "/fake-credentials"}
        p = subprocess.run(["/bin/bash", "-p", self.script, *args], env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=120)
        return p.returncode, p.stdout.decode()


class ControlTestingSecretsTest(unittest.TestCase):
    def setUp(self):
        self.h = ControlHarness()

    def tearDown(self):
        shutil.rmtree(self.h.dir, ignore_errors=True)

    def assertClean(self, out):
        for v in self.h.all_values():
            self.assertNotIn(v, out)
        self.assertFalse(any(o["leak"] for o in self.h.ops()), "a value reached a CLI argument or environment")
        self.assertNotIn("Traceback", out)

    def writes(self):
        return [o for o in self.h.ops() if o["op"] in ("put-secret-value", "create-secret", "delete-secret")]

    def test_fill_writes_two_urls_db_bootstrap_accepts(self):
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 0, out)
        self.assertIn("BUNDLES VERIFIED", out)
        api, mig = self.h.current(API)["DATABASE_URL"], self.h.current(MIG)["DATABASE_MIGRATION_URL"]
        self.assertRegex(api, URL)
        self.assertRegex(mig, URL)
        self.assertEqual(urlsplit(api).username, "control_app")
        self.assertEqual(urlsplit(mig).username, "control_owner")
        self.assertNotEqual(urlsplit(api).password, urlsplit(mig).password)
        self.assertEqual([o["req_keys"] for o in self.writes()], [["ClientRequestToken", "SecretId", "SecretString"]] * 2)
        self.assertEqual([o["op"] for o in self.h.ops() if o["op"] == "get-secret-value"], ["get-secret-value"] * 2)
        self.assertClean(out)

    def test_rerun_writes_nothing(self):
        self.h.run("bundles", answers=["FILL"])
        n = len(self.writes())
        rc, out = self.h.run("bundles", answers=[])
        self.assertEqual(rc, 0, out)
        self.assertIn("already_done", out)
        self.assertEqual(len(self.writes()), n)
        self.assertClean(out)

    def test_not_confirmed_writes_nothing(self):
        rc, out = self.h.run("bundles", answers=["fill"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT NOT_CONFIRMED", out)
        self.assertIn("NOTHING WRITTEN BY THIS STEP", out)
        self.assertEqual(self.writes(), [])

    def test_partial_fill_resumes_and_keeps_the_owner_url(self):
        base._set_nth_put_fault(self.h, nth=2, code="InternalServiceError")
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT WRITTEN_EARLIER_IN_THIS_RUN control-migrate", out)
        owner = self.h.current(MIG)["DATABASE_MIGRATION_URL"]
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.h.current(MIG)["DATABASE_MIGRATION_URL"], owner)
        self.assertEqual(len(self.h.secrets()[MIG]["versions"]), 1)
        self.assertClean(out)

    def test_api_before_migrate_is_refused(self):
        s = json.load(open(self.h.state))
        s["secrets"][API]["versions"] = [{"id": "11111111-1111-4111-8111-111111111111",
                                          "string": json.dumps({"DATABASE_URL": "postgresql://x"}), "stages": ["AWSCURRENT"]}]
        json.dump(s, open(self.h.state, "w"))
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT UNEXPECTED_FILL_ORDER", out)
        self.assertEqual(self.writes(), [])

    def test_wrong_account_stops_before_any_secret_call(self):
        self.h.reset(account="111111111111")
        rc, out = self.h.run("bundles", answers=["FILL"])
        self.assertEqual(rc, 1)
        self.assertIn("ABORT WRONG_ACCOUNT", out)
        self.assertEqual([o["service"] for o in self.h.ops()], ["sts"])

    def test_status_reads_no_value(self):
        self.h.run("bundles", answers=["FILL"])
        before = len([o for o in self.h.ops() if o["op"] == "get-secret-value"])
        rc, out = self.h.run("status")
        self.assertEqual(rc, 0, out)
        self.assertIn("STATUS OK", out)
        self.assertEqual(len([o for o in self.h.ops() if o["op"] == "get-secret-value"]), before)
        self.assertClean(out)

    def test_other_modes_are_refused(self):
        for args in (["replace-key", "CONTROL_PLANE_TOKEN"], ["provision-create"], ["bundles", "extra"], []):
            rc, out = self.h.run(*args)
            self.assertEqual(rc, 2, args)
            self.assertIn("ABORT USAGE", out)
        self.assertEqual(self.h.ops(), [])


if __name__ == "__main__":
    warnings.simplefilter("ignore", ResourceWarning)
    unittest.main(verbosity=2)
