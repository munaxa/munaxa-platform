#!/usr/bin/env bash
# Release readiness verification (7 Nov 2026): read-only checks, run by the OWNER in AWS
# CloudShell, eu-central-1. Replaces ../../2026-11-07-testing-readiness-phase-1/supporting/
# phase1-readonly-check.sh (v1), adding: a caller check, EC2 instances, ECS services by name,
# KMS key metadata, the nonprod deployer's IAM metadata and the Organizations role of the account.
# Report: docs/aws-migration/agent-reports/2026-11-07-release-readiness-verification/.
#
# READ ONLY. Every AWS call is a Describe, Get, List or Lookup. No create, update, delete, start,
# stop, tag, simulate or publish. It never reads a secret value: Secrets Manager only through
# list-secrets and list-secret-version-ids (names and version counts). It reads no Terraform state,
# no saved plan, no log events and no application data. KMS: aliases and DescribeKey metadata
# only. IAM: role and policy documents (configuration, not credentials).
#
# Caller: there is no non-root read-only identity in this account today (owner decisions of
# 29 Oct 2026: root until launch, no Identity Center, no IAM users). The script therefore stops if
# the caller is root, unless the owner sets ALLOW_ROOT_READONLY=yes to accept running these
# read-only calls as root, as on 6 Nov. That acceptance is the owner's decision, not this script's.
#
# Usage:  bash release-readiness-readonly-check.sh 2>&1 | tee /tmp/release-readiness-check.log
#   (as root, only after deciding to:  ALLOW_ROOT_READONLY=yes bash release-readiness-readonly-check.sh ...)
# Then paste the whole log back into the thread. It holds no secret value.
set -uo pipefail
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""

ACCOUNT=229251310592
DB=munaxa-nonprod-pg
CLUSTER=munaxa-nonprod
CERT_DOMAIN='*.test.munaxa.com'
ECR_REPOS=(
  munaxa-identity/api munaxa-identity/migrate
  munaxa-control/api munaxa-control/migrate munaxa-control/portal
  munaxa-work/api munaxa-work/admin munaxa-work/migrate
)
PUBLISHERS=(munaxa-identity-image-publisher munaxa-control-image-publisher munaxa-work-image-publisher)
DEPLOYER=munaxa-shared-deployer-nonprod
DEPLOYER_POLICIES=(
  "arn:aws:iam::$ACCOUNT:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-read"
  "arn:aws:iam::$ACCOUNT:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-allow-tagged"
  "arn:aws:iam::$ACCOUNT:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-allow"
)
BOUNDARY="arn:aws:iam::$ACCOUNT:policy/munaxa-shared/munaxa-shared-workload-boundary"
SINCE=$(date -u -d '-30 hours' +%Y-%m-%dT%H:%M:%SZ)

section() { printf '\n===== %s =====\n' "$1"; }
run() {
  local out
  if out=$("$@" 2>&1); then printf '%s\n' "$out"; else printf 'ERROR (%s): %s\n' "$*" "$out"; fi
}
# Prints the default version of a managed policy (configuration only).
policy_doc() {
  local v
  v=$(aws iam get-policy --policy-arn "$1" --query 'Policy.DefaultVersionId' --output text 2>&1) || { echo "ERROR get-policy $1: $v"; return; }
  echo "--- $1 (default version $v)"
  run aws iam get-policy-version --policy-arn "$1" --version-id "$v" --query 'PolicyVersion.Document' --output json
}

section "0. Who, where, when"
date -u +'started %Y-%m-%dT%H:%M:%SZ'
CALLER=$(aws sts get-caller-identity --query Arn --output text 2>&1)
ACCT=$(aws sts get-caller-identity --query Account --output text 2>&1)
echo "caller $CALLER"
echo "account $ACCT; region $AWS_REGION; CloudTrail window since $SINCE"
if [ "$ACCT" != "$ACCOUNT" ]; then echo "STOP: not account $ACCOUNT"; exit 1; fi
case "$CALLER" in
  *":root")
    if [ "${ALLOW_ROOT_READONLY:-}" != "yes" ]; then
      echo "STOP: the caller is root. Run as a read-only identity, or set ALLOW_ROOT_READONLY=yes only if the owner has decided to accept a root read-only run."
      exit 1
    fi
    echo "WARNING: running as root by the owner's explicit choice (ALLOW_ROOT_READONLY=yes). Read-only calls only." ;;
esac
run aws organizations describe-organization --query 'Organization.{Id:Id,ManagementAccount:MasterAccountId}' --output json

section "1. ECR repositories and images (Identity, Control, Work)"
for r in "${ECR_REPOS[@]}"; do
  echo "--- $r"
  run aws ecr describe-repositories --repository-names "$r" \
    --query 'repositories[0].{Mutability:imageTagMutability,ScanOnPush:imageScanningConfiguration.scanOnPush,Encryption:encryptionConfiguration.encryptionType}' --output json
  run aws ecr describe-images --repository-name "$r" \
    --query '{ImageCount:length(imageDetails),Images:imageDetails[].{Digest:imageDigest,Tags:imageTags,Pushed:imagePushedAt}}' --output json
