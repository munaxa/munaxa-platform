#!/usr/bin/env bash
# G3 recovery, bootstrap re-apply 2 (P-3): kms:DescribeKey on the AWS managed Secrets Manager key.
# Run as root in AWS CloudShell, eu-central-1:  bash stage-b2-owner-cloudshell.sh <PIN>
# Prints no state contents, secrets or credentials. Every check is a hard stop; the apply runs only
# when every check before it passed.
set -uo pipefail
W=/tmp/g3rec2; mkdir -p "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/stage-b2.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied after this point. Paste $W/stage-b2.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=${1:?usage: stage-b2-owner-cloudshell.sh <merge SHA>}
B=munaxa-shared-tfstate-229251310592
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1
date -u +"start %FT%TZ"
ARN=$(aws sts get-caller-identity --query Arn --output text) || stop "get-caller-identity failed"
[ "$ARN" = "arn:aws:iam::229251310592:root" ] || stop "caller is $ARN"; ok "$ARN"
if aws s3api head-object --bucket $B --key nonprod/stack.tfstate.tflock >/dev/null 2>&1; then stop "nonprod lock file exists"; fi; ok "no nonprod lock"
echo "== B1 Terraform 1.16.5"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && export PATH=$W:$PATH TF_PLUGIN_CACHE_DIR=$W/plugin-cache TF_IN_AUTOMATION=1
mkdir -p "$TF_PLUGIN_CACHE_DIR"; terraform version | head -1

echo "== B2 pinned clone"
rm -rf munaxa-platform && git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach $PIN && [ "$(git rev-parse HEAD)" = $PIN ] || stop "HEAD is not $PIN"
F=$(git diff --name-only a25898c7683b13f166b034a265639e3470b099e0 HEAD -- infra/aws/bootstrap | tr '\n' ' ')
[ "$F" = "infra/aws/bootstrap/iam_allow.tf infra/aws/bootstrap/tests/bootstrap.tftest.hcl " ] || stop "bootstrap files changed since the last apply: $F"
ok "pin $PIN, bootstrap changes since a25898c: $F"
echo "== A2 nonprod state: the creates still missing must equal the declaration at $PIN"
aws s3 cp --quiet s3://$B/nonprod/stack.tfstate - | jq -r '"serial \(.serial)", (.resources[]|select(.mode=="managed") as $r|$r.instances[]|"\($r.type).\($r.name)\(if .index_key==null then "" elif (.index_key|type)=="number" then "[\(.index_key)]" else "[\"\(.index_key)\"]" end)")' > "$W/st.txt"
head -1 "$W/st.txt"; echo "addresses $(($(wc -l < "$W/st.txt")-1))"
sort docs/aws-migration/agent-reports/2026-11-05-g3-failed-apply-recovery/supporting/recovery-26-addresses.txt > "$W/r26.txt"
comm -23 "$W/r26.txt" <(sort "$W/st.txt") > "$W/missing.txt"; echo "still missing:"; cat "$W/missing.txt"
jq -r '.changes[].address' infra/aws/stack/envs/nonprod.expected-changes.json | sort > "$W/declared.txt"
diff "$W/missing.txt" "$W/declared.txt" || stop "the declaration at $PIN does not equal the creates still missing"
ok "declaration = the $(wc -l < "$W/missing.txt") creates still missing"
cd infra/aws/bootstrap
grep -q 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl || stop "provider lock hash"

echo "== B3 init, tests, state"
terraform init -reconfigure -input=false -no-color > "$W/init.txt" 2>&1 || { tail -20 "$W/init.txt"; stop "init"; }
grep -iE 'Do you want to (copy|migrate)|migrate-state' "$W/init.txt" && stop "init mentions a state migration"
ok init
terraform test -no-color > "$W/test.txt" 2>&1; T=$?; tail -2 "$W/test.txt"; [ $T = 0 ] || stop "terraform test exit $T"
aws s3api list-object-versions --bucket $B --prefix bootstrap/terraform.tfstate --max-items 2 \
  --query 'Versions[].{v:VersionId,t:LastModified,cur:IsLatest}' --output text
