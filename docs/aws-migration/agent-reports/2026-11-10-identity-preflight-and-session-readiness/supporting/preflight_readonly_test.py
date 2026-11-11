#!/usr/bin/env python3
"""Offline tests for preflight-readonly.sh. No AWS call: `aws` on PATH is preflight_aws_stub.py.

    pip install jmespath            # the stub applies the script's --query expressions with it
    python3 -I preflight_readonly_test.py -v

Covers: the expected state (PASS), wrong account and unreadable account (stop before any other
call), root refused unless ALLOW_ROOT_READONLY=yes, non-root roles and users accepted, task
definition revisions listed per exact family, the bootstrap task on the Identity api image, the
migrate task's DATABASE_MIGRATION_URL, the embedded CloudTrail filter (identical to the helper), AWS CLI failures (access denied, throttling, network, missing helper; never PASS), expected
and unexpected missing resources (ABSENT is a FAIL, not an ERROR; the bootstrap secret's absence is
a PASS), a FAIL plus an ERROR (INCOMPLETE wins), and that only allowlisted read calls are made and
no secret value, environment value or policy content is printed.
"""
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "preflight-readonly.sh")
STUB = os.path.join(HERE, "preflight_aws_stub.py")
DENIALS = os.path.join(HERE, "..", "..", "2026-11-10-identity-first-session-preparation", "supporting",
                       "cloudtrail-denials.py")

ACCOUNT = "229251310592"
C = "munaxa-nonprod"
PIN_I = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
PIN_M = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
D_ID = "71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156"
D_VK = "757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"
D_MG = "d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820"
D_PG = "5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
ECR = f"{ACCOUNT}.dkr.ecr.eu-central-1.amazonaws.com"
SM = f"arn:aws:secretsmanager:eu-central-1:{ACCOUNT}:secret:"
VPC = "vpc-0a1b2c3d4e5f60718"
KEY = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0"
KEY_ARN = f"arn:aws:kms:eu-central-1:{ACCOUNT}:key/{KEY}"
CANARY = "CANARY-must-never-be-printed"
RENDERED = os.path.join(HERE, "session-roles-rendered.json")
CI_ROLE = "munaxa-shared-ci-nonprod-session"
DEP_ROLE = "munaxa-shared-deployer-nonprod-session"
POLICY = f"arn:aws:iam::{ACCOUNT}:policy/munaxa-shared/bootstrap/"
READ_ARN, SREAD_ARN = POLICY + "munaxa-shared-deployer-read", POLICY + "munaxa-shared-deployer-nonprod-session-read"
STATE_KEY = f"arn:aws:kms:eu-central-1:{ACCOUNT}:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5"
IGW, ENDPOINT = "igw-0123456789abcdef0", "vpce-0123456789abcdef0"
# The complete set of operations the script may call. Changing ALLOWED_OPS needs a reviewed edit here.
EXPECTED_OPS = [
    "sts:get-caller-identity", "rds:describe-db-instances", "ecs:describe-clusters",
    "ecs:list-task-definition-families", "ecs:list-task-definitions", "ecs:describe-task-definition",
    "ecs:list-services", "ecs:list-tasks", "secretsmanager:describe-secret",
    "secretsmanager:list-secret-version-ids", "secretsmanager:list-secrets", "kms:describe-key",
    "elbv2:describe-load-balancers", "elbv2:describe-target-groups", "ec2:describe-nat-gateways",
    "ec2:describe-addresses", "ec2:describe-instances", "ec2:describe-network-interfaces", "ec2:describe-subnets",
    "ec2:describe-security-groups", "ec2:describe-route-tables", "scheduler:list-schedules",
    "scheduler:get-schedule", "acm:list-certificates", "acm:describe-certificate", "ecr:describe-images",
    "iam:get-role", "iam:list-roles", "iam:list-role-policies", "iam:list-attached-role-policies",
    "iam:get-role-policy", "iam:get-policy", "iam:get-policy-version", "ec2:describe-vpcs",
    "ec2:describe-internet-gateways", "ec2:describe-vpc-endpoints", "cloudtrail:lookup-events"]
# What the expected run calls, in order, with counts (consecutive calls of one operation collapsed).
BASELINE_CALLS = [
    ("sts:get-caller-identity", 1), ("rds:describe-db-instances", 1), ("ecs:describe-clusters", 1),
    ("ecs:list-task-definition-families", 1), ("ecs:list-task-definitions", 4), ("ecs:describe-task-definition", 8),
    ("kms:describe-key", 1), ("secretsmanager:describe-secret", 1), ("secretsmanager:list-secret-version-ids", 1),
    ("secretsmanager:describe-secret", 1), ("secretsmanager:list-secret-version-ids", 1),
    ("secretsmanager:list-secrets", 1), ("ecs:list-services", 1), ("ecs:list-tasks", 1),
    ("elbv2:describe-load-balancers", 1), ("elbv2:describe-target-groups", 1), ("ec2:describe-nat-gateways", 1),
    ("ec2:describe-addresses", 1), ("ec2:describe-instances", 1), ("ec2:describe-network-interfaces", 1),
    ("scheduler:list-schedules", 1), ("scheduler:get-schedule", 1), ("acm:list-certificates", 1),
    ("acm:describe-certificate", 1), ("ecr:describe-images", 2), ("iam:get-role", 2), ("iam:list-roles", 1),
    ("iam:get-role", 1), ("iam:list-role-policies", 1), ("iam:list-attached-role-policies", 1), ("iam:get-role", 1),
    ("iam:list-role-policies", 1), ("iam:list-attached-role-policies", 1), ("iam:get-role-policy", 2),
    ("iam:get-policy", 1), ("iam:get-policy-version", 1), ("iam:get-policy", 1), ("iam:get-policy-version", 1),
    ("kms:describe-key", 1), ("cloudtrail:lookup-events", 2), ("ec2:describe-vpcs", 1), ("ec2:describe-subnets", 1),
    ("ec2:describe-route-tables", 1), ("ec2:describe-vpc-endpoints", 1), ("ec2:describe-security-groups", 1),
    ("ec2:describe-internet-gateways", 1)]
SAFE_OPTIONS = {"--certificate-arn", "--cluster", "--clusters", "--db-instance-identifier", "--family-prefix",
                "--filter", "--filters", "--image-ids", "--include-planned-deletion", "--includes", "--key-id",
                "--name", "--name-prefix", "--output", "--path-prefix", "--policy-arn", "--policy-name", "--query",
                "--region", "--repository-name", "--role-name", "--secret-id", "--start-time", "--status",
                "--task-definition", "--version-id"}
READ_ONLY = re.compile(r"^(describe|list|get)-|^lookup-events$")
FORBIDDEN = {"get-secret-value", "batch-get-secret-value", "get-login-password", "get-authorization-token",
             "get-session-token", "get-object"}


def td(family, images, secrets):
    return {"json": {"taskDefinition": {
        "family": f"{C}-{family}", "revision": 1, "status": "ACTIVE",
        "containerDefinitions": [
            {"name": f"c{i}", "image": image, "secrets": [{"name": n, "valueFrom": v} for n, v in secrets[i]],
             "environment": [{"name": "SAMPLE", "value": CANARY}]}
            for i, image in enumerate(images)]}}}


def script_section(name, end, path=None):
    with open(path or SCRIPT) as f:
        return re.search(rf"{name}=\$\(\n  cat <<'{end}'\n(.*?)\n{end}\n\)", f.read(), re.S).group(1)


def aws_shape(doc):
    """A canonical policy document as IAM may return it: single values as strings, lists in another
    order, keys in another order. The verifier must treat it as equal."""
    def one(v):
        return v[0] if isinstance(v, list) and len(v) == 1 else list(reversed(v)) if isinstance(v, list) else v
    out = []
    for s in reversed(doc["Statement"]):
        s2 = {}
        for k in reversed(list(s)):
            v = s[k]
            if k == "Condition":
                v = {op: {key: one(val) for key, val in m.items()} for op, m in v.items()}
            elif k == "Principal" and isinstance(v, dict):
                v = {pt: one(x) for pt, x in v.items()}
            else:
                v = one(v)
            s2[k] = v
        out.append(s2)
    return {"Statement": out, "Version": doc["Version"]}


def iam_fixture():
    spec = json.loads(script_section("SESSION_SPEC", "SPEC"))
    s = {"iam list-roles": {"json": {"Roles": [{"RoleName": n} for n in (
        "munaxa-shared-ci-nonprod", "munaxa-shared-deployer-nonprod", CI_ROLE, DEP_ROLE)]}},
         "kms describe-key alias/munaxa-shared-tfstate": {"json": {"KeyMetadata": {"Arn": STATE_KEY}}}}
    for name, r in spec["roles"].items():
        s[f"iam get-role {name}"] = {"json": {"Role": {
            "RoleName": name, "Path": spec["path"], "Arn": r["Arn"], "MaxSessionDuration": 3600,
            "RoleId": "AROAEXAMPLE", "AssumeRolePolicyDocument": aws_shape(r["trust"])}}}
        s[f"iam list-role-policies {name}"] = {"json": {"PolicyNames": list(r["inline"])}}
        s[f"iam list-attached-role-policies {name}"] = {"json": {"AttachedPolicies": [
            {"PolicyName": a.rsplit("/", 1)[1], "PolicyArn": a} for a in r["attached"]]}}
        for pname, doc in r["inline"].items():
            s[f"iam get-role-policy {name} {pname}"] = {"json": {
                "RoleName": name, "PolicyName": pname, "PolicyDocument": aws_shape(doc)}}
        for arn, doc in r["attached"].items():
            s[f"iam get-policy {arn}"] = {"json": {"Policy": {"Arn": arn, "DefaultVersionId": "v3"}}}
            s[f"iam get-policy-version {arn} v3"] = {"json": {"PolicyVersion": {
                "VersionId": "v3", "IsDefaultVersion": True, "Document": aws_shape(doc)}}}
    return s


