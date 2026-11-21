#!/usr/bin/env python3
"""Offline tests of the Docs bootstrap owner plan script (docs-bootstrap-migrate-plan-owner-cloudshell.sh).

The script is run end to end with fake `aws`, `terraform`, `curl`, `unzip` and `sha256sum -c` on
PATH and a synthetic munaxa-docs repository (the three commit/blob constants are substituted, each
exactly once, so the real constants are not needed here; test_real_constants checks them against
a real munaxa-docs checkout when MUNAXA_DOCS_DIR is set). No AWS call, no network, no real
Terraform.

    python3 scripts/aws/owner/test/test_docs_bootstrap_plan.py
"""
import copy, json, os, re, shutil, stat, subprocess, tempfile, textwrap, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(os.path.dirname(HERE), "docs-bootstrap-migrate-plan-owner-cloudshell.sh")
ACCOUNT = "229251310592"
ROOT_ARN = f"arn:aws:iam::{ACCOUNT}:root"
MIGRATE = f"arn:aws:ecr:eu-central-1:{ACCOUNT}:repository/munaxa-docs/migrate"
REPOS = [f"arn:aws:ecr:eu-central-1:{ACCOUNT}:repository/munaxa-docs/{n}" for n in ("api", "web", "worker")]
EMAILS = ["budget.alerts.one@example.org", "budget.alerts.two@example.org"]
REAL_GIT = shutil.which("git")
REAL_SHA = shutil.which("sha256sum")
CONSTANTS = {
    "REVIEWED_PIN": "f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad",
    "APPLIED": "a04723a",
    "BLOB_ECR": "a4f6f1f5d02e267f25475287b08be1d60722898b",
}

LOCK = textwrap.dedent('''\
    provider "registry.terraform.io/hashicorp/aws" {
      version     = "6.67.0"
      constraints = "6.67.0"
      hashes = [
        "h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=",
      ]
    }
    ''')
BACKEND = textwrap.dedent(f'''\
    terraform {{
      backend "s3" {{
        bucket              = "munaxa-docs-tfstate-eu-prod-{ACCOUNT}"
        key                 = "bootstrap/terraform.tfstate"
      }}
    }}
    ''')