C=$(terraform state list | grep -vc '^data\.'); [ "$C" = 68 ] || stop "bootstrap state has $C resources, expected 68"; ok "68 resources in bootstrap state"

echo "== B4 saved plan and checks"
terraform plan -input=false -lock-timeout=60s -no-color -out="$W/p1.tfplan" > "$W/plan.txt" 2>&1; P=$?
grep -E '^Plan:|No changes|changed outside of Terraform|Error|Warning' "$W/plan.txt"
[ $P = 0 ] || stop "plan exit $P"
grep -qx 'Plan: 0 to add, 2 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 0 to add, 2 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/p1.tfplan" > "$W/p1.json"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"])|"\(.address) \(.change.actions|join("+"))"' "$W/p1.json" | LC_ALL=C sort > "$W/actual.txt"
printf '%s\n' 'aws_iam_policy.deployer_allow["nonprod"] update' 'aws_iam_policy.deployer_allow["prod"] update' > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "addresses differ"; ok "2 addresses as approved"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|[($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|"\($r.address): \(join(","))"' "$W/p1.json" | tee "$W/attrs.txt"
[ "$(grep -vc ': policy$' "$W/attrs.txt")" = 0 ] || stop "an attribute other than policy changes"
KEY=arn:aws:kms:eu-central-1:229251310592:key/033b4382-b443-4527-a34e-41d91b62cfd5
jq -r --arg k "$KEY" '.resource_changes[]|select(.change.actions==["update"])
  | (.change.before.policy|fromjson|.Statement) as $b | (.change.after.policy|fromjson|.Statement) as $n
  | ($n|map(select(.Sid!="SecretsManagerDefaultKeyMetadata"))) as $no
  | ($n|map(select(.Sid=="SecretsManagerDefaultKeyMetadata"))) as $add
  | "\(.address) others_unchanged=\($b==$no) added=\($add|length) add_ok=\($add|all(.Effect=="Allow" and .Action=="kms:DescribeKey" and .Resource==$k and .Condition==null)) chars=\(.change.after.policy|fromjson|tojson|length)"' "$W/p1.json" | tee "$W/stmts.txt"
[ "$(grep -c 'others_unchanged=true added=1 add_ok=true' "$W/stmts.txt")" = 2 ] || stop "policy content differs from the PR"
awk -F'chars=' '{ if ($2+0 > 6144) exit 1 }' "$W/stmts.txt" || stop "a managed policy would exceed 6,144 characters"
ok "only SecretsManagerDefaultKeyMetadata is added: kms:DescribeKey on the AWS managed Secrets Manager key"

echo "== B5 apply the saved plan"
terraform apply -input=false -no-color "$W/p1.tfplan" > "$W/apply.txt" 2>&1; AE=$?
tail -3 "$W/apply.txt"; echo "apply exit $AE"; [ $AE = 0 ] || stop "apply failed"
grep -q 'Apply complete! Resources: 0 added, 2 changed, 0 destroyed.' "$W/apply.txt" || stop "apply summary differs"

echo "== B6 post-apply"
terraform plan -input=false -detailed-exitcode -no-color > "$W/post.txt" 2>&1; PE=$?
tail -1 "$W/post.txt"; echo "post-apply plan exit $PE"; [ $PE = 0 ] || stop "post-apply plan not clean"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{t:LastModified,v:VersionId,sse:ServerSideEncryption}' --output text
for e in nonprod prod; do
  P=arn:aws:iam::229251310592:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-$e-allow
  V=$(aws iam get-policy --policy-arn $P --query Policy.DefaultVersionId --output text)
  aws iam get-policy-version --policy-arn $P --version-id $V --query PolicyVersion.Document --output json \
    | jq -c --arg e $e '{env:$e, chars:(tojson|length), added:[.Statement[]|select(.Sid=="SecretsManagerDefaultKeyMetadata")]}'
done
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap lock left behind"; fi; ok "no bootstrap lock"
date -u +"STAGE B2 COMPLETE %FT%TZ"