def net_fixture():
    def tags(name):
        return [{"Key": "Project", "Value": "munaxa"}, {"Key": "Name", "Value": name}]
    subnets = [("public-a", "eu-central-1a", "10.130.0.0/24"), ("public-b", "eu-central-1b", "10.130.1.0/24"),
               ("db-a", "eu-central-1a", "10.130.64.0/24"), ("db-b", "eu-central-1b", "10.130.65.0/24"),
               ("db-c", "eu-central-1c", "10.130.66.0/24")]
    local = {"DestinationCidrBlock": "10.130.0.0/16", "GatewayId": "local", "Origin": "CreateRouteTable", "State": "active"}

    def assoc(rt, sub):
        return {"Main": False, "RouteTableAssociationId": f"rtbassoc-{sub}", "RouteTableId": rt,
                "SubnetId": f"subnet-{sub}", "AssociationState": {"State": "associated"}}
    return {
        "ec2 describe-vpcs": {"json": {"Vpcs": [{"VpcId": VPC, "CidrBlock": "10.130.0.0/16", "State": "available",
                                                 "IsDefault": False, "Tags": tags(C)}]}},
        "ec2 describe-subnets": {"json": {"Subnets": [
            {"SubnetId": f"subnet-{n}", "VpcId": VPC, "AvailabilityZone": az, "CidrBlock": cidr,
             "MapPublicIpOnLaunch": False, "State": "available", "Tags": tags(f"{C}-{n}")} for n, az, cidr in subnets]}},
        "ec2 describe-internet-gateways": {"json": {"InternetGateways": [
            {"InternetGatewayId": IGW, "Attachments": [{"VpcId": VPC, "State": "available"}], "Tags": tags(f"{C}-igw")}]}},
        "ec2 describe-vpc-endpoints": {"json": {"VpcEndpoints": [
            {"VpcEndpointId": ENDPOINT, "VpcId": VPC, "ServiceName": "com.amazonaws.eu-central-1.s3",
             "VpcEndpointType": "Gateway", "State": "available", "RouteTableIds": ["rtb-public"], "Tags": tags(f"{C}-s3")}]}},
        "ec2 describe-route-tables": {"json": {"RouteTables": [
            {"RouteTableId": "rtb-main", "VpcId": VPC, "Tags": [], "Routes": [local],
             "Associations": [{"Main": True, "RouteTableAssociationId": "rtbassoc-main", "RouteTableId": "rtb-main",
                               "AssociationState": {"State": "associated"}}]},
            {"RouteTableId": "rtb-public", "VpcId": VPC, "Tags": tags(f"{C}-rt-public"), "Routes": [
                local,
                {"DestinationCidrBlock": "0.0.0.0/0", "GatewayId": IGW, "Origin": "CreateRoute", "State": "active"},
                {"DestinationPrefixListId": "pl-6ea54007", "GatewayId": ENDPOINT, "Origin": "CreateRoute", "State": "active"}],
             "Associations": [assoc("rtb-public", "public-a"), assoc("rtb-public", "public-b")]},
            {"RouteTableId": "rtb-db", "VpcId": VPC, "Tags": tags(f"{C}-rt-db"), "Routes": [local],
             "Associations": [assoc("rtb-db", s) for s in ("db-a", "db-b", "db-c")]}]}},
        "ec2 describe-security-groups": {"json": {"SecurityGroups": [
            {"GroupName": g, "GroupId": f"sg-{i}", "VpcId": VPC, "IpPermissions": [], "IpPermissionsEgress": [],
             "Tags": tags(f"{C}-default-unused" if g == "default" else g)}
            for i, g in enumerate(["default"] + [f"{C}-{x}" for x in ("alb", "database", "db-admin", "identity", "identity-migrate")])]}},
    }


def trail(*codes):
    events = [{"eventTime": "2026-11-10T07:00:00Z", "eventSource": "ecs.amazonaws.com", "eventName": "ListTasks",
               "userIdentity": {"arn": f"arn:aws:iam::{ACCOUNT}:root"}, **({"errorCode": c} if c else {})}
              for c in codes]
    return {"json": {"Events": [{"EventId": str(i), "CloudTrailEvent": json.dumps(e)} for i, e in enumerate(events)]}}


def baseline():
    ident_ref = f"{SM}{C}/identity-Ab12Cd"
    mig_ref = f"{SM}{C}/identity-migrate-Ef34Gh"
    boot_ref = f"{SM}{C}/identity-bootstrap"
    master = f"{SM}rds!db-11112222-3333-4444-5555-666677778888-XyZ123"
    return {
        "sts get-caller-identity": {"json": {"Account": ACCOUNT, "UserId": "AROAEXAMPLE:operator",
                                             "Arn": f"arn:aws:sts::{ACCOUNT}:assumed-role/AWSReservedSSO_ReadOnly_0123456789abcdef/operator"}},
        f"rds describe-db-instances {C}-pg": {"json": {"DBInstances": [{
            "DBInstanceStatus": "stopped", "DBInstanceClass": "db.t4g.micro", "PubliclyAccessible": False,
            "DeletionProtection": True, "MultiAZ": False, "StorageEncrypted": True, "DBSubnetGroup": {"VpcId": VPC},
            "DBParameterGroups": [{"DBParameterGroupName": f"{C}-pg16", "ParameterApplyStatus": "in-sync"}],
            "MasterUserSecret": {"SecretArn": master, "SecretStatus": "active"}, "EngineVersion": "16.4"}]}},
        f"ecs describe-clusters": {"json": {"clusters": [{"clusterName": C, "status": "ACTIVE", "runningTasksCount": 0,
                                                          "pendingTasksCount": 0, "activeServicesCount": 0}], "failures": []}},
        # As in ECS: list-task-definition-families matches a prefix, list-task-definitions' familyPrefix
        # is the exact family name, so the bare prefix lists nothing (the 10 Nov owner run).
        "ecs list-task-definition-families": {"json": {"families": [
            f"{C}-{f}" for f in ("db-admin", "identity", "identity-bootstrap", "identity-migrate")]}},
        f"ecs list-task-definitions {C}": {"json": {"taskDefinitionArns": []}},
        **{f"ecs list-task-definitions {C}-{f}": {"json": {"taskDefinitionArns": [
            f"arn:aws:ecs:eu-central-1:{ACCOUNT}:task-definition/{C}-{f}:1"]}}
           for f in ("db-admin", "identity", "identity-bootstrap", "identity-migrate")},
        f"ecs describe-task-definition {C}-identity": td("identity", [
            f"{ECR}/munaxa-identity/api@sha256:{D_ID}", f"public.ecr.aws/valkey/valkey@sha256:{D_VK}"], [
            [("DATABASE_URL", f"{ident_ref}:DATABASE_URL::{PIN_I}"), ("REDIS_URL", f"{ident_ref}:REDIS_URL::{PIN_I}")],
            [("REDIS_PASSWORD", f"{ident_ref}:REDIS_PASSWORD::{PIN_I}")]]),
        f"ecs describe-task-definition {C}-identity-migrate": td("identity-migrate", [
            f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"], [
            [("DATABASE_MIGRATION_URL", f"{mig_ref}:DATABASE_MIGRATION_URL::{PIN_M}")]]),
        f"ecs describe-task-definition {C}-identity-bootstrap": td("identity-bootstrap", [
            f"{ECR}/munaxa-identity/api@sha256:{D_ID}"], [
            [("DIRECT_DATABASE_URL", f"{mig_ref}:DATABASE_MIGRATION_URL::{PIN_M}"),
             ("IDENTITY_OWNER_EMAIL", f"{boot_ref}:IDENTITY_OWNER_EMAIL::"),
             ("IDENTITY_OWNER_PASSWORD", f"{boot_ref}:IDENTITY_OWNER_PASSWORD::")]]),
        f"ecs describe-task-definition {C}-db-admin": td("db-admin", [
            f"public.ecr.aws/docker/library/postgres@sha256:{D_PG}"], [
            [("PGUSER", f"{master}:username::"), ("PGPASSWORD", f"{master}:password::"),
             ("IDENTITY_DATABASE_URL", f"{ident_ref}:DATABASE_URL::{PIN_I}"),
             ("IDENTITY_DATABASE_MIGRATION_URL", f"{mig_ref}:DATABASE_MIGRATION_URL::{PIN_M}")]]),
        f"kms describe-key alias/{C}-data": {"json": {"KeyMetadata": {
            "Arn": KEY_ARN, "KeyId": KEY, "KeyState": "Enabled", "KeyUsage": "ENCRYPT_DECRYPT"}}},
        f"secretsmanager describe-secret {C}/identity": {"json": {"ARN": f"{ident_ref}", "KmsKeyId": KEY_ARN}},
        f"secretsmanager describe-secret {C}/identity-migrate": {"json": {"ARN": f"{mig_ref}", "KmsKeyId": KEY_ARN}},
        f"secretsmanager list-secret-version-ids {C}/identity": {"json": {"Versions": [
            {"VersionId": PIN_I, "VersionStages": ["AWSCURRENT"]},
            {"VersionId": "00000000-0000-0000-0000-000000000001", "VersionStages": ["AWSPREVIOUS"]}]}},
        f"secretsmanager list-secret-version-ids {C}/identity-migrate": {"json": {"Versions": [
            {"VersionId": PIN_M, "VersionStages": ["AWSCURRENT"]}]}},
        "secretsmanager list-secrets": {"json": {"SecretList": []}},
        "ecs list-services": {"json": {"serviceArns": []}},
        "ecs list-tasks": {"json": {"taskArns": []}},
        "elbv2 describe-load-balancers": {"json": {"LoadBalancers": []}},
        "elbv2 describe-target-groups": {"json": {"TargetGroups": []}},
        "ec2 describe-nat-gateways": {"json": {"NatGateways": []}},
        "ec2 describe-addresses": {"json": {"Addresses": []}},
        "ec2 describe-instances": {"json": {"Reservations": []}},
        "ec2 describe-network-interfaces": {"json": {"NetworkInterfaces": []}},
        "scheduler list-schedules": {"json": {"Schedules": [
            {"Name": f"{C}-backstop-{n}", "State": "ENABLED"}
            for n in ["database", "identity", "control", "work", "school", "docs", "docs-worker", "a", "b", "c", "d"]]}},
        f"scheduler get-schedule {C}-backstop-database": {"json": {
            "ScheduleExpression": "cron(0 21 * * ? *)", "ScheduleExpressionTimezone": "UTC", "State": "ENABLED",
            "Target": {"Arn": "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance",
                       "Input": json.dumps({"DbInstanceIdentifier": f"{C}-pg"})}}},
        "acm list-certificates": {"json": {"CertificateSummaryList": [
            {"DomainName": "*.test.munaxa.com", "CertificateArn": f"arn:aws:acm:eu-central-1:{ACCOUNT}:certificate/1"},
            {"DomainName": "unrelated.example", "CertificateArn": f"arn:aws:acm:eu-central-1:{ACCOUNT}:certificate/2"}]}},
        "acm describe-certificate": {"json": {"Certificate": {
            "Status": "ISSUED", "NotAfter": "2027-05-22T23:59:59+00:00",
            "SubjectAlternativeNames": ["*.test.munaxa.com", "operator-test.munaxa.com"], "InUseBy": []}}},
        "ecr describe-images munaxa-identity/api": {"json": {"imageDetails": [{"imageTags": ["5277d71"]}]}},
        "ecr describe-images munaxa-identity/migrate": {"json": {"imageDetails": [{"imageTags": ["5277d71"]}]}},
        "iam get-role AWSServiceRoleForECS": {"json": {"Role": {"RoleName": "AWSServiceRoleForECS"}}},
        "iam get-role AWSServiceRoleForElasticLoadBalancing": {"json": {"Role": {"RoleName": "AWSServiceRoleForElasticLoadBalancing"}}},
        "cloudtrail lookup-events eu-central-1": trail(None, "ThrottlingException", None),
        "cloudtrail lookup-events us-east-1": trail(None),
        **iam_fixture(),
        **net_fixture(),
    }


