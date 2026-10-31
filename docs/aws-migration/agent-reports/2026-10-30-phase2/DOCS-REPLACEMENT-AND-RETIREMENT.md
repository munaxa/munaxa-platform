# Docs replacement and retirement: phase 2, 30 Oct 2026

## 1. The approach (owner decision, restated in the 30 Oct brief)

The existing Docs AWS infrastructure ("old Docs": the munaxa-docs `infra/terraform/eu-prod/{core,data,service}`
roots plus the Docs bootstrap) holds **test data only**. It is **not migrated**. Munaxa Docs is
**recreated** inside the shared AWS architecture:

1. Recreate the Docs infrastructure in the shared stack (munaxa-platform `infra/aws/stack/docs.tf`).
2. Start with a **clean database and empty storage**.
3. Deploy the current Docs application (a new release image from munaxa-docs main).
4. Reconfigure authentication, licensing, domains, secrets and integrations.
5. Validate the replacement (section 4).
6. Retire the old Docs infrastructure **only after** the replacement passes validation and the owner
   approves G9 (section 5).

**No test-data migration is planned or built [V]:** no task, script or workflow in munaxa-platform or
munaxa-docs copies data from the old Docs database or buckets. `CONTRACT.md` §6 says "Clean
databases; no data is copied from Supabase, Render or Docs Production", and `docs-db-admin` creates
an empty tenant database. No phase in [NEXT-EXECUTION-PLAN.md](NEXT-EXECUTION-PLAN.md) includes a
data copy.

## 2. How Docs is represented in the shared architecture [V at munaxa-platform `fc393fc`]

