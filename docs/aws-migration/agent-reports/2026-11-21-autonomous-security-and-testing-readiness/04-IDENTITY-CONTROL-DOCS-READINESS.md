# 04. Identity, Control and Docs: Testing readiness

Nothing in this file was executed on AWS. Plans are offline (mocked provider) only.

## 1. Control C-1 / C-2

### 1.1 Offline re-validation on current `main` (`e7b0c0b`) [TESTED]

The 20 Nov harness (`2026-11-20-docs-first-next-readiness/supporting/control-c1-c2-mocked.tftest.hcl`)
was re-run with Terraform 1.16.7 and the AWS provider 6.67.0 (the lock file's version), mocked, with
`envs/nonprod.tfvars`.

- First run: `control_c1_plan` **refused** by the `images` validation: "An image is a withdrawn
  digest (withdrawn-images.tf: Control a24c568 …)". This is correct behaviour (platform#146), and
  proves C-1 cannot be planned with the old Control images.
- With placeholder Control digests (`c1c1…`, `c2c2…`, `c3c3…`, not real images): **7 passed, 0
  failed**. Plans: **C-1 33 to add, 0 to change, 0 to destroy; C-2 0 / 3 / 0; C-3 session 19 to
  add.** The C-2 and C-3 address sets are identical to 20 Nov; C-1 is identical apart from three
  `data` reads that the listing script ignores. Harness and addresses:
  [supporting/control-c1-c2-mocked.tftest.hcl](supporting/control-c1-c2-mocked.tftest.hcl),
  [supporting/control-c1-c2-plan-addresses.txt](supporting/control-c1-c2-plan-addresses.txt).
- The run `control_session_without_licence_is_refused` still passes: a session with control-api
  above 0 is refused without the licence key, kid, operator organisation, subjects and Identity
  keys.

### 1.2 What C-1 and C-2 contain [VERIFIED code]

| Item | C-1 | C-2 |
| --- | --- | --- |
| Terraform | KMS licence key (asymmetric P-256, `ECDSA_SHA_256`, never leaves KMS, ADR-0008), alias, key policy; ALB egress rules for control-api/portal; control-api (12), control-migrate (8), control-portal (8) roles, policies, log groups, SGs, task definitions; **no service, no ALB** | `control_licence_public_key`, `control_licence_kid`, operator organisation id and subject(s), `db_bootstrap_products = ["identity","control"]`, Control bundle version ids |
| Actions | 33 / 0 / 0 | 0 / 3 / 0 offline; live plan shows each of the three task definitions as replace (new revision): `db_admin`, `control_api`, `control_migrate` |
| Task-definition revisions | new families control-api, control-migrate, control-portal at revision 1 | db-admin, control-api, control-migrate each +1 |
| Secrets | none | Control bundles `control-api` (`DATABASE_URL`) and `control-migrate` (`DATABASE_MIGRATION_URL`) filled first by `scripts/aws/owner/control-testing-secrets.sh bundles` (owner, CloudShell; values only through stdin; prints version ids only; 8 offline tests) |
| IAM | control-api task role may `kms:Sign` with the licence key only; execution roles read only their own bundle version | unchanged |
| Gates | `withdrawn-images.tf` refuses old digests; `expected-changes.json` declaration must match the live plan; Access team domain and AUD required | the session guard refuses control-api > 0 without the licence material |
| Rollback | `terraform apply` of the previous tfvars (removes the 33; the KMS key goes to pending deletion, 7 to 30 days, cancellable) | previous tfvars: task definitions return to the earlier revision; secrets keep their versions |

### 1.3 Dependency on Identity Stage E [VERIFIED, Stage E report]

Stage E is complete: organisation `munaxa-group` (`071d3060-70ac-4017-9ff9-094ff715051e`), operator
subject `ae62eef5-cf65-43c8-83e2-7786d2d5ae87` with `control-operator-admin`, Control roles seeded.
These are the values C-2 needs for `control_operator_organisation_id` and
`control_operator_subjects` (identifiers, not secrets). Because Stage E has run, C-2 no longer has to
be ordered before it; but the C-2 config PR must update `envs/nonprod.stage-e-tasks.json` for the
new `db_admin` revision, or the `stage_e_task_definitions_match_the_manifest` test fails.

### 1.4 Control execution checklist (ordered; none executed)

| # | Step | Who | Prerequisite | Evidence to record |
| --- | --- | --- | --- | --- |
| 1 | D-SSL pin bump merged in munaxa-control (and control#12) | Claude | Alpine fixed OpenSSL | CI run green with 0 HIGH/CRITICAL |
| 2 | A-5C: publish Control api, migrate, portal from that `main` commit (`publish-images.yml`, tag `image/<sha>`) | **owner** | 1 | run id; three digests; ECR scan clean |
| 3 | A-7: Cloudflare Access application for `operator-test.munaxa.com`; read team domain and AUD | **owner** | none | team domain, AUD (not secrets) |
| 4 | C-1 config PR: three digests, `operator_access`, declaration of 33 creates | Claude | 2, 3 | offline 33/0/0; CI green |
| 5 | C-1 plan and apply (nonprod workflow) | **owner** | 4 merged | plan 33/0/0 matching the declaration; apply run id |
| 6 | `aws kms get-public-key` for the licence key (public) | Claude (read-only, with owner OK) | 5 | public PEM, key ARN |
| 7 | A-4C: `control-testing-secrets.sh bundles` in CloudShell | **owner** | 5 | two version ids (never values) |
| 8 | C-2 config PR: public key, kid `control-licence-nonprod-2026-11`, operator org and subject from Stage E, `db_bootstrap_products`, version ids, Stage E manifest update, declaration (3 replaces) | Claude | 6, 7 | offline 0/3/0; CI green |
| 9 | C-2 plan and apply (with D-1 if Docs is ready) | **owner** | 8 merged | plan matches declaration; apply run id |
| 10 | A-9: Control session (`up` with control-api/portal 1, identity 1; H-20 armed), db-admin, migrate, credential mint for Docs | **owner** approval, Claude operates | 9 | 19 creates; health; one credential id (secret shown once, never logged); cleanup verified |

## 2. Docs Testing readiness

### 2.1 Prerequisites [VERIFIED code unless marked]

| Area | State | Status |
| --- | --- | --- |
| S3 credentials | `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE` in `infra/aws/stack/docs.tf`; adapter signs with task-role credentials from the ECS endpoint, refreshed before expiry; no static keys; task role Get/Put/Delete/AbortMultipartUpload on `bucket/*`, ListBucket on the bucket; SSE-S3 (no KMS needed) | READY |
| Runbook | says the opposite (no role support) until docs#178 merges | BLOCKED (D-SSL in its required check) |
| Storage config | `STORAGE_DRIVER=S3`, bucket from the stack, `STORAGE_PUBLIC_URL` = Docs origin | READY |
| Database and migrations | db-admin creates `edms_owner`, `edms_app` and the database; `docs-migrate` runs the migration image with only the owner URL; `docs-provision` (exit 0 or 4) then `provision-delete` | READY in code; never run |
| Migration image repository | `munaxa-docs/migrate` ECR repository does not exist until the Docs bootstrap (munaxa-docs `infra/terraform/bootstrap`, +1 repository +1 lifecycle policy) | OWNER ACTION (A-3) |
| Secret bundles | three bundles empty; `scripts/aws/owner/docs-testing-secrets.sh` (modes bundles, replace-key, provision-create/-delete, status; 23 offline tests) | OWNER ACTION (A-4) |
| Resend | `MAIL_DRIVER=RESEND`; no key, `notify.munaxa.com` unverified; a placeholder key lets the app run with mail dead-lettered after 5 retries | OWNER DECISION (A-6) |
| Cloudflare Access | Docs (`docs.test.munaxa.com`) is a public product origin, not behind Access; Access is for the Control operator host only | n/a |
| Licensing | `LICENSING_MODE=CONTROL_PLANE`, fails closed with 402 until a Control credential exists (`replace-key CONTROL_PLANE_TOKEN`) | BLOCKED on Control steps 9 to 10 |
| Image scan | api, web, worker, migrate fail only on D-SSL (run 44900058536); antivirus (Ubuntu noble) passes | BLOCKED (upstream) |
| ECR images | only old `f8a8bea` [from 20 Nov reports; ECR not re-read today] | after D-SSL (A-5) |
| IAM and task roles | per-service execution roles read only their own bundle version; task roles as above | READY |
| Health checks | api `/api/health/live`, web `/login` (target groups); images carry `HEALTHCHECK` | READY |
| Rollback | services are at desired 0 between sessions; `down` removes ALB and services; the database keeps data; pins revert by tfvars | READY |
| Cost safeguards | backstop 21:00 UTC, cleanup R 21:05 UTC with alarms, H-20 gate, scheduled `down`; services at 0 in `nonprod.tfvars` | READY (file 06) |

### 2.2 Docs execution checklist (ordered; none executed)

| # | Step | Who | Evidence |
| --- | --- | --- | --- |
| 1 | D-SSL pin bump in munaxa-docs; then merge docs#178 and docs#181 | Claude | CI green, 0 HIGH |
| 2 | A-3 Docs bootstrap plan and apply (migrate repository) | **owner** | plan +1 repository +1 lifecycle; apply id |
| 3 | A-5 Docs release from `main` (api, web, worker, migrate, antivirus) | **owner** | run id, five digests, ECR scans |
| 4 | A-4 `docs-testing-secrets.sh bundles` | **owner** | version ids only |
| 5 | A-6 Resend decision (real key + domain, or placeholder) | **owner** | decision recorded |
| 6 | D-1 config PR: digests, version ids, declaration (42 creates with services off, 19 Nov offline plan) | Claude | offline plan; CI |
| 7 | D-1 plan and apply (may share the C-2 cycle) | **owner** | plan matches declaration |
| 8 | Session: db-admin, docs-migrate, `provision-create` (owner), docs-provision, `provision-delete`, services up | **owner** approval, Claude operates | exit codes; health; first admin created; one-run secret deleted |
| 9 | Control credential to Docs (`replace-key CONTROL_PLANE_TOKEN`), pin apply, licensed route returns 200 not 402 | **owner** | snapshot verified (ES256) |
| 10 | `down`, cleanup verification | Claude | ECS 0, no ALB, DB stopped |

## 3. Identity follow-up: image pin risk O-4

- **Pinned Testing images** [VERIFIED, `envs/nonprod.tfvars`]: api `sha256:9a8c6ebd…`, migrate
  `sha256:5f3bdcce…`, built from identity `2db6ed9` on 13 Nov.
- **Code between `2db6ed9` and `main` `b08e887`** [VERIFIED `git diff`]: two commits (#21, #23).
  No application source changed. The differences are the Dockerfile (OpenSSL 3.5.9-r1, Node tooling
  removed), CI and publish workflows (verify and Grype scan before push, action pinning), and the
  `effect` override in `package.json`/lockfile (a Prisma CLI dependency; affects the migrate image's
  tooling, not the API code).
- **Conclusion:** the pinned digests run the same Identity code as `main`; Stage E proved them
  functionally (probe 28/28). The republication is needed **for image security only**: the pinned
  images carry OpenSSL `3.5.9-r0` (four HIGH CVEs fixed in `-r1`), the D-SSL CVEs, and npm/corepack
  tooling HIGHs, none of which the current `main` Dockerfile ships (except D-SSL). Risk while
  Testing is idle: none (no task runs). Risk during a session: Testing only, short, no production
  data.
- **Publication sequence (none executed):**
  1. D-SSL pin bump merged in munaxa-identity (Claude), CI image job green with 0 HIGH/CRITICAL.
  2. **Owner** dispatches `publish-images-ecr.yml` by pushing tag `image/<main sha>`; the workflow
     verifies the commit is on `main`, builds, verifies, scans (fails on HIGH) and only then pushes
     api and migrate to ECR.
  3. Claude records run id, both digests and the ECR scan (read-only).
  4. Claude opens the pin PR in munaxa-platform: `envs/nonprod.tfvars` images, `envs/nonprod.stage-e-tasks.json`,
     `scripts/aws/connector` E-1 guard fixtures, and adds `9a8c6ebd…`/`5f3bdcce…` to
     `infra/aws/stack/withdrawn-images.tf`; declaration of the task-definition replacements.
  5. **Owner** approves plan and apply. Evidence: plan matching the declaration; the next session's
     task definitions show the new digests.
