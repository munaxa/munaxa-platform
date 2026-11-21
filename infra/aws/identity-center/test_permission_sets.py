#!/usr/bin/env python3
"""Offline checks of the IAM Identity Center permission-set inline policies in this folder.

A small evaluator of IAM's explicit-deny-wins logic for the statement shapes these files use
(Action/NotAction, Resource/NotResource with * and ? wildcards, StringEquals,
StringEqualsIgnoreCase and StringNotEquals conditions; a missing condition key never matches).
It is not AWS: the owner's verification (README.md section 5) is the proof on the real account.
Standard library only, no network, no credentials.

    python3 -I -m unittest discover -s infra/aws/identity-center -p 'test_*.py' -v
"""
import fnmatch, json, os, re, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ACCT = "229251310592"
NONPROD_KEY = f"arn:aws:kms:eu-central-1:{ACCT}:key/45eda044-092a-4f31-9243-3f9548636e37"
SECRET = f"arn:aws:secretsmanager:eu-central-1:{ACCT}:secret:"
DEPLOYER_PROD = f"arn:aws:iam::{ACCT}:role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod"
BOUNDARY = f"arn:aws:iam::{ACCT}:policy/munaxa-shared/munaxa-shared-workload-boundary"


def load(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)


def _list(v):
    return v if isinstance(v, list) else [v]


def _match(patterns, value, ignore_case=False):
    for p in _list(patterns):
        rx = "^" + re.escape(p).replace(r"\*", ".*").replace(r"\?", ".") + "$"
        if re.match(rx, value, re.I if ignore_case else 0):
            return True
    return False


def _conditions(cond, ctx):
    for op, kv in (cond or {}).items():
        for key, want in kv.items():
            have = ctx.get(key)
            if op == "StringEquals":
                if have is None or have not in _list(want):
                    return False
            elif op == "StringEqualsIgnoreCase":
                if have is None or have.lower() not in [w.lower() for w in _list(want)]:
                    return False
            elif op == "StringNotEquals":
                if have is None or have in _list(want):
                    return False
            else:
                raise AssertionError(f"unsupported operator {op}")
    return True


def _applies(st, action, resource, ctx):
    if "Action" in st and not _match(st["Action"], action, ignore_case=True):
        return False
    if "NotAction" in st and _match(st["NotAction"], action, ignore_case=True):
        return False
    if "Resource" in st and not _match(st["Resource"], resource):
        return False
    if "NotResource" in st and _match(st["NotResource"], resource):
        return False
    return _conditions(st.get("Condition"), ctx)


def decide(policy, action, resource="*", base_allow=(), **ctx):
    """'deny' (explicit), 'allow', or 'implicit' (neither). base_allow: actions a managed policy grants."""
    ctx.setdefault("aws:RequestedRegion", "eu-central-1")
    sts = policy["Statement"]
    if any(s["Effect"] == "Deny" and _applies(s, action, resource, ctx) for s in sts):
        return "deny"
    if any(s["Effect"] == "Allow" and _applies(s, action, resource, ctx) for s in sts):
        return "allow"
    if _match(list(base_allow), action, ignore_case=True):
        return "allow"
    return "implicit"


# What AWS-managed ViewOnlyAccess grants, reduced to the prefixes these tests touch.
VIEW_ONLY = ["rds:Describe*", "ecs:List*", "ecs:Describe*", "secretsmanager:ListSecrets", "logs:Describe*", "iam:List*",
             "s3:ListAllMyBuckets", "kms:ListKeys", "kms:ListAliases"]


