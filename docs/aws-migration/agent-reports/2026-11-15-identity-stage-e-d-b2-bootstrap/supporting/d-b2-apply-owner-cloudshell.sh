#!/usr/bin/env bash
# D-B2 (owner decision, 15 Nov 2026): APPLY the reviewed saved plan, then verify.
# Report: docs/aws-migration/agent-reports/2026-11-15-identity-stage-e-d-b2-bootstrap/ (files 03, 06).
#
# Run ONLY after the owner has approved the apply of the reviewed plan, as root in AWS CloudShell
# (eu-central-1), in the same CloudShell where the plan script saved ~/munaxa-d-b2/d-b2.tfplan:
#   bash d-b2-apply-owner-cloudshell.sh 9752146f48f56972c72fd1808ce240300c2f1196 c02a40aee93afc0e24b6dd131319d1d6e13d1e074f8b1a8f0777054b98fa8163
#
# What it does: the same identity, region and lock checks as the plan script; refuses unless the
# saved plan file's SHA-256 equals the reviewed one (owner run 16 Nov 08:24 UTC); re-creates the
# pinned working copy (Terraform 1.16.5 checksum, pinned clone, provider lock, init with the lock file
# read-only, no migration); applies THAT saved plan file only (Terraform refuses a stale plan if the
# state changed since); then a fresh plan with -var testing_session_cleanup=true and
# -detailed-exitcode must report no changes, and the live IAM policies and attachment must equal
# the reviewed code.
#
# What it never does: plan-and-apply in one step, -auto-approve, -target, import, state edits, any
# other AWS write. No secret is read or printed.
set -uo pipefail
umask 077
W=$HOME/munaxa-d-b2; cd "$W" || { echo "STOP: $W missing (the saved plan is in it)"; exit 1; }
exec > >(tee -a "$W/d-b2-apply.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Paste $W/d-b2-apply.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: d-b2-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
PLAN_SHA=${2:?usage: d-b2-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
[ "$PIN" = 9752146f48f56972c72fd1808ce240300c2f1196 ] || stop "PIN is not the reviewed main commit"
[ "$PLAN_SHA" = c02a40aee93afc0e24b6dd131319d1d6e13d1e074f8b1a8f0777054b98fa8163 ] || stop "plan SHA-256 is not the reviewed one"
B=munaxa-shared-tfstate-229251310592
ACCOUNT=229251310592
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, lock, saved plan"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is not root"; ok "caller root"
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap state lock exists"; fi; ok "no bootstrap lock"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{modified:LastModified,version:VersionId,sse:ServerSideEncryption}' --output text || stop "bootstrap state object not readable"
[ -f "$W/d-b2.tfplan" ] || stop "saved plan $W/d-b2.tfplan is missing"
echo "$PLAN_SHA  $W/d-b2.tfplan" | sha256sum -c - || stop "the saved plan is not the reviewed one"
echo "b1b1048e1cadc6f29e73b5697a8dacf24813909461037621b9c95af9d8a7e3b8  $W/expected.json" | sha256sum -c - || stop "expected.json differs from the plan script's"
echo "c8d3aacd529bd3965d8622ea1aea0959f8a5d84ee7518fa5ae0600e1064ca9f3  $W/norm.jq" | sha256sum -c - || stop "norm.jq differs from the plan script's"
ok "saved plan, expected policies and normalizer are the reviewed ones"

echo "== 2 Terraform 1.16.5 in a temporary work directory"
[ "$(df -Pk "$HOME" | awk 'NR==2{print $4}')" -ge 51200 ] || stop "home has less than 50 MB free"
T=$(mktemp -d /tmp/munaxa-d-b2-apply.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
[ "$(df -Pk "$T" | awk 'NR==2{print $4}')" -ge 2097152 ] || stop "the temporary disk has less than 2 GB free"
cd "$T" || stop "work directory"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && export PATH=$T:$PATH TF_PLUGIN_CACHE_DIR=$T/plugin-cache TF_IN_AUTOMATION=1 TF_DATA_DIR=$T/tfdata
mkdir -p "$TF_PLUGIN_CACHE_DIR"; terraform version | head -1

echo "== 3 pinned clone and init"
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/apply-init.txt" 2>&1 || { tail -20 "$W/apply-init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/apply-init.txt" && stop "init mentions a state migration"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 68 ] || stop "bootstrap state has $C resources, expected 68 before the apply"
ok "pin $PIN, provider 6.67.0, init without migration, 68 resources"

echo "== 4 apply the reviewed saved plan (and nothing else)"
terraform apply -input=false -lock-timeout=60s -no-color "$W/d-b2.tfplan" > "$W/apply.txt" 2>&1; A=$?
grep -E 'Creating|Modifying|Creation complete|Modifications complete|Apply complete|Error|stale' "$W/apply.txt"
[ $A = 0 ] || stop "apply exit $A (see $W/apply.txt); do not retry, Claude reviews first"
grep -qx 'Apply complete! Resources: 2 added, 2 changed, 0 destroyed.' "$W/apply.txt" || stop "apply summary is not 2 added, 2 changed, 0 destroyed"
date -u +"OK   applied %FT%TZ"

echo "== 5 post-apply plan with the flag: must be no changes"
terraform plan -input=false -lock-timeout=60s -no-color -detailed-exitcode -var testing_session_cleanup=true > "$W/post-apply-plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error' "$W/post-apply-plan.txt"
[ $P = 0 ] || stop "post-apply plan exit $P (0 = no changes expected)"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 70 ] || stop "bootstrap state has $C resources, expected 70"
ok "post-apply plan: no changes; 70 resources in state"

echo "== 6 live IAM equals the reviewed code (read-only)"
POL=arn:aws:iam::$ACCOUNT:policy/munaxa-shared
live() { local v; v=$(aws iam get-policy --policy-arn "$1" --query Policy.DefaultVersionId --output text) || return 1
         aws iam get-policy-version --policy-arn "$1" --version-id "$v" --query PolicyVersion.Document --output json; }
J="jq -L $W"
for k in munaxa-shared-workload-boundary:boundary_after bootstrap/munaxa-shared-deployer-nonprod-session-read:session_read_after bootstrap/munaxa-shared-deployer-nonprod-session-cleanup:cleanup_after; do
  p=${k%%:*}; e=${k##*:}
  live "$POL/$p" > "$W/post-live.json" || stop "read $p"
  [ "$($J -c 'include "norm"; npol' "$W/post-live.json")" = "$($J -c --arg e "$e" '.[$e]' "$W/expected.json")" ] || stop "live $p differs from the reviewed code"
  ok "live $p equals the reviewed code"
done
aws iam list-attached-role-policies --role-name munaxa-shared-deployer-nonprod --query 'AttachedPolicies[].PolicyName' --output text | tr '\t' '\n' | sort | tee "$W/post-attached.txt"
grep -qx munaxa-shared-deployer-nonprod-session-cleanup "$W/post-attached.txt" || stop "the cleanup policy is not attached to the nonprod deployer"
ok "cleanup policy attached to munaxa-shared-deployer-nonprod ($(wc -l < "$W/post-attached.txt") managed policies)"

echo "== 7 result"
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap lock left behind"; fi; ok "no bootstrap lock left"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{modified:LastModified,version:VersionId}' --output text
date -u +"D-B2 APPLIED AND VERIFIED %FT%TZ"
echo "Paste $W/d-b2-apply.log to the thread."
