#!/usr/bin/env python3
"""Offline tests: every owner custody script accepts only root or an IAM Identity Center
MunaxaEngineering session, refuses every other caller before any secret call, and never prints
the Identity Center session name. No AWS call, no network.

    python3 scripts/aws/owner/test/test_caller_identity.py
"""
import json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_docs_testing_secrets as docs  # noqa: E402
import test_control_testing_secrets as control  # noqa: E402
import test_work_testing_secrets as work  # noqa: E402

ACCOUNT = "229251310592"
ENGINEERING = f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789abcdef/operator.name@example.org"
REFUSED = [
    f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaReadOnly_0123456789abcdef/operator",
    f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaAdministrator_0123456789abcdef/operator",
    f"arn:aws:sts::{ACCOUNT}:assumed-role/munaxa-shared-deployer-nonprod-session/GitHubActions",
    f"arn:aws:iam::{ACCOUNT}:user/someone",
    f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789abcdef_x/operator",
    f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789ABCDEF/operator",
    f"arn:aws:sts::111111111111:assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789abcdef/operator",
]
HARNESSES = [("docs", docs.Harness), ("control", control.ControlHarness), ("work", work.WorkHarness)]


def set_caller(h, arn):
    s = json.load(open(h.state))
    s["caller_arn"] = arn
    json.dump(s, open(h.state, "w"))


class CallerIdentity(unittest.TestCase):
    def test_engineering_session_is_accepted_and_its_name_is_not_printed(self):
        for name, cls in HARNESSES:
            with self.subTest(script=name):
                h = cls()
                set_caller(h, ENGINEERING)
                rc, out = h.run("status")
                self.assertEqual(rc, 0, out)
                self.assertIn("STATUS OK", out)
                self.assertIn("assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789abcdef/<session name not shown>", out)
                self.assertNotIn("operator.name", out)
                self.assertNotIn("example.org", out)

    def test_root_is_still_accepted(self):
        for name, cls in HARNESSES:
            with self.subTest(script=name):
                h = cls()
                rc, out = h.run("status")
                self.assertEqual(rc, 0, out)
                self.assertIn(f"caller          arn:aws:iam::{ACCOUNT}:root", out)

    def test_every_other_caller_stops_before_any_secret_call(self):
        for name, cls in HARNESSES:
            h = cls()
            for arn in REFUSED:
                with self.subTest(script=name, arn=arn):
                    h.reset()
                    set_caller(h, arn)
                    rc, out = h.run("status")
                    self.assertEqual(rc, 1, out)
                    self.assertIn("ABORT CALLER_NOT_ALLOWED", out)
                    self.assertIn("NOTHING WRITTEN BY THIS STEP", out)
                    self.assertEqual([o["service"] for o in h.ops()], ["sts"])
                    self.assertNotIn("operator", out.replace("operator_", ""))


if __name__ == "__main__":
    unittest.main()
