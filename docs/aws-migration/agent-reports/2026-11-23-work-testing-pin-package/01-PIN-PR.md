# 01. The Work pin PR, prepared

The PR is made after W-3 and W-4 in file 02. Every `<...>` below is a value that does not exist yet
**[P]**. Nothing here is a real digest or version id.

## 1. `infra/aws/stack/envs/nonprod.tfvars`

```diff
 images = {
   identity_api     = "…unchanged…"
   …
   docs_migrate     = "…unchanged…"
+  work_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:<WORK_API_DIGEST>"
+  work_admin       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:<WORK_ADMIN_DIGEST>"
+  work_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:<WORK_MIGRATE_DIGEST>"
 }
@@
-db_bootstrap_products = ["identity", "control"]
+db_bootstrap_products = ["identity", "control", "work"]
@@
 secret_version_ids = {
   …unchanged…
   docs-migrate     = "…unchanged…"
+  work-api         = "<WORK_API_VERSION_ID>"
+  work-migrate     = "<WORK_MIGRATE_VERSION_ID>"
 }
```

The diff must stay limited to these lines:

- All three Work digests come from **one** release run of the same `image/<40-hex sha>` tag. Take
  them from the Push step summaries of that run, never from a tag.
- `desired_counts` **do not change**: `work-api = 0`, `work-admin = 0`. `services_enabled` and
  `edge_enabled` stay `false`.
- No other image, version id or setting changes.
- Add a comment above `images` naming the Work commit, the run id and the scan basis: the permanent
  gate, or D-SSL-W (section 4).
- Add a comment above `secret_version_ids` saying the Work versions come from the owner's
  `work-testing-secrets.sh bundles` run (metadata only), and whether `CONTROL_PLANE_TOKEN` is the
  marked placeholder.

## 2. `infra/aws/stack/envs/nonprod.expected-changes.json`

Replace the file with
[supporting/nonprod.expected-changes.TEMPLATE.json](supporting/nonprod.expected-changes.TEMPLATE.json),
then set `<SHORT_SHA>` and `<RUN_ID>` in `intent`. It declares 29 changes:

| Kind | Count | Addresses |
| --- | --- | --- |
| create | 10 | `module.work_api[0]`: log group, task definition, execution role and policy, security group, egress https and database, ingress database_from_service, from_alb and from_callers["work-admin"] |
| create | 8 | `module.work_admin[0]`: log group, task definition, execution role and policy, security group, egress https and to_services["work-api"], ingress from_alb |
| create | 8 | `module.migrate["work"]`: log group, task definition, execution role and policy, security group, egress https and database, ingress database_from_service |
| create | 2 | `aws_vpc_security_group_egress_rule.alb_to_service["work-api"]` and `["work-admin"]` (security group rules only; no ALB exists while `edge_enabled` is false) |
| replace | 1 | `aws_ecs_task_definition.db_admin[0]`: a new revision reading `WORK_APP_URL` and `WORK_OWNER_URL` (`skip_destroy` keeps the old revision) |

The mock reports the db-admin change as an in-place update. A real plan replaces a task definition,
as in Apply 1 and Apply 2, so the template declares `["delete", "create"]`. There is no ECS service,
target group, listener rule or service discovery entry, because no service is created while
`services_enabled` is false.

## 3. E-1 task guard manifest (only if munaxa-platform#166 is merged first)

MW-005 (#166) adds `munaxa-nonprod-work-migrate` to `envs/nonprod.stage-e-tasks.json` as `pending`.
The pin PR then also does the following:

1. Set the `work-migrate` image digest and the secret version in the JSON and in the copy embedded
   in `scripts/aws/connector/e1-task-guard.py`.
2. Remove `pending` from that family.
3. Add the family to `stage_e_task_definitions_match_the_manifest` in
   `tests/stage-e-manifest.tftest.hcl`.

`test_a_pending_family_is_pending_in_nonprod_tfvars_too` fails if tfvars pins Work while the
manifest is still pending, so this step cannot be missed. With #166 merged, the work-migrate task
also carries `PLATFORM_AUTH_ISSUER`. This adds no address.

## 4. The scan basis (MW-001), one of two

- **A. OpenSSL 3.5.10 (work#35).** The images pass the permanent Grype gate. Nothing else changes.
- **B. Owner decision D-SSL-W.** The Testing exception is extended to Work's three images, with the
  same expiry `2026-12-01T00:00:00Z`. The three digests are then listed in
  `infra/aws/stack/dssl-exception.tf` in the same PR, and Work's `scan-image.sh` mirrors the Testing
  scan path. This is an owner decision, not part of this package. Under B, every Testing `up`
  after the expiry is refused, Work's included.

## 5. Checks on the PR before merge

- CI green: terraform fmt, validate and test; connector tests; the D-SSL test.
- `check-plan-intent.sh --validate`.
- The mocked supporting test with the real digests and ids gives 28 add + 1 db-admin change and no
  service.
- `grep -c work_ envs/nonprod.tfvars` shows only the three image lines.