| Concern | Old Docs (unchanged, still running idle) | Shared stack (Testing, `nonprod`) |
| --- | --- | --- |
| Hosting | Own VPC, ALB, ECS cluster, RDS (`Project = MunaxaDocs`, `Environment = Production`) | The shared VPC, ALB and cluster; public ECS networking (approved) |
| Services | api, web, scanner (`enable_services = false`, so none run) | `module.docs_api` (with a Redis sidecar), `module.docs_web`, `module.docs_scanner`; `desired_counts` 1 each, only while a session is up |
| Database | Own RDS instance | A tenant database on the shared PostgreSQL 16 instance, created by the run-only `docs-db-admin` task: cluster roles `edms_owner`, `edms_app`, `edms_backup` (from `scripts/docs-cluster-roles.sql`, a hash-checked copy of Docs `01-roles.sql`, F-3), `CONNECT` limited to those roles, and a guard that `edms_backup` (BYPASSRLS) can connect to no non-Docs database |
| Provisioning | `ops_provision` task | Run-only `docs-provision` task (Docs `provision.js`, `ON_PREMISE`, consumers off) with a one-run secret `munaxa-nonprod/docs-provision/<slug>` |
| Storage | `munaxa-docs-*` buckets | `munaxa-nonprod-docs-files-<account>` (SSE, created empty). The boundary denies `munaxa-docs*` buckets and secrets, so the new stack cannot read old Docs data even by mistake |
| Task roles | Docs' own roles under `role/munaxa-docs/` | Execution and task roles under `role/munaxa-shared/munaxa-nonprod-docs-*`, each with the workload boundary. `docs_api`'s task role may use only the Docs bucket's objects (`docs.tf` lines 150 to 160) |
| Images | `munaxa-docs/*` ECR (Docs bootstrap) | The same repositories, **pull only** (boundary `MunaxaDocsImagesPullOnly`). `images.docs_*` in `envs/nonprod.tfvars` are still empty, so Docs is not defined until a new release is published (F-2) |
| Secrets | `munaxa-docs*` bundles | `munaxa-nonprod/docs-api` (11 keys, including `CONTROL_PLANE_TOKEN`) and `munaxa-nonprod/docs-operator` (`EDMS_*` passwords) |
| Licensing | n/a (services off) | `LICENSING_MODE=CONTROL_PLANE` against Control on Testing; production refuses `NONE` (docs#163) |
| Sign-in | Docs' own | Docs' own (Identity has no OIDC endpoints, Docs ADR-0004) |
| Domain | `docs.munaxa.com` (no DNS record) | `docs.test.munaxa.com`, DNS only, CNAME to the shared ALB at session time (G6) |
| Deployer reach | — | The shared deployer is denied the old Docs resources by name and, after platform#29 (**merged** as `c41f08d` (head `7af38e0` pinned)), by the `Project = MunaxaDocs` tag (P9) |

## 3. Preserved for reproducibility (no deletion in this pass)

All of these stay in Git or in AWS, untouched:

- munaxa-docs `infra/terraform/` (bootstrap and eu-prod roots, `launch.auto.tfvars`, the
  `expected-changes.json` intent files, `docs/` runbooks). They are the record of how old Docs was
  built.
- The old Docs Terraform state (in the Docs bootstrap's state bucket) and its `terraform-eu-prod.yml`
  workflow and GitHub environment.
- The secret **names** and key lists (munaxa-docs `secrets.tf`, platform `CONTRACT.md` §5). Values
  are never copied into a report or a session.
- The release image digests in `munaxa-docs/*` ECR (`f8a8bea`), until a new release replaces them.
- [R] Before retirement, export the old stack's non-secret configuration
  (`terraform output`, `terraform show -json` of each root, without values) into the retirement PR,
  so it can be reproduced. That is a read-only step for the owner.

## 4. Acceptance: the replacement passes validation when [R]

Each check runs in a Testing session (G7). The evidence (run ids, log excerpts, screenshots) goes in
the next phase's report.

1. `docs-db-admin` exits 0. Its output lists `edms_owner`, `edms_app`, `edms_backup` with the
   expected flags, and the tenant database is owned by `edms_owner`. The non-Docs `CONNECT` guard
   does not raise.
2. `docs-provision` exits 0 for the first tenant, and the one-run secret is deleted afterwards.
3. `docs-api`, `docs-web` and `docs-scanner` reach steady state. `GET https://docs.test.munaxa.com/api/health/live`
   returns 200.
4. The first administrator signs in.
5. An upload reaches the `munaxa-nonprod-docs-files-*` bucket and is scanned by the antivirus
   service.
6. An entitlement lookup against Control on Testing succeeds with the Docs `mxc_` credential. With
   the credential revoked, the API refuses as licensing requires.
7. The hourly usage report runs.
8. The running image is a release built from munaxa-docs main **at or after** the docs#168 merge, so it
   includes Control licensing (#162 to #166) and the publish-workflow fixes.
9. Mail: either Resend's domain is verified and a test mail arrives, or mail is explicitly accepted
   as out of scope for Testing.
10. The session goes down cleanly, and the next session comes up with the data intact.

## 5. Retirement of the old Docs infrastructure: conditions (all required)

1. Every check in section 4 passes, with evidence in a report on GitHub.
2. The section 3 configuration export is in the retirement PR.
3. The owner confirms in writing that no data in old Docs is needed (the brief already states it is
   test data; the confirmation is a one-line record at G9).
4. A **reviewed retirement plan**: `terraform plan -destroy` of the eu-prod `service`, `data`, then
   `core` roots, with each root's declared intent. `aws_lb.main` has deletion protection, and RDS
   needs a final-snapshot decision (recommendation: one final snapshot, kept 30 days, then deleted).
   The Docs bootstrap (state bucket, OIDC provider, `munaxa-docs/*` ECR) is **kept**, because the shared
   stack reads the OIDC provider and pulls Docs images from that ECR.
5. The owner approves **G9** explicitly. G9 is closed today.
6. After the destroy: a read-only check that no `Project = MunaxaDocs, Environment = Production`
   resource is left except the kept bootstrap. Then remove the stale `docs.munaxa.com` plans from the
   Docs repository by PR.

## 6. Status [V]

| Item | Status |
| --- | --- |
| No test-data migration required or planned | Confirmed |
| New Docs infrastructure in the shared architecture | Yes, in code (`docs.tf`, merged in #26); not applied |
| Docs image with the latest licensing | Not yet. Needs docs#168 (**merged** as `23139a7` (head `53c44b5` pinned, 11 checks green)) and then a release at G5 |
| Old Docs infrastructure | **Untouched** in this pass; no AWS call succeeded |
| Retirement conditions documented | Yes, section 5. G9 stays closed |
