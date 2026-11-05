# Phase 7: second bootstrap re-apply runbook (owner, root, AWS CloudShell, eu-central-1)

Date: 5 Nov 2026. Authors: Agent 2, lead. Labels: [V-repo], [V-aws], [L], [E], [U], [O].

> **NOT EXECUTED.** This runbook needs a separate, explicit owner approval that names the SHA below. Claude runs none of it, and Claude never uses root.

## 1. Pin

| Item | Value |
| --- | --- |
| Repository | `https://github.com/munaxa/munaxa-platform` |
| Commit (`PIN`) | `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` (the squash merge of PR #43) |
| Bootstrap tree at `PIN` | `b83d107719c5bfc4e2891cc15ab121509aae84aa` (equal to PR head `744c67ce58782b7cec0616d5d801aca821bd83fa`) [V-repo] |
| Change since the live bootstrap | `git diff --stat 46dfbd920c6ee7ac940f0b7ca05656aca461f777 PIN -- infra/aws/bootstrap`: `4 files changed, 225 insertions(+), 67 deletions(-)` |
| Terraform | 1.16.5, `terraform_1.16.5_linux_amd64.zip` sha256 `2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4` (from the HashiCorp SHA256SUMS) |
| Provider | hashicorp/aws 6.67.0, verified by `terraform init` against the lock-file hash `h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=` |
| Simulation script | revision 3, `supporting/simulation/b2-owner-simulation.sh` on main, sha256 `12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b`, 481 read-only calls |
| Expected plan | `Plan: 0 to add, 5 to change, 0 to destroy`, attribute `policy` only, no move [L, offline diff harness] |

If PR #43 changes after this report, the lead redoes the pin, the plan and the script.

## 2. Expected plan [L]

```
aws_iam_policy.deployer_allow["nonprod"] update
aws_iam_policy.deployer_allow["prod"] update
aws_iam_policy.workload_boundary["nonprod"] update
aws_iam_policy.workload_boundary["prod"] update
aws_iam_role_policy.deployer_session["nonprod"] update
```

Nothing else. No add, no destroy, no replace, no move, no budget, ECR, KMS, S3, publisher, CI role or role trust change.

## 3. Stages

As on 5 Nov: stage 1 is steps 0 to 6 (plan only, the owner pastes the output and the lead checks it); stage 2 is steps 7 and 8 (apply and post-checks); stage 3 is step 9 (simulation). The CloudShell home was full on 5 Nov, so everything goes into `/tmp/p7`; the durable backup is the S3 state version.

```bash
# 0. Preconditions: the approval names PIN; no aws-terraform or aws-session run is queued or running
#    (Actions tab); avoid 19:00-03:00 UTC (the session crons).
# 1. Identity and space
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}'   # 229251310592 / arn:aws:iam::229251310592:root
echo "$AWS_REGION"                                                 # eu-central-1
df -h ~ /tmp
mkdir -p /tmp/p7 && cd /tmp/p7

# 2. Terraform 1.16.5 with SHA256 check
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_SHA256SUMS
grep ' terraform_1.16.5_linux_amd64.zip$' terraform_1.16.5_SHA256SUMS | sha256sum -c -   # OK
sha256sum terraform_1.16.5_linux_amd64.zip   # 2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && ./terraform version   # Terraform v1.16.5
export PATH=/tmp/p7:$PATH TF_PLUGIN_CACHE_DIR=/tmp/p7/plugin-cache && mkdir -p $TF_PLUGIN_CACHE_DIR

# 3. Pinned clone
PIN=6b8997a4f9793989abfddae205b4dd6f4ed1d20c
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform
git checkout -q --detach "$PIN" && git rev-parse HEAD                          # must equal $PIN
git rev-parse HEAD:infra/aws/bootstrap                                         # b83d107719c5bfc4e2891cc15ab121509aae84aa
git diff --stat 46dfbd920c6ee7ac940f0b7ca05656aca461f777 HEAD -- infra/aws/bootstrap | tail -1
#   "4 files changed, 225 insertions(+), 67 deletions(-)"; STOP if different
cd infra/aws/bootstrap
grep -c 'h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=' .terraform.lock.hcl   # 1

# 4. Init (same backend as 5 Nov; reconfigure, never migrate)
terraform init -reconfigure -input=false
#   STOP on any state copy or migrate prompt, another provider version, or a lock-file checksum error

# 5. State backup
terraform state pull > /tmp/p7/bootstrap-before.tfstate
python3 -c "import json;d=json.load(open('/tmp/p7/bootstrap-before.tfstate'));print('serial',d['serial'],'lineage',d['lineage'])"
terraform state list | grep -vc '^data\.'                                       # 68 (49 + 19 from 5 Nov); STOP otherwise
aws s3api list-object-versions --bucket munaxa-shared-tfstate-229251310592 --prefix bootstrap/terraform.tfstate \
  --max-items 3 --query 'Versions[].{v:VersionId,t:LastModified,s:Size,cur:IsLatest}'
#   record the current VersionId (the 5 Nov ~05:15 UTC apply); STOP if a newer, unexplained version exists

# 6. Saved plan and checks
terraform plan -input=false -out=/tmp/p7/bootstrap.tfplan -no-color > /tmp/p7/plan.txt; echo "exit $?"   # 0
grep -E '^Plan:|changed outside of Terraform|Error|Warning' /tmp/p7/plan.txt
#   exactly: Plan: 0 to add, 5 to change, 0 to destroy.
terraform show -json /tmp/p7/bootstrap.tfplan > /tmp/p7/plan.json
jq -r '.resource_changes[] | select(.change.actions != ["no-op"]) | "\(.address) \(.change.actions|join("+"))"' /tmp/p7/plan.json | LC_ALL=C sort > /tmp/p7/actual.txt
cat > /tmp/p7/expected.txt <<'EOF'
aws_iam_policy.deployer_allow["nonprod"] update
aws_iam_policy.deployer_allow["prod"] update
aws_iam_policy.workload_boundary["nonprod"] update
aws_iam_policy.workload_boundary["prod"] update
aws_iam_role_policy.deployer_session["nonprod"] update
EOF
diff /tmp/p7/expected.txt /tmp/p7/actual.txt && echo ADDRESSES-OK
jq -r '[.resource_changes[] | select(.previous_address != null)] | length' /tmp/p7/plan.json           # 0 (no move)
jq -r '.resource_changes[] | select(.change.actions==["update"]) | . as $r
  | [($r.change.before|keys[]) | select(($r.change.before[.] != $r.change.after[.]) or ($r.change.after_unknown[.]==true))]
  | "\($r.address): \(join(","))"' /tmp/p7/plan.json            # each of the 5 lines ends ": policy"
jq -r '.resource_changes[] | select(.change.actions==["update"]) | "\(.address) \(.change.after.policy|fromjson|[.Statement[].Sid]|join(","))"' /tmp/p7/plan.json
#   boundary nonprod: NeverFromADeployerSession and TestingBackstop present
#   boundary prod: NeverFromADeployerSession present, TestingBackstop absent
#   deployer_allow nonprod and prod: NoExportableCertificates, NeverExportCertificates, NoLogOrDatabaseData present
#   deployer_session: SessionNeverSecurityGroupRules and SessionNeverNetworkPlacement present, SessionIngressOnOwnGroups absent
```

**Stop before applying** if any of these hold: the summary is anything but `0 to add, 5 to change, 0 to destroy`; any create, delete, replace or move; no `ADDRESSES-OK`; any attribute other than `policy`; "changed outside of Terraform"; any error, or a credential or Region warning; a Sid list differs from the above. Paste the output to the lead.

```bash
# 7. Apply the saved plan only
terraform apply -input=false /tmp/p7/bootstrap.tfplan        # Apply complete! Resources: 0 added, 5 changed, 0 destroyed.

# 8. Post-apply checks
terraform plan -input=false -detailed-exitcode -no-color > /tmp/p7/post.txt; echo "exit $?"   # must be 0
tail -3 /tmp/p7/post.txt                                       # No changes.
terraform state pull > /tmp/p7/bootstrap-after.tfstate
aws s3api head-object --bucket munaxa-shared-tfstate-229251310592 --key bootstrap/terraform.tfstate --query '{sse:ServerSideEncryption,key:SSEKMSKeyId}'
#   aws:kms, the state key as on 5 Nov
for r in munaxa-shared-deployer-nonprod munaxa-shared-deployer-prod munaxa-shared-deployer-nonprod-session; do echo "$r";
  aws iam list-attached-role-policies --role-name "$r" --query 'AttachedPolicies[].PolicyName' --output text
  aws iam list-role-policies --role-name "$r" --query PolicyNames --output text; done   # unchanged from 5 Nov

# 9. Owner simulation revision 3 (read only, 481 calls)
curl -fsSLo /tmp/p7/b2-owner-simulation-rev3.sh \
  https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-05-phase7/supporting/simulation/b2-owner-simulation.sh
echo "12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b  /tmp/p7/b2-owner-simulation-rev3.sh" | sha256sum -c - \
  && bash /tmp/p7/b2-owner-simulation-rev3.sh /tmp/p7/simulation-rev3.tsv; echo "exit $?"
#   success: exit 0 and
#   RESULT total=481 expected_match=481 unexpected_mismatch=0 api_errors=0 harness_errors=0 expected_total=481 complete=yes
```

Step 9 outcomes: exit 2 means the preflight found older policies (stop and paste). Exit 1 means a mismatch or error (stop and paste every FAIL line). An expected value is never changed to fit the output: a real defect goes through a reviewed PR.

## 4. Post-apply validation

- The lead publishes a dated report with the pasted plan summary, the post-apply exit code and the simulation `RESULT` line [V-aws].
- The next scheduled `aws-session.yml` run must assume `munaxa-shared-ci-nonprod-session` and then `munaxa-shared-deployer-nonprod-session` without AccessDenied. Until G3 it ends green with "nonprod stack not applied yet". A failure fails closed and is reported.
- R9 to R13 and the R7 self-assumption part count as closed in AWS only after step 9 passes.

## 5. Rollback and recovery

- **Preferred:** fix forward with a reviewed PR and another approved re-apply.
- **Apply failed part-way:** never reuse the plan file. A fresh plan must show only the not-yet-applied subset of the five updates.
- **Lock left behind** (`bootstrap/terraform.tfstate.tflock`): confirm no Terraform process runs, then `terraform force-unlock <ID>`.
- **Revert the policies:** in the same clone, `git checkout --detach 46dfbd920c6ee7ac940f0b7ca05656aca461f777`, `init -reconfigure`, plan (it must show the same 5 updates in reverse and nothing else), apply that saved plan, then re-run revision 2 (`5186cbc6…89fd205`, 332/332). This reopens R7 and R9 to R13 and needs owner approval.
- **State lost or corrupt:** `terraform state push /tmp/p7/bootstrap-before.tfstate`, or restore the recorded S3 VersionId. Never use an old state to "undo" AWS changes.
- **Cleanup:** `/tmp/p7` can go after the lead confirms the report.

## 6. Order with the other gates [E]

Merge PR #43, then this re-apply plus simulation revision 3, then G3 (separate approval, still 64 creates), then the backstop apply (separate approval, 13 creates), then the backstop and P4 verification, then the first Testing session. The backstop does nothing at run time until this re-apply puts `TestingBackstop` into the nonprod boundary (Agent 3, finding 1).