ACCESS_DENIED = {"error": "AccessDeniedException", "message": "User is not authorized to perform this action"}
NETWORK = {"stderr": '\nCould not connect to the endpoint URL: "https://ecs.eu-central-1.amazonaws.com/"', "rc": 255}


class Run:
    def __init__(self, scenario, with_aws=True, extra_env=None, script_text=None):
        self.dir = tempfile.mkdtemp(prefix="preflight-test-")
        try:
            if script_text is None:
                shutil.copy(SCRIPT, self.dir)  # alone: the script must not need any other file
            else:
                with open(os.path.join(self.dir, "preflight-readonly.sh"), "w") as f:
                    f.write(script_text)
            cwd, tmp = os.path.join(self.dir, "cwd"), os.path.join(self.dir, "tmp")
            os.mkdir(cwd)
            os.mkdir(tmp)
            bindir = os.path.join(self.dir, "bin")
            os.mkdir(bindir)
            for tool in ("bash", "python3", "grep", "sed", "cut", "tr", "sort", "paste", "head", "date",
                         "mktemp", "rm", "dirname", "cat"):
                os.symlink(shutil.which(tool), os.path.join(bindir, tool))
            if with_aws:
                with open(os.path.join(bindir, "aws"), "w") as f:
                    f.write(f'#!/bin/sh\nexec "{sys.executable}" -I "{STUB}" "$@"\n')
                os.chmod(os.path.join(bindir, "aws"), 0o755)
            with open(os.path.join(self.dir, "scenario.json"), "w") as f:
                json.dump(scenario, f)
            log = os.path.join(self.dir, "calls.jsonl")
            open(log, "w").close()
            env = {"PATH": bindir, "STUB_SCENARIO": os.path.join(self.dir, "scenario.json"), "STUB_LOG": log,
                   "HOME": self.dir, "LANG": "C.UTF-8", "TMPDIR": tmp, **(extra_env or {})}
            proc = subprocess.run([shutil.which("bash"), os.path.join(self.dir, "preflight-readonly.sh")],
                                  env=env, capture_output=True, text=True, timeout=120, cwd=cwd)
            self.rc, self.out = proc.returncode, proc.stdout + proc.stderr
            self.leftovers = os.listdir(cwd) + os.listdir(tmp)
            with open(log) as f:
                self.calls = [json.loads(line) for line in f if line.strip()]
        finally:
            shutil.rmtree(self.dir)

    def status(self, check):
        m = re.search(rf"^{re.escape(check)} +(PASS|FAIL|ERROR)$", self.out, re.M)
        return m and m.group(1)

    def lines(self, status, check):
        return [l for l in self.out.splitlines() if l.startswith(f"  [{status}] {check}:")]


class Base(unittest.TestCase):
    maxDiff = None

    def run_with(self, change=None, **kwargs):
        scenario = baseline()
        if change:
            change(scenario)
        run = Run(scenario, **kwargs)
        self.assertSafeCalls(run)
        return run

    def assertSafeCalls(self, run):
        """Every run: only allowlisted operations, no option that redirects or reshapes a call, no
        endpoint override reaching the CLI, and no file left behind."""
        allowed = set(EXPECTED_OPS)
        for call in run.calls:
            self.assertIn(f"{call['service']}:{call['operation']}", allowed, call)
            for opt in call["options"]:
                self.assertIn(opt, SAFE_OPTIONS, call)
            if "--region" in call["options"]:
                self.assertEqual((call["service"], call["operation"]), ("cloudtrail", "lookup-events"), call)
            self.assertEqual(call.get("env"), {"AWS_CLI_AUTO_PROMPT": "off"}, call)
        self.assertEqual(run.leftovers, [], "temporary files left behind")

    def assertReadOnly(self, run):
        for call in run.calls:
            self.assertRegex(call["operation"], READ_ONLY, call)
            self.assertNotIn(call["operation"], FORBIDDEN, call)
        self.assertNotIn(CANARY, run.out)


