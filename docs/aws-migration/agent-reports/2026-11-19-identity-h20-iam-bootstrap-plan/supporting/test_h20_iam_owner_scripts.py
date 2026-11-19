"""Offline tests of the H-20 IAM owner CloudShell scripts (plan and apply), against stubs.

Stubs: aws, terraform (installed by a stub unzip), curl (copies the real Terraform 1.16.5 zip, whose
HashiCorp SHA-256 the scripts check), and git (clones a local checkout instead of GitHub). Real: bash,
jq, sha256sum, git itself, and the scripts unchanged. The fixture holds the live policies read on
19 Nov 2026 (read-only, AWS connector) and the session-read policy rendered offline from main 0f06836
by the real aws provider 6.67.0 (aws_iam_policy_document is computed locally).

Needs: TF_ZIP (path to terraform_1.16.5_linux_amd64.zip) and REPO (a local munaxa-platform clone whose
branch main is 0f06836 or later). Run: TF_ZIP=... REPO=... python3 -m pytest -q test_h20_iam_owner_scripts.py
"""
import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(HERE, "h20-iam-plan-owner-cloudshell.sh")
APPLY = os.path.join(HERE, "h20-iam-apply-owner-cloudshell.sh")
PIN = "0f06836c06b2c76ab62699489e67e040a867b360"
FX = json.load(open(os.path.join(HERE, "fixture-policies.json")))
ADDR = 'aws_iam_policy.deployer_session_read["nonprod"]'
ARNS = {
    "munaxa-shared-workload-boundary": "boundary",
    "bootstrap/munaxa-shared-deployer-nonprod-session-read": "session_read",
    "bootstrap/munaxa-shared-deployer-nonprod-session-cleanup": "cleanup",
}

AWS = r'''#!/usr/bin/env bash
# stub aws: answers from $FAKE/state.json; logs every call to $FAKE/aws.log
echo "$*" >> "$FAKE/aws.log"
st=$FAKE/state.json
case "$1 $2" in
  "sts get-caller-identity") jq -c '.caller' "$st";;
  "s3api head-object")
    if [[ "$*" == *tflock* ]]; then
      if [ "$(jq -r .lock "$st")" = present ]; then echo '{}'; exit 0; fi
      echo "An error occurred (404) when calling the HeadObject operation: Not Found" >&2; exit 254
    fi
    echo "2026-11-18T13:36:56+00:00 712iNPl3 aws:kms";;
  "iam get-policy")
    echo v1;;
  "iam get-policy-version")
    arn=$(sed -E 's/.*--policy-arn ([^ ]+).*/\1/' <<<"$*"); key=${arn#*policy/munaxa-shared/}
    jq -c --arg k "$key" '.policies[$k]' "$st";;
  "iam list-policy-versions") echo 3;;
  *) echo "stub aws: unexpected $*" >&2; exit 99;;
esac
'''

TERRAFORM = r'''#!/usr/bin/env bash
# stub terraform; logs every call to $FAKE/tf.log
echo "$*" >> "$FAKE/tf.log"
st=$FAKE/state.json
case "$1" in
  version) echo "Terraform v1.16.5";;
  init) mkdir -p "$TF_DATA_DIR"; jq -c '.backend' "$st" > "$TF_DATA_DIR/terraform.tfstate"; echo "Terraform has been successfully initialized!";;
  test) echo "Success! 20 passed, 0 failed.";;
  state) for i in $(seq 1 "$(jq -r .resources "$st")"); do echo "aws_thing.r$i"; done; echo data.aws_x.y;;
  plan)
    if [[ "$*" == *-detailed-exitcode* ]]; then jq -r '.post_plan_text' "$st"; exit "$(jq -r .post_plan_exit "$st")"; fi
    out=$(sed -E 's/.*-out=([^ ]+).*/\1/' <<<"$*"); echo "saved plan" > "$out"; jq -r '.plan_text' "$st";;
  show) jq -c '.plan' "$st";;
  apply) jq -r '.apply_text' "$st"; jq '.policies["bootstrap/munaxa-shared-deployer-nonprod-session-read"] = .after_policy' "$st" > "$st.new" && mv "$st.new" "$st";;
  *) echo "stub terraform: unexpected $*" >&2; exit 99;;
esac
'''


def plan_json(before, after, extra=None, drift=0, attrs=None):
    rc = [{"address": ADDR, "change": {"actions": ["update"],
           "before": {"policy": json.dumps(before), "name": "n", "arn": "a"},
           "after": {"policy": json.dumps(after), "name": "n", "arn": "a"}, "after_unknown": attrs or {}}}]
    rc += [{"address": "aws_iam_role.r%d" % i, "change": {"actions": ["no-op"], "before": {}, "after": {}, "after_unknown": {}}} for i in range(69)]
    rc += extra or []
    return {"terraform_version": "1.16.5", "resource_changes": rc, "resource_drift": [{}] * drift}