def policy(resources):
    return json.dumps({"Version": "2012-10-17", "Statement": [
        {"Sid": "Push", "Effect": "Allow", "Action": ["ecr:PutImage"], "Resource": resources},
        {"Sid": "Token", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"}]})


def good_plan():
    rc = []
    for addr in ("aws_iam_policy.image_publisher_boundary", "aws_iam_policy.workload_boundary",
                 "aws_iam_role_policy.image_publisher"):
        rc.append({"address": addr, "change": {"actions": ["update"],
                   "before": {"name": addr, "policy": policy(REPOS), "tags": {"a": "b"}},
                   "after": {"name": addr, "policy": policy(REPOS + [MIGRATE]), "tags": {"a": "b"}},
                   "after_unknown": {}}})
    rc.append({"address": 'aws_ecr_repository.images["migrate"]', "change": {"actions": ["create"], "before": None,
               "after": {"name": "munaxa-docs/migrate", "image_tag_mutability": "IMMUTABLE",
                         "image_scanning_configuration": [{"scan_on_push": True}]}, "after_unknown": {"arn": True}}})
    rc.append({"address": 'aws_ecr_lifecycle_policy.images["migrate"]', "change": {"actions": ["create"], "before": None,
               "after": {"repository": "munaxa-docs/migrate"}, "after_unknown": {}}})
    rc.append({"address": 'aws_ecr_repository.images["api"]', "change": {"actions": ["no-op"], "before": {}, "after": {}}})
    rc.append({"address": "data.aws_iam_policy_document.x", "change": {"actions": ["read"], "before": None, "after": {}}})
    return {"format_version": "1.2", "terraform_version": "1.16.5", "resource_changes": rc}


FAKE_AWS = r'''#!/usr/bin/env python3
import json, os, sys
S = json.load(open(os.environ["FAKE_STATE"]))
with open(os.environ["FAKE_CALLS"], "a") as f:
    f.write("aws " + " ".join(sys.argv[1:]) + "\n")
a = sys.argv[1:]
def arg(n):
    return a[a.index(n) + 1] if n in a else None
if a[:2] == ["sts", "get-caller-identity"]:
    print(json.dumps({"Account": S["account"], "Arn": S["caller"], "UserId": "X"})); sys.exit(0)
if a[:2] == ["s3api", "head-object"]:
    if arg("--key").endswith(".tflock"):
        if S["lock"]:
            print(json.dumps({"ContentLength": 1})); sys.exit(0)
        print("An error occurred (404) when calling the HeadObject operation: Not Found", file=sys.stderr); sys.exit(254)
    print("2026-10-22T20:00:00+00:00\tv1"); sys.exit(0)
if a[:2] == ["budgets", "describe-notifications-for-budget"]:
    print(json.dumps({"Notifications": [{"NotificationType": "ACTUAL", "ComparisonOperator": "GREATER_THAN", "Threshold": 80},
                                        {"NotificationType": "FORECASTED", "ComparisonOperator": "GREATER_THAN", "Threshold": 100}]})); sys.exit(0)
if a[:2] == ["budgets", "describe-subscribers-for-notification"]:
    emails = S["emails"].get(arg("--budget-name"), [])
    print(json.dumps({"Subscribers": [{"SubscriptionType": "EMAIL", "Address": e} for e in emails]})); sys.exit(0)
print("fake aws: unexpected call", a, file=sys.stderr); sys.exit(99)
'''

FAKE_TF = r'''#!/usr/bin/env python3
import json, os, sys
S = json.load(open(os.environ["FAKE_STATE"]))
with open(os.environ["FAKE_CALLS"], "a") as f:
    f.write("terraform " + " ".join(sys.argv[1:]) + "\n")
a = sys.argv[1:]
if a[0] == "version":
    print("Terraform v1.16.5\non linux_amd64"); sys.exit(0)
if a[0] == "init":
    print("Terraform has been successfully initialized!"); sys.exit(0)
if a[0] == "plan":
    out = [x.split("=", 1)[1] for x in a if x.startswith("-out=")][0]
    open(out, "w").write("binary plan\n")
    print(S["plan_text"]); sys.exit(S.get("plan_exit", 0))
if a[:2] == ["show", "-json"]:
    print(json.dumps(S["plan_json"])); sys.exit(0)
print("fake terraform: refused", a, file=sys.stderr); sys.exit(98)
'''


def write_exec(path, text):
    with open(path, "w") as f:
        f.write(text)
    os.chmod(path, stat.S_IRWXU)


def git(cwd, *args):
    return subprocess.run([REAL_GIT, *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
                               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"}).stdout.strip()


class Harness:
    def __init__(self, extra_bootstrap_change=False):
        self.dir = tempfile.mkdtemp(prefix="docs-bootstrap-test-")
        self.home = os.path.join(self.dir, "home"); os.mkdir(self.home)
        self.bin = os.path.join(self.dir, "bin"); os.mkdir(self.bin)
        self.state = os.path.join(self.dir, "state.json")
        self.calls = os.path.join(self.dir, "calls.txt")
        # synthetic munaxa-docs: commit 1 = "applied", commit 2 = the pin (ecr.tf gains migrate)
        work = os.path.join(self.dir, "src"); boot = os.path.join(work, "infra/terraform/bootstrap")
        os.makedirs(boot)
        git(work, "init", "-q", "-b", "main")
        open(os.path.join(boot, "ecr.tf"), "w").write('locals { ecr_repositories = ["api", "web", "worker"] }\n')
        open(os.path.join(boot, "main.tf"), "w").write("# bootstrap\n")
        open(os.path.join(boot, ".terraform.lock.hcl"), "w").write(LOCK)
        open(os.path.join(boot, "backend.tf"), "w").write(BACKEND)
        git(work, "add", "-A"); git(work, "commit", "-q", "-m", "applied")
        applied = git(work, "rev-parse", "HEAD")
        open(os.path.join(boot, "ecr.tf"), "w").write('locals { ecr_repositories = ["api", "web", "worker", "migrate"] }\n')
        if extra_bootstrap_change:
            open(os.path.join(boot, "main.tf"), "a").write("# unexpected\n")
        git(work, "add", "-A"); git(work, "commit", "-q", "-m", "migrate")
        self.pin = git(work, "rev-parse", "HEAD")
        blob = git(work, "rev-parse", "HEAD:infra/terraform/bootstrap/ecr.tf")
        self.bare = os.path.join(self.dir, "munaxa-docs.git")
        git(self.dir, "clone", "-q", "--bare", work, self.bare)
        # the script under test, with exactly the three constants substituted
        text = open(SCRIPT).read()
        for name, new in (("REVIEWED_PIN", self.pin), ("APPLIED", applied), ("BLOB_ECR", blob)):
            old = f"{name}={CONSTANTS[name]}"
            assert text.count(old) == 1, old
            text = text.replace(old, f"{name}={new}")
        text = text.replace(CONSTANTS["REVIEWED_PIN"], self.pin)  # the usage comment
        self.script = os.path.join(self.dir, "plan.sh"); open(self.script, "w").write(text)
        write_exec(os.path.join(self.bin, "aws"), FAKE_AWS)
        self.fake_tf = os.path.join(self.dir, "terraform.fake"); write_exec(self.fake_tf, FAKE_TF)
        write_exec(os.path.join(self.bin, "curl"), '#!/bin/sh\necho "curl $*" >> "$FAKE_CALLS"\necho zip > terraform_1.16.5_linux_amd64.zip\n')
        write_exec(os.path.join(self.bin, "unzip"), f'#!/bin/sh\ncp "{self.fake_tf}" ./terraform\nchmod 700 ./terraform\n')
        write_exec(os.path.join(self.bin, "sha256sum"),
                   f'#!/bin/sh\nif [ "$1" = -c ]; then cat >/dev/null; [ -n "$FAKE_SHA_FAIL" ] && {{ echo "FAILED"; exit 1; }}; echo "terraform_1.16.5_linux_amd64.zip: OK"; exit 0; fi\nexec {REAL_SHA} "$@"\n')
        write_exec(os.path.join(self.bin, "git"),
                   f'#!/bin/sh\nif [ "$1" = clone ]; then exec {REAL_GIT} clone -q "{self.bare}" munaxa-docs; fi\nexec {REAL_GIT} "$@"\n')
        self.set(account=ACCOUNT, caller=ROOT_ARN, lock=False,
                 emails={"munaxa-docs-eu-prod-monthly": EMAILS, "munaxa-account-monthly": list(reversed(EMAILS))},
                 plan_text="Terraform will perform the following actions:\n\nPlan: 2 to add, 3 to change, 0 to destroy.",
                 plan_json=good_plan())

    def set(self, **kw):
        s = json.load(open(self.state)) if os.path.exists(self.state) else {}
        s.update(kw)
        json.dump(s, open(self.state, "w"))

    def plan(self):
        return json.load(open(self.state))["plan_json"]

    def run(self, pin=None, region="eu-central-1", **env):
        e = {"PATH": self.bin + ":/usr/bin:/bin", "HOME": self.home, "FAKE_STATE": self.state, "FAKE_CALLS": self.calls,
             "LANG": "C.UTF-8", **env}
        if region:
            e["AWS_REGION"] = region
        p = subprocess.run(["bash", self.script, pin or self.pin], env=e, capture_output=True, text=True, timeout=120)
        calls = open(self.calls).read() if os.path.exists(self.calls) else ""
        log = os.path.join(self.home, "munaxa-docs-bootstrap", "docs-bootstrap-plan.log")
        logtext = open(log).read() if os.path.exists(log) else ""
        return p.returncode, p.stdout + p.stderr, calls, logtext

    def close(self):
        for root, dirs, _ in os.walk(self.dir):
            for d in dirs:
                os.chmod(os.path.join(root, d), stat.S_IRWXU)
        shutil.rmtree(self.dir, ignore_errors=True)
        for d in os.listdir("/tmp"):
            if d.startswith("munaxa-docs-bootstrap."):
                shutil.rmtree(os.path.join("/tmp", d), ignore_errors=True)


class DocsBootstrapPlanScript(unittest.TestCase):
    def setUp(self):
        self.h = Harness()

    def tearDown(self):
        self.h.close()

    def assertSafe(self, out, calls, log):
        for e in EMAILS:
            self.assertNotIn(e, out); self.assertNotIn(e, log)
        self.assertNotIn("@example.org", out + log)
        for line in calls.splitlines():
            self.assertNotRegex(line, r"^terraform (apply|import|state|destroy|force-unlock|taint)", line)
            self.assertNotIn("-auto-approve", line); self.assertNotIn("-target", line)
            if line.startswith("aws "):
                self.assertRegex(line, r"^aws (sts get-caller-identity|s3api head-object|budgets describe-)", line)

    def assertStopped(self, why, **runkw):
        rc, out, calls, log = self.h.run(**runkw)
        self.assertNotEqual(rc, 0, out)
        self.assertIn("STOP:", out)
        self.assertIn(why, out)
        self.assertNotIn("PLAN VERIFIED", out)
        self.assertSafe(out, calls, log)
        return out, calls

    def test_reviewed_delta_is_verified_and_nothing_is_applied(self):
        rc, out, calls, log = self.h.run()
        self.assertEqual(rc, 0, out)
        self.assertIn("DOCS BOOTSTRAP PLAN VERIFIED, NOT APPLIED", out)
        self.assertIn("OK   caller root", out)
        self.assertIn("OK   2 alert address(es) read from the live budgets", out)
        self.assertIn("only adding " + MIGRATE, out)
        self.assertIn("terraform apply -input=false", out)          # printed for a later owner yes ...
        self.assertNotRegex(calls, r"(?m)^terraform apply")         # ... never run
        self.assertRegex(calls, r"(?m)^terraform init -reconfigure -input=false -lockfile=readonly")
        self.assertRegex(calls, r"(?m)^terraform plan -input=false -lock-timeout=60s -no-color -out=")
        self.assertFalse(os.path.exists(os.path.join(self.h.home, "munaxa-docs-bootstrap", "plan.json")))
        summary = json.load(open(os.path.join(self.h.home, "munaxa-docs-bootstrap", "docs-bootstrap-plan-summary.json")))
        self.assertEqual(summary["counts"], {"create": 2, "no-op": 1, "read": 1, "update": 3})
        self.assertEqual(log.count("DOCS BOOTSTRAP PLAN VERIFIED"), 1)
        self.assertSafe(out, calls, log)

    def test_wrong_pin_argument(self):
        out, calls = self.assertStopped("PIN must be the reviewed main commit", pin="0" * 40)
        self.assertEqual(calls, "")

    def test_wrong_region(self):
        out, calls = self.assertStopped("open CloudShell in eu-central-1", region="us-east-1")
        self.assertEqual(calls, "")
        self.assertStopped("CloudShell region is unset", region=None)

    def test_wrong_account(self):
        self.h.set(account="111111111111")
        out, calls = self.assertStopped("account is 111111111111")
        self.assertEqual(calls.splitlines(), ["aws sts get-caller-identity --output json"])

    def test_engineering_and_other_callers_refused(self):
        for arn in (f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaEngineering_0123456789abcdef/someone",
                    f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_MunaxaAdministrator_0123456789abcdef/someone",
                    f"arn:aws:iam::{ACCOUNT}:user/admin.tamer"):
            with self.subTest(arn=arn):
                os.path.exists(self.h.calls) and os.remove(self.h.calls)
                self.h.set(caller=arn)
                out, calls = self.assertStopped("caller is not root")
                self.assertEqual(calls.splitlines(), ["aws sts get-caller-identity --output json"])

    def test_state_lock_present(self):
        self.h.set(lock=True)
        self.assertStopped("bootstrap state lock exists")

    def test_terraform_checksum(self):
        out, calls = self.assertStopped("terraform checksum", FAKE_SHA_FAIL="1")
        self.assertNotIn("terraform ", calls.replace("curl", ""))

    def test_budget_addresses_differ_and_are_not_printed(self):
        self.h.set(emails={"munaxa-docs-eu-prod-monthly": EMAILS, "munaxa-account-monthly": EMAILS[:1]})
        self.assertStopped("the two budgets do not have the same non-empty alert addresses")
        self.h.set(emails={})
        self.assertStopped("the two budgets do not have the same non-empty alert addresses")

    def test_plan_summary_other_than_2_3_0(self):
        for text in ("Plan: 2 to add, 3 to change, 1 to destroy.", "Plan: 3 to add, 3 to change, 0 to destroy.",
                     "No changes. Your infrastructure matches the configuration."):
            with self.subTest(text=text):
                self.h.set(plan_text=text)
                self.assertStopped("summary is not 2 to add, 3 to change, 0 to destroy")

    def test_plan_error_exit(self):
        self.h.set(plan_exit=1, plan_text="Error: something")
        self.assertStopped("plan exit 1")

    def test_drift(self):
        self.h.set(plan_text="Note: Objects have changed outside of Terraform\n\nPlan: 2 to add, 3 to change, 0 to destroy.")
        self.assertStopped("drift reported")
        self.h.set(plan_text="Plan: 2 to add, 3 to change, 0 to destroy.")
        p = self.h.plan(); p["resource_drift"] = [{"address": "aws_budgets_budget.account"}]; self.h.set(plan_json=p)
        self.assertStopped("the plan JSON lists resource drift")

    def test_unexpected_address_or_action(self):
        cases = {
            "replace": lambda p: p["resource_changes"][2]["change"].update(actions=["delete", "create"]),
            "extra update": lambda p: p["resource_changes"].append(
                {"address": "aws_iam_role.deployer", "change": {"actions": ["update"], "before": {}, "after": {}}}),
            "missing create": lambda p: p["resource_changes"].pop(4),
            "delete": lambda p: p["resource_changes"].append(
                {"address": "aws_cloudtrail.main", "change": {"actions": ["delete"], "before": {}, "after": None}}),
        }
        for name, mutate in cases.items():
            with self.subTest(case=name):
                p = good_plan(); mutate(p); self.h.set(plan_json=p)
                self.assertStopped("addresses or actions differ from the reviewed delta")

    def test_attribute_other_than_policy(self):
        p = good_plan(); p["resource_changes"][0]["change"]["after"]["tags"] = {"a": "c"}; self.h.set(plan_json=p)
        self.assertStopped("attributes other than policy change")
        p = good_plan(); p["resource_changes"][1]["change"]["after_unknown"] = {"name": True}; self.h.set(plan_json=p)
        self.assertStopped("attributes other than policy change")

    def test_policy_delta_must_be_exactly_the_migrate_arn(self):
        other = f"arn:aws:ecr:eu-central-1:{ACCOUNT}:repository/*"
        cases = {
            "extra ARN": policy(REPOS + [MIGRATE, other]),
            "ARN twice": json.dumps({"Statement": [{"Sid": "A", "Effect": "Allow", "Action": "ecr:PutImage", "Resource": REPOS + [MIGRATE]},
                                                   {"Sid": "B", "Effect": "Allow", "Action": "ecr:*", "Resource": [MIGRATE]}]}),
            "action widened": json.dumps({"Version": "2012-10-17", "Statement": [
                {"Sid": "Push", "Effect": "Allow", "Action": ["ecr:*"], "Resource": REPOS + [MIGRATE]},
                {"Sid": "Token", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"}]}),
            "ARN replaced": policy(REPOS[:2] + [MIGRATE]),
        }
        for name, after in cases.items():
            with self.subTest(case=name):
                p = good_plan(); p["resource_changes"][1]["change"]["after"]["policy"] = after; self.h.set(plan_json=p)
                self.assertStopped("a policy change is not exactly the addition of")

    def test_update_that_changes_nothing_is_refused(self):
        p = good_plan(); p["resource_changes"][1]["change"]["after"]["policy"] = policy(REPOS); self.h.set(plan_json=p)
        self.assertStopped("attributes other than policy change")

    def test_repository_must_be_immutable_with_scan_on_push(self):
        for field, value in (("image_tag_mutability", "MUTABLE"), ("name", "munaxa-docs/other")):
            with self.subTest(field=field):
                p = good_plan(); p["resource_changes"][3]["change"]["after"][field] = value; self.h.set(plan_json=p)
                self.assertStopped("IMMUTABLE, scan on push")
        p = good_plan(); p["resource_changes"][3]["change"]["after"]["image_scanning_configuration"] = [{"scan_on_push": False}]
        self.h.set(plan_json=p)
        self.assertStopped("IMMUTABLE, scan on push")


class PinnedRepository(unittest.TestCase):
    def test_other_bootstrap_file_changed_since_applied(self):
        h = Harness(extra_bootstrap_change=True)
        try:
            rc, out, calls, log = h.run()
            self.assertNotEqual(rc, 0)
            self.assertIn("are not exactly ecr.tf", out)
            self.assertNotRegex(calls, r"(?m)^terraform (init|plan)")
        finally:
            h.close()

    def test_ecr_blob_must_match(self):
        h = Harness()
        try:
            text = open(h.script).read()
            text = re.sub(r"BLOB_ECR=[0-9a-f]{40}", "BLOB_ECR=" + "1" * 40, text)
            open(h.script, "w").write(text)
            rc, out, calls, log = h.run()
            self.assertNotEqual(rc, 0)
            self.assertIn("ecr.tf is not the reviewed content", out)
        finally:
            h.close()

    @unittest.skipUnless(os.environ.get("MUNAXA_DOCS_DIR"), "set MUNAXA_DOCS_DIR to a full munaxa-docs clone")
    def test_real_constants(self):
        d = os.environ["MUNAXA_DOCS_DIR"]
        self.assertEqual(git(d, "rev-parse", CONSTANTS["REVIEWED_PIN"] + ":infra/terraform/bootstrap/ecr.tf"), CONSTANTS["BLOB_ECR"])
        self.assertEqual(git(d, "diff", "--name-only", CONSTANTS["APPLIED"], CONSTANTS["REVIEWED_PIN"], "--", "infra/terraform/bootstrap"),
                         "infra/terraform/bootstrap/ecr.tf")
        lock = git(d, "show", CONSTANTS["REVIEWED_PIN"] + ":infra/terraform/bootstrap/.terraform.lock.hcl")
        self.assertIn('version     = "6.67.0"', lock)
        self.assertIn("h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=", lock)


if __name__ == "__main__":
    unittest.main()