class PreflightTest(Base):
    # -- expected state
    def test_expected_state_passes(self):
        run = self.run_with()
        self.assertEqual(run.rc, 0, run.out)
        self.assertIn("OVERALL: PASS (all 14 checks)", run.out)
        for check in ["P-1", "P-2", "P-3", "P-4", "P-5", "P-6", "P-7", "P-8", "P-9", "P-10", "P-11", "P-11b",
                      "P-12", "P-13"]:
            self.assertEqual(run.status(check), "PASS", f"{check}\n{run.out}")
        self.assertNotIn("[FAIL]", run.out)
        self.assertNotIn("[ERROR]", run.out)
        self.assertIn("events 3 denials 0", run.out)
        self.assertReadOnly(run)
        self.assertEqual(run.calls[0]["operation"], "get-caller-identity")

    # -- account guard
    def test_wrong_account_stops_before_any_other_call(self):
        def change(s):
            s["sts get-caller-identity"]["json"]["Account"] = "111122223333"
        run = self.run_with(change)
        self.assertEqual(run.rc, 3, run.out)
        self.assertIn("STOP: active account is '111122223333', expected 229251310592", run.out)
        self.assertIn("OVERALL: NOT RUN (wrong account)", run.out)
        self.assertNotIn("OVERALL: PASS", run.out)
        self.assertEqual([c["operation"] for c in run.calls], ["get-caller-identity"])

    def test_account_with_extra_digits_is_wrong(self):
        def change(s):
            s["sts get-caller-identity"]["json"]["Account"] = "2292513105920"
        run = self.run_with(change)
        self.assertEqual(run.rc, 3, run.out)
        self.assertEqual(len(run.calls), 1)

    def test_unreadable_account_stops(self):
        def change(s):
            s["sts get-caller-identity"] = {"stderr": "Unable to locate credentials. You can configure credentials "
                                                      'by running "aws configure".', "rc": 253}
        run = self.run_with(change)
        self.assertEqual(run.rc, 3, run.out)
        self.assertIn("STOP: cannot read the active account (sts get-caller-identity exit 253): Unable to locate credentials", run.out)
        self.assertIn("OVERALL: NOT RUN (account not verified)", run.out)
        self.assertEqual(len(run.calls), 1)

    def test_missing_aws_cli_stops(self):
        run = self.run_with(with_aws=False)
        self.assertEqual(run.rc, 3, run.out)
        self.assertIn("STOP: aws CLI not found", run.out)
        self.assertEqual(run.calls, [])

    # -- AWS CLI failures: ERROR, never PASS
    def test_access_denied_is_error_and_incomplete(self):
        def change(s):
            s[f"rds describe-db-instances {C}-pg"] = ACCESS_DENIED
        run = self.run_with(change)
        self.assertEqual(run.rc, 2, run.out)
        self.assertEqual(run.status("P-2"), "ERROR")
        self.assertIn("aws rds describe-db-instances failed (exit 254, AccessDeniedException)", run.out)
        self.assertRegex(run.out, r"OVERALL: INCOMPLETE \(\d+ check\(s\) with command failures")
        self.assertNotIn("OVERALL: PASS", run.out)
        # P-13 cannot compare the VPC with the database VPC: an ERROR, not a PASS (and not a FAIL)
        self.assertEqual(run.status("P-13"), "ERROR")
        self.assertIn("not compared with the database VPC: P-2 failed", run.out)
        self.assertReadOnly(run)

    def test_access_denied_is_not_treated_as_absent(self):
        def change(s):
            s["iam get-role AWSServiceRoleForECS"] = {"error": "AccessDenied", "message": "not authorized"}
        run = self.run_with(change)
        self.assertEqual(run.status("P-11"), "ERROR")
        self.assertEqual(run.lines("FAIL", "P-11"), [])
        self.assertEqual(run.rc, 2)

    def test_cli_failure_mentioning_not_found_is_error_not_absent(self):
        # No "An error occurred (Code)" from AWS: the text alone never proves the role is absent
        def change(s):
            s["iam get-role AWSServiceRoleForECS"] = {
                "stderr": "Connection was closed before we received a valid response (proxy page: NoSuchEntity)", "rc": 255}
        run = self.run_with(change)
        self.assertEqual(run.status("P-11"), "ERROR")
        self.assertNotIn("ABSENT: AWSServiceRoleForECS", run.out)
        self.assertEqual(run.rc, 2)

    def test_network_failure_is_error(self):
        def change(s):
            s["ecs list-task-definition-families"] = NETWORK
        run = self.run_with(change)
        self.assertEqual(run.status("P-3"), "ERROR")
        self.assertIn("aws ecs list-task-definition-families failed (exit 255): Could not connect to the endpoint URL", run.out)
        self.assertEqual(run.rc, 2)

    def test_throttling_on_count_is_error_not_zero(self):
        def change(s):
            s["elbv2 describe-load-balancers"] = {"error": "Throttling", "message": "Rate exceeded"}
        run = self.run_with(change)
        self.assertEqual(run.status("P-7"), "ERROR")
        self.assertNotIn("[PASS] P-7: load balancers", run.out)
        self.assertEqual(run.rc, 2)

    def test_cloudtrail_failure_is_error_not_zero_denials(self):
        def change(s):
            s["cloudtrail lookup-events us-east-1"] = ACCESS_DENIED
        run = self.run_with(change)
        self.assertEqual(run.status("P-12"), "ERROR")
        self.assertEqual(len(run.lines("PASS", "P-12")), 1)  # eu-central-1 only
        self.assertEqual(run.rc, 2)

    def test_cloudtrail_bad_json_is_error(self):
        def change(s):
            s["cloudtrail lookup-events eu-central-1"] = {"json": "not an event list"}
        run = self.run_with(change)
        self.assertEqual(run.status("P-12"), "ERROR")
        self.assertIn("denial filter exit 2", run.out)

    def test_denial_filter_is_embedded_and_identical_to_helper(self):
        # 10 Nov owner run: P-12 ERROR "cloudtrail-denials.py not found next to this script". The filter
        # is now embedded; every Run copies the script alone, so the PASS tests prove it is enough.
        with open(SCRIPT) as f:
            source = f.read()
        embedded = re.search(r"DENIAL_FILTER=\$\(\n  cat <<'PY'\n(.*?)\nPY\n\)", source, re.S).group(1)
        with open(DENIALS) as f:
            self.assertEqual(embedded, f.read().rstrip("\n"))
        self.assertNotIn("cloudtrail-denials.py not found", source)

    def test_unexpected_response_for_unknown_call_is_error(self):
        def change(s):
            del s["ec2 describe-route-tables"]
        run = self.run_with(change)
        self.assertEqual(run.status("P-13"), "ERROR")
        self.assertIn("StubMissingResponse", run.out)

    # -- missing resources: ABSENT is FAIL (blocking), or PASS where absence is expected
    def test_bootstrap_secret_absent_is_pass(self):
        run = self.run_with()
        self.assertIn(f"[PASS] P-6: secrets named {C}/identity-bootstrap = 0", run.out)

    def test_bootstrap_secret_present_is_fail(self):
        def change(s):
            s["secretsmanager list-secrets"] = {"json": {"SecretList": [{"Name": f"{C}/identity-bootstrap"}]}}
        run = self.run_with(change)
        self.assertEqual(run.status("P-6"), "FAIL")
        self.assertEqual(run.rc, 1)
        self.assertIn("OVERALL: FAIL (1 check(s) failed)", run.out)

    def test_missing_service_linked_role_is_absent_fail(self):
        def change(s):
            s["iam get-role AWSServiceRoleForElasticLoadBalancing"] = {
                "error": "NoSuchEntity", "message": "The role with name AWSServiceRoleForElasticLoadBalancing cannot be found."}
        run = self.run_with(change)
        self.assertEqual(run.status("P-11"), "FAIL")
        self.assertIn("[FAIL] P-11: ABSENT: AWSServiceRoleForElasticLoadBalancing (blocking for up", run.out)
        self.assertIn("(AWS answered NoSuchEntity)", run.out)
        self.assertEqual(run.lines("ERROR", "P-11"), [])
        self.assertEqual(run.rc, 1)

    def test_missing_database_is_absent_fail(self):
        def change(s):
            s[f"rds describe-db-instances {C}-pg"] = {"error": "DBInstanceNotFound", "message": "DBInstance munaxa-nonprod-pg not found."}
        run = self.run_with(change)
        self.assertEqual(run.status("P-2"), "FAIL")
        self.assertIn("ABSENT: munaxa-nonprod-pg (AWS answered DBInstanceNotFound)", run.out)
        self.assertEqual(run.rc, 1)

    def test_missing_image_is_absent_fail(self):
        def change(s):
            s["ecr describe-images munaxa-identity/migrate"] = {"error": "ImageNotFoundException", "message": "not found"}
        run = self.run_with(change)
        self.assertEqual(run.status("P-10"), "FAIL")
        self.assertIn("ABSENT: munaxa-identity/migrate @sha256:d175ef37", run.out)

    def test_missing_task_definition_is_absent_fail(self):
        def change(s):
            s[f"ecs describe-task-definition {C}-db-admin"] = {
                "error": "ClientException", "message": "Unable to describe task definition."}
        run = self.run_with(change)
        self.assertEqual(run.status("P-3"), "FAIL")
        self.assertEqual(run.status("P-4"), "FAIL")
        self.assertEqual(run.rc, 1)

    def test_missing_cluster_and_certificate_are_absent_fail(self):
        def change(s):
            s["ecs describe-clusters"] = {"json": {"clusters": [], "failures": [{"reason": "MISSING"}]}}
            s["acm list-certificates"] = {"json": {"CertificateSummaryList": []}}
        run = self.run_with(change)
        self.assertIn(f"[FAIL] P-3: ABSENT: cluster {C} not returned", run.out)
        self.assertIn("[FAIL] P-9: ABSENT: no certificate for *.test.munaxa.com", run.out)
        self.assertNotIn("describe-certificate", [c["operation"] for c in run.calls])
        self.assertEqual(run.rc, 1)

    # -- values that differ
    def test_running_database_and_denial_and_unpinned_secret_fail(self):
        def change(s):
            s[f"rds describe-db-instances {C}-pg"]["json"]["DBInstances"][0]["DBInstanceStatus"] = "available"
            s["cloudtrail lookup-events eu-central-1"] = trail("AccessDenied")
            s[f"secretsmanager list-secret-version-ids {C}/identity"]["json"]["Versions"][0]["VersionStages"] = ["AWSPREVIOUS"]
        run = self.run_with(change)
        self.assertIn("[FAIL] P-2: status = 'available', expected 'stopped'", run.out)
        self.assertEqual(run.status("P-12"), "FAIL")
        self.assertEqual(run.status("P-5"), "FAIL")
        self.assertEqual(run.rc, 1)

    def test_fail_and_error_together_is_incomplete(self):
        def change(s):
            s["iam get-role AWSServiceRoleForECS"] = {"error": "NoSuchEntity", "message": "missing"}
            s["ec2 describe-subnets"] = NETWORK
        run = self.run_with(change)
        self.assertEqual(run.rc, 2)
        self.assertIn("OVERALL: INCOMPLETE (1 check(s) with command failures, 1 failed)", run.out)

    # -- caller identity (10 Nov owner run was root; ACCESS-POLICY.md 1.3)
    def root(self, s):
        s["sts get-caller-identity"]["json"]["Arn"] = f"arn:aws:iam::{ACCOUNT}:root"

    def test_root_is_refused_without_owner_flag(self):
        run = self.run_with(self.root)
        self.assertEqual(run.rc, 3, run.out)
        self.assertIn(f"STOP: the caller is the account root user (arn:aws:iam::{ACCOUNT}:root)", run.out)
        self.assertIn("OVERALL: NOT RUN (root caller not accepted)", run.out)
        self.assertEqual(len(run.calls), 1)

    def test_root_flag_must_be_exactly_yes(self):
        for value in ("1", "true", "YES", ""):
            run = self.run_with(self.root, extra_env={"ALLOW_ROOT_READONLY": value})
            self.assertEqual(run.rc, 3, value)
            self.assertEqual(len(run.calls), 1, value)

    def test_root_with_owner_flag_runs_and_warns(self):
        run = self.run_with(self.root, extra_env={"ALLOW_ROOT_READONLY": "yes"})
        self.assertEqual(run.rc, 0, run.out)
        self.assertIn("root (accepted: ALLOW_ROOT_READONLY=yes, owner's decision; read-only calls only)", run.out)
        self.assertIn("WARNING: running as root by the owner's explicit choice", run.out)
        self.assertIn("OVERALL: PASS", run.out)

    def test_non_root_role_and_user_need_no_flag(self):
        run = self.run_with()
        self.assertIn("assumed role AWSReservedSSO_ReadOnly_0123456789abcdef", run.out)
        self.assertNotIn("WARNING: running as root", run.out)

        def user(s):
            s["sts get-caller-identity"]["json"]["Arn"] = f"arn:aws:iam::{ACCOUNT}:user/operator"
        run = self.run_with(user)
        self.assertEqual(run.rc, 0, run.out)
        self.assertIn("IAM user operator", run.out)

    def test_caller_arn_from_another_account_or_unknown_shape_stops(self):
        for arn in ("arn:aws:sts::111122223333:assumed-role/ReadOnly/x", f"arn:aws:sts::{ACCOUNT}:federated-user/x",
                    "None"):
            def change(s, arn=arn):
                s["sts get-caller-identity"]["json"]["Arn"] = arn
            run = self.run_with(change)
            self.assertEqual(run.rc, 3, arn)
            self.assertIn("OVERALL: NOT RUN (caller not recognised)", run.out)
            self.assertEqual(len(run.calls), 1)

    # -- 10 Nov owner run, P-3 and P-4 (preflight expectations corrected to stack source)
    def test_task_definitions_listed_per_exact_family(self):
        run = self.run_with()
        listed = [c["options"].get("--family-prefix") for c in run.calls if c["operation"] == "list-task-definitions"]
        self.assertEqual(listed, [f"{C}-identity", f"{C}-identity-migrate", f"{C}-identity-bootstrap", f"{C}-db-admin"])
        self.assertIn(f"[PASS] P-3: families with an ACTIVE revision = {C}-db-admin,{C}-identity,{C}-identity-bootstrap,{C}-identity-migrate", run.out)

    def test_extra_family_or_second_revision_fails(self):
        def change(s):
            s["ecs list-task-definition-families"]["json"]["families"].append(f"{C}-docs-db-admin")
            s[f"ecs list-task-definitions {C}-identity"]["json"]["taskDefinitionArns"].append(
                f"arn:aws:ecs:eu-central-1:{ACCOUNT}:task-definition/{C}-identity:2")
        run = self.run_with(change)
        self.assertEqual(run.status("P-3"), "FAIL")
        self.assertIn(f"{C}-identity ACTIVE revisions = '{C}-identity:1,{C}-identity:2'", run.out)
        self.assertEqual(run.rc, 1)

    def test_bootstrap_on_migrate_image_fails(self):
        def change(s):
            s[f"ecs describe-task-definition {C}-identity-bootstrap"]["json"]["taskDefinition"]["containerDefinitions"][0][
                "image"] = f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"
        run = self.run_with(change)
        self.assertIn(f"[FAIL] P-3: {C}-identity-bootstrap images", run.out)
        self.assertIn("lack @sha256:71d01fdf", run.out)

    def test_bootstrap_on_api_image_passes(self):
        run = self.run_with()
        self.assertIn(f"[PASS] P-3: {C}-identity-bootstrap image @sha256:71d01fdf", run.out)

    def test_migrate_needs_database_migration_url_only(self):
        run = self.run_with()
        self.assertIn("[PASS] P-4: identity-migrate secret names = DATABASE_MIGRATION_URL", run.out)
        self.assertIn(f"[PASS] P-4: identity-migrate DATABASE_MIGRATION_URL pinned to {PIN_M}", run.out)

        def change(s):  # the old (wrong) expectation's shape now fails
            s[f"ecs describe-task-definition {C}-identity-migrate"] = td("identity-migrate", [
                f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"], [
                [("DIRECT_DATABASE_URL", f"{SM}{C}/identity-migrate-Ef34Gh:DATABASE_MIGRATION_URL::{PIN_M}")]])
        run = self.run_with(change)
        self.assertEqual(run.status("P-4"), "FAIL")

    def test_migrate_with_unpinned_reference_fails(self):
        def change(s):
            s[f"ecs describe-task-definition {C}-identity-migrate"] = td("identity-migrate", [
                f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"], [
                [("DATABASE_MIGRATION_URL", f"{SM}{C}/identity-migrate-Ef34Gh:DATABASE_MIGRATION_URL::")]])
        run = self.run_with(change)
        self.assertEqual(run.status("P-4"), "FAIL")

    # -- static guarantees: see StaticSafetyTest


