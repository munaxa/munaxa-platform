#!/usr/bin/env bash
# G3 recovery, Stage E: independent read-only reconciliation (root, CloudShell, eu-central-1).
# Read-only calls only. Prints names, ids, counts and states; never secret values or state values.
set -uo pipefail
W=/tmp/g3rece; mkdir -p "$W"; cd "$W" || exit 1
exec > >(tee "$W/stage-e.log") 2>&1
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1
B=munaxa-shared-tfstate-229251310592
PIN=${1:?usage: stage-e-owner-cloudshell.sh <commit SHA>}
RAW=https://raw.githubusercontent.com/munaxa/munaxa-platform/$PIN/docs/aws-migration/agent-reports/2026-11-05-g3-failed-apply-recovery/supporting
date -u +"start %FT%TZ"; aws sts get-caller-identity --query Arn --output text

echo "== E1 state"
aws s3api head-object --bucket $B --key nonprod/stack.tfstate --query '[LastModified,ServerSideEncryption]' --output text
aws s3api head-object --bucket $B --key nonprod/stack.tfstate.tflock >/dev/null 2>&1 && echo "LOCK PRESENT" || echo "no lock"
aws s3 cp --quiet s3://$B/nonprod/stack.tfstate - | jq -r '"serial \(.serial) lineage \(.lineage[0:8])", (.resources[]|select(.mode=="managed") as $r|$r.instances[]|"\(if $r.module then $r.module+"." else "" end)\($r.type).\($r.name)\(if .index_key==null then "" elif (.index_key|type)=="number" then "[\(.index_key)]" else "[\"\(.index_key)\"]" end)")' > st.txt
head -1 st.txt; tail -n +2 st.txt | sort > addr.txt; echo "state addresses $(wc -l < addr.txt)"
{ curl -fsSL $RAW/state-38-addresses.txt; curl -fsSL $RAW/recovery-26-addresses.txt; } | sort -u > g3-64.txt; echo "expected G3 addresses $(wc -l < g3-64.txt)"
echo "-- in G3 list, not in state:"; comm -23 g3-64.txt addr.txt
echo "-- in state, not in G3 list:"; comm -13 g3-64.txt addr.txt

echo "== E2 database"
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,DBInstanceClass,Engine,EngineVersion,StorageEncrypted,PubliclyAccessible,MultiAZ,DeletionProtection,AllocatedStorage]' --output text
aws rds describe-db-parameters --db-parameter-group-name munaxa-nonprod-pg16 --query "Parameters[?ParameterName=='rds.force_ssl'].[ParameterName,ParameterValue]" --output text
aws rds describe-db-snapshots --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotType,Status]' --output text; echo "(snapshots listed above)"

echo "== E3 compute and edge (G3 creates none of these)"
aws ecs list-services --cluster munaxa-nonprod --query 'length(serviceArns)' --output text | sed 's/^/ecs services /'
aws ecs list-tasks --cluster munaxa-nonprod --query 'length(taskArns)' --output text | sed 's/^/ecs tasks /'
aws elbv2 describe-load-balancers --query 'length(LoadBalancers)' --output text | sed 's/^/load balancers /'
aws ec2 describe-nat-gateways --filter Name=state,Values=pending,available --query 'length(NatGateways)' --output text | sed 's/^/nat gateways /'
aws ec2 describe-addresses --query 'length(Addresses)' --output text | sed 's/^/elastic ips /'
aws ec2 describe-instances --filters Name=instance-state-name,Values=pending,running --query 'length(Reservations)' --output text | sed 's/^/ec2 instances /'

echo "== E4 network"
V=$(aws ec2 describe-vpcs --filters Name=tag:Project,Values=munaxa Name=tag:Environment,Values=nonprod --query 'Vpcs[].VpcId' --output text); echo "vpc $V"
aws ec2 describe-subnets --filters Name=vpc-id,Values=$V --query 'Subnets[].[Tags[?Key==`Name`]|[0].Value,CidrBlock,AvailabilityZone,MapPublicIpOnLaunch]' --output text | sort
aws ec2 describe-route-tables --filters Name=vpc-id,Values=$V --query 'RouteTables[].[Tags[?Key==`Name`]|[0].Value,length(Associations),join(`,`,Routes[].DestinationCidrBlock || `[]`)]' --output text | sort
aws ec2 describe-security-groups --filters Name=vpc-id,Values=$V --query 'SecurityGroups[].[GroupName,length(IpPermissions),length(IpPermissionsEgress)]' --output text | sort
aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values=$V --query 'VpcEndpoints[].[ServiceName,VpcEndpointType,State]' --output text
aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$V --query 'length(InternetGateways)' --output text | sed 's/^/internet gateways /'

echo "== E5 certificates, logs, secrets (metadata), images"
aws acm list-certificates --query 'CertificateSummaryList[].[DomainName,Status]' --output text
aws logs describe-log-groups --log-group-name-prefix /munaxa/nonprod --query 'logGroups[].[logGroupName,retentionInDays,kmsKeyId!=`null`]' --output text
aws secretsmanager list-secrets --query 'SecretList[].[Name,KmsKeyId!=`null`,LastChangedDate!=`null`,OwningService||`-`]' --output text | sort
aws ecr describe-repositories --query 'repositories[].repositoryName' --output text | tr '\t' '\n' | sort | while read -r r; do
  echo "$r images=$(aws ecr list-images --repository-name "$r" --query 'length(imageIds)' --output text)"; done

echo "== E6 cost and budget"
aws budgets describe-budgets --account-id 229251310592 --query 'Budgets[].[BudgetName,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount,CalculatedSpend.ForecastedSpend.Amount]' --output text
aws ce get-cost-and-usage --region us-east-1 --time-period Start=2026-11-01,End=2026-11-07 --granularity MONTHLY --metrics UnblendedCost --query 'ResultsByTime[].Total.UnblendedCost.[Amount,Unit]' --output text

echo "== E7 CloudTrail errors by the nonprod deployer, 6 Nov 13:00-now"
aws cloudtrail lookup-events --lookup-attributes AttributeKey=ReadOnly,AttributeValue=false --start-time 2026-11-06T13:00:00Z --query 'Events[].CloudTrailEvent' --output json \
  | jq -r '.[]|fromjson|select(.errorCode!=null and ((.userIdentity.arn//"")|test("deployer-nonprod")))|[.eventSource,.eventName,.errorCode]|@tsv' | sort | uniq -c | tail -40
echo "(write errors by the nonprod deployer listed above)"
date -u +"STAGE E DONE %FT%TZ"
