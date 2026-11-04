# Phase 6, Agent 2: IAM and bootstrap security (platform#38, 46dfbd9)

Date: 4 Nov 2026. Author: Agent 2. Region eu-central-1, account 229251310592.

Labels: [V-repo] repository evidence, [V-gh] GitHub evidence, [V-aws] live AWS evidence (none in
this report), [E] inferred or estimated, [U] not yet verified, [O] owner action required.

No AWS call was made. No AWS MCP tool and no AWS CLI were used. Every Terraform command ran
through `evidence/harness/tfx`. That wrapper unsets the AWS keys found in this shell, points HOME
at an empty folder, uses a filesystem provider mirror and, with `OFFLINE=1`, sends all HTTPS to
127.0.0.1:9. The public AWS Service Authorization Reference JSON (servicereference.us-east-1.amazonaws.com,
no credentials, no account API) was downloaded into `evidence/sar/` to check resource types and
condition keys. Nothing was pushed or posted. The repository clones were not edited.

All paths below are relative to `/tmp/claude-0/-home-claude/2fb8123e-8f4e-5ef3-94b0-e6568e1a6098/scratchpad/phase6/a2/`
unless they start with `infra/` (that is munaxa-platform at 46dfbd9).

**Nothing in this report is active in AWS.** AWS still runs the bootstrap applied at
`1331ef89a7906b75292bb35554eac9659270c0f2` (platform#33, re-applied 31 Oct 13:42:03 UTC, phase 4
G2-EXECUTION-REPORT.md lines 17 and 41). Every fix below is IN CODE ONLY until root re-applies
`infra/aws/bootstrap` [V-repo].

## 1. Baseline facts

