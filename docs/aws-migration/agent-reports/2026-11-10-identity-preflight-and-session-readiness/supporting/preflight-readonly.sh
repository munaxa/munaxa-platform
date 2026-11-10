#!/usr/bin/env bash
# First Identity session preflight, P-1 to P-13 (report 2026-11-10-identity-preflight-and-session-readiness).
#
# READ-ONLY. Run in AWS CloudShell, eu-central-1. Self-contained: the CloudTrail denial filter
# (cloudtrail-denials.py from 2026-11-10-identity-first-session-preparation/supporting) is embedded.
# - Account and identity guard: stops before any other AWS call unless the active account is exactly
#   229251310592 and the caller ARN belongs to it. A root caller is refused unless the owner sets
#   ALLOW_ROOT_READONLY=yes (infra/aws/ACCESS-POLICY.md 1.3: owner-run read-only checks as root are
#   the approved development mode); a non-root role or user in the account needs no flag.
# - Every AWS call goes through aws_call, which only runs the read operations in ALLOWED_OPS
#   (Describe/List/Get metadata, sts get-caller-identity, cloudtrail lookup-events), and refuses
#   options that would redirect or reshape a call (endpoint, profile, input file, paging). There is no
#   create, update, delete, start, stop, run, put, tag, Terraform, IAM, KMS or Secrets Manager write,
#   no get-secret-value, no Terraform state, no CloudWatch Logs and no application data. CloudTrail
#   events and task definitions are downloaded whole and filtered on this machine to metadata.
# - P-11b compares the two session roles' settings, trust policies and every policy document with
#   the code (infra/aws/bootstrap/iam_session.tf, iam.tf, iam_allow.tf), statement by statement.
#   P-13 compares the VPC, subnets, route tables, associations, routes, internet gateway, S3
#   endpoint and security groups with infra/aws/stack/network.tf (Config A1).
# - Output is metadata only (names, ids, ARNs, states, counts, and on a policy difference the
#   differing actions or resources, never condition values). Paste it back whole.
# - Run it with bash in a fresh CloudShell tab: the script clears shell functions and endpoint
#   overrides it inherits, but cannot undo a BASH_ENV file.
#
# Each check prints PASS, FAIL or ERROR lines:
#   PASS   the call succeeded and the value matches the expected state
#   FAIL   the call succeeded and the value differs, or AWS answered that the resource does not exist
#          (shown as ABSENT, with the AWS error code); an absence that is expected (P-6) is a PASS
#   ERROR  the call itself failed (access denied, throttling, network, missing CLI or helper):
#          nothing was verified, and the run can never end in OVERALL: PASS
# Exit codes: 0 PASS, 1 FAIL, 2 INCOMPLETE (at least one ERROR), 3 stopped before the checks.
set -uo pipefail
# Nothing inherited may stand in for the AWS CLI or the tools that read its output, or send calls
# to another endpoint, or wait for input.
unset -f unset builtin command read declare aws python3 grep sed cut tr sort paste head mktemp cat date rm 2>/dev/null
# and no inherited function at all (this script defines its own only below this line)
while builtin read -r f; do builtin unset -f "${f##* }"; done < <(builtin declare -F)
unset AWS_ENDPOINT_URL
for v in $(compgen -e); do [[ $v == AWS_ENDPOINT_URL_* ]] && unset "$v"; done
export AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true AWS_CLI_AUTO_PROMPT=off AWS_RETRY_MODE=adaptive AWS_MAX_ATTEMPTS=10
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""
EXPECTED_ACCOUNT=229251310592
C=munaxa-nonprod
SINCE=${PREFLIGHT_SINCE:-2026-11-10T06:00:00Z}
PIN_IDENTITY=ad02f18e-f3e7-41da-9959-f9b41e0b7e1a
PIN_MIGRATE=a3cc6622-df66-4787-bae7-83ccfec56ff4
D_IDENTITY=71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156
D_VALKEY=757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e
D_MIGRATE=d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820
D_POSTGRES=5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e
CHECKS=(P-1 P-2 P-3 P-4 P-5 P-6 P-7 P-8 P-9 P-10 P-11 P-11b P-12 P-13)

# The only AWS operations this script may call.
ALLOWED_OPS=" sts:get-caller-identity rds:describe-db-instances ecs:describe-clusters ecs:list-task-definition-families
 ecs:list-task-definitions
 ecs:describe-task-definition ecs:list-services ecs:list-tasks secretsmanager:describe-secret
 secretsmanager:list-secret-version-ids secretsmanager:list-secrets kms:describe-key elbv2:describe-load-balancers
 elbv2:describe-target-groups ec2:describe-nat-gateways ec2:describe-addresses ec2:describe-instances
 ec2:describe-network-interfaces ec2:describe-subnets ec2:describe-security-groups ec2:describe-route-tables
 scheduler:list-schedules scheduler:get-schedule acm:list-certificates acm:describe-certificate ecr:describe-images
 iam:get-role iam:list-roles iam:list-role-policies iam:list-attached-role-policies iam:get-role-policy
 iam:get-policy iam:get-policy-version ec2:describe-vpcs ec2:describe-internet-gateways ec2:describe-vpc-endpoints
 cloudtrail:lookup-events "
