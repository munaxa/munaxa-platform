#!/usr/bin/env bash
# H-20 IAM (19 Nov 2026): the Testing session deployer's two read actions for the H-20 gate. PLAN ONLY.
# Report: docs/aws-migration/agent-reports/2026-11-19-identity-h20-iam-bootstrap-plan/ (files 00 and 03).
#
# Why: PR #140 (merged 4591bda) runs scripts/aws/session-cleanup-gate.sh before every Testing up. The
# gate calls states:ListExecutions and states:DescribeExecution as munaxa-shared-deployer-nonprod-session.
# Live IAM does not allow them yet, so every up is refused (safe) until this bootstrap change is applied.
# The change adds one statement, GateSessionCleanup, to the nonprod session-read policy.
#
# Run as root in AWS CloudShell, region eu-central-1 (Frankfurt):
#   bash h20-iam-plan-owner-cloudshell.sh 0f06836c06b2c76ab62699489e67e040a867b360
#
# What it does:
#   - checks the account, the caller, the region, the backend (bucket, key, KMS key, lock file) and the
#     absence of a state lock;
#   - downloads Terraform 1.16.5 and checks HashiCorp's SHA-256;
#   - clones munaxa-platform at exactly the reviewed main commit (detached);
#   - requires the bootstrap to have changed, since the D-B2R apply (a976b1a), in exactly the four
#     reviewed files with the reviewed content (git blob ids);
#   - checks the provider lock;
#   - runs `terraform init -reconfigure -lockfile=readonly` and checks the initialised backend;
#   - runs `terraform test` and requires 70 resources in state;
#   - reads the live policies (read-only) and refuses any drift;
#   - saves a plan with -var testing_session_cleanup=true;
#   - checks that the plan is exactly ONE in-place update of the nonprod session-read policy, adding
#     exactly the GateSessionCleanup statement, with no drift and no other change;
#   - writes a plan summary (addresses, actions, counts and the statement delta; no values);
#   - prints the SHA-256 values.
#
# What it never does:
#   - apply, -auto-approve, import, -target or state edits;
#   - any AWS write other than Terraform's own state lock object
#     (bootstrap/terraform.tfstate.tflock, created and removed by `terraform plan`, use_lockfile).
# No secret is read or printed. The plan JSON holds the prior bootstrap state, so it is deleted after
# the checks. The saved plan stays for the apply, and the apply script deletes it.
set -uo pipefail
umask 077
W=$HOME/munaxa-h20-iam; mkdir -p "$W"; chmod 700 "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/h20-iam-plan.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied. Paste $W/h20-iam-plan.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
REVIEWED_PIN=0f06836c06b2c76ab62699489e67e040a867b360  # main after #138; contains #139 (ff8733c) and #140 (4591bda)
PIN=${1:?usage: h20-iam-plan-owner-cloudshell.sh $REVIEWED_PIN}
[ "$PIN" = $REVIEWED_PIN ] || stop "PIN must be the reviewed main commit $REVIEWED_PIN"
B=munaxa-shared-tfstate-229251310592
K=bootstrap/terraform.tfstate
KMS=arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-tfstate
ACCOUNT=229251310592
D_B2R=a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd   # the bootstrap code applied by D-B2R on 18 Nov 13:37 UTC
BLOB_SESSION=aefbe51cdfbf50a76ada963c51eedd1a14dc286f   # infra/aws/bootstrap/iam_session.tf (#140)
BLOB_CLEANUP=4419ba74e14b809b113a032e2d4f940d0d1d22cf   # infra/aws/bootstrap/iam_session_cleanup.tf (#139, comment only)
BLOB_VARS=f3ea818f25207a4d0be3fd0fcfad2988e1fa3a11      # infra/aws/bootstrap/variables.tf (#139, default true)
BLOB_TESTS=60384eabec6aa87385024d1a625fbe2016e9f5b8     # infra/aws/bootstrap/tests/bootstrap.tftest.hcl (#139, #140)
# The lock object: present = stop; 404 = none; any other answer = cannot tell, stop.
lock_absent() { local o; o=$(aws s3api head-object --bucket $B --key $K.tflock 2>&1) && return 1
  grep -qE '\(404\)|Not Found' <<<"$o" && return 0; echo "$o" | head -2; stop "could not check the bootstrap lock (not a 404)"; }
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, backend, lock"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is $(jq -r .Arn <<<"$ID"), not root"; ok "caller root"
lock_absent || stop "bootstrap state lock exists"; ok "no bootstrap lock"
aws s3api head-object --bucket $B --key $K --query '{modified:LastModified,version:VersionId,sse:ServerSideEncryption}' --output text || stop "bootstrap state object not readable"