def collapse(calls):
    out = []
    for c in calls:
        op = f"{c['service']}:{c['operation']}"
        if out and out[-1][0] == op:
            out[-1] = (op, out[-1][1] + 1)
        else:
            out.append((op, 1))
    return out


def static_problems(source):
    """Problems a reviewer must see in the script source. Scans every line, including echo and
    record lines and every heredoc except the expected-policy data (SPEC), which is JSON."""
    problems = []
    body = re.sub(r"<<'SPEC'\n.*?\nSPEC\n", "", source, flags=re.S)
    allowed = re.search(r'ALLOWED_OPS="([^"]*)"', body).group(1).split()
    if sorted(allowed) != sorted(EXPECTED_OPS):
        problems.append(f"ALLOWED_OPS differs from the reviewed list: {sorted(set(allowed) ^ set(EXPECTED_OPS))}")
    code = "\n".join(l for l in body.splitlines() if not l.lstrip().startswith("#"))
    for word in ("get-secret-value", "batch-get-secret-value", "terraform ", r"\.tfstate\b", "s3api", r"\bs3 cp\b",
                 "get-object", r"\blogs ", "get-log-events", r"\bssm\b", "with-decryption", "get-password-data",
                 "get-console-output", "rds-data", "dynamodb", "athena", "execute-command", "boto3", "subprocess",
                 r"os\.system", r"\bpopen\b", r"\beval\b", r"\bexec\(", r"\bsocket\b", "urllib.request"):
        if re.search(word, code):
            problems.append(f"forbidden text in code: {word}")
    # aws runs directly only in aws_call and the account guard; any other launch form is a problem.
    # (The denial filter's docstring shows its usage; that heredoc is Python, checked for imports below.)
    shell = re.sub(r"DENIAL_FILTER=\$\(\n  cat <<'PY'\n.*?\nPY\n\)", "", code, flags=re.S)
    direct = [l.strip() for l in shell.splitlines()
              if re.search(r"(\$\(|`|^\s*|[;&|]\s*|\b(?:command|env|exec|xargs|builtin|nohup|time)\s+)aws\s", l)]
    if direct != ['OUT=$(aws "$svc" "$op" "$@" 2>"$ERRFILE") || rc=$?',
                  "IDENT=$(aws sts get-caller-identity --query '[Account,Arn]' --output text 2>\"$ERRFILE\") || rc=$?"]:
        problems.append(f"direct aws calls: {direct}")
    calls = re.findall(r"\b(?:aws_call|fetch [\w.-]+|fetch P-[\w]+ \"[^\"]*\") [\w-]+ ('[^']*'|\"[^\"]*\") (\w+) ([\w-]+)", code)
    calls += [("", s, o) for s, o in re.findall(r"^count [\"\w ]+? (\w+) ([\w-]+) ", code, re.M)]
    calls += [("", "secretsmanager", o) for o in re.findall(r"aws_call P-\d+ \S+ secretsmanager ([\w-]+)", code)]
    for _, svc, op in calls:
        if f"{svc}:{op}" not in allowed:
            problems.append(f"call site {svc} {op} is not allowlisted")
    for name, block in re.findall(r"(\w+)=\$\(\n  cat <<'PY'\n(.*?)\nPY\n\)", source, re.S):
        imports = set(re.findall(r"^\s*(?:import|from) ([\w.]+)", block, re.M))
        if not imports <= {"json", "re", "sys", "urllib.parse"}:
            problems.append(f"{name} imports {sorted(imports)}")
    return problems


def mutate(after, insert):
    with open(SCRIPT) as f:
        src = f.read()
    assert src.count(after) == 1, after
    return src.replace(after, after + insert)


class StaticSafetyTest(unittest.TestCase):
    def setUp(self):
        with open(SCRIPT) as f:
            self.source = f.read()

    def test_script_passes_static_safety_checks(self):
        self.assertEqual(static_problems(self.source), [])

    def test_allowlist_is_exactly_the_reviewed_set_of_read_operations(self):
        self.assertEqual(len(EXPECTED_OPS), 37)
        for entry in EXPECTED_OPS:
            self.assertRegex(entry.split(":")[1], READ_ONLY, entry)
            self.assertNotIn(entry.split(":")[1], FORBIDDEN, entry)

    def test_static_checks_catch_unsafe_changes(self):
        # Agent C's mutations m2-m4 passed the old suite; each must now be reported.
        guard = 'IDENT=$(aws sts get-caller-identity'
        for bad in [
            self.source.replace(" cloudtrail:lookup-events ", " cloudtrail:lookup-events ssm:get-parameters-by-path "),
            self.source.replace('h "P-12', 'echo "roles: $(aws iam list-users)"\nh "P-12', 1),
            self.source.replace("import json\nimport re\nimport sys\nimport urllib.parse",
                                "import json\nimport re\nimport subprocess\nimport sys\nimport urllib.parse", 1),
            self.source.replace('h "P-12', "command aws iam list-users\nh \"P-12", 1),
            self.source.replace('h "P-12', "aws_call P-12 '' logs get-log-events --log-group-name x\nh \"P-12", 1),
        ]:
            self.assertNotEqual(bad, self.source)
            self.assertNotEqual(static_problems(bad), [], bad[:0])
        self.assertIn(guard, self.source)

    def test_session_spec_is_the_terraform_render(self):
        """The expected policies in the script equal the offline Terraform render, canonicalised."""
        with open(RENDERED) as f:
            r = json.load(f)
        spec = json.loads(script_section("SESSION_SPEC", "SPEC"))

        def canon(doc):
            def one(v):
                return sorted(set([v] if isinstance(v, str) else v))
            doc = json.loads(doc) if isinstance(doc, str) else doc
            st = []
            for s in doc["Statement"]:
                c = {}
                for k, v in s.items():
                    if k == "Condition":
                        v = {op: {key: one(val) for key, val in m.items()} for op, m in v.items()}
                    elif k == "Principal":
                        v = {pt: one(x) for pt, x in v.items()}
                    elif k in ("Action", "NotAction", "Resource", "NotResource"):
                        v = one(v)
                    c[k] = v
                st.append(json.dumps(c, sort_keys=True))
            return doc["Version"], sorted(st)
        ci, dep = spec["roles"][CI_ROLE], spec["roles"][DEP_ROLE]
        pairs = [(r["ci_session_trust"], ci["trust"]), (r["ci_session_inline"], ci["inline"]["assume-own-session-deployer-only"]),
                 (r["deployer_session_trust"], dep["trust"]), (r["deployer_session"], dep["inline"]["session-deployer"]),
                 (r["deployer_read"], dep["attached"][READ_ARN]), (r["deployer_session_read"], dep["attached"][SREAD_ARN])]
        for rendered, embedded in pairs:
            self.assertEqual(canon(rendered), canon(embedded))
        self.assertEqual(len(dep["inline"]["session-deployer"]["Statement"]), 30)
        self.assertEqual(ci["attached"], {})
        self.assertEqual(r["meta"]["ci"], [CI_ROLE, "/munaxa-shared/bootstrap/", 3600, "assume-own-session-deployer-only"])
        self.assertEqual(r["meta"]["dep"], [DEP_ROLE, "/munaxa-shared/bootstrap/", 3600, "session-deployer"])
        self.assertEqual(spec["state_key_arn"], STATE_KEY)
        self.assertIsNone(ci["PermissionsBoundary"])
        self.assertIsNone(dep["PermissionsBoundary"])


def stmt(doc, sid):
    return next(s for s in doc["Statement"] if s.get("Sid") == sid)


def dep_inline(s):
    return s[f"iam get-role-policy {DEP_ROLE} session-deployer"]["json"]["PolicyDocument"]


def read_doc(s, arn=SREAD_ARN):
    return s[f"iam get-policy-version {arn} v3"]["json"]["PolicyVersion"]["Document"]


