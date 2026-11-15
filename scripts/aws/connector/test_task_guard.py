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
import hashlib
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
# The manifest's own pin once the D-PIN configuration sets it (owner decision, 15 Nov 2026); a
# synthetic one while it is unpinned.
PIN = FAMILIES["munaxa-nonprod-identity-probe"]["probePin"] if FAMILIES["munaxa-nonprod-identity-probe"]["probePin"]["commit"] \
    else {"commit": "0123456789abcdef0123456789abcdef01234567", "sha256": "ab" * 32}
UNPINNED = {"commit": "", "sha256": ""}


def pinned_script(pin=PIN):
    """The script with the manifest's probePin set to `pin` (UNPINNED gives the unpinned script)."""
    pattern = re.compile(r'"probePin": \{\s*"commit": "[0-9a-f]*",\s*"sha256": "[0-9a-f]*"\s*\}')
    assert len(pattern.findall(SCRIPT)) == 1
    return pattern.sub(f'"probePin": {{"commit": "{pin['commit']}", "sha256": "{pin['sha256']}"}}', SCRIPT)


def value_from(spec):
    if spec["form"] == "full":
        return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{spec['secret']}-Ab12Cd:{spec['key']}::{spec['version']}"
    if spec["form"] == "partial":
        return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:{spec['secret']}:{spec['key']}::"
    return f"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:rds!db-0d1c2b3a-4f5e-4d7c-8b9a-0f1e2d3c4b5a-Xy98Zw:{spec['key']}::"


LOADER = read("infra", "aws", "stack", "scripts", "identity-probe-loader.mjs")
DB_SCRIPT = read("infra", "aws", "stack", "scripts", "db-bootstrap.sh")


def pinned_loader(pin=PIN):
    return LOADER.replace("__PROBE_COMMIT__", pin["commit"]).replace("__PROBE_SHA256__", pin["sha256"])


def render(family, revision, pin=PIN):
    """The task definition Terraform would register for `family`, as DescribeTaskDefinition returns it
    (with the empty defaults ECS adds, which the guard must ignore)."""
    spec = FAMILIES[family]
    containers = []
    for name, cs in spec["containers"].items():
        c = {"name": name, "image": cs["image"], "cpu": 0, "portMappings": [], "volumesFrom": [], "systemControls": [],
             "secrets": [{"name": k, "valueFrom": value_from(v)} for k, v in cs["secrets"].items()]}
        c.update(copy.deepcopy(cs["shape"]))
        c.update(copy.deepcopy(cs.get("extra") or {}))
        c.setdefault("mountPoints", [])
        env = {n: (cs.get("environment") or {}).get(n, "value-" + n) for n in cs["environmentNames"]}
        if name == "identity-probe":
            env.update({"PROBE_COMMIT": pin["commit"], "PROBE_SHA256": pin["sha256"]})
        c["environment"] = [{"name": k, "value": v} for k, v in env.items()]
        if "command" in cs:
            c["command"] = list(cs["command"])
        elif "commandSha256" in cs:
            c["command"] = [DB_SCRIPT]
        elif cs.get("probeLoader"):
            c["command"] = ["node", "--input-type=module", "-e", pinned_loader(pin)]
        containers.append(c)
    return {
        "taskDefinitionArn": f"{TD}{family}:{revision}", "family": family, "revision": revision, "status": "ACTIVE",
        "executionRoleArn": f"arn:aws:iam::{ACCOUNT}:role/munaxa-shared/{spec['executionRole']}",
        "requiresCompatibilities": ["FARGATE"], "networkMode": "awsvpc", "containerDefinitions": containers,
        "volumes": [{"name": v, "host": {}} for v in spec["volumes"]],
        "cpu": spec["task"]["cpu"], "memory": spec["task"]["memory"], "runtimePlatform": copy.deepcopy(spec["task"]["runtimePlatform"]),
        # Metadata and defaults ECS adds, which the guard must ignore (owner review B-8).
        "compatibilities": ["EC2", "FARGATE"], "requiresAttributes": [{"name": "com.amazonaws.ecs.capability.logging-driver.awslogs"}],
        "registeredAt": "2026-11-13T21:45:00Z", "registeredBy": f"arn:aws:sts::{ACCOUNT}:assumed-role/x/y",
        "placementConstraints": [], "enableFaultInjection": False,
    }


