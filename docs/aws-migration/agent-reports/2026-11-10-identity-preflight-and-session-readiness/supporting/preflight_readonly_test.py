#!/usr/bin/env python3
"""Offline tests for preflight-readonly.sh. No AWS call: `aws` on PATH is preflight_aws_stub.py.

    pip install jmespath            # the stub applies the script's --query expressions with it
    python3 -I preflight_readonly_test.py -v

Covers: the expected state (PASS), wrong account and unreadable account (stop before any other
call), AWS CLI failures (access denied, throttling, network, missing helper; never PASS), expected
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
SIDS = ["SessionCiRoleWithSourceIdentity", "SessionEdgeAndServices", "SessionNeverSecurityGroupRules",
        "SessionNeverNetworkPlacement", "SessionPassOwnRoles", "SessionDatabaseStartStop"]
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
        "sts get-caller-identity": {"json": {"Account": ACCOUNT, "Arn": f"arn:aws:iam::{ACCOUNT}:root", "UserId": ACCOUNT}},
        f"rds describe-db-instances {C}-pg": {"json": {"DBInstances": [{
            "DBInstanceStatus": "stopped", "DBInstanceClass": "db.t4g.micro", "PubliclyAccessible": False,
            "DeletionProtection": True, "MultiAZ": False, "StorageEncrypted": True, "DBSubnetGroup": {"VpcId": VPC},
            "DBParameterGroups": [{"DBParameterGroupName": f"{C}-pg16", "ParameterApplyStatus": "in-sync"}],
            "MasterUserSecret": {"SecretArn": master, "SecretStatus": "active"}, "EngineVersion": "16.4"}]}},
        f"ecs describe-clusters": {"json": {"clusters": [{"clusterName": C, "status": "ACTIVE", "runningTasksCount": 0,
                                                          "pendingTasksCount": 0, "activeServicesCount": 0}], "failures": []}},
        "ecs list-task-definitions": {"json": {"taskDefinitionArns": [
            f"arn:aws:ecs:eu-central-1:{ACCOUNT}:task-definition/{C}-{f}:1"
            for f in ("db-admin", "identity", "identity-bootstrap", "identity-migrate")]}},
        f"ecs describe-task-definition {C}-identity": td("identity", [
            f"{ECR}/munaxa-identity/api@sha256:{D_ID}", f"public.ecr.aws/valkey/valkey@sha256:{D_VK}"], [
            [("DATABASE_URL", f"{ident_ref}:DATABASE_URL::{PIN_I}"), ("REDIS_URL", f"{ident_ref}:REDIS_URL::{PIN_I}")],
            [("REDIS_PASSWORD", f"{ident_ref}:REDIS_PASSWORD::{PIN_I}")]]),
        f"ecs describe-task-definition {C}-identity-migrate": td("identity-migrate", [
            f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"], [
            [("DIRECT_DATABASE_URL", f"{mig_ref}:DATABASE_MIGRATION_URL::{PIN_M}")]]),
        f"ecs describe-task-definition {C}-identity-bootstrap": td("identity-bootstrap", [
            f"{ECR}/munaxa-identity/migrate@sha256:{D_MG}"], [
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
        "iam list-roles": {"json": {"Roles": [
            {"RoleName": "munaxa-shared-ci-nonprod-session", "MaxSessionDuration": 3600},
            {"RoleName": "munaxa-shared-deployer-nonprod-session", "MaxSessionDuration": 3600}]}},
        "iam list-role-policies munaxa-shared-deployer-nonprod-session": {"json": {"PolicyNames": ["session-deployer"]}},
        "iam list-attached-role-policies munaxa-shared-deployer-nonprod-session": {"json": {"AttachedPolicies": [
            {"PolicyName": "munaxa-shared-deployer-read"}, {"PolicyName": "munaxa-shared-deployer-nonprod-session-read"}]}},
        "iam get-role-policy munaxa-shared-deployer-nonprod-session": {"json": {"PolicyDocument": {"Statement": [
            {"Sid": s, "Effect": "Allow", "Action": [CANARY]} for s in SIDS]}}},
        "cloudtrail lookup-events eu-central-1": trail(None, "ThrottlingException", None),
        "cloudtrail lookup-events us-east-1": trail(None),
        "ec2 describe-subnets": {"json": {"Subnets": [
            {"Tags": [{"Key": "Name", "Value": f"{C}-public-a"}], "VpcId": VPC},
            {"Tags": [{"Key": "Name", "Value": f"{C}-public-b"}], "VpcId": VPC}]}},
        "ec2 describe-security-groups": {"json": {"SecurityGroups": [
            {"GroupName": f"{C}-{g}", "GroupId": f"sg-{i}", "VpcId": VPC}
            for i, g in enumerate(["alb", "database", "db-admin", "identity", "identity-migrate"])]}},
        "ec2 describe-route-tables": {"json": {"RouteTables": [{"Routes": [
            {"DestinationCidrBlock": "10.40.0.0/16", "GatewayId": "local"},
            {"DestinationCidrBlock": "0.0.0.0/0", "GatewayId": "igw-0123456789abcdef0"}]}]}},
    }


ACCESS_DENIED = {"error": "AccessDeniedException", "message": "User is not authorized to perform this action"}
NETWORK = {"stderr": '\nCould not connect to the endpoint URL: "https://ecs.eu-central-1.amazonaws.com/"', "rc": 255}


class Run:
    def __init__(self, scenario, with_helper=True, with_aws=True):
        self.dir = tempfile.mkdtemp(prefix="preflight-test-")
        try:
            shutil.copy(SCRIPT, self.dir)
            if with_helper:
                shutil.copy(DENIALS, self.dir)
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
                   "HOME": self.dir, "LANG": "C.UTF-8"}
            proc = subprocess.run([shutil.which("bash"), os.path.join(self.dir, "preflight-readonly.sh")],
                                  env=env, capture_output=True, text=True, timeout=120)
            self.rc, self.out = proc.returncode, proc.stdout + proc.stderr
            with open(log) as f:
                self.calls = [json.loads(line) for line in f if line.strip()]
        finally:
            shutil.rmtree(self.dir)

    def status(self, check):
        m = re.search(rf"^{re.escape(check)} +(PASS|FAIL|ERROR)$", self.out, re.M)
        return m and m.group(1)

    def lines(self, status, check):
        return [l for l in self.out.splitlines() if l.startswith(f"  [{status}] {check}:")]


class PreflightTest(unittest.TestCase):
    maxDiff = None

    def run_with(self, change=None, **kwargs):
        scenario = baseline()
        if change:
            change(scenario)
        return Run(scenario, **kwargs)

    def assertReadOnly(self, run):
        for call in run.calls:
            self.assertRegex(call["operation"], READ_ONLY, call)
            self.assertNotIn(call["operation"], FORBIDDEN, call)
        self.assertNotIn(CANARY, run.out)

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
        # P-13 cannot compare VPCs without the database VPC: not a PASS either
        self.assertEqual(run.status("P-13"), "FAIL")
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
            s["ecs list-task-definitions"] = NETWORK
        run = self.run_with(change)
        self.assertEqual(run.status("P-3"), "ERROR")
        self.assertIn("aws ecs list-task-definitions failed (exit 255): Could not connect to the endpoint URL", run.out)
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
        self.assertIn("cloudtrail-denials.py exit 2", run.out)

    def test_missing_denials_helper_is_error(self):
        run = self.run_with(with_helper=False)
        self.assertEqual(run.status("P-12"), "ERROR")
        self.assertIn("cloudtrail-denials.py not found next to this script", run.out)
        self.assertEqual(run.rc, 2)
        self.assertNotIn("lookup-events", [c["operation"] for c in run.calls])

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

    # -- static guarantees
    def test_script_only_calls_allowlisted_read_operations(self):
        with open(SCRIPT) as f:
            source = f.read()
        allowed = re.search(r'ALLOWED_OPS="([^"]*)"', source).group(1).split()
        for entry in allowed:
            service, operation = entry.split(":")
            self.assertRegex(operation, READ_ONLY, entry)
            self.assertNotIn(operation, FORBIDDEN, entry)
        code = "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("#"))
        found = re.findall(r"get-secret-value|terraform |tfstate|\bs3 cp\b|get-object|\blogs ", code)
        self.assertEqual(found, [])
        # aws is called directly only for the account guard; everything else goes through aws_call
        direct = [l.strip() for l in source.splitlines() if re.search(r'(^|[=(\s])aws [\w"$]', l)
                  and not l.lstrip().startswith("#") and "echo" not in l and "record" not in l]
        self.assertEqual(direct, [
            'OUT=$(aws "$svc" "$op" "$@" 2>"$ERRFILE") || rc=$?',
            "IDENT=$(aws sts get-caller-identity --query '[Account,Arn]' --output text 2>\"$ERRFILE\") || rc=$?"])
        for svc, op in re.findall(r"aws_call [\w-]+ '[^']*' (\w+) ([\w-]+)", source):
            self.assertIn(f"{svc}:{op}", allowed)


if __name__ == "__main__":
    unittest.main()
