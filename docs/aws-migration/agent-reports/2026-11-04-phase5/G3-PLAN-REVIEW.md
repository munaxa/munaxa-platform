# Phase 5: G3 plan review

Date: 4 Nov 2026. Lead orchestrator. Labels: [V] verified, [E] estimated, [R] recommended, [U] unverified, [O] owner action required.

**Result: the real nonprod plan was dispatched and approved twice, and both runs stopped before planning** (41820815532 and 41865393534). The GitHub OIDC to CI role step succeeded. The CI role's call to assume the deployer was refused, because the `AWS_DEPLOYER_ROLE_ARN` variable lacks the role path. No AWS resource was read or written by the plan. The 64-create expected list comes from a credential-free mocked plan and is **not yet confirmed against AWS**.

## 1. The real plan run

| Item | Value |
| --- | --- |
| Workflow | `aws-terraform.yml`, `workflow_dispatch`, inputs `environment=nonprod`, `action=plan` |
| Run | [41820815532](https://github.com/munaxa/munaxa-platform/actions/runs/41820815532), run number 19, ref `main`, head `c688e9ee242a46d94df09307c97fa4281da7ed78` (#37) |
| Dispatched | 2026-11-04 11:26:00 UTC by the lead, after Tamer's decision at 11:25:54 |
| Environment gate | Status `waiting` at 11:26:03 [V]: `aws-nonprod` exists and has a protection rule. The owner approved; the job started at 12:06:41 |
| Job | "Plan nonprod (plan)", job 126543183878, conclusion **failure** at 12:06:48 |
| Step 5, Assume the CI role through GitHub OIDC | **success** 12:06:46 to 12:06:47 [V]. The session is `assumed-role/munaxa-shared-ci-nonprod/gha-run-41820815532` |
| Step 6, `terraform init` | **failure**: `STS: AssumeRole ... 403 ... AccessDenied: User: arn:aws:sts::229251310592:assumed-role/munaxa-shared-ci-nonprod/gha-run-41820815532 is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::229251310592:role/munaxa-shared-deployer-nonprod` (request ID a80f8e28-7b43-4125-b454-e906d8873c1c) |
| Steps 7 to 9 (plan, summary and intent, keep plan) | skipped |
| Apply job | skipped (it never runs for `action=plan`) |
| AWS side effects | None: the S3 backend never initialised, so no lock file and no state object [V from the step order] |

### Second plan run, after the owner was asked to fix the variable

| Item | Value |
| --- | --- |
| Run | [41865393534](https://github.com/munaxa/munaxa-platform/actions/runs/41865393534), dispatched 16:15:25 UTC on main `46dfbd9` (#38) |
| Environment gate | `waiting` from 16:15:27; approved by the owner; job 126698202703 started 18:16:45 |
| Step 5, OIDC to `munaxa-shared-ci-nonprod` | **success** [V] |
| Step 6, `terraform init` | **failure**, the same STS AccessDenied (request ID d9533435-f92f-4d25-a7b9-102d2ad8c395). The job log prints `DEPLOYER_ROLE_ARN: arn:aws:iam::229251310592:role/munaxa-shared-deployer-nonprod`, still without the path [V] |
| Steps 7 to 9, apply job | skipped. No AWS side effects |

The variable the job received at 18:16 was unchanged. Either the repository variable was not saved, or an **environment** variable with the same name in `aws-nonprod` still holds the old value: an environment variable overrides a repository variable of the same name [R: check both]. The fix in step 1 below is unchanged.

### Root cause [V]

The deployer role lives under the path `/munaxa-shared/bootstrap/` (`infra/aws/bootstrap/iam.tf`, `aws_iam_role.deployer`, `path = "/munaxa-shared/bootstrap/"`). Its ARN is therefore
`arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`, as also written in the phase 4 `NEXT-EXECUTION-PLAN.md` lines 22 to 23. The job log prints the variable as `arn:aws:iam::229251310592:role/munaxa-shared-deployer-nonprod`, without the path. The CI role may assume only the exact deployer ARN (`iam.tf`, `Resource = aws_iam_role.deployer[each.key].arn`), so STS refused.

The CI role variable works. Assumed-role ARNs do not show the path, so the log cannot tell whether `AWS_CI_ROLE_ARN` includes it; the successful OIDC step shows it resolves to the real role [V].

### Owner fix [O] and safe recovery

1. In munaxa-platform, Settings, Secrets and variables, Actions, Variables: set the **repository** variable `AWS_DEPLOYER_ROLE_ARN` to `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`. Check `aws-prod`'s environment variables for the same mistake (`.../role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod` and `...-ci-prod`), and each product repository's `AWS_IMAGE_PUBLISHER_ROLE_ARN` (`.../role/munaxa-shared/bootstrap/munaxa-<product>-image-publisher`).
2. Tell the lead. The lead dispatches the same plan again on main; the owner approves it in `aws-nonprod`.
3. Recovery if anything else fails: the plan job writes nothing but the S3 lock file, which Terraform deletes at the end of the run. A failed plan needs no clean-up. Never `force-unlock` without reading the lock's run ID first.

Effect on tonight's scheduled `aws-session.yml` run (code at c688e9e or later) [E]: OIDC to the CI role succeeds, then "Assume the deployer for the database calls" fails on the same wrong ARN. The guard, init, plan, apply and stop steps are skipped (the stop step requires the deployer step to succeed). The run is red and writes nothing. With the fix it should end green with "nonprod stack not applied yet".

## 2. Expected G3 changes (mocked, from Agent 3)

Source: `03-TERRAFORM-G3-PLAN-READINESS.md` §5 and `supporting/g3-expected-addresses.txt`. Method: a copy of `infra/aws/stack` with a local backend and every AWS endpoint pointed at 127.0.0.1, `terraform plan -var-file=envs/nonprod.tfvars` (as committed: `edge_enabled = false`, `services_enabled = false`, `images = {}`). On empty state with no data sources the plan sends no request [V]. Agent 6 checked the list and the proposed declaration independently [V].

**64 creates. 0 updates, 0 replacements, 0 deletes, 0 data source reads.**

| Type | n | Type | n |
| --- | --- | --- | --- |
| aws_acm_certificate | 1 | aws_s3_bucket | 2 |
| aws_cloudwatch_log_group | 1 | aws_s3_bucket_cors_configuration | 2 |
| aws_db_instance | 1 | aws_s3_bucket_lifecycle_configuration | 2 |
| aws_db_parameter_group | 1 | aws_s3_bucket_ownership_controls | 2 |
| aws_db_subnet_group | 1 | aws_s3_bucket_policy | 2 |
| aws_default_security_group | 1 | aws_s3_bucket_public_access_block | 2 |
| aws_ecs_cluster | 1 | aws_s3_bucket_server_side_encryption_configuration | 2 |
| aws_ecs_cluster_capacity_providers | 1 | aws_s3_bucket_versioning | 1 |
| aws_iam_role | 2 | aws_secretsmanager_secret | 10 |
| aws_iam_role_policy | 2 | aws_security_group | 3 |
| aws_internet_gateway | 1 | aws_service_discovery_private_dns_namespace | 1 |
| aws_kms_alias | 1 | aws_subnet | 5 |
| aws_kms_key | 1 | aws_vpc | 1 |
| aws_route | 1 | aws_vpc_endpoint | 1 |
| aws_route_table | 2 | aws_vpc_security_group_egress_rule | 2 |
| aws_route_table_association | 5 | aws_vpc_security_group_ingress_rule | 3 |

The full address list is `supporting/g3-expected-addresses.txt` (LC_ALL=C sorted). The proposed declaration, `supporting/PROPOSED-nonprod.expected-changes.json`, matches the mocked plan exactly under `check-plan-intent.sh --enforce`, and a session plan fails against it (negative test) [V]. It is **not** committed to `envs/nonprod.expected-changes.json`. Committing it is the G3 approval PR, and nothing was removed from it to make anything pass.

A Testing session today would add 7 addresses (ALB, 2 listeners, 3 fixed-response rules, certificate validation). After image digests are set (G5) the persistent layer grows by 139 addresses and a full session adds 50. All session types are in `aws-session.yml`'s allow-list [V].

## 3. Brief §6 checklist

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Resolve or formally document B2 / TD-14 | **Documented; fixed in code only.** platform#38 (46dfbd9) replaces the tag denies with allow-lists; it takes effect only after a root re-apply. Residuals R1 to R10 need owner acceptance. `02-SECURITY-B2-TD14.md`, `06-INDEPENDENT-REVIEW.md` §8 to §9 |
| 2 | Confirm the GitHub OIDC chain | **Partly [V].** OIDC to `munaxa-shared-ci-nonprod` works (run 41820815532 step 5). CI role to deployer **failed** on the wrong variable [V]. Deployer to S3 state and AWS reads: not reached [U] |
| 3 | Required code PRs merged and current | [V] platform#37 c688e9e, platform#38 46dfbd9, identity#5 4001ed8, work#28 f812dfe. No open PRs remained in the six repositories at 12:06 UTC |
| 4 | Fresh plan from current main | **Blocked** at `terraform init` (§1). Note: main moved to 46dfbd9 (#38) after the dispatch; #38 touches only `infra/aws/bootstrap`, so the stack configuration is the same at both commits [V `git diff --stat c688e9e 46dfbd9`] |
| 5 | Capture every planned address and action | Mocked: 64 creates (§2). Real: [U] |
| 6 | Compare with the proposed declaration | Mocked plan equals the proposed declaration exactly [V]. Real: [U] |
| 7 | Replacements, updates, deletions | Mocked: none. Real: [U]. Empty state means a real plan can only show creates unless something already exists at the same addresses, which nothing can (no nonprod state object exists) [E] |
| 8 | Explain unexpected actions | None in the mocked plan |
| 9 | Tags `Project=munaxa`, `Stack=shared`, `Environment=nonprod` | [V] in the mocked plan: all 41 taggable resources carry the three tags plus `ManagedBy` via provider `default_tags`; the 23 others are non-taggable types |
| 10 | Production and the retained Docs bootstrap outside the plan | [V] by configuration: the plan uses `envs/nonprod.backend.hcl` (key `nonprod/stack.tfstate`) and `envs/nonprod.tfvars`; no address names prod or `munaxa-docs`; the stack only references the Docs ECR repositories by name, it does not manage them |

## 4. Verdict

The G3 plan is **not** presented as passed: the real plan never ran. The stopping point is a single owner variable fix (§1). Once it is fixed, the plan can be dispatched again under this phase's authorization. G3 apply readiness further needs the bootstrap re-apply with #38, the simulation, a fresh plan after that matching the 64 creates, and the G6 DNS plan (`NEXT-EXECUTION-PLAN.md`).
