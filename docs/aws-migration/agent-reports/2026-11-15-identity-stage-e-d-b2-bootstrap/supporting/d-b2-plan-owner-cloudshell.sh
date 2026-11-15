#!/usr/bin/env bash
# D-B2 (owner decision, 15 Nov 2026): bootstrap cleanup permissions, PLAN ONLY.
# Report: docs/aws-migration/agent-reports/2026-11-15-identity-stage-e-d-b2-bootstrap/ (file 02).
#
# Run as root in AWS CloudShell, region eu-central-1 (Frankfurt):
#   bash d-b2-plan-owner-cloudshell.sh 9752146f48f56972c72fd1808ce240300c2f1196
#
# What it does: checks the account, caller, region and the absence of a state lock; downloads
# Terraform 1.16.5 and checks HashiCorp's published SHA-256; clones munaxa-platform at the pin
# (detached); checks the provider lock hash; `terraform init -reconfigure -lockfile=readonly`
# (refuses any state migration); `terraform test`; reads the live IAM policies it will compare
# (read-only); saves a plan with -var testing_session_cleanup=true; and checks that plan against
# exactly the four approved changes and the reviewed policy statements.
#
# What it never does: apply, import, state edits, any AWS write. There is no apply command in this
# file. The saved plan stays in $HOME/munaxa-d-b2 (mode 700) for the separate, owner-approved apply.
# It prints no secret, credential or state content: only addresses, actions, policy statements
# (IAM permissions, no values) and checksums. Every check is a hard stop.
set -uo pipefail
umask 077
W=$HOME/munaxa-d-b2; mkdir -p "$W"; chmod 700 "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/d-b2-plan.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied. Paste $W/d-b2-plan.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: d-b2-plan-owner-cloudshell.sh <main commit SHA>}
[ "$PIN" = 9752146f48f56972c72fd1808ce240300c2f1196 ] || stop "PIN is not the reviewed main commit 9752146f48f56972c72fd1808ce240300c2f1196"
B=munaxa-shared-tfstate-229251310592
ACCOUNT=229251310592
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, lock"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is $(jq -r .Arn <<<"$ID"), not root"; ok "caller root"
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap state lock exists"; fi; ok "no bootstrap lock"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{modified:LastModified,version:VersionId,sse:ServerSideEncryption}' --output text || stop "bootstrap state object not readable"

echo "== 2 Terraform 1.16.5"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && export PATH=$W:$PATH TF_PLUGIN_CACHE_DIR=$W/plugin-cache TF_IN_AUTOMATION=1
mkdir -p "$TF_PLUGIN_CACHE_DIR"; terraform version | head -1

echo "== 3 pinned clone"
rm -rf munaxa-platform && git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
F=$(git diff --name-only 9e45133dd419c03beb8f51f3ec8ee1559dca9f0a HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam.tf infra/aws/bootstrap/iam_session.tf infra/aws/bootstrap/iam_session_cleanup.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl infra/aws/bootstrap/variables.tf " ] || stop "bootstrap files changed since the last apply (9e45133) differ: $F"
ok "pin $PIN; bootstrap changes since the last apply 9e45133: $F"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"; ok "provider lock hashicorp/aws 6.67.0"

echo "== 4 init, tests, state"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/init.txt" 2>&1 || { tail -20 "$W/init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/init.txt" && stop "init mentions a state migration"
ok "init (no migration, lock file read-only)"
terraform test -no-color > "$W/test.txt" 2>&1; T=$?; tail -1 "$W/test.txt"; [ $T = 0 ] || stop "terraform test exit $T"
grep -q ' 0 failed' "$W/test.txt" || stop "a test failed"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 68 ] || stop "bootstrap state has $C resources, expected 68 (as after the 6 Nov apply)"; ok "68 resources in bootstrap state"

echo "== 5 live IAM, read-only"
POL=arn:aws:iam::$ACCOUNT:policy/munaxa-shared
live() { local v; v=$(aws iam get-policy --policy-arn "$1" --query Policy.DefaultVersionId --output text) || return 1
         aws iam get-policy-version --policy-arn "$1" --version-id "$v" --query PolicyVersion.Document --output json; }