ALLOWED_OPS=${ALLOWED_OPS//$'\n'/ }

# CloudTrail denial filter: byte-for-byte copy of cloudtrail-denials.py (a test enforces it).
DENIAL_FILTER=$(
  cat <<'PY'
#!/usr/bin/env python3
"""Count authorization denials in CloudTrail event history (read-only, metadata only).

    aws cloudtrail lookup-events --region eu-central-1 --start-time 2026-11-10T06:00:00Z --output json \
      | python3 -I cloudtrail-denials.py

Give the AWS CLI no --max-results: without it the CLI follows every page, so the whole window is
read; with it the CLI stops at that many events (the 10 Nov report's 50-event command did that).
Run it once for eu-central-1 and once for us-east-1 (IAM and STS events are recorded there).

A denial is an event whose `errorCode` field (not its message, not its request) contains
AccessDenied (AccessDenied, AccessDeniedException) or ends in UnauthorizedOperation
(UnauthorizedOperation, Client.UnauthorizedOperation). Prints one line per denial: time, source,
action, error code, principal ARN; never the request or response. Exit 0 none, 1 some, 2 bad input
(not JSON, no Events list, an event that is not an object, or a NextToken left over).
"""
import json
import re
import sys

DENIAL = re.compile(r"AccessDenied|UnauthorizedOperation$")


def denials(document):
    """document: the parsed lookup-events JSON ({"Events": [...]}) or a bare list of events.

    Anything else raises ValueError, so a response that was not read is never counted as clean:
    no Events list, an event that is not an object, or a NextToken left over (output truncated).
    """
    if isinstance(document, dict):
        if document.get("NextToken"):
            raise ValueError("NextToken present: the CLI did not read every page")
        events = document.get("Events")
    else:
        events = document
    if not isinstance(events, list):
        raise ValueError("no Events list")
    found = []
    for item in events:
        if not isinstance(item, dict):
            raise ValueError("an event is not an object")
        raw = item.get("CloudTrailEvent")
        event = json.loads(raw) if isinstance(raw, str) else (raw or item)
        if not isinstance(event, dict):
            raise ValueError("an event is not an object")
        code = event.get("errorCode")
        if isinstance(code, str) and DENIAL.search(code):
            found.append((
                event.get("eventTime", "?"),
                event.get("eventSource", "?"),
                event.get("eventName", "?"),
                code,
                (event.get("userIdentity") or {}).get("arn", "?"),
            ))
    return len(events), found


def main():
    try:
        total, found = denials(json.load(sys.stdin))
    except (ValueError, AttributeError, TypeError) as error:
        print(f"cannot read lookup-events JSON: {error}")
        return 2
    print(f"events {total} denials {len(found)}")
    for row in found:
        print(*row, sep="  ")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
PY
)

# P-11b expected session roles: rendered from infra/aws/bootstrap (iam_session.tf, iam.tf, iam_allow.tf)
# by terraform 1.16.5 with provider aws 6.67.0, offline, at main ae90b2d, then canonicalised (lists
# sorted, one statement per line). Values the code takes from other resources are literal here: the
# state key ARN (owner CloudShell evidence; also checked live through its alias), the state bucket
# and the role ARNs. See report 2026-11-10-identity-post-merge-preflight-verification, section 13.
SESSION_SPEC=$(
  cat <<'SPEC'
{
  "path": "/munaxa-shared/bootstrap/",
  "roles": {
    "munaxa-shared-ci-nonprod-session": {
      "Arn": "arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session",
      "MaxSessionDuration": 3600,
      "PermissionsBoundary": null,
      "attached": {},
      "inline": {
        "assume-own-session-deployer-only": {"Version": "2012-10-17", "Statement": [
          {"Action": ["sts:AssumeRole", "sts:SetSourceIdentity"], "Effect": "Allow", "Resource": ["arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session"]}
        ]}
      },
      "trust": {"Version": "2012-10-17", "Statement": [
        {"Action": ["sts:AssumeRoleWithWebIdentity"], "Condition": {"StringEquals": {"token.actions.githubusercontent.com:aud": ["sts.amazonaws.com"], "token.actions.githubusercontent.com:ref": ["refs/heads/main"], "token.actions.githubusercontent.com:sub": ["repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod-session"]}}, "Effect": "Allow", "Principal": {"Federated": ["arn:aws:iam::229251310592:oidc-provider/token.actions.githubusercontent.com"]}}
      ]}
    },
    "munaxa-shared-deployer-nonprod-session": {
      "Arn": "arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session",
      "MaxSessionDuration": 3600,
      "PermissionsBoundary": null,
      "attached": {
        "arn:aws:iam::229251310592:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read": {"Version": "2012-10-17", "Statement": [
          {"Action": ["s3:GetAccelerateConfiguration", "s3:GetBucket*", "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration", "s3:ListBucket"], "Effect": "Allow", "Resource": ["arn:aws:s3:::munaxa-nonprod-*"], "Sid": "RefreshOwnBuckets"},
          {"Action": ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags"], "Condition": {"StringEquals": {"aws:ResourceTag/Environment": ["nonprod"], "aws:ResourceTag/Project": ["munaxa"]}}, "Effect": "Allow", "Resource": ["arn:aws:kms:eu-central-1:229251310592:key/*"], "Sid": "RefreshOwnKeys"},
          {"Action": ["iam:GetRole", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:ListRoleTags"], "Effect": "Allow", "Resource": ["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"], "Sid": "RefreshOwnRoles"},
          {"Action": ["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy"], "Effect": "Allow", "Resource": ["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"], "Sid": "RefreshOwnSecretContainers"}
        ]},
        "arn:aws:iam::229251310592:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-read": {"Version": "2012-10-17", "Statement": [
          {"Action": ["acm:DescribeCertificate", "acm:GetCertificate", "acm:ListCertificates", "acm:ListTagsForCertificate", "cloudwatch:DescribeAlarms", "ec2:Describe*", "ecs:Describe*", "ecs:List*", "elasticloadbalancing:Describe*", "kms:ListAliases", "kms:ListKeys", "logs:DescribeLogGroups", "logs:ListTagsForResource", "logs:ListTagsLogGroup", "rds:Describe*", "rds:ListTagsForResource", "route53:GetChange", "route53:GetHostedZone", "route53:ListHostedZones*", "route53:ListResourceRecordSets", "route53:ListTagsForResource", "scheduler:GetSchedule", "scheduler:ListSchedules", "secretsmanager:ListSecrets", "servicediscovery:Get*", "servicediscovery:List*"], "Effect": "Allow", "Resource": ["*"], "Sid": "ConfigurationReads"},
          {"Action": ["ecr:DescribeImages", "ecr:DescribeRepositories"], "Effect": "Allow", "Resource": ["arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-*"], "Sid": "ImageMetadata"}
        ]}
      },
      "inline": {
        "session-deployer": {"Version": "2012-10-17", "Statement": [
          {"Action": ["acm:RequestCertificate", "ec2:CreateInternetGateway", "ec2:CreateRouteTable", "ec2:CreateSecurityGroup", "ec2:CreateSubnet", "ec2:CreateVpc", "ec2:CreateVpcEndpoint", "ecs:CreateCluster", "ecs:CreateService", "ecs:RegisterTaskDefinition", "elasticloadbalancing:CreateListener", "elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:CreateRule", "elasticloadbalancing:CreateTargetGroup", "kms:CreateKey", "logs:CreateLogGroup", "rds:CreateDBInstance", "rds:CreateDBParameterGroup", "rds:CreateDBSubnetGroup", "servicediscovery:CreatePrivateDnsNamespace", "servicediscovery:CreateService"], "Condition": {"StringNotEquals": {"aws:RequestTag/Environment": ["nonprod"]}}, "Effect": "Deny", "NotResource": ["arn:aws:ec2:eu-central-1:229251310592:route-table/*", "arn:aws:ec2:eu-central-1:229251310592:security-group/*", "arn:aws:ec2:eu-central-1:229251310592:subnet/*", "arn:aws:ec2:eu-central-1:229251310592:vpc/*"], "Sid": "CreatesCarryEnvironmentTag"},
          {"Action": ["acm:RequestCertificate", "ec2:CreateInternetGateway", "ec2:CreateRouteTable", "ec2:CreateSecurityGroup", "ec2:CreateSubnet", "ec2:CreateVpc", "ec2:CreateVpcEndpoint", "ecs:CreateCluster", "ecs:CreateService", "ecs:RegisterTaskDefinition", "elasticloadbalancing:CreateListener", "elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:CreateRule", "elasticloadbalancing:CreateTargetGroup", "kms:CreateKey", "logs:CreateLogGroup", "rds:CreateDBInstance", "rds:CreateDBParameterGroup", "rds:CreateDBSubnetGroup", "servicediscovery:CreatePrivateDnsNamespace", "servicediscovery:CreateService"], "Condition": {"StringNotEquals": {"aws:RequestTag/Project": ["munaxa"]}}, "Effect": "Deny", "NotResource": ["arn:aws:ec2:eu-central-1:229251310592:route-table/*", "arn:aws:ec2:eu-central-1:229251310592:security-group/*", "arn:aws:ec2:eu-central-1:229251310592:subnet/*", "arn:aws:ec2:eu-central-1:229251310592:vpc/*"], "Sid": "CreatesCarryProjectTag"},
          {"Action": ["access-analyzer:*", "budgets:*", "ce:*", "cloudtrail:*", "config:*", "ec2:*BlockPublicAccess*", "ec2:*ByDefault", "ec2:*EbsDefaultKmsKeyId", "ec2:*Ipam*", "ec2:*SerialConsole*", "ec2:*TransitGateway*", "ec2:*VpcPeering*", "ec2:*Vpn*", "ec2:ModifyImageAttribute", "ec2:ModifyInstanceMetadataDefaults", "ec2:ModifySnapshotAttribute", "ecs:DeleteAccountSetting", "ecs:PutAccountSetting*", "guardduty:*", "iam:DeleteRolePermissionsBoundary", "kms:CancelKeyDeletion", "logs:DeleteAccountPolicy", "logs:PutAccountPolicy", "rds:ModifyCertificates", "rds:ModifyDBClusterSnapshotAttribute", "rds:ModifyDBSnapshotAttribute", "s3:PutAccountPublicAccessBlock", "secretsmanager:PutResourcePolicy", "securityhub:*"], "Effect": "Deny", "Resource": ["*"], "Sid": "NeverAccountSettingsOrSharing"},
          {"Action": ["*"], "Condition": {"Null": {"aws:ResourceTag/Project": ["false"]}, "StringNotEquals": {"aws:ResourceTag/Project": ["munaxa"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverAnotherProjectByTag"},
          {"Action": ["*"], "Condition": {"StringEquals": {"aws:RequestTag/Environment": ["prod"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverCreateForTheOtherEnvironment"},
          {"Condition": {"ArnEquals": {"ec2:Vpc": ["arn:aws:ec2:eu-central-1:229251310592:vpc/vpc-0ed30515ad9631ea6"]}}, "Effect": "Deny", "NotAction": ["ec2:Describe*"], "Resource": ["*"], "Sid": "NeverInProtectedVpcs"},
          {"Action": ["*"], "Effect": "Deny", "Resource": ["arn:aws:cloudtrail:*:229251310592:trail/munaxa-docs*", "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-docs*", "arn:aws:iam::229251310592:oidc-provider/*", "arn:aws:iam::229251310592:policy/munaxa-docs/*", "arn:aws:iam::229251310592:policy/munaxa-shared/*", "arn:aws:iam::229251310592:role/munaxa-docs/*", "arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/*", "arn:aws:kms:eu-central-1:229251310592:alias/munaxa-docs*", "arn:aws:logs:eu-central-1:229251310592:log-group:*munaxa-docs*", "arn:aws:rds:eu-central-1:229251310592:db:munaxa-docs*", "arn:aws:rds:eu-central-1:229251310592:snapshot:munaxa-docs*", "arn:aws:s3:::munaxa-docs*", "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-docs*"], "Sid": "NeverMunaxaDocsOrBootstrap"},
          {"Action": ["*"], "Condition": {"StringEquals": {"aws:ResourceTag/Project": ["MunaxaDocs"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverMunaxaDocsProductionByTag"},
          {"Effect": "Deny", "NotAction": ["ec2:Describe*"], "Resource": ["arn:aws:ec2:eu-central-1:229251310592:vpc/vpc-0ed30515ad9631ea6"], "Sid": "NeverProtectedVpcs"},
          {"Action": ["route53:AssociateVPCWithHostedZone", "route53:CreateHostedZone", "route53:DisassociateVPCFromHostedZone"], "Condition": {"ForAnyValue:StringEquals": {"route53:VPCs": ["vpc-0ed30515ad9631ea6"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverProtectedVpcsInZones"},
          {"Action": ["kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias"], "Effect": "Deny", "Resource": ["arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-*", "arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5"], "Sid": "NeverSharedAliases"},
          {"Action": ["*"], "Condition": {"StringEquals": {"aws:RequestTag/Project": ["MunaxaDocs"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverTagAsMunaxaDocs"},
          {"Action": ["*"], "Condition": {"Null": {"aws:RequestTag/Project": ["false"]}, "StringNotEquals": {"aws:RequestTag/Project": ["munaxa"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverTagForAnotherProject"},
          {"Action": ["*"], "Effect": "Deny", "Resource": ["arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-prod*", "arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary-prod", "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-prod-*", "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/prod/*", "arn:aws:rds:eu-central-1:229251310592:db:munaxa-prod-*", "arn:aws:s3:::munaxa-prod-*", "arn:aws:s3:::munaxa-shared-tfstate-229251310592/prod/*", "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-prod/*"], "Sid": "NeverTheOtherEnvironmentByName"},
          {"Action": ["*"], "Condition": {"StringEquals": {"aws:ResourceTag/Environment": ["prod"]}}, "Effect": "Deny", "Resource": ["*"], "Sid": "NeverTheOtherEnvironmentByTag"},
          {"Action": ["account:*", "iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:CreateUser", "kms:Sign", "organizations:*", "secretsmanager:BatchGetSecretValue", "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"], "Effect": "Deny", "Resource": ["*"], "Sid": "NoSecretValuesNoUsersNoKeys"},
          {"Effect": "Deny", "NotAction": ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket", "s3:PutObject"], "Resource": ["arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5", "arn:aws:s3:::munaxa-shared-tfstate-229251310592", "arn:aws:s3:::munaxa-shared-tfstate-229251310592/*"], "Sid": "ProtectStateKeyAndBucket"},
          {"Action": ["servicediscovery:CreateService", "servicediscovery:DeleteService", "servicediscovery:UpdateService"], "Condition": {"StringEquals": {"aws:ResourceTag/Environment": ["nonprod"], "aws:ResourceTag/Project": ["munaxa"]}}, "Effect": "Allow", "Resource": ["*"], "Sid": "SessionCloudMapServices"},
          {"Action": ["rds:StartDBInstance", "rds:StopDBInstance"], "Effect": "Allow", "Resource": ["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"], "Sid": "SessionDatabaseStartStop"},
          {"Action": ["servicediscovery:TagResource"], "Condition": {"StringEquals": {"aws:RequestTag/Environment": ["nonprod"], "aws:RequestTag/Project": ["munaxa"]}}, "Effect": "Allow", "Resource": ["*"], "Sid": "SessionDiscoveryTagOnCreate"},
          {"Action": ["servicediscovery:CreateService"], "Condition": {"StringEquals": {"aws:RequestTag/Environment": ["nonprod"], "aws:RequestTag/Project": ["munaxa"]}}, "Effect": "Allow", "Resource": ["arn:aws:servicediscovery:eu-central-1:229251310592:service/*"], "Sid": "SessionDiscoveryWithOwnTags"},
          {"Action": ["ecs:CreateService", "ecs:DeleteService", "ecs:TagResource", "ecs:UntagResource", "ecs:UpdateService", "elasticloadbalancing:*"], "Effect": "Allow", "Resource": ["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*", "arn:aws:elasticloadbalancing:eu-central-1:229251310592:listener-rule/app/munaxa-nonprod/*", "arn:aws:elasticloadbalancing:eu-central-1:229251310592:listener/app/munaxa-nonprod/*", "arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/*", "arn:aws:elasticloadbalancing:eu-central-1:229251310592:targetgroup/munaxa-nonprod-*"], "Sid": "SessionEdgeAndServices"},
          {"Action": ["ec2:CreateTags", "ec2:DeleteTags"], "Effect": "Deny", "Resource": ["arn:aws:ec2:eu-central-1:229251310592:security-group-rule/*", "arn:aws:ec2:eu-central-1:229251310592:security-group/*"], "Sid": "SessionNeverGroupTags"},
          {"Action": ["ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup", "ec2:ModifyNetworkInterfaceAttribute", "elasticloadbalancing:SetIpAddressType", "elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets"], "Effect": "Deny", "Resource": ["*"], "Sid": "SessionNeverNetworkPlacement"},
          {"Action": ["ec2:AuthorizeSecurityGroupEgress", "ec2:AuthorizeSecurityGroupIngress", "ec2:ModifySecurityGroupRules", "ec2:RevokeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:UpdateSecurityGroupRuleDescriptionsEgress", "ec2:UpdateSecurityGroupRuleDescriptionsIngress"], "Effect": "Deny", "Resource": ["*"], "Sid": "SessionNeverSecurityGroupRules"},
          {"Action": ["iam:PassRole"], "Condition": {"StringEquals": {"iam:PassedToService": ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"]}}, "Effect": "Allow", "Resource": ["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"], "Sid": "SessionPassOwnRoles"},
          {"Action": ["s3:DeleteObject", "s3:GetObject", "s3:PutObject"], "Effect": "Allow", "Resource": ["arn:aws:s3:::munaxa-shared-tfstate-229251310592/nonprod/*"], "Sid": "State"},
          {"Action": ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], "Effect": "Allow", "Resource": ["arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5"], "Sid": "StateKey"},
          {"Action": ["s3:ListBucket"], "Effect": "Allow", "Resource": ["arn:aws:s3:::munaxa-shared-tfstate-229251310592"], "Sid": "StateList"},
          {"Condition": {"StringNotEquals": {"aws:RequestedRegion": ["eu-central-1"]}}, "Effect": "Deny", "NotAction": ["iam:*", "route53:*", "s3:*", "sts:*"], "Resource": ["*"], "Sid": "ThisRegionOnly"}
        ]}
      },
      "trust": {"Version": "2012-10-17", "Statement": [
        {"Action": ["sts:AssumeRole", "sts:SetSourceIdentity"], "Condition": {"StringEquals": {"sts:SourceIdentity": ["github-actions"]}}, "Effect": "Allow", "Principal": {"AWS": ["arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session"]}, "Sid": "SessionCiRoleWithSourceIdentity"}
      ]}
    }
  },
  "state_key_alias": "alias/munaxa-shared-tfstate",
  "state_key_arn": "arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5"
}
SPEC
)

# P-11b and P-13 verifier: reads the saved responses and compares them with the expected values.
VERIFY=$(
  cat <<'PY'
"""Preflight P-11b and P-13 verifier (embedded in preflight-readonly.sh; read-only, no AWS access).

    python3 -I -c "$VERIFY" iam DIR SPEC_FILE
    python3 -I -c "$VERIFY" net DIR PREFIX DB_VPC P2_STATUS

DIR holds one file per AWS response, written by the shell: the CLI's JSON output, or a marker line
"__ABSENT__ <code>" (AWS said the resource does not exist) or "__ERROR__" (the call failed; the
shell has already recorded the ERROR). Prints one "STATUS<TAB>message" line per result, STATUS in
PASS, FAIL, ERROR. Exit 0 when it printed only PASS lines, 1 when at least one FAIL and no ERROR,
2 on any ERROR, including any response that does not have the documented shape.
This program only reads files. It imports nothing that can reach the network or run commands.
"""
import json
import re
import sys
import urllib.parse

OUT = []
SKIP = object()


class Malformed(Exception):
    pass


def emit(status, msg):
    OUT.append((status, msg))


def short(items, limit=6):
    items = sorted(items)
    text = ", ".join(items[:limit])
    return text + (f" (+{len(items) - limit} more)" if len(items) > limit else "")


def load(directory, name):
    """The response in DIR/name: parsed JSON, ("ABSENT", code), or SKIP after a failed call."""
    try:
        with open(f"{directory}/{name}", encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        raise Malformed(f"no response recorded for {name}")
    if text.startswith("__ERROR__"):
        return SKIP
    if text.startswith("__NOT_FETCHED__"):
        raise Malformed(f"{name} was not read: the VPC id did not resolve")
    if text.startswith("__ABSENT__"):
        return ("ABSENT", text.split()[1] if len(text.split()) > 1 else "?")
    try:
        return json.loads(text)
    except ValueError:
        raise Malformed(f"{name}: response is not JSON")


def need(cond, what):
    if not cond:
        raise Malformed(what)


# ------------------------------------------------------------------ IAM policy documents
LIST_KEYS = ("Action", "NotAction", "Resource", "NotResource")
STATEMENT_KEYS = {"Sid", "Effect", "Action", "NotAction", "Resource", "NotResource", "Condition",
                  "Principal", "NotPrincipal"}


def as_set(value, where):
    if isinstance(value, str):
        return [value]
    need(isinstance(value, list) and value and all(isinstance(v, str) for v in value),
         f"{where}: expected a string or a list of strings")
    return sorted(set(value))


def canon_statement(s, where):
    need(isinstance(s, dict), f"{where}: statement is not an object")
    c = {}
    for k, v in s.items():
        if k in LIST_KEYS:
            c[k] = as_set(v, f"{where} {k}")
        elif k == "Condition":
            need(isinstance(v, dict) and all(isinstance(m, dict) for m in v.values()), f"{where}: Condition shape")
            c[k] = {op: {key: as_set(val, f"{where} Condition") for key, val in m.items()} for op, m in v.items()}
        elif k in ("Principal", "NotPrincipal"):
            if isinstance(v, str):
                c[k] = v
            else:
                need(isinstance(v, dict), f"{where}: Principal shape")
                c[k] = {t: as_set(x, f"{where} Principal") for t, x in v.items()}
        else:
            # Sid, Effect and any key IAM may add later: kept as is, so a new key is a difference.
            c[k] = v
    return c


def canon_doc(doc, where):
    if isinstance(doc, str):  # the IAM API returns documents URL-encoded; the CLI normally decodes them
        try:
            doc = json.loads(urllib.parse.unquote(doc))
        except ValueError:
            raise Malformed(f"{where}: policy document is not JSON")
    need(isinstance(doc, dict), f"{where}: policy document is not an object")
    st = doc.get("Statement")
    if isinstance(st, dict):
        st = [st]
    need(isinstance(st, list) and st, f"{where}: no Statement list")
    return doc.get("Version"), [canon_statement(s, where) for s in st]


def statement_diff(label, actual, expected):
    """Lines describing how one statement differs; elements are printed, Condition values are not."""
    lines = []
    for k in sorted(set(actual) | set(expected)):
        a, e = actual.get(k), expected.get(k)
        if a == e:
            continue
        if a is None:
            lines.append(f"{label}: {k} missing")
        elif e is None:
            lines.append(f"{label}: unexpected {k} present")
        elif k in LIST_KEYS:
            added, removed = set(a) - set(e), set(e) - set(a)
            parts = ([f"added {short(added)}"] if added else []) + ([f"missing {short(removed)}"] if removed else [])
            lines.append(f"{label}: {k} {'; '.join(parts)}")
        elif k == "Condition":
            keys = lambda c: {f"{op} {key}" for op, m in c.items() for key in m}  # noqa: E731
            changed = sorted(keys(a) ^ keys(e)) or sorted(
                f"{op} {key}" for op, m in a.items() for key in m if e.get(op, {}).get(key) != m[key])
            lines.append(f"{label}: Condition differs ({short(changed)}; values not printed)")
        elif k in ("Principal", "NotPrincipal"):
            lines.append(f"{label}: {k} differs")
        else:
            lines.append(f"{label}: {k} = {json.dumps(a)[:80]}, expected {json.dumps(e)[:80]}")
    return lines


def compare_doc(where, actual_doc, expected_doc):
    version, actual = canon_doc(actual_doc, where)
    _, expected = canon_doc(expected_doc, where + " (expected)")
    fails = []
    if version != expected_doc["Version"]:
        fails.append(f"{where}: Version {version}, expected {expected_doc['Version']}")
    by_sid, unnamed = {}, []
    for s in actual:
        if "Sid" in s and s["Sid"] != "":
            if s["Sid"] in by_sid:
                fails.append(f"{where}: duplicate Sid {s['Sid']}")
            by_sid[s["Sid"]] = s
        else:
            unnamed.append(s)
    exp_sid = {s["Sid"]: s for s in expected if s.get("Sid")}
    exp_unnamed = [s for s in expected if not s.get("Sid")]
    for sid in sorted(set(exp_sid) - set(by_sid)):
        fails.append(f"{where}: statement {sid} missing")
    for sid in sorted(set(by_sid) - set(exp_sid)):
        s = by_sid[sid]
        fails.append(f"{where}: unexpected statement {sid} ({s.get('Effect')} "
                     f"{short(s.get('Action', s.get('NotAction', [])))})")
    for sid in sorted(set(by_sid) & set(exp_sid)):
        fails += statement_diff(f"{where} {sid}", by_sid[sid], exp_sid[sid])
    key = lambda s: json.dumps(s, sort_keys=True)  # noqa: E731
    rest = [key(s) for s in exp_unnamed]
    for s in unnamed:
        if key(s) in rest:
            rest.remove(key(s))
        else:
            fails.append(f"{where}: unexpected statement without Sid ({s.get('Effect')} "
                         f"{short(s.get('Action', s.get('NotAction', [])))})")
    fails += [f"{where}: expected statement without Sid missing" for _ in rest]
    if fails:
        for f in fails:
            emit("FAIL", f)
    else:
        emit("PASS", f"{where}: {len(actual)} statement(s) match the code")


def check_iam(directory, spec_file):
    with open(spec_file, encoding="utf-8") as f:
        spec = json.load(f)
    roles = load(directory, "roles.json")
    if roles is not SKIP:
        need(isinstance(roles, list) and all(isinstance(r, dict) and isinstance(r.get("RoleName"), str)
                                             for r in roles), "list-roles: Roles is not a list of roles")
        names = {r["RoleName"] for r in roles if "-session" in r["RoleName"]}
        expected = set(spec["roles"])
        if names == expected:
            emit("PASS", f"session roles under {spec['path']} = {short(names)}")
        else:
            if expected - names:
                emit("FAIL", f"ABSENT: session role(s) {short(expected - names)} not under {spec['path']}")
            if names - expected:
                emit("FAIL", f"unexpected session role(s) under {spec['path']}: {short(names - expected)}")
    for name, exp in sorted(spec["roles"].items()):
        role = load(directory, f"role-{name}.json")
        if role is SKIP:
            continue
        if isinstance(role, tuple):
            emit("FAIL", f"ABSENT: role {name} (AWS answered {role[1]})")
            continue
        need(isinstance(role, dict) and role.get("RoleName") == name, f"get-role {name}: unexpected shape")
        for field in ("Path", "Arn", "MaxSessionDuration"):
            want = spec["path"] if field == "Path" else exp[field]
            if role.get(field) == want:
                emit("PASS", f"{name} {field} = {want}")
            else:
                emit("FAIL", f"{name} {field} = {role.get(field)!r}, expected {want!r}")
        # Any PermissionsBoundary value at all is a boundary: the code sets none.
        boundary = role.get("PermissionsBoundary")
        if isinstance(boundary, dict):
            boundary = boundary.get("PermissionsBoundaryArn") or boundary or None
        if boundary == exp["PermissionsBoundary"]:
            emit("PASS", f"{name} permissions boundary = none (as in the code)")
        else:
            emit("FAIL", f"{name} permissions boundary = {boundary}, expected none (the code sets none)")
        need("AssumeRolePolicyDocument" in role, f"get-role {name}: no AssumeRolePolicyDocument")
        compare_doc(f"{name} trust policy", role["AssumeRolePolicyDocument"], exp["trust"])

        inline = load(directory, f"inline-names-{name}.json")
        if inline is not SKIP:
            need(isinstance(inline, list) and all(isinstance(p, str) for p in inline),
                 f"list-role-policies {name}: not a list of names")
            if set(inline) == set(exp["inline"]):
                emit("PASS", f"{name} inline policies = {short(inline)}")
            else:
                emit("FAIL", f"{name} inline policies = {short(inline) or 'none'}, expected {short(exp['inline'])}")
        for pname, pdoc in sorted(exp["inline"].items()):
            doc = load(directory, f"inline-{name}-{pname}.json")
            if doc is SKIP:
                continue
            if isinstance(doc, tuple):
                emit("FAIL", f"ABSENT: inline policy {pname} on {name} (AWS answered {doc[1]})")
                continue
            compare_doc(f"{name} inline {pname}", doc, pdoc)

        attached = load(directory, f"attached-{name}.json")
        if attached is not SKIP:
            need(isinstance(attached, list) and all(isinstance(p, dict) and isinstance(p.get("PolicyArn"), str)
                                                    for p in attached),
                 f"list-attached-role-policies {name}: not a list of policies")
            arns = {p["PolicyArn"] for p in attached}
            if arns == set(exp["attached"]):
                emit("PASS", f"{name} attached policies = {short(a.rsplit('/', 1)[1] for a in arns) or 'none'}")
            else:
                if set(exp["attached"]) - arns:
                    emit("FAIL", f"{name} attached policy missing: {short(set(exp['attached']) - arns)}")
                if arns - set(exp["attached"]):
                    emit("FAIL", f"{name} unexpected attached policy: {short(arns - set(exp['attached']))}")
    attached_docs = {}
    for exp in spec["roles"].values():
        attached_docs.update(exp["attached"])
    for i, (arn, pdoc) in enumerate(sorted(attached_docs.items())):
        doc = load(directory, f"policy-{i}.json")
        if doc is SKIP:
            continue
        if isinstance(doc, tuple):
            emit("FAIL", f"ABSENT: managed policy {arn} (AWS answered {doc[1]})")
            continue
        compare_doc(f"managed policy {arn.rsplit('/', 1)[1]}", doc, pdoc)
    key = load(directory, "state-key.json")
    if key is not SKIP:
        if isinstance(key, tuple):
            emit("FAIL", f"ABSENT: {spec['state_key_alias']} (AWS answered {key[1]})")
        elif key == spec["state_key_arn"]:
            emit("PASS", f"{spec['state_key_alias']} = the state key in the expected policy")
        else:
            need(isinstance(key, str), "kms describe-key: not an ARN")
            emit("FAIL", f"{spec['state_key_alias']} = {key}, expected {spec['state_key_arn']}")


# ------------------------------------------------------------------ network topology (stack/network.tf)
ROUTE_TARGETS = ("GatewayId", "NatGatewayId", "InstanceId", "NetworkInterfaceId", "VpcPeeringConnectionId",
                 "TransitGatewayId", "EgressOnlyInternetGatewayId", "CarrierGatewayId", "LocalGatewayId",
                 "CoreNetworkArn", "OdbNetworkArn", "IpAddress")


def tag(item, key="Name"):
    tags = item.get("Tags") or []
    need(isinstance(tags, list), "Tags is not a list")
    return next((t.get("Value") for t in tags if isinstance(t, dict) and t.get("Key") == key), None)


def items(data, what):
    need(isinstance(data, list) and all(isinstance(i, dict) for i in data), f"{what}: not a list of objects")
    return data


def check_net(directory, c, db_vpc, p2_status):
    vpc_cidr = "10.130.0.0/16"
    subnets_spec = {f"{c}-public-a": ("eu-central-1a", "10.130.0.0/24"), f"{c}-public-b": ("eu-central-1b", "10.130.1.0/24"),
                    f"{c}-db-a": ("eu-central-1a", "10.130.64.0/24"), f"{c}-db-b": ("eu-central-1b", "10.130.65.0/24"),
                    f"{c}-db-c": ("eu-central-1c", "10.130.66.0/24")}
    sg_spec = {"default", f"{c}-alb", f"{c}-database", f"{c}-db-admin", f"{c}-identity", f"{c}-identity-migrate"}
    fails_before = sum(1 for s, _ in OUT if s == "FAIL")

    vpcs = load(directory, "vpcs.json")
    if vpcs is SKIP:
        return
    vpcs = items(vpcs, "describe-vpcs")
    if len(vpcs) != 1:
        emit("FAIL", f"VPCs tagged Name={c}: {len(vpcs)}, expected 1" + (" (ABSENT)" if not vpcs else ""))
        emit("FAIL", "network topology not checked: the VPC could not be identified")
        return
    vpc = vpcs[0]
    vid = vpc.get("VpcId")
    need(isinstance(vid, str) and re.fullmatch(r"vpc-[0-9a-f]{8,17}", vid), "describe-vpcs: no valid VpcId")
    for label, got, want in (("CIDR", vpc.get("CidrBlock"), vpc_cidr), ("state", vpc.get("State"), "available"),
                             ("IsDefault", vpc.get("IsDefault"), False)):
        emit("PASS" if got == want else "FAIL", f"VPC {c} {label} = {got}" + ("" if got == want else f", expected {want}"))
    if p2_status == "ERROR":
        emit("ERROR", f"VPC {vid} not compared with the database VPC: P-2 failed")
    elif not db_vpc:
        emit("FAIL", f"VPC {vid} not compared with the database VPC: P-2 found no database")
    elif vid == db_vpc:
        emit("PASS", f"VPC {c} = database VPC {vid}")
    else:
        emit("FAIL", f"VPC {c} = {vid}, but the database is in {db_vpc}")

    subnet_ids = {}
    data = load(directory, "subnets.json")
    if data is not SKIP:
        found = {}
        for s in items(data, "describe-subnets"):
            name = tag(s)
            need(isinstance(s.get("SubnetId"), str), "describe-subnets: no SubnetId")
            if s.get("VpcId") != vid:
                emit("FAIL", f"subnet {name or s['SubnetId']} in {s.get('VpcId')}, expected {vid}")
                continue
            if name in found:
                emit("FAIL", f"two subnets named {name}")
            found[name] = s
        for name in sorted(set(subnets_spec) - set(found)):
            emit("FAIL", f"ABSENT: subnet {name} in {vid}")
        for name in sorted(set(found) - set(subnets_spec), key=str):
            emit("FAIL", f"unexpected subnet {name or found[name]['SubnetId']} in {vid}")
        for name in sorted(set(found) & set(subnets_spec)):
            s, (az, cidr) = found[name], subnets_spec[name]
            got = (s.get("AvailabilityZone"), s.get("CidrBlock"), s.get("MapPublicIpOnLaunch"), s.get("State"))
            if got == (az, cidr, False, "available"):
                emit("PASS", f"subnet {name} {az} {cidr}, no public IP on launch, available")
            else:
                emit("FAIL", f"subnet {name} = {got}, expected {(az, cidr, False, 'available')}")
            subnet_ids[s["SubnetId"]] = name

    igw_id = None
    data = load(directory, "igws.json")
    if data is not SKIP:
        igws = items(data, "describe-internet-gateways")
        if len(igws) != 1:
            emit("FAIL", f"internet gateways tagged {c}-igw: {len(igws)}, expected 1" + (" (ABSENT)" if not igws else ""))
        else:
            g = igws[0]
            need(isinstance(g.get("InternetGatewayId"), str), "describe-internet-gateways: no id")
            att = g.get("Attachments") or []
            need(isinstance(att, list), "describe-internet-gateways: Attachments is not a list")
            # The API reports an attached internet gateway as "available" (API_InternetGatewayAttachment).
            ok = [a for a in att if isinstance(a, dict) and a.get("VpcId") == vid and a.get("State") in ("available", "attached")]
            if len(att) == 1 and ok:
                igw_id = g["InternetGatewayId"]
                emit("PASS", f"internet gateway {c}-igw {igw_id} attached to {vid}")
            elif not att:
                emit("FAIL", f"internet gateway {c}-igw {g['InternetGatewayId']} is detached")
            else:
                emit("FAIL", f"internet gateway {c}-igw attachments = "
                             f"{[(a.get('VpcId'), a.get('State')) for a in att if isinstance(a, dict)]}, expected [({vid}, available)]")

    endpoint_id = None
    data = load(directory, "endpoints.json")
    rts = load(directory, "route-tables.json")
    rt_by_name = {}
    if rts is not SKIP:
        for t in items(rts, "describe-route-tables"):
            need(isinstance(t.get("RouteTableId"), str) and isinstance(t.get("Routes"), list)
                 and isinstance(t.get("Associations"), list), "describe-route-tables: incomplete route table")
            if t.get("VpcId") != vid:
                emit("FAIL", f"route table {tag(t) or t['RouteTableId']} in {t.get('VpcId')}, expected {vid}")
                continue
            main = any(isinstance(a, dict) and a.get("Main") is True for a in t["Associations"])
            key = "main" if main else tag(t)
            if key in rt_by_name:
                emit("FAIL", f"two route tables as {key}")
            rt_by_name[key] = t
    if data is not SKIP:
        eps = items(data, "describe-vpc-endpoints")
        if len(eps) != 1:
            emit("FAIL", f"VPC endpoints in {vid}: {len(eps)}, expected 1 (the S3 gateway endpoint)")
        else:
            e = eps[0]
            want_rt = [rt_by_name[f"{c}-rt-public"]["RouteTableId"]] if f"{c}-rt-public" in rt_by_name else None
            got = (e.get("VpcId"), e.get("ServiceName"), e.get("VpcEndpointType"), str(e.get("State", "")).lower(),
                   sorted(e.get("RouteTableIds") or []), tag(e))
            want = (vid, "com.amazonaws.eu-central-1.s3", "Gateway", "available", want_rt, f"{c}-s3")
            if got == want:
                endpoint_id = e.get("VpcEndpointId")
                emit("PASS", f"S3 gateway endpoint {endpoint_id} on {c}-rt-public only")
            else:
                emit("FAIL", f"S3 endpoint = {got}, expected {want}")

    if rts is not SKIP:
        wanted = {"main": set(), f"{c}-rt-public": {f"{c}-public-a", f"{c}-public-b"},
                  f"{c}-rt-db": {f"{c}-db-a", f"{c}-db-b", f"{c}-db-c"}}
        for key in sorted(set(wanted) - set(rt_by_name)):
            emit("FAIL", f"ABSENT: route table {key} in {vid}")
        for key in sorted(set(rt_by_name) - set(wanted), key=str):
            emit("FAIL", f"unexpected route table {key or rt_by_name[key]['RouteTableId']} in {vid}")
        seen = {}
        for key in sorted(set(wanted) & set(rt_by_name)):
            t = rt_by_name[key]
            assoc_names, bad = set(), []
            for a in t["Associations"]:
                need(isinstance(a, dict), "describe-route-tables: association is not an object")
                state = (a.get("AssociationState") or {}).get("State")
                if a.get("Main") is True:
                    if key != "main" or a.get("SubnetId") or a.get("GatewayId"):
                        bad.append("main association")
                    continue
                if a.get("GatewayId") or not a.get("SubnetId"):
                    bad.append(f"edge association {a.get('GatewayId')}")
                    continue
                sname = subnet_ids.get(a["SubnetId"], a["SubnetId"])
                if state != "associated":
                    bad.append(f"{sname} association {state}")
                assoc_names.add(sname)
                seen.setdefault(sname, []).append(key)
            if assoc_names == wanted[key] and not bad:
                emit("PASS", f"route table {key} associations = {short(assoc_names) or 'main only'}")
            else:
                extra, missing = assoc_names - wanted[key], wanted[key] - assoc_names
                emit("FAIL", f"route table {key} associations: " + "; ".join(
                    ([f"missing {short(missing)}"] if missing else []) + ([f"unexpected {short(extra)}"] if extra else []) + bad))
            routes, bad = list(t["Routes"]), []
            local = [r for r in routes if isinstance(r, dict) and r.get("DestinationCidrBlock") == vpc_cidr
                     and r.get("GatewayId") == "local" and r.get("State") == "active"]
            rest = [r for r in routes if r not in local[:1]]
            if len(local) < 1:
                bad.append("local route missing or not active")
            if key == f"{c}-rt-public":
                default = [r for r in rest if isinstance(r, dict) and r.get("DestinationCidrBlock") == "0.0.0.0/0"]
                s3 = [r for r in rest if isinstance(r, dict) and str(r.get("DestinationPrefixListId", "")).startswith("pl-")]
                rest = [r for r in rest if r not in default and r not in s3]
                if len(default) != 1:
                    bad.append(f"{len(default)} default routes, expected 1")
                else:
                    r = default[0]
                    targets = {k: r[k] for k in ROUTE_TARGETS if r.get(k)}
                    if igw_id is None:
                        bad.append("default route not verified: the internet gateway is not attached to this VPC")
                    elif targets != {"GatewayId": igw_id}:
                        bad.append(f"default route targets {targets}, expected {{'GatewayId': '{igw_id}'}}")
                    if r.get("State") != "active":
                        bad.append(f"default route state {r.get('State')}")
                if len(s3) != 1:
                    bad.append(f"{len(s3)} S3 endpoint routes, expected 1")
                else:
                    r = s3[0]
                    targets = {k: r[k] for k in ROUTE_TARGETS if r.get(k)}
                    if endpoint_id is None or targets != {"GatewayId": endpoint_id} or r.get("State") != "active":
                        bad.append(f"S3 route targets {targets} state {r.get('State')}, expected the S3 endpoint, active")
            for r in rest:
                bad.append(f"unexpected route {r.get('DestinationCidrBlock') or r.get('DestinationIpv6CidrBlock') or r.get('DestinationPrefixListId')}"
                           f" -> {({k: r[k] for k in ROUTE_TARGETS if r.get(k)})} {r.get('State')}" if isinstance(r, dict) else "malformed route")
            if bad:
                for b in bad:
                    emit("FAIL", f"route table {key}: {b}")
            else:
                emit("PASS", f"route table {key} routes = local" + (", 0.0.0.0/0 -> " + igw_id + " active, S3 endpoint active"
                                                                   if key == f"{c}-rt-public" else " only"))
        for sid, sname in sorted(subnet_ids.items(), key=lambda x: x[1]):
            if len(seen.get(sname, [])) != 1 and sname in subnets_spec:
                emit("FAIL", f"subnet {sname} has {len(seen.get(sname, []))} explicit route table associations, expected 1")

    data = load(directory, "sgs.json")
    if data is not SKIP:
        found = {}
        for g in items(data, "describe-security-groups"):
            name = g.get("GroupName")
            need(isinstance(name, str), "describe-security-groups: no GroupName")
            if g.get("VpcId") != vid:
                emit("FAIL", f"security group {name} in {g.get('VpcId')}, expected {vid}")
                continue
            found[name] = g
        if set(found) == sg_spec:
            emit("PASS", f"security groups in {vid} = {short(found, 10)}")
        else:
            if sg_spec - set(found):
                emit("FAIL", f"ABSENT: security group(s) {short(sg_spec - set(found))} in {vid}")
            if set(found) - sg_spec:
                emit("FAIL", f"unexpected security group(s) in {vid}: {short(set(found) - sg_spec)}")
        if "default" in found:
            d = found["default"]
            if tag(d) != f"{c}-default-unused":
                emit("FAIL", f"default security group Name tag = {tag(d)}, expected {c}-default-unused")
            # aws_default_security_group with no rule blocks: Terraform removes every rule.
            if d.get("IpPermissions") or d.get("IpPermissionsEgress"):
                emit("FAIL", "default security group has rules; the code leaves it with none")
            else:
                need("IpPermissions" in d and "IpPermissionsEgress" in d, "describe-security-groups: no rule lists")
                emit("PASS", "default security group has no rules")


def main(argv):
    try:
        if argv[1:2] == ["iam"] and len(argv) == 4:
            check_iam(argv[2], argv[3])
        elif argv[1:2] == ["net"] and len(argv) == 6:
            check_net(argv[2], argv[3], argv[4], argv[5])
        else:
            raise Malformed("usage: iam DIR SPEC | net DIR PREFIX DB_VPC P2_STATUS")
    except Malformed as e:
        emit("ERROR", f"malformed response, nothing verified from it: {e}")
    except Exception as e:  # any surprise is an ERROR, never a PASS
        emit("ERROR", f"verifier failed: {type(e).__name__}: {e}")
    for status, msg in OUT:
        print(f"{status}\t{msg}")
    statuses = {s for s, _ in OUT}
    if not OUT or "ERROR" in statuses:
        return 2
    return 1 if "FAIL" in statuses else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PY
)

ERRFILE=$(mktemp)
WORK=$(mktemp -d)
trap 'rm -f "$ERRFILE"; rm -rf "$WORK"' EXIT
declare -A STATUS=()
OUT=
ABSENT=

h() { printf '\n=== %s ===\n' "$*"; }
info() { printf '  [INFO] %s\n' "$*"; }
rank() { case $1 in PASS) echo 0 ;; FAIL) echo 1 ;; *) echo 2 ;; esac; }
# record ID STATUS MESSAGE: prints the line and keeps the worst status per check.
record() {
  local id=$1 st=$2
  shift 2
  printf '  [%s] %s: %s\n' "$st" "$id" "$*"
  if [[ -z ${STATUS[$id]:-} ]] || (($(rank "$st") > $(rank "${STATUS[$id]}"))); then STATUS[$id]=$st; fi
}
expect() { # ID LABEL ACTUAL EXPECTED
  if [[ $3 == "$4" ]]; then record "$1" PASS "$2 = $3"; else record "$1" FAIL "$2 = '$3', expected '$4'"; fi
}
expect_re() { # ID LABEL ACTUAL REGEX DESCRIPTION
  if [[ $3 =~ $4 ]]; then record "$1" PASS "$2 = $3"; else record "$1" FAIL "$2 = '$3', expected $5"; fi
}
absent() { record "$1" FAIL "ABSENT: $2 (AWS answered $ABSENT)"; }

# aws_call ID ABSENT_REGEX SERVICE OPERATION ARGS...
# Sets OUT. Returns 0 on success; 3 when AWS answered with an error code matching ABSENT_REGEX
# (the resource does not exist; ABSENT holds the code); 2 on any other failure, recorded as ERROR.
# A failure without an AWS error code (no CLI, no credentials, network) is never treated as absent.
aws_call() {
  local id=$1 absent_re=$2 svc=$3 op=$4 rc=0 code msg
  shift 4
  OUT= ABSENT=
  if [[ $ALLOWED_OPS != *" $svc:$op "* ]]; then
    record "$id" ERROR "refused: aws $svc $op is not an allowed read operation"
    return 2
  fi
  local a prev=
  for a in "$@"; do
    case $a in
    --endpoint-url* | --profile* | --region=* | --cli-input-* | --debug | --no-verify-ssl | --no-sign-request | --ca-bundle* | \
      --max-items* | --no-paginate | --page-size* | --starting-token* | --cli-read-timeout* | --cli-connect-timeout*)
      record "$id" ERROR "refused: option $a is not allowed"
      return 2
      ;;
    esac
    if [[ $prev == --region && ! ($svc:$op == cloudtrail:lookup-events && $a =~ ^(eu-central-1|us-east-1)$) ]]; then
      record "$id" ERROR "refused: --region $a is only allowed for cloudtrail lookup-events in eu-central-1 or us-east-1"
      return 2
    fi
    prev=$a
  done
  OUT=$(aws "$svc" "$op" "$@" 2>"$ERRFILE") || rc=$?
  ((rc == 0)) && return 0
  OUT=
  msg=$(grep -m1 -v '^[[:space:]]*$' "$ERRFILE" | cut -c1-240)
  code=$(sed -n 's/.*An error occurred (\([A-Za-z0-9_.]*\)).*/\1/p' "$ERRFILE" | head -1)
  if [[ -n $absent_re && -n $code && "$code $msg" =~ $absent_re ]]; then
    ABSENT=$code
    return 3
  fi
  record "$id" ERROR "aws $svc $op failed (exit $rc${code:+, $code}): ${msg:-no error text}"
  return 2
}

# fetch ID FILE ABSENT_REGEX SERVICE OPERATION ARGS...: aws_call, saving the response for the
# verifier in $WORK/FILE, or a marker: __ABSENT__ <code> (AWS said it does not exist) or __ERROR__
# (the call failed and is already recorded as ERROR).
fetch() {
  local id=$1 file=$2 rc=0
  shift 2
  aws_call "$id" "$@" || rc=$?
  case $rc in
  0) printf '%s\n' "$OUT" >"$WORK/$file" ;;
  3) printf '__ABSENT__ %s\n' "$ABSENT" >"$WORK/$file" ;;
  *) printf '__ERROR__\n' >"$WORK/$file" ;;
  esac
  return $rc
}
# verify ID ARGS...: runs the verifier and records each line it prints.
verify() {
  local id=$1 rc=0 res st msg n=0
  shift
  if ! command -v python3 >/dev/null 2>&1; then
    record "$id" ERROR "python3 not found: nothing compared"
    return
  fi
  res=$(python3 -I -c "$VERIFY" "$@" 2>&1) || rc=$?
  while IFS=$'\t' read -r st msg; do
    case $st in
    PASS | FAIL | ERROR)
      record "$id" "$st" "$msg"
      n=$((n + 1))
      ;;
    *) [[ -n $st ]] && record "$id" ERROR "verifier: $st $msg" ;;
    esac
  done <<<"$res"
  if ((rc > 1)) || ((n == 0)); then record "$id" ERROR "verifier exit $rc"; fi
}

# ---------------------------------------------------------------- P-1 account guard
h "P-1 account guard and region"
if ! command -v aws >/dev/null 2>&1; then
  echo "STOP: aws CLI not found. No AWS call was made."
  echo "OVERALL: NOT RUN (account not verified)"
  exit 3
fi
rc=0
IDENT=$(aws sts get-caller-identity --query '[Account,Arn]' --output text 2>"$ERRFILE") || rc=$?
if ((rc != 0)); then
  echo "STOP: cannot read the active account (sts get-caller-identity exit $rc): $(grep -m1 -v '^[[:space:]]*$' "$ERRFILE" | cut -c1-240)"
  echo "No other AWS call was made."
  echo "OVERALL: NOT RUN (account not verified)"
  exit 3
fi
IFS=$'\t' read -r ACCOUNT ARN <<<"$IDENT"
ACCOUNT=${ACCOUNT:-} ARN=${ARN:-}
if [[ $ACCOUNT != "$EXPECTED_ACCOUNT" ]]; then
  echo "STOP: active account is '$ACCOUNT', expected $EXPECTED_ACCOUNT. No other AWS call was made."
  echo "OVERALL: NOT RUN (wrong account)"
  exit 3
fi
case $ARN in
"arn:aws:iam::$EXPECTED_ACCOUNT:root")
  if [[ ${ALLOW_ROOT_READONLY:-} != yes ]]; then
    echo "STOP: the caller is the account root user ($ARN). No other AWS call was made."
    echo "Run as a non-root read-only identity, or, only by the owner's decision under infra/aws/ACCESS-POLICY.md 1.3,"
    echo "rerun as: ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh"
    echo "OVERALL: NOT RUN (root caller not accepted)"
    exit 3
  fi
  CALLER_TYPE="root (accepted: ALLOW_ROOT_READONLY=yes, owner's decision; read-only calls only)"
  ;;
"arn:aws:sts::$EXPECTED_ACCOUNT:assumed-role/"*/*) CALLER_TYPE="assumed role ${ARN#*:assumed-role/}" CALLER_TYPE=${CALLER_TYPE%%/*} ;;
"arn:aws:iam::$EXPECTED_ACCOUNT:user/"*) CALLER_TYPE="IAM user ${ARN##*/}" ;;
*)
  echo "STOP: caller ARN '$ARN' is not a root, assumed-role or IAM user ARN of account $EXPECTED_ACCOUNT. No other AWS call was made."
  echo "OVERALL: NOT RUN (caller not recognised)"
  exit 3
  ;;
