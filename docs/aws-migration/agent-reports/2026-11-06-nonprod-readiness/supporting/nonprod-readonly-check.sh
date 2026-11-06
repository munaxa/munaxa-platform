#!/usr/bin/env bash
# Nonprod readiness: read-only checks, run by the owner in AWS CloudShell (eu-central-1).
# Report: docs/aws-migration/agent-reports/2026-11-06-nonprod-readiness/ (munaxa-platform).
#
# READ ONLY. Every call is a Describe, Get, List or Lookup, plus public DNS queries. No create,
# update, delete, start, stop or tag. It never reads a secret value (Secrets Manager metadata from
# list-secrets only), never reads Terraform state or a saved plan, never reads application data or
# log events, and only names Munaxa nonprod resources (every list is filtered to munaxa names).
#
# Usage:  bash nonprod-readonly-check.sh 2>&1 | tee /tmp/nonprod-readonly-check.log
# Then paste the whole log back into the thread.
set -uo pipefail
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""

DB=munaxa-nonprod-pg
CLUSTER=munaxa-nonprod
VPC=vpc-0824ebbff902d2980
ROLE=munaxa-nonprod-session-backstop
CERT_DOMAIN='*.test.munaxa.com'
VALIDATION_NAMES=(
  "_03282899ed2d1640c316f06ff46b2cc7.test.munaxa.com"
  "_d67e37ad6024932ab65abd1e6dad5356.operator-test.munaxa.com"
)
SINCE=$(date -u -d '-26 hours' +%Y-%m-%dT%H:%M:%SZ)

section() { printf '\n===== %s =====\n' "$1"; }
# Runs a command and prints its output, or its error (never stops the script).
run() {
  local out
  if out=$("$@" 2>&1); then printf '%s\n' "$out"; else printf 'ERROR (%s): %s\n' "$*" "$out"; fi
}

section "0. Who, where, when"
date -u +'started %Y-%m-%dT%H:%M:%SZ'
run aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
echo "region $AWS_REGION; since (CloudTrail window) $SINCE"

section "1. ACM certificate ($CERT_DOMAIN)"
CERT_ARN=$(aws acm list-certificates --certificate-statuses PENDING_VALIDATION ISSUED FAILED VALIDATION_TIMED_OUT EXPIRED INACTIVE REVOKED \
  --query "CertificateSummaryList[?DomainName=='$CERT_DOMAIN'].CertificateArn" --output text 2>&1)
echo "certificate(s): $CERT_ARN"
for arn in $CERT_ARN; do
  run aws acm describe-certificate --certificate-arn "$arn" --query 'Certificate.{Status:Status,Type:Type,CreatedAt:CreatedAt,IssuedAt:IssuedAt,NotAfter:NotAfter,FailureReason:FailureReason,InUseBy:InUseBy,RenewalEligibility:RenewalEligibility,SANs:SubjectAlternativeNames,Validation:DomainValidationOptions[].{Domain:DomainName,Method:ValidationMethod,Status:ValidationStatus,Record:ResourceRecord}}' --output json
done

section "2. Public DNS over HTTPS (cloudflare-dns.com; no change made). Status 0 = NOERROR, 3 = NXDOMAIN"
# CloudShell has neither dig nor nslookup (owner run, 6 Nov 17:23), so this uses DNS over HTTPS.
q() { # q <type> <name>
  printf '%-6s %-62s -> %s\n' "$1" "$2" "$(curl -s -m 10 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$2&type=$1" | jq -c '[.Status,[.Answer[]?.data]]' 2>&1)"
}
q NS munaxa.com
q CAA munaxa.com
for name in test.munaxa.com operator-test.munaxa.com; do q CNAME "$name"; q A "$name"; done
for name in "${VALIDATION_NAMES[@]}"; do q CNAME "$name"; done

section "3. RDS $DB"
run aws rds describe-db-instances --db-instance-identifier "$DB" --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass,Engine:Engine,Version:EngineVersion,MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,DeletionProtection:DeletionProtection,StorageGiB:AllocatedStorage,ParameterGroups:DBParameterGroups,Created:InstanceCreateTime}' --output json
echo "RDS events since $SINCE (metadata):"
run aws rds describe-events --source-type db-instance --source-identifier "$DB" --start-time "$SINCE" --query 'Events[].[Date,Message]' --output text

section "4. ECS cluster $CLUSTER"
run aws ecs describe-clusters --clusters "$CLUSTER" --query 'clusters[0].{Status:status,Services:activeServicesCount,Running:runningTasksCount,Pending:pendingTasksCount}' --output json
echo "services:"; run aws ecs list-services --cluster "$CLUSTER" --query 'serviceArns' --output json
echo "tasks:"; run aws ecs list-tasks --cluster "$CLUSTER" --query 'taskArns' --output json

section "5. Billable session resources in the nonprod VPC"
echo "load balancers named munaxa-nonprod*:"
run aws elbv2 describe-load-balancers --query "LoadBalancers[?starts_with(LoadBalancerName,'munaxa-nonprod')].[LoadBalancerName,State.Code,CreatedTime]" --output text
echo "NAT gateways in $VPC:"; run aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC" --query 'NatGateways[].[NatGatewayId,State]' --output text
echo "EC2 instances in $VPC:"; run aws ec2 describe-instances --filters "Name=vpc-id,Values=$VPC" --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output text
echo "Elastic IPs tagged Environment=nonprod:"; run aws ec2 describe-addresses --filters "Name=tag:Environment,Values=nonprod" --query 'Addresses[].[AllocationId,PublicIp]' --output text
echo "network interfaces in $VPC (public IPv4 is billed while attached):"
run aws ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$VPC" --query 'NetworkInterfaces[].[NetworkInterfaceId,InterfaceType,Status,Association.PublicIp,RequesterManaged,RequesterId,Description,SubnetId]' --output text

