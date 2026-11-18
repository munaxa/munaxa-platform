#!/usr/bin/env bash
# D-B2R (18 Nov 2026): the Testing session deployer's refresh permission for the cleanup state
# machine's versions. PLAN ONLY.
# Report: docs/aws-migration/agent-reports/2026-11-18-identity-post-d-b3-verification-next-gates/ (file 04).
#
# Why: scheduled down run 44274042137 (18 Nov 09:14 UTC) failed at "Plan the switches": the session
# role munaxa-shared-deployer-nonprod-session may not call states:ListStateMachineVersions, which the
# AWS provider calls on every refresh of aws_sfn_state_machine. The fix (PR "fix(bootstrap): let the
# Testing session deployer list the cleanup state machine's versions") adds that one read action.
#
# Run as root in AWS CloudShell, region eu-central-1 (Frankfurt), AFTER that PR is merged:
#   bash d-b2r-plan-owner-cloudshell.sh <main commit SHA that contains the fix>
#
# What it does: checks the account, caller, region and the absence of a state lock; downloads
# Terraform 1.16.5 and checks HashiCorp's SHA-256; clones munaxa-platform at the commit (detached);
# requires that commit to be on main and that, since the D-B2 apply (9752146), the bootstrap changed
# in exactly the two reviewed files with the reviewed content (git blob ids); checks the provider
# lock; `terraform init -reconfigure -lockfile=readonly`; `terraform test`; 70 resources in state;
# reads the live policies (read-only) and refuses any drift; saves a plan with
# -var testing_session_cleanup=true and checks it is exactly ONE in-place update of the session-read
# policy, adding exactly states:ListStateMachineVersions.
#
# What it never does: apply, import, state edits, any AWS write. No secret is read or printed.
set -uo pipefail
umask 077
W=$HOME/munaxa-d-b2r; mkdir -p "$W"; chmod 700 "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/d-b2r-plan.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied. Paste $W/d-b2r-plan.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: d-b2r-plan-owner-cloudshell.sh <main commit SHA>}
[[ "$PIN" =~ ^[0-9a-f]{40}$ ]] || stop "PIN must be a full 40-character commit SHA"
B=munaxa-shared-tfstate-229251310592
ACCOUNT=229251310592
D_B2=9752146f48f56972c72fd1808ce240300c2f1196   # the bootstrap code applied by D-B2 on 16 Nov
BLOB_SESSION=a38ceb2b3b0ab6418f612eb9afab5f539f8304bb  # infra/aws/bootstrap/iam_session.tf, reviewed
BLOB_TESTS=de8b636516d96cca0fd17cc293feb90131527d16    # infra/aws/bootstrap/tests/bootstrap.tftest.hcl, reviewed
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, lock"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is $(jq -r .Arn <<<"$ID"), not root"; ok "caller root"
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap state lock exists"; fi; ok "no bootstrap lock"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{modified:LastModified,version:VersionId,sse:ServerSideEncryption}' --output text || stop "bootstrap state object not readable"