esac
record P-1 PASS "account $ACCOUNT, caller $ARN, $CALLER_TYPE, region $AWS_REGION, $(date -u +%FT%TZ)"
[[ $ARN == *":root" ]] && info "WARNING: running as root by the owner's explicit choice. Root bypasses IAM policies, so a PASS here proves nothing about any deployer's permissions (ACCESS-POLICY.md 1.2)."

# ---------------------------------------------------------------- P-2 database
h "P-2 RDS"
DB_VPC=
aws_call P-2 'DBInstanceNotFound' rds describe-db-instances --db-instance-identifier $C-pg --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass,PubliclyAccessible,DeletionProtection,MultiAZ,StorageEncrypted,DBSubnetGroup.VpcId,DBParameterGroups[0].DBParameterGroupName,DBParameterGroups[0].ParameterApplyStatus,MasterUserSecret.SecretStatus,EngineVersion]' --output text
case $? in
0)
  IFS=$'\t' read -r st cls pub del maz enc DB_VPC pg pgs ms ev <<<"$OUT"
  expect P-2 status "$st" stopped
  expect P-2 class "$cls" db.t4g.micro
  expect P-2 PubliclyAccessible "$pub" False
  expect P-2 DeletionProtection "$del" True
  expect P-2 MultiAZ "$maz" False
  expect P-2 StorageEncrypted "$enc" True
  expect P-2 "parameter group" "$pg" $C-pg16
  expect P-2 "parameter apply status" "$pgs" in-sync
  expect P-2 "master secret status" "$ms" active
  expect_re P-2 vpc "$DB_VPC" '^vpc-' "a VPC id"
  info "engine $ev"
  ;;
