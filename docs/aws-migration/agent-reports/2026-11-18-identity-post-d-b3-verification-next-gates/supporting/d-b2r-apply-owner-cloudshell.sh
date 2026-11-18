#!/usr/bin/env bash
# D-B2R (18 Nov 2026): APPLY the reviewed saved plan (one session-read policy update), then verify.
# Report: docs/aws-migration/agent-reports/2026-11-18-identity-post-d-b3-verification-next-gates/ (file 04).
#
# Run ONLY after Claude has reviewed the plan log of d-b2r-plan-owner-cloudshell.sh AND the owner
# has approved the apply, as root in AWS CloudShell (eu-central-1), in the same CloudShell where the
# plan script saved ~/munaxa-d-b2r/d-b2r.tfplan:
#   bash d-b2r-apply-owner-cloudshell.sh <same main commit SHA> <saved plan SHA-256 that Claude reviewed>
#
# What it does: the same identity, region and lock checks as the plan script; refuses unless the
# saved plan's SHA-256 equals the reviewed one given on the command line; re-creates the pinned
# working copy (Terraform 1.16.5 checksum, pinned clone, provider lock, init with the lock file
# read-only, no migration); applies THAT saved plan file only (Terraform refuses a stale plan if the
# state changed since); then a fresh plan with -var testing_session_cleanup=true and
# -detailed-exitcode must report no changes, and the live policies must equal the reviewed code.
#
# What it never does: plan-and-apply in one step, -auto-approve, -target, import, state edits, any
# other AWS write. No secret is read or printed.
set -uo pipefail
umask 077
W=$HOME/munaxa-d-b2r; cd "$W" || { echo "STOP: $W missing (the saved plan is in it)"; exit 1; }
exec > >(tee -a "$W/d-b2r-apply.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Paste $W/d-b2r-apply.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: d-b2r-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
PLAN_SHA=${2:?usage: d-b2r-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
[[ "$PIN" =~ ^[0-9a-f]{40}$ ]] || stop "PIN must be a full 40-character commit SHA"
[[ "$PLAN_SHA" =~ ^[0-9a-f]{64}$ ]] || stop "the plan SHA-256 must be 64 hex characters"
# Only the LAST plan run counts (the log is appended to on every run; review L-2).
LAST=$(awk '/^start [0-9]{4}-/{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' "$W/d-b2r-plan.log" 2>/dev/null)
grep -q "^OK   pin $PIN on main" <<<"$LAST" || stop "the last plan run does not show a verified plan at $PIN"
grep -q '^D-B2R PLAN VERIFIED, NOT APPLIED' <<<"$LAST" || stop "the last plan run did not finish with PLAN VERIFIED"
grep -q '^STOP: ' <<<"$LAST" && stop "the last plan run has a STOP line"
B=munaxa-shared-tfstate-229251310592
ACCOUNT=229251310592
# The lock object: present = stop; 404 = none; any other answer = cannot tell, stop (review L-5).
lock_absent() { local o; o=$(aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock 2>&1) && return 1
  grep -qE '\(404\)|Not Found' <<<"$o" && return 0; echo "$o" | head -2; stop "could not check the bootstrap lock (not a 404)"; }
date -u +"start %FT%TZ"

echo "== 1 account, caller, region, lock, saved plan"
[ "${AWS_REGION:-unset}" = eu-central-1 ] || stop "CloudShell region is ${AWS_REGION:-unset}: open CloudShell in eu-central-1 (Frankfurt)"
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1; ok "region eu-central-1"
ID=$(aws sts get-caller-identity --output json) || stop "get-caller-identity failed"
[ "$(jq -r .Account <<<"$ID")" = $ACCOUNT ] || stop "account is $(jq -r .Account <<<"$ID")"; ok "account $ACCOUNT"
[ "$(jq -r .Arn <<<"$ID")" = "arn:aws:iam::$ACCOUNT:root" ] || stop "caller is not root"; ok "caller root"
lock_absent || stop "bootstrap state lock exists"; ok "no bootstrap lock"
[ -f "$W/d-b2r.tfplan" ] || stop "saved plan $W/d-b2r.tfplan is missing"
echo "$PLAN_SHA  $W/d-b2r.tfplan" | sha256sum -c - || stop "the saved plan is not the reviewed one"
echo "0f0dbb24726881de4aa932885ff9f33f034b51bf260745c06930dae652eafed2  $W/expected.json" | sha256sum -c - || stop "expected.json differs from the plan script's"
echo "c8d3aacd529bd3965d8622ea1aea0959f8a5d84ee7518fa5ae0600e1064ca9f3  $W/norm.jq" | sha256sum -c - || stop "norm.jq differs from the plan script's"
ok "saved plan, expected policies and normalizer are the reviewed ones"

echo "== 2 Terraform 1.16.5 in a temporary work directory"
[ "$(df -Pk "$HOME" | awk 'NR==2{print $4}')" -ge 51200 ] || stop "home has less than 50 MB free"
T=$(mktemp -d /tmp/munaxa-d-b2r-apply.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
[ "$(df -Pk "$T" | awk 'NR==2{print $4}')" -ge 2097152 ] || stop "the temporary disk has less than 2 GB free"
cd "$T" || stop "work directory"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform || stop "unzip terraform"
export PATH=$T:$PATH TF_PLUGIN_CACHE_DIR=$T/plugin-cache TF_IN_AUTOMATION=1 TF_DATA_DIR=$T/tfdata
mkdir -p "$TF_PLUGIN_CACHE_DIR"
[ "$(command -v terraform)" = "$T/terraform" ] && [ "$(terraform version | head -1)" = "Terraform v1.16.5" ] || stop "terraform is not the checked 1.16.5 binary"; ok "Terraform v1.16.5 ($T/terraform)"

echo "== 3 pinned clone and init"
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach "$PIN" && [ "$(git rev-parse HEAD)" = "$PIN" ] || stop "HEAD is not $PIN"
git merge-base --is-ancestor "$PIN" origin/main || stop "$PIN is not on main"
F=$(git diff --name-only 9752146f48f56972c72fd1808ce240300c2f1196 HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam_session.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl " ] || stop "bootstrap files changed since the D-B2 apply are not exactly the two reviewed ones: $F"
[ "$(git rev-parse HEAD:infra/aws/bootstrap/iam_session.tf)" = a38ceb2b3b0ab6418f612eb9afab5f539f8304bb ] || stop "iam_session.tf is not the reviewed content"
[ "$(git rev-parse HEAD:infra/aws/bootstrap/tests/bootstrap.tftest.hcl)" = de8b636516d96cca0fd17cc293feb90131527d16 ] || stop "bootstrap.tftest.hcl is not the reviewed content"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/apply-init.txt" 2>&1 || { tail -20 "$W/apply-init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/apply-init.txt" && stop "init mentions a state migration"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 70 ] || stop "bootstrap state has $C resources, expected 70"
ok "pin $PIN, provider 6.67.0, init without migration, 70 resources"

echo "== 4 apply the reviewed saved plan (and nothing else)"
terraform apply -input=false -lock-timeout=60s -no-color "$W/d-b2r.tfplan" > "$W/apply.txt" 2>&1; A=$?
grep -E 'Modifying|Modifications complete|Apply complete|Error|stale' "$W/apply.txt"
[ $A = 0 ] || stop "apply exit $A (see $W/apply.txt); do not retry, Claude reviews first"
grep -qx 'Apply complete! Resources: 0 added, 1 changed, 0 destroyed.' "$W/apply.txt" || stop "apply summary is not 0 added, 1 changed, 0 destroyed"
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
for k in munaxa-shared-workload-boundary:boundary bootstrap/munaxa-shared-deployer-nonprod-session-read:session_read_after bootstrap/munaxa-shared-deployer-nonprod-session-cleanup:cleanup; do
  p=${k%%:*}; e=${k##*:}
  live "$POL/$p" > "$W/post-live.json" || stop "read $p"
  [ "$($J -c 'include "norm"; npol' "$W/post-live.json")" = "$($J -c --arg e "$e" '.[$e]' "$W/expected.json")" ] || stop "live $p differs from the reviewed code"
  ok "live $p equals the reviewed code"
done

echo "== 7 result"
lock_absent || stop "bootstrap lock left behind"; ok "no bootstrap lock left"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{modified:LastModified,version:VersionId}' --output text
rm -f "$W/d-b2r.tfplan" "$W/post-live.json"; ok "saved plan deleted (it holds the prior state); logs kept in $W"
date -u +"D-B2R APPLIED AND VERIFIED %FT%TZ"
echo "Paste $W/d-b2r-apply.log to the thread. The next scheduled Testing down shows whether the switch plan passes."
