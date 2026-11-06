#!/usr/bin/env bash
# G3 recovery, Stages A (AWS preflight) and B (bootstrap re-apply, P-1).
# Run as root in AWS CloudShell, eu-central-1:  bash stage-ab-owner-cloudshell.sh
# Prints no state contents, secrets or credentials: only counts, serials, addresses, Sids and ARNs.
# Every check is a hard stop. The apply runs only when every check before it passed.
set -uo pipefail
W=/tmp/g3rec; mkdir -p "$W"; cd "$W" || exit 1
exec > >(tee -a "$W/stage-ab.log") 2>&1
stop() { echo; echo "STOP: $*"; echo "Nothing was applied after this point. Paste $W/stage-ab.log to the thread."; exit 1; }
ok()   { echo "OK   $*"; }
PIN=a25898c7683b13f166b034a265639e3470b099e0
B=munaxa-shared-tfstate-229251310592
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1
date -u +"start %FT%TZ"

echo "== A1 identity and Region"
ARN=$(aws sts get-caller-identity --query Arn --output text) || stop "get-caller-identity failed"
[ "$ARN" = "arn:aws:iam::229251310592:root" ] || stop "caller is $ARN, expected root of 229251310592"; ok "$ARN"
ok "region $AWS_REGION"
df -h /tmp | tail -1

echo "== A2 nonprod state and lock (read only)"
aws s3api head-object --bucket $B --key nonprod/stack.tfstate \
  --query '{t:LastModified,v:VersionId,sse:ServerSideEncryption}' --output text || stop "nonprod state missing"
if aws s3api head-object --bucket $B --key nonprod/stack.tfstate.tflock >/dev/null 2>&1; then stop "nonprod lock file exists"; fi; ok "no nonprod lock"
aws s3 cp --quiet s3://$B/nonprod/stack.tfstate - | jq -r '"serial \(.serial) lineage \(.lineage[0:8]) instances \([.resources[]|select(.mode=="managed")|.instances|length]|add)"' > a2.txt
cat a2.txt; grep -qx 'serial 3 lineage 7aae1c65 instances 38' a2.txt || stop "nonprod state is not serial 3 / 7aae1c65 / 38"

echo "== A3 nothing running"
if aws rds describe-db-instances --db-instance-identifier munaxa-nonprod-pg >/dev/null 2>&1; then stop "munaxa-nonprod-pg already exists"; fi; ok "no database"
N=$(aws ecs list-tasks --cluster munaxa-nonprod --query 'length(taskArns)' --output text) || stop "ecs list-tasks failed"
[ "$N" = "0" ] || stop "$N ECS tasks running"; ok "0 ECS tasks"

echo "== A4 live CreatesCarry statements before (expect Resource *)"
pol() { aws iam get-role-policy --role-name "$1" --policy-name "$2" --query PolicyDocument --output json \
  | jq -c '.Statement[]|select(.Sid|startswith("CreatesCarry"))|{Sid,Resource,NotResource}'; }
pol munaxa-shared-deployer-nonprod deployer
pol munaxa-shared-deployer-nonprod-session session-deployer

echo "== B1 Terraform 1.16.5"
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip || stop "download"
echo "2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4  terraform_1.16.5_linux_amd64.zip" | sha256sum -c - || stop "terraform checksum"
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && export PATH=$W:$PATH TF_PLUGIN_CACHE_DIR=$W/plugin-cache TF_IN_AUTOMATION=1
mkdir -p "$TF_PLUGIN_CACHE_DIR"; terraform version | head -1