3) absent P-2 "$C-pg" ;;
esac

# ---------------------------------------------------------------- P-3 cluster, task definitions, images
h "P-3 ECS cluster and A1 task definitions"
aws_call P-3 '' ecs describe-clusters --clusters $C --query 'clusters[0].[status,runningTasksCount,pendingTasksCount,activeServicesCount]' --output text
if [[ $? == 0 ]]; then
  if [[ -z $OUT || $OUT == None ]]; then
    record P-3 FAIL "ABSENT: cluster $C not returned"
  else
    expect P-3 "cluster status running pending services" "$(tr '\t' ' ' <<<"$OUT")" "ACTIVE 0 0 0"
  fi
fi
# ListTaskDefinitionFamilies matches a name prefix; ListTaskDefinitions' familyPrefix is the exact
# family name (ECS API reference), so revisions are listed per family.
aws_call P-3 '' ecs list-task-definition-families --family-prefix $C --status ACTIVE --query 'families' --output text
if [[ $? == 0 ]]; then
  fams=$(tr '\t' '\n' <<<"$OUT" | grep -v '^$' | LC_ALL=C sort | paste -sd, -)
  expect P-3 "families with an ACTIVE revision" "$fams" "$C-db-admin,$C-identity,$C-identity-bootstrap,$C-identity-migrate"
