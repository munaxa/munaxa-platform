# 03. Terraform G3 plan readiness (Agent 3)

Date: 4 Nov 2026, from about 10:05 to 11:15 UTC. Baseline: munaxa-platform `origin/main` at `00667f31493b1e8ba4380ddc3f49efce3abffc11` (#36).
Scope: code and local validation only. No AWS credential was used, no AWS API was called, no workflow was dispatched and nothing was applied.
Evidence: `phase5/evidence/03/`.

## 1. Summary

- [V] Every local gate passes on main and on the PR branch: fmt, validate (both roots), `terraform test` (bootstrap 4/4, stack 14/14), shellcheck, the intent `--validate` and the vendored SQL hash. tflint 0.59.1 and actionlint 1.7.7 report nothing. Evidence: files 01, 02, 04, 05, 06 and 08.
- [V] **The G3 plan is 64 creates, 0 updates and 0 deletes, with no data source reads.** It was produced from a credential-free `terraform plan` of `envs/nonprod.tfvars` as committed: `edge_enabled = false`, `services_enabled = false` and `images = {}`, which is the README's G3 "persistent layer". The proposed declaration matches that plan exactly under `check-plan-intent.sh --enforce`, and a session plan fails against it (negative check). The declaration is in `evidence/03/PROPOSED-nonprod.expected-changes.json` and is **not committed**.
- [V] PR **#37** makes the session guard, M-2, M-3 and L-1 changes and adds the state KMS key to the backend config (§6). Head `6df77ff7f234769623d1c75f02b7fcc90a10307c`. It is not merged.
- Nothing in the stack code blocks a G3 plan. Residual permission risks are in §4. The plan itself needs a dispatch by the lead (`aws-terraform.yml`, nonprod/plan).

## 2. Changes on main since the phase 4 reports

[V] `git log --since=2026-10-31` over `infra/aws`, `scripts/terraform` and `.github/workflows` returns only `1331ef8` (#33, the N-2 deny fix in bootstrap, already reported in phase 4). #34 to #36 are docs only. No stack or workflow change was made after phase 4.

## 3. Review findings (stack and modules)

| Area | Finding | Tag |
| --- | --- | --- |
| Versions | `required_version ~> 1.16.5`, aws `~> 6.67`. Both lock files pin 6.67.0 `h1:EB9ixYOZ…`, and `init -lockfile=readonly` against the release zip succeeded, so the hash matches. Only an `h1` hash is recorded, which is enough for linux_amd64 CI | [V] |
| Backend | `nonprod.backend.hcl` names bucket `munaxa-shared-tfstate-229251310592` and key `nonprod/stack.tfstate` (lock file `nonprod/stack.tfstate.tflock`). Both are inside the deployer's `State` statement (`<bucket>/nonprod/*`) and match the bootstrap bucket. **Encryption:** with `encrypt = true` and no `kms_key_id`, Terraform 1.16.5 sends `SSE: AES256` (`internal/backend/remote-state/s3/client.go` L216–225). That overrides the bucket's default KMS key, so state would be SSE-S3. Fixed in #37 for the stack. **Bootstrap's own backend has the same pattern**, so its state is probably SSE-S3 too [E]. That is Agent 2's or the lead's area | [V] |
| Default tags | All 41 taggable G3 resources plan `tags_all` with `Project=munaxa`, `Stack=shared`, `Environment=nonprod` and `ManagedBy`. The 23 without tags are non-taggable types (associations, routes, S3 sub-configs, the alias, policies, the capacity providers) | [V] plan JSON |
| Naming | `munaxa-nonprod-*` and `munaxa-nonprod/*`, IAM path `/munaxa-shared/`, log group `/munaxa/nonprod/ops`. Nothing starts with `munaxa-docs`, and nothing matches a deployer deny pattern for prod or Docs | [V] |
| Network | 2 public /24 subnets (a, b) behind the IGW route. 3 isolated DB /24 subnets with a local-only route table. No NAT and no interface endpoints. S3 gateway endpoint on the public route table only, with its policy limited to the ECR layer bucket and the two file buckets. `map_public_ip_on_launch = false`. The default SG is emptied | [V] |
| RDS | PG 16, db.t4g.micro, gp3 20 GB, encrypted with the data key, `manage_master_user_password` with the data key, private, `force_ssl`, backups 7 days, `deletion_protection = true`, final snapshot `munaxa-nonprod-pg-final`, `ignore_changes = [engine_version]` | [V] |
| KMS | Data key: rotation on, 30-day window, policy root `kms:*` plus the logs service for `/munaxa/nonprod/*`. **The ops log group is not encrypted with it** (`kms_key_id` unset), although the key's description and the policy statement imply logs. checkov CKV_AWS_158. Not a blocker | [V] / [R] |
| Secrets | 10 containers (8 shared plus `docs-api` and `docs-operator`, because `hosts.docs` is set). Encrypted with the data key, recovery window 30 days, no values | [V] |
| IAM | Two roles in G3 (`db-admin-execution`, `docs-db-admin-execution`), each with the boundary ARN `policy/munaxa-shared/munaxa-shared-workload-boundary`, the ECS-tasks trust with `aws:SourceAccount`, and an inline policy for its own secrets, KMS via Secrets Manager and its own log group | [V] |
| ECS / Cloud Map / ALB | Cluster (container insights off), FARGATE/FARGATE_SPOT providers, `nonprod.munaxa.internal` namespace, ACM cert `*.test.munaxa.com` + `operator-test.munaxa.com`. The ALB SG and its 80/443 ingress are in G3. ALB, listeners and rules come only with `edge_enabled` | [V] |
| Products vs CONTRACT.md | Ports, health paths, bundles and keys, routes and priorities in `services.tf`/`docs.tf` match CONTRACT §1, §3 and §5 for Identity, Control, Work, School and Docs. Example: control-api routes only the public prefixes, with 403 at priority 21 | [V] read |
| ECR | The stack creates no repositories. It references `munaxa-<product>/*` (bootstrap) and `munaxa-docs/*` (Docs bootstrap) by name only, so nothing is duplicated | [V] |
| checkov 3.4.3 on the G3 plan | 117 passed, 34 failed. All failures are known design choices (single-AZ, no PI, no flow logs, no rotation, ACM wildcard, port 80 redirect) plus one false positive (CKV2_AWS_6: the PAB exists). Evidence file 07 | [V] |

## 4. Deployer and boundary vs what the stack creates

[V] I checked these against `bootstrap/iam.tf` on main and against the API calls in the provider's source at v6.67.0 (raw.githubusercontent.com):

- EC2, ELB, ECS, RDS, logs, ACM and Cloud Map are covered by service wildcards.
- IAM: CreateRole and PutRolePermissionsBoundary need the boundary condition, which every stack role meets. TagRole, PutRolePolicy, PassRole, GetRole, ListRolePolicies and ListAttachedRolePolicies are allowed on `role/munaxa-shared/*`. The provider reads role tags from `GetRole`.
- KMS: the provider calls CreateKey, DescribeKey, GetKeyPolicy, GetKeyRotationStatus, EnableKeyRotation, PutKeyPolicy and ScheduleKeyDeletion, plus TagResource and ListResourceTags. All are allowed.
- Secrets Manager: CreateSecret, DescribeSecret, GetResourcePolicy, TagResource and DeleteSecret are allowed.
- S3: CreateBucket with tags falls back to PutBucketTagging when `s3:TagResource` is denied (`bucket.go` L806–857). Tag reads fall back to GetBucketTagging. Every Get/Put the provider uses falls under `GetBucket*`/`PutBucket*` or is listed explicitly.
- Tag denies: every request carries `Project=munaxa` and `Environment=nonprod`, so none of the N-2, P9 or R-17 denies match.

Residual risks:

1. [U] **RDS-managed master secret:** the RDS user guide (fetched today) requires the caller to have `kms:DescribeKey`, `secretsmanager:CreateSecret`, `secretsmanager:TagResource`, and for a customer key `kms:Decrypt`, `kms:GenerateDataKey` and `kms:CreateGrant`. The deployer has all of them, but Decrypt and GenerateDataKey only under `kms:ViaService` ∈ {rds, secretsmanager}. I expect the call to arrive through one of those services, but I cannot confirm that without AWS. If it is denied, `aws_db_instance.main` fails at create.
2. [U] **Cloud Map private namespace:** the Cloud Map reference needs `route53:CreateHostedZone`, `GetHostedZone`, `ListHostedZonesByName`, `ec2:DescribeVpcs` and `ec2:DescribeRegions`, and the deployer has all of them. The CreateHostedZone API page names only `ec2:DescribeVpcs`. However, the Docs deployer that worked also had `route53:AssociateVPCWithHostedZone`, `DisassociateVPCFromHostedZone` and `UpdateHostedZoneComment`, and the shared deployer lacks them. If AWS checks AssociateVPC on a private-zone create or delete, the namespace (create or destroy) fails. **[R] Agent 2 / lead: consider adding those three Route 53 actions in the bootstrap patch.** This PR does not touch bootstrap.
3. [U] None of this has been simulated with IAM. The only proof is the real G3 plan, which reads nothing, followed by the apply. A deny shows up as a partial apply, which can be resumed by a new plan, PR and apply. It does not require destroying anything.

## 5. Expected G3 addresses

`evidence/03/g3-expected-addresses.txt` holds 64 addresses, LC_ALL=C sorted, all `create`. Method: a copy of `stack/` with a local-only override (`zz_mock_override.tf.txt`: local backend, mock keys, `skip_*`, every endpoint `http://127.0.0.1:9`) and `terraform plan -var-file=envs/nonprod.tfvars`. On empty state with no data sources it makes no request.

| Type | n | Type | n |
| --- | --- | --- | --- |
| aws_acm_certificate | 1 | aws_s3_bucket | 2 |
| aws_cloudwatch_log_group | 1 | aws_s3_bucket_cors_configuration | 2 |
| aws_db_instance | 1 | aws_s3_bucket_lifecycle_configuration | 2 |
| aws_db_parameter_group | 1 | aws_s3_bucket_ownership_controls | 2 |
| aws_db_subnet_group | 1 | aws_s3_bucket_policy | 2 |
| aws_default_security_group | 1 | aws_s3_bucket_public_access_block | 2 |
| aws_ecs_cluster | 1 | aws_s3_bucket_server_side_encryption_configuration | 2 |
| aws_ecs_cluster_capacity_providers | 1 | aws_s3_bucket_versioning | 1 (docs) |
| aws_iam_role | 2 | aws_secretsmanager_secret | 10 |
| aws_iam_role_policy | 2 | aws_security_group | 3 |
| aws_internet_gateway | 1 | aws_service_discovery_private_dns_namespace | 1 |
| aws_kms_alias | 1 | aws_subnet | 5 |
| aws_kms_key | 1 | aws_vpc | 1 |
| aws_route | 1 | aws_vpc_endpoint | 1 |
| aws_route_table | 2 | aws_vpc_security_group_egress_rule | 2 |
| aws_route_table_association | 5 | aws_vpc_security_group_ingress_rule | 3 |

Data sources: none in the G3 plan. The only data source in the code is the module's `aws_iam_policy_document`, which is not instantiated without images.

Additional addresses:

- **Testing session today (images empty), 7 addresses:** `aws_acm_certificate_validation.main[0]`, `aws_lb.main[0]`, `aws_lb_listener.http[0]`, `aws_lb_listener.https[0]`, and the three fixed 403 rules. All are of the types the session check allows.
- **After the image digests are set (G5), 139 more persistent addresses:** task definitions 19, IAM roles and policies 20 and 20, log groups 14, SGs 14, SG rules 36 egress and 13 ingress, plus the licence key, its alias and its policy. These come from a later reviewed apply with its own declaration, not from a session.
- **A full session after G5, 50 more:** ECS services 10, target groups 9, listener rules 14, `from_alb` ingress rules 9, Cloud Map services 4, and the 4 ALB-level resources above. All are within the session's type allow list.

Files: `session-adds-images-empty.txt`, `after-images-persistent-adds.txt`, `session-adds-images-set.txt`.

## 6. PR #37 (fixes; base main; not merged)

Head `6df77ff7f234769623d1c75f02b7fcc90a10307c`. Files: `aws-session.yml`, `aws-terraform.yml`, `scripts/terraform/plan-changed-attributes.sh` (new), `stack/envs/{nonprod,prod}.backend.hcl`.

- **Session guard (Agent 1's spec):** after the deployer assume, `aws s3api head-object` on the bucket and key read from `envs/nonprod.backend.hcl`.
  - Exists: the session runs.
  - 404: `down` ends green with `::notice::nonprod stack not applied yet`; `up` fails.
  - Anything else (403 included): the job fails.
  - OIDC and the assume still run every night (the B3 check). The result gates init, plan, start, apply and stop.
  - [V] The deployer allows it: `s3:GetObject` on `<bucket>/nonprod/*` authorises HeadObject, and `s3:ListBucket` on the bucket makes a missing key a 404.
  - Simulated with a fake `aws` (evidence 09).
- **M-2:** `down` always stops the DB once the deployer credentials exist (`always() && SESSION == 'down' && steps.deployer.outcome == 'success' && exists`). An instance that is `starting` is waited on and then stopped. `up` now starts the DB **after** the plan passes the session-type check, so a refused `up` never starts it. The DB is still started before apply, because services need it.
- **M-3:** plan stdout goes to `/dev/null` in both workflows (errors are on stderr). The log and summary show the commit, the address/action table and, for updates and replacements only, the names of changed and replacement-forcing attributes. No values are shown.
- **L-1:** the apply job refuses a plan from another commit (`plan_commit` ≠ `GITHUB_SHA`) or older than 14 400 s (`planned_at`), as munaxa-docs does. Re-approving later than 4 h after the plan needs a new plan.
- **L-4:** notes only, nothing changed. Credentials last 1 h. RDS create fits. `aws_acm_certificate_validation` waits up to 75 min (provider default) if the G6 DNS records are missing, so a session `up` before G6 runs until its credentials expire. [R] Do G6 before the first `up`.
- **Backend KMS:** adds `kms_key_id = "arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-tfstate"` to both backend files. It passes Terraform's offline `validateKMSKey` (a negative test with a bad ARN is rejected). The deployer's `StateKey` statement covers it.
- CI on `6df77ff` (as last read, about 11:10 UTC; the check-runs API then returned 500): "Format, validate, mocked plan tests" **success** (run 41818820881), "Façades match the platform surface" success, "Lint · Typecheck · Test · Build" and "Accessibility" in progress (run 41818820883), Plan/Apply skipped (dispatch-only). [V] for those states, final state [U].
- [O] `infra/aws/README.md` G3 step 2 ("read the plan") should say "read the job summary". That file is outside my paths.

## 7. Risks: replacement, destruction, cost, state

| Risk | Detail | Tag |
| --- | --- | --- |
| Data key deletion vs final snapshot | Destroying the stack schedules the data key for deletion (30 days), and the final snapshot `munaxa-nonprod-pg-final` is encrypted with that key. After 30 days the snapshot cannot be restored. This is the same pattern as the retired old Docs | [V] code / [R] cancel the key deletion when keeping a snapshot |
| Fixed final-snapshot name | A second destroy fails while `munaxa-nonprod-pg-final` exists. Deletion protection also blocks any destroy until it is turned off, which is the intent | [V] |
| Secret names | `recovery_window_in_days = 30`: a destroyed bundle's name cannot be reused for 30 days (restore it instead) | [V] |
| Buckets | No `force_destroy`, so a destroy of a non-empty or versioned (docs) bucket fails. Removing `hosts.docs` plans a destroy of the docs bucket, its bundles and its role | [V] |
| Licence key | `prevent_destroy` (from G5). Removing the Control image makes the plan fail, which is the intent | [V] |
| Certificate | `create_before_destroy`. Changing `certificate_domains` replaces it and needs new Cloudflare validation records | [V] |
| Task definitions | `skip_destroy = true`: revisions are kept and cost nothing | [V] |
| for_each keys | Static strings (subnet letters, bundle names, bucket keys, ports), so a reorder does not churn anything | [V] |
| Engine version | `"16"` with `ignore_changes`, so a minor upgrade does not cause drift | [V] |
| Cost right after G3 | The DB is created **running** (about US$0.017/h [E]) until the next 20:00 UTC `down`. With #37 merged, that run finds the state and stops it. Idle cost is about US$13 a month (README) [E]; Agent 4 owns this | [E] |
| Perpetual diffs | If the G3 state shows a no-op-breaking diff (for example S3 lifecycle or default SG), the session plan check would refuse every session. This can only be confirmed by a real plan after G3 | [U] |

## 8. aws-session.yml "down" today (empty state, variables set)

[V] By reading the workflow on main: OIDC and assume succeed, init succeeds on an empty key, and the plan proposes the 64 creates. The `unexpected` check lists the non-session types and exits 1 **before apply**, and "Stop the database" is skipped. So it fails closed, but the job is red every night until G3. `up` would fail at `describe-db-instances` (DBInstanceNotFound). With #37 merged, `down` is green with a notice and `up` fails explicitly. The real run results belong to Agent 1 [U here].

## 9. Blocking a G3 plan

- Nothing in the code blocks it. A `plan` dispatch needs only the repository variables, which are owner-reported [U].
- Before the **apply**: the G3 declaration PR (owner-approved; proposed JSON ready), #37 merged (so the evening run stops the DB), and the Route 53 permission question in §4 item 2 decided.