echo "== B2 pinned clone"
rm -rf munaxa-platform && git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform || stop "clone"
git checkout -q --detach $PIN && [ "$(git rev-parse HEAD)" = $PIN ] || stop "HEAD is not $PIN"
[ "$(git rev-parse HEAD:infra/aws/bootstrap)" = 0888198a3562f6bb5f835a34a717b47d9be4dfec ] || stop "bootstrap tree differs"
D=$(git diff --stat 6b8997a4f9793989abfddae205b4dd6f4ed1d20c HEAD -- infra/aws/bootstrap | tail -1)
[ "$D" = " 3 files changed, 41 insertions(+), 8 deletions(-)" ] || stop "bootstrap diff since the last apply: $D"
ok "pin $PIN, tree 0888198, diff since 6b8997a: $D"
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
grep -qx 'Plan: 0 to add, 3 to change, 0 to destroy.' "$W/plan.txt" || stop "summary is not 0 to add, 3 to change, 0 to destroy"
grep -q 'changed outside of Terraform' "$W/plan.txt" && stop "drift reported"
terraform show -json "$W/p1.tfplan" > "$W/p1.json"
jq -r '.resource_changes[]|select(.change.actions!=["no-op"])|"\(.address) \(.change.actions|join("+"))"' "$W/p1.json" | LC_ALL=C sort > "$W/actual.txt"
printf '%s\n' 'aws_iam_role_policy.deployer["nonprod"] update' 'aws_iam_role_policy.deployer["prod"] update' 'aws_iam_role_policy.deployer_session["nonprod"] update' > "$W/expected.txt"
diff "$W/expected.txt" "$W/actual.txt" || stop "addresses differ"; ok "3 addresses as approved"
jq -r '.resource_changes[]|select(.change.actions==["update"])|. as $r|[($r.change.before|keys[])|select(($r.change.before[.]!=$r.change.after[.]) or ($r.change.after_unknown[.]==true))]|"\($r.address): \(join(","))"' "$W/p1.json" | tee "$W/attrs.txt"
[ "$(grep -vc ': policy$' "$W/attrs.txt")" = 0 ] || stop "an attribute other than policy changes"
ARNS='["arn:aws:ec2:eu-central-1:229251310592:route-table/*","arn:aws:ec2:eu-central-1:229251310592:security-group/*","arn:aws:ec2:eu-central-1:229251310592:subnet/*","arn:aws:ec2:eu-central-1:229251310592:vpc/*"]'
jq -r --argjson a "$ARNS" '.resource_changes[]|select(.change.actions==["update"])
  | (.change.before.policy|fromjson|.Statement) as $b | (.change.after.policy|fromjson|.Statement) as $n
  | ($b|map(select(.Sid|startswith("CreatesCarry")|not))) as $bo | ($n|map(select(.Sid|startswith("CreatesCarry")|not))) as $no
  | ($n|map(select(.Sid|startswith("CreatesCarry")))) as $cc | ($b|map(select(.Sid|startswith("CreatesCarry")))) as $bc
  | "\(.address) others_unchanged=\($bo==$no) carry=\($cc|length) notresource_ok=\($cc|all(.Resource==null and ((.NotResource|if type=="array" then . else [.] end|sort)==$a))) actions_cond_unchanged=\(($bc|map({Sid,Action,Condition}))==($cc|map({Sid,Action,Condition}))) chars=\(.change.after.policy|fromjson|tojson|length)"' "$W/p1.json" | tee "$W/stmts.txt"
[ "$(grep -c 'others_unchanged=true carry=2 notresource_ok=true actions_cond_unchanged=true' "$W/stmts.txt")" = 3 ] || stop "policy content differs from PR #55"
ok "only the two CreatesCarry statements change, Resource * -> NotResource of the 4 EC2 parent types"

echo "== B5 apply the saved plan"
terraform apply -input=false -no-color "$W/p1.tfplan" > "$W/apply.txt" 2>&1; AE=$?
tail -3 "$W/apply.txt"; echo "apply exit $AE"; [ $AE = 0 ] || stop "apply failed"
grep -q 'Apply complete! Resources: 0 added, 3 changed, 0 destroyed.' "$W/apply.txt" || stop "apply summary differs"

echo "== B6 post-apply"
terraform plan -input=false -detailed-exitcode -no-color > "$W/post.txt" 2>&1; PE=$?
tail -1 "$W/post.txt"; echo "post-apply plan exit $PE"; [ $PE = 0 ] || stop "post-apply plan not clean"
aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate --query '{t:LastModified,v:VersionId,sse:ServerSideEncryption}' --output text
pol munaxa-shared-deployer-nonprod deployer
pol munaxa-shared-deployer-prod deployer
pol munaxa-shared-deployer-nonprod-session session-deployer
for r in "munaxa-shared-deployer-nonprod deployer" "munaxa-shared-deployer-prod deployer" "munaxa-shared-deployer-nonprod-session session-deployer"; do
  set -- $r; aws iam get-role-policy --role-name $1 --policy-name $2 --query PolicyDocument --output json | jq -c '{chars:(tojson|length)}'; done
if aws s3api head-object --bucket $B --key bootstrap/terraform.tfstate.tflock >/dev/null 2>&1; then stop "bootstrap lock left behind"; fi; ok "no bootstrap lock"
date -u +"STAGE B COMPLETE %FT%TZ"