fi
for fam in identity identity-migrate identity-bootstrap db-admin; do
  aws_call P-3 '' ecs list-task-definitions --family-prefix $C-$fam --status ACTIVE --query 'taskDefinitionArns' --output text
  [[ $? == 0 ]] && expect P-3 "$C-$fam ACTIVE revisions" "$(tr '\t' '\n' <<<"$OUT" | sed -n 's#.*task-definition/##p' | LC_ALL=C sort | paste -sd, -)" "$C-$fam:1"
done
TD_ABSENT='ClientException.*(Unable to describe task definition|does not exist)'
# identity-bootstrap runs the Identity api (runtime) image: stack/ops.tf identity_bootstrap, image = var.images.identity_api.
for f in identity:$D_IDENTITY,$D_VALKEY identity-migrate:$D_MIGRATE identity-bootstrap:$D_IDENTITY db-admin:$D_POSTGRES; do
  fam=${f%%:*} digests=${f#*:}
  aws_call P-3 "$TD_ABSENT" ecs describe-task-definition --task-definition $C-$fam --query 'taskDefinition.[revision,status,join(`,`,containerDefinitions[].image)]' --output text
  case $? in
  0)
    IFS=$'\t' read -r rev tst images <<<"$OUT"
    expect P-3 "$C-$fam revision status" "$rev $tst" "1 ACTIVE"
    for d in ${digests//,/ }; do
      if [[ $images == *"@sha256:$d"* ]]; then record P-3 PASS "$C-$fam image @sha256:${d:0:8}"; else record P-3 FAIL "$C-$fam images '$images' lack @sha256:${d:0:8}"; fi
    done
    ;;
  3) absent P-3 "task definition $C-$fam" ;;
  esac