echo "== 2 Terraform 1.16.5 in a temporary work directory (CloudShell home is only 1 GB)"
[ "$(df -Pk "$HOME" | awk 'NR==2{print $4}')" -ge 51200 ] || { du -sh "$HOME"/* "$HOME"/.[!.]* 2>/dev/null | sort -h | tail -8 | sed 's/^/     /'; stop "home has less than 50 MB free: delete old files in $HOME (sizes listed above) and run again"; }
T=$(mktemp -d /tmp/munaxa-h20-iam.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
[ "$(df -Pk "$T" | awk 'NR==2{print $4}')" -ge 2097152 ] || stop "the temporary disk has less than 2 GB free"
ok "work directory $T (temporary), log and plan in $W"
cd "$T" || stop "work directory"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform || stop "unzip terraform"
export PATH=$T:$PATH TF_PLUGIN_CACHE_DIR=$T/plugin-cache TF_IN_AUTOMATION=1 TF_DATA_DIR=$T/tfdata
mkdir -p "$TF_PLUGIN_CACHE_DIR"
[ "$(command -v terraform)" = "$T/terraform" ] && [ "$(terraform version | head -1)" = "Terraform v1.16.5" ] || stop "terraform is not the checked 1.16.5 binary"; ok "Terraform v1.16.5 ($T/terraform)"

echo "== 3 pinned clone"
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
git merge-base --is-ancestor "$PIN" origin/main || stop "$PIN is not on main"
F=$(git diff --name-only "$D_B2R" HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam_session.tf infra/aws/bootstrap/iam_session_cleanup.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl infra/aws/bootstrap/variables.tf " ] || stop "bootstrap files changed since the D-B2R apply ($D_B2R) are not exactly the four reviewed ones: $F"
for fb in iam_session.tf:$BLOB_SESSION iam_session_cleanup.tf:$BLOB_CLEANUP variables.tf:$BLOB_VARS tests/bootstrap.tftest.hcl:$BLOB_TESTS; do
  [ "$(git rev-parse "HEAD:infra/aws/bootstrap/${fb%%:*}")" = "${fb##*:}" ] || stop "${fb%%:*} is not the reviewed content"
done
ok "pin $PIN on main; bootstrap changes since D-B2R: exactly the reviewed four files"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"; ok "provider lock hashicorp/aws 6.67.0"
for l in "bucket  = \"$B\"" "key     = \"$K\"" "kms_key_id   = \"$KMS\"" "use_lockfile = true"; do
  grep -qF "$l" backend.tf || stop "backend.tf does not have: $l"
done
ok "backend.tf: bucket $B, key $K, KMS alias munaxa-shared-tfstate, lock file"

echo "== 4 init, tests, state"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/init.txt" 2>&1 || { tail -20 "$W/init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/init.txt" && stop "init mentions a state migration"
[ "$(jq -r '.backend.type+" "+.backend.config.bucket+" "+.backend.config.key+" "+.backend.config.region' "$TF_DATA_DIR/terraform.tfstate")" = "s3 $B $K eu-central-1" ] || stop "the initialised backend is not s3 $B $K eu-central-1"
ok "init (no migration, lock file read-only, backend s3://$B/$K)"
terraform test -no-color > "$W/test.txt" 2>&1; R=$?; tail -1 "$W/test.txt"; [ $R = 0 ] || stop "terraform test exit $R"
grep -q ' 0 failed' "$W/test.txt" || stop "a test failed"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 70 ] || stop "bootstrap state has $C resources, expected 70 (as after the D-B2R apply)"; ok "70 resources in bootstrap state"

echo "== 5 expected policies (rendered offline from the merged code, normalized)"
cat > "$W/norm.jq" <<'JQ'
def arr: if . == null then null elif type == "array" then sort else [.] end;
def nst: {Sid, Effect, Principal, Action: (.Action|arr), NotAction: (.NotAction|arr), Resource: (.Resource|arr), NotResource: (.NotResource|arr), Condition: (if .Condition == null then null else (.Condition|map_values(map_values(arr))) end)} | with_entries(select(.value != null));
def npol: (if type == "string" then fromjson else . end) | .Statement | (if type == "array" then . else [.] end) | map(nst) | sort_by(.Sid);
JQ
cat > "$W/expected.json" <<'JSON'
{"boundary":[{"Sid":"EcrPull","Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-*"]},{"Sid":"EcrSignIn","Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":["*"]},{"Sid":"Logs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":["arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/*"]},{"Sid":"MunaxaDocsImagesPullOnly","Effect":"Deny","NotAction":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:*:*:repository/munaxa-docs/*"]},{"Sid":"NeverFromADeployerSession","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"Null":{"aws:SourceIdentity":["false"]}}},{"Sid":"NeverMunaxaDocsProduction","Effect":"Deny","Action":["*"],"Resource":["arn:aws:s3:::munaxa-docs*","arn:aws:secretsmanager:*:*:secret:munaxa-docs*"]},{"Sid":"NeverTheOtherEnvironment","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["prod"]}}},{"Sid":"OwnFileBuckets","Effect":"Allow","Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:GetObject","s3:ListBucket","s3:PutObject"],"Resource":["arn:aws:s3:::munaxa-nonprod-*","arn:aws:s3:::munaxa-nonprod-*/*"]},{"Sid":"OwnKeys","Effect":"Allow","Action":["kms:Decrypt","kms:Sign"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnRdsMasterSecret","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringLike":{"aws:ResourceTag/aws:rds:primaryDBInstanceArn":["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]}}},{"Sid":"OwnRdsMasterSecretByTag","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnSecrets","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"PassOwnRoles","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"ScheduledTasks","Effect":"Allow","Action":["ecs:RunTask"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-*:*"]},{"Sid":"TestingBackstop","Effect":"Allow","Action":["ecs:UpdateService","rds:StopDBInstance"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]},{"Sid":"TestingSessionCleanup","Effect":"Allow","Action":["ecs:DescribeServices","ecs:StopTask","elasticloadbalancing:DeleteLoadBalancer","rds:DescribeDBInstances","secretsmanager:DeleteSecret","states:StartExecution"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:ecs:eu-central-1:229251310592:task/munaxa-nonprod/*","arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*","arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap-??????","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"]},{"Sid":"TestingSessionCleanupLookups","Effect":"Allow","Action":["ecs:ListTasks","elasticloadbalancing:DescribeLoadBalancers","secretsmanager:ListSecrets"],"Resource":["*"]},{"Sid":"ThisRegionOnly","Effect":"Deny","NotAction":["iam:PassRole"],"Resource":["*"],"Condition":{"StringNotEquals":{"aws:RequestedRegion":["eu-central-1"]}}}],"cleanup":[{"Sid":"OwnAlarmTopics","Effect":"Allow","Action":["sns:CreateTopic","sns:DeleteTopic","sns:GetTopicAttributes","sns:ListTagsForResource","sns:SetTopicAttributes","sns:TagResource","sns:UntagResource"],"Resource":["arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*"]},{"Sid":"OwnSessionCleanupStateMachine","Effect":"Allow","Action":["states:CreateStateMachine","states:DeleteStateMachine","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource","states:TagResource","states:UntagResource","states:UpdateStateMachine"],"Resource":["arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]},{"Sid":"PassTheCleanupRole","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-cleanup"],"Condition":{"StringEquals":{"iam:PassedToService":["states.amazonaws.com"]}}},{"Sid":"ValidateDefinitions","Effect":"Allow","Action":["states:ValidateStateMachineDefinition"],"Resource":["*"]}],"session_read_before":[{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"RefreshSessionCleanup","Effect":"Allow","Action":["cloudwatch:ListTagsForResource","sns:GetTopicAttributes","sns:ListTagsForResource","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource"],"Resource":["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-*","arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]}],"session_read_after":[{"Sid":"GateSessionCleanup","Effect":"Allow","Action":["states:DescribeExecution","states:ListExecutions"],"Resource":["arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"]},{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"RefreshSessionCleanup","Effect":"Allow","Action":["cloudwatch:ListTagsForResource","sns:GetTopicAttributes","sns:ListTagsForResource","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource"],"Resource":["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-*","arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]}]}
JSON
J="jq -L $W"

echo "== 6 live IAM, read-only: must equal the D-B2R code (no drift)"
POL=arn:aws:iam::$ACCOUNT:policy/munaxa-shared
live() { local v; v=$(aws iam get-policy --policy-arn "$1" --query Policy.DefaultVersionId --output text) || return 1
         aws iam get-policy-version --policy-arn "$1" --version-id "$v" --query PolicyVersion.Document --output json; }
for k in munaxa-shared-workload-boundary:boundary bootstrap/munaxa-shared-deployer-nonprod-session-read:session_read_before bootstrap/munaxa-shared-deployer-nonprod-session-cleanup:cleanup; do
  p=${k%%:*}; e=${k##*:}
  live "$POL/$p" > "$W/live.json" || stop "read $p"
  [ "$($J -c 'include "norm"; npol' "$W/live.json")" = "$($J -c --arg e "$e" '.[$e]' "$W/expected.json")" ] || stop "live $p differs from the D-B2R code (drift)"
  ok "live $p equals the D-B2R code"
done
V=$(aws iam list-policy-versions --policy-arn $POL/bootstrap/munaxa-shared-deployer-nonprod-session-read --query 'length(Versions)' --output text) || stop "list the session-read policy versions"
ok "session-read policy has $V stored versions (Terraform removes the oldest non-default one at 5)"

echo "== 7 saved plan"
terraform plan -input=false -lock-timeout=60s -no-color -var testing_session_cleanup=true -out="$W/h20-iam.tfplan" > "$W/plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error|Warning' "$W/plan.txt"
[ $P = 0 ] || stop "plan exit $P"
grep -qx 'Plan: 0 to add, 1 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 0 to add, 1 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/h20-iam.tfplan" > "$W/h20-iam.plan.json" || stop "show -json"
[ "$(jq '[.resource_drift // [] | .[]] | length' "$W/h20-iam.plan.json")" = 0 ] || stop "the plan JSON lists resource drift"
ok "plan saved: $W/h20-iam.tfplan"

echo "== 8 address, action, attribute"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|"\(.address) \(.change.actions|join("+"))"' "$W/h20-iam.plan.json" > "$W/actual.txt"
printf '%s\n' 'aws_iam_policy.deployer_session_read["nonprod"] update' > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "address or action differs from the one approved update"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|[($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|join(",")' "$W/h20-iam.plan.json" > "$W/attrs.txt"
[ "$(cat "$W/attrs.txt")" = policy ] || stop "attributes other than policy change: $(cat "$W/attrs.txt")"
ok "exactly one in-place update, of the nonprod session-read policy, policy attribute only (0 replace, 0 destroy)"

echo "== 9 policy before and after against the reviewed code"
A='aws_iam_policy.deployer_session_read["nonprod"]'
for k in before:session_read_before after:session_read_after; do
  [ "$($J -c --arg a "$A" --arg p "${k%%:*}" 'include "norm"; .resource_changes[]|select(.address==$a)|.change[$p].policy|npol' "$W/h20-iam.plan.json")" = "$($J -c --arg e "${k##*:}" '.[$e]' "$W/expected.json")" ] || stop "$A ${k%%:*} differs from the reviewed code"
done
echo "-- the only difference (expected: + GateSessionCleanup, no statement changed or removed):"
$J -r --arg a "$A" 'include "norm"; .resource_changes[]|select(.address==$a)|.change as $c|($c.before.policy|npol) as $b|($c.after.policy|npol) as $f|
  ([$f[]|select(. as $s|$b|index($s)|not)|"+ \(.Sid) \(.Effect) \(.Action|join(",")) on \(.Resource|join(","))"] + [$b[]|select(. as $s|$f|index($s)|not)|"- \(.Sid)"])[]' "$W/h20-iam.plan.json" | tee "$W/delta.txt"
[ "$(cat "$W/delta.txt")" = "+ GateSessionCleanup Allow states:DescribeExecution,states:ListExecutions on arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*,arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup" ] || stop "the change is not exactly the GateSessionCleanup statement"
N=$(jq -r --arg a "$A" '.resource_changes[]|select(.address==$a)|.change.after.policy|fromjson|tojson|length' "$W/h20-iam.plan.json")
[ "$N" -le 6144 ] || stop "the policy would be $N characters (limit 6,144)"; ok "policy $N characters"

echo "== 10 plan summary (no values) and result"
jq --rawfile d "$W/delta.txt" '{terraform_version, counts: ([.resource_changes[].change.actions|join("+")]|group_by(.)|map({(.[0]): length})|add),
  changes: [.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|{address, actions: .change.actions}],
  resource_drift: ([.resource_drift // [] | .[]]|length), policy_delta: ($d|rtrimstr("\n"))}' "$W/h20-iam.plan.json" > "$W/h20-iam-plan-summary.json" || stop "plan summary"
cat "$W/h20-iam-plan-summary.json"
( cd "$W" && sha256sum h20-iam.tfplan h20-iam-plan-summary.json expected.json norm.jq )
rm -f "$W/h20-iam.plan.json" "$W/live.json"; ok "plan JSON deleted (it holds the prior state); the saved plan stays for the apply"
lock_absent || stop "bootstrap lock left behind"; ok "no bootstrap lock left"
date -u +"H-20 IAM PLAN VERIFIED, NOT APPLIED %FT%TZ"
echo "Paste $W/h20-iam-plan.log to the thread. Keep $W: the saved plan is applied only after a separate owner approval."