class Scripts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zip = os.environ.get("TF_ZIP")
        cls.repo = os.environ.get("REPO")
        if not cls.zip or not cls.repo:
            raise unittest.SkipTest("TF_ZIP and REPO are needed")

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.home = os.path.join(self.d, "home"); os.makedirs(self.home)
        self.fake = os.path.join(self.d, "fake"); os.makedirs(self.fake)
        self.bin = os.path.join(self.d, "bin"); os.makedirs(self.bin)
        real_git = shutil.which("git")
        stubs = {
            "aws": AWS,
            "curl": '#!/usr/bin/env bash\ncp "%s" ./terraform_1.16.5_linux_amd64.zip\n' % self.zip,
            "unzip": '#!/usr/bin/env bash\ncp "$FAKE/terraform" ./terraform && chmod +x ./terraform\n',
            "git": '#!/usr/bin/env bash\nif [ "$1" = clone ]; then exec "%s" clone -q "%s" munaxa-platform; fi\nexec "%s" "$@"\n' % (real_git, self.repo, real_git),
        }
        for n, body in stubs.items():
            p = os.path.join(self.bin, n); open(p, "w").write(body); os.chmod(p, 0o755)
        open(os.path.join(self.fake, "terraform"), "w").write(TERRAFORM)
        self.state = {
            "caller": {"Account": "229251310592", "Arn": "arn:aws:iam::229251310592:root"},
            "lock": "absent", "resources": 70,
            "backend": {"backend": {"type": "s3", "config": {"bucket": "munaxa-shared-tfstate-229251310592", "key": "bootstrap/terraform.tfstate", "region": "eu-central-1"}}},
            "policies": {k: FX[v if v != "session_read" else "session_read_before"] for k, v in ARNS.items()},
            "after_policy": FX["session_read_after"],
            "plan_text": "Plan: 0 to add, 1 to change, 0 to destroy.",
            "plan": plan_json(FX["session_read_before"], FX["session_read_after"]),
            "apply_text": "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.",
            "post_plan_text": "No changes. Your infrastructure matches the configuration.", "post_plan_exit": 0,
        }

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def run_script(self, script, *args):
        json.dump(self.state, open(os.path.join(self.fake, "state.json"), "w"))
        env = {"PATH": self.bin + ":/usr/bin:/bin", "HOME": self.home, "FAKE": self.fake, "AWS_REGION": "eu-central-1"}
        p = subprocess.run(["bash", script, *args], env=env, capture_output=True, text=True, timeout=300)
        return p.returncode, p.stdout + p.stderr

    def plan_ok(self):
        rc, out = self.run_script(PLAN, PIN)
        self.assertEqual(rc, 0, out[-3000:])
        self.assertIn("H-20 IAM PLAN VERIFIED, NOT APPLIED", out)
        return out

    # --- plan script ---
    def test_plan_happy_path(self):
        out = self.plan_ok()
        self.assertIn("+ GateSessionCleanup Allow states:DescribeExecution,states:ListExecutions", out)
        self.assertIn("OK   policy 1798 characters", out)
        s = json.load(open(os.path.join(self.home, "munaxa-h20-iam", "h20-iam-plan-summary.json")))
        self.assertEqual(s["changes"], [{"address": ADDR, "actions": ["update"]}])
        self.assertEqual(s["counts"], {"no-op": 69, "update": 1})
        self.assertFalse(os.path.exists(os.path.join(self.home, "munaxa-h20-iam", "h20-iam.plan.json")))
        tf = open(os.path.join(self.fake, "tf.log")).read()
        self.assertNotIn("apply", tf)
        self.assertIn("-var testing_session_cleanup=true", tf)
        aws = open(os.path.join(self.fake, "aws.log")).read()
        for w in ("put-", "create-", "delete-", "update-", "secretsmanager", "set-default"):
            self.assertNotIn(w, aws)

    def test_plan_refuses_other_pin(self):
        rc, out = self.run_script(PLAN, "a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd")
        self.assertNotEqual(rc, 0); self.assertIn("STOP: PIN must be the reviewed main commit", out)

    def test_plan_refuses_wrong_account(self):
        self.state["caller"]["Account"] = "111111111111"
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: account is 111111111111", out)

    def test_plan_refuses_lock(self):
        self.state["lock"] = "present"
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: bootstrap state lock exists", out)

    def test_plan_refuses_other_backend(self):
        self.state["backend"]["backend"]["config"]["key"] = "other/terraform.tfstate"
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: the initialised backend", out)

    def test_plan_refuses_live_drift(self):
        self.state["policies"]["bootstrap/munaxa-shared-deployer-nonprod-session-read"] = FX["session_read_after"]
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("differs from the D-B2R code (drift)", out)

    def test_plan_refuses_other_summary(self):
        self.state["plan_text"] = "Plan: 0 to add, 2 to change, 0 to destroy."
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: summary is not 0 to add, 1 to change", out)

    def test_plan_refuses_extra_resource(self):
        self.state["plan"] = plan_json(FX["session_read_before"], FX["session_read_after"],
                                       extra=[{"address": 'aws_iam_policy.deployer_session_read["prod"]', "change": {"actions": ["update"], "before": {}, "after": {}, "after_unknown": {}}}])
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: address or action differs", out)

    def test_plan_refuses_replace(self):
        p = self.state["plan"]; p["resource_changes"][0]["change"]["actions"] = ["delete", "create"]
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: address or action differs", out)

    def test_plan_refuses_drift_in_json(self):
        self.state["plan"] = plan_json(FX["session_read_before"], FX["session_read_after"], drift=1)
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: the plan JSON lists resource drift", out)

    def test_plan_refuses_other_attribute(self):
        self.state["plan"]["resource_changes"][0]["change"]["after"]["name"] = "renamed"
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("STOP: attributes other than policy change", out)

    def test_plan_refuses_wider_statement(self):
        wide = json.loads(json.dumps(FX["session_read_after"]))
        for s in wide["Statement"]:
            if s["Sid"] == "GateSessionCleanup":
                s["Resource"] = "*"
        self.state["plan"] = plan_json(FX["session_read_before"], wide)
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("after differs from the reviewed code", out)

    def test_plan_refuses_extra_action(self):
        more = json.loads(json.dumps(FX["session_read_after"]))
        for s in more["Statement"]:
            if s["Sid"] == "GateSessionCleanup":
                s["Action"].append("states:StopExecution")
        self.state["plan"] = plan_json(FX["session_read_before"], more)
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("after differs from the reviewed code", out)

    def test_plan_refuses_wrong_state_count(self):
        self.state["resources"] = 71
        rc, out = self.run_script(PLAN, PIN); self.assertNotEqual(rc, 0); self.assertIn("expected 70", out)

    # --- apply script ---
    def plan_sha(self):
        out = self.plan_ok()
        for line in out.splitlines():
            if line.endswith("  h20-iam.tfplan"):
                return line.split()[0]
        self.fail("no plan SHA-256 in the log")

    def test_apply_happy_path(self):
        sha = self.plan_sha()
        rc, out = self.run_script(APPLY, PIN, sha)
        self.assertEqual(rc, 0, out[-3000:])
        self.assertIn("H-20 IAM APPLIED AND VERIFIED", out)
        self.assertIn("OK   saved plan, expected policies and normalizer are the reviewed ones", out)
        tf = open(os.path.join(self.fake, "tf.log")).read()
        self.assertIn("apply -input=false -lock-timeout=60s -no-color %s/munaxa-h20-iam/h20-iam.tfplan" % self.home, tf)
        self.assertNotIn("auto-approve", tf)
        self.assertNotIn("-target", tf)
        self.assertFalse(os.path.exists(os.path.join(self.home, "munaxa-h20-iam", "h20-iam.tfplan")))

    def test_apply_refuses_other_plan_sha(self):
        self.plan_sha()
        rc, out = self.run_script(APPLY, PIN, "0" * 64)
        self.assertNotEqual(rc, 0); self.assertIn("STOP: the saved plan is not the reviewed one", out)
        self.assertNotIn("apply -input", open(os.path.join(self.fake, "tf.log")).read())

    def test_apply_refuses_without_verified_plan(self):
        os.makedirs(os.path.join(self.home, "munaxa-h20-iam"))
        rc, out = self.run_script(APPLY, PIN, "0" * 64)
        self.assertNotEqual(rc, 0); self.assertIn("does not show a verified plan", out)

    def test_apply_fails_when_post_plan_changes(self):
        sha = self.plan_sha()
        self.state["post_plan_text"] = "Plan: 0 to add, 1 to change, 0 to destroy."; self.state["post_plan_exit"] = 2
        rc, out = self.run_script(APPLY, PIN, sha)
        self.assertNotEqual(rc, 0); self.assertIn("STOP: post-apply plan exit 2", out)

    def test_apply_fails_when_live_differs(self):
        sha = self.plan_sha()
        self.state["after_policy"] = FX["session_read_before"]
        rc, out = self.run_script(APPLY, PIN, sha)
        self.assertNotEqual(rc, 0); self.assertIn("differs from the reviewed code", out)


if __name__ == "__main__":
    unittest.main()