| Item | Value | Label |
| --- | --- | --- |
| platform#38 | merged 2026-11-04T12:05:15Z by tam2om; head `0ff0879ad788f2999aa256471b0e56cb6b76ba41`, base `c688e9ee242a46d94df09307c97fa4281da7ed78`; 7 files, +1295/-136 | [V-gh] PR #38 |
| Merge commit | `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (squash). `git diff --stat 1331ef8 46dfbd9 -- infra/aws/bootstrap` gives the same 7 files and +1295/-136 | [V-repo] |
| main | `b6b4a0a92fec4fd770901a9d62dda8eefc0d2b24` (#39, docs only). `git diff 46dfbd9 b6b4a0a -- infra/aws/bootstrap` is empty | [V-repo] |
| Later bootstrap commits | none: the last commit touching `infra/aws/bootstrap` on main is 46dfbd9 | [V-gh] list_commits path filter |
| Owner's cited SHA | `46df920c6ee7ac940f0b7ca05656aca461f777` (38 hex) is `46dfbd920c6ee7ac940f0b7ca05656aca461f777` with the two characters `bd` (positions 5 and 6) missing. It is the #38 merge commit, mistyped | [V-repo] by comparison |
| AWS today | bootstrap at 1331ef8: 49 resources, deployers with `StackServices` (`ec2:*` ... on `*`), one shared boundary, nonprod CI role trusting `aws-nonprod` and `aws-nonprod-session` | [V-repo] G2 report; live state [U] |
| fmt / validate / test at 46dfbd9 | fmt clean, validate Success, **9 passed, 0 failed** | [V-repo] `evidence/46dfbd9-fmt-validate-test.txt` |
| Tools | Terraform 1.16.5 linux_amd64 zip SHA256 `2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4` (OK against HashiCorp SHA256SUMS); hashicorp/aws 6.67.0 zip OK against its SHA256SUMS; the lock file's `h1:` hash accepted it, lock file unchanged | [V-repo] |

## 2. Finding-by-finding closure matrix

"IN CODE" means merged to main at 46dfbd9. "ACTIVE IN AWS" is **No** for every row: it becomes Yes
only after the root re-apply in section 5 and a clean owner simulation.

| Finding | Fix | Exact code (46dfbd9) | Commit | In code | Active in AWS |
| --- | --- | --- | --- | --- | --- |
| B2 / TD-14: writes were `service:*` on `*`, limited only by tag denies, so untagged resources were writable | `StackServices` removed. Writes are allows by own name (`OwnNames`), by both own tags (`OwnTagged`), or by create request tags (`Ec2Create*`, `Ec2TagOnCreate`, `CreateWithOwnTags`, `CloudMapServiceWithOwnTags`). Old denies kept as second layer | `infra/aws/bootstrap/iam_allow.tf:110-245` (tagged), `:247-405` (named), `:70-90` (reads); `iam.tf:177-460` (inline: state and guardrails) | 46dfbd9 (#38) | Yes | No |
| M-1 untagged creates | `CreatesCarryProjectTag`, `CreatesCarryEnvironmentTag` deny every listed create without Project = munaxa and Environment = own | `iam.tf:332-354`, list `iam_allow.tf:33-42` | 46dfbd9 | Yes | No |
| M-1 account settings and sharing | `NeverAccountSettingsOrSharing` | `iam.tf:433-447` | 46dfbd9 | Yes | No |
| M-1 default VPC | `NeverProtectedVpcs`, `NeverInProtectedVpcs`, `NeverProtectedVpcsInZones`; `protected_vpc_ids = ["vpc-0ed30515ad9631ea6"]` | `iam.tf:400-429`, `variables.tf:114-118` | 46dfbd9 | Yes | No |
| M-1 Docs snapshot and Docs bootstrap names | `NeverMunaxaDocsOrBootstrap` adds `snapshot:munaxa-docs*`, `policy/munaxa-docs/*`, `oidc-provider/*`, `alias/munaxa-docs*`, `log-group:*munaxa-docs*`, `trail/munaxa-docs*` | `iam.tf:217-236` | 46dfbd9 | Yes | No |
| H-1 shared boundary reached prod secrets, every `rds!*` secret, every key, prod buckets | One boundary per environment (`for_each`, nonprod keeps its name via `moved`); each lists only its own secrets, keys (both tags), buckets, logs, task definitions, PassRole; denies the other environment's tag | `iam.tf:14-23` (names), `:33-36` (moved), `:38-144` (boundary) | 46dfbd9 | Yes | No |
| H-1 role creation | `CreateRole`/`PutRolePermissionsBoundary` only on `role/munaxa-shared/munaxa-<env>-*` and only with that environment's boundary; other boundary ARN in the name deny; no AttachRolePolicy or CreatePolicy anywhere; all `policy/munaxa-shared/*` denied | `iam_allow.tf:356-374`, `iam.tf:226`, `:388` | 46dfbd9 | Yes | No |
| H-2 state key and bucket | `ProtectStateKeyAndBucket` denies all but Encrypt, Decrypt, GenerateDataKey, DescribeKey and object List/Get/Put/Delete on the key ARN, bucket and objects. `OwnTagged` needs Environment, which the state key lacks | `iam.tf:241-249` | 46dfbd9 | Yes | No |
| H-2b alias repointing | `NeverSharedAliases` denies Create/Update/DeleteAlias on `alias/munaxa-shared-*` and on the state key ARN | `iam.tf:254-259` | 46dfbd9 | Yes | No |
| Bootstrap state written SSE-S3 | `kms_key_id` = state alias in the bootstrap backend; needs `init -reconfigure`; the next write is SSE-KMS | `infra/aws/bootstrap/backend.tf:13` | 46dfbd9 | Yes | No |
| H-3 session environment reached the full deployer | Nonprod CI trusts only `aws-nonprod`; new `munaxa-shared-ci-nonprod-session` trusts only `aws-nonprod-session` and may assume only `munaxa-shared-deployer-nonprod-session`, which carries all nonprod guardrails (`source_policy_documents`) plus session writes | `variables.tf:87-99`, `:101-112`; `iam_session.tf:14-309` (guardrails `:97`) | 46dfbd9 | Yes | No |
| B-1 RDS-managed master secret (CalledVia never set by RDS) | `RdsMasterSecret` uses `Bool aws:ViaAWSService = true` on `rds!*` | `iam_allow.tf:293-305` | 46dfbd9 (from PR commit 0ff0879) | Yes | No, and [U] until the G3 apply creates the instance |
| N-1 boundary read of the master secret | `OwnRdsMasterSecret` (tag key `aws:rds:primaryDBInstanceArn`, [U]) plus `OwnRdsMasterSecretByTag` (Project and Environment) | `iam.tf:70-87` | 46dfbd9 | Yes | No |
| Data key use by RDS and Secrets Manager | `DataKeyThroughRdsAndSecretsManager`: Decrypt/GenerateDataKey* only with `kms:ViaService` rds or secretsmanager in eu-central-1, and only on keys tagged Environment = own | `iam_allow.tf:309-323` | 46dfbd9 | Yes | No |
| B-2 session refresh reads | `munaxa-shared-deployer-nonprod-session-read`: KMS reads on own-tagged keys, secret Describe/GetResourcePolicy on `munaxa-nonprod/*`, bucket reads on `munaxa-nonprod-*`, role reads on `role/munaxa-shared/munaxa-nonprod-*` | `iam_session.tf:254-309` | 46dfbd9 | Yes | No |
| M-1 `iam:PassRole` without service | `PassOwnRoles`: own role names, `iam:PassedToService` in ecs-tasks, ecs, scheduler; session: ecs-tasks, ecs only | `iam_allow.tf:376-385`, `iam_session.tf:215-224` | 46dfbd9 | Yes | No |
| Route 53 records | `CloudMapPrivateZoneRecords`: `ChangeResourceRecordSets` only for `<env>.munaxa.internal` names | `iam_allow.tf:343-352` | 46dfbd9 | Yes | No |
| Register R9 (Phase 5 and review numbering: R10) session CIDR ingress | Partly: session has only Authorize/Revoke ingress on own-tagged groups, is denied the ALB, database, db-admin and default groups, cannot tag groups. Not closable in IAM (AuthorizeSecurityGroupIngress has only `ec2:Region`, `evidence/sar/ec2.json`) | `iam_session.tf:112-179` | 46dfbd9 | Partly | No |
| Test assertion that checked nothing (`effect == "Allow"` on null) | Filters on `!= "Deny"` | `tests/bootstrap.tftest.hcl` | 46dfbd9 | Yes | n/a |

## 3. What the code really does, by topic (verified against 46dfbd9)

**Positive allow-list.** No allow statement grants a service-wide write on `*` without a condition;
the one unconditioned allow on `*` is `CloudMapPrivateZone` (`route53:CreateHostedZone`,
`DeleteHostedZone`, `ChangeTagsForResource`, `iam_allow.tf:327-331`) [V-repo, test
`b2_writes_are_an_allow_list_not_tag_denies`]. Tag-scoped allows always need both
`Project = munaxa` and `Environment = <env>` with StringEquals (`iam_allow.tf:125-134`). Each EC2
create statement names one typed ARN, so a parent (VPC, security group) is never matched by the
child's request tags (`iam_allow.tf:46-54`, `:137-154`). `Ec2TagOnCreate` needs `ec2:CreateAction`
(`:157-176`). Instances, ENIs, NAT gateways and Elastic IPs get no create allow [V-repo].

**Workload boundaries and session-only roles.** Covered in the matrix. Note: the managed allow
policies live at `/munaxa-shared/bootstrap/`, so the deployer's own `policy/munaxa-shared/*` deny
(`iam.tf:226`) also keeps it from editing its own allow policies [V-repo].

**State bucket, key and alias.** The deny lists the key by ARN (`aws_kms_key.state.arn`), not by
alias; alias operations are denied on the alias pattern and on the key ARN (`iam.tf:254-259`), and
the bucket configuration is denied by `ProtectStateKeyAndBucket` (its NotAction keeps only object
List/Get/Put/Delete) [V-repo]. `kms:CancelKeyDeletion` is denied account-wide (`iam.tf:443`), so
recovery from a scheduled deletion is root only. The deployers' `State` statement is `<env>/*`, so
neither deployer can read or write `bootstrap/terraform.tfstate` [V-repo `iam.tf:188-192`].

**RDS-managed secret.** Creation goes through `RdsMasterSecret` (ViaAWSService) and the data key
through `DataKeyThroughRdsAndSecretsManager` plus `OwnTagged` (CreateGrant, DescribeKey). Reads at
run time are the boundary's (`OwnRdsMasterSecret*`) [V-repo]. Whether RDS evaluates the caller's
policy with `aws:ViaAWSService = true` is [U] until the G3 apply; if it is wrong, the apply fails at
`aws_db_instance.main` (fail closed, possibly tainted, Agent 6 challenge 2).

**aws:ViaAWSService.** Used once, `iam_allow.tf:300-304`, only on `rds!*` and only for
CreateSecret, TagResource, DescribeSecret, DeleteSecret. It cannot be satisfied by a direct call
[V-repo; IAM semantics E].

**iam:PassedToService.** The full deployer passes only own roles to ecs-tasks, ecs and scheduler.
The boundary's `PassOwnRoles` (`iam.tf:108-113`) has no service condition, which is acceptable
because a boundary only caps; the role's own policy must also allow it [V-repo].

**Route 53 and account-wide metadata.** See register R5 and R6.

**Untagged KMS, ACM, Cloud Map and default security groups.** See register R1 to R4. Checked in the
Service Authorization Reference [V, public JSON]: `servicediscovery:TagResource` and
`CreatePrivateDnsNamespace` have no resource type; `kms:TagResource` and `acm:AddTagsToCertificate`
carry only request-tag condition keys at action level, so tag-on-create cannot be told apart from
tagging an existing untagged resource.

## 4. Fixes in code versus fixes active in AWS

| State | What it covers |
| --- | --- |
| Active in AWS today | Only the 1331ef8 bootstrap: OIDC trusts, per-environment CI and deployer roles, `StackServices` on `*` with tag and name denies (N-2 fix with `Null` guards), the shared boundary, state bucket protections (versioning, public access blocks, SSE-KMS default, TLS-only), ECR, budgets |
| In code, not active | Every row of section 2, and the patches in section 7 if merged |
| Active only after root re-apply | Allow-lists, boundaries per environment, H-2/H-2b denies, session roles, SSE-KMS bootstrap state |
| Verified only after simulation | Each statement's behaviour in IAM. No AWS simulation has run. The owner script is Agent 3's fixed version (section 5, step 9) |
| Verified only by the G3 apply | B-1 (ViaAWSService for RDS), N-1 tag key, Phase 5 point (a) `kms:CreateKey` with PutKeyPolicy on the new key, Cloud Map authorization model |
| Verified only by the first session run | N-2 (`TF_VAR_deployer_role_arn` at job-level env resolving the environment variable, `.github/workflows/aws-session.yml:63`) |

## 5. Expected re-apply plan (reasoned and reproduced offline)

**Method.** `evidence/harness/diff.tftest.hcl`: run `g2` applies the 1331ef8 bootstrap (module
`../g2`) with every managed resource overridden at apply time, run `reapply` plans 46dfbd9 on the
same state (`state_key`). The real AWS provider renders every `aws_iam_policy_document`; it is
configured with placeholder keys and all skip flags; no endpoint is reachable. The `g2` state held
exactly 49 managed resources, matching G2 [V-repo `evidence/reapply-diff-raw.txt`].

**Result** [V-repo `evidence/reapply-diff-summary.txt`; real plan E strong]:

`Plan: 19 to add, 6 to change, 0 to destroy.`

- 19 creates: the list in `evidence/expected-reapply-changes.txt` (also Agent 4 §3.4, which agrees).
- 4 real in-place updates: `aws_iam_policy.workload_boundary["nonprod"]` (moved from
  `aws_iam_policy.workload_boundary`; attribute `policy` only), `aws_iam_role_policy.deployer["nonprod"]`
  and `["prod"]` (`policy` only), `aws_iam_role.ci["nonprod"]` (`assume_role_policy`: the
  `aws-nonprod-session` subject removed).
- 2 displayed updates with identical content: `aws_iam_role.deployer["nonprod"]` and `["prod"]`,
  `assume_role_policy -> (known after apply)`. Terraform prints the reason: the data sources
  `deployer_trust["nonprod"]` and `["prod"]` "depend on a resource or a module with changes
  pending" (`aws_iam_role.ci`, tracked per resource, not per instance). At apply they render the
  same JSON. This confirms the Phase 5 claim "19 add, 4 real in-place, 0 destroy"; the printed
  change count is 6.
- 3 deferred reads: `data.aws_iam_policy_document.deployer_session_trust["nonprod"]` (refers to the
  new session CI role ARN) and `deployer_trust["nonprod"|"prod"]`.
- 1 move. 0 destroy, 0 replace. No budget, ECR, KMS, S3, publisher, `ci["prod"]` or alias change.
  The Phase 5 "2 budget artifacts" did not appear in this harness; they came from overriding the
  budget's notification blocks. In a real plan a budget change is a stop (agrees with Agent 4).

**With the proposed patches** (section 7, alone or together with Agent 5's P3 and P4) the address
list, actions and counts are unchanged: the patches only change the content of resources already
in the plan [V-repo `evidence/reapply-diff-p1-summary.txt`, `-p12-`, `-combo-`, all identical to
the unpatched list].

## 6. Safe bootstrap re-apply runbook (owner, root, AWS CloudShell eu-central-1). NOT RUN

Separate owner approval is required before step 1. Claude does not run any of this.

**CloudShell storage.** The home volume is 1 GB and persists; `/tmp` is large but is wiped when
CloudShell restarts (about 20 to 30 minutes idle). G2 filled the home volume and later lost `/tmp`.
The AWS provider alone is about 790 MB unpacked and Terraform about 115 MB [V-repo, measured here],
so binaries, clone and `.terraform` go in `/tmp`; the small files (state backups, plan, outputs) go in
`~/p6`. The state itself is now remote in S3 (versioned), so a restart loses no state, only the
working copy and possibly the lock.

Stop conditions apply at every step: on any surprise, stop and paste the output to the lead.

```bash
# 0. Preconditions (owner): approval card answered; no aws-terraform or aws-session run is
#    queued or running (Actions tab). Avoid 20:00 to 03:00 UTC (the nightly session runs late).
# 1. Identity and space
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}'    # 229251310592, arn:aws:iam::229251310592:root
echo "$AWS_REGION"                                                  # eu-central-1
df -h ~ /tmp ; du -sh ~                                             # need ~5 MB free in ~; STOP if ~ is full and cannot be cleaned
mkdir -p ~/p6 && cd /tmp && rm -rf /tmp/p6 && mkdir /tmp/p6 && cd /tmp/p6

# 2. Terraform 1.16.5 with SHA256 check
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_linux_amd64.zip
curl -fsSLO https://releases.hashicorp.com/terraform/1.16.5/terraform_1.16.5_SHA256SUMS
grep ' terraform_1.16.5_linux_amd64.zip$' terraform_1.16.5_SHA256SUMS | sha256sum -c -   # must print: OK
sha256sum terraform_1.16.5_linux_amd64.zip   # 2bc2fcfff033265c9e02ca0351f01794eb122f62a9b2a49a3294b9e49eaab5e4
unzip -o -q terraform_1.16.5_linux_amd64.zip terraform && ./terraform version   # Terraform v1.16.5
export PATH=/tmp/p6:$PATH TF_PLUGIN_CACHE_DIR=/tmp/p6/plugin-cache && mkdir -p $TF_PLUGIN_CACHE_DIR

# 3. Clone at a pinned SHA (public repository)
PIN=46dfbd920c6ee7ac940f0b7ca05656aca461f777     # the ONLY approved SHA (lead fix for review BL-1); any other SHA needs a new approval and a regenerated simulation script
git clone -q https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform
git checkout -q --detach "$PIN" && git rev-parse HEAD     # must equal $PIN exactly
git diff --stat 1331ef89a7906b75292bb35554eac9659270c0f2 HEAD -- infra/aws/bootstrap | tail -1
#   for 46dfbd9: "7 files changed, 1295 insertions(+), 136 deletions(-)"; STOP if different
cd infra/aws/bootstrap

# 4. Backend: same bucket and key, new kms_key_id -> reconfigure, never migrate
terraform init -reconfigure -input=false
#   expect: Successfully configured the backend "s3"; hashicorp/aws v6.67.0 (lock file). STOP on any
#   prompt to copy or migrate state, on a different provider version, or on any error.

# 5. State backup before anything else
terraform state pull > ~/p6/bootstrap-before.tfstate
python3 -c "import json;d=json.load(open('$HOME/p6/bootstrap-before.tfstate'));print('serial',d['serial'],'lineage',d['lineage'])"
terraform state list | grep -vc '^data\.'                           # 49; STOP otherwise
aws s3api list-object-versions --bucket munaxa-shared-tfstate-229251310592 \
  --prefix bootstrap/terraform.tfstate --max-items 2 --query 'Versions[].{v:VersionId,t:LastModified,s:Size,cur:IsLatest}'
#   record the current VersionId (the 31 Oct 13:42 version, about 201 KB, unless something re-applied since: then STOP)

# 6. Plan to a saved file
terraform plan -input=false -out="$HOME/p6/bootstrap.tfplan" -no-color > ~/p6/plan.txt; echo "exit $?"
grep -E '^Plan:|changed outside of Terraform|Error' ~/p6/plan.txt
#   expect exactly: Plan: 19 to add, 6 to change, 0 to destroy.   and no "changed outside of Terraform"
terraform show -json "$HOME/p6/bootstrap.tfplan" > /tmp/p6/plan.json
jq -r '.resource_changes[] | select(.change.actions != ["no-op"]) | "\(.address) \(.change.actions|join("+"))"' /tmp/p6/plan.json | LC_ALL=C sort > ~/p6/actual-changes.txt
cat > ~/p6/expected-changes.txt <<'EOF'
aws_iam_policy.deployer_allow["nonprod"] create
aws_iam_policy.deployer_allow["prod"] create
aws_iam_policy.deployer_allow_tagged["nonprod"] create
aws_iam_policy.deployer_allow_tagged["prod"] create
aws_iam_policy.deployer_read create
aws_iam_policy.deployer_session_read["nonprod"] create
aws_iam_policy.workload_boundary["nonprod"] update
aws_iam_policy.workload_boundary["prod"] create
aws_iam_role.ci["nonprod"] update
aws_iam_role.ci_session["nonprod"] create
aws_iam_role.deployer["nonprod"] update
aws_iam_role.deployer["prod"] update
aws_iam_role.deployer_session["nonprod"] create
aws_iam_role_policy.ci_session["nonprod"] create
aws_iam_role_policy.deployer["nonprod"] update
aws_iam_role_policy.deployer["prod"] update
aws_iam_role_policy.deployer_session["nonprod"] create
aws_iam_role_policy_attachment.deployer_allow["nonprod"] create
aws_iam_role_policy_attachment.deployer_allow["prod"] create
aws_iam_role_policy_attachment.deployer_allow_tagged["nonprod"] create
aws_iam_role_policy_attachment.deployer_allow_tagged["prod"] create
aws_iam_role_policy_attachment.deployer_read["nonprod"] create
aws_iam_role_policy_attachment.deployer_read["prod"] create
aws_iam_role_policy_attachment.deployer_session_read["nonprod"] create
aws_iam_role_policy_attachment.deployer_session_refresh["nonprod"] create
data.aws_iam_policy_document.deployer_session_trust["nonprod"] read
data.aws_iam_policy_document.deployer_trust["nonprod"] read
data.aws_iam_policy_document.deployer_trust["prod"] read
EOF
diff ~/p6/expected-changes.txt ~/p6/actual-changes.txt && echo ADDRESSES-OK     # must print ADDRESSES-OK
jq -r '.resource_changes[] | select(.previous_address != null) | "\(.previous_address) -> \(.address)"' /tmp/p6/plan.json
#   exactly: aws_iam_policy.workload_boundary -> aws_iam_policy.workload_boundary["nonprod"]
jq -r '.resource_changes[] | select(.change.actions==["update"]) | . as $r
  | [($r.change.before|keys[]) | select(($r.change.before[.] != $r.change.after[.]) or ($r.change.after_unknown[.]==true))]
  | "\($r.address): \(join(","))"' /tmp/p6/plan.json
#   exactly: workload_boundary["nonprod"]: policy | ci["nonprod"]: assume_role_policy |
#            deployer["nonprod"]: assume_role_policy | deployer["prod"]: assume_role_policy |
#            aws_iam_role_policy.deployer["nonprod"]: policy | aws_iam_role_policy.deployer["prod"]: policy
jq -r '.resource_changes[] | select(.address=="aws_iam_role.ci[\"nonprod\"]") | .change.after.assume_role_policy | fromjson
  | .Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]' /tmp/p6/plan.json
#   exactly: repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod
jq -r '.resource_changes[] | select(.address=="aws_iam_policy.workload_boundary[\"nonprod\"]") | .change.after.name' /tmp/p6/plan.json
#   exactly: munaxa-shared-workload-boundary
```

**Stop conditions for step 6** (any one: do not apply, paste the output to the lead):
a summary line other than `19 to add, 6 to change, 0 to destroy`; any `delete`, `create+delete`
or `delete+create`; any address not in the expected list or missing from it; any change to a
budget, ECR repository or lifecycle policy, the KMS key or alias, the bucket or its configuration,
a publisher, `aws_iam_role.ci["prod"]` or its policies; any "Objects have changed outside of
Terraform"; a changed attribute other than those listed; a second move; any error or warning about
credentials or region. A line `4 to change` (no deferred trust reads) is also a deviation to
report, although harmless.

```bash
# 7. Apply the saved plan only (never a fresh "terraform apply")
terraform apply -input=false "$HOME/p6/bootstrap.tfplan"
#   expect: Apply complete! Resources: 19 added, 6 changed, 0 destroyed.
#   For a few seconds the inline policies are already narrow while the attachments are created:
#   deployers fail closed in that window (no job should be running).

# 8. Post-apply checks
terraform plan -input=false -detailed-exitcode -no-color > ~/p6/post-apply-plan.txt; echo "exit $?"   # must print exit 0 (lead fix for review BL-2: exit code of terraform itself, not of tail)
tail -3 ~/p6/post-apply-plan.txt                                                               # No changes. Your infrastructure matches the configuration.
terraform state pull > ~/p6/bootstrap-after.tfstate
terraform output -json | jq '{session_ci_role_arns,session_deployer_role_arns,workload_boundary_arns,deployer_role_arns,ci_role_arns}' | tee ~/p6/outputs.json
#   session_ci_role_arns.nonprod       = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session
#   session_deployer_role_arns.nonprod = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session
#   workload_boundary_arns = nonprod .../policy/munaxa-shared/munaxa-shared-workload-boundary, prod ...-workload-boundary-prod
#   deployer_role_arns / ci_role_arns unchanged from G2
aws s3api head-object --bucket munaxa-shared-tfstate-229251310592 --key bootstrap/terraform.tfstate \
  --query '{sse:ServerSideEncryption,key:SSEKMSKeyId}'
#   sse = aws:kms, key = arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5
aws iam get-role --role-name munaxa-shared-ci-nonprod --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals' --output json
for r in munaxa-shared-deployer-nonprod munaxa-shared-deployer-prod munaxa-shared-deployer-nonprod-session; do
  echo "$r"; aws iam list-attached-role-policies --role-name "$r" --query 'AttachedPolicies[].PolicyName' --output text
  aws iam list-role-policies --role-name "$r" --query PolicyNames --output text; done
#   deployer-nonprod/prod: 3 attached (deployer-read, -<env>-allow, -<env>-allow-tagged) + inline "deployer"
#   session: 2 attached (deployer-read, -nonprod-session-read) + inline "session-deployer"

# 9. Owner simulation (read only): Agent 3's fixed script, 332 calls, exits non-zero on any mismatch
#    (the Phase 5 script used the mocked state key ARN in 4 cases and always exited 0)
#    Lead fix for review BL-3: the script is not in the pinned clone. Fetch it from the Phase 6 report
#    folder on main and check its sha256 before running it; STOP if the check does not print OK.
curl -fsSLo ~/p6/b2-owner-simulation.sh \
  https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-04-phase6/supporting/b2-owner-simulation.sh
echo "b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002  $HOME/p6/b2-owner-simulation.sh" | sha256sum -c - \
  && bash ~/p6/b2-owner-simulation.sh ~/p6/simulation.out; echo "exit $?"    # hash must print OK (otherwise the script does not run); must be exit 0, 0 mismatches
```

The simulation script is `supporting/b2-owner-simulation.sh` in this folder (sha256
`b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002`). **Lead note after the independent review (BL-1):** the script matches 46dfbd9 only. The independent reviewer found that the proposed patches flip 14 cases in total (not the 1 stated below), so the patches must not be merged before this re-apply unless the script is regenerated and re-reviewed. (Agent 2's original sentence here, that only case D30.1 changes, was wrong for P4 and is removed by the lead.)

**Step 10. GitHub (owner, same sitting).** On the environment `aws-nonprod-session` (Settings,
Environments), create the environment variables `AWS_CI_ROLE_ARN` = the session CI role ARN and
`AWS_DEPLOYER_ROLE_ARN` = the session deployer ARN from `~/p6/outputs.json`, both with the full
path `/munaxa-shared/bootstrap/` (the earlier plan failures were a missing path). Do not change
the repository variables: they stay the nonprod pair for `aws-nonprod`, and the job-level `if:`
(`aws-session.yml:50`) reads the repository value. Until this is set, every session run fails at
OIDC (fails closed; before G3 nothing runs). Check the next session run log: the assumed roles must
be `munaxa-shared-ci-nonprod-session` and `munaxa-shared-deployer-nonprod-session`. If Terraform
in that run tries the full deployer, N-2 is real (job-level `env`, `aws-session.yml:63`): fail
closed, fix in the workflow [U].

**Step 11. Clean up** after the lead confirms the outputs: keep `~/p6/bootstrap-before.tfstate`,
`bootstrap-after.tfstate`, `outputs.json`, `simulation.out` until the Phase 6 report is merged, then
delete them (they hold ARNs, no secrets). `/tmp/p6` can go at once.

**Rollback and recovery.**
- Prefer fix-forward: a PR, then a new reviewed re-apply with the same runbook.
- Apply failed part-way: do not reuse the plan file. Run a fresh plan; it must show only the not yet
  applied subset of the expected list. Same stop rules.
- CloudShell restarted during apply: the S3 lock (`bootstrap/terraform.tfstate.tflock`) may stay.
  Confirm no Terraform process exists, then `terraform force-unlock <ID>` with the ID from the
  error, then a fresh plan.
- State lost or corrupt: restore from `~/p6/bootstrap-before.tfstate` (or `-after`) with
  `terraform state push`, or copy the recorded S3 VersionId back. Never use an old state version to
  "undo" AWS changes.
- Reverting to the pre-#38 policies is a separate owner decision: it reopens H-1, H-2, H-2b and H-3.
  It needs `terraform state mv 'aws_iam_policy.workload_boundary["nonprod"]' aws_iam_policy.workload_boundary`
  before a plan of 1331ef8, and that plan would destroy the 19 new resources. Before G3 nothing uses
  them [E].

## 7. Proposed bootstrap patches (written and verified; the lead decides)

Numbering: the register (file 07) follows the task's R1 to R9; the code comments and test
messages in p6-01 cite the Phase 5 review numbering, where review R9 (data reads) is register R10
and review R10 (session CIDR ingress) is register R9. Register R11 to R13 are numbered the same in
both.

Both patches change only content already in the re-apply plan; the expected plan stays 19 to add,
6 to change, 0 to destroy [V-repo diff harness].

| Patch | File | Closes | Change | Verification |
| --- | --- | --- | --- | --- |
| `evidence/p6-01-residual-narrowing.patch` (sha256 `f49b3d0d6e1f13f276b93cdae4eae0bee673837b32bccdf952bf8133611ead10`) | `iam_session.tf`, `iam_allow.tf`, test | Register R10 (review R9), R11, R12, R13 | Session `servicediscovery:CreateService` by request tags only on `service/*`, `TagResource` in its own statement; `iam:CreateServiceLinkedRole` only for ecs, elasticloadbalancing and rds; deny (in the managed `-allow` policy) of log data reads, export, subscription filters, RDS log file downloads and `ecs:ExecuteCommand`; deny `acm:ExportCertificate` and `acm:RequestCertificate` with `acm:Export = ENABLED` | fmt clean, validate Success, test 10 passed (`evidence/patch1-fmt-validate-test.txt`) |
| `evidence/p6-02-boundary-no-chained-sessions.patch` (sha256 `9257a678b486d810e10252042705d1abbab9f66fd63e1e053e6d2a8e747692b3`), apply after p6-01 | `iam.tf` boundary, test | Register R7 in part (the deployer assuming a role it created) | Boundary statement `NeverFromADeployerSession`: Deny `*` when `aws:SourceIdentity` is present. Deployer sessions carry SourceIdentity = github-actions and it persists through role chaining; ECS tasks and EventBridge Scheduler set none [E, AWS STS behaviour] | test 11 passed (`evidence/patch2-fmt-validate-test.txt`) |

- Mutation checks: each change reverted on its own makes exactly its new assertion fail; 46dfbd9 with
  the new tests fails both new runs (`evidence/patch-mutation-checks.txt`) [V-repo].
- Policy sizes, minified [V-repo `evidence/policy-sizes-*.txt`]: session inline 9,800 at 46dfbd9 and
  10,040 with p6-01 (limit 10,240; that is why the new denies sit in the managed `-allow` policy);
  managed `-allow` 4,895 to 5,682 (limit 6,144); boundaries 2,635 to 2,767.
- Both apply cleanly on 46dfbd9 and b6b4a0a (`git apply --check`) [V-repo].
- Risk: R12 fails closed if the stack needs another service-linked role; R13 and R10 are denies the
  stack never uses (grep of `infra/aws/stack`, `modules` and `.github/workflows`: no log reads, no
  subscription filter, no exportable certificate) [V-repo]. p6-02 fails closed for any future flow
  that assumes a stack role from a GitHub session; none exists [V-repo].

**Compatibility with Agent 5's P3 and P4.** P1 to P4 (Agent 5) then p6-01 and p6-02 were applied to
b6b4a0a in `combo/`: the code merges cleanly; only `tests/bootstrap.tftest.hcl` conflicts, because
each patch appends a run at the end. Resolved by keeping all runs (`evidence/p6-a2-on-top-of-a5-P3P4.patch`).
Result: fmt clean, validate Success, **12 passed, 0 failed**; session inline 9,182 (P4 removes the
session rule statements); nonprod boundary 3,000 (P3 adds `TestingBackstop`); re-apply plan still
19 / 6 / 0 with the same addresses [V-repo `evidence/combined-a5P3P4-a2p1p2-fmt-validate-test.txt`,
`policy-sizes-combo.txt`, `reapply-diff-combo-summary.txt`]. p6-02 does not affect P3's scheduler
role (no source identity). If P4 is merged, p6-01's session hunk still applies (different
statements).

## 8. Remaining owner decisions [O]

1. Approve the root re-apply (one sitting with step 10) at 46dfbd920c6ee7ac940f0b7ca05656aca461f777 only
   (lead decision after review BL-1). The patches go into a later, separately approved second re-apply.
2. Decide each register risk R1 to R17 (`07-RESIDUAL-RISK-REGISTER.draft.md`): confirm the facts
   asked for, or accept formally. Claude marks nothing accepted.
3. Required approvals on platform main (register R9, R7 and R14; H-3 residual; B-11 in Phase 5).
4. Workloads in the Organizations management account (M-4): SCPs never apply here.
5. After re-apply, set the two `aws-nonprod-session` environment variables (step 10).
6. Before any prod plan: the stack must use the per-environment boundary ARN (prod fails closed
   until then; Phase 5 report 02 §4 lists the call sites).

## 9. Evidence index (all under `a2/evidence/`)

`46dfbd9-fmt-validate-test.txt`; `reapply-diff-raw.txt`, `reapply-diff-summary.txt`,
`expected-reapply-changes.txt` (sha256 `cc49c5a2...f91d662`); `reapply-diff-{p1,p12,combo}-summary.txt`;
`policy-sizes-{size-orig,p1,p12,combo}.txt`; `p6-01-residual-narrowing.patch`,
`p6-02-boundary-no-chained-sessions.patch`, `p6-a2-on-top-of-a5-P3P4.patch`;
`patch1-*.txt`, `patch2-*.txt`, `patch-mutation-checks.txt`, `combined-*.txt`; `harness/` (tfx,
tfrc, diff.tftest.hcl, size.tftest.hcl, zz_sizes.tf, sar.py); `sar/*.json` (public Service
Authorization Reference); `tf-dl/`, `prov-dl/` (downloads with SHA256SUMS).