done

# ---------------------------------------------------------------- P-4 secret references (ARNs and version ids only)
h "P-4 secret references in task definitions (ARNs and version ids only)"
secret_refs() { # FAMILY: sets OUT to "NAME<TAB>valueFrom" lines, returns aws_call status
  aws_call P-4 "$TD_ABSENT" ecs describe-task-definition --task-definition $C-$1 --query 'taskDefinition.containerDefinitions[].secrets[].[name,valueFrom]' --output text
}
has_ref() { # ID LABEL REGEX: PASS when a reference line matches
  if grep -Eq "$3" <<<"$OUT"; then record "$1" PASS "$2"; else record "$1" FAIL "$2: no matching reference"; fi
}
secret_refs identity
case $? in
0)
  n=$(grep -c . <<<"$OUT")
  bad=$(grep -Evc ":secret:$C/identity-[A-Za-z0-9]{6}:[A-Z_]+::$PIN_IDENTITY\$" <<<"$OUT")
  if ((n > 0 && bad == 0)); then record P-4 PASS "identity: $n references, all munaxa-nonprod/identity pinned to $PIN_IDENTITY"; else record P-4 FAIL "identity: $n references, $bad not pinned to munaxa-nonprod/identity @ $PIN_IDENTITY"; fi
  ;;
