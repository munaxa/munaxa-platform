#!/usr/bin/env bash
# First Identity session preflight, P-1 to P-13 (report 2026-11-10-identity-preflight-and-session-readiness).
# READ-ONLY. Run in AWS CloudShell, eu-central-1, with cloudtrail-denials.py in the same folder. Prints metadata only: no secret value
# (no get-secret-value), no Terraform state, no application data. Paste the whole output back.
set -uo pipefail
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1 AWS_PAGER=""
C=munaxa-nonprod
h() { printf '\n=== %s ===\n' "$*"; }

h "P-1 account and region"
aws sts get-caller-identity --query '[Account,Arn]' --output text; echo "region=$AWS_REGION"; date -u +%FT%TZ

h "P-2 RDS"
aws rds describe-db-instances --db-instance-identifier $C-pg --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass,EngineVersion,PubliclyAccessible,DeletionProtection,MultiAZ,StorageEncrypted,DBSubnetGroup.VpcId,join(`,`,VpcSecurityGroups[].VpcSecurityGroupId),DBParameterGroups[0].DBParameterGroupName,DBParameterGroups[0].ParameterApplyStatus,MasterUserSecret.SecretStatus]' --output text

h "P-3 ECS cluster and A1 task definitions"
aws ecs describe-clusters --clusters $C --query 'clusters[0].[clusterName,status,runningTasksCount,pendingTasksCount,activeServicesCount]' --output text
aws ecs list-task-definitions --family-prefix $C --status ACTIVE --output text
for f in identity identity-migrate identity-bootstrap db-admin; do
  aws ecs describe-task-definition --task-definition $C-$f --query 'taskDefinition.[family,revision,status,cpu,memory,executionRoleArn,join(`,`,containerDefinitions[].image)]' --output text
done

h "P-4 secret references in task definitions (ARNs and version ids only)"
for f in identity identity-migrate identity-bootstrap db-admin; do
  echo "-- $f"; aws ecs describe-task-definition --task-definition $C-$f --query 'taskDefinition.containerDefinitions[].secrets[].[name,valueFrom]' --output text
done

h "P-5 bundle versions (metadata only)"
for s in identity identity-migrate; do
  echo "-- $s"; aws secretsmanager describe-secret --secret-id $C/$s --query '[ARN,KmsKeyId,DeletedDate]' --output text
  aws secretsmanager list-secret-version-ids --secret-id $C/$s --query 'Versions[].[VersionId,join(`,`,VersionStages)]' --output text
done
aws kms describe-key --key-id alias/$C-data --query 'KeyMetadata.[Arn,KeyState,KeyUsage]' --output text

h "P-6 leftover bootstrap secret"
aws secretsmanager list-secrets --filters Key=name,Values=$C/identity-bootstrap --query 'length(SecretList)'

h "P-7 nothing running"
echo "services=$(aws ecs list-services --cluster $C --query 'length(serviceArns)') tasks=$(aws ecs list-tasks --cluster $C --query 'length(taskArns)')"
echo "albs=$(aws elbv2 describe-load-balancers --query 'length(LoadBalancers)') tgs=$(aws elbv2 describe-target-groups --query 'length(TargetGroups)')"
echo "nat=$(aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'length(NatGateways)') eip=$(aws ec2 describe-addresses --query 'length(Addresses)')"
echo "ec2=$(aws ec2 describe-instances --filters Name=instance-state-name,Values=pending,running,stopping,stopped --query 'length(Reservations[].Instances[])')"
echo "public_enis=$(aws ec2 describe-network-interfaces --filters Name=association.public-ip,Values='*' --query 'length(NetworkInterfaces)')"

h "P-8 backstop"
aws scheduler list-schedules --name-prefix $C-backstop --query 'Schedules[].[Name,State]' --output text
aws scheduler get-schedule --name $C-backstop-database --query '[ScheduleExpression,ScheduleExpressionTimezone,State,Target.Arn,Target.Input]' --output text

h "P-9 ACM"
ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='*.test.munaxa.com'].CertificateArn" --output text)
aws acm describe-certificate --certificate-arn "$ARN" --query 'Certificate.[CertificateArn,Status,NotAfter,join(`,`,SubjectAlternativeNames),RenewalEligibility,length(InUseBy)]' --output text

h "P-10 images"
aws ecr describe-images --repository-name munaxa-identity/api --image-ids imageDigest=sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156 --query 'imageDetails[0].[repositoryName,imageDigest,join(`,`,imageTags)]' --output text
aws ecr describe-images --repository-name munaxa-identity/migrate --image-ids imageDigest=sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820 --query 'imageDetails[0].[repositoryName,imageDigest,join(`,`,imageTags)]' --output text

h "P-11 service-linked roles"
for r in AWSServiceRoleForECS AWSServiceRoleForElasticLoadBalancing; do
  aws iam get-role --role-name $r --query 'Role.[RoleName,Arn,CreateDate]' --output text 2>&1 | head -1
done

h "P-11b session roles (names and policy names only)"
aws iam list-roles --path-prefix /munaxa-shared/bootstrap/ --query "Roles[?contains(RoleName,'nonprod-session')].[RoleName,MaxSessionDuration]" --output text
for r in $(aws iam list-roles --path-prefix /munaxa-shared/bootstrap/ --query "Roles[?contains(RoleName,'deployer-nonprod-session')].RoleName" --output text); do
  echo "-- $r inline: $(aws iam list-role-policies --role-name $r --query 'PolicyNames' --output text) attached: $(aws iam list-attached-role-policies --role-name $r --query 'AttachedPolicies[].PolicyName' --output text)"
  aws iam get-role-policy --role-name $r --policy-name session-deployer --query 'PolicyDocument.Statement[].[Sid,Effect]' --output text
done

h "P-12 CloudTrail denials since 06:00 UTC (all pages, errorCode only)"
DENIALS="$(dirname "$0")/cloudtrail-denials.py"
[ -f "$DENIALS" ] || { echo "BLOCKED: put cloudtrail-denials.py next to this script"; DENIALS=; }
if [ -n "$DENIALS" ]; then
  for r in eu-central-1 us-east-1; do
    echo "-- $r"; aws cloudtrail lookup-events --region $r --start-time 2026-11-10T06:00:00Z --output json | python3 -I "$DENIALS"
  done
fi

h "P-13 network names"
aws ec2 describe-subnets --filters Name=tag:Name,Values=$C-public-a,$C-public-b --query 'Subnets[].[Tags[?Key==`Name`]|[0].Value,SubnetId,VpcId,AvailabilityZone,MapPublicIpOnLaunch]' --output text
aws ec2 describe-security-groups --filters Name=group-name,Values=$C-db-admin,$C-identity-migrate,$C-identity,$C-alb,$C-database --query 'SecurityGroups[].[GroupName,GroupId,VpcId]' --output text
aws ec2 describe-route-tables --filters Name=tag:Name,Values=$C-rt-public --query 'RouteTables[].Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId' --output text
echo; echo "preflight finished $(date -u +%FT%TZ)"