class SessionRolesTest(Base):
    """P-11b: every role setting and policy statement compared with the code."""

    def p11b(self, change, expect="FAIL", text=None):
        run = self.run_with(change)
        self.assertEqual(run.status("P-11b"), expect, run.out)
        self.assertNotIn("OVERALL: PASS", run.out)
        if text:
            self.assertTrue(any(text in l for l in run.lines(expect, "P-11b")), (text, run.lines(expect, "P-11b")))
        return run

    def test_correct_policies_pass_whatever_the_order_and_shape(self):
        run = self.run_with()
        self.assertEqual(run.status("P-11b"), "PASS", run.out)
        self.assertIn(f"[PASS] P-11b: {DEP_ROLE} inline session-deployer: 30 statement(s) match the code", run.out)
        self.assertIn("[PASS] P-11b: managed policy munaxa-shared-deployer-read: 2 statement(s) match the code", run.out)
        self.assertIn(f"[PASS] P-11b: {CI_ROLE} trust policy: 1 statement(s) match the code", run.out)
        self.assertIn(f"[PASS] P-11b: {DEP_ROLE} permissions boundary = none (as in the code)", run.out)
        self.assertNotIn("kms:Decrypt", run.out)  # matching documents are not printed

    def test_url_encoded_document_is_decoded(self):
        import urllib.parse

        def change(s):
            doc = dep_inline(s)
            s[f"iam get-role-policy {DEP_ROLE} session-deployer"]["json"]["PolicyDocument"] = urllib.parse.quote(json.dumps(doc))
        self.assertEqual(self.run_with(change).status("P-11b"), "PASS")

    def test_not_resource_and_resource_are_distinct(self):
        def change(s):
            st = stmt(dep_inline(s), "CreatesCarryEnvironmentTag")
            st["Resource"] = st.pop("NotResource")
        self.p11b(change, text="CreatesCarryEnvironmentTag")

        def change2(s):
            st = stmt(dep_inline(s), "CreatesCarryProjectTag")
            st["NotAction"] = st.pop("Action")
        self.p11b(change2, text="CreatesCarryProjectTag")

    def test_unknown_statement_key_fails(self):
        def change(s):
            stmt(dep_inline(s), "CreatesCarryEnvironmentTag")["Principal"] = "*"
        self.p11b(change, text="CreatesCarryEnvironmentTag")

    def test_managed_policy_document_unread_is_never_pass(self):
        for key in (f"iam get-policy {READ_ARN}", f"iam get-policy-version {READ_ARN} v3"):
            def change(s, key=key):
                s[key] = {"error": "NoSuchEntity", "message": "not found"}
            run = self.p11b(change)
            self.assertNotIn("[PASS] P-11b: managed policy munaxa-shared-deployer-read", run.out)
            run = self.p11b(lambda s, key=key: s.__setitem__(key, {"error": "AccessDenied", "message": "denied"}), expect="ERROR")
            self.assertNotIn("[PASS] P-11b: managed policy munaxa-shared-deployer-read", run.out)

    def test_role_path_and_arn_checked(self):
        def change(s):
            s[f"iam get-role {DEP_ROLE}"]["json"]["Role"]["Path"] = "/"
        self.p11b(change, text=f"{DEP_ROLE} Path = '/'")

        def change2(s):
            s[f"iam get-role {CI_ROLE}"]["json"]["Role"]["Arn"] = f"arn:aws:iam::{ACCOUNT}:role/{CI_ROLE}"
        self.p11b(change2, text=f"{CI_ROLE} Arn = ")

    def test_any_permissions_boundary_fails(self):
        for value in ({"PermissionsBoundaryType": "Policy", "PermissionsBoundaryArn": f"arn:aws:iam::{ACCOUNT}:policy/b"},
                      {"PermissionsBoundaryType": "Policy"}):
            def change(s, value=value):
                s[f"iam get-role {DEP_ROLE}"]["json"]["Role"]["PermissionsBoundary"] = value
            self.p11b(change, text=f"{DEP_ROLE} permissions boundary = ")

    def test_missing_statement_fails(self):
        for sid in ("SessionNeverGroupTags", "NoSecretValuesNoUsersNoKeys"):
            def change(s, sid=sid):
                dep_inline(s)["Statement"].remove(stmt(dep_inline(s), sid))
            self.p11b(change, text=f"statement {sid} missing")

    def test_extra_statement_fails(self):
        def change(s):
            dep_inline(s)["Statement"].append({"Effect": "Allow", "Action": "*", "Resource": "*"})
        self.p11b(change, text="unexpected statement without Sid (Allow *)")

        def change2(s):
            dep_inline(s)["Statement"].append({"Sid": "Extra", "Effect": "Allow", "Action": "iam:*", "Resource": "*"})
        self.p11b(change2, text="unexpected statement Extra (Allow iam:*)")

    def test_wrong_effect_fails(self):
        def change(s):
            stmt(dep_inline(s), "SessionNeverSecurityGroupRules")["Effect"] = "Allow"
        self.p11b(change, text='SessionNeverSecurityGroupRules: Effect = "Allow", expected "Deny"')

    def test_wildcard_action_fails(self):
        for action in ("*", "rds:*", ["rds:StartDBInstance", "rds:StopDBInstance", "rds:DeleteDBInstance"]):
            def change(s, action=action):
                stmt(dep_inline(s), "SessionDatabaseStartStop")["Action"] = action
            self.p11b(change, text="SessionDatabaseStartStop: Action added")

    def test_wider_resource_fails(self):
        def change(s):
            st = stmt(dep_inline(s), "SessionDatabaseStartStop")
            st["Resource"] = f"arn:aws:rds:eu-central-1:{ACCOUNT}:db:munaxa-nonprod-*"
        self.p11b(change, text="SessionDatabaseStartStop: Resource added arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*")

    def test_action_swapped_for_notaction_fails(self):
        def change(s):
            st = stmt(dep_inline(s), "SessionEdgeAndServices")
            st["NotAction"] = ["iam:*"]
            del st["Action"]
        self.p11b(change, text="SessionEdgeAndServices: unexpected NotAction present")

    def test_missing_condition_fails(self):
        def change(s):
            del stmt(dep_inline(s), "SessionPassOwnRoles")["Condition"]
        self.p11b(change, text="SessionPassOwnRoles: Condition missing")

    def test_modified_condition_fails_without_printing_values(self):
        def change(s):
            stmt(dep_inline(s), "SessionPassOwnRoles")["Condition"]["StringEquals"]["iam:PassedToService"] = [
                "ecs-tasks.amazonaws.com", "ecs.amazonaws.com", CANARY]
        run = self.p11b(change, text="SessionPassOwnRoles: Condition differs (StringEquals iam:PassedToService; values not printed)")
        self.assertNotIn(CANARY, run.out)

        def change2(s):
            c = stmt(read_doc(s), "RefreshOwnKeys")["Condition"]
            c["StringLike"] = c.pop("StringEquals")
        self.p11b(change2, text="RefreshOwnKeys: Condition differs")

    def test_unexpected_attached_policy_fails(self):
        for role in (DEP_ROLE, CI_ROLE):
            def change(s, role=role):
                s[f"iam list-attached-role-policies {role}"]["json"]["AttachedPolicies"].append(
                    {"PolicyName": "AdministratorAccess", "PolicyArn": "arn:aws:iam::aws:policy/AdministratorAccess"})
            self.p11b(change, text=f"{role} unexpected attached policy: arn:aws:iam::aws:policy/AdministratorAccess")

    def test_missing_attached_policy_fails(self):
        def change(s):
            lst = s[f"iam list-attached-role-policies {DEP_ROLE}"]["json"]["AttachedPolicies"]
            lst[:] = [p for p in lst if p["PolicyArn"] != READ_ARN]
        self.p11b(change, text=f"attached policy missing: {READ_ARN}")

    def test_extra_or_missing_inline_policy_fails(self):
        def change(s):
            s[f"iam list-role-policies {CI_ROLE}"]["json"]["PolicyNames"].append("x")
        self.p11b(change, text=f"{CI_ROLE} inline policies = assume-own-session-deployer-only, x")

        def change2(s):
            s[f"iam get-role-policy {DEP_ROLE} session-deployer"] = {"error": "NoSuchEntity", "message": "not found"}
        self.p11b(change2, text="ABSENT: inline policy session-deployer")

    def test_permissions_boundary_present_fails(self):
        def change(s):
            s[f"iam get-role {CI_ROLE}"]["json"]["Role"]["PermissionsBoundary"] = {
                "PermissionsBoundaryType": "Policy", "PermissionsBoundaryArn": "arn:aws:iam::aws:policy/ReadOnlyAccess"}
        self.p11b(change, text=f"{CI_ROLE} permissions boundary = arn:aws:iam::aws:policy/ReadOnlyAccess, expected none")

    def test_role_settings_and_trust_fail(self):
        def change(s):
            role = s[f"iam get-role {DEP_ROLE}"]["json"]["Role"]
            role["MaxSessionDuration"] = 43200
            role["AssumeRolePolicyDocument"]["Statement"][0]["Principal"] = {"AWS": f"arn:aws:iam::{ACCOUNT}:root"}
        run = self.p11b(change, text=f"{DEP_ROLE} MaxSessionDuration = 43200, expected 3600")
        self.assertTrue(any("SessionCiRoleWithSourceIdentity: Principal differs" in l for l in run.lines("FAIL", "P-11b")))

    def test_extra_or_missing_session_role_fails(self):
        def change(s):
            s["iam list-roles"]["json"]["Roles"].append({"RoleName": "munaxa-shared-ci-nonprod-session-2"})
        self.p11b(change, text="unexpected session role(s) under /munaxa-shared/bootstrap/: munaxa-shared-ci-nonprod-session-2")

        def change2(s):
            s[f"iam get-role {CI_ROLE}"] = {"error": "NoSuchEntity", "message": "not found"}
        self.p11b(change2, text=f"ABSENT: role {CI_ROLE}")

    def test_version_and_duplicate_sid_fail(self):
        def change(s):
            read_doc(s)["Version"] = "2008-10-17"
            dep_inline(s)["Statement"].append(dict(stmt(dep_inline(s), "StateList")))
        run = self.p11b(change, text="Version 2008-10-17, expected 2012-10-17")
        self.assertTrue(any("duplicate Sid StateList" in l for l in run.lines("FAIL", "P-11b")))

    def test_state_key_alias_on_another_key_fails(self):
        def change(s):
            s["kms describe-key alias/munaxa-shared-tfstate"]["json"]["KeyMetadata"]["Arn"] = KEY_ARN
        self.p11b(change, text="alias/munaxa-shared-tfstate = ")

    def test_malformed_policy_response_is_error(self):
        for bad in ("not json at all", {"Version": "2012-10-17"}, {"Version": "2012-10-17", "Statement": 5},
                    {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": 7}]}):
            def change(s, bad=bad):
                s[f"iam get-policy-version {READ_ARN} v3"]["json"]["PolicyVersion"]["Document"] = bad
            run = self.p11b(change, expect="ERROR", text="malformed response")
            self.assertEqual(run.rc, 2)

    def test_malformed_version_id_is_error(self):
        def change(s):
            s[f"iam get-policy {READ_ARN}"]["json"]["Policy"]["DefaultVersionId"] = "--debug"
        run = self.p11b(change, expect="ERROR", text="is not a version id")
        self.assertNotIn("get-policy-version", [c["operation"] for c in run.calls if c["options"].get("--policy-arn") == READ_ARN])

    def test_access_denied_is_error_not_absent(self):
        for key in (f"iam get-role {DEP_ROLE}", f"iam get-role-policy {DEP_ROLE} session-deployer",
                    f"iam get-policy {READ_ARN}", f"iam get-policy-version {SREAD_ARN} v3", "iam list-roles",
                    "kms describe-key alias/munaxa-shared-tfstate"):
            def change(s, key=key):
                s[key] = {"error": "AccessDenied", "message": "not authorized"}
            run = self.p11b(change, expect="ERROR", text="AccessDenied")
            self.assertNotIn("ABSENT", "\n".join(run.lines("FAIL", "P-11b")))
            self.assertEqual(run.rc, 2)

    def test_cli_failure_is_error(self):
        def change(s):
            s[f"iam get-policy-version {SREAD_ARN} v3"] = NETWORK
        run = self.p11b(change, expect="ERROR", text="failed (exit 255)")
        self.assertIn("OVERALL: INCOMPLETE", run.out)


def net(s, key):
    return s[f"ec2 describe-{key}"]["json"]


def rt(s, rid):
    return next(t for t in net(s, "route-tables")["RouteTables"] if t["RouteTableId"] == rid)


class NetworkTopologyTest(Base):
    """P-13: the VPC, subnets, route tables, associations, routes, gateway, endpoint and groups."""

    def p13(self, change, expect="FAIL", text=None):
        run = self.run_with(change)
        self.assertEqual(run.status("P-13"), expect, run.out)
        self.assertNotIn("OVERALL: PASS", run.out)
        if text:
            self.assertTrue(any(text in l for l in run.lines(expect, "P-13")), (text, run.lines(expect, "P-13")))
        return run

    def test_correct_topology_passes(self):
        run = self.run_with()
        self.assertEqual(run.status("P-13"), "PASS", run.out)
        for line in (f"route table {C}-rt-public associations = {C}-public-a, {C}-public-b",
                     f"route table {C}-rt-public routes = local, 0.0.0.0/0 -> {IGW} active, S3 endpoint active",
                     f"internet gateway {C}-igw {IGW} attached to {VPC}", f"VPC {C} = database VPC {VPC}"):
            self.assertIn(f"[PASS] P-13: {line}", run.out)
        filters = {c["operation"]: c["options"].get("--filters") for c in run.calls if c["service"] == "ec2"}
        for op in ("describe-subnets", "describe-route-tables", "describe-vpc-endpoints", "describe-security-groups"):
            self.assertEqual(filters[op], f"Name=vpc-id,Values={VPC}", op)
        self.assertEqual(filters["describe-internet-gateways"], f"Name=tag:Name,Values={C}-igw")

    def test_vpc_absent_or_ambiguous_or_not_the_database_vpc_fails(self):
        def change(s):
            net(s, "vpcs")["Vpcs"] = []
        run = self.p13(change, text="VPCs tagged Name=munaxa-nonprod: 0, expected 1 (ABSENT)")
        self.assertNotIn("describe-subnets", [c["operation"] for c in run.calls])

        def change2(s):
            net(s, "vpcs")["Vpcs"].append(dict(net(s, "vpcs")["Vpcs"][0], VpcId="vpc-0ffffffffffffffff"))
        self.p13(change2, text="VPCs tagged Name=munaxa-nonprod: 2, expected 1")

        def change3(s):
            s[f"rds describe-db-instances {C}-pg"]["json"]["DBInstances"][0]["DBSubnetGroup"]["VpcId"] = "vpc-0ffffffffffffffff"
        self.p13(change3, text=f"VPC {C} = {VPC}, but the database is in vpc-0ffffffffffffffff")

    def test_subnet_in_wrong_vpc_fails(self):
        def change(s):
            net(s, "subnets")["Subnets"][1]["VpcId"] = "vpc-0ffffffffffffffff"
        self.p13(change, text=f"subnet {C}-public-b in vpc-0ffffffffffffffff, expected {VPC}")

    def test_missing_or_changed_subnet_fails(self):
        def change(s):
            del net(s, "subnets")["Subnets"][4]
        self.p13(change, text=f"ABSENT: subnet {C}-db-c")

        def change2(s):
            net(s, "subnets")["Subnets"][0]["MapPublicIpOnLaunch"] = True
        self.p13(change2, text=f"subnet {C}-public-a = ")

    def test_missing_route_table_fails(self):
        def change(s):
            net(s, "route-tables")["RouteTables"].pop(1)
        self.p13(change, text=f"ABSENT: route table {C}-rt-public")

    def test_route_table_in_wrong_vpc_fails(self):
        def change(s):
            rt(s, "rtb-public")["VpcId"] = "vpc-0ffffffffffffffff"
        self.p13(change, text=f"route table {C}-rt-public in vpc-0ffffffffffffffff")

    def test_extra_route_table_fails(self):
        def change(s):
            net(s, "route-tables")["RouteTables"].append({"RouteTableId": "rtb-extra", "VpcId": VPC, "Routes": [], "Associations": []})
        self.p13(change, text="unexpected route table rtb-extra")

    def test_wrong_subnet_association_fails(self):
        def change(s):
            a = rt(s, "rtb-public")["Associations"].pop(0)
            rt(s, "rtb-db")["Associations"].append(dict(a, RouteTableId="rtb-db"))
        run = self.p13(change, text=f"route table {C}-rt-public associations: missing {C}-public-a")
        self.assertTrue(any(f"route table {C}-rt-db associations: unexpected {C}-public-a" in l for l in run.lines("FAIL", "P-13")))

    def test_missing_association_fails(self):
        def change(s):
            rt(s, "rtb-public")["Associations"].pop(1)
        run = self.p13(change, text=f"route table {C}-rt-public associations: missing {C}-public-b")
        self.assertTrue(any(f"subnet {C}-public-b has 0 explicit route table associations" in l for l in run.lines("FAIL", "P-13")))

    def test_blackhole_default_route_fails(self):
        def change(s):
            rt(s, "rtb-public")["Routes"][1]["State"] = "blackhole"
        self.p13(change, text="default route state blackhole")

    def test_wrong_default_route_target_fails(self):
        for route in ({"DestinationCidrBlock": "0.0.0.0/0", "GatewayId": "igw-0fffffffffffffff0", "State": "active"},
                      {"DestinationCidrBlock": "0.0.0.0/0", "NatGatewayId": "nat-0123", "State": "active"},
                      {"DestinationCidrBlock": "0.0.0.0/0", "GatewayId": IGW, "NetworkInterfaceId": "eni-1", "State": "active"}):
            def change(s, route=route):
                rt(s, "rtb-public")["Routes"][1] = route
            self.p13(change, text="default route targets")

        def change2(s):
            rt(s, "rtb-db")["Routes"].append({"DestinationCidrBlock": "0.0.0.0/0", "GatewayId": IGW, "State": "active"})
        self.p13(change2, text=f"route table {C}-rt-db: unexpected route 0.0.0.0/0")

    def test_detached_gateway_fails(self):
        def change(s):
            net(s, "internet-gateways")["InternetGateways"][0]["Attachments"] = []
            rt(s, "rtb-public")["Routes"][1]["State"] = "blackhole"
        run = self.p13(change, text=f"internet gateway {C}-igw {IGW} is detached")
        self.assertTrue(any("default route not verified" in l for l in run.lines("FAIL", "P-13")))

    def test_gateway_attached_to_wrong_vpc_fails(self):
        def change(s):
            net(s, "internet-gateways")["InternetGateways"][0]["Attachments"] = [{"VpcId": "vpc-0ffffffffffffffff", "State": "available"}]
        self.p13(change, text=f"internet gateway {C}-igw attachments = [('vpc-0ffffffffffffffff', 'available')]")

    def test_gateway_absent_fails(self):
        def change(s):
            net(s, "internet-gateways")["InternetGateways"] = []
        self.p13(change, text="internet gateways tagged munaxa-nonprod-igw: 0, expected 1 (ABSENT)")

    def test_endpoint_wrong_fails(self):
        def change(s):
            net(s, "vpc-endpoints")["VpcEndpoints"][0]["RouteTableIds"] = ["rtb-public", "rtb-db"]
        self.p13(change, text="S3 endpoint = ")

    def test_missing_security_group_fails(self):
        def change(s):
            net(s, "security-groups")["SecurityGroups"].pop()
        self.p13(change, text=f"ABSENT: security group(s) {C}-identity-migrate")

    def test_security_group_in_wrong_vpc_fails(self):
        def change(s):
            net(s, "security-groups")["SecurityGroups"][2]["VpcId"] = "vpc-0ffffffffffffffff"
        self.p13(change, text=f"security group {C}-database in vpc-0ffffffffffffffff")

    def test_unexpected_security_group_fails(self):
        def change(s):
            net(s, "security-groups")["SecurityGroups"].append({"GroupName": f"{C}-control-api", "GroupId": "sg-9", "VpcId": VPC})
        self.p13(change, text=f"unexpected security group(s) in {VPC}: {C}-control-api")

    def test_invalid_vpc_id_is_error_never_pass(self):
        def change(s):
            net(s, "vpcs")["Vpcs"][0]["VpcId"] = "vpc-NOT-HEX"
        run = self.p13(change, expect="ERROR", text="no valid VpcId")
        self.assertNotIn("describe-subnets", [c["operation"] for c in run.calls])
        self.assertEqual(run.lines("PASS", "P-13"), [])
        self.assertEqual(run.rc, 2)

    def test_vpc_attributes_checked(self):
        for field, value, text in (("CidrBlock", "10.131.0.0/16", "VPC munaxa-nonprod CIDR = 10.131.0.0/16"),
                                   ("State", "pending", "VPC munaxa-nonprod state = pending"),
                                   ("IsDefault", True, "VPC munaxa-nonprod IsDefault = True")):
            def change(s, field=field, value=value):
                net(s, "vpcs")["Vpcs"][0][field] = value
            self.p13(change, text=text)

    def test_database_vpc_unknown_is_never_pass(self):
        def change(s):
            s[f"rds describe-db-instances {C}-pg"] = {"error": "AccessDenied", "message": "denied"}
        run = self.p13(change, expect="ERROR", text="not compared with the database VPC: P-2 failed")
        self.assertNotIn(f"[PASS] P-13: VPC {C} = database VPC", run.out)

        def change2(s):
            s[f"rds describe-db-instances {C}-pg"] = {"error": "DBInstanceNotFound", "message": "not found"}
        run = self.p13(change2, text="not compared with the database VPC: P-2 found no database")
        self.assertEqual(run.status("P-2"), "FAIL", run.out)

    def test_unexpected_or_duplicate_subnet_fails(self):
        def change(s):
            net(s, "subnets")["Subnets"].append({"SubnetId": "subnet-x", "VpcId": VPC, "AvailabilityZone": "eu-central-1a",
                                                 "CidrBlock": "10.130.9.0/24", "MapPublicIpOnLaunch": False, "State": "available",
                                                 "Tags": [{"Key": "Name", "Value": f"{C}-extra"}]})
        self.p13(change, text=f"unexpected subnet {C}-extra in {VPC}")

        def change2(s):
            net(s, "subnets")["Subnets"].append(dict(net(s, "subnets")["Subnets"][0], SubnetId="subnet-dup"))
        self.p13(change2, text=f"two subnets named {C}-public-a")

    def test_gateway_ambiguous_or_multiply_attached_fails(self):
        def change(s):
            g = net(s, "internet-gateways")["InternetGateways"]
            g.append(dict(g[0], InternetGatewayId="igw-0fffffffffffffff0"))
        self.p13(change, text=f"internet gateways tagged {C}-igw: 2, expected 1")

        def change2(s):
            net(s, "internet-gateways")["InternetGateways"][0]["Attachments"].append({"VpcId": "vpc-0ffffffffffffffff", "State": "available"})
        run = self.p13(change2, text=f"internet gateway {C}-igw attachments = ")
        self.assertTrue(any("default route not verified" in l for l in run.lines("FAIL", "P-13")))

    def test_endpoint_count_state_and_tag_checked(self):
        def change(s):
            e = net(s, "vpc-endpoints")["VpcEndpoints"]
            e.append(dict(e[0], VpcEndpointId="vpce-0fff"))
        self.p13(change, text=f"VPC endpoints in {VPC}: 2, expected 1")
        for field, value in (("State", "Pending"), ("Tags", [])):
            def change2(s, field=field, value=value):
                net(s, "vpc-endpoints")["VpcEndpoints"][0][field] = value
            run = self.p13(change2, text="S3 endpoint = ")
            self.assertTrue(any("S3 route targets" in l for l in run.lines("FAIL", "P-13")))
        run = self.run_with(lambda s: net(s, "vpc-endpoints")["VpcEndpoints"][0].update(State="Available"))
        self.assertEqual(run.status("P-13"), "PASS", run.out)

    def test_duplicate_route_table_fails(self):
        def change(s):
            t = rt(s, "rtb-db")
            net(s, "route-tables")["RouteTables"].append(dict(t, RouteTableId="rtb-db2", Associations=[]))
        self.p13(change, text=f"two route tables as {C}-rt-db")

    def test_missing_or_inactive_routes_fail(self):
        cases = (
            (lambda s: rt(s, "rtb-public")["Routes"].pop(1), "0 default routes, expected 1"),
            (lambda s: rt(s, "rtb-public")["Routes"].append(dict(rt(s, "rtb-public")["Routes"][1])), "2 default routes, expected 1"),
            (lambda s: rt(s, "rtb-public")["Routes"].pop(2), "0 S3 endpoint routes, expected 1"),
            (lambda s: rt(s, "rtb-public")["Routes"][2].update(State="blackhole"), "S3 route targets"),
            (lambda s: rt(s, "rtb-public")["Routes"][2].update(GatewayId="vpce-0other"), "S3 route targets"),
            (lambda s: rt(s, "rtb-db").update(Routes=[]), f"route table {C}-rt-db: local route missing or not active"),
            (lambda s: rt(s, "rtb-main").update(Routes=[dict(rt(s, "rtb-main")["Routes"][0], State="blackhole")]),
             "route table main: local route missing or not active"),
        )
        for change, text in cases:
            self.p13(change, text=text)

    def test_bad_associations_fail(self):
        cases = (
            (lambda s: rt(s, "rtb-db")["Associations"][0].update(AssociationState={"State": "disassociating"}),
             f"{C}-db-a association disassociating"),
            (lambda s: rt(s, "rtb-public")["Associations"].append(
                {"Main": False, "RouteTableAssociationId": "rtbassoc-edge", "RouteTableId": "rtb-public",
                 "GatewayId": IGW, "AssociationState": {"State": "associated"}}), f"edge association {IGW}"),
            (lambda s: rt(s, "rtb-db")["Associations"].append(
                {"Main": True, "RouteTableAssociationId": "rtbassoc-m2", "RouteTableId": "rtb-db",
                 "AssociationState": {"State": "associated"}}), "two route tables as main"),
            (lambda s: rt(s, "rtb-main")["Associations"][0].update(SubnetId="subnet-db-a"), "main association"),
        )
        for change, text in cases:
            self.p13(change, text=text)

    def test_default_security_group_tag_and_rules_checked(self):
        def change(s):
            net(s, "security-groups")["SecurityGroups"][0]["Tags"] = []
        self.p13(change, text=f"default security group Name tag = None, expected {C}-default-unused")
        for key in ("IpPermissions", "IpPermissionsEgress"):
            def change2(s, key=key):
                net(s, "security-groups")["SecurityGroups"][0][key] = [{"IpProtocol": "-1"}]
            self.p13(change2, text="default security group has rules")

    def test_access_denied_is_error(self):
        for key in ("route-tables", "vpcs", "internet-gateways"):
            def change(s, key=key):
                s[f"ec2 describe-{key}"] = {"error": "UnauthorizedOperation", "message": "You are not authorized"}
            run = self.p13(change, expect="ERROR", text="UnauthorizedOperation")
            self.assertNotIn("ABSENT", "\n".join(run.lines("FAIL", "P-13")))
            self.assertEqual(run.rc, 2)

    def test_malformed_response_is_error(self):
        for key, bad in (("route-tables", {"Foo": 1}), ("route-tables", {"RouteTables": [{"RouteTableId": "rtb-1"}]}),
                         ("subnets", {"Subnets": "x"}), ("internet-gateways", {"InternetGateways": [{"Attachments": []}]})):
            def change(s, key=key, bad=bad):
                s[f"ec2 describe-{key}"] = {"json": bad}
            run = self.p13(change, expect="ERROR", text="malformed response")
            self.assertEqual(run.rc, 2)

        def change2(s):
            s["ec2 describe-security-groups"] = {"stderr": "", "rc": 0}
        self.p13(change2, expect="ERROR")


class GeneralSafetyTest(Base):
    def test_baseline_calls_exactly_the_expected_operations(self):
        run = self.run_with()
        self.assertEqual(collapse(run.calls), BASELINE_CALLS)
        p6 = [c for c in run.calls if c["operation"] == "list-secrets"][0]
        self.assertIs(p6["options"].get("--include-planned-deletion"), True)

    def test_unknown_operation_is_refused_before_execution(self):
        text = mutate('h "P-13 network topology (stack/network.tf, Config A1)"\n',
                      "aws_call P-13 '' ssm get-parameter --name x --output text\n")
        run = Run(baseline(), script_text=text)
        self.assertIn("[ERROR] P-13: refused: aws ssm get-parameter is not an allowed read operation", run.out)
        self.assertNotIn("ssm", [c["service"] for c in run.calls])
        self.assertEqual(run.rc, 2)

    def test_redirecting_options_are_refused(self):
        for args in ("--endpoint-url http://127.0.0.1", "--profile x", "--no-verify-ssl", "--region us-west-2",
                     "--region=us-west-2", "--max-items 5", "--cli-input-json file://x"):
            text = mutate('h "P-13 network topology (stack/network.tf, Config A1)"\n',
                          f"aws_call P-13 '' ec2 describe-vpcs {args} --output json\n")
            run = Run(baseline(), script_text=text)
            self.assertIn("[ERROR] P-13: refused:", run.out, args)
            self.assertEqual(run.rc, 2, args)
            self.assertEqual(len([c for c in run.calls if c["operation"] == "describe-vpcs"]), 1, args)

    def test_inherited_endpoints_and_aws_function_are_cleared(self):
        env = {"AWS_ENDPOINT_URL": "http://127.0.0.1:1", "AWS_ENDPOINT_URL_STS": "http://127.0.0.1:2",
               "AWS_CLI_AUTO_PROMPT": "on", "AWS_PAGER": "less",
               "BASH_FUNC_aws%%": f'() {{ echo "{ACCOUNT}\tarn:aws:iam::{ACCOUNT}:root"; }}',
               "BASH_FUNC_read%%": "() { builtin read \"$@\"; ACCOUNT=999999999999; }",
               "BASH_FUNC_printf%%": "() { :; }", "BASH_FUNC_record%%": "() { :; }"}
        run = self.run_with(extra_env=env)  # assertSafeCalls checks what reached the CLI
        self.assertEqual(run.rc, 0, run.out)
        self.assertEqual(len(run.calls), sum(n for _, n in BASELINE_CALLS))

    def test_invalid_or_future_since_is_error_without_reading_cloudtrail(self):
        for since in ("2026-11-10", "--max-items=1", "2099-01-01T00:00:00Z"):
            run = self.run_with(extra_env={"PREFLIGHT_SINCE": since})
            self.assertEqual(run.status("P-12"), "ERROR", since)
            self.assertNotIn("lookup-events", [c["operation"] for c in run.calls], since)

    def test_cloudtrail_unread_or_truncated_is_error(self):
        for bad in ({}, {"Events": None}, None, {"NextToken": "x", "Events": []}):
            def change(s, bad=bad):
                s["cloudtrail lookup-events us-east-1"] = {"json": bad}
            run = self.run_with(change)
            self.assertEqual(run.status("P-12"), "ERROR", bad)
            self.assertNotIn("Traceback", run.out)

    def test_cloudtrail_request_data_is_never_printed(self):
        def change(s):
            e = {"eventTime": "t", "eventSource": "ecs.amazonaws.com", "eventName": "RunTask", "errorCode": "AccessDenied",
                 "requestParameters": {"overrides": CANARY}, "responseElements": CANARY,
                 "userIdentity": {"arn": f"arn:aws:iam::{ACCOUNT}:root"}}
            s["cloudtrail lookup-events us-east-1"] = {"json": {"Events": [{"CloudTrailEvent": json.dumps(e)}]}}
        run = self.run_with(change)
        self.assertEqual(run.status("P-12"), "FAIL")
        self.assertNotIn(CANARY, run.out)

    def test_failed_command_is_never_pass(self):
        failures = (ACCESS_DENIED, NETWORK, {"error": "Throttling", "message": "Rate exceeded"})
        # every response the expected run reads (the bare-prefix listing is kept only as ECS's answer)
        keys = [k for k in baseline() if k not in ("sts get-caller-identity", f"ecs list-task-definitions {C}")]
        for i, key in enumerate(keys):
            def change(s, key=key, f=failures[i % 3]):
                s[key] = f
            run = self.run_with(change)
            self.assertNotIn("OVERALL: PASS", run.out, key)
            self.assertNotEqual(run.rc, 0, key)
            self.assertIn("[ERROR]", run.out, key)


if __name__ == "__main__":
    unittest.main()
