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
#   (Describe/List/Get metadata, sts get-caller-identity, cloudtrail lookup-events). There is no
#   create, update, delete, start, stop, run, put, tag, Terraform, IAM, KMS or Secrets Manager write,
#   no get-secret-value, no Terraform state, no logs and no application data.
# - Output is metadata only (names, ids, ARNs, states, counts, statement ids). Paste it back whole.
#
# Each check prints PASS, FAIL or ERROR lines:
#   PASS   the call succeeded and the value matches the expected state
#   FAIL   the call succeeded and the value differs, or AWS answered that the resource does not exist
#          (shown as ABSENT, with the AWS error code); an absence that is expected (P-6) is a PASS
#   ERROR  the call itself failed (access denied, throttling, network, missing CLI or helper):
#          nothing was verified, and the run can never end in OVERALL: PASS
# Exit codes: 0 PASS, 1 FAIL, 2 INCOMPLETE (at least one ERROR), 3 stopped before the checks.
set -uo pipefail
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
action, error code, principal ARN; never the request or response. Exit 0 none, 1 some, 2 bad input.
"""
import json
import re
import sys

DENIAL = re.compile(r"AccessDenied|UnauthorizedOperation$")


def denials(document):
    """document: the parsed lookup-events JSON ({"Events": [...]}) or a bare list of events."""
    events = document.get("Events", []) if isinstance(document, dict) else document
    found = []
    for item in events:
        raw = item.get("CloudTrailEvent") if isinstance(item, dict) else None
        event = json.loads(raw) if isinstance(raw, str) else (raw or item)
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
    except (ValueError, AttributeError) as error:
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

ERRFILE=$(mktemp)
trap 'rm -f "$ERRFILE"' EXIT
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
aws_call P-6 '' secretsmanager list-secrets --filters Key=name,Values=$C/identity-bootstrap --query 'length(SecretList)' --output text
[[ $? == 0 ]] && expect P-6 "secrets named $C/identity-bootstrap" "$OUT" 0

# ---------------------------------------------------------------- P-7 nothing running
h "P-7 nothing running"
count() { # LABEL SERVICE OPERATION ARGS...: expects 0
  local label=$1
  shift
  aws_call P-7 '' "$@" --output text && expect P-7 "$label" "$OUT" 0
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
h "P-11b session roles (names, policy names and statement ids only)"
CI_ROLE=munaxa-shared-ci-nonprod-session DEP_ROLE=munaxa-shared-deployer-nonprod-session
aws_call P-11b '' iam list-roles --path-prefix /munaxa-shared/bootstrap/ --query "Roles[?contains(RoleName,'nonprod-session')].[RoleName,MaxSessionDuration]" --output text
if [[ $? == 0 ]]; then
  for r in $CI_ROLE $DEP_ROLE; do
    line=$(grep -E "^$r"$'\t' <<<"$OUT")
    if [[ -z $line ]]; then record P-11b FAIL "ABSENT: role $r not listed"; else expect P-11b "$r max session" "${line#*$'\t'}" 3600; fi
  done
  if grep -qE "^$DEP_ROLE"$'\t' <<<"$OUT"; then
    aws_call P-11b 'NoSuchEntity' iam list-role-policies --role-name $DEP_ROLE --query 'PolicyNames' --output text
    [[ $? == 0 ]] && expect_re P-11b "$DEP_ROLE inline policies" "$OUT" '(^|[[:space:]])session-deployer([[:space:]]|$)' "to include session-deployer"
    aws_call P-11b 'NoSuchEntity' iam list-attached-role-policies --role-name $DEP_ROLE --query 'AttachedPolicies[].PolicyName' --output text
    [[ $? == 0 ]] && expect_re P-11b "$DEP_ROLE attached policies" "$OUT" "(^|[[:space:]])$DEP_ROLE-read([[:space:]]|$)" "to include $DEP_ROLE-read"
    aws_call P-11b 'NoSuchEntity' iam get-role-policy --role-name $DEP_ROLE --policy-name session-deployer --query 'PolicyDocument.Statement[].Sid' --output text
    case $? in
    0)
      for sid in SessionEdgeAndServices SessionNeverSecurityGroupRules SessionNeverNetworkPlacement SessionPassOwnRoles SessionDatabaseStartStop; do
        if tr '\t' '\n' <<<"$OUT" | grep -qx "$sid"; then record P-11b PASS "statement $sid"; else record P-11b FAIL "statement $sid missing"; fi
      done
      ;;
    3) absent P-11b "inline policy session-deployer" ;;
    esac
  fi
fi

# ---------------------------------------------------------------- P-12 CloudTrail denials
h "P-12 CloudTrail denials since $SINCE (all pages, errorCode only)"
if ! command -v python3 >/dev/null 2>&1; then
  record P-12 ERROR "python3 not found"
else
  for r in eu-central-1 us-east-1; do
    aws_call P-12 '' cloudtrail lookup-events --region $r --start-time "$SINCE" --output json || continue
    rc=0
    res=$(printf '%s' "$OUT" | python3 -I -c "$DENIAL_FILTER" 2>&1) || rc=$?
    case $rc in
    0) record P-12 PASS "$r: $(head -1 <<<"$res")" ;;
    1) record P-12 FAIL "$r: $res" ;;
    *) record P-12 ERROR "$r: denial filter exit $rc: $(head -1 <<<"$res")" ;;
    esac
  done
fi

# ---------------------------------------------------------------- P-13 network
h "P-13 network names"
same_vpc() { # ID LABEL VPC
  if [[ -z $DB_VPC ]]; then record "$1" FAIL "$2 VPC $3 not comparable: P-2 did not return the database VPC"; else expect "$1" "$2 VPC" "$3" "$DB_VPC"; fi
}
aws_call P-13 '' ec2 describe-subnets --filters Name=tag:Name,Values=$C-public-a,$C-public-b --query 'Subnets[].[Tags[?Key==`Name`]|[0].Value,VpcId]' --output text
if [[ $? == 0 ]]; then
  expect P-13 "public subnets" "$(cut -f1 <<<"$OUT" | LC_ALL=C sort | paste -sd, -)" "$C-public-a,$C-public-b"
  while IFS=$'\t' read -r n v; do [[ -n $n ]] && same_vpc P-13 "$n" "$v"; done <<<"$OUT"
fi
aws_call P-13 '' ec2 describe-security-groups --filters Name=group-name,Values=$C-db-admin,$C-identity-migrate,$C-identity,$C-alb,$C-database --query 'SecurityGroups[].[GroupName,VpcId]' --output text
if [[ $? == 0 ]]; then
  expect P-13 "security groups" "$(cut -f1 <<<"$OUT" | LC_ALL=C sort | paste -sd, -)" "$C-alb,$C-database,$C-db-admin,$C-identity,$C-identity-migrate"
  while IFS=$'\t' read -r n v; do [[ -n $n ]] && same_vpc P-13 "$n" "$v"; done <<<"$OUT"
fi
aws_call P-13 '' ec2 describe-route-tables --filters Name=tag:Name,Values=$C-rt-public --query "RouteTables[].Routes[?DestinationCidrBlock=='0.0.0.0/0'].GatewayId[]" --output text
[[ $? == 0 ]] && expect_re P-13 "public default route" "$OUT" '^igw-[0-9a-f]+$' "exactly one route to an igw-"

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
