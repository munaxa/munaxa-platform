# G2 execution report: phase 4, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Times are UTC. Every AWS command below ran as **root in AWS CloudShell** in Tamer's
browser session; Tamer pasted the output into the project thread and the lead checked each stage
against the stop conditions before the next one was sent. No credential left CloudShell.

## 1. Account, region, code

| Item | Value | Label |
| --- | --- | --- |
| Account | `229251310592` (`aws sts get-caller-identity`) | [V] |
| Region | `eu-central-1` (`AWS_REGION`/`AWS_DEFAULT_REGION` set in CloudShell; the state key ARN and ECR region confirm it) | [V] |
| Terraform | `v1.16.5 on linux_amd64`, from releases.hashicorp.com, `sha256sum -c` against `terraform_1.16.5_SHA256SUMS`: `OK` | [V] |
| AWS provider | `hashicorp/aws v6.67.0` (lock file) | [V] |
| Initial apply commit | `351352a8bdd20502c982f61a771f1f5939419040` (main after the phase 3 reports, #32; differs from `fc87e94` only under `docs/`) | [V] |
| Fix re-apply commit | `1331ef89a7906b75292bb35554eac9659270c0f2` (main after platform#33; `git diff --stat 351352a 1331ef8 -- infra`: `iam.tf` and its test only) | [V] |
| Identity used | Root, CloudShell (decision of 29 Oct). Tamer also said "try to do it yourself" (06:06); the AWS connector stayed signed out all phase, so it was never used | [V] |

## 2. Timeline

| Time | Event |
| --- | --- |
| 05:46 | Brief received; phase 3 reports read; stage 1 commands sent |
| 12:39 | Stage 1 run. The read-only pre-checks passed; the Terraform download failed because the CloudShell home volume (1 GB) was full |
| 12:41–12:43 | Work moved to `/tmp/g2`; init, saved plan, address check |
| 12:43 | Plan summary `{"create":49,"read":4}`; **stopped** on the difference; Tamer approved applying the saved plan (decision card, 12:43:35) |
| 12:45:18 | `terraform apply g2.tfplan`: **49 added, 0 changed, 0 destroyed**; local state (183,007 B) copied to `~/g2-local-state-backup.tfstate`, `cmp` verified |
| ~13:20 | CloudShell had restarted while idle; `/tmp/g2` was gone before `-migrate-state` |
| 13:22 | Recovery: fresh clone at `351352a`, state restored from the verified backup, local plan **No changes** (exit 0), then `init -migrate-state` → S3 |
| 13:25 | Post-apply verification: all checks pass **except** one simulation (`Project=munaxa, Environment=nonprod` → `explicitDeny`); **stopped** |
| 13:27 | Diagnosis confirmed (defect in platform#31's N-2 denies, §7) |
| 13:28–13:40 | platform#33 opened, CI green, merged `1331ef8`; Tamer approved a re-apply (decision card, 13:29) |
| 13:41 | Re-apply plan: **0 add, 2 change, 0 destroy**, only `aws_iam_role_policy.deployer["nonprod"|"prod"]` |
| 13:42:03 | Re-apply: **0 added, 2 changed, 0 destroyed**; replan No changes; 7 simulations as intended |

## 3. Pre-checks (runbook §3 step 1) — all passed [V]

| Check | Expected | Actual |
| --- | --- | --- |
| Account | `229251310592` | `229251310592` |
| `/munaxa-shared/` roles | `[]` | `[]` |
| `/munaxa-shared/` policies | `[]` | `[]` |
| State bucket `head-bucket` | 404 | `An error occurred (404) when calling the HeadBucket operation: Not Found` |
| Alias `alias/munaxa-shared-tfstate` | `[]` | `[]` |
| Product ECR repositories | `[]` | `[]` |
| Budgets | Docs budgets only, no `munaxa-shared-*` | `munaxa-account-monthly`, `munaxa-docs-eu-prod-monthly` |
| GitHub OIDC provider | `…:oidc-provider/token.actions.githubusercontent.com` | same |

## 4. Plan (runbook §3 step 2)

Local state (`backend.tf` moved to `backend.tf.off`), `terraform init` exit 0, `terraform plan -out=g2.tfplan` exit 0:

- `Plan: 49 to add, 0 to change, 0 to destroy.` [V]
- Action summary: `{"create":49,"read":4}`. The runbook expected `{"create":49}`. The four `read`
  entries are `data.aws_iam_policy_document.deployer["nonprod"|"prod"]` and
  `data.aws_iam_policy_document.deployer_trust["nonprod"|"prod"]`: local policy-document data
  sources that Terraform defers to apply time because they embed ARNs of resources not yet created
  (`iam.tf` references `aws_iam_role.ci[...].arn`, `aws_s3_bucket.state.arn`,
  `aws_kms_key.state.arn`). They make no AWS call and change nothing. Per the brief, execution
  stopped and Tamer approved the apply on that evidence. [V]
- The 49 resource addresses were sorted (`LC_ALL=C sort`) and compared line by line with the
  runbook §4 inventory: **identical** (`diff` empty). [V]

The 49 addresses created:

```text
aws_budgets_budget.account
aws_budgets_budget.testing
aws_ecr_lifecycle_policy.image["munaxa-control/api"]
aws_ecr_lifecycle_policy.image["munaxa-control/migrate"]
aws_ecr_lifecycle_policy.image["munaxa-control/portal"]
aws_ecr_lifecycle_policy.image["munaxa-identity/api"]
aws_ecr_lifecycle_policy.image["munaxa-identity/migrate"]
aws_ecr_lifecycle_policy.image["munaxa-school/admin"]
aws_ecr_lifecycle_policy.image["munaxa-school/api"]
aws_ecr_lifecycle_policy.image["munaxa-school/migrate"]
aws_ecr_lifecycle_policy.image["munaxa-work/admin"]
aws_ecr_lifecycle_policy.image["munaxa-work/api"]
aws_ecr_lifecycle_policy.image["munaxa-work/migrate"]
aws_ecr_repository.image["munaxa-control/api"]
aws_ecr_repository.image["munaxa-control/migrate"]
aws_ecr_repository.image["munaxa-control/portal"]
aws_ecr_repository.image["munaxa-identity/api"]
aws_ecr_repository.image["munaxa-identity/migrate"]
aws_ecr_repository.image["munaxa-school/admin"]
aws_ecr_repository.image["munaxa-school/api"]
aws_ecr_repository.image["munaxa-school/migrate"]
aws_ecr_repository.image["munaxa-work/admin"]
aws_ecr_repository.image["munaxa-work/api"]
aws_ecr_repository.image["munaxa-work/migrate"]
aws_iam_policy.workload_boundary
aws_iam_role.ci["nonprod"]
aws_iam_role.ci["prod"]
aws_iam_role.deployer["nonprod"]
aws_iam_role.deployer["prod"]
aws_iam_role.publisher["munaxa-control"]
aws_iam_role.publisher["munaxa-identity"]
aws_iam_role.publisher["munaxa-school"]
aws_iam_role.publisher["munaxa-work"]
aws_iam_role_policy.ci["nonprod"]
aws_iam_role_policy.ci["prod"]
aws_iam_role_policy.deployer["nonprod"]
aws_iam_role_policy.deployer["prod"]
aws_iam_role_policy.publisher["munaxa-control"]
aws_iam_role_policy.publisher["munaxa-identity"]
aws_iam_role_policy.publisher["munaxa-school"]
aws_iam_role_policy.publisher["munaxa-work"]
aws_kms_alias.state
aws_kms_key.state
aws_s3_bucket.state
aws_s3_bucket_ownership_controls.state
aws_s3_bucket_policy.state
aws_s3_bucket_public_access_block.state
aws_s3_bucket_server_side_encryption_configuration.state
aws_s3_bucket_versioning.state
```

No `-target`, `-replace` or `-auto-approve` was used; both applies applied a saved plan file.

## 5. Apply and state migration

| Step | Result | Label |
| --- | --- | --- |
| `terraform apply g2.tfplan` (12:45:18) | exit 0, `Apply complete! Resources: 49 added, 0 changed, 0 destroyed.` | [V] |
| Local state backup | `terraform.tfstate` 183,007 B → `~/g2-local-state-backup.tfstate`, `cmp`: identical | [V] |
| CloudShell restart (deviation) | `/tmp` was cleared before `-migrate-state`. Recovery (runbook §8 "the local state is still the truth"): fresh clone at `351352a`, backup restored as `terraform.tfstate` (`cmp` identical), `terraform plan -detailed-exitcode` **exit 0, No changes** — the restored state matched AWS before it was migrated | [V] |
| `terraform init -migrate-state` | "Successfully configured the backend "s3"", copy answered `yes` | [V] |
| Remote state | `s3://munaxa-shared-tfstate-229251310592/bootstrap/terraform.tfstate`, 183,006 B, 13:22:13 (Terraform re-serialises on migration) | [V] |
| Plan against S3 | `-detailed-exitcode` **exit 0**, "No changes" | [V] |
| After the fix re-apply | replan against S3 exit 0, "No changes" | [V] |
| S3 versions (13:43) | current `bootstrap/terraform.tfstate` 201,237 B (13:42:09, after the fix apply); previous 183,006 B (13:22:13); lock objects only as noncurrent versions | [V] |
| Local state removal (13:43) | after the checks above: `removed …/terraform.tfstate`, `…/terraform.tfstate.backup`, `…/fix.tfplan`, `~/g2-local-state-backup.tfstate` (`g2.tfplan` had already gone with the restart) | [V] |

## 6. Post-apply verification (runbook §3 step 4, extended)

| Area | Check | Actual | Label |
| --- | --- | --- | --- |
| Bucket | Versioning | `Enabled` | [V] |
| Bucket | Public access block | all four `true` | [V] |
| Bucket | Encryption | `aws:kms`, key `arn:aws:kms:eu-central-1:229251310592:key/679d1b6b-cb6a-491b-a585-cb630b3fbce5`, `BucketKeyEnabled: true`, SSE-C blocked | [V] |
| KMS | Alias target | `alias/munaxa-shared-tfstate` → the same key ARN | [V] |
| KMS | Rotation | enabled, period 365 days, next 2027-10-31 | [V] |
| Bucket | Ownership | `BucketOwnerEnforced` | [V] |
| Bucket | Policy | one statement `TlsOnly`, `Deny` when `aws:SecureTransport = false` | [V] |
| Bucket | Remote state | present (§5) | [V] |
| IAM | `munaxa-shared-ci-nonprod` trust | GitHub OIDC provider; `aud = sts.amazonaws.com`, `ref = refs/heads/main`, `sub` ∈ {`repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod`, `…:environment:aws-nonprod-session`} (StringEquals) | [V] |
| IAM | `munaxa-shared-ci-prod` trust | same, `sub = …:environment:aws-prod` | [V] |
| IAM | Deployer trusts | `munaxa-shared-deployer-<env>` trusts only `munaxa-shared-ci-<env>` with `sts:SourceIdentity = github-actions` | [V] |
| IAM | Publisher trusts ×4 | GitHub OIDC; `aud = sts.amazonaws.com`; `sub = repo:munaxa@311481412/munaxa-<product>@<id>:environment:image-release` (identity 1354378376, control 1434295290, work 1318345640, school 1318345275); `ref` StringLike `refs/tags/image/*` | [V] |
| IAM | Deployer deny statements (both) | `ThisRegionOnly NeverMunaxaDocsOrBootstrap NeverMunaxaDocsProductionByTag NeverTagAsMunaxaDocs NeverAnotherProjectByTag NeverTagForAnotherProject NeverTheOtherEnvironmentByTag NeverCreateForTheOtherEnvironment NeverTheOtherEnvironmentByName NoSecretValuesNoUsersNoKeys` | [V] |
| ECR | Count (runbook query) | `11` | [V] |
| ECR | Each repository | all 11 `IMMUTABLE`, scan on push `True`, lifecycle policy with 2 rules | [V] |
| Budgets | `munaxa-shared-*` | `munaxa-shared-account-monthly 50.0`, `munaxa-shared-testing-monthly 50.0` | [V] |
| Billing | Cost allocation tags before activation | `Environment` and `Project`: `Inactive` (UserDefined) | [V] |
| CloudTrail | Runbook §9 item 5 (no resource outside §4 changed) | Not run: an account-wide event listing could surface other workloads, which the brief forbids inspecting. The plan/apply outputs (49 add, then 2 change, nothing else) are the evidence | [U] |

## 7. IAM policy simulations

### 7.1 Runbook simulations, after the first apply (13:25)

| # | Context | Expected | Actual |
| --- | --- | --- | --- |
| 1 | `Project=MunaxaDocs`; `ec2:DeleteSecurityGroup`, `elasticloadbalancing:DeleteLoadBalancer`, `rds:DeleteDBInstance` | explicitDeny ×3 | explicitDeny ×3 [V] |
| 2 | `Project=other` | explicitDeny | explicitDeny [V] |
| 3 | `Project=munaxa`, `Environment=nonprod` | **allowed** | **explicitDeny** [V] — mismatch, G2 stopped |
| 4 | `Environment=prod` | explicitDeny | explicitDeny [V] |

### 7.2 Diagnosis (13:27, `aws:RequestedRegion=eu-central-1` added)

| Case | Context | Result |
| --- | --- | --- |
| A | resource tags `Project=munaxa`, `Environment=nonprod`; no request tag | explicitDeny |
| B | A + `aws:RequestTag/Project=munaxa` | allowed |
| C | `ec2:DescribeVpcs`, no tags | explicitDeny |

Cause [V]: platform#31's `NeverAnotherProjectByTag` and `NeverTagForAnotherProject` used
`StringNotEquals` on `aws:ResourceTag/Project` / `aws:RequestTag/Project`. A negated condition
operator is **true when its key is absent**, so every request without a Project tag (every
`Describe*`, every call on an untagged resource, every delete) was denied. The defect failed closed
(the deployer could do almost nothing), so there was no exposure, but the first nonprod plan would
have failed. The runbook's simulation 3 also omits `aws:RequestedRegion`, which `ThisRegionOnly`
(`StringNotEquals aws:RequestedRegion`) needs for the same reason; real regional calls always carry
it.

Fix: platform#33 (`Null = false` on the same key in both statements, test asserting it, mutation
check), merged `1331ef8`, re-applied 13:42:03 with Tamer's approval (0 added, 2 changed, 0
destroyed; replan No changes).

### 7.3 Simulations after the fix (13:42, all with `aws:RequestedRegion=eu-central-1`) [V]

| # | Principal | Action / context | Expected | Actual |
| --- | --- | --- | --- | --- |
| 1 | deployer-nonprod | 3 delete actions, `Project=MunaxaDocs` | explicitDeny | explicitDeny ×3 |
| 2 | deployer-nonprod | `ec2:DeleteSecurityGroup`, `Project=other` | explicitDeny | explicitDeny |
| 3 | deployer-nonprod | same, `Project=munaxa`, `Environment=nonprod` | allowed | **allowed** |
| 4 | deployer-nonprod | same, `Environment=prod` | explicitDeny | explicitDeny |
| 5 | deployer-nonprod | `ec2:DescribeVpcs`, no tags | allowed | allowed |
| 6 | deployer-nonprod | `ec2:CreateVpc`, `RequestTag/Project=other` | explicitDeny | explicitDeny |
| 7 | deployer-prod | `ec2:DeleteSecurityGroup`, `Environment=nonprod` | explicitDeny | explicitDeny |

A successful simulation is **not** proof that untagged resources are protected: after the fix, by
design, the two Project statements do not match a resource without a Project tag. That residual (B2,
TD-14) is a G3 prerequisite (SECURITY-VERIFICATION §5).

## 8. GitHub environments and variables

Not doable from this session: the GitHub tools available here cannot create environments or
variables, and the brief forbids letting a workflow create an environment. The exact steps were
given to Tamer in the order the runbook requires (environments first). Status: see
MASTER-EXECUTION-STATUS §4. [O]

## 9. Cost allocation tags

Before: `Environment` and `Project` both `Inactive` [V]. `aws ce update-cost-allocation-tags-status
--cost-allocation-tags-status TagKey=Environment,Status=Active TagKey=Project,Status=Active` (13:43)
returned `"Errors": []`; `list-cost-allocation-tags` then showed both **Active**, last updated
2026-10-31T13:43:41Z [V]. Cost data can take up to 24 hours to carry them, so the Testing budget may
read US$0 until then [E].