done

section "2. Image publisher roles (trust, inline and attached policies, boundary)"
for role in "${PUBLISHERS[@]}"; do
  echo "--- $role"
  run aws iam get-role --role-name "$role" \
    --query 'Role.{Arn:Arn,Path:Path,MaxSession:MaxSessionDuration,Boundary:PermissionsBoundary,Trust:AssumeRolePolicyDocument}' --output json
  run aws iam list-role-policies --role-name "$role" --output json
  run aws iam get-role-policy --role-name "$role" --policy-name push-own-images --query 'PolicyDocument' --output json
  run aws iam list-attached-role-policies --role-name "$role" --output json
done

section "3. Secrets Manager containers (names and version counts only, never values)"
NAMES=$(aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/ --query 'SecretList[].Name' --output text 2>&1)
echo "containers: $NAMES"
for n in $NAMES; do
  printf '%-40s versions: ' "$n"
  aws secretsmanager list-secret-version-ids --secret-id "$n" --query 'length(Versions)' --output text 2>&1
done

section "4. KMS aliases and key metadata (nonprod)"
KEYS=$(aws kms list-aliases --query "Aliases[?starts_with(AliasName,'alias/munaxa-nonprod')].[AliasName,TargetKeyId]" --output text 2>&1)
printf '%s\n' "$KEYS"
printf '%s\n' "$KEYS" | while read -r alias key; do
  [ -n "${key:-}" ] || continue
  echo "--- $alias"
  run aws kms describe-key --key-id "$key" \
    --query 'KeyMetadata.{Spec:KeySpec,Usage:KeyUsage,State:KeyState,Manager:KeyManager,Created:CreationDate}' --output json
done

section "5. ACM certificate ($CERT_DOMAIN)"
CERT_ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$CERT_DOMAIN'].CertificateArn" --output text 2>&1)
echo "certificate: $CERT_ARN"
for c in $CERT_ARN; do
  run aws acm describe-certificate --certificate-arn "$c" \
    --query 'Certificate.{Status:Status,NotAfter:NotAfter,InUseBy:InUseBy,RenewalEligibility:RenewalEligibility,SANs:SubjectAlternativeNames}' --output json
done

section "6. RDS, ECS, and billable network inventory (expected: nothing running)"
run aws rds describe-db-instances --db-instance-identifier "$DB" \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass,Engine:EngineVersion,Public:PubliclyAccessible}' --output json
run aws ecs describe-clusters --clusters "$CLUSTER" \
  --query 'clusters[0].{Status:status,Services:activeServicesCount,Running:runningTasksCount,Pending:pendingTasksCount}' --output json
SVCS=$(aws ecs list-services --cluster "$CLUSTER" --query 'serviceArns' --output text 2>&1)
echo "services: ${SVCS:-none}"
for s in $SVCS; do
  run aws ecs describe-services --cluster "$CLUSTER" --services "$s" \
    --query 'services[0].{Name:serviceName,Desired:desiredCount,Running:runningCount,Pending:pendingCount}' --output json
done
run aws ecs list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE --output json
run aws elbv2 describe-load-balancers --query 'LoadBalancers[].{Name:LoadBalancerName,State:State.Code}' --output json
run aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'NatGateways[].NatGatewayId' --output json
run aws ec2 describe-instances --filters Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType}' --output json
run aws ec2 describe-addresses --query 'Addresses[].{Ip:PublicIp,Associated:AssociationId}' --output json

section "7. Shutdown backstop: schedules and recent calls (CloudTrail since $SINCE)"
run aws scheduler list-schedules --name-prefix munaxa-nonprod-backstop --query 'Schedules[].{Name:Name,State:State}' --output json
for ev in StopDBInstance UpdateService; do
  echo "--- $ev"
  run aws cloudtrail lookup-events --start-time "$SINCE" \
    --lookup-attributes AttributeKey=EventName,AttributeValue="$ev" \
    --query 'Events[].{Time:EventTime,User:Username}' --output json
done

section "8. Config A deployer: IAM metadata (no simulation)"
run aws iam get-role --role-name "$DEPLOYER" \
  --query 'Role.{Arn:Arn,Boundary:PermissionsBoundary,MaxSession:MaxSessionDuration,Trust:AssumeRolePolicyDocument}' --output json
run aws iam list-attached-role-policies --role-name "$DEPLOYER" --output json
run aws iam list-role-policies --role-name "$DEPLOYER" --output json
run aws iam get-role-policy --role-name "$DEPLOYER" --policy-name deployer --query 'PolicyDocument' --output json
for p in "${DEPLOYER_POLICIES[@]}"; do policy_doc "$p"; done
echo "--- workload boundary (attached to the roles the deployer creates)"
policy_doc "$BOUNDARY"

section "9. Done"
date -u +'finished %Y-%m-%dT%H:%M:%SZ'
