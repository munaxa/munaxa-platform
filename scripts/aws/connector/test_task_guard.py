"""Tests for the Stage E task-definition guard e1-task-guard.py and its manifest (Stage E blocker BE-1).

Run (offline; no network, no credentials):

    python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'

1. The manifest (infra/aws/stack/envs/nonprod.stage-e-tasks.json) equals the script's embedded
   MANIFEST, and its images, secret versions and probe pin equal envs/nonprod.tfvars. (The Terraform
   test tests/stage-e-manifest.tftest.hcl checks that Terraform renders exactly this manifest.)
2. The script runs the way the connector sandbox runs it, against FakeEcs: the reviewed revision
   passes; a stale, newer, tampered, unknown or unpinned revision fails closed; RunTask is called
   once, on the full revision ARN, with an allow-listed override only, and never retried.
3. No live runbook or script names a task-definition revision number.
"""

import asyncio
import copy
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import sandbox_harness as h  # noqa: E402

STACK = os.path.join(ROOT, "infra", "aws", "stack")
ACCOUNT = "229251310592"
REGION = "eu-central-1"
TD = f"arn:aws:ecs:{REGION}:{ACCOUNT}:task-definition/"
CLUSTER = "munaxa-nonprod"
ALB = "munaxa-nonprod-1234567890.eu-central-1.elb.amazonaws.com"
SUB = "3f2b9c1e-8d7a-4b6c-9e5f-0a1b2c3d4e5f"
OLD_IMAGE = f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/munaxa-identity/api@sha256:" + "71d01fdf" * 8


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


SCRIPT = read("scripts", "aws", "connector", "e1-task-guard.py")
MANIFEST = json.loads(read("infra", "aws", "stack", "envs", "nonprod.stage-e-tasks.json"))
FAMILIES = MANIFEST["families"]
PIN = {"commit": "0123456789abcdef0123456789abcdef01234567", "sha256": "ab" * 32}


def pinned_script(pin=PIN):
    """The script as it will be once the probe pin PR sets the manifest's probePin."""
    pattern = re.compile(r'"probePin": \{\s*"commit": "",\s*"sha256": ""\s*\}')
    assert len(pattern.findall(SCRIPT)) == 1
    return pattern.sub(f'"probePin": {{"commit": "{pin['commit']}", "sha256": "{pin['sha256']}"}}', SCRIPT)


def value_from(spec):
    if spec["form"] == "full":
        return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{spec['secret']}-Ab12Cd:{spec['key']}::{spec['version']}"
    if spec["form"] == "partial":
        return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{spec['secret']}:{spec['key']}::"
    return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:rds!db-0d1c2b3a-4f5e-4d7c-8b9a-0f1e2d3c4b5a-Xy98Zw:{spec['key']}::"


def render(family, revision, pin=PIN):
    """The task definition Terraform would register for `family`, as DescribeTaskDefinition returns it."""
    spec = FAMILIES[family]
    containers = []
    for name, cs in spec["containers"].items():
        c = {"name": name, "image": cs["image"], "essential": True,
             "secrets": [{"name": k, "valueFrom": value_from(v)} for k, v in cs["secrets"].items()]}
        if "command" in cs:
            c["command"] = list(cs["command"])
        if "entryPoint" in cs:
            c["entryPoint"] = list(cs["entryPoint"])
            c["command"] = [cs["commandFirstLine"] + "x" * (cs["commandLength"] - len(cs["commandFirstLine"]))]
        if "environment" in cs or "probePin" in cs:
            env = dict(cs.get("environment", {}))
            env.update({"PROBE_COMMIT": pin["commit"], "PROBE_SHA256": pin["sha256"], "NODE_ENV": "production"})
            c["environment"] = [{"name": k, "value": v} for k, v in env.items()]
            c["command"] = ["node", "--input-type=module", "-e",
                            f"// loader\nconst COMMIT = '{pin['commit']}';\nconst SHA256 = '{pin['sha256']}';\n"]
        containers.append(c)
    return {
        "taskDefinitionArn": f"{TD}{family}:{revision}", "family": family, "revision": revision, "status": "ACTIVE",
        "executionRoleArn": f"arn:aws:iam::{ACCOUNT}:role/munaxa-shared/{spec['executionRole']}",
        "requiresCompatibilities": ["FARGATE"], "networkMode": "awsvpc", "containerDefinitions": containers,
    }