section "6. EventBridge Scheduler (munaxa-* only)"
run aws scheduler list-schedules --name-prefix munaxa- --query 'Schedules[].[GroupName,Name,State]' --output text
for s in $(aws scheduler list-schedules --name-prefix munaxa-nonprod-backstop- --query 'Schedules[].Name' --output text 2>/dev/null); do
  run aws scheduler get-schedule --name "$s" --query '{Name:Name,Group:GroupName,State:State,Expression:ScheduleExpression,TZ:ScheduleExpressionTimezone,Window:FlexibleTimeWindow.Mode,Target:Target.Arn,Input:Target.Input,Role:Target.RoleArn,Retry:Target.RetryPolicy,DLQ:Target.DeadLetterConfig,Created:CreationDate}' --output json
done

section "7. Backstop role $ROLE"
run aws iam get-role --role-name "$ROLE" --query 'Role.{Arn:Arn,Path:Path,Boundary:PermissionsBoundary.PermissionsBoundaryArn,Trust:AssumeRolePolicyDocument,Created:CreateDate,LastUsed:RoleLastUsed}' --output json
run aws iam list-role-policies --role-name "$ROLE" --output json
run aws iam get-role-policy --role-name "$ROLE" --policy-name stop-testing --query 'PolicyDocument' --output json
run aws iam list-attached-role-policies --role-name "$ROLE" --output json

section "8. CloudTrail: the backstop's own calls since $SINCE (Event history, management events)"
for ev in StopDBInstance UpdateService; do
  echo "--- $ev by $ROLE"
  aws cloudtrail lookup-events --lookup-attributes "AttributeKey=EventName,AttributeValue=$ev" --start-time "$SINCE" \
    --query 'Events[].CloudTrailEvent' --output json 2>&1 |
    jq -r --arg role "$ROLE" '(if type=="array" then . else [] end)[] | fromjson
      | select((.userIdentity.arn // "") | contains($role))
      | [.eventTime, .eventName, (.errorCode // "OK"), (.errorMessage // "" | .[0:160]),
         ((.requestParameters // {}) | tostring | .[0:200])] | @tsv' || echo "ERROR reading CloudTrail"
done
echo "--- AssumeRole of $ROLE"
aws cloudtrail lookup-events --lookup-attributes "AttributeKey=EventName,AttributeValue=AssumeRole" --start-time "$SINCE" \
  --query 'Events[].CloudTrailEvent' --output json 2>&1 |
  jq -r --arg role "$ROLE" '(if type=="array" then . else [] end)[] | fromjson
    | select(((.requestParameters.roleArn) // "") | contains($role))
    | [.eventTime, (.userIdentity.invokedBy // .userIdentity.type // ""), (.errorCode // "OK")] | @tsv' || echo "ERROR reading CloudTrail"

section "9. Scheduler metrics, group default, since $SINCE (hourly sums)"
for m in InvocationAttemptCount TargetErrorCount TargetErrorThrottledCount InvocationThrottleCount InvocationDroppedCount; do
  printf '%-26s ' "$m"
  aws cloudwatch get-metric-statistics --namespace AWS/Scheduler --metric-name "$m" --dimensions Name=ScheduleGroup,Value=default \
    --start-time "$SINCE" --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --period 3600 --statistics Sum \
    --query 'sort_by(Datapoints,&Timestamp)[].[Timestamp,Sum]' --output text 2>&1 | tr '\n\t' '; '
  echo
done

section "10. ECR images (product repositories, counts and tags only)"
for repo in munaxa-identity/api munaxa-identity/migrate munaxa-control/api munaxa-control/migrate munaxa-control/portal \
  munaxa-work/api munaxa-work/admin munaxa-work/migrate munaxa-school/api munaxa-school/admin munaxa-school/migrate; do
  printf '%-26s ' "$repo"
  aws ecr describe-images --repository-name "$repo" --query 'length(imageDetails)' --output text 2>&1 | tr '\n' ' '
  echo
done

section "11. Secret containers (metadata only: is any version present; no value is read)"
run aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/ --query 'SecretList[].{Name:Name,Versions:length(keys(SecretVersionsToStages || `{}`)),LastChanged:LastChangedDate}' --output table

section "12. KMS keys of nonprod (aliases, key state and spec only)"
for a in $(aws kms list-aliases --query "Aliases[?starts_with(AliasName,'alias/munaxa-nonprod')].AliasName" --output text 2>/dev/null); do
  printf '%-36s ' "$a"
  aws kms describe-key --key-id "$a" --query 'KeyMetadata.[KeyState,KeySpec,KeyUsage]' --output text 2>&1 | tr '\n' ' '
  echo
done

section "13. Budgets (munaxa-* only)"
run aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --query "Budgets[?starts_with(BudgetName,'munaxa')].[BudgetName,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount,CalculatedSpend.ForecastedSpend.Amount]" --output text

section "done"
date -u +'finished %Y-%m-%dT%H:%M:%SZ'
