#!/usr/bin/env bash
# Docs bootstrap (pack item 4, A-3): add the munaxa-docs/migrate ECR repository. PLAN ONLY.
# Report: munaxa-platform docs/aws-migration/agent-reports/2026-11-21-testing-readiness/ (file 04).
#
# Run as ROOT in AWS CloudShell, Region eu-central-1 (Frankfurt). Root, not MunaxaEngineering: the
# Docs bootstrap state is tagged Environment=Production and manages the GitHub OIDC provider,
# CloudTrail and budgets, which the permission sets refuse by design.
#   bash docs-bootstrap-migrate-plan-owner-cloudshell.sh f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad
#
# What it does:
#   - checks the account, the caller (root), the Region, the backend and that no state lock exists;
#   - downloads Terraform 1.16.5 and checks HashiCorp's SHA-256;
#   - clones munaxa-docs at exactly the reviewed main commit (detached) and requires the bootstrap to
#     differ from a04723a (the last applied bootstrap code, #141) in ecr.tf only, with the reviewed blob;
#   - checks the provider lock (hashicorp/aws 6.67.0);
#   - reads the budget alert addresses from the live budgets (read-only; never printed) so no private
#     terraform.tfvars is needed;
#   - saves a plan and requires EXACTLY: 2 create (aws_ecr_repository.images["migrate"],
#     aws_ecr_lifecycle_policy.images["migrate"]) and 3 in-place updates (aws_iam_policy.image_publisher_boundary,
#     aws_iam_policy.workload_boundary, aws_iam_role_policy.image_publisher), each changing only `policy` and
#     only by adding the migrate repository ARN; 0 destroy, 0 replace, no drift;
#   - writes a plan summary (addresses, actions, counts; no values) and prints SHA-256 values.
# Offline evidence of the same delta: supporting/docs-bootstrap-delta-offline-output.txt.
#
# What it never does: apply, -auto-approve, import, -target, state edits, or any AWS write other than
# Terraform's own lock object (bootstrap/terraform.tfstate.tflock, created and removed by `plan`).
# No secret is read. The plan JSON holds the prior state, so it is deleted after the checks.
set -uo pipefail
umask 077
W=$HOME/munaxa-docs-bootstrap; mkdir -p "$W"; chmod 700 "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/docs-bootstrap-plan.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied. Paste $W/docs-bootstrap-plan.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
REVIEWED_PIN=f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad   # munaxa-docs main, 21 Nov 2026 (#180)
PIN=${1:?usage: docs-bootstrap-migrate-plan-owner-cloudshell.sh $REVIEWED_PIN}
[ "$PIN" = $REVIEWED_PIN ] || stop "PIN must be the reviewed main commit $REVIEWED_PIN"
ACCOUNT=229251310592
B=munaxa-docs-tfstate-eu-prod-$ACCOUNT
K=bootstrap/terraform.tfstate
APPLIED=a04723a                                       # munaxa-docs #141: the bootstrap code last applied
BLOB_ECR=a4f6f1f5d02e267f25475287b08be1d60722898b     # infra/terraform/bootstrap/ecr.tf on the pin (DC-01, #176)
MIGRATE_ARN=arn:aws:ecr:eu-central-1:$ACCOUNT:repository/munaxa-docs/migrate
lock_absent() { local o; o=$(aws s3api head-object --bucket $B --key $K.tflock 2>&1) && return 1
  grep -qE '\(404\)|Not Found' <<<"$o" && return 0; echo "$o" | head -2; stop "could not check the bootstrap lock (not a 404)"; }
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, backend, lock"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is not root (this bootstrap is on the root break-glass list)"; ok "caller root"
lock_absent || stop "bootstrap state lock exists"; ok "no bootstrap lock"
aws s3api head-object --bucket $B --key $K --query '{modified:LastModified,version:VersionId}' --output text || stop "bootstrap state object not readable"

