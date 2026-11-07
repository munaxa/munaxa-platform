#!/usr/bin/env bash
# Testing readiness phase 1: read-only checks, run by the owner in AWS CloudShell (eu-central-1).
# Report: docs/aws-migration/agent-reports/2026-11-07-testing-readiness-phase-1/ (munaxa-platform).
#
# READ ONLY. Every call is a Describe, Get, List or Lookup. No create, update, delete, start, stop,
# tag or publish. It never reads a secret value: Secrets Manager is read through list-secrets and
# list-secret-version-ids only (names, dates and version counts). It never reads Terraform state,
# a saved plan, application data or log events. Every list is filtered to Munaxa nonprod names or
# to the eight Identity, Control and Work ECR repositories.
#
# Usage:  bash phase1-readonly-check.sh 2>&1 | tee /tmp/phase1-readonly-check.log
# Then paste the whole log back into the thread. It holds no secret value.
set -uo pipefail
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""

DB=munaxa-nonprod-pg
CLUSTER=munaxa-nonprod
CERT_DOMAIN='*.test.munaxa.com'
ECR_REPOS=(
  munaxa-identity/api munaxa-identity/migrate
  munaxa-control/api munaxa-control/migrate munaxa-control/portal
  munaxa-work/api munaxa-work/admin munaxa-work/migrate
)
PUBLISHERS=(munaxa-identity-image-publisher munaxa-control-image-publisher munaxa-work-image-publisher)
SINCE=$(date -u -d '-30 hours' +%Y-%m-%dT%H:%M:%SZ)

section() { printf '\n===== %s =====\n' "$1"; }
run() {
  local out
  if out=$("$@" 2>&1); then printf '%s\n' "$out"; else printf 'ERROR (%s): %s\n' "$*" "$out"; fi
}

section "0. Who, where, when"
date -u +'started %Y-%m-%dT%H:%M:%SZ'
run aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
echo "region $AWS_REGION; CloudTrail window since $SINCE"

section "1. ECR repositories and images (Identity, Control, Work)"
for r in "${ECR_REPOS[@]}"; do
  echo "--- $r"
  run aws ecr describe-repositories --repository-names "$r" \
    --query 'repositories[0].{Mutability:imageTagMutability,ScanOnPush:imageScanningConfiguration.scanOnPush,Encryption:encryptionConfiguration.encryptionType}' --output json
  run aws ecr describe-images --repository-name "$r" \
    --query '{ImageCount:length(imageDetails),Images:imageDetails[].{Digest:imageDigest,Tags:imageTags,Pushed:imagePushedAt}}' --output json
done

section "2. Image publisher roles (trust and inline policy, no credentials)"
for role in "${PUBLISHERS[@]}"; do
  echo "--- $role"
  run aws iam get-role --role-name "$role" \
    --query 'Role.{Arn:Arn,Path:Path,MaxSession:MaxSessionDuration,Trust:AssumeRolePolicyDocument}' --output json
  run aws iam list-role-policies --role-name "$role" --output json
  run aws iam get-role-policy --role-name "$role" --policy-name push-own-images --query 'PolicyDocument' --output json
  run aws iam list-attached-role-policies --role-name "$role" --output json
done

section "3. Secrets Manager containers (metadata and version counts only, never values)"
NAMES=$(aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/ \
  --query 'SecretList[].Name' --output text 2>&1)
echo "containers: $NAMES"
for n in $NAMES; do
  printf '%-40s versions: ' "$n"
  aws secretsmanager list-secret-version-ids --secret-id "$n" --query 'length(Versions)' --output text 2>&1
done
echo "--- one-run identity-bootstrap secret present? (expected: no, until the owner creates it at 7.7)"
run aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/identity-bootstrap \
  --query 'SecretList[].{Name:Name,Created:CreatedDate}' --output json

section "4. KMS aliases (nonprod); the Control licence key exists only after Config A"
run aws kms list-aliases --query "Aliases[?starts_with(AliasName,'alias/munaxa-nonprod')].{Alias:AliasName,Key:TargetKeyId}" --output json

section "5. ACM certificate ($CERT_DOMAIN): status, use and renewal eligibility"
CERT_ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$CERT_DOMAIN'].CertificateArn" --output text 2>&1)
echo "certificate: $CERT_ARN"
for c in $CERT_ARN; do
  run aws acm describe-certificate --certificate-arn "$c" \
    --query 'Certificate.{Status:Status,NotAfter:NotAfter,InUseBy:InUseBy,RenewalEligibility:RenewalEligibility,SANs:SubjectAlternativeNames}' --output json
done

section "6. Running or billable resources (expected: nothing running)"
run aws rds describe-db-instances --db-instance-identifier "$DB" \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass,Engine:EngineVersion,Public:PubliclyAccessible,Endpoint:Endpoint.Address}' --output json
run aws ecs describe-clusters --clusters "$CLUSTER" \
  --query 'clusters[0].{Status:status,Services:activeServicesCount,Running:runningTasksCount,Pending:pendingTasksCount}' --output json
run aws ecs list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE --output json
run aws elbv2 describe-load-balancers --query 'length(LoadBalancers)' --output text
run aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'length(NatGateways)' --output text
run aws ec2 describe-addresses --query 'length(Addresses)' --output text

section "7. Shutdown backstop: schedules and last runs (CloudTrail, since $SINCE)"
run aws scheduler list-schedules --name-prefix munaxa-nonprod-backstop --query 'length(Schedules)' --output text
run aws cloudtrail lookup-events --start-time "$SINCE" \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopDBInstance \
  --query 'Events[].{Time:EventTime,User:Username,Error:CloudTrailEvent}' --output json \
  | grep -oE '"(Time|User)": "[^"]*"|errorCode\\":\\"[A-Za-z]*' || true
run aws cloudtrail lookup-events --start-time "$SINCE" \
  --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateService \
  --query 'length(Events)' --output text

section "8. Done"
date -u +'finished %Y-%m-%dT%H:%M:%SZ'