3) absent P-4 "task definition $C-identity" ;;
esac
# identity-migrate: modules/service secret_keys = local.secret_keys["identity-migrate"] = ["DATABASE_MIGRATION_URL"]
# (stack/data.tf); the migrate image's CMD exports DATABASE_URL from DATABASE_MIGRATION_URL.
secret_refs identity-migrate
case $? in
0)
  expect P-4 "identity-migrate secret names" "$(cut -f1 <<<"$OUT" | LC_ALL=C sort | paste -sd, -)" DATABASE_MIGRATION_URL
  has_ref P-4 "identity-migrate DATABASE_MIGRATION_URL pinned to $PIN_MIGRATE" "^DATABASE_MIGRATION_URL"$'\t'".*:secret:$C/identity-migrate-[A-Za-z0-9]{6}:DATABASE_MIGRATION_URL::$PIN_MIGRATE\$"
  ;;
3) absent P-4 "task definition $C-identity-migrate" ;;
esac
# identity-bootstrap: the scripts read DIRECT_DATABASE_URL (stack/ops.tf identity_bootstrap secrets).
secret_refs identity-bootstrap
case $? in
0)
  has_ref P-4 "identity-bootstrap DIRECT_DATABASE_URL pinned to $PIN_MIGRATE" "^DIRECT_DATABASE_URL"$'\t'".*:secret:$C/identity-migrate-[A-Za-z0-9]{6}:DATABASE_MIGRATION_URL::$PIN_MIGRATE\$"
  has_ref P-4 "bootstrap IDENTITY_OWNER_EMAIL reference" ":secret:$C/identity-bootstrap:IDENTITY_OWNER_EMAIL::\$"
  has_ref P-4 "bootstrap IDENTITY_OWNER_PASSWORD reference" ":secret:$C/identity-bootstrap:IDENTITY_OWNER_PASSWORD::\$"
  ;;
3) absent P-4 "task definition $C-identity-bootstrap" ;;
esac
secret_refs db-admin
case $? in
0)
  has_ref P-4 "db-admin master secret username" '^PGUSER'$'\t''.*:secret:rds!db-.*:username::$'
  has_ref P-4 "db-admin master secret password" '^PGPASSWORD'$'\t''.*:secret:rds!db-.*:password::$'
  has_ref P-4 "db-admin identity pin" ":secret:$C/identity-[A-Za-z0-9]{6}:DATABASE_URL::$PIN_IDENTITY\$"
  has_ref P-4 "db-admin identity-migrate pin" ":secret:$C/identity-migrate-[A-Za-z0-9]{6}:DATABASE_MIGRATION_URL::$PIN_MIGRATE\$"
  ;;
3) absent P-4 "task definition $C-db-admin" ;;
esac

# ---------------------------------------------------------------- P-5 bundles and data key (metadata only)
h "P-5 secret bundles and data key (metadata only)"
KEY_ARN= KEY_ID=
aws_call P-5 'NotFoundException' kms describe-key --key-id alias/$C-data --query 'KeyMetadata.[Arn,KeyId,KeyState,KeyUsage]' --output text
case $? in
0)
  IFS=$'\t' read -r KEY_ARN KEY_ID kst kus <<<"$OUT"
  expect P-5 "data key state usage" "$kst $kus" "Enabled ENCRYPT_DECRYPT"
  ;;
3) absent P-5 "alias/$C-data" ;;
esac
for s in identity:$PIN_IDENTITY identity-migrate:$PIN_MIGRATE; do
  name=$C/${s%%:*} pin=${s#*:}
  aws_call P-5 'ResourceNotFoundException' secretsmanager describe-secret --secret-id "$name" --query '[KmsKeyId,DeletedDate]' --output text
  case $? in
  0)
    IFS=$'\t' read -r kms deleted <<<"$OUT"
    expect P-5 "$name DeletedDate" "$deleted" None
    if [[ -n $KEY_ID && ($kms == "$KEY_ARN" || $kms == "$KEY_ID" || $kms == "alias/$C-data" || $kms == *":alias/$C-data") ]]; then
      record P-5 PASS "$name uses the data key"
    else
      record P-5 FAIL "$name KmsKeyId '$kms' is not alias/$C-data (${KEY_ARN:-key not read})"
    fi
    ;;
  3) absent P-5 "$name" ;;
  esac
  aws_call P-5 'ResourceNotFoundException' secretsmanager list-secret-version-ids --secret-id "$name" --query "Versions[?VersionId=='$pin'].VersionStages[]" --output text
  case $? in
  0) expect_re P-5 "$name version $pin stages" "$OUT" '(^|[[:space:]])AWSCURRENT([[:space:]]|$)' "to include AWSCURRENT" ;;
  3) absent P-5 "$name versions" ;;
  esac
done

# ---------------------------------------------------------------- P-6 bootstrap secret must be absent
h "P-6 leftover bootstrap secret (expected absent)"
# --include-planned-deletion: a secret scheduled for deletion still holds its value and can be restored.
aws_call P-6 '' secretsmanager list-secrets --include-planned-deletion --filters Key=name,Values=$C/identity-bootstrap --query 'length(SecretList)' --output json
[[ $? == 0 ]] && expect P-6 "secrets named $C/identity-bootstrap" "$OUT" 0

# ---------------------------------------------------------------- P-7 nothing running
h "P-7 nothing running"
count() { # LABEL SERVICE OPERATION ARGS...: expects 0
  local label=$1
  shift
  # JSON output: the CLI merges every page before the query, so a count is one number.
  aws_call P-7 '' "$@" --output json && expect P-7 "$label" "$OUT" 0
}
count services ecs list-services --cluster $C --query 'length(serviceArns)'
count tasks ecs list-tasks --cluster $C --query 'length(taskArns)'
count "load balancers" elbv2 describe-load-balancers --query 'length(LoadBalancers)'
count "target groups" elbv2 describe-target-groups --query 'length(TargetGroups)'
count "NAT gateways" ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'length(NatGateways)'
count "Elastic IPs" ec2 describe-addresses --query 'length(Addresses)'
count "EC2 instances" ec2 describe-instances --filters Name=instance-state-name,Values=pending,running,stopping,stopped --query 'length(Reservations[].Instances[])'
count "public ENIs" ec2 describe-network-interfaces --filters 'Name=association.public-ip,Values=*' --query 'length(NetworkInterfaces)'

# ---------------------------------------------------------------- P-8 backstop
h "P-8 backstop"
aws_call P-8 '' scheduler list-schedules --name-prefix $C-backstop --query 'Schedules[].[Name,State]' --output text
if [[ $? == 0 ]]; then
  total=$(grep -c . <<<"$OUT") enabled=$(grep -c $'\tENABLED$' <<<"$OUT")
  expect P-8 "backstop schedules total enabled" "$total $enabled" "11 11"
fi
aws_call P-8 'ResourceNotFoundException' scheduler get-schedule --name $C-backstop-database --query '[ScheduleExpression,ScheduleExpressionTimezone,State,Target.Arn,Target.Input]' --output text
case $? in
0)
  IFS=$'\t' read -r expr tz sst tarn tin <<<"$OUT"
  expect P-8 "database schedule" "$expr $tz $sst" "cron(0 21 * * ? *) UTC ENABLED"
  expect P-8 "database target" "$tarn" "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
  expect_re P-8 "database input" "$tin" "\"DbInstanceIdentifier\": ?\"$C-pg\"" "to name $C-pg"
  ;;
3) absent P-8 "schedule $C-backstop-database" ;;
esac

