# G3 resource review: all 64 addresses

- **Date:** 5 Nov 2026, from 20:00 UTC (mocked plan run about 20:02 UTC). **Author:** the lead of this thread.
- **Scope:** read-only. Repository inspection, GitHub metadata and a **local mocked plan** (no credentials, no AWS call). No Terraform plan or apply against AWS, no AWS API call, no root connector.
- **Commit reviewed:** `munaxa-platform` main `0c58174a5088560f2fb28748f331ac604c84aaae`. The Terraform inputs at that commit are byte-identical to `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` (the last infrastructure merge, platform #43): git tree `infra/aws/stack` = `614a12d3e1133f142437bc6c7d136cd27ba2f90d`, `infra/aws/modules` = `47a9e7e072d9bf820024338e00016ff23e3aa9ba`, `.github/workflows/aws-terraform.yml` blob `9f82709eb864f1456198c8ac7e6f38ea8dde02fd`, `scripts/terraform` tree `23e7b3b9fa00b2937e107d2a07d1f0dbce885802`. `git diff --stat 6b8997a 0c58174 -- infra .github scripts` touches only `infra/aws/README.md` and `CONTRACT.md` [V-repo].

## Labels

| Label | Meaning |
| --- | --- |
| [V-repo] | git content read in this task |
| [V-gh] | GitHub API metadata read in this task |
| [L] | local mocked plan in this task (`terraform test`, `mock_provider "aws"`): proves what the configuration declares, **not** what AWS will accept |
| [V-prior] | an earlier report on main, not re-read from AWS here |
| [E] | inference |
| [U] | missing evidence |

## 1. Plan evidence and its limits

| Evidence | What it shows | Limits |
| --- | --- | --- |
| **Real plan, run [41977870108](https://github.com/munaxa/munaxa-platform/actions/runs/41977870108)** (`aws-terraform.yml`, nonprod, `plan`, head `decd1dcff538bc1a884eaa019f13db609c25a2d2`, created 06:03:23, completed 06:04:42 UTC on 5 Nov, conclusion success) [V-gh] | `64 to add, 0 to change, 0 to replace, 0 to destroy`; "No resource is updated or replaced"; the independent reviewer read the public log of job 127080867999 directly: 64 rows, all `create`, addresses byte-identical to the list in `2026-11-05-bootstrap-reapply/evidence/fresh-plan-run-41977870108-addresses.txt` [V-prior `2026-11-05-bootstrap-reapply/04` §2] | **Older stack code** (before `6b8997a`, which added `backstop.tf` and variable validations). The public log prints only addresses and actions, never attribute values (platform #37), and the saved plan was not kept (Apply skipped), so **no one has seen the real plan's attribute values**. A plan does not prove the deployer may create each resource |
| **Mocked plan at `0c58174`, this task** [L] | `Plan: 64 to add, 0 to change, 0 to destroy.` 64 `will be created`, 0 update, 0 replace, 0 destroy. Addresses: [`supporting/g3-mocked-plan-0c58174-addresses.txt`](supporting/g3-mocked-plan-0c58174-addresses.txt), sha256 `eb9f18440ead1cb011e8ad2ee03f7c6b8809ee5ac2a0b27117067dba974a5f79`, **byte-identical** (`cmp`) to the run 41977870108 list and to phase 7's `g3-mocked-plan-e78aa92-addresses.txt`. Full mocked plan text: [`supporting/g3-mocked-plan-0c58174.txt`](supporting/g3-mocked-plan-0c58174.txt) | Not AWS. IAM policy documents built by `aws_iam_policy_document` data sources are the mock's fixed placeholder; policies written with `jsonencode` (KMS key, trust policies, S3 endpoint) are the real text. Harness: [`supporting/g3-mock-harness.tftest.hcl`](supporting/g3-mock-harness.tftest.hcl) (the stack test file's `mock_provider` block plus one `command = plan` run, no `variables` block), `terraform test -var-file=envs/nonprod.tfvars -verbose`, Terraform 1.16.5 (zip sha256 `2bc2fcff…b5e4`, matched the HashiCorp SHA256SUMS), hashicorp/aws 6.67.0 linux_amd64 (zip sha256 `4ce94853…7f63`, matched SHA256SUMS; same version as the lock file) |
| **Declaration `stack/envs/nonprod.expected-changes.json` on main** [V-repo] | `"changes": []` (unchanged since c44f96e, platform #24) | **The G3 declaration is not on main.** A draft built from the 64 addresses is [`supporting/nonprod.expected-changes.g3-DRAFT.json`](supporting/nonprod.expected-changes.g3-DRAFT.json) (sha256 `7653ee6a…dacbe9f (after Prettier formatting)`); `scripts/terraform/check-plan-intent.sh --validate` on it printed "Declaration valid: root stack-nonprod, 64 declared change(s)". It was deliberately **not** written to `envs/`: committing it is the G3 approval PR |

**What protects the apply even without a fresh real plan in hand** [V-repo `aws-terraform.yml`]: an `apply` dispatch runs a new plan in the `aws-nonprod` environment (owner approval), compares it with the committed declaration in `--enforce` mode (any extra, missing or different address or action fails; counts are never compared), keeps the saved plan, and runs the apply in a second job that needs the owner's approval again, on a plan at most 4 hours old (`MAX_PLAN_AGE_SECONDS: '14400'`). Nothing applies on push or merge.

**Missing evidence [U]:** a real plan at the declaration commit. It will be produced by the plan job of the approved G3 dispatch; it was not generated here because no AWS plan was authorized.

## 2. The 64 addresses, compared one by one

"Run" = present in run 41977870108's list; "Mock" = present in this task's mocked plan at `0c58174`; both columns are **yes for all 64** and the action is `create` for all 64.

| # | Address | Run | Mock | Configuration reviewed [L / V-repo] | Finding |
| --- | --- | --- | --- | --- | --- |
| 1 | `aws_acm_certificate.main` | yes | yes | `*.test.munaxa.com`, SAN `operator-test.munaxa.com`, DNS validation, `create_before_destroy` | OK. Validation window 72 h (`03`) |
| 2 | `aws_cloudwatch_log_group.ops` | yes | yes | `/munaxa/nonprod/ops`, retention 14 | **G-L1** no `kms_key_id` (AWS default encryption, not the data key) |
| 3 | `aws_db_instance.main` | yes | yes | `munaxa-nonprod-pg`, postgres `16`, `db.t4g.micro`, 20 GB gp3, `storage_encrypted`, `kms_key_id` = data key, `publicly_accessible = false`, `multi_az = false`, master password managed by RDS (secret encrypted with the data key), deletion protection on, final snapshot `munaxa-nonprod-pg-final`, backups 7 days, Performance Insights off, no `max_allocated_storage` (no autoscaling) | OK. **Starts running on create** (`02` §4, `04` B-3). `engine_version = "16"` with `ignore_changes` |
| 4 | `aws_db_parameter_group.main` | yes | yes | `postgres16`, `rds.force_ssl = 1`, `log_min_duration_statement = 1000` | OK |
| 5 | `aws_db_subnet_group.main` | yes | yes | the three `db` subnets | OK |
| 6 | `aws_default_security_group.default` | yes | yes | adopted with no rules, tag `munaxa-nonprod-default-unused` | OK: nothing in the default group is reachable |
| 7 | `aws_ecs_cluster.main` | yes | yes | `munaxa-nonprod`, Container Insights disabled | OK (no Container Insights charge) |
| 8 | `aws_ecs_cluster_capacity_providers.main` | yes | yes | FARGATE and FARGATE_SPOT, default FARGATE weight 1 | OK |
| 9 | `aws_iam_role.db_admin_execution` | yes | yes | trust `ecs-tasks.amazonaws.com` with `aws:SourceAccount = 229251310592`; path `/munaxa-shared/`; boundary `munaxa-shared-workload-boundary` | OK |
| 10 | `aws_iam_role.docs_db_admin_execution[0]` | yes | yes | same trust, path and boundary | OK |
| 11 | `aws_iam_role_policy.db_admin_execution` | yes | yes | `GetSecretValue` on the RDS master secret and the 8 Identity/Control/Work/School bundles; `kms:Decrypt` on the data key only `ViaService` Secrets Manager; logs to the ops group only [V-repo `ops.tf` 70 to 100] | OK. The two db-admin execution roles (rows 11, 12) are the only readers of the master secret, as designed |
| 12 | `aws_iam_role_policy.docs_db_admin_execution[0]` | yes | yes | master secret and `docs-operator` only; same KMS and logs scope [V-repo `docs.tf` 294 to 323] | OK |
| 13 | `aws_internet_gateway.main` | yes | yes | `munaxa-nonprod-igw` | OK |
| 14 | `aws_kms_alias.data` | yes | yes | `alias/munaxa-nonprod-data` | OK |
| 15 | `aws_kms_key.data` | yes | yes | rotation on, 30-day deletion window; policy: `AccountAdministration` (`kms:*` to the account root principal, which delegates to IAM) and `CloudWatchLogs` (logs service, only for `log-group:/munaxa/nonprod/*` encryption context) | OK. Standard pattern; who may use the key is decided by IAM policies and the workload boundary |
| 16 | `aws_route.public_internet` | yes | yes | `0.0.0.0/0` to the IGW, public route table only | OK |
| 17 | `aws_route_table.db` | yes | yes | local routes only | OK: database subnets have no internet path |
| 18 | `aws_route_table.public` | yes | yes | | OK |
| 19 to 21 | `aws_route_table_association.db["a"]`, `["b"]`, `["c"]` | yes | yes | db subnets to the db table | OK |
| 22, 23 | `aws_route_table_association.public["a"]`, `["b"]` | yes | yes | public subnets to the public table | OK |
| 24, 25 | `aws_s3_bucket.files["docs"]`, `["school"]` | yes | yes | `munaxa-nonprod-docs-files-229251310592`, `munaxa-nonprod-school-files-229251310592` | OK |
| 26, 27 | `aws_s3_bucket_cors_configuration.files[...]` | yes | yes | GET and PUT from `https://docs.test.munaxa.com` / `https://school.test.munaxa.com` only | OK |
| 28, 29 | `aws_s3_bucket_lifecycle_configuration.files[...]` | yes | yes | abort incomplete uploads after 1 day; Docs also expires noncurrent versions after 30 days, keeps 3 | OK |
| 30, 31 | `aws_s3_bucket_ownership_controls.files[...]` | yes | yes | `BucketOwnerEnforced` (ACLs off) | OK |
| 32, 33 | `aws_s3_bucket_policy.files[...]` | yes | yes | `TlsOnly`: Deny `s3:*` to `*` when `aws:SecureTransport` is false, on the bucket and its objects [V-repo `storage.tf` 129 to 146; the value depends on the bucket ARN, so the mock shows it as known after apply] | OK |
| 34, 35 | `aws_s3_bucket_public_access_block.files[...]` | yes | yes | all four blocks `true` | OK |
| 36, 37 | `aws_s3_bucket_server_side_encryption_configuration.files[...]` | yes | yes | `AES256` (SSE-S3) | **G-L2** SSE-S3, not the data key. Acceptable for Testing [E] |
| 38 | `aws_s3_bucket_versioning.files["docs"]` | yes | yes | Enabled (School bucket has no versioning resource) | OK |
| 39 to 48 | `aws_secretsmanager_secret.service[...]`: `control-api`, `control-migrate`, `docs-api`, `docs-operator`, `identity`, `identity-migrate`, `school-api`, `school-migrate`, `work-api`, `work-migrate` | yes | yes | `munaxa-nonprod/<name>`, `kms_key_id` = data key, recovery window 30 days, description says values are never written by Terraform; **no `aws_secretsmanager_secret_version` anywhere in G3** | OK: containers only, no value in Terraform or state. 10 bundles cost about US$4 a month even before they hold values (`02`) |
| 49 | `aws_security_group.alb` | yes | yes | created now, used only when the edge is on | OK (an SG costs nothing) |
| 50 | `aws_security_group.database` | yes | yes | | OK |
| 51 | `aws_security_group.db_admin` | yes | yes | no inbound | OK |
| 52 | `aws_service_discovery_private_dns_namespace.main` | yes | yes | `nonprod.munaxa.internal` (private) | OK. Creates a Route 53 private hosted zone: US$0.50 a month [E] |
| 53 to 55 | `aws_subnet.db["a"]`, `["b"]`, `["c"]` | yes | yes | `10.130.64.0/24`, `.65.0/24`, `.66.0/24` in eu-central-1a/b/c, `map_public_ip_on_launch = false` | OK |
| 56, 57 | `aws_subnet.public["a"]`, `["b"]` | yes | yes | `10.130.0.0/24`, `10.130.1.0/24` in 1a/1b, `map_public_ip_on_launch = false` (each service sets `assign_public_ip` itself, `services.tf` 455) | OK |
| 58 | `aws_vpc.main` | yes | yes | `10.130.0.0/16`, DNS support and hostnames on (does not overlap the retired Docs network; stack test `docs_production_network_is_not_reused`) | OK |
| 59 | `aws_vpc_endpoint.s3` | yes | yes | Gateway endpoint (free), **public route table only**; policy allows `s3:GetObject` on `prod-eu-central-1-starport-layer-bucket/*` (ECR layers) and the two own file buckets | OK. S3 traffic from the public subnets through the endpoint is limited to the ECR layer bucket (read) and the two own buckets (GetObject, PutObject, DeleteObject, AbortMultipartUpload, ListBucket) |
| 60 | `aws_vpc_security_group_egress_rule.db_admin_database` | yes | yes | 5432 to the database SG | OK |
| 61 | `aws_vpc_security_group_egress_rule.db_admin_https` | yes | yes | 443 to `0.0.0.0/0` (ECR Public, Secrets Manager, logs) | OK for a public-subnet task with no NAT |
| 62, 63 | `aws_vpc_security_group_ingress_rule.alb["443"]`, `["80"]` | yes | yes | from `0.0.0.0/0` (80 redirects to 443 once a listener exists) | OK. IPv4 only |
| 64 | `aws_vpc_security_group_ingress_rule.database_from_db_admin` | yes | yes | 5432 from the db-admin SG only | OK: in G3 the database admits nothing but db-admin |

**Count check:** 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 3 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 1 + 10 + 3 + 1 + 3 + 2 + 1 + 1 + 2 + 2 + 1 = **64**.

## 3. The 15 verification points

| # | Point | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Exactly 64 creations | **Yes** (real plan on `decd1dc`; mock on `0c58174`, same 64 addresses byte for byte) | [V-gh] [V-prior] [L] |
| 2 | Zero unexpected updates | **Yes**, 0 updates in both | [V-prior] [L] |
| 3 | Zero replacements | **Yes** | [V-prior] [L] |
| 4 | Zero deletions | **Yes** | [V-prior] [L] |
| 5 | No NAT Gateway | **Yes.** `grep -ci nat_gateway` on the mocked plan: 0; no `aws_nat_gateway` or `aws_eip` resource in `infra/aws` | [L] [V-repo] |
| 6 | VPC and subnet topology | **Correct for the contract:** one `/16`, 2 public `/24` (1a, 1b) routed to the IGW, 3 isolated db `/24` (1a, 1b, 1c) with local routes only | [L] |
| 7 | Security groups | **Correct for G3:** ALB SG (80/443 in; no egress until services exist, because Terraform removes AWS's default allow-all egress from a new group), database SG (5432 from db-admin only), db-admin SG (no inbound; 5432 to the database, 443 out), default SG empty. Service and ALB-to-task rules arrive only with images | [L] [V-repo] |
| 8 | Private RDS | **Yes:** private, isolated subnets, SG-restricted, TLS forced, encrypted with the data key, single AZ, `db.t4g.micro`, PostgreSQL 16, deletion protection, final snapshot | [L] |
| 9 | KMS encryption and key policy | **Yes** for RDS storage, the RDS master secret and the 10 bundles (data key). Log groups and S3 use AWS-managed encryption (G-L1, G-L2). Key policy as row 15 | [L] [V-repo] |
| 10 | Secrets Manager | **Yes:** 10 empty containers, data key, 30-day recovery, no secret version in Terraform | [L] [V-repo] |
| 11 | ECS cluster, execution and task roles | Cluster as rows 7 and 8. **G3 creates only the two db-admin execution roles**; product execution and task roles are created with each product's images (Config A and later), not in G3. Both roles: ECS-tasks trust bound to the account, permissions boundary, least-privilege inline policies | [L] [V-repo] |
| 12 | ECR references and digest strategy | **G3 references no image** (`images = {}`, no task definition is created because `postgres_image` is unset). The ECR repositories are bootstrap resources. Digest-only is enforced by validation (stack test `an_image_tag_is_refused`) | [V-repo] |
| 13 | Tagging | Provider `default_tags`: `Project = munaxa`, `Stack = shared`, `Environment = nonprod`, `ManagedBy = terraform/munaxa-platform/infra/aws/stack`, applied to every taggable resource; `Name`/`Tier` on network resources. The Testing budget filters on `user:Environment$nonprod` (`bootstrap/budget.tf` 50 to 52). The mock shows `tags_all` as "known after apply", so the merged tags are from code, not from a plan | [V-repo] |
| 14 | No production or cross-environment resource | **Yes:** every name carries `munaxa-nonprod`; state key `nonprod/stack.tfstate`; `allowed_account_ids = ["229251310592"]`; `environment = "nonprod"`; prod roots are not touched; the boundary ARN referenced (`munaxa-shared-workload-boundary`) is the bootstrap's nonprod workload boundary, referenced, not created | [V-repo] [L] |
| 15 | No CanteenHub | **Yes:** no match for "canteen" (case-insensitive) in `infra/`, `.github/` or `scripts/` of munaxa-platform; matches elsewhere in the repository are only in documentation (earlier reports and plans). Some older reports list a CanteenHub-related TD-11 item before G3 that no report shows closed [U]; it was not followed up because CanteenHub is out of scope. CanteenHub itself was not inspected | [V-repo] |

## 4. Findings

| # | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| G-M1 | Medium | **No real plan at the commit that will be applied.** The last real plan ran on older stack code and **before the second re-apply** narrowed the deployer, so the current deployer has never planned or created anything; the mock proves the configuration, not AWS acceptance. Since `decd1dc`, `aws-terraform.yml` also changed (platform #43; 27 lines), and its apply job has **never run** | The G3 dispatch's own plan job is the check: it must print exactly the 64 declared creates and pass `--enforce`. Owner approves the apply job only after reading that. If anything else appears: stop |
| G-M2 | Medium | **The database runs from the moment it is created** (about US$0.019 an hour) and nothing in G3 stops it; the backstop is off; the session `down` path has not run since the second re-apply (last `aws-session.yml` run 41943924455 at 00:47 UTC on 5 Nov, before it) [V-gh] | Dispatch `aws-session.yml` `down` immediately after the apply; if it fails, the owner stops `munaxa-nonprod-pg` in the RDS console as root (a stop is reversible) |
| G-L1 | Low | Log groups (`ops` here, and the service module) have no `kms_key_id`, although the data key's description and policy cover CloudWatch Logs | Optional later infrastructure PR; not a G3 blocker. Changing it after G3 is an in-place update |
| G-L2 | Low | File buckets use SSE-S3, not the data key | Acceptable for Testing; revisit before production |
| G-L3 | Low | Phase 7 `07` §4 quotes the address list's sha256 as `eb9f1844…5950`; the file on main hashes to `eb9f1844…5f79` | Wording error only; the files are byte-identical |
| G-L4 | Low | The 10 bundles include School and Docs, which the first sessions do not use; each costs about US$0.40 a month | Accept (removing them changes G3 away from the reviewed 64) |
| G-I1 | Info | Values that depend on ARNs (bucket policies, inline role policies) show as known after apply in the mock, and the real plan log shows only addresses | Their text was read in `storage.tf`, `ops.tf` and `docs.tf` |

No Critical or High finding in the 64 resources.