live $POL/munaxa-shared-workload-boundary > "$W/live-boundary.json" || stop "read the nonprod boundary"
live $POL/bootstrap/munaxa-shared-deployer-nonprod-session-read > "$W/live-session-read.json" || stop "read the session-read policy"
if aws iam get-policy --policy-arn $POL/bootstrap/munaxa-shared-deployer-nonprod-session-cleanup >/dev/null 2>&1; then stop "the cleanup policy already exists in AWS (import needed, not a create)"; fi
ok "the cleanup policy does not exist yet"
N=$(aws iam list-attached-role-policies --role-name munaxa-shared-deployer-nonprod --query 'length(AttachedPolicies)' --output text) || stop "list the deployer's policies"
[ "$N" -lt 10 ] || stop "the nonprod deployer already has $N managed policies (quota 10)"; ok "nonprod deployer has $N managed policies, one more fits"

echo "== 6 expected policies (rendered from $PIN offline, normalized)"
cat > "$W/norm.jq" <<'JQ'
def arr: if . == null then null elif type == "array" then sort else [.] end;
def nst: {Sid, Effect, Principal, Action: (.Action|arr), NotAction: (.NotAction|arr), Resource: (.Resource|arr), NotResource: (.NotResource|arr), Condition: (if .Condition == null then null else (.Condition|map_values(map_values(arr))) end)} | with_entries(select(.value != null));
def npol: (if type == "string" then fromjson else . end) | .Statement | (if type == "array" then . else [.] end) | map(nst) | sort_by(.Sid);
JQ
cat > "$W/expected.json" <<'JSON'
{"boundary_before":[{"Sid":"EcrPull","Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-*"]},{"Sid":"EcrSignIn","Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":["*"]},{"Sid":"Logs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":["arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/*"]},{"Sid":"MunaxaDocsImagesPullOnly","Effect":"Deny","NotAction":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:*:*:repository/munaxa-docs/*"]},{"Sid":"NeverFromADeployerSession","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"Null":{"aws:SourceIdentity":["false"]}}},{"Sid":"NeverMunaxaDocsProduction","Effect":"Deny","Action":["*"],"Resource":["arn:aws:s3:::munaxa-docs*","arn:aws:secretsmanager:*:*:secret:munaxa-docs*"]},{"Sid":"NeverTheOtherEnvironment","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["prod"]}}},{"Sid":"OwnFileBuckets","Effect":"Allow","Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:GetObject","s3:ListBucket","s3:PutObject"],"Resource":["arn:aws:s3:::munaxa-nonprod-*","arn:aws:s3:::munaxa-nonprod-*/*"]},{"Sid":"OwnKeys","Effect":"Allow","Action":["kms:Decrypt","kms:Sign"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnRdsMasterSecret","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringLike":{"aws:ResourceTag/aws:rds:primaryDBInstanceArn":["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]}}},{"Sid":"OwnRdsMasterSecretByTag","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnSecrets","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"PassOwnRoles","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"ScheduledTasks","Effect":"Allow","Action":["ecs:RunTask"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-*:*"]},{"Sid":"TestingBackstop","Effect":"Allow","Action":["ecs:UpdateService","rds:StopDBInstance"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]},{"Sid":"ThisRegionOnly","Effect":"Deny","NotAction":["iam:PassRole"],"Resource":["*"],"Condition":{"StringNotEquals":{"aws:RequestedRegion":["eu-central-1"]}}}],"boundary_after":[{"Sid":"EcrPull","Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-*"]},{"Sid":"EcrSignIn","Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":["*"]},{"Sid":"Logs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":["arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/*"]},{"Sid":"MunaxaDocsImagesPullOnly","Effect":"Deny","NotAction":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:*:*:repository/munaxa-docs/*"]},{"Sid":"NeverFromADeployerSession","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"Null":{"aws:SourceIdentity":["false"]}}},{"Sid":"NeverMunaxaDocsProduction","Effect":"Deny","Action":["*"],"Resource":["arn:aws:s3:::munaxa-docs*","arn:aws:secretsmanager:*:*:secret:munaxa-docs*"]},{"Sid":"NeverTheOtherEnvironment","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["prod"]}}},{"Sid":"OwnFileBuckets","Effect":"Allow","Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:GetObject","s3:ListBucket","s3:PutObject"],"Resource":["arn:aws:s3:::munaxa-nonprod-*","arn:aws:s3:::munaxa-nonprod-*/*"]},{"Sid":"OwnKeys","Effect":"Allow","Action":["kms:Decrypt","kms:Sign"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnRdsMasterSecret","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringLike":{"aws:ResourceTag/aws:rds:primaryDBInstanceArn":["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]}}},{"Sid":"OwnRdsMasterSecretByTag","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnSecrets","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"PassOwnRoles","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"ScheduledTasks","Effect":"Allow","Action":["ecs:RunTask"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-*:*"]},{"Sid":"TestingBackstop","Effect":"Allow","Action":["ecs:UpdateService","rds:StopDBInstance"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]},{"Sid":"TestingSessionCleanup","Effect":"Allow","Action":["ecs:DescribeServices","ecs:StopTask","elasticloadbalancing:DeleteLoadBalancer","rds:DescribeDBInstances","secretsmanager:DeleteSecret","states:StartExecution"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:ecs:eu-central-1:229251310592:task/munaxa-nonprod/*","arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*","arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap-??????","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"]},{"Sid":"TestingSessionCleanupLookups","Effect":"Allow","Action":["ecs:ListTasks","elasticloadbalancing:DescribeLoadBalancers","secretsmanager:ListSecrets"],"Resource":["*"]},{"Sid":"ThisRegionOnly","Effect":"Deny","NotAction":["iam:PassRole"],"Resource":["*"],"Condition":{"StringNotEquals":{"aws:RequestedRegion":["eu-central-1"]}}}],"session_read_before":[{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]}],"session_read_after":[{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"RefreshSessionCleanup","Effect":"Allow","Action":["cloudwatch:ListTagsForResource","sns:GetTopicAttributes","sns:ListTagsForResource","states:DescribeStateMachine","states:ListTagsForResource"],"Resource":["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-*","arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]}],"cleanup_after":[{"Sid":"OwnAlarmTopics","Effect":"Allow","Action":["sns:CreateTopic","sns:DeleteTopic","sns:GetTopicAttributes","sns:ListTagsForResource","sns:SetTopicAttributes","sns:TagResource","sns:UntagResource"],"Resource":["arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*"]},{"Sid":"OwnSessionCleanupStateMachine","Effect":"Allow","Action":["states:CreateStateMachine","states:DeleteStateMachine","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource","states:TagResource","states:UntagResource","states:UpdateStateMachine"],"Resource":["arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]},{"Sid":"PassTheCleanupRole","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-cleanup"],"Condition":{"StringEquals":{"iam:PassedToService":["states.amazonaws.com"]}}},{"Sid":"ValidateDefinitions","Effect":"Allow","Action":["states:ValidateStateMachineDefinition"],"Resource":["*"]}]}

JSON
J="jq -L $W"
for k in live-boundary:boundary_before live-session-read:session_read_before; do
  f=${k%%:*}; e=${k##*:}
  [ "$($J -c 'include "norm"; npol' "$W/$f.json")" = "$($J -c --arg e "$e" '.[$e]' "$W/expected.json")" ] || stop "live $f differs from the code at the last apply (drift)"
done
ok "live boundary and session-read policies equal the code (no drift)"

echo "== 7 saved plan"
terraform plan -input=false -lock-timeout=60s -no-color -var testing_session_cleanup=true -out="$W/d-b2.tfplan" > "$W/plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error|Warning' "$W/plan.txt"
[ $P = 0 ] || stop "plan exit $P"
grep -qx 'Plan: 2 to add, 2 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 2 to add, 2 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/d-b2.tfplan" > "$W/d-b2.plan.json" || stop "show -json"
ok "plan saved: $W/d-b2.tfplan, JSON $W/d-b2.plan.json"

echo "== 8 addresses and actions"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|"\(.address) \(.change.actions|join("+"))"' "$W/d-b2.plan.json" | LC_ALL=C sort > "$W/actual.txt"
printf '%s\n' 'aws_iam_policy.deployer_session_cleanup[0] create' 'aws_iam_policy.deployer_session_read["nonprod"] update' \
  'aws_iam_policy.workload_boundary["nonprod"] update' 'aws_iam_role_policy_attachment.deployer_session_cleanup[0] create' > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "addresses or actions differ from the approved four"
grep -q prod "$W/actual.txt" && grep -v nonprod "$W/actual.txt" | grep -q prod && stop "a prod address is in the plan"
[ "$(jq '[.resource_changes[]|select(.change.actions|index("delete"))]|length' "$W/d-b2.plan.json")" = 0 ] || stop "a delete or replacement"
[ "$(jq '.output_changes // {} | [to_entries[]|select(.value.actions!=["no-op"])]|length' "$W/d-b2.plan.json")" = 0 ] || echo "note: output changes (listed in plan.txt)"
ok "exactly the 4 approved changes: 2 creates, 2 in-place updates, 0 deletes, 0 replacements, no prod address"

echo "== 9 updates change only the policy attribute"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|[($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|"\($r.address): \(join(","))"' "$W/d-b2.plan.json" | tee "$W/attrs.txt"
[ "$(grep -vc ': policy$' "$W/attrs.txt")" = 0 ] || stop "an attribute other than policy changes"
ok "only policy changes"

echo "== 10 policy statements against the reviewed code"
chk() { # address, part (before|after), expected key
  [ "$($J -c --arg a "$1" --arg p "$2" 'include "norm"; .resource_changes[]|select(.address==$a)|.change[$p].policy|npol' "$W/d-b2.plan.json")" = "$($J -c --arg e "$3" '.[$e]' "$W/expected.json")" ] || stop "$1 $2 policy differs from the reviewed code"; }
chk 'aws_iam_policy.workload_boundary["nonprod"]' before boundary_before
chk 'aws_iam_policy.workload_boundary["nonprod"]' after boundary_after
chk 'aws_iam_policy.deployer_session_read["nonprod"]' before session_read_before
chk 'aws_iam_policy.deployer_session_read["nonprod"]' after session_read_after
chk 'aws_iam_policy.deployer_session_cleanup[0]' after cleanup_after
ok "every statement before and after equals the reviewed code"
echo "-- statements added (exactly these, nothing removed or changed):"
$J -r 'include "norm"; .resource_changes[]|select(.change.actions==["update"])|.address as $a|(.change.before.policy|npol|map(.Sid)) as $b|(.change.after.policy|npol)|map(select(.Sid as $s|$b|index($s)|not))[]|"\($a) + \(.Sid): \(tojson)"' "$W/d-b2.plan.json"
echo "-- new policy munaxa-shared-deployer-nonprod-session-cleanup:"
$J -r 'include "norm"; .resource_changes[]|select(.address=="aws_iam_policy.deployer_session_cleanup[0]")|.change.after|"name \(.name) path \(.path)", (.policy|npol[]|tojson)' "$W/d-b2.plan.json"
jq -r '.resource_changes[]|select(.address=="aws_iam_role_policy_attachment.deployer_session_cleanup[0]")|"attachment role \(.change.after.role)"' "$W/d-b2.plan.json"
[ "$(jq -r '.resource_changes[]|select(.address=="aws_iam_role_policy_attachment.deployer_session_cleanup[0]")|.change.after.role' "$W/d-b2.plan.json")" = munaxa-shared-deployer-nonprod ] || stop "the attachment is not on the nonprod deployer"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"] and .change.after.policy!=null)|"\(.address) policy \(.change.after.policy|fromjson|tojson|length) characters"' "$W/d-b2.plan.json" | tee "$W/sizes.txt"
awk '{ if ($(NF-1)+0 > 6144) exit 1 }' "$W/sizes.txt" || stop "a managed policy would exceed 6,144 characters"

echo "== 11 result"
( cd "$W" && sha256sum d-b2.tfplan d-b2.plan.json )
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap lock left behind"; fi; ok "no bootstrap lock left"
date -u +"D-B2 PLAN VERIFIED, NOT APPLIED %FT%TZ"
echo "Paste $W/d-b2-plan.log to the thread. Keep $W: the saved plan is applied only after a separate owner approval."