class FakeEcs:
    def __init__(self):
        self.account = ACCOUNT
        self.defs = {}  # family -> {revision: td}
        for family in FAMILIES:
            self.defs[family] = {1: render(family, 1)}
        self.tasks = []  # {taskArn, family, revision, startedBy, lastStatus, ...}
        self.calls = []
        self.faults = {}
        self.overrides = {}
        self.vpcs, self.subnets, self.groups = 1, 2, 1
        self.n = 0

    def register(self, family, td):
        self.defs[family][td["revision"]] = td

    async def __call__(self, *, service_name, operation_name, region_name=None, params=None):
        params = params or {}
        assert region_name == REGION
        assert operation_name not in h.FORBIDDEN_OPERATIONS
        self.calls.append((operation_name, copy.deepcopy(params)))
        f = (self.faults.get(operation_name) or [None]).pop(0) if self.faults.get(operation_name) else None
        if f == "timeout":
            raise asyncio.TimeoutError()
        if f is not None:
            raise h.ClientError(f, json.dumps(params, default=str), operation_name)
        if operation_name in self.overrides:
            return self.overrides[operation_name](params)
        return getattr(self, "op_" + operation_name)(params)

    def ops(self, name):
        return [p for o, p in self.calls if o == name]

    def op_GetCallerIdentity(self, p):
        return {"Account": self.account}

    def op_ListTaskDefinitions(self, p):
        assert p["status"] == "ACTIVE"
        arns = []
        for family, revs in self.defs.items():
            if family.startswith(p["familyPrefix"]):
                arns += [td["taskDefinitionArn"] for td in revs.values() if td["status"] == "ACTIVE"]
        return {"taskDefinitionArns": sorted(arns, reverse=True)}

    def op_DescribeTaskDefinition(self, p):
        family, rev = p["taskDefinition"][len(TD):].rsplit(":", 1)
        td = self.defs.get(family, {}).get(int(rev))
        if td is None:
            raise h.ClientError("ClientException", "", "DescribeTaskDefinition")
        return {"taskDefinition": copy.deepcopy(td)}

    def op_DescribeVpcs(self, p):
        assert p["Filters"] == [{"Name": "tag:Name", "Values": ["munaxa-nonprod"]}]
        return {"Vpcs": [{"VpcId": f"vpc-{i}"} for i in range(self.vpcs)]}

    def op_DescribeSubnets(self, p):
        return {"Subnets": [{"SubnetId": f"subnet-{i}"} for i in range(self.subnets)]}

    def op_DescribeSecurityGroups(self, p):
        name = [f for f in p["Filters"] if f["Name"] == "group-name"][0]["Values"][0]
        return {"SecurityGroups": [{"GroupId": "sg-" + name} for _ in range(self.groups)]}

    def op_ListTasks(self, p):
        out = []
        for t in self.tasks:
            if p.get("desiredStatus") and t["desiredStatus"] != p["desiredStatus"]:
                continue
            if "family" in p and t["family"] != p["family"]:
                continue
            if "startedBy" in p and t["startedBy"] != p["startedBy"]:
                continue
            out.append(t["taskArn"])
        return {"taskArns": out}

    def op_DescribeTasks(self, p):
        return {"tasks": [copy.deepcopy(t) for t in self.tasks if t["taskArn"] in p["tasks"]]}

    def op_RunTask(self, p):
        self.n += 1
        family, rev = p["taskDefinition"][len(TD):].rsplit(":", 1)
        arn = f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/{self.n:032x}"
        self.tasks.append({"taskArn": arn, "family": family, "taskDefinitionArn": p["taskDefinition"], "startedBy": p["startedBy"],
                           "lastStatus": "PROVISIONING", "desiredStatus": "RUNNING", "containers": []})
        return {"tasks": [{"taskArn": arn}], "failures": []}

    def finish(self, exit_code=0, digest=None, stop_code="EssentialContainerExited"):
        for t in self.tasks:
            if t["startedBy"].startswith("stage-e-"):
                family = t["family"]
                t.update(lastStatus="STOPPED", desiredStatus="STOPPED", stopCode=stop_code,
                         stoppedReason="Essential container in task exited")
                t["containers"] = []
                for name, cs in FAMILIES[family]["containers"].items():
                    d = digest or "sha256:" + cs["image"].rsplit("@sha256:", 1)[1]
                    t["containers"].append({"name": name, "exitCode": exit_code, "lastStatus": "STOPPED", "imageDigest": d})