class Engineering(unittest.TestCase):
    p = load("MunaxaEngineering.management-interim.inline.json")

    def allow(self, *a, **k):
        self.assertEqual(decide(self.p, *a, base_allow=VIEW_ONLY, **k), "allow", a)

    def refuse(self, *a, **k):
        self.assertIn(decide(self.p, *a, base_allow=VIEW_ONLY, **k), ("deny", "implicit"), a)

    def test_owner_custody_scripts_work(self):
        for name in ("control-api", "control-migrate", "docs-api", "docs-operator", "docs-migrate", "work-api", "work-migrate"):
            arn = f"{SECRET}munaxa-nonprod/{name}-Ab12Cd"
            for act in ("secretsmanager:DescribeSecret", "secretsmanager:ListSecretVersionIds",
                        "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"):
                self.allow(act, arn, **{"aws:ResourceTag/Environment": "nonprod"})
        prov = f"{SECRET}munaxa-nonprod/docs-provision/munaxa-internal-Zz99Yy"
        for act in ("secretsmanager:CreateSecret", "secretsmanager:TagResource", "secretsmanager:PutSecretValue",
                    "secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret", "secretsmanager:DeleteSecret"):
            self.allow(act, prov)
        for act in ("kms:GenerateDataKey", "kms:Decrypt"):
            self.allow(act, NONPROD_KEY, **{"kms:ViaService": "secretsmanager.eu-central-1.amazonaws.com"})
        self.allow("rds:DescribeDBInstances", f"arn:aws:rds:eu-central-1:{ACCT}:db:munaxa-nonprod-pg")
        self.allow("cloudshell:CreateSession")
        self.allow("logs:FilterLogEvents", f"arn:aws:logs:eu-central-1:{ACCT}:log-group:/munaxa/nonprod/docs-api:*")

    def test_other_nonprod_secrets_are_not_custody_targets(self):
        for name in ("identity", "identity-operator", "identity-mfa", "school-api", "control-api-extra-Ab12Cd"):
            self.refuse("secretsmanager:GetSecretValue", f"{SECRET}munaxa-nonprod/{name}-Ab12Cd")

    def test_production_and_other_secrets_refused(self):
        for arn in (f"{SECRET}munaxa-prod/docs-api-Ab12Cd", f"{SECRET}rds!db-1234-Ab12Cd", f"{SECRET}munaxa-docs/eu-prod/x-Ab12Cd"):
            for act in ("secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:DeleteSecret"):
                self.assertEqual(decide(self.p, act, arn), "deny", (act, arn))
        self.assertEqual(decide(self.p, "secretsmanager:UpdateSecretVersionStage", f"{SECRET}munaxa-nonprod/docs-api-Ab12Cd"), "deny")
        self.assertEqual(decide(self.p, "secretsmanager:DeleteSecret", f"{SECRET}munaxa-nonprod/docs-api-Ab12Cd"), "implicit")

    def test_keys(self):
        self.refuse("kms:Decrypt", NONPROD_KEY)  # without Secrets Manager in between
        other = f"arn:aws:kms:eu-central-1:{ACCT}:key/11111111-1111-1111-1111-111111111111"
        self.assertEqual(decide(self.p, "kms:Decrypt", other, **{"kms:ViaService": "secretsmanager.eu-central-1.amazonaws.com"}), "deny")
        for act in ("kms:ScheduleKeyDeletion", "kms:PutKeyPolicy", "kms:DisableKey", "kms:CreateKey"):
            self.assertEqual(decide(self.p, act, NONPROD_KEY), "deny", act)

    def test_no_privilege_escalation(self):
        for act in ("iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:CreateRole", "iam:PassRole"):
            self.assertEqual(decide(self.p, act, DEPLOYER_PROD), "deny", act)
        for act in ("iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion"):
            self.assertEqual(decide(self.p, act, BOUNDARY), "deny", act)
        for act in ("iam:CreateUser", "iam:CreateAccessKey", "iam:CreateOpenIDConnectProvider",
                    "identitystore:CreateGroupMembership", "identitystore:CreateUser", "sso:CreateAccountAssignment",
                    "sso:PutInlinePolicyToPermissionSet", "organizations:LeaveOrganization", "sts:AssumeRoot"):
            self.assertEqual(decide(self.p, act), "deny", act)
        self.assertEqual(decide(self.p, "sts:AssumeRole", DEPLOYER_PROD), "deny")

    def test_production_tagged_resources_refused(self):
        for act in ("ecs:UpdateService", "rds:StartDBInstance", "s3:PutObject", "ecs:DescribeServices"):
            for tag in ("prod", "Production"):
                self.assertEqual(decide(self.p, act, "arn:aws:x", **{"aws:ResourceTag/Environment": tag}), "deny", (act, tag))

    def test_no_workload_writes_and_no_shell(self):
        for act in ("ecs:RunTask", "ecs:UpdateService", "rds:StartDBInstance", "rds:DeleteDBInstance", "ec2:RunInstances",
                    "s3:PutObject", "s3:GetObject", "ecr:PutImage", "elasticloadbalancing:CreateLoadBalancer",
                    "route53:ChangeResourceRecordSets", "cloudtrail:StopLogging", "budgets:ModifyBudget"):
            self.refuse(act, "arn:aws:x", **{"aws:ResourceTag/Environment": "nonprod"})
        for act in ("ecs:ExecuteCommand", "ssm:StartSession", "ssm:SendCommand", "ssm:GetParameter"):
            self.assertEqual(decide(self.p, act), "deny", act)
        self.assertEqual(decide(self.p, "s3:PutObject", f"arn:aws:s3:::munaxa-shared-tfstate-{ACCT}/nonprod/x"), "deny")

    def test_frankfurt_only(self):
        self.assertEqual(decide(self.p, "cloudshell:CreateSession", **{"aws:RequestedRegion": "us-east-1"}), "deny")
        self.assertEqual(decide(self.p, "secretsmanager:GetSecretValue", f"{SECRET}munaxa-nonprod/docs-api-Ab12Cd",
                                **{"aws:RequestedRegion": "eu-west-1"}), "deny")
        self.assertEqual(decide(self.p, "sts:GetCallerIdentity", **{"aws:RequestedRegion": "us-east-1"}), "implicit")


