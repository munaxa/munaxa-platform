# G2 bootstrap readiness: phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

This file is the preparation the brief asks for. **Nothing in it has been executed against AWS.**
G2 needs Tamer's explicit approval after this report.

## 1. What was checked, and how

| Check | Result | Evidence |
| --- | --- | --- |
| `terraform fmt -check -recursive infra/aws` | Clean [V] | Local, Terraform 1.16.5 (releases.hashicorp.com), aws provider 6.67.0 (the lock file's version, from a local filesystem mirror) |
| `terraform validate` bootstrap and stack | Valid [V] | Same |
| `terraform test` bootstrap | **4 passed**, 0 failed [V] | Includes the new N-2 run (platform#31) and the resource-count assertion |
| `terraform test` stack | **14 passed**, 0 failed [V] | Mocked provider |
| Mutation: N-2 deny value changed to `munaxa-x` | The N-2 run fails, as intended [V] | Local |
| GitHub CI on platform#31 | See MASTER-EXECUTION-STATUS (run ids recorded there) | — |
| Real `terraform plan` against AWS | **Not run** [U] | The only AWS access is the connector, which needs a new sign-in and is root. The brief forbids a plan through root |
| IAM Access Analyzer `ValidatePolicy` on the rendered deployer policy | **Not run** [U] | Same reason. Step 3 of the checklist below runs the equivalent check after apply |

## 2. Review of the bootstrap configuration (`infra/aws/bootstrap`, main after platform#31)

| Area | Finding | Label |
| --- | --- | --- |
| **IAM role separation** | `munaxa-shared-ci-{nonprod,prod}` and `munaxa-shared-deployer-{nonprod,prod}` (`for_each` over `deploy_environments`, validated to exactly `nonprod`, `prod`). Each CI role's only permission is `sts:AssumeRole` + `sts:SetSourceIdentity` on its own deployer. Each deployer trusts only its own CI role with `sts:SourceIdentity = github-actions` | [V] (`iam.tf`, test `one_ci_role_and_one_deployer_per_environment`) |
| **OIDC trust conditions** | CI roles: `aud = sts.amazonaws.com`, `sub` = `repo:munaxa@311481412/munaxa-platform@1318353961:environment:<env>` for `aws-nonprod` + `aws-nonprod-session` (nonprod) or `aws-prod` (prod), `ref = refs/heads/main`, all `StringEquals`. Publishers: `sub` = `repo:munaxa@311481412/<repo>@<id>:environment:image-release`, `ref` like `refs/tags/image/*` | [V] code; **subject form [V] against GitHub** (SECURITY §2, P11) |
| **State bucket** | `munaxa-shared-tfstate-229251310592`: versioning on, SSE-KMS with a dedicated key (rotation on, 30-day deletion window), bucket key on, all four public-access blocks, `BucketOwnerEnforced`, TLS-only bucket policy | [V] (`main.tf`) |
| **State locking** | S3 native lock file (`use_lockfile = true`) in both `bootstrap/backend.tf` and `stack/backend.tf`; no DynamoDB table. Needs Terraform ≥ 1.10; pinned `~> 1.16.5`. Each deployer may write only `<env>/*`, which covers `<env>/stack.tfstate.tflock` | [V] |
| **KMS** | One key in bootstrap: the state key, alias `alias/munaxa-shared-tfstate`, default key policy (account root). The deployer may use it only for `Encrypt`/`Decrypt`/`GenerateDataKey`. The Control licence key and the data key are **not** in bootstrap (they are `stack/`, G3) | [V] |
| **ECR** | 11 repositories (`munaxa-identity/{api,migrate}`, `munaxa-control/{api,migrate,portal}`, `munaxa-work/{api,admin,migrate}`, `munaxa-school/{api,admin,migrate}`), immutable tags, scan on push, AES256. Lifecycle: untagged after 7 days; keep the last 20 tagged | [V] (test asserts 11 + 11) |
| **Budgets** | `munaxa-shared-account-monthly` US$50 (80 % and 100 % actual, 100 % forecast) and `munaxa-shared-testing-monthly` US$50 on `user:Environment$nonprod` (80 % actual, 100 % forecast), both to admin@ and alert@munaxa.com | [V] (test `testing_has_its_own_budget`) |
| **Outputs** | `state_bucket`, `ci_role_arns` (map), `deployer_role_arns` (map), `image_publisher_role_arns` (map), `ecr_repositories`, `workload_boundary_arn` | [V] (`outputs.tf`) |
| **Workflow references** | `aws-terraform.yml` and `aws-session.yml` read `vars.AWS_CI_ROLE_ARN` / `vars.AWS_DEPLOYER_ROLE_ARN`; the nonprod pair is repository variables, the prod pair `aws-prod` environment variables. Product publish workflows read `AWS_IMAGE_PUBLISHER_ROLE_ARN`. All jobs that hold AWS credentials pin actions by SHA | [V] |
| **Old Docs Production** | Each deployer denies, by name: `role/munaxa-docs/*`, `secret:munaxa-docs*`, `db:munaxa-docs*`, `cluster/munaxa-docs*`, `s3:::munaxa-docs*`; by tag: anything `Project = MunaxaDocs` and creating/tagging with it; and (platform#31) anything whose `Project` is not `munaxa`. Every Docs Terraform root sets `Project = MunaxaDocs` in `default_tags` (munaxa-docs `infra/terraform/{bootstrap,eu-prod/core,eu-prod/data,eu-prod/service}/providers.tf`). Bootstrap itself (applied by root) has no resource or data source that names a Docs resource except the shared GitHub OIDC provider, which it only **reads** | [V] code; live tags [U] |
| **No unrelated resources** | 49 resources, all `munaxa-shared*` or `munaxa-<product>/*` ECR names, all tagged `Project = munaxa`, `Stack = shared-bootstrap`. No VPC, compute, database, DNS or secret | [V] |

### Residuals carried into G3 (not G2)

- **P9/N-2 untagged resources.** A tag deny cannot see a resource that has no `Project` tag. Bootstrap
  grants the deployer permissions, but the deployer is used only by the `aws-terraform` and
  `aws-session` workflows, which cannot run until the owner creates the environments and variables
  (step 6 below), and the first use after G2 is a **plan** (read only). **Must be resolved before G3**
  (see SECURITY-FINDINGS §3).

## 3. G2 execution checklist (for the owner; **do not run before approval**)

Run as root in AWS CloudShell, `eu-central-1` (the decision of 29 Oct: root is the only identity
until launch; no IAM user, no access key, no credential leaves CloudShell). Stop at the first step
whose result differs from the expectation.

**Step 0. Fix the commit.** Use `main` at `fc87e94` (platform#31) or later; later commits must change only docs.

```sh
git clone https://github.com/munaxa/munaxa-platform.git && cd munaxa-platform
git checkout fc87e94b063089685fcd781f1be8e211393bfd98   # main after platform#31 (or the reports merge, docs only)
cd infra/aws/bootstrap
terraform version                         # expect 1.16.5 (install from releases.hashicorp.com if absent)
```

**Step 1. Read-only pre-checks** (replace P-4; each must return the expectation):

```sh
aws sts get-caller-identity --query Account --output text                  # 229251310592
aws iam list-roles --path-prefix /munaxa-shared/ --query 'Roles[].RoleName'  # []
aws iam list-policies --scope Local --path-prefix /munaxa-shared/ --query 'Policies[].PolicyName'  # []
aws s3api head-bucket --bucket munaxa-shared-tfstate-229251310592          # error 404 (Not Found)
aws kms list-aliases --region eu-central-1 --query "Aliases[?AliasName=='alias/munaxa-shared-tfstate']"  # []
aws ecr describe-repositories --region eu-central-1 \
  --query "repositories[?starts_with(repositoryName,'munaxa-identity/')||starts_with(repositoryName,'munaxa-control/')||starts_with(repositoryName,'munaxa-work/')||starts_with(repositoryName,'munaxa-school/')].repositoryName"  # []
aws budgets describe-budgets --account-id 229251310592 --query "Budgets[].BudgetName"
#   expect the existing Docs budgets only (munaxa-account-monthly, munaxa-docs-eu-prod-monthly at Phase 0); no munaxa-shared-*
aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn'
#   expect arn:aws:iam::229251310592:oidc-provider/token.actions.githubusercontent.com
```

**Step 2. Plan with local state** (the bucket does not exist yet):

```sh
mv backend.tf backend.tf.off
terraform init -input=false
terraform plan -input=false -out=g2.tfplan
terraform show -json g2.tfplan | jq '[.resource_changes[].change.actions|join(",")]|group_by(.)|map({(.[0]):length})|add'
#   expect exactly {"create":49}. Any "update", "delete" or "replace": STOP.
terraform show -json g2.tfplan | jq -r '.resource_changes[].address' | sort > g2-addresses.txt
#   compare with section 4 below
```

**Step 3. Apply that saved plan, then move the state into the bucket:**

```sh
terraform apply g2.tfplan
mv backend.tf.off backend.tf
terraform init -migrate-state -input=false     # answer yes: copy local state to S3
terraform plan -input=false -detailed-exitcode  # expect exit 0, "No changes"
rm -f terraform.tfstate terraform.tfstate.backup g2.tfplan   # only after the S3 state is confirmed
terraform output -json > /tmp/g2-outputs.json   # role ARNs only, no secrets
```

**Step 4. Verify (read only):**

```sh
aws s3api get-bucket-versioning --bucket munaxa-shared-tfstate-229251310592        # Enabled
aws s3api get-public-access-block --bucket munaxa-shared-tfstate-229251310592      # all four true
aws s3api get-bucket-encryption --bucket munaxa-shared-tfstate-229251310592        # aws:kms, the state key
aws s3 ls s3://munaxa-shared-tfstate-229251310592/bootstrap/                        # terraform.tfstate
aws iam get-role --role-name munaxa-shared-ci-nonprod --query Role.AssumeRolePolicyDocument
#   sub values exactly repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod{,-session}
aws ecr describe-repositories --region eu-central-1 --query 'length(repositories[?starts_with(repositoryName,`munaxa-`) && !starts_with(repositoryName,`munaxa-docs/`)])'  # 11
aws budgets describe-budgets --account-id 229251310592 --query "Budgets[?starts_with(BudgetName,'munaxa-shared')].[BudgetName,BudgetLimit.Amount]"
#   munaxa-shared-account-monthly 50, munaxa-shared-testing-monthly 50
# The deployer is refused Docs Production and other projects (simulation, no resource touched):
D=arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod
aws iam simulate-principal-policy --policy-source-arn "$D" --action-names ec2:DeleteSecurityGroup elasticloadbalancing:DeleteLoadBalancer rds:DeleteDBInstance \
  --context-entries ContextKeyName=aws:ResourceTag/Project,ContextKeyValues=MunaxaDocs,ContextKeyType=string \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]'               # all explicitDeny
aws iam simulate-principal-policy --policy-source-arn "$D" --action-names ec2:DeleteSecurityGroup \
  --context-entries ContextKeyName=aws:ResourceTag/Project,ContextKeyValues=other,ContextKeyType=string \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]'               # explicitDeny
aws iam simulate-principal-policy --policy-source-arn "$D" --action-names ec2:DeleteSecurityGroup \
  --context-entries ContextKeyName=aws:ResourceTag/Project,ContextKeyValues=munaxa,ContextKeyType=string ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=nonprod,ContextKeyType=string \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]'               # allowed
aws iam simulate-principal-policy --policy-source-arn "$D" --action-names ec2:DeleteSecurityGroup \
  --context-entries ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=prod,ContextKeyType=string \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]'               # explicitDeny (R-17)
```

**Step 5. Owner, Billing [O]:** activate `Environment` (and `Project`) as cost allocation tags
(TD-12). Until then the Testing budget reads US$0.

**Step 6. Owner, GitHub [O], in this order** (README G2 step 4, as amended by platform#31):

1. munaxa-platform environments: `aws-nonprod` and `aws-prod` (required reviewer tam2om, deployment
   branch `main` only), `aws-nonprod-session` (`main` only). Create them **before** any variable:
   a job that names a missing environment creates it without protection.
2. munaxa-platform repository variables: `AWS_CI_ROLE_ARN` = `ci_role_arns.nonprod`,
   `AWS_DEPLOYER_ROLE_ARN` = `deployer_role_arns.nonprod`. `aws-prod` environment variables: the
   `prod` pair.
3. Each product repository (identity, control, work, school): environment `image-release`
   (required reviewer, tags `image/*` only), then variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`.

**Step 7. Stop.** The next step is the lead's dispatch of `aws-terraform.yml` with `nonprod` /
`plan` (read only). G3 is a separate approval, after the SECURITY §3 "before G3" items.

## 4. Expected resources (49 to add) [V from configuration]

| # | Address | Name |
| --- | --- | --- |
| 1 | `aws_kms_key.state` | "munaxa-shared Terraform state" |
| 2 | `aws_kms_alias.state` | `alias/munaxa-shared-tfstate` |
| 3–8 | `aws_s3_bucket.state`, `…_versioning.state`, `…_server_side_encryption_configuration.state`, `…_public_access_block.state`, `…_ownership_controls.state`, `aws_s3_bucket_policy.state` | `munaxa-shared-tfstate-229251310592` |
| 9–19 | `aws_ecr_repository.image["munaxa-<product>/<image>"]` × 11 | see §2 |
| 20–30 | `aws_ecr_lifecycle_policy.image[...]` × 11 | |
| 31 | `aws_iam_policy.workload_boundary` | `/munaxa-shared/munaxa-shared-workload-boundary` |
| 32–33 | `aws_iam_role.ci["nonprod"|"prod"]` | `/munaxa-shared/bootstrap/munaxa-shared-ci-<env>` |
| 34–35 | `aws_iam_role_policy.ci[...]` | `assume-own-deployer-only` |
| 36–37 | `aws_iam_role.deployer[...]` | `/munaxa-shared/bootstrap/munaxa-shared-deployer-<env>` |
| 38–39 | `aws_iam_role_policy.deployer[...]` | `deployer` |
| 40–43 | `aws_iam_role.publisher["munaxa-<product>"]` × 4 | `/munaxa-shared/bootstrap/munaxa-<product>-image-publisher` |
| 44–47 | `aws_iam_role_policy.publisher[...]` × 4 | `push-own-images` |
| 48 | `aws_budgets_budget.account` | `munaxa-shared-account-monthly` |
| 49 | `aws_budgets_budget.testing` | `munaxa-shared-testing-monthly` |

Data sources read (no change): `aws_iam_openid_connect_provider.github` and the policy documents.

## 5. Expected IAM roles and policies

| Role | Trust | Permissions |
| --- | --- | --- |
| `munaxa-shared-ci-nonprod` | GitHub OIDC; munaxa-platform; environments `aws-nonprod`, `aws-nonprod-session`; `main` | AssumeRole + SetSourceIdentity on `munaxa-shared-deployer-nonprod` only |
| `munaxa-shared-ci-prod` | Same; environment `aws-prod` | Same, on `munaxa-shared-deployer-prod` only |
| `munaxa-shared-deployer-<env>` | Its own CI role, source identity `github-actions`; 1 h | Stack services on `*`; IAM only under `/munaxa-shared/` and only with the workload boundary; state `<env>/*`; state key; data keys via RDS/Secrets Manager only. **Denies:** other regions; Docs Production and bootstrap by name; `Project = MunaxaDocs` by tag; any `Project` other than `munaxa` by tag (N-2); the other environment by tag and name; secret values, IAM users/keys/login profiles, `kms:Sign`, Organizations, Account |
| `munaxa-<product>-image-publisher` × 4 | GitHub OIDC; that repository; environment `image-release`; `refs/tags/image/*` | ECR auth token; push/pull on its own repositories only |
| Policy `munaxa-shared-workload-boundary` | — | Ceiling for every role the stack creates (ECR pull, `/munaxa/*` logs, own secrets, KMS decrypt/sign, own buckets, RunTask/PassRole; denies other regions, Docs secrets/buckets, and all but pull on `munaxa-docs/*`) |

No IAM user, access key, login profile, Identity Center change or OIDC provider change is in the plan.

## 6. Expected Terraform state changes

- Local state during steps 2–3, then **one object** `s3://munaxa-shared-tfstate-229251310592/bootstrap/terraform.tfstate`
  (versioned, SSE-KMS). Lock file `bootstrap/terraform.tfstate.tflock` exists only while a command runs.
- No other state is touched: the Docs bootstrap and eu-prod states (their own bucket) are not read
  or written. `nonprod/` and `prod/` prefixes stay empty until the first stack apply (G3).
- The state contains role ARNs and policy JSON, no secret (no secret resource exists in bootstrap).

## 7. Expected costs [E]

| Item | US$ / month | Basis |
| --- | --- | --- |
| KMS customer-managed key (state) | ≈ 1.00 | List price US$1 per key-month; requests negligible |
| S3 state bucket | < 0.01 | Kilobytes of state |
| ECR repositories (empty until G5) | 0 | Storage-billed only |
| IAM roles, policies | 0 | |
| Budgets (2 new) | 0 to ≈ 1.24 [U] | Budgets pricing from memory: the first two budgets per account free, then about US$0.02 a day each. The account already has two (Docs bootstrap, at Phase 0), so the two new ones may be billed. Not re-checked: no Pricing access this phase |
| **G2 total** | **≈ 1 to 2.30** | |

## 8. Rollback and recovery

- **Before step 3 (plan only):** nothing exists; delete `g2.tfplan` and the local state.
- **Apply fails half way:** re-run `terraform plan`/`apply` with the same local state; resources are
  created idempotently. Never delete the local state before step 3's migrate is confirmed.
- **Full rollback** (no stack applied yet): as root, with the backend restored, empty the state
  bucket's versions only after copying the bootstrap state out, run `terraform destroy`; the KMS key
  goes to a 30-day pending deletion (cancellable). ECR repositories must be empty (they are, until G5).
- **Migrate-state fails:** the local `terraform.tfstate` is still the truth; re-run
  `terraform init -migrate-state`.
- **Wrong subject or role ARN in GitHub:** jobs fail closed at AssumeRoleWithWebIdentity; fix the
  variable. Never widen a trust to make a job pass.
- **Old Docs, Render, Supabase, Cloudflare:** not touched by G2, so nothing to roll back there.

## 9. Success criteria

1. Step 1: every expectation met. 2. Step 2: exactly `{"create":49}`. 3. Step 3: `No changes` after
migrate. 4. Step 4: every expectation met, including `explicitDeny` for Docs Production, another
project and the other environment. 5. No resource outside §4 changed (CloudTrail event history,
read only, filtered on the CloudShell session).
