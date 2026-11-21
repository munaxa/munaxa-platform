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


# IC-1 regression (21 Nov 2026): the 29 Oct Engineering draft let an Engineering session rewrite the
# Production deployer's trust, attach policies to it and create new boundary versions. These tests
# walk every IAM write action AWS documents against every privileged principal and policy in this
# account and require an explicit deny (not just "no allow"), so a future edit that adds an allow
# cannot silently reopen the path.
IAM_WRITE_ACTIONS = (
    # roles, trust and boundaries
    "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
    "iam:DeleteRolePolicy", "iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary",
    "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:TagRole",
    "iam:UntagRole", "iam:PassRole", "iam:CreateServiceLinkedRole",
    # managed policies (boundaries are managed policies)
    "iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:DeletePolicyVersion",
    "iam:DeletePolicy", "iam:TagPolicy",
    # users, keys, groups
    "iam:CreateUser", "iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:CreateLoginProfile",
    "iam:UpdateLoginProfile", "iam:PutUserPolicy", "iam:AttachUserPolicy", "iam:PutUserPermissionsBoundary",
    "iam:AddUserToGroup", "iam:CreateGroup", "iam:PutGroupPolicy", "iam:AttachGroupPolicy",
    "iam:EnableMFADevice", "iam:DeactivateMFADevice", "iam:CreateVirtualMFADevice", "iam:UploadSSHPublicKey",
    "iam:CreateServiceSpecificCredential", "iam:UploadServerCertificate", "iam:UploadSigningCertificate",
    # instance profiles and federation (GitHub OIDC)
    "iam:CreateInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:CreateOpenIDConnectProvider",
    "iam:UpdateOpenIDConnectProviderThumbprint", "iam:AddClientIDToOpenIDConnectProvider",
    "iam:RemoveClientIDFromOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider", "iam:TagOpenIDConnectProvider",
    "iam:CreateSAMLProvider", "iam:UpdateSAMLProvider",
    # account-wide
    "iam:UpdateAccountPasswordPolicy", "iam:CreateAccountAlias", "iam:SetSecurityTokenServicePreferences",
)
PRIVILEGED = (
    DEPLOYER_PROD,
    f"arn:aws:iam::{ACCT}:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod",
    f"arn:aws:iam::{ACCT}:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session",
    f"arn:aws:iam::{ACCT}:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session",
    f"arn:aws:iam::{ACCT}:role/munaxa-docs/eu-prod/munaxa-docs-eu-prod-deployer",
    f"arn:aws:iam::{ACCT}:role/munaxa-shared/munaxa-nonprod-docs-api-task",
    f"arn:aws:iam::{ACCT}:role/aws-reserved/sso.amazonaws.com/eu-central-1/AWSReservedSSO_MunaxaAdministrator_0123456789abcdef",
    f"arn:aws:iam::{ACCT}:role/OrganizationAccountAccessRole",
    BOUNDARY,
    f"arn:aws:iam::{ACCT}:policy/munaxa-shared/munaxa-shared-image-publisher-boundary",
    f"arn:aws:iam::{ACCT}:policy/munaxa-docs/eu-prod/munaxa-docs-workload-boundary",
    f"arn:aws:iam::{ACCT}:oidc-provider/token.actions.githubusercontent.com",
    f"arn:aws:iam::{ACCT}:user/anyone",
    "*",
)


class EngineeringIC1Regression(unittest.TestCase):
    p = load("MunaxaEngineering.management-interim.inline.json")

    def test_every_iam_write_is_explicitly_denied_everywhere(self):
        for act in IAM_WRITE_ACTIONS:
            for res in PRIVILEGED:
                for region in ("eu-central-1", "us-east-1"):
                    self.assertEqual(decide(self.p, act, res, base_allow=VIEW_ONLY, **{"aws:RequestedRegion": region}),
                                     "deny", (act, res, region))

    def test_cannot_assume_or_federate_into_privileged_roles(self):
        for act in ("sts:AssumeRole", "sts:AssumeRoot", "sts:AssumeRoleWithWebIdentity"):
            for res in PRIVILEGED:
                self.assertEqual(decide(self.p, act, res), "deny", (act, res))

    def test_no_allow_statement_grants_identity_or_role_control(self):
        # Structural guard: no Allow may name iam:, sts:, sso:, identitystore:, organizations: or a
        # wildcard service, whatever its resource; only CloudShell may use a service-wide wildcard.
        banned = re.compile(r"^(iam|sts|sso|sso-directory|identitystore|organizations|account|lambda|cloudformation):|^\*$")
        for st in self.p["Statement"]:
            if st["Effect"] != "Allow":
                continue
            self.assertNotIn("NotAction", st, st["Sid"])
            for act in _list(st["Action"]):
                self.assertIsNone(banned.match(act), (st["Sid"], act))
                if act.endswith(":*"):
                    self.assertEqual(act, "cloudshell:*", st["Sid"])

    def test_production_secrets_and_keys_refused(self):
        prod_secrets = (f"{SECRET}munaxa-prod/identity-Ab12Cd", f"{SECRET}munaxa-prod/control-api-Ab12Cd",
                        f"{SECRET}munaxa-docs/eu-prod/app-Ab12Cd", f"{SECRET}munaxa-nonprod/identity-operator-Ab12Cd",
                        f"{SECRET}munaxa-nonprod/identity-Ab12Cd")
        for arn in prod_secrets:
            for act in ("secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "secretsmanager:PutSecretValue"):
                self.assertIn(decide(self.p, act, arn, base_allow=VIEW_ONLY), ("deny", "implicit"), (act, arn))
        prod_key = f"arn:aws:kms:eu-central-1:{ACCT}:key/22222222-2222-2222-2222-222222222222"
        for act in ("kms:Decrypt", "kms:GenerateDataKey", "kms:Sign", "kms:CreateGrant", "kms:ReEncryptFrom"):
            self.assertEqual(decide(self.p, act, prod_key, **{"kms:ViaService": "secretsmanager.eu-central-1.amazonaws.com"}),
                             "deny", act)
            self.assertEqual(decide(self.p, act, NONPROD_KEY, **{"aws:ResourceTag/Environment": "production"}), "deny", act)


class OtherSetsNoIAMWrite(unittest.TestCase):
    def test_readonly_grants_no_iam_write_and_no_assume(self):
        p = load("MunaxaReadOnly.inline.json")
        for act in IAM_WRITE_ACTIONS + ("sts:AssumeRole", "sts:AssumeRoot"):
            for res in (DEPLOYER_PROD, BOUNDARY, "*"):
                self.assertIn(decide(p, act, res), ("deny", "implicit"), (act, res))


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