echo "== 2 Terraform 1.16.5 in a temporary work directory"
T=$(mktemp -d /tmp/munaxa-docs-bootstrap.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
[ "$(df -Pk "$T" | awk 'NR==2{print $4}')" -ge 2097152 ] || stop "the temporary disk has less than 2 GB free"
cd "$T" || stop "work directory"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform || stop "unzip terraform"
export PATH=$T:$PATH TF_PLUGIN_CACHE_DIR=$T/plugin-cache TF_IN_AUTOMATION=1 TF_DATA_DIR=$T/tfdata
mkdir -p "$TF_PLUGIN_CACHE_DIR"
[ "$(command -v terraform)" = "$T/terraform" ] && [ "$(terraform version | head -1)" = "Terraform v1.16.5" ] || stop "terraform is not the checked 1.16.5 binary"; ok "Terraform v1.16.5"

echo "== 3 pinned clone"
git clone -q https://github.com/munaxa/munaxa-docs.git && cd munaxa-docs || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
git merge-base --is-ancestor "$PIN" origin/main || stop "$PIN is not on main"
F=$(git diff --name-only "$APPLIED" HEAD -- infra/terraform/bootstrap | tr '\n' ' ')
[ "$F" = "infra/terraform/bootstrap/ecr.tf " ] || stop "bootstrap files changed since $APPLIED are not exactly ecr.tf: $F"
[ "$(git rev-parse HEAD:infra/terraform/bootstrap/ecr.tf)" = $BLOB_ECR ] || stop "ecr.tf is not the reviewed content"
ok "pin $PIN on main; bootstrap change since $APPLIED: ecr.tf only (reviewed)"
cd infra/terraform/bootstrap
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"; ok "provider lock hashicorp/aws 6.67.0"
grep -qF "bucket              = \"$B\"" backend.tf && grep -qF "key                 = \"$K\"" backend.tf || stop "backend.tf bucket/key"
ok "backend.tf: s3://$B/$K"

echo "== 4 budget alert addresses from the live budgets (read-only, not printed)"
emails() { local n all; all=$(aws budgets describe-notifications-for-budget --account-id $ACCOUNT --budget-name "$1" --output json) || return 1
  while IFS= read -r n; do
    aws budgets describe-subscribers-for-notification --account-id $ACCOUNT --budget-name "$1" --notification "$n" --output json \
      | jq -r '.Subscribers[]|select(.SubscriptionType=="EMAIL")|.Address' || return 1
  done < <(jq -c '.Notifications[]' <<<"$all") | sort -u; }
E1=$(emails munaxa-docs-eu-prod-monthly) || stop "read budget munaxa-docs-eu-prod-monthly"
E2=$(emails munaxa-account-monthly) || stop "read budget munaxa-account-monthly"
[ -n "$E1" ] && [ "$E1" = "$E2" ] || stop "the two budgets do not have the same non-empty alert addresses (send Claude this line; do not paste addresses)"
TF_VAR_budget_alert_emails=$(jq -Rnc '[inputs]' <<<"$E1"); export TF_VAR_budget_alert_emails
ok "$(jq length <<<"$TF_VAR_budget_alert_emails") alert address(es) read from the live budgets"

echo "== 5 init and saved plan"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/init.txt" 2>&1 || { tail -20 "$W/init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/init.txt" && stop "init mentions a state migration"
ok "init (no migration, lock file read-only)"
terraform plan -input=false -lock-timeout=60s -no-color -out="$W/docs-bootstrap.tfplan" > "$W/plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error' "$W/plan.txt"
[ $P = 0 ] || stop "plan exit $P"
grep -qx 'Plan: 2 to add, 3 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 2 to add, 3 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/docs-bootstrap.tfplan" > "$W/plan.json" || stop "show -json"
[ "$(jq '[.resource_drift // [] | .[]] | length' "$W/plan.json")" = 0 ] || stop "the plan JSON lists resource drift"

echo "== 6 addresses, actions, attributes, policy delta"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|"\(.address) \(.change.actions|join("+"))"' "$W/plan.json" | sort > "$W/actual.txt"
printf '%s\n' 'aws_ecr_lifecycle_policy.images["migrate"] create' 'aws_ecr_repository.images["migrate"] create' \
  'aws_iam_policy.image_publisher_boundary update' 'aws_iam_policy.workload_boundary update' 'aws_iam_role_policy.image_publisher update' | sort > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "addresses or actions differ from the reviewed delta"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|"\($r.address) " + ([($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|join(","))' "$W/plan.json" > "$W/attrs.txt"
[ "$(awk '{print $2}' "$W/attrs.txt" | sort -u)" = policy ] || stop "attributes other than policy change: $(cat "$W/attrs.txt")"
# Each policy after the change, with the migrate ARN removed, must equal the policy before it.
jq -e --arg m "$MIGRATE_ARN" '
  def arr: if type=="array" then . else [.] end;
  def norm: (if type=="string" then fromjson else . end) | .Statement | arr | map(.Resource |= (if . == null then null else (arr|sort) end));
  def strip: map(.Resource |= (if . == null then null else map(select(. != $m)) end));
  [.resource_changes[]|select(.change.actions==["update"])|
    ((.change.before.policy|norm) == (.change.after.policy|norm|strip)) and
    ([.change.after.policy|norm|.[].Resource // []|.[]|select(. == $m)]|length) == 1 ] | all' "$W/plan.json" >/dev/null \
  || stop "a policy change is not exactly the addition of $MIGRATE_ARN"
jq -e '[.resource_changes[]|select(.address=="aws_ecr_repository.images[\"migrate\"]")|.change.after|
   (.name=="munaxa-docs/migrate" and .image_tag_mutability=="IMMUTABLE" and .image_scanning_configuration[0].scan_on_push==true)]|all' "$W/plan.json" >/dev/null \
  || stop "the new repository is not munaxa-docs/migrate, IMMUTABLE, scan on push"
ok "2 create + 3 policy updates, each only adding $MIGRATE_ARN; repository IMMUTABLE with scan on push"

echo "== 7 plan summary (no values) and result"
jq '{terraform_version, counts: ([.resource_changes[].change.actions|join("+")]|group_by(.)|map({(.[0]): length})|add),
  changes: [.resource_changes[]|select(.change.actions!=["no-op"] and .change.actions!=["read"])|{address, actions: .change.actions}]}' \
  "$W/plan.json" > "$W/docs-bootstrap-plan-summary.json" || stop "plan summary"
cat "$W/docs-bootstrap-plan-summary.json"
( cd "$W" && sha256sum docs-bootstrap.tfplan docs-bootstrap-plan-summary.json )
rm -f "$W/plan.json"; ok "plan JSON deleted (it holds the prior state); the saved plan stays for the apply"
lock_absent || stop "bootstrap lock left behind"; ok "no bootstrap lock left"
echo "$T" > "$W/workdir.txt"
date -u +"DOCS BOOTSTRAP PLAN VERIFIED, NOT APPLIED %FT%TZ"
echo "Paste $W/docs-bootstrap-plan.log to the thread. Apply only after a separate owner yes:"
echo "  cd $T/munaxa-docs/infra/terraform/bootstrap && PATH=$T:\$PATH TF_DATA_DIR=$T/tfdata terraform apply -input=false $W/docs-bootstrap.tfplan"
echo "(same CloudShell tab, while this temporary directory still exists; afterwards: rm $W/docs-bootstrap.tfplan)"