# ---------------------------------------------------------------- P-9 certificate
h "P-9 ACM"
aws_call P-9 '' acm list-certificates --includes keyTypes=RSA_2048,EC_prime256v1,EC_secp384r1 --query "CertificateSummaryList[?DomainName=='*.test.munaxa.com'].CertificateArn" --output text
if [[ $? == 0 ]]; then
  arns=$(tr '\t' '\n' <<<"$OUT" | grep -c '^arn:')
  if ((arns == 0)); then
    record P-9 FAIL "ABSENT: no certificate for *.test.munaxa.com"
  elif ((arns > 1)); then
    record P-9 FAIL "$arns certificates for *.test.munaxa.com, expected 1"
  elif [[ ! $OUT =~ ^arn:aws:acm:eu-central-1:229251310592:certificate/[0-9a-f-]+$ ]]; then
    record P-9 FAIL "certificate ARN '$OUT' is not an ACM ARN of this account and region"
  else
    aws_call P-9 'ResourceNotFoundException' acm describe-certificate --certificate-arn "$OUT" --query 'Certificate.[Status,NotAfter,join(`,`,SubjectAlternativeNames),length(InUseBy)]' --output text
    case $? in
    0)
      IFS=$'\t' read -r cst na sans inuse <<<"$OUT"
      expect P-9 status "$cst" ISSUED
      expect_re P-9 SANs "$sans" '(^|,)\*\.test\.munaxa\.com(,|$)' "to include *.test.munaxa.com"
      expect_re P-9 SANs "$sans" '(^|,)operator-test\.munaxa\.com(,|$)' "to include operator-test.munaxa.com"
      expect P-9 InUseBy "$inuse" 0
      info "NotAfter $na"
      ;;
    3) absent P-9 "certificate $OUT" ;;
    esac
  fi
fi

# ---------------------------------------------------------------- P-10 images
h "P-10 images"
for i in munaxa-identity/api:$D_IDENTITY munaxa-identity/migrate:$D_MIGRATE; do
  repo=${i%%:*} d=${i#*:}
  aws_call P-10 'ImageNotFoundException|RepositoryNotFoundException' ecr describe-images --repository-name "$repo" --image-ids imageDigest=sha256:$d --query 'imageDetails[0].join(`,`,imageTags)' --output text
  case $? in
  0) expect_re P-10 "$repo @sha256:${d:0:8} tags" "$OUT" '(^|,)5277d71' "to include 5277d71" ;;
  3) absent P-10 "$repo @sha256:${d:0:8}" ;;
  esac
done

# ---------------------------------------------------------------- P-11 service-linked roles
h "P-11 service-linked roles (must exist; the session deployer cannot create them)"
for r in AWSServiceRoleForECS AWSServiceRoleForElasticLoadBalancing; do
  aws_call P-11 'NoSuchEntity' iam get-role --role-name $r --query 'Role.RoleName' --output text
  case $? in
  0) expect P-11 role "$OUT" "$r" ;;
  3) absent P-11 "$r (blocking for up: no IAM change without a separate decision)" ;;
  esac
done

# ---------------------------------------------------------------- P-11b session roles
h "P-11b session roles (settings, trust and every policy document compared with the code)"
CI_ROLE=munaxa-shared-ci-nonprod-session DEP_ROLE=munaxa-shared-deployer-nonprod-session
printf '%s\n' "$SESSION_SPEC" >"$WORK/session-spec.json"
fetch P-11b roles.json '' iam list-roles --path-prefix /munaxa-shared/bootstrap/ --query 'Roles[].{RoleName:RoleName}' --output json
for r in $CI_ROLE $DEP_ROLE; do
  fetch P-11b "role-$r.json" 'NoSuchEntity' iam get-role --role-name $r --query 'Role' --output json
  fetch P-11b "inline-names-$r.json" 'NoSuchEntity' iam list-role-policies --role-name $r --query 'PolicyNames' --output json
  fetch P-11b "attached-$r.json" 'NoSuchEntity' iam list-attached-role-policies --role-name $r --query 'AttachedPolicies' --output json
done
fetch P-11b "inline-$CI_ROLE-assume-own-session-deployer-only.json" 'NoSuchEntity' iam get-role-policy --role-name $CI_ROLE --policy-name assume-own-session-deployer-only --query 'PolicyDocument' --output json
fetch P-11b "inline-$DEP_ROLE-session-deployer.json" 'NoSuchEntity' iam get-role-policy --role-name $DEP_ROLE --policy-name session-deployer --query 'PolicyDocument' --output json
# Managed policies, in the verifier's order (sorted ARNs): the document of the default version.
i=0
for arn in arn:aws:iam::$EXPECTED_ACCOUNT:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read \
  arn:aws:iam::$EXPECTED_ACCOUNT:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-read; do
  aws_call P-11b 'NoSuchEntity' iam get-policy --policy-arn "$arn" --query 'Policy.DefaultVersionId' --output text
  case $? in
  0)
    if [[ $OUT =~ ^v[0-9]+$ ]]; then
      fetch P-11b "policy-$i.json" 'NoSuchEntity' iam get-policy-version --policy-arn "$arn" --version-id "$OUT" --query 'PolicyVersion.Document' --output json
    else
      record P-11b ERROR "$arn default version '$OUT' is not a version id"
      printf '__ERROR__\n' >"$WORK/policy-$i.json"
    fi
    ;;
  3) printf '__ABSENT__ %s\n' "$ABSENT" >"$WORK/policy-$i.json" ;;
  *) printf '__ERROR__\n' >"$WORK/policy-$i.json" ;;
  esac
  i=$((i + 1))
done
fetch P-11b state-key.json 'NotFoundException' kms describe-key --key-id alias/munaxa-shared-tfstate --query 'KeyMetadata.Arn' --output json
verify P-11b iam "$WORK" "$WORK/session-spec.json"
info "P-11b compares documents with the code. It does not evaluate effective permissions: under root nothing here exercises IAM."

# ---------------------------------------------------------------- P-12 CloudTrail denials
h "P-12 CloudTrail denials since $SINCE (all pages, errorCode only)"
NOW=$(date -u +%FT%TZ)
if ! command -v python3 >/dev/null 2>&1; then
  record P-12 ERROR "python3 not found"
elif [[ ! $SINCE =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || [[ $SINCE > $NOW ]]; then
  record P-12 ERROR "PREFLIGHT_SINCE '$SINCE' is not a UTC time like 2026-11-10T06:00:00Z no later than now ($NOW): CloudTrail not read"
else
  info "window $SINCE to $NOW"
  for r in eu-central-1 us-east-1; do
    aws_call P-12 '' cloudtrail lookup-events --region $r --start-time "$SINCE" --output json || continue
    rc=0
    res=$(printf '%s' "$OUT" | python3 -I -c "$DENIAL_FILTER" 2>&1) || rc=$?
    # Exit 0 or 1 counts only with the filter's own summary line; anything else is an ERROR.
    [[ $rc == 0 && ! $(head -1 <<<"$res") =~ ^events\ [0-9]+\ denials\ 0$ ]] && rc=9
    [[ $rc == 1 && ! $(head -1 <<<"$res") =~ ^events\ [0-9]+\ denials\ [1-9][0-9]*$ ]] && rc=9
    case $rc in
    0) record P-12 PASS "$r: $(head -1 <<<"$res")" ;;
    1) record P-12 FAIL "$r: $res" ;;
    *) record P-12 ERROR "$r: denial filter exit $rc: $(head -1 <<<"$res")" ;;
    esac
  done
fi

# ---------------------------------------------------------------- P-13 network
h "P-13 network topology (stack/network.tf, Config A1)"
VPC= rc=0
fetch P-13 vpcs.json '' ec2 describe-vpcs --filters Name=tag:Name,Values=$C --query 'Vpcs' --output json || rc=$?
if ((rc == 0)) && command -v python3 >/dev/null 2>&1; then
  VPC=$(python3 -I -c 'import json,sys
try: v=json.load(sys.stdin)
except ValueError: v=None
print(v[0].get("VpcId","") if isinstance(v,list) and len(v)==1 and isinstance(v[0],dict) else "")' <<<"$OUT")
fi
if [[ $VPC =~ ^vpc-[0-9a-f]{8,17}$ ]]; then
  fetch P-13 subnets.json '' ec2 describe-subnets --filters Name=vpc-id,Values=$VPC --query 'Subnets' --output json
  fetch P-13 route-tables.json '' ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC --query 'RouteTables' --output json
  fetch P-13 endpoints.json '' ec2 describe-vpc-endpoints --filters Name=vpc-id,Values=$VPC --query 'VpcEndpoints' --output json
  fetch P-13 sgs.json '' ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC --query 'SecurityGroups' --output json
fi
# By Name tag, not by attachment: a detached gateway, or one attached elsewhere, is then reported.
fetch P-13 igws.json '' ec2 describe-internet-gateways --filters Name=tag:Name,Values=$C-igw --query 'InternetGateways' --output json
# Not read because the VPC did not resolve: the verifier reports an ERROR for each unless it already
# reported why the VPC is unusable (absent, ambiguous, failed call).
for f in subnets route-tables endpoints sgs; do [[ -e $WORK/$f.json ]] || printf '__NOT_FETCHED__\n' >"$WORK/$f.json"; done
verify P-13 net "$WORK" "$C" "$DB_VPC" "${STATUS[P-2]:-}"

# ---------------------------------------------------------------- summary
h "Summary"
errors=0 fails=0
for id in "${CHECKS[@]}"; do
  [[ -n ${STATUS[$id]:-} ]] || record "$id" ERROR "check produced no result"
  printf '%-6s %s\n' "$id" "${STATUS[$id]}"
  case ${STATUS[$id]} in FAIL) fails=$((fails + 1)) ;; ERROR) errors=$((errors + 1)) ;; esac
done
echo
echo "preflight finished $(date -u +%FT%TZ)"
if ((errors > 0)); then
  echo "OVERALL: INCOMPLETE ($errors check(s) with command failures, $fails failed). Not a PASS: the ERROR lines verified nothing."
  exit 2
elif ((fails > 0)); then
  echo "OVERALL: FAIL ($fails check(s) failed)"
  exit 1
fi
echo "OVERALL: PASS (all ${#CHECKS[@]} checks)"
exit 0