class ReadOnly(unittest.TestCase):
    p = load("MunaxaReadOnly.inline.json")

    def test_never_reads_data_secrets_or_log_contents(self):
        for act in ("secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "kms:Decrypt",
                    "kms:GenerateDataKey", "s3:GetObject", "s3:GetObjectVersion", "logs:GetLogEvents",
                    "logs:FilterLogEvents", "logs:StartQuery", "logs:GetQueryResults", "logs:StartLiveTail",
                    "logs:Unmask", "rds:DownloadDBLogFilePortion", "ecs:ExecuteCommand", "ssm:StartSession",
                    "ssm:GetParameter", "ssm:GetParametersByPath", "ssm:SendCommand", "rds-data:ExecuteStatement",
                    "ecr:BatchGetImage", "sts:AssumeRole", "sts:AssumeRoot", "cloudshell:CreateSession"):
            self.assertEqual(decide(self.p, act), "deny", act)

    def test_inline_allows_are_reads_only(self):
        read = re.compile(r"^[a-z0-9-]+:(Get|List|Describe|View|Search|LookupEvents|GetCallerIdentity|\*$)")
        for st in self.p["Statement"]:
            if st["Effect"] == "Allow":
                for act in _list(st["Action"]):
                    self.assertTrue(read.match(act) and (not act.endswith(":*") or act == "pricing:*"), act)

    def test_reads_it_needs(self):
        for act in ("cloudtrail:LookupEvents", "ce:GetCostAndUsage", "cloudwatch:DescribeAlarms", "sso:ListPermissionSets"):
            self.assertEqual(decide(self.p, act), "allow", act)


class Administrator(unittest.TestCase):
    p = load("MunaxaAdministrator.management.inline.json")

    def test_no_workloads_and_no_secret_values(self):
        for act in ("ecs:RunTask", "ecs:CreateService", "rds:CreateDBInstance", "secretsmanager:GetSecretValue",
                    "ec2:RunInstances", "elasticloadbalancing:CreateLoadBalancer"):
            self.assertEqual(decide(self.p, act), "deny", act)


class Shape(unittest.TestCase):
    def test_sizes_and_no_mfa_condition(self):
        # An inline policy of a permission set becomes a role inline policy: 10,240 characters,
        # whitespace not counted. aws:MultiFactorAuthPresent is never present in Identity Center
        # sessions and would lock everyone out (MFA is enforced at sign-in instead).
        for name in os.listdir(HERE):
            if name.endswith(".json"):
                with open(os.path.join(HERE, name)) as f:
                    text = f.read()
                self.assertLess(len(re.sub(r"\s", "", text)), 10240, name)
                self.assertNotIn("MultiFactorAuthPresent", text, name)
                for st in json.loads(text)["Statement"]:
                    self.assertTrue(st.get("Sid"), name)
                    if st["Effect"] == "Allow":
                        self.assertNotEqual(_list(st.get("Action", [])), ["*"], name)


if __name__ == "__main__":
    unittest.main()