def guard(fake, script=SCRIPT, **inputs):
    text = h.set_inputs(script, **inputs) if inputs else script
    return h.run_script(text, fake)


class Manifest(unittest.TestCase):
    def test_the_script_embeds_the_manifest_file(self):
        m = re.search(r"^MANIFEST = (.*?)\n# --- end manifest ---", SCRIPT, re.S | re.M)
        embedded = eval(m.group(1), {"__builtins__": {}})  # noqa: S307 - a literal written by us
        expected = dict(MANIFEST)
        expected.pop("description")
        self.assertEqual(embedded, expected)

    def test_the_manifest_equals_nonprod_tfvars(self):
        tfvars = read("infra", "aws", "stack", "envs", "nonprod.tfvars")

        def value(name):
            return re.search(rf'^\s*{name}\s*=\s*"([^"]+)"', tfvars, re.M).group(1)

        self.assertEqual(FAMILIES["munaxa-nonprod-identity"]["containers"]["identity"]["image"], value("identity_api"))
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-bootstrap"]["containers"]["identity-bootstrap"]["image"], value("identity_api"))
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-probe"]["containers"]["identity-probe"]["image"], value("identity_api"))
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-migrate"]["containers"]["identity-migrate"]["image"], value("identity_migrate"))
        self.assertEqual(FAMILIES["munaxa-nonprod-db-admin"]["containers"]["db-admin"]["image"], value("postgres_image"))
        self.assertEqual(FAMILIES["munaxa-nonprod-identity"]["containers"]["valkey"]["image"], value("valkey_image"))
        versions = dict(re.findall(r'^\s*(identity(?:-migrate)?)\s*=\s*"([0-9a-f-]{36})"', tfvars, re.M))
        for family in FAMILIES.values():
            for c in family["containers"].values():
                for s in c["secrets"].values():
                    if s["form"] == "full":
                        bundle = s["secret"].split("/", 1)[1]
                        self.assertEqual(s["version"], versions[bundle], s)
        pin = re.search(r'identity_probe_source\s*=\s*\{\s*commit\s*=\s*"([0-9a-f]*)"\s*sha256\s*=\s*"([0-9a-f]*)"', tfvars)
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-probe"]["containers"]["identity-probe"]["probePin"],
                         {"commit": pin.group(1) if pin else "", "sha256": pin.group(2) if pin else ""})

    def test_db_admin_command_is_the_committed_script(self):
        text = read("infra", "aws", "stack", "scripts", "db-bootstrap.sh")
        c = FAMILIES["munaxa-nonprod-db-admin"]["containers"]["db-admin"]
        self.assertEqual(c["commandLength"], len(text))
        self.assertEqual(c["commandFirstLine"], text.splitlines()[0])

    def test_module_families_follow_the_service_module_names(self):
        module = read("infra", "aws", "modules", "service", "main.tf")
        self.assertIn('id        = "${var.prefix}-${var.name}"', module)
        self.assertIn('name                 = "${local.id}-execution"', module)
        for family in ("munaxa-nonprod-identity", "munaxa-nonprod-identity-migrate"):
            self.assertEqual(FAMILIES[family]["executionRole"], family + "-execution")
            self.assertEqual(FAMILIES[family]["securityGroup"], family)

    def test_every_image_is_pinned_by_digest_and_every_version_is_a_uuid(self):
        for name, family in FAMILIES.items():
            for c in family["containers"].values():
                self.assertRegex(c["image"], r"@sha256:[0-9a-f]{64}$", name)
                for s in c["secrets"].values():
                    if s["form"] == "full":
                        self.assertRegex(s["version"], r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

    def test_the_guard_passes_the_sandbox_rules_and_shares_the_helpers(self):
        self.assertEqual(h.check_source(SCRIPT), [])
        with open(os.path.join(HERE, "c16-delete-bootstrap-secret.py"), encoding="utf-8") as f:
            self.assertEqual(h.shared_block(SCRIPT), h.shared_block(f.read()))


class Discover(unittest.TestCase):
    def test_reviewed_revisions_pass_and_are_recorded(self):
        fake = FakeEcs()
        for family in FAMILIES:
            if family != "munaxa-nonprod-identity-probe":
                fake.register(family, render(family, 7))
        r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
        self.assertEqual(r["result"], "PASS")
        self.assertEqual(r["families"][0]["latest"], 7)
        self.assertEqual(r["families"][0]["active_revisions"], [7, 1])
        self.assertNotIn("RunTask", [c[0] for c in fake.calls])

    def test_the_family_prefix_never_mixes_families(self):
        fake = FakeEcs()
        fake.register("munaxa-nonprod-identity-migrate", render("munaxa-nonprod-identity-migrate", 9))
        r = guard(fake, FAMILY="munaxa-nonprod-identity")
        self.assertEqual(r["families"][0]["active_revisions"], [1])

    def test_the_be1_case_a_stale_latest_revision_fails_closed(self):
        # The registered revision still carries the 5277d71-era image: never runnable.
        fake = FakeEcs()
        stale = render("munaxa-nonprod-identity-bootstrap", 1)
        stale["containerDefinitions"][0]["image"] = OLD_IMAGE
        fake.register("munaxa-nonprod-identity-bootstrap", stale)
        r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
        self.assertEqual(r["result"], "FAIL")
        self.assertIn("identity-bootstrap:image", r["families"][0]["problems"])

    def test_every_kind_of_drift_is_named(self):
        drifts = {
            "identity-bootstrap:secret-ref:DIRECT_DATABASE_URL": lambda td: td["containerDefinitions"][0]["secrets"][0].update(
                valueFrom=td["containerDefinitions"][0]["secrets"][0]["valueFrom"].replace("a3cc6622-df66-4787-bae7-83ccfec56ff4", "00000000-0000-0000-0000-000000000000")),
            "identity-bootstrap:secret-names": lambda td: td["containerDefinitions"][0]["secrets"].append({"name": "EXTRA", "valueFrom": "x"}),
            "execution-role": lambda td: td.update(executionRoleArn=td["executionRoleArn"] + "x"),
            "task-role": lambda td: td.update(taskRoleArn=f"arn:aws:iam::{ACCOUNT}:role/x"),
            "launch": lambda td: td.update(networkMode="bridge"),
            "identity-bootstrap:command": lambda td: td["containerDefinitions"][0].update(command=["sh", "-c", "env"]),
            "container-names": lambda td: td["containerDefinitions"].append({"name": "sidecar", "image": "x"}),
        }
        for problem, change in drifts.items():
            with self.subTest(problem=problem):
                fake = FakeEcs()
                td = render("munaxa-nonprod-identity-bootstrap", 2)
                change(td)
                fake.register("munaxa-nonprod-identity-bootstrap", td)
                r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(problem, r["families"][0]["problems"])

    def test_a_partial_reference_must_stay_partial_and_a_full_one_full(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity-bootstrap", 2)
        for s in td["containerDefinitions"][0]["secrets"]:
            if s["name"] == "IDENTITY_OWNER_EMAIL":
                s["valueFrom"] = s["valueFrom"].replace("identity-bootstrap:", "identity-operator:")
        fake.register("munaxa-nonprod-identity-bootstrap", td)
        r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
        self.assertIn("identity-bootstrap:secret-ref:IDENTITY_OWNER_EMAIL", r["families"][0]["problems"])

    def test_the_service_definition_checks_both_containers(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity", 3)
        td["containerDefinitions"][1]["image"] = td["containerDefinitions"][1]["image"][:-1] + "0"
        fake.register("munaxa-nonprod-identity", td)
        r = guard(fake, FAMILY="munaxa-nonprod-identity")
        self.assertIn("valkey:image", r["families"][0]["problems"])

    def test_an_unpinned_manifest_never_accepts_a_probe(self):
        fake = FakeEcs()
        r = guard(fake, FAMILY="munaxa-nonprod-identity-probe")
        self.assertIn("identity-probe:probe-not-pinned-in-manifest", r["families"][0]["problems"])

    def test_a_pinned_manifest_accepts_only_its_pin(self):
        fake = FakeEcs()
        fake.register("munaxa-nonprod-identity-probe", render("munaxa-nonprod-identity-probe", 2))
        self.assertEqual(guard(fake, pinned_script(), FAMILY="munaxa-nonprod-identity-probe")["result"], "PASS")
        other = {"commit": "f" * 40, "sha256": PIN["sha256"]}
        fake.register("munaxa-nonprod-identity-probe", render("munaxa-nonprod-identity-probe", 3, pin=other))
        r = guard(fake, pinned_script(), FAMILY="munaxa-nonprod-identity-probe")
        self.assertIn("identity-probe:probe-pin", r["families"][0]["problems"])

    def test_missing_family_malformed_and_denied_responses_fail(self):
        fake = FakeEcs()
        fake.defs["munaxa-nonprod-db-admin"] = {}
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-db-admin")["families"][0]["error"], "NO_ACTIVE_REVISION")
        fake = FakeEcs()
        fake.overrides["ListTaskDefinitions"] = lambda p: {"taskDefinitionArns": "garbage"}
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-db-admin")["families"][0]["error"], "LIST_PY_VALUE")
        fake = FakeEcs()
        fake.faults["DescribeTaskDefinition"] = ["AccessDeniedException"]
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-db-admin")["families"][0]["error"], "DESCRIBE_AWS_AccessDeniedException")
        fake = FakeEcs()
        fake.overrides["DescribeTaskDefinition"] = lambda p: {"taskDefinition": render("munaxa-nonprod-db-admin", 5)}
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-db-admin")["families"][0]["error"], "DESCRIBE_MISMATCH")
        self.assertEqual(guard(FakeEcs(), FAMILY="munaxa-nonprod-other")["code"], "UNKNOWN_FAMILY")
        wrong = FakeEcs()
        wrong.account = "111111111111"
        self.assertEqual(guard(wrong)["code"], "WRONG_ACCOUNT")


class Run(unittest.TestCase):
    def base(self, **inputs):
        args = {"MODE": "run", "FAMILY": "munaxa-nonprod-identity-bootstrap", "EXPECTED_REVISION": 1, "RUN_TOKEN": "s6a-bootstrap-0001"}
        args.update(inputs)
        return args

    def test_one_runtask_on_the_full_revision_arn(self):
        fake = FakeEcs()
        r = guard(fake, **self.base())
        self.assertEqual(r["result"], "STARTED")
        runs = fake.ops("RunTask")
        self.assertEqual(len(runs), 1)
        p = runs[0]
        self.assertEqual(p["taskDefinition"], TD + "munaxa-nonprod-identity-bootstrap:1")
        self.assertEqual((p["cluster"], p["launchType"], p["count"]), (CLUSTER, "FARGATE", 1))
        self.assertEqual((p["startedBy"], p["clientToken"]), ("stage-e-s6a-bootstrap-0001", "s6a-bootstrap-0001"))
        self.assertEqual(p["networkConfiguration"]["awsvpcConfiguration"],
                         {"subnets": ["subnet-0", "subnet-1"], "securityGroups": ["sg-munaxa-nonprod-db-admin"], "assignPublicIp": "ENABLED"})
        self.assertNotIn("overrides", p)

    def test_allow_listed_command_overrides_only(self):
        fake = FakeEcs()
        r = guard(fake, **self.base(COMMAND="seed-control-roles"))
        self.assertEqual(r["result"], "STARTED")
        self.assertEqual(fake.ops("RunTask")[0]["overrides"], {"containerOverrides": [
            {"name": "identity-bootstrap", "command": ["node", "scripts/seed-control-roles.mjs", "--organisation", "munaxa-group"]}]})
        for command in ("sh", "account-disable", "default "):
            with self.subTest(command=command):
                self.assertEqual(guard(FakeEcs(), **self.base(COMMAND=command))["code"], "COMMAND_NOT_ALLOWED")

    def test_the_throwaway_disable_takes_a_validated_sub_only(self):
        fake = FakeEcs()
        args = self.base(FAMILY="munaxa-nonprod-identity", COMMAND="account-disable", ACCOUNT_ID=SUB, RUN_TOKEN="s9-disable-0001")
        r = guard(fake, **args)
        self.assertEqual(r["result"], "STARTED")
        override = fake.ops("RunTask")[0]["overrides"]["containerOverrides"][0]
        self.assertEqual(override["name"], "identity")
        self.assertEqual(override["command"], ["node", "dist/ops/operator-cli.js", "account-disable", "--organisation",
                                               "munaxa-stage-e-checks", "--account-id", SUB, "--reference", "stage-e-throwaway", "--apply"])
        self.assertEqual(fake.ops("RunTask")[0]["networkConfiguration"]["awsvpcConfiguration"]["securityGroups"], ["sg-munaxa-nonprod-identity"])
        for bad in ("", "x", SUB + " --organisation munaxa-group", SUB.upper()):
            with self.subTest(bad=bad):
                self.assertEqual(guard(FakeEcs(), **dict(args, ACCOUNT_ID=bad))["code"], "ACCOUNT_ID_SHAPE")

    def test_the_probe_takes_a_validated_alb_name_only(self):
        fake = FakeEcs()
        fake.register("munaxa-nonprod-identity-probe", render("munaxa-nonprod-identity-probe", 2))
        args = self.base(FAMILY="munaxa-nonprod-identity-probe", EXPECTED_REVISION=2, PROBE_ALB_DNS=ALB, RUN_TOKEN="s10-probe-0001")
        r = guard(fake, pinned_script(), **args)
        self.assertEqual(r["result"], "STARTED")
        self.assertEqual(fake.ops("RunTask")[0]["overrides"], {"containerOverrides": [
            {"name": "identity-probe", "environment": [{"name": "PROBE_ALB_DNS", "value": ALB}]}]})
        for bad in ("", "evil.example", ALB.replace("eu-central-1", "us-east-1")):
            with self.subTest(bad=bad):
                fresh = FakeEcs()
                fresh.register("munaxa-nonprod-identity-probe", render("munaxa-nonprod-identity-probe", 2))
                self.assertEqual(guard(fresh, pinned_script(), **dict(args, PROBE_ALB_DNS=bad))["code"], "ALB_DNS_SHAPE")

    def test_an_input_the_command_does_not_use_is_refused(self):
        self.assertEqual(guard(FakeEcs(), **self.base(ACCOUNT_ID=SUB))["code"], "UNUSED_INPUT")
        self.assertEqual(guard(FakeEcs(), **self.base(PROBE_ALB_DNS=ALB))["code"], "UNUSED_INPUT")

    def test_a_stale_or_newer_revision_is_refused_before_anything_runs(self):
        fake = FakeEcs()
        fake.register("munaxa-nonprod-identity-bootstrap", render("munaxa-nonprod-identity-bootstrap", 2))
        r = guard(fake, **self.base(EXPECTED_REVISION=1))
        self.assertEqual((r["code"], r["latest"], r["expected"]), ("REVISION_NOT_EXPECTED", 2, 1))
        r = guard(fake, **self.base(EXPECTED_REVISION=3))
        self.assertEqual(r["code"], "REVISION_NOT_EXPECTED")
        self.assertEqual(fake.ops("RunTask"), [])

    def test_an_invalid_expected_revision_is_refused(self):
        fake = FakeEcs()
        bad = render("munaxa-nonprod-identity-bootstrap", 2)
        bad["containerDefinitions"][0]["image"] = OLD_IMAGE
        fake.register("munaxa-nonprod-identity-bootstrap", bad)
        r = guard(fake, **self.base(EXPECTED_REVISION=2))
        self.assertEqual(r["code"], "REVISION_INVALID")
        self.assertEqual(fake.ops("RunTask"), [])

    def test_inputs_are_checked_first(self):
        self.assertEqual(guard(FakeEcs(), **self.base(EXPECTED_REVISION=0))["code"], "EXPECTED_REVISION_NOT_SET")
        self.assertEqual(guard(FakeEcs(), **self.base(RUN_TOKEN="short"))["code"], "RUN_TOKEN_SHAPE")
        self.assertEqual(guard(FakeEcs(), **self.base(RUN_TOKEN="Has Spaces 123"))["code"], "RUN_TOKEN_SHAPE")
        self.assertEqual(guard(FakeEcs(), **self.base(FAMILY="munaxa-prod-db-admin"))["code"], "UNKNOWN_FAMILY")
        self.assertEqual(guard(FakeEcs(), **self.base(MODE="delete"))["code"], "UNKNOWN_MODE")

    def test_a_duplicate_run_is_refused(self):
        fake = FakeEcs()
        self.assertEqual(guard(fake, **self.base())["result"], "STARTED")
        r = guard(fake, **self.base())
        self.assertEqual(r["code"], "RUN_TOKEN_ALREADY_USED")
        r = guard(fake, **self.base(RUN_TOKEN="s6a-bootstrap-0002"))
        self.assertEqual(r["code"], "ALREADY_RUNNING")
        fake.finish()
        self.assertEqual(guard(fake, **self.base(RUN_TOKEN="s6a-bootstrap-0002"))["result"], "STARTED")
        self.assertEqual(len(fake.ops("RunTask")), 2)

    def test_the_service_own_task_does_not_block_a_one_off_but_a_guard_task_does(self):
        fake = FakeEcs()
        fake.tasks.append({"taskArn": f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/{'e' * 32}", "family": "munaxa-nonprod-identity",
                           "startedBy": "ecs-svc/1234567890", "lastStatus": "RUNNING", "desiredStatus": "RUNNING"})
        args = self.base(FAMILY="munaxa-nonprod-identity", COMMAND="account-disable-plan", ACCOUNT_ID=SUB, RUN_TOKEN="s9-disable-plan-1")
        self.assertEqual(guard(fake, **args)["result"], "STARTED")
        self.assertEqual(guard(fake, **dict(args, RUN_TOKEN="s9-disable-plan-2"))["code"], "ALREADY_RUNNING")

    def test_network_lookups_must_be_exact(self):
        for attr, value, code in (("vpcs", 0, "VPC_COUNT_0"), ("vpcs", 2, "VPC_COUNT_2"), ("subnets", 1, "SUBNET_COUNT_1"), ("groups", 0, "GROUP_COUNT_0")):
            with self.subTest(attr=attr, value=value):
                fake = FakeEcs()
                setattr(fake, attr, value)
                self.assertEqual(guard(fake, **self.base())["code"], code)
                self.assertEqual(fake.ops("RunTask"), [])

    def test_a_runtask_timeout_is_unknown_and_never_retried(self):
        fake = FakeEcs()
        fake.faults["RunTask"] = ["timeout"]
        r = guard(fake, **self.base())
        self.assertEqual(r["result"], "UNKNOWN")
        self.assertEqual(len(fake.ops("RunTask")), 1)

    def test_runtask_denial_failures_and_malformed_answers(self):
        fake = FakeEcs()
        fake.faults["RunTask"] = ["AccessDeniedException"]
        self.assertEqual(guard(fake, **self.base())["code"], "RUNTASK_AWS_AccessDeniedException")
        fake = FakeEcs()
        fake.overrides["RunTask"] = lambda p: {"tasks": [], "failures": [{"reason": "RESOURCE:MEMORY", "arn": "x"}]}
        r = guard(fake, **self.base())
        self.assertEqual((r["result"], r["reasons"]), ("FAIL", ["RESOURCE:MEMORY"]))
        fake = FakeEcs()
        fake.overrides["RunTask"] = lambda p: {"tasks": [{"taskArn": "arn:aws:ecs:us-east-1:1:task/x/y"}]}
        self.assertEqual(guard(fake, **self.base())["code"], "RUNTASK_MALFORMED")

    def test_a_denied_precheck_never_runs(self):
        fake = FakeEcs()
        fake.faults["ListTasks"] = ["AccessDeniedException"]
        self.assertEqual(guard(fake, **self.base())["code"], "PRECHECK_AWS_AccessDeniedException")
        self.assertEqual(fake.ops("RunTask"), [])


class Status(unittest.TestCase):
    def started(self):
        fake = FakeEcs()
        guard(fake, MODE="run", FAMILY="munaxa-nonprod-identity-migrate", EXPECTED_REVISION=1, RUN_TOKEN="s4-migrate-00001")
        return fake

    def test_in_progress_then_succeeded(self):
        fake = self.started()
        self.assertEqual(guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")["result"], "IN_PROGRESS")
        fake.finish()
        r = guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")
        self.assertEqual(r["result"], "SUCCEEDED")
        self.assertTrue(r["tasks"][0]["containers"][0]["digest_ok"])

    def test_a_non_zero_exit_or_another_digest_fails(self):
        fake = self.started()
        fake.finish(exit_code=1)
        self.assertEqual(guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")["result"], "FAILED")
        fake = self.started()
        fake.finish(digest="sha256:" + "0" * 64)
        r = guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")
        self.assertEqual(r["result"], "FAILED")
        self.assertFalse(r["tasks"][0]["containers"][0]["digest_ok"])

    def test_a_stop_reason_is_reduced_to_its_class(self):
        fake = self.started()
        fake.finish(stop_code="TaskFailedToStart")
        fake.tasks[0]["stoppedReason"] = "ResourceInitializationError: unable to pull secrets: arn:aws:secretsmanager:... value"
        r = guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")
        self.assertEqual(r["tasks"][0]["stoppedReasonClass"], "ResourceInitializationError")
        self.assertNotIn("secretsmanager", json.dumps(r))

    def test_not_started_and_bad_inputs(self):
        self.assertEqual(guard(FakeEcs(), MODE="status", RUN_TOKEN="never-used-0001")["result"], "NOT_STARTED")
        self.assertEqual(guard(FakeEcs(), MODE="status", TASK_ARN="arn:aws:ecs:us-east-1:1:task/x")["code"], "TASK_ARN_SHAPE")


class NoRevisionNumbers(unittest.TestCase):
    """BE-1: no live Stage E runbook, script or workflow names a task-definition revision number."""

    PATTERN = re.compile(r"munaxa-nonprod-(?:db-admin|identity(?:-[a-z]+)?)(?::|%3A)\d|\$C-[a-z-]+:\d|run_one [^\s`]+:\d")

    def live_files(self):
        roots = [os.path.join(ROOT, "scripts"), os.path.join(ROOT, "infra"), os.path.join(ROOT, ".github")]
        reports = os.path.join(ROOT, "docs", "aws-migration", "agent-reports")
        live_reports = [
            "2026-11-11-identity-final-operator-runbook",
            "2026-11-11-identity-first-session-operator-checklist",
            "2026-11-14-identity-stage-e-blockers-remediation",
        ]
        files = []
        for root in roots + [os.path.join(reports, r) for r in live_reports]:
            for d, _, names in os.walk(root):
                if "node_modules" in d or ".terraform" in d:
                    continue
                files += [os.path.join(d, n) for n in names if n.endswith((".md", ".py", ".mjs", ".sh", ".yml", ".tf", ".json", ".hcl"))]
        return files

    def test_no_live_file_pins_a_revision(self):
        offenders = []
        for path in self.live_files():
            if os.path.basename(path) == "test_task_guard.py":
                continue
            with open(path, encoding="utf-8", errors="replace") as f:
                for n, line in enumerate(f, 1):
                    if self.PATTERN.search(line) and "historical" not in line.lower():
                        offenders.append(f"{os.path.relpath(path, ROOT)}:{n}")
        self.assertEqual(offenders, [])

    def test_the_pattern_catches_the_old_forms(self):
        for line in ("run_one munaxa-nonprod-db-admin:1 $SG", "run_one $C-identity-bootstrap:1 \"$SG\"",
                     'params={"taskDefinition": "munaxa-nonprod-identity-bootstrap:1"}', "`munaxa-nonprod-identity-migrate:12`"):
            self.assertRegex(line, self.PATTERN)
        self.assertNotRegex("munaxa-nonprod-identity-bootstrap:REVISION_FROM_E1", self.PATTERN)


if __name__ == "__main__":
    unittest.main()
