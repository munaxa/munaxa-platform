# 03. Terraform G3 plan integrity and bootstrap re-apply reconciliation

Phase 6, Agent 4. Date 4 Nov 2026. Account 229251310592, region eu-central-1.

Labels: [V-repo] repository evidence, [V-gh] GitHub workflow evidence, [V-aws] live AWS evidence
shown by a workflow log, [E] inferred or estimated, [U] not yet verified, [O] owner action required.

I made no AWS call, dispatched no workflow, and wrote nothing to GitHub. All Terraform runs below are
offline: Terraform 1.16.5 (SHA256 2bc2fcff...eab5e4 checked against the HashiCorp SHA256SUMS) and
hashicorp/aws 6.67.0 (SHA256 4ce94853...57f63 checked against its SHA256SUMS), from a filesystem
mirror, with mocked providers or a real provider with fake keys and every resource overridden.
Evidence folder: `evidence/` next to this file.

## 0. Short answers

| Question | Answer | Label |
| --- | --- | --- |
| True head SHA of run 41887322394 | `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (main after platform#38). The run metadata, the checkout `git rev-parse` line and the summary line ``Commit `46dfbd92...` `` all agree | [V-gh] |
| Owner's cited `46df920c6ee7ac940f0b7ca05656aca461f777` | Not an object in the repository (`git cat-file`: not a valid object name) and 38 hex characters. It is the true SHA with the two characters `bd` missing after `46df`: `46df`**`bd`**`920c6ee7...`. A transcription slip, not a different commit | [V-repo] |
| Plan result | 64 to add, 0 to change, 0 to replace, 0 to destroy | [V-gh] |
| Plan addresses vs expected list vs proposed declaration vs offline mocked plan | All four sets are identical (64 addresses, all `create`) | [V-gh] [V-repo] |
| Changes after the plan (46dfbd9 to b6b4a0a) under `infra/`, `.github/`, `scripts/` | None. b6b4a0a (#39) changes only `docs/` | [V-repo] |
| 17 versus 19 bootstrap creates | 19 is correct. The "17" text was written before the B-2 fix (commit 0ff0879 in #38) added `aws_iam_policy.deployer_session_read["nonprod"]` and `aws_iam_role_policy_attachment.deployer_session_refresh["nonprod"]` | [V-repo] (offline plan) |
| Bootstrap re-apply diff (G2 state at 1331ef8 to 46dfbd9) | 19 create, 4 real in-place updates, 1 move, 0 destroy, 0 replace. A real plan will most likely print **19 to add, 6 to change, 0 to destroy**: the 2 extra are the deployer roles, whose trust document Terraform can only read at apply time; content identical | [V-repo] for content, [E] for the printed count |
| Unexpected changes | None in the G3 plan. In the bootstrap re-apply, none beyond the 4 real updates. The Phase 5 "2 budget artifacts" cannot appear in a real plan; a budget change there means stop | [V-repo] [E] |

## 1. The GitHub runs

### 1.1 Run 41887322394 (success) [V-gh]

- Run number 23, `workflow_dispatch` on `main`, actor and triggering actor `tam2om`, created
  18:27:21Z. The Phase 5 ledger says the lead dispatched it; GitHub shows the owner's account as
  actor (the lead's GitHub connection acts as that account), so GitHub cannot tell the two apart.
- Jobs: `Plan nonprod (plan)` 126775175310 success (18:28:17 to 18:28:41); static job skipped
  (dispatch); apply job skipped (action `plan`).
- Role ARNs printed by the job: `CI_ROLE_ARN = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod`,
  `DEPLOYER_ROLE_ARN = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`.
  Both carry the `/munaxa-shared/bootstrap/` path that `infra/aws/bootstrap/iam.tf` lines 170, 503
  and 557 set [V-repo].
- OIDC: `Authenticated as assumedRoleId AROATKYDRMQALXF6TDPZ4:gha-run-41887322394` [V-aws].
- `terraform init` succeeded with the deployer assumed for the S3 backend, so the CI role to
  deployer chain, the state bucket and the state KMS key worked [V-aws].
- Plan summary step: `**Plan:** 64 to add, 0 to change, 0 to replace, 0 to destroy.` and
  `No resource is updated or replaced.` The intent check ran in `--report` mode against the
  committed, still empty `envs/nonprod.expected-changes.json`, listed all 64 as "in the plan but not
  declared" and warned. This warning is expected until the G3 declaration PR.
- The log prints no attribute value, as `aws-terraform.yml` lines 174 to 176 intend.
- One benign line: `Terraform has made some changes to the provider dependency selections recorded
  in the .terraform.lock.hcl file`. Both lock files (`infra/aws/stack/.terraform.lock.hcl`,
  `infra/aws/bootstrap/.terraform.lock.hcl`) record one `h1:` hash only; a registry install adds the
  `zh:` hashes in the runner's copy. Nothing is committed back and the provider is still verified
  ("signed by HashiCorp") [V-gh] [E].

### 1.2 Earlier failures [V-gh]

| Run | Head | Plan job time | Failure |
| --- | --- | --- | --- |
| 41820815532 (no. 19) | `c688e9ee242a46d94df09307c97fa4281da7ed78` (#37, before #38) | 12:06:48Z (created 11:26:00Z, waited for approval) | `terraform init`: Cannot assume IAM Role `arn:aws:iam::229251310592:role/munaxa-shared-deployer-nonprod`; AccessDenied for `assumed-role/munaxa-shared-ci-nonprod/gha-run-41820815532` |
| 41865393534 (no. 22) | `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (#38) | 18:16:53Z (created 16:15:25Z) | Same error, same path-less ARN |

Cause: the variable `AWS_DEPLOYER_ROLE_ARN` lacked the `/munaxa-shared/bootstrap/` path. The CI
role's inline policy allows `sts:AssumeRole` only on `aws_iam_role.deployer[each.key].arn`
(`iam.tf` line 518), which includes the path, so the path-less ARN was refused. Note the STS
assumed-role ARN never shows a path, so `assumed-role/munaxa-shared-ci-nonprod/...` is normal. The
owner fixed the variable at about 18:27; run 41887322394 printed the corrected ARN [V-gh] [V-repo].

Runs 20 (41821922893) and 21 (41824313154) are `pull_request` runs on the #38 branch heads
`8170e12` and `0ff0879`, static job only. There is no run after 41887322394 (23 runs in total).

### 1.3 Changes after the successful plan [V-repo]

`git diff --stat 46dfbd9 b6b4a0a -- infra .github scripts` is empty. The only commit, b6b4a0a
(#39), adds Phase 5 reports under `docs/`. A plan at b6b4a0a therefore runs the same Terraform code,
variables, workflow and summary scripts as run 41887322394.

## 2. Exact resource-address comparison (deliverable 1)

Sources:

1. Plan log of job 126775175310: the 64-row table (`evidence/run-41887322394-plan-table.txt`).
2. `docs/aws-migration/agent-reports/2026-11-04-phase5/supporting/g3-expected-addresses.txt`.
3. `supporting/PROPOSED-nonprod.expected-changes.json` (64 changes, every one `["create"]`).
4. A new offline mocked plan at 46dfbd9 with the real `envs/nonprod.tfvars` (copied as an
   auto.tfvars) and `deployer_role_arn` set to the pathed ARN: `Plan: 64 to add, 0 to change, 0 to
   destroy.` (`evidence/mock-g3-verbose.txt`, `evidence/mock-g3-addresses.txt`). The repository's own
   stack test file uses different variables (no `operator-test` certificate SAN, no Docs host), so I
   wrote a separate test that uses only `nonprod.tfvars`.

Result: `diff` of the sorted lists, pairwise, is empty for 1 vs 2, 1 vs 3 and 1 vs 4. Every action
is `create` in 1, 3 and 4. The repository tests also pass at 46dfbd9: stack 14 passed, bootstrap 9
passed, `fmt -check` clean (`evidence/repo-tests-46dfbd9.txt`).

Count by type (identical in all four): aws_acm_certificate 1, aws_cloudwatch_log_group 1,
aws_db_instance 1, aws_db_parameter_group 1, aws_db_subnet_group 1, aws_default_security_group 1,
aws_ecs_cluster 1, aws_ecs_cluster_capacity_providers 1, aws_iam_role 2, aws_iam_role_policy 2,
aws_internet_gateway 1, aws_kms_alias 1, aws_kms_key 1, aws_route 1, aws_route_table 2,
aws_route_table_association 5, aws_s3_bucket 2, aws_s3_bucket_cors_configuration 2,
aws_s3_bucket_lifecycle_configuration 2, aws_s3_bucket_ownership_controls 2, aws_s3_bucket_policy 2,
aws_s3_bucket_public_access_block 2, aws_s3_bucket_server_side_encryption_configuration 2,
aws_s3_bucket_versioning 1 (docs only), aws_secretsmanager_secret 10, aws_security_group 3,
aws_service_discovery_private_dns_namespace 1, aws_subnet 5, aws_vpc 1, aws_vpc_endpoint 1,
aws_vpc_security_group_egress_rule 2, aws_vpc_security_group_ingress_rule 3. Total 64.

What the plan did and did not prove [E, from code]: the stack has no AWS data source (only local
`aws_iam_policy_document` blocks in `modules/service/main.tf`, which are count 0 while services are
off), and the state was empty. So the plan's AWS calls were STS (OIDC, AssumeRole, the provider's
account check) and S3/KMS for the state and lock file. It proved the role chain and state access; it
did not exercise any create or read permission that G3's apply needs. `G3-PLAN-REVIEW.md` line 111
("AWS reads all succeeded") overstates this; the patch in section 7 corrects it.

## 3. Bootstrap re-apply reconciliation (deliverable 2)

### 3.1 Where Phase 5 states the numbers [V-repo]

All paths under `docs/aws-migration/agent-reports/2026-11-04-phase5/`.

| File and line | Text | Status |
| --- | --- | --- |
| `02-SECURITY-B2-TD14.md` 285 | "17 to add, 0 to destroy, and in-place changes" | Stale (pre B-2) |
| `02-SECURITY-B2-TD14.md` 293 | "Created (17)" with a 17-address list | Stale: lacks 2 addresses |
| `02-SECURITY-B2-TD14.md` 295 | "17 to add, 4 to change (up to 6), 0 to destroy" | Stale count; "up to 6" is right |
| `02-SECURITY-B2-TD14.md` 352 | "19 to add, 4 real changes, 0 to destroy. The harness shows 8 changes; 2 are budget artifacts and 2 are the deployer roles' trust" | Correct, written after the B-2 fix |
| `06-INDEPENDENT-REVIEW.md` 535 | "17 add, 4-6 change, 0 destroy" | Stale count |
| `00-lead-orchestrator.md` 81 | "19 to add, 4 real in-place, 0 destroy" | Correct but omits the 2 displayed trust updates |
| `DECISIONS-AND-BLOCKERS.md` 20 | "19 add, 4 real in-place changes, 0 destroy; up to 8 changes shown, of which 2 are budget artifacts and 2 are identical trust re-reads" | Count right; "budget artifacts" are harness-only |
| `NEXT-EXECUTION-PLAN.md` 11 | "19 to add ... 4 expected addresses ... Up to 8 changes may show: 2 budget artifacts and 2 identical deployer trust re-reads are harmless" | Same; the budget allowance is too loose |

Other "17" and "19" hits are unrelated: `01-GITHUB-OIDC-CI-READINESS.md` 185 (17 workflow runs),
`06-INDEPENDENT-REVIEW.md` 35 (IAM 17 in the G2 inventory), `03-...` 81 (19 task definitions),
cost figures in `04-...`, Prisma 6.19.3 and "17 commits behind" in `05-...`.

### 3.2 Baseline: what AWS holds [V-repo]

Phase 4 (`docs/aws-migration/agent-reports/2026-10-31-phase4/G2-EXECUTION-REPORT.md` lines 17, 34,
35, 131): G2 applied 49 resources at 351352a, then the platform#33 fix was re-applied at
`1331ef89a7906b75292bb35554eac9659270c0f2` (0 added, 2 changed), and the replan said "No changes".
`git log 1331ef8..46dfbd9 -- infra/aws/bootstrap` contains only 46dfbd9 (#38). So the true diff is
the bootstrap at 1331ef8 versus 46dfbd9 with default variables (G2 used no tfvars).

### 3.3 Method (offline, credential-free)

1. Address sets: mocked plans of both versions. 1331ef8: 49 addresses. 46dfbd9: 68 addresses
   (`evidence/bootstrap-old-addresses.txt`, `bootstrap-new-addresses.txt`).
2. Content: a `terraform test` harness (`evidence/bootstrap-cfgdiff.tftest.hcl`) applies each
   version into its own test state with the real AWS provider (fake keys, all skip flags) and every
   managed resource overridden with the same fixed ARNs, so no API call is made and every
   `aws_iam_policy_document` renders real JSON. `evidence/cmp_states.py` compares the two states
   per address (moved mapping applied, override-generated random 8-character values masked).
   Result: `evidence/bootstrap-reapply-summary.txt` and `bootstrap-reapply-real-diffs.txt`.
3. A second harness (`evidence/bootstrap-reapply-diff.tftest.hcl`) applies 1331ef8, re-plans it
   (baseline) and plans 46dfbd9 on the same state. It reproduces the kind of artifacts Phase 5 saw
   (budget notifications, `tags_all`, a KMS replace) in the baseline as well, which proves they come
   from overrides, not from code (`evidence/bootstrap-reapply-classified.txt`).

### 3.4 The true expected re-apply diff

**Created (19)** [V-repo]:

| # | Address | Reason |
| --- | --- | --- |
| 1 | `aws_iam_policy.workload_boundary["prod"]` | H-1: one boundary per environment (`munaxa-shared-workload-boundary-prod`) |
| 2 | `aws_iam_policy.deployer_read` | B2: reads moved out of the inline policy |
| 3, 4 | `aws_iam_policy.deployer_allow["nonprod"]`, `["prod"]` | B2 allow-list on own names |
| 5, 6 | `aws_iam_policy.deployer_allow_tagged["nonprod"]`, `["prod"]` | B2 allow-list on own tags |
| 7, 8 | `aws_iam_role_policy_attachment.deployer_read["nonprod"]`, `["prod"]` | attach 2 |
| 9, 10 | `aws_iam_role_policy_attachment.deployer_allow["nonprod"]`, `["prod"]` | attach 3, 4 |
| 11, 12 | `aws_iam_role_policy_attachment.deployer_allow_tagged["nonprod"]`, `["prod"]` | attach 5, 6 |
| 13 | `aws_iam_role.ci_session["nonprod"]` | H-3 session CI role |
| 14 | `aws_iam_role_policy.ci_session["nonprod"]` | its inline policy |
| 15 | `aws_iam_role.deployer_session["nonprod"]` | H-3 session deployer |
| 16 | `aws_iam_role_policy.deployer_session["nonprod"]` | its inline policy |
| 17 | `aws_iam_role_policy_attachment.deployer_session_read["nonprod"]` | attaches `deployer_read` to the session deployer (`iam_session.tf` 242 to 247) |
| 18 | `aws_iam_policy.deployer_session_read["nonprod"]` | **B-2 fix, missing from the "17" list** (`munaxa-shared-deployer-nonprod-session-read`) |
| 19 | `aws_iam_role_policy_attachment.deployer_session_refresh["nonprod"]` | **B-2 fix, missing from the "17" list**; attaches 18 (`iam_session.tf` 304 to 309) |

So 17 + 2 = 19. The confusion came from the similar names: the "17" list already had the
attachment `deployer_session_read`, which attaches `deployer_read`, not the new policy
`deployer_session_read`.

**Moved (1)** [V-repo]: `aws_iam_policy.workload_boundary` to
`aws_iam_policy.workload_boundary["nonprod"]` (`iam.tf` lines 33 to 36). The name stays
`munaxa-shared-workload-boundary` in both versions, so no replacement; the moved address is also
updated (row 1 below).

**Updated in place, real content changes (4)** [V-repo]:

| Address | What changes |
| --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` (after the move) | 9 to 14 statements. Removed `KmsUse`; added `EcrSignIn`, `NeverTheOtherEnvironment`, `OwnKeys`, `OwnRdsMasterSecret`, `OwnRdsMasterSecretByTag`, `PassOwnRoles`. `EcrPull` narrowed to `repository/munaxa-*`, `Logs` to `/munaxa/nonprod/*`, `OwnSecrets` to `munaxa-nonprod/*` (prod and `rds!*` removed from it). A managed-policy update creates a new default version [E] |
| `aws_iam_role_policy.deployer["nonprod"]` | 19 to 21 statements. Removed `StackServices`, `FileBuckets`, `ManageSharedRoles`, `RolesUnderSharedPathWithBoundary`, `ServiceLinkedRoles`, `DataKeyThroughRdsAndSecretsManager` (moved to the managed allow policies); added `CreatesCarryProjectTag`, `CreatesCarryEnvironmentTag`, `NeverAccountSettingsOrSharing`, `NeverProtectedVpcs`, `NeverInProtectedVpcs`, `NeverProtectedVpcsInZones`, `NeverSharedAliases`, `ProtectStateKeyAndBucket` |
| `aws_iam_role_policy.deployer["prod"]` | The same statement changes for prod |
| `aws_iam_role.ci["nonprod"]` | Trust only: the `sub` condition goes from `[...environment:aws-nonprod, ...environment:aws-nonprod-session]` to `repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod`. The plan job's environment `aws-nonprod` stays trusted |

**Shown as updated, identical content (2)** [E]: `aws_iam_role.deployer["nonprod"]` and
`["prod"]`. `data.aws_iam_policy_document.deployer_trust` references `aws_iam_role.ci[each.key].arn`
(`iam.tf` line 156). Because `aws_iam_role.ci` has a pending change, Terraform defers that data
source to apply time for both keys, so `assume_role_policy` shows as "(known after apply)". The
rendered trust is identical in both versions (harness: SAME).

**Unchanged (44)** [V-repo]: both budgets, 11 ECR repositories and 11 lifecycle policies, the state
KMS key, alias, bucket and its 5 configuration resources, `aws_iam_role.ci["prod"]`, both
`aws_iam_role_policy.ci`, the 4 publisher roles and their 4 inline policies. `budget.tf`,
`main.tf` and `providers.tf` are byte-identical between 1331ef8 and 46dfbd9.

**Destroyed: none. Replaced: none** [V-repo].

**Expected real plan line** [E]: `Plan: 19 to add, 6 to change, 0 to destroy.` with one "has moved"
note. 4 to change is possible only if Terraform resolves the deferred trust read at plan time, which
the current code prevents. 

Why "8 changes" in Phase 5: Agent 2's harness added 2 budget updates that came from overriding
budget notifications (my baseline run shows the same budget, `tags_all` and KMS artifacts with no
code change). After G2 the real replan was "No changes", and `budget.tf` is unchanged, so a budget
update in the real plan would mean drift and is a stop condition, not a harmless artifact.

Other re-apply notes [V-repo]: `backend.tf` gains `kms_key_id` (needs `terraform init -reconfigure`,
same bucket and key). The default variable `deploy_environments.nonprod` drops `aws-nonprod-session`
and a new `session_environments` variable holds it.

## 4. Expected G3 creates (deliverable 3)

Exactly the 64 addresses of `supporting/g3-expected-addresses.txt`, all `create`, as listed in
section 2 and in `evidence/run-41887322394-plan-table.txt`. In words: the VPC with internet gateway,
public route, 2 route tables, 5 subnets (public a, b; db a, b, c), 5 route table associations, S3
gateway endpoint and the managed default security group; 3 security groups (alb, database,
db_admin) with 2 egress and 3 ingress rules; the database instance, parameter group and subnet
group; the data KMS key and alias; 10 Secrets Manager secret containers (no values); 2 file buckets
(docs, school) with CORS, lifecycle, ownership, policy, public access block and encryption, and
versioning on docs; the ECS cluster and capacity providers; the Cloud Map private namespace; the
ops log group; 2 db-admin execution roles with their inline policies; the ACM certificate request.
Nothing for edge or services (both false), no task definitions, no images.

These creates do not depend on the bootstrap re-apply: the stack code is the same, so the address
list after the re-apply must be identical [E].

## 5. Unexpected changes (deliverable 4)

- G3 plan (run 41887322394): none. 0 update, 0 replace, 0 destroy, no address outside the
  expected list [V-gh].
- Code after the plan: none in infra, workflows or scripts [V-repo].
- Bootstrap re-apply: none beyond the 4 real updates, the 2 deferred trust displays, the 19 creates
  and the move [V-repo] [E].
- Documentation defects (not infrastructure): the stale "17" counts, the "up to 8 / budget
  artifacts are harmless" allowance, and the overstated "AWS reads" claim. Patch in section 7.

## 6. Safe plan-generation procedure after the bootstrap re-apply (deliverable 5)

Do not dispatch now: a plan today runs under the pre-#38 deployer policy and cannot satisfy the
post-re-apply gate (Phase 5 B-4). This is the procedure for after step 6.1.

**Preconditions** [O]:

1. Root re-apply of `infra/aws/bootstrap` at main (46dfbd9 code; b6b4a0a is identical under infra)
   in CloudShell, with its plan matching section 3.4 exactly: 19 to add, 6 to change (the 4 real
   addresses plus `aws_iam_role.deployer["nonprod"]` and `["prod"]`), 0 to destroy, 1 moved. Record
   the UTC time of "Apply complete".
2. Post-apply replan shows "No changes".
3. `b2-owner-simulation.sh` reports 0 mismatches.
4. `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on `aws-nonprod` stay as they are (role names and
   paths do not change): CI `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod`,
   deployer `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`.
   The session pair goes on `aws-nonprod-session` only.
5. No `aws-session.yml` or `aws-terraform.yml` job runs during the re-apply.

**Dispatch** (lead, or the owner in the Actions tab; I did not run it):

- Workflow: `AWS Terraform` (`.github/workflows/aws-terraform.yml`), "Run workflow".
- Use workflow from: branch `main` (the job refuses any other ref, line 111).
- Inputs: `environment` = `nonprod`, `action` = `plan`.
- Equivalent CLI: `gh workflow run aws-terraform.yml --repo munaxa/munaxa-platform --ref main -f environment=nonprod -f action=plan`.

**Approval**: the `Plan nonprod (plan)` job waits on the protected `aws-nonprod` environment; the
owner (tam2om, the required reviewer) approves it. With `action = plan`, the apply job is skipped
and nothing is saved or applied.

**The log must show** [V-gh pattern from run 41887322394]:

1. The run was created after the recorded re-apply time, and its head SHA is current main (b6b4a0a
   or a later commit whose diff from 46dfbd9 under `infra/`, `.github/`, `scripts/` is empty or
   reviewed).
2. `DEPLOYER_ROLE_ARN: arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`
   and the same pathed CI role in `role-to-assume`.
3. `Authenticated as assumedRoleId ...:gha-run-<run id>`, `Successfully configured the backend "s3"`,
   `Terraform has been successfully initialized!`.
4. ``Commit `<head sha>`.`` equal to the run's head SHA.
5. `**Plan:** 64 to add, 0 to change, 0 to replace, 0 to destroy.` and `No resource is updated or replaced.`
6. The address table equals `supporting/g3-expected-addresses.txt` line for line after
   `LC_ALL=C sort`, every action `create`.
7. Intent: before the declaration PR, the `--report` warning listing exactly those 64 as "in the
   plan but not declared" and nothing "declared but not in the plan". After the declaration PR, a
   match.

**Stop conditions**: any `AccessDenied`, `Cannot assume IAM Role` or other error; a head SHA other
than the expected one; a count other than 64 creates; any update, replace, delete or read; any
address added or missing; the run created before the re-apply finished; any attribute value in the
log. The lock-file message about provider selections is expected and not a stop.

**What this plan still cannot prove** [E]: as section 2 explains, the plan makes only STS and
state calls, so it confirms the post-#38 role chain and state access but not that the allow-list
admits the 64 creates. That rests on `b2-owner-simulation.sh` (G3 coverage) and, in the end, on the
G3 apply itself. Next, the declaration PR copies `supporting/PROPOSED-nonprod.expected-changes.json`
to `infra/aws/stack/envs/nonprod.expected-changes.json`, and the apply dispatch (`action = apply`)
enforces it, with the 4-hour and same-commit checks (workflow lines 269 to 281).

## 7. Proposed patch (lead decides)

`evidence/patch-phase5-count-corrections.diff` (6 files, 8 lines, docs only, made against b6b4a0a):

- `02-SECURITY-B2-TD14.md` lines 285, 293, 295: 17 to 19, the two missing addresses, "19 to add, 6
  to change (4 real), 0 to destroy, 1 moved".
- `00-lead-orchestrator.md` 81, `DECISIONS-AND-BLOCKERS.md` 20, `NEXT-EXECUTION-PLAN.md` 11,
  `06-INDEPENDENT-REVIEW.md` 535: the same count, with a budget change made a stop condition.
- `G3-PLAN-REVIEW.md` 111: "AWS reads all succeeded" replaced by what the plan actually exercised.

Optional, not written as a patch [E]: add `zh:` hashes to both lock files
(`terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`) with registry access, to
silence the lock-file message. No functional effect.

## 8. Evidence index (`evidence/`)

- `gh-runs-extract.txt`: run metadata and the log lines quoted above.
- `run-41887322394-plan-table.txt`: the 64 addresses from the plan log.
- `mock-g3-verbose.txt`, `mock-g3-addresses.txt`, `mock-g3-actions.txt`, `proposed.txt`.
- `repo-tests-46dfbd9.txt`: fmt, validate, tests.
- `bootstrap-old-addresses.txt`, `bootstrap-new-addresses.txt`, `bootstrap-only-new.txt`,
  `bootstrap-only-old.txt`, `bootstrap-*-mockplan.txt`, `bootstrap-blocks.txt`.
- `bootstrap-cfgdiff.tftest.hcl`, `bootstrap-cfgdiff-verbose.txt`, `cmp_states.py`,
  `bootstrap-reapply-summary.txt`, `bootstrap-reapply-real-diffs.txt` (the "aws_s3_bucket_versioning"
  entry in that file is the output block at the end of the run, a parsing artifact, not a change).
- `bootstrap-reapply-diff.tftest.hcl`, `bootstrap-reapply-diff-verbose.txt`, `cmp_blocks.py`,
  `bootstrap-reapply-classified.txt`: the baseline harness that shows the override artifacts.
- `patch-phase5-count-corrections.diff`.