echo "== 2 Terraform 1.16.5 in a temporary work directory (CloudShell home is only 1 GB)"
[ "$(df -Pk "$HOME" | awk 'NR==2{print $4}')" -ge 51200 ] || { du -sh "$HOME"/* "$HOME"/.[!.]* 2>/dev/null | sort -h | tail -8 | sed 's/^/     /'; stop "home has less than 50 MB free: delete old files in $HOME (sizes listed above) and run again"; }
T=$(mktemp -d /tmp/munaxa-d-b2r.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
[ "$(df -Pk "$T" | awk 'NR==2{print $4}')" -ge 2097152 ] || stop "the temporary disk has less than 2 GB free"
ok "work directory $T (temporary), log and plan in $W"
cd "$T" || stop "work directory"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && export PATH=$T:$PATH TF_PLUGIN_CACHE_DIR=$T/plugin-cache TF_IN_AUTOMATION=1 TF_DATA_DIR=$T/tfdata
mkdir -p "$TF_PLUGIN_CACHE_DIR"; terraform version | head -1

echo "== 3 pinned clone"
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
git merge-base --is-ancestor "$PIN" origin/main || stop "$PIN is not on main"
F=$(git diff --name-only "$D_B2" HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam_session.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl " ] || stop "bootstrap files changed since the D-B2 apply ($D_B2) are not exactly the two reviewed ones: $F"
[ "$(git rev-parse HEAD:infra/aws/bootstrap/iam_session.tf)" = $BLOB_SESSION ] || stop "iam_session.tf is not the reviewed content"
[ "$(git rev-parse HEAD:infra/aws/bootstrap/tests/bootstrap.tftest.hcl)" = $BLOB_TESTS ] || stop "bootstrap.tftest.hcl is not the reviewed content"
ok "pin $PIN on main; bootstrap changes since D-B2: exactly the reviewed two files"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"; ok "provider lock hashicorp/aws 6.67.0"

echo "== 4 init, tests, state"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/init.txt" 2>&1 || { tail -20 "$W/init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/init.txt" && stop "init mentions a state migration"
ok "init (no migration, lock file read-only)"
terraform test -no-color > "$W/test.txt" 2>&1; R=$?; tail -1 "$W/test.txt"; [ $R = 0 ] || stop "terraform test exit $R"
grep -q ' 0 failed' "$W/test.txt" || stop "a test failed"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 70 ] || stop "bootstrap state has $C resources, expected 70 (as after the D-B2 apply)"; ok "70 resources in bootstrap state"

echo "== 5 expected policies (rendered offline from the fix, normalized)"
cat > "$W/norm.jq" <<'JQ'
def arr: if . == null then null elif type == "array" then sort else [.] end;
def nst: {Sid, Effect, Principal, Action: (.Action|arr), NotAction: (.NotAction|arr), Resource: (.Resource|arr), NotResource: (.NotResource|arr), Condition: (if .Condition == null then null else (.Condition|map_values(map_values(arr))) end)} | with_entries(select(.value != null));
def npol: (if type == "string" then fromjson else . end) | .Statement | (if type == "array" then . else [.] end) | map(nst) | sort_by(.Sid);
JQ
cat > "$W/expected.json" <<'JSON'
{"boundary":[{"Sid":"EcrPull","Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-*"]},{"Sid":"EcrSignIn","Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":["*"]},{"Sid":"Logs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":["arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/*"]},{"Sid":"MunaxaDocsImagesPullOnly","Effect":"Deny","NotAction":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":["arn:aws:ecr:*:*:repository/munaxa-docs/*"]},{"Sid":"NeverFromADeployerSession","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"Null":{"aws:SourceIdentity":["false"]}}},{"Sid":"NeverMunaxaDocsProduction","Effect":"Deny","Action":["*"],"Resource":["arn:aws:s3:::munaxa-docs*","arn:aws:secretsmanager:*:*:secret:munaxa-docs*"]},{"Sid":"NeverTheOtherEnvironment","Effect":"Deny","Action":["*"],"Resource":["*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["prod"]}}},{"Sid":"OwnFileBuckets","Effect":"Allow","Action":["s3:AbortMultipartUpload","s3:DeleteObject","s3:GetObject","s3:ListBucket","s3:PutObject"],"Resource":["arn:aws:s3:::munaxa-nonprod-*","arn:aws:s3:::munaxa-nonprod-*/*"]},{"Sid":"OwnKeys","Effect":"Allow","Action":["kms:Decrypt","kms:Sign"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnRdsMasterSecret","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringLike":{"aws:ResourceTag/aws:rds:primaryDBInstanceArn":["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]}}},{"Sid":"OwnRdsMasterSecretByTag","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"OwnSecrets","Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"PassOwnRoles","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"ScheduledTasks","Effect":"Allow","Action":["ecs:RunTask"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-*:*"]},{"Sid":"TestingBackstop","Effect":"Allow","Action":["ecs:UpdateService","rds:StopDBInstance"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*"]},{"Sid":"TestingSessionCleanup","Effect":"Allow","Action":["ecs:DescribeServices","ecs:StopTask","elasticloadbalancing:DeleteLoadBalancer","rds:DescribeDBInstances","secretsmanager:DeleteSecret","states:StartExecution"],"Resource":["arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*","arn:aws:ecs:eu-central-1:229251310592:task/munaxa-nonprod/*","arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/*","arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*","arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap-??????","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"]},{"Sid":"TestingSessionCleanupLookups","Effect":"Allow","Action":["ecs:ListTasks","elasticloadbalancing:DescribeLoadBalancers","secretsmanager:ListSecrets"],"Resource":["*"]},{"Sid":"ThisRegionOnly","Effect":"Deny","NotAction":["iam:PassRole"],"Resource":["*"],"Condition":{"StringNotEquals":{"aws:RequestedRegion":["eu-central-1"]}}}],"cleanup":[{"Sid":"OwnAlarmTopics","Effect":"Allow","Action":["sns:CreateTopic","sns:DeleteTopic","sns:GetTopicAttributes","sns:ListTagsForResource","sns:SetTopicAttributes","sns:TagResource","sns:UntagResource"],"Resource":["arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*"]},{"Sid":"OwnSessionCleanupStateMachine","Effect":"Allow","Action":["states:CreateStateMachine","states:DeleteStateMachine","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource","states:TagResource","states:UntagResource","states:UpdateStateMachine"],"Resource":["arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]},{"Sid":"PassTheCleanupRole","Effect":"Allow","Action":["iam:PassRole"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-cleanup"],"Condition":{"StringEquals":{"iam:PassedToService":["states.amazonaws.com"]}}},{"Sid":"ValidateDefinitions","Effect":"Allow","Action":["states:ValidateStateMachineDefinition"],"Resource":["*"]}],"session_read_before":[{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"RefreshSessionCleanup","Effect":"Allow","Action":["cloudwatch:ListTagsForResource","sns:GetTopicAttributes","sns:ListTagsForResource","states:DescribeStateMachine","states:ListTagsForResource"],"Resource":["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-*","arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]}],"session_read_after":[{"Sid":"RefreshOwnBuckets","Effect":"Allow","Action":["s3:GetAccelerateConfiguration","s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket"],"Resource":["arn:aws:s3:::munaxa-nonprod-*"]},{"Sid":"RefreshOwnKeys","Effect":"Allow","Action":["kms:DescribeKey","kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListResourceTags"],"Resource":["arn:aws:kms:eu-central-1:229251310592:key/*"],"Condition":{"StringEquals":{"aws:ResourceTag/Environment":["nonprod"],"aws:ResourceTag/Project":["munaxa"]}}},{"Sid":"RefreshOwnRoles","Effect":"Allow","Action":["iam:GetRole","iam:GetRolePolicy","iam:ListAttachedRolePolicies","iam:ListRolePolicies","iam:ListRoleTags"],"Resource":["arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-*"]},{"Sid":"RefreshOwnSecretContainers","Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy"],"Resource":["arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/*"]},{"Sid":"RefreshSessionCleanup","Effect":"Allow","Action":["cloudwatch:ListTagsForResource","sns:GetTopicAttributes","sns:ListTagsForResource","states:DescribeStateMachine","states:ListStateMachineVersions","states:ListTagsForResource"],"Resource":["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-*","arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-*","arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-*"]}]}
JSON
J="jq -L $W"

echo "== 6 live IAM, read-only: must equal the D-B2 code (no drift)"
POL=arn:aws:iam::$ACCOUNT:policy/munaxa-shared
live() { local v; v=$(aws iam get-policy --policy-arn "$1" --query Policy.DefaultVersionId --output text) || return 1
         aws iam get-policy-version --policy-arn "$1" --version-id "$v" --query PolicyVersion.Document --output json; }
for k in munaxa-shared-workload-boundary:boundary bootstrap/munaxa-shared-deployer-nonprod-session-read:session_read_before bootstrap/munaxa-shared-deployer-nonprod-session-cleanup:cleanup; do
  p=${k%%:*}; e=${k##*:}
  live "$POL/$p" > "$W/live.json" || stop "read $p"
  [ "$($J -c 'include "norm"; npol' "$W/live.json")" = "$($J -c --arg e "$e" '.[$e]' "$W/expected.json")" ] || stop "live $p differs from the D-B2 code (drift)"
  ok "live $p equals the D-B2 code"
done
V=$(aws iam list-policy-versions --policy-arn $POL/bootstrap/munaxa-shared-deployer-nonprod-session-read --query 'length(Versions)' --output text) || stop "list the session-read policy versions"
ok "session-read policy has $V stored versions (Terraform removes the oldest non-default one at 5)"

echo "== 7 saved plan"
terraform plan -input=false -lock-timeout=60s -no-color -var testing_session_cleanup=true -out="$W/d-b2r.tfplan" > "$W/plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error|Warning' "$W/plan.txt"
[ $P = 0 ] || stop "plan exit $P"
grep -qx 'Plan: 0 to add, 1 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 0 to add, 1 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/d-b2r.tfplan" > "$W/d-b2r.plan.json" || stop "show -json"
ok "plan saved: $W/d-b2r.tfplan"

echo "== 8 address, action, attribute"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|"\(.address) \(.change.actions|join("+"))"' "$W/d-b2r.plan.json" > "$W/actual.txt"
printf '%s\n' 'aws_iam_policy.deployer_session_read["nonprod"] update' > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "address or action differs from the one approved update"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|[($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|join(",")' "$W/d-b2r.plan.json" > "$W/attrs.txt"
[ "$(cat "$W/attrs.txt")" = policy ] || stop "attributes other than policy change: $(cat "$W/attrs.txt")"
ok "exactly one in-place update, of the nonprod session-read policy, policy attribute only"

echo "== 9 policy before and after against the reviewed code"
A='aws_iam_policy.deployer_session_read["nonprod"]'
for k in before:session_read_before after:session_read_after; do
  [ "$($J -c --arg a "$A" --arg p "${k%%:*}" 'include "norm"; .resource_changes[]|select(.address==$a)|.change[$p].policy|npol' "$W/d-b2r.plan.json")" = "$($J -c --arg e "${k##*:}" '.[$e]' "$W/expected.json")" ] || stop "$A ${k%%:*} differs from the reviewed code"
done
echo "-- the only difference (expected: RefreshSessionCleanup + states:ListStateMachineVersions):"
$J -r --arg a "$A" 'include "norm"; .resource_changes[]|select(.address==$a)|.change as $c|($c.before.policy|npol) as $b|($c.after.policy|npol)[]|. as $s|($b[]|select(.Sid==$s.Sid)) as $o|select($o!=$s)|"\($s.Sid) + \(($s.Action-$o.Action)|join(",")) - \(($o.Action-$s.Action)|join(","))"' "$W/d-b2r.plan.json" | tee "$W/delta.txt"
[ "$(cat "$W/delta.txt")" = "RefreshSessionCleanup + states:ListStateMachineVersions - " ] || stop "the change is not exactly one added action"
N=$(jq -r --arg a "$A" '.resource_changes[]|select(.address==$a)|.change.after.policy|fromjson|tojson|length' "$W/d-b2r.plan.json")
[ "$N" -le 6144 ] || stop "the policy would be $N characters (limit 6,144)"; ok "policy $N characters"

echo "== 10 result"
( cd "$W" && sha256sum d-b2r.tfplan d-b2r.plan.json expected.json norm.jq )
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap lock left behind"; fi; ok "no bootstrap lock left"
date -u +"D-B2R PLAN VERIFIED, NOT APPLIED %FT%TZ"
echo "Paste $W/d-b2r-plan.log to the thread. Keep $W: the saved plan is applied only after a separate owner approval."
