#!/usr/bin/env bash
# H-20 IAM (19 Nov 2026): APPLY the reviewed saved plan (one session-read policy update), then verify.
# Report: docs/aws-migration/agent-reports/2026-11-19-identity-h20-iam-bootstrap-plan/ (files 03 and 04).
#
# NOT AUTHORIZED YET. Run ONLY after Claude has reviewed the log of h20-iam-plan-owner-cloudshell.sh
# AND the owner has separately approved this apply. Run as root in AWS CloudShell (eu-central-1), in the
# same CloudShell where the plan script saved ~/munaxa-h20-iam/h20-iam.tfplan:
#   bash h20-iam-apply-owner-cloudshell.sh 0f06836c06b2c76ab62699489e67e040a867b360 <saved plan SHA-256 that Claude reviewed>
#
# What it does:
#   - the same identity, region and lock checks as the plan script;
#   - refuses unless the saved plan's SHA-256 equals the reviewed one given on the command line;
#   - re-creates the pinned working copy (Terraform 1.16.5 checksum, pinned clone, the four reviewed
#     blobs, provider lock, init with the lock file read-only, no migration);
#   - applies THAT saved plan file only (Terraform refuses a stale plan if the state changed since);
#   - then requires a fresh plan with -var testing_session_cleanup=true and -detailed-exitcode to report
#     no changes, 70 resources in state, and the live policies to equal the reviewed code.
#
# What it never does:
#   - plan-and-apply in one step, -auto-approve, -target, import or state edits;
#   - any other AWS write.
# No secret is read or printed.
set -uo pipefail
umask 077
W=$HOME/munaxa-h20-iam; cd "$W" || { echo "STOP: $W missing (the saved plan is in it)"; exit 1; }
exec > >(tee -a "$W/h20-iam-apply.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Paste $W/h20-iam-apply.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: h20-iam-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
PLAN_SHA=${2:?usage: h20-iam-apply-owner-cloudshell.sh <main commit SHA> <saved plan SHA-256>}
[ "$PIN" = 0f06836c06b2c76ab62699489e67e040a867b360 ] || stop "PIN must be the reviewed main commit 0f06836c06b2c76ab62699489e67e040a867b360"
[[ "$PLAN_SHA" =~ ^[0-9a-f]{64}$ ]] || stop "the plan SHA-256 must be 64 hex characters"
# Only the LAST plan run counts (the log is appended to on every run; review L-2).
LAST=$(awk '/^start [0-9]{4}-/{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' "$W/h20-iam-plan.log" 2>/dev/null)
grep -q "^OK   pin $PIN on main" <<<"$LAST" || stop "the last plan run does not show a verified plan at $PIN"
grep -q '^H-20 IAM PLAN VERIFIED, NOT APPLIED' <<<"$LAST" || stop "the last plan run did not finish with PLAN VERIFIED"
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
[ -f "$W/h20-iam.tfplan" ] || stop "saved plan $W/h20-iam.tfplan is missing"
echo "$PLAN_SHA  $W/h20-iam.tfplan" | sha256sum -c - || stop "the saved plan is not the reviewed one"
echo "c6e6941eef6eb18a7e2d6257b6abeab033066dd0a75b377396b21e207ca5d023  $W/expected.json" | sha256sum -c - || stop "expected.json differs from the plan script's"
echo "c8d3aacd529bd3965d8622ea1aea0959f8a5d84ee7518fa5ae0600e1064ca9f3  $W/norm.jq" | sha256sum -c - || stop "norm.jq differs from the plan script's"
ok "saved plan, expected policies and normalizer are the reviewed ones"

echo "== 2 Terraform 1.16.5 in a temporary work directory"
[ "$(df -Pk "$HOME" | awk 'NR==2{print $4}')" -ge 51200 ] || stop "home has less than 50 MB free"
T=$(mktemp -d /tmp/munaxa-h20-iam-apply.XXXXXX) || stop "temporary work directory"; chmod 700 "$T"
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
F=$(git diff --name-only a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam_session.tf infra/aws/bootstrap/iam_session_cleanup.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl infra/aws/bootstrap/variables.tf " ] || stop "bootstrap files changed since the D-B2R apply are not exactly the four reviewed ones: $F"
for fb in iam_session.tf:aefbe51cdfbf50a76ada963c51eedd1a14dc286f iam_session_cleanup.tf:4419ba74e14b809b113a032e2d4f940d0d1d22cf variables.tf:f3ea818f25207a4d0be3fd0fcfad2988e1fa3a11 tests/bootstrap.tftest.hcl:60384eabec6aa87385024d1a625fbe2016e9f5b8; do
  [ "$(git rev-parse "HEAD:infra/aws/bootstrap/${fb%%:*}")" = "${fb##*:}" ] || stop "${fb%%:*} is not the reviewed content"
done
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"
grep -q 'version     = "6.67.0"' .terraform.lock.hcl || stop "provider version is not 6.67.0"
terraform init -reconfigure -input=false -lockfile=readonly -no-color > "$W/apply-init.txt" 2>&1 || { tail -20 "$W/apply-init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/apply-init.txt" && stop "init mentions a state migration"
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 70 ] || stop "bootstrap state has $C resources, expected 70"
ok "pin $PIN, provider 6.67.0, init without migration, 70 resources"

echo "== 4 apply the reviewed saved plan (and nothing else)"
terraform apply -input=false -lock-timeout=60s -no-color "$W/h20-iam.tfplan" > "$W/apply.txt" 2>&1; A=$?
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
rm -f "$W/h20-iam.tfplan" "$W/post-live.json"; ok "saved plan deleted (it holds the prior state); logs kept in $W"
date -u +"H-20 IAM APPLIED AND VERIFIED %FT%TZ"
echo "Paste $W/h20-iam-apply.log to the thread. Claude then runs the H-20 gate read-only (after a real R success) and reports."