def container(td, name):
    return [c for c in td["containerDefinitions"] if c["name"] == name][0]


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
        # The ECS reference: a startedBy filter must be the only filter (review finding C-2).
        assert "startedBy" not in p, "the guard must not filter ListTasks by startedBy"
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
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-probe"]["probePin"],
                         {"commit": pin.group(1) if pin else "", "sha256": pin.group(2) if pin else ""})

    def test_pass_c_c1_pinned_environment_values_equal_nonprod_tfvars(self):
        tfvars = read("infra", "aws", "stack", "envs", "nonprod.tfvars")

        def value(name):
            return re.search(rf'^\s*{name}\s*=\s*"((?:[^"\\]|\\.)*)"', tfvars, re.M).group(1)

        block = re.search(r"^hosts\s*=\s*\{(.*?)^\}", tfvars, re.M | re.S).group(1)
        hosts = dict(re.findall(r'^\s*(identity|control_api|operator|work)\s*=\s*"([^"]+)"', block, re.M))
        identity = FAMILIES["munaxa-nonprod-identity"]["containers"]["identity"]["environment"]
        probe = FAMILIES["munaxa-nonprod-identity-probe"]["containers"]["identity-probe"]["environment"]
        self.assertEqual(identity["IDENTITY_SIGNING_KID"], value("identity_signing_kid"))
        self.assertEqual(probe["PROBE_SIGNING_KID"], value("identity_signing_kid"))
        self.assertEqual(probe["PROBE_PUBLIC_KEYS"], json.loads('"' + value("identity_public_keys") + '"'))
        self.assertEqual(identity["MFA_ENCRYPTION_PRIMARY_KID"], value("mfa_primary_kid"))
        self.assertEqual(identity["MFA_POLICY"], value("mfa_policy"))
        self.assertEqual(identity["IDENTITY_BASE_URL"], "https://" + hosts["identity"])
        self.assertEqual(identity["CSRF_TRUSTED_ORIGINS"], ",".join("https://" + hosts[k] for k in ("identity", "work", "operator")))
        self.assertEqual(probe["PROBE_HOST"], hosts["identity"])
        self.assertEqual(probe["PROBE_OPERATOR_HOST"], hosts["operator"])
        self.assertEqual(probe["PROBE_CONTROL_API_HOST"], hosts["control_api"])
        self.assertEqual(probe["PROBE_UNKNOWN_HOST"], "unknown." + hosts["identity"].split(".", 1)[1])
        if re.search(r"^\s*identity_default_organisation\s*=", tfvars, re.M):
            self.assertEqual(identity["IDENTITY_DEFAULT_ORGANISATION"], value("identity_default_organisation"))
        else:
            self.assertEqual(identity["IDENTITY_DEFAULT_ORGANISATION"], "")

    def test_db_admin_command_and_probe_loader_are_pinned_by_their_sha256(self):
        c = FAMILIES["munaxa-nonprod-db-admin"]["containers"]["db-admin"]
        self.assertEqual(c["commandSha256"], hashlib.sha256(DB_SCRIPT.encode()).hexdigest())
        self.assertEqual(FAMILIES["munaxa-nonprod-identity-probe"]["loaderSha256"], hashlib.sha256(LOADER.encode()).hexdigest())

    def test_the_sandbox_sha256_equals_hashlib(self):
        source = SCRIPT[SCRIPT.index("SHA_K = ["):SCRIPT.index("def bare(")]
        namespace = {"__builtins__": {"bytearray": bytearray, "len": len, "range": range, "int": int, "zip": zip}}
        exec(source, namespace)  # noqa: S102
        sha = namespace["sha256_hex"]
        for text in ("", "abc", "a" * 55, "a" * 56, "a" * 64, "é ✓ \n" * 300, DB_SCRIPT, LOADER):
            with self.subTest(n=len(text)):
                self.assertEqual(sha(text), hashlib.sha256(text.encode()).hexdigest())

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
        with open(os.path.join(HERE, "c8g-operator-secret-stack.py"), encoding="utf-8") as f:
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
            # Review findings S-2 and C-4: everything that changes what runs, not only the listed fields.
            "identity-bootstrap:env-names": lambda td: td["containerDefinitions"][0]["environment"].append(
                {"name": "NODE_OPTIONS", "value": "--import data:text/javascript,x"}),
            "identity-bootstrap:shape": lambda td: td["containerDefinitions"][0].update(entryPoint=["sh", "-c"]),
            "namespaces": lambda td: td.update(pidMode="task"),
            "volumes": lambda td: td.update(volumes=[{"name": "x", "host": {"sourcePath": "/"}}]),
            "identity-bootstrap:unexpected-source": lambda td: td["containerDefinitions"][0].update(
                environmentFiles=[{"value": "arn:aws:s3:::x/y.env", "type": "s3"}]),
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

    def test_owner_review_b1_every_environment_value_is_pinned(self):
        # Owner review B-1: a revision whose PGHOST points elsewhere would hand the RDS master password
        # (and, through ALTER ROLE, the owner and app passwords) to that host. Every value of every
        # Stage E container is compared, not only the names.
        attacker = "db.attacker.example"
        cases = [
            ("munaxa-nonprod-db-admin", "db-admin", "PGHOST", attacker),
            ("munaxa-nonprod-db-admin", "db-admin", "PGPORT", "443"),
            ("munaxa-nonprod-db-admin", "db-admin", "HOME", "/"),
            ("munaxa-nonprod-identity-migrate", "identity-migrate", "NODE_ENV", "development"),
            ("munaxa-nonprod-identity-bootstrap", "identity-bootstrap", "NODE_ENV", "development"),
            ("munaxa-nonprod-identity", "identity", "IDENTITY_BASE_URL", "https://" + attacker),
            ("munaxa-nonprod-identity", "identity", "MFA_POLICY", "disabled"),
            ("munaxa-nonprod-identity", "identity", "CSRF_TRUSTED_ORIGINS", "https://" + attacker),
            ("munaxa-nonprod-identity-probe", "identity-probe", "PROBE_PUBLIC_KEYS", "[]"),
            ("munaxa-nonprod-identity-probe", "identity-probe", "PROBE_HOST", attacker),
            ("munaxa-nonprod-identity-probe", "throwaway-account", "NODE_ENV", "development"),
        ]
        for family, name, var, value in cases:
            with self.subTest(family=family, var=var):
                fake = FakeEcs()
                td = render(family, 2)
                for e in container(td, name)["environment"]:
                    if e["name"] == var:
                        e["value"] = value
                fake.register(family, td)
                r = guard(fake, pinned_script() if family.endswith("probe") else SCRIPT, FAMILY=family)
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(f"{name}:env:{var}", r["families"][0]["problems"])
                self.assertNotIn(value, json.dumps(r), "a problem code never carries the value")

    def test_owner_review_b1_every_environment_name_has_a_pinned_value(self):
        for family, spec in FAMILIES.items():
            for name, cs in spec["containers"].items():
                names = [n for n in cs["environmentNames"] if not (cs.get("probeLoader") and n in ("PROBE_COMMIT", "PROBE_SHA256"))]
                self.assertEqual(sorted((cs.get("environment") or {}).keys()), sorted(names), (family, name))

    def test_owner_review_b8_unknown_task_and_container_fields_fail(self):
        cases = {
            "task-field:proxyConfiguration": lambda td: td.update(proxyConfiguration={"type": "APPMESH", "containerName": "identity-bootstrap"}),
            "task-field:ephemeralStorage": lambda td: td.update(ephemeralStorage={"sizeInGiB": 200}),
            "task-field:enableFaultInjection": lambda td: td.update(enableFaultInjection=True),
            "task-field:inferenceAccelerators": lambda td: td.update(inferenceAccelerators=[{"deviceName": "x", "deviceType": "y"}]),
            "runtime-platform": lambda td: td.update(runtimePlatform={"cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX"}),
            "task-size": lambda td: td.update(cpu="4096"),
            "launch": lambda td: td.update(requiresCompatibilities=["EC2", "FARGATE"]),
            "volumes": lambda td: td.update(volumes=[{"name": "x", "configuredAtLaunch": True}]),
            "identity-bootstrap:fields": lambda td: td["containerDefinitions"][0].update(ulimits=[{"name": "nofile", "softLimit": 1, "hardLimit": 1}]),
        }
        more = {
            "dockerLabels": {"x": "y"},
            "firelensConfiguration": {"type": "fluentbit"},
            "restartPolicy": {"enabled": True},
            "portMappings": [{"containerPort": 22, "hostPort": 22, "protocol": "tcp"}],
            "versionConsistency": "disabled",
            "memory": 4096,
            "startTimeout": 600,
        }
        for field, value in more.items():
            cases["identity-bootstrap:fields:" + field] = (lambda f, v: lambda td: td["containerDefinitions"][0].update({f: v}))(field, value)
        for problem, change in cases.items():
            with self.subTest(problem=problem):
                fake = FakeEcs()
                td = render("munaxa-nonprod-identity-bootstrap", 2)
                change(td)
                fake.register("munaxa-nonprod-identity-bootstrap", td)
                r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(problem.split(":fields:")[0] + (":fields" if ":fields:" in problem else ""), r["families"][0]["problems"])

    def test_owner_review_b8_ecs_defaults_still_pass(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity-bootstrap", 2)
        c = td["containerDefinitions"][0]
        c.update(restartPolicy={"enabled": False}, versionConsistency="enabled", ulimits=[], dockerLabels={}, cpu=0)
        td.update(proxyConfiguration=None, inferenceAccelerators=[], ephemeralStorage={})
        fake.register("munaxa-nonprod-identity-bootstrap", td)
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")["result"], "PASS")

    def test_pass_c_an_empty_value_ecs_omits_still_passes(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity", 2)
        for e in container(td, "identity")["environment"]:
            if e["name"] == "IDENTITY_DEFAULT_ORGANISATION":
                self.assertEqual(e.pop("value"), "")
        fake.register("munaxa-nonprod-identity", td)
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-identity")["result"], "PASS")

    def test_pass_c_a_correctly_named_volume_with_another_source_fails(self):
        for extra in ({"efsVolumeConfiguration": {"fileSystemId": "fs-1"}}, {"host": {"sourcePath": "/"}}, {"configuredAtLaunch": True}):
            with self.subTest(extra=extra):
                fake = FakeEcs()
                td = render("munaxa-nonprod-identity-probe", 2)
                td["volumes"][0].update(extra)
                fake.register("munaxa-nonprod-identity-probe", td)
                r = guard(fake, pinned_script(), FAMILY="munaxa-nonprod-identity-probe")
                self.assertIn("volumes", r["families"][0]["problems"])

    def test_owner_review_b8_the_identity_port_mapping_is_the_only_one(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity", 2)
        container(td, "identity")["portMappings"] = [{"containerPort": 4001, "hostPort": 4001, "protocol": "tcp"},
                                                      {"containerPort": 9229, "hostPort": 9229, "protocol": "tcp"}]
        fake.register("munaxa-nonprod-identity", td)
        r = guard(fake, FAMILY="munaxa-nonprod-identity")
        self.assertIn("identity:fields", r["families"][0]["problems"])

    def test_shape_and_command_drift_in_every_family_is_named(self):
        cases = [
            ("munaxa-nonprod-identity-migrate", "identity-migrate:command", lambda td: container(td, "identity-migrate").update(command=["sh", "-c", "env"])),
            ("munaxa-nonprod-identity-migrate", "identity-migrate:shape", lambda td: container(td, "identity-migrate").update(entryPoint=["node"])),
            ("munaxa-nonprod-identity", "identity:command", lambda td: container(td, "identity").update(command=["node", "-e", "x"])),
            ("munaxa-nonprod-identity", "identity:env-names", lambda td: container(td, "identity")["environment"].append({"name": "NODE_OPTIONS", "value": "x"})),
            ("munaxa-nonprod-identity", "identity:shape", lambda td: container(td, "identity")["linuxParameters"]["capabilities"].update(add=["SYS_PTRACE"])),
            ("munaxa-nonprod-identity", "identity:shape", lambda td: container(td, "identity").update(readonlyRootFilesystem=False)),
            ("munaxa-nonprod-identity", "valkey:command", lambda td: container(td, "valkey").update(command=["valkey-server"])),
            ("munaxa-nonprod-identity", "identity:shape", lambda td: container(td, "identity")["logConfiguration"]["options"].update({"awslogs-group": "/other"})),
            ("munaxa-nonprod-db-admin", "db-admin:command", lambda td: container(td, "db-admin").update(command=[DB_SCRIPT + "\nenv"])),
            ("munaxa-nonprod-db-admin", "db-admin:shape", lambda td: container(td, "db-admin").pop("user")),
        ]
        for family, problem, change in cases:
            with self.subTest(problem=problem):
                fake = FakeEcs()
                td = render(family, 2)
                change(td)
                fake.register(family, td)
                r = guard(fake, FAMILY=family)
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(problem, r["families"][0]["problems"])

    def test_the_probe_task_shape_is_enforced(self):
        cases = [
            ("identity-probe:probe-loader", lambda td: container(td, "identity-probe").update(
                command=container(td, "identity-probe")["command"][:3] + [container(td, "identity-probe")["command"][3] + "\nconsole.log(1);"])),
            ("throwaway-account:probe-loader", lambda td: container(td, "throwaway-account")["command"].__setitem__(
                3, container(td, "throwaway-account")["command"][3].replace("delete process.env[name]", "void name"))),
            ("identity-probe:secret-names", lambda td: container(td, "identity-probe")["secrets"].append(
                container(td, "throwaway-account")["secrets"][0])),
            ("identity-probe:shape", lambda td: container(td, "identity-probe").pop("dependsOn")),
            ("throwaway-account:shape", lambda td: container(td, "throwaway-account").update(essential=True)),
            ("namespaces", lambda td: td.update(pidMode="task")),
            ("throwaway-account:env:PROBE_STAGE", lambda td: [e.update(value="probe") for e in container(td, "throwaway-account")["environment"] if e["name"] == "PROBE_STAGE"]),
        ]
        for problem, change in cases:
            with self.subTest(problem=problem):
                fake = FakeEcs()
                td = render("munaxa-nonprod-identity-probe", 2)
                change(td)
                fake.register("munaxa-nonprod-identity-probe", td)
                r = guard(fake, pinned_script(), FAMILY="munaxa-nonprod-identity-probe")
                self.assertEqual(r["result"], "FAIL")
                self.assertIn(problem, r["families"][0]["problems"])

    def test_a_partial_reference_must_stay_partial_and_a_full_one_full(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity-bootstrap", 2)
        for s in td["containerDefinitions"][0]["secrets"]:
            if s["name"] == "IDENTITY_OWNER_EMAIL":
                s["valueFrom"] = s["valueFrom"].replace("identity-operator:", "identity-bootstrap:")
        fake.register("munaxa-nonprod-identity-bootstrap", td)
        r = guard(fake, FAMILY="munaxa-nonprod-identity-bootstrap")
        self.assertIn("identity-bootstrap:secret-ref:IDENTITY_OWNER_EMAIL", r["families"][0]["problems"])

    def test_la0_the_bootstrap_reads_the_operator_secret_and_nothing_reads_the_legacy_one(self):
        # L-A0 redesign (D-LA0, report 2026-11-15 file 03): one secret, generated by Secrets Manager; the
        # one-run identity-bootstrap copy is gone, and the probe never names identity-operator.
        refs = FAMILIES["munaxa-nonprod-identity-bootstrap"]["containers"]["identity-bootstrap"]["secrets"]
        self.assertEqual({k: v["secret"] for k, v in refs.items() if k.startswith("IDENTITY_OWNER_")},
                         {"IDENTITY_OWNER_EMAIL": "munaxa-nonprod/identity-operator",
                          "IDENTITY_OWNER_PASSWORD": "munaxa-nonprod/identity-operator"})
        text = json.dumps(MANIFEST)
        self.assertNotIn("munaxa-nonprod/identity-bootstrap", text)
        for family, spec in FAMILIES.items():
            if family != "munaxa-nonprod-identity-bootstrap":
                self.assertNotIn("identity-operator", json.dumps(spec), family)

    def test_the_service_definition_checks_both_containers(self):
        fake = FakeEcs()
        td = render("munaxa-nonprod-identity", 3)
        td["containerDefinitions"][1]["image"] = td["containerDefinitions"][1]["image"][:-1] + "0"
        fake.register("munaxa-nonprod-identity", td)
        r = guard(fake, FAMILY="munaxa-nonprod-identity")
        self.assertIn("valkey:image", r["families"][0]["problems"])

    def test_an_unpinned_manifest_never_accepts_a_probe(self):
        fake = FakeEcs()
        r = guard(fake, pinned_script(UNPINNED), FAMILY="munaxa-nonprod-identity-probe")
        self.assertIn("identity-probe:probe-not-pinned-in-manifest", r["families"][0]["problems"])
        self.assertIn("throwaway-account:probe-not-pinned-in-manifest", r["families"][0]["problems"])

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
        for bad in ("", "evil.example", ALB.replace("eu-central-1", "us-east-1"),
                    # owner review A-11: another load balancer in the Region is not the session ALB
                    "munaxa-prod-1234567890.eu-central-1.elb.amazonaws.com", "internal-munaxa-nonprod-1.eu-central-1.elb.amazonaws.com"):
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

    def test_owner_review_a4_an_expired_task_arn_is_never_in_progress(self):
        fake = FakeEcs()
        arn = f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/" + "c" * 32
        fake.overrides["DescribeTasks"] = lambda p: {"tasks": [], "failures": [{"arn": arn, "reason": "MISSING"}]}
        r = guard(fake, MODE="status", TASK_ARN=arn)
        self.assertEqual((r["result"], r["code"]), ("NOT_FOUND", "TASK_EXPIRED_OR_UNKNOWN"))

    def test_owner_review_a4_a_task_expiring_between_list_and_describe_is_unknown(self):
        fake = FakeEcs()
        self.assertEqual(guard(fake, FAMILY="munaxa-nonprod-identity-migrate", MODE="run", EXPECTED_REVISION=1,
                               RUN_TOKEN="s4-migrate-00001")["result"], "STARTED")
        fake.finish()
        base = fake.op_DescribeTasks
        fake.overrides["DescribeTasks"] = lambda p: dict(base(p), failures=[{"arn": "x", "reason": "MISSING"}])
        r = guard(fake, MODE="status", RUN_TOKEN="s4-migrate-00001")
        self.assertEqual((r["result"], r["code"]), ("UNKNOWN", "SOME_TASKS_EXPIRED"))

    def test_owner_review_a4_other_describe_failures_fail(self):
        fake = FakeEcs()
        arn = f"arn:aws:ecs:{REGION}:{ACCOUNT}:task/{CLUSTER}/" + "c" * 32
        fake.overrides["DescribeTasks"] = lambda p: {"tasks": [], "failures": [{"arn": arn, "reason": "AccessDenied by policy"}]}
        self.assertEqual(guard(fake, MODE="status", TASK_ARN=arn)["code"], "DESCRIBE_FAILURES")

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
        r = guard(FakeEcs(), MODE="status", RUN_TOKEN="never-used-0001")
        # Not "not started": ECS forgets stopped tasks after about an hour (review finding C-3).
        self.assertEqual((r["result"], r["code"]), ("NOT_FOUND", "NOT_LISTED_MAY_HAVE_EXPIRED"))
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

    def test_owner_review_a5_no_live_runbook_starts_a_task_by_hand(self):
        # Owner review A-5: the revision lint alone let a hand-written RunTask (any revision) stand.
        runbooks = [
            os.path.join(ROOT, "docs", "aws-migration", "agent-reports", "2026-11-11-identity-final-operator-runbook", "00-IDENTITY-FINAL-OPERATOR-RUNBOOK.md"),
            os.path.join(ROOT, "docs", "aws-migration", "agent-reports", "2026-11-11-identity-first-session-operator-checklist", "00-IDENTITY-FIRST-SESSION-OPERATOR-CHECKLIST.md"),
        ]
        by_hand = re.compile(r'"startedBy"|"taskDefinition"\s*:|operation_name="RunTask"|"RunTask",\s*\{|^\|\s*S-\d+[a-z]?\s*\|\s*`RunTask`')
        offenders = []
        for path in runbooks:
            with open(path, encoding="utf-8") as f:
                lines = f.read().split("\n")
            for n, line in enumerate(lines):
                if by_hand.search(line):
                    offenders.append(f"{os.path.basename(path)}:{n + 1}")
                if "aws ecs run-task" in line and not any("SUPERSEDED" in x for x in lines[max(0, n - 12):n]):
                    offenders.append(f"{os.path.basename(path)}:{n + 1}")
        self.assertEqual(offenders, [])

    def test_pass_c_c3_no_run_one_and_the_readme_keeps_e1_families_out_of_run_task(self):
        # Owner review C-3: the checklist still defined run_one, and the README allowed a hand-run db-admin.
        checklist = read("docs", "aws-migration", "agent-reports", "2026-11-11-identity-first-session-operator-checklist",
                         "00-IDENTITY-FIRST-SESSION-OPERATOR-CHECKLIST.md")
        self.assertNotRegex(checklist, r"(?m)^\s*run_one\b|run_one\(\)\s*\{")
        readme = read("infra", "aws", "README.md")
        step = readme[readme.index("3. Run the db-admin task"):readme.index("using the\n   `run_task_network`")]
        hand = step[step.index("`aws ecs run-task` is used only for"):]
        for family in ("db-admin", "identity-migrate", "identity-bootstrap", "identity-probe", "`identity`"):
            self.assertIn(family, step[:step.index("`aws ecs run-task` is used only for")])
            self.assertNotIn(family, hand)

    def test_owner_review_b7_c8g_call_records_are_never_evidence(self):
        self.assertIn("never committed as evidence", read("scripts", "aws", "connector", "c8g-operator-secret-stack.py"))
        runbook = read("docs", "aws-migration", "agent-reports", "2026-11-11-identity-final-operator-runbook",
                       "00-IDENTITY-FINAL-OPERATOR-RUNBOOK.md")
        self.assertIn("so they are never committed as evidence", runbook)
        # D-LA0 (15 Nov 2026): C-8 and C-8R are retired, never run; the runbook says so.
        self.assertIn("C-8 and C-8R are retired (owner decision D-LA0", runbook)
        for name in ("c8-create-operator-secrets.py", "c8r-recover-operator-secrets.py", "c16-delete-bootstrap-secret.py"):
            self.assertFalse(os.path.exists(os.path.join(HERE, name)), name)

    def test_the_pattern_catches_the_old_forms(self):
        for line in ("run_one munaxa-nonprod-db-admin:1 $SG", "run_one $C-identity-bootstrap:1 \"$SG\"",
                     'params={"taskDefinition": "munaxa-nonprod-identity-bootstrap:1"}', "`munaxa-nonprod-identity-migrate:12`"):
            self.assertRegex(line, self.PATTERN)
        self.assertNotRegex("munaxa-nonprod-identity-bootstrap:REVISION_FROM_E1", self.PATTERN)


if __name__ == "__main__":
    unittest.main()
