# First Testing release preparation: Identity, Control and Work (read-only)

- **Date:** 8 Nov 2026, from 07:51 UTC. **Thread:** "Prepare first Identity, Control and Work Testing release".
- **Brief:** the owner's "Munaxa Testing Deployment — Next Approved Preparation Phase" (8 Nov 2026, 07:50 UTC). Preparation and verification only.
- **Starting point:** platform `main` = `646b7b8` (PR #66). Previous report: [`../2026-11-08-development-access-and-testing-readiness/`](../2026-11-08-development-access-and-testing-readiness/00-DEVELOPMENT-ACCESS-AND-TESTING-READINESS.md). Access policy: [`infra/aws/ACCESS-POLICY.md`](../../../../infra/aws/ACCESS-POLICY.md).
- **Product commits assessed (current `main`, unchanged since 5 Nov):** identity `5277d7190b3dda496443c4bd7d80c78bd4d9174e`, control `a24c5681f0ca98f446098444c79bc36cd4d9bc0c`, work `b490b25792c4d35e5b489790508b2ae6489080cc`.
- **AWS in this task:** metadata-only reads through the existing root-connected connector (caller `arn:aws:iam::229251310592:root`), 07:57:34 to 07:58:20 UTC, under the brief's metadata-only permission and the access policy §1.3. No write, no `Simulate*`, no `GetSecretValue`, no state object read.
- **Verdicts:** **VERIFIED** (live configuration or a successful execution shows it), **NOT VERIFIED** (no evidence, or code only where live evidence is needed), **BLOCKED** (cannot proceed until a named prerequisite exists), **NOT APPLICABLE**.
- **Evidence labels:** [V-aws HH:MM] AWS read in this task; [V-gh] GitHub read in this task; [V-repo] code at the commits above; [V-sar] AWS Service Reference JSON v1.5 read in this task; [V-prov] Terraform AWS provider 6.67.0 source read in this task; [V-local] local mocked Terraform test, no AWS; [V-prior] earlier report, not re-read; [E] inference.

| File | Content |
|---|---|
| this file | All deliverables (§1 to §11) |
| [`supporting/config-a-d-delta-mocked.tftest.hcl`](supporting/config-a-d-delta-mocked.tftest.hcl) | Mocked plan runs used for §7.9 (fake placeholders only) |
| [`supporting/mocked-plan-address-deltas.txt`](supporting/mocked-plan-address-deltas.txt) | Address lists for Config A, A1, A2 and D |

---

## 1. Executive summary and verdict

### Overall: NOT READY FOR TESTING DEPLOYMENT. Image publication: BLOCKED on owner GitHub evidence and release approval.

| Product | Distance to the next step | Verdict |
|---|---|---|
| **Identity** | One owner checklist (GitHub settings) and one release approval from image publication. AWS side ready. **The Identity images have never been built at the release commit** (CI does not build images; the last image build was 9 Sep at `7e2eb6a`, before the migrate target and the RDS CA change), so the first publish run is also the first build | Publication **BLOCKED** (GitHub evidence, self-review decision, approval). Build **NOT VERIFIED** |
| **Control** | Same owner checklist and approval. Images **built successfully in CI at the release commit** (run 41122329528, job "Build the images", 30 Oct 20:20 to 20:22 UTC) | Publication **BLOCKED** (same). Build **VERIFIED** |
| **Work** | Further away. Images never built at the release commit; `PLATFORM_PACKAGES_TOKEN` cannot be proven from CI; deployment needs Identity and Control running first, a Control-issued `mxc_` credential, and Config D. **The Work admin UI is read-only and the employee portal is a placeholder page that is not deployed**, so "basic employee and administrator workflows" can be exercised only as sign-in, read views and API calls | Publication **BLOCKED**; deployment **BLOCKED** (Identity, Control, Config D); milestone item 5 partly **BLOCKED by product scope** |

**New findings in this task (not in earlier reports):**

1. **F-1 Identity and Work images have never been built at the release commits** (§2.1, §4.1). Control's have.
2. **F-2 `ecs:RegisterTaskDefinition` supports resource-level permissions on the task-definition ARN** per the AWS Service Reference [V-sar], so the deployer's `OwnNames` allow on `task-definition/munaxa-nonprod-*` matches its documented resource. Upgrades the 8 Nov item #1 from "likely, unverified" to "consistent with AWS's documented authorization model; still unexercised" (§7.1).
3. **F-3 `kms:PutKeyPolicy` principal-propagation risk is mitigated by the provider:** 6.67.0 retries `MalformedPolicyDocumentException` for up to 3 minutes [V-prov] (§7.1).
4. **F-4 The provider calls `GetKeyRotationStatus` on every AWS_KMS-origin key, asymmetric included, and fails the read on any error other than NotFound** [V-prov]. AWS documents that asymmetric keys cannot rotate but does not say whether the call errors; it is the residual risk of every later plan after the licence key exists (§7.1).
5. **F-5 Config A also registers `aws_ecs_task_definition.docs_db_admin`** (a Docs run-only task definition), because `hosts.docs` is set and `postgres_image` becomes non-empty [V-local, V-repo `docs.tf` 325 to 326]. It runs nothing and costs nothing, but it is a Docs resource in a phase where Docs is out of scope. Owner decision OD-6 (§8).
6. **F-6 Config A can be split:** an Identity-only Config A1 (23 creates) plans cleanly, including a session `up`, without any Control input [V-local] (§7.9). This matches the owner's order (Identity deployed and login working before Control).
7. **F-7 Work admin is read-only by design** (tests assert "no form, button or input") and Work's employee and manager portals are bootstrap pages with no image repository and no service [V-repo] (§4.6).
8. **F-8 Control's ECR publish workflow has no post-push check** (non-root, no credential in history) that Identity's and Work's have [V-repo] (§3.2). Not a blocker.
9. **F-9 Stale comment** in identity `publish-images-ecr.yml` lines 6 to 7 ("both run on an image/* tag until then"): since identity#6 the GHCR workflow is dispatch-only [V-repo]. Documentation only.

**Nothing was changed** in AWS, GitHub, Terraform, secrets, DNS, Cloudflare, production, Render, Supabase or CanteenHub (§11).

---

## 2. Phase A: Identity release-readiness checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| A-1 | API and migration images can be built reproducibly | **NOT VERIFIED** | `apps/api/Dockerfile` pins pnpm 10.33.0 through corepack and installs with `--frozen-lockfile` (lines 33 to 52, 105) [V-repo], but both stages start `FROM node:22-alpine` by tag, not digest (lines 10, 111), so a rebuild is not byte-identical. Identity CI (`ci.yml`) never builds the image. Last image build: GHCR `publish-images.yml` run 34323444447, 9 Sep 2026, at `7e2eb6a`, success [V-gh]. Since then the Dockerfile and its inputs changed in `44c9f49` (#1, migrate target) and `4001ed8` (#5, RDS CA bundle) [V-repo], so the `runtime` and `migrate` targets at `5277d71` have never been built anywhere |
| A-2 | Release workflow exists and is correct in code | **VERIFIED (code)** | `.github/workflows/publish-images-ecr.yml` at `5277d71`: trigger `push` of `image/**` tags only; tag must be `image/<40 hex>` and equal `GITHUB_SHA`; commit must be an ancestor of `main`; `publish` job in environment `image-release` with `id-token: write`, `packages: read`; refuses to run if `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` is empty; actions pinned by commit SHA; `allowed-account-ids: 229251310592`; token passed as BuildKit secret `npm_token`; post-push checks: digest present, non-root user, no credential in history or `.npmrc`, no dev toolchain in `runtime` [V-repo]. The GHCR workflow is `workflow_dispatch` only (no double trigger) [V-repo]. F-9 stale comment |
| A-3 | Required GitHub environment and protection settings | **NOT VERIFIED** | Required (owner checklist G-1 to G-6, G-10, G-11 in [`../2026-11-08-development-access-and-testing-readiness/01-...md`](../2026-11-08-development-access-and-testing-readiness/01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md)): environment `image-release`; required reviewer; self-review decision; admin bypass off; deployment restricted to tag rule `image/*`; no environment-level secrets or variables; `image/*` tag ruleset; `main` ruleset. Not readable from this session (no API for environments, rulesets or secrets here) |
| A-4 | ECR publisher role and OIDC trust match the workflow | **VERIFIED** (AWS side) | [V-aws 07:57] `role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`: federated principal `oidc-provider/token.actions.githubusercontent.com` (the only OIDC provider in the account); `aud` = `sts.amazonaws.com`; `sub` = `repo:munaxa@311481412/munaxa-identity@1354378376:environment:image-release`; `ref` like `refs/tags/image/*`; max session 3600 s (the workflow asks 3600); no attached policies; inline `push-own-images` = `ecr:GetAuthorizationToken` on `*` plus push and read actions on `munaxa-identity/api` and `munaxa-identity/migrate` only. The workflow's job runs in `image-release` on an `image/<sha>` tag push, so its token carries that `sub` and `ref` **if** the repository's OIDC subject format still uses immutable owner and repository ids. That format was proven from an issued token on 31 Oct (probe run 41168351504) [V-prior]; it is a GitHub setting and was not re-read |
| A-5 | Required secrets and variables exist (no values read) | **NOT VERIFIED** | `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` (expected `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`): not readable. `secrets.PLATFORM_PACKAGES_TOKEN`: CI 41992700652 (5 Nov 08:12 UTC, on `5277d71`) passed its Install step with this secret and **no fallback** [V-gh], so a repository-level secret existed and could read `@munaxa/*` at that time [E]. Not shown: expiry, and whether an environment-level secret in `image-release` overrides it (G-6) |
| A-6 | Image publication workflow has ever completed | **NOT VERIFIED (never run)** | `publish-images-ecr.yml`: 0 runs [V-gh 07:5x]. 0 tags in the repository [V-gh] |
| A-7 | Target ECR repositories exist and are configured | **VERIFIED** | [V-aws 07:57] `munaxa-identity/api`, `munaxa-identity/migrate`: IMMUTABLE tags, scan on push, AES256, lifecycle policy "untagged after 7 days" and "keep the last 20 tagged images", **0 images** |
| A-8 | Tag and immutable digest handling | **VERIFIED (code)**; no digest exists yet | Two tags per image (`<short sha>`, `sha-<full sha>`), never `latest`; `provenance: false`, `sbom: false`, so the pushed manifest is single-platform and the build output digest is the image digest; digest printed in the step summary and pulled back by digest for the checks [V-repo]. Terraform accepts only `…/munaxa-<product>/<name>@sha256:<64 hex>` (`stack/variables.tf` 179) [V-repo]. With IMMUTABLE tags, a full re-run of a run whose first leg already pushed fails that leg (`ImageTagAlreadyExists`); use "Re-run failed jobs" only [E] |
| A-9 | Prerequisites still unverified | — | A-1 build; A-3 and A-5 GitHub settings; self-review decision; owner release approval at `5277d71…` |

**Identity image publication: BLOCKED** on A-3, A-5 (owner evidence), the self-review decision and the release approval. When those are done the publish run is the first build of these targets; a build failure stops before any push of that leg and leaves ECR unchanged [V-repo, E].

---

## 3. Phase B: Control release-readiness checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| B-1 | API, migration and portal images build reproducibly | **VERIFIED** (build at the release commit) | CI 41122329528 on `a24c568`, job "Build the images" (id 124291424395), step "Build api, migrate and portal" success 30 Oct 20:20:19 to 20:22:58 UTC [V-gh]. `Dockerfile` pins the base by digest (`node:22-bookworm-slim@sha256:de170b39…f38d`), pnpm by corepack, `--frozen-lockfile` [V-repo]. Not byte-for-byte reproducible (`apt-get update` without a snapshot) [V-repo, E]; the digest, not a rebuild, is what Terraform pins |
| B-2 | Release workflow exists and is correct in code | **VERIFIED (code)** | `.github/workflows/publish-images.yml`: same tag, ancestry, environment, OIDC and pinned-action rules as Identity; matrix `api`, `migrate`, `portal`; token `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN` (the same expression CI built with). F-8: no post-push non-root or credential check |
| B-3 | GitHub environment protection | **NOT VERIFIED** | As A-3 |
| B-4 | Publisher role and OIDC trust | **VERIFIED** (AWS side) | [V-aws 07:57] `munaxa-control-image-publisher`: `sub` = `repo:munaxa@311481412/munaxa-control@1434295290:environment:image-release`, `aud`, `ref` like `refs/tags/image/*`, 3600 s; push only to `munaxa-control/{api,migrate,portal}`. Subject format proven 31 Oct (probe 41168353163) [V-prior] |
| B-5 | Secrets and variables (metadata) | **NOT VERIFIED** | `AWS_IMAGE_PUBLISHER_ROLE_ARN` unreadable. Build credential: whichever of the two secrets CI used on 30 Oct worked [V-gh, E]; the publish uses the same expression, unless an `image-release` environment secret overrides it |
| B-6 | Ever published | **NOT VERIFIED (never run)** | `publish-images.yml`: 0 runs; 0 tags [V-gh] |
| B-7 | ECR repositories | **VERIFIED** | [V-aws 07:57] `munaxa-control/{api,migrate,portal}`: IMMUTABLE, scan on push, AES256, same lifecycle policy, **0 images** |
| B-8 | Tag and digest handling | **VERIFIED (code)** | Same two-tag scheme; digest written to the step summary. No pull-back check (F-8) |
| B-9 | Still unverified | — | B-3, B-5; self-review; release approval at `a24c568…` |

**Dependencies on Identity and ordering.**

- **Publishing** Control images does not depend on Identity.
- **Config A2 (Control task definitions and the licence key)** needs `identity_public_keys` (Control's `OPERATOR_AUTH_PUBLIC_KEYS`) and `operator_access` (Terraform refuses a Control image without it) [V-repo, V-local].
- **Running** Control (`control-api` above 0) needs, besides the licence public key and kid (Config B), `control_operator_organisation_id` and `control_operator_subjects`, which come from Identity's `identity-bootstrap` run (Config C) [V-repo, V-prior phase 1 §7.2]. So Control cannot serve before Identity is deployed, migrated and bootstrapped.

**Control image publication: BLOCKED** on B-3, B-5, self-review and approval.

---

## 4. Phase C: Work release-readiness checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| C-1 | API, migrate and admin image builds | **NOT VERIFIED** | `publish-images-ecr.yml` matrix: `munaxa-work/api` and `munaxa-work/migrate` from `apps/api/Dockerfile` (targets `runtime`, `migrate`), `munaxa-work/admin` from `apps/admin/Dockerfile` [V-repo]. Base `node:22-alpine` by tag. Work CI has no image build job [V-repo, V-gh run 41983857218 jobs]. Last image build: GHCR run 33634221986, 2 Sep, at `869cceb` [V-gh]; the Dockerfiles changed since in `fad8121` (migrate target) and `246edc5` (RDS CA) [V-repo]. Work CI runs on pull requests only; `b490b25` has the same tree as its green PR head `3ec54b5` [V-prior] |
| C-2 | ECR publisher configuration | **VERIFIED** (AWS side) | [V-aws 07:57] `munaxa-work-image-publisher`: `sub` = `repo:munaxa@311481412/munaxa-work@1318345640:environment:image-release`; push only to `munaxa-work/{api,admin,migrate}`. Repositories IMMUTABLE, 0 images. Workflow correct in code (same rules and checks as Identity) |
| C-3 | `PLATFORM_PACKAGES_TOKEN` presence and validity | **NOT VERIFIED; cannot be proven from CI** | The publish build uses `secrets.PLATFORM_PACKAGES_TOKEN` with **no fallback**. CI uses `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN`; a green CI is consistent both with a valid token and with the packages having been granted to the work repository [V-repo `ci.yml` 83 to 95]. The GHCR run of 2 Sep (no fallback) proves the token was valid **then** [V-gh]. Safe ways that expose no value: the owner reads the secret's "Updated" date and the token's expiry and `read:packages` scope (G-8, G-9); otherwise the first publish run is the test (a missing or expired token fails at the install step before any push) |
| C-4 | Required image digests | **BLOCKED** (none exist) | `images.work_api`, `images.work_migrate`, `images.work_admin` |
| C-5 | Identity integration | **NOT VERIFIED** (code ready) | `work-api` env: `PLATFORM_AUTH_ISSUER` = Identity base URL (must equal `IDENTITY_BASE_URL` exactly; nothing checks it at boot), audience `munaxa-work`, ES256, `PLATFORM_AUTH_PUBLIC_KEYS` = `identity_public_keys` (`stack/services.tf` 529 to 536). Sign-in: the ALB sends `/api/auth/*` on `work.test.munaxa.com` to Identity (rule 50), Identity serves its own sign-in page (`apps/api/src/ui/sign-in.page.ts`), `work-admin` sends unauthenticated users to `https://work.test.munaxa.com/api/auth/login` and reads Platform's `__Host-mx_session` cookie on the same host [V-repo]. Needs Identity's `seed-work-roles` and `bootstrap-account` for a Work role (runbook 7.11) |
| C-6 | Control and licensing integration | **BLOCKED** (Control not running) | `LICENSING_MODE = CONTROL_PLANE`, `CONTROL_PLANE_URL` = Control API host; `work-api` bundle key `CONTROL_PLANE_TOKEN` must first hold a placeholder of 20+ characters, then the real `mxc_` credential issued in the operator portal for the Work deployment (runbook 7.12) [V-repo, V-prior]. Production refuses `NONE` (work#24) [V-prior] |
| C-7 | Database and tenant bootstrap | **NOT VERIFIED** | `db_bootstrap_products` must include `work`; `db-admin` then `work-migrate`, then the tenant bootstrap (`scripts/bootstrap-tenant.mjs`) [V-repo, V-prior runbook 7.11] |
| C-8 | UI and backend prerequisites for meaningful Testing | **BLOCKED for employee self-service; NOT VERIFIED otherwise** | F-7: Work admin is read-only by design: its tests assert "no form, button or input" on payroll, recruitment, workflow and career pages [V-repo `apps/admin/src/*/…test.tsx`], and no admin source issues a POST, PUT, PATCH or DELETE [V-repo]. `apps/employee-portal` and `apps/manager-portal` are single bootstrap pages ("Employee self-service…", one card) with no Dockerfile, no ECR repository and no service in the stack [V-repo, V-aws]. So in Testing an administrator can sign in and view records, queues and dashboards; every write (create an employee, a leave request, an approval action) is an authenticated API call to `work.test.munaxa.com/api/v1/*`; an employee has no screen |

**Work: image publication BLOCKED** (C-1 unproven, C-3, the GitHub items); **deployment BLOCKED** on Identity and Control running, Config D and the `mxc_` credential. Green CI does not show that Work is deployable.

---

## 5. Evidence references

| What | Reference | Time (UTC) |
|---|---|---|
| Platform main | `646b7b8` (PR #66) | 8 Nov |
| Identity release candidate | `5277d7190b3dda496443c4bd7d80c78bd4d9174e`; CI 41992700652 success | 5 Nov 08:12 |
| Identity last image build | GHCR `publish-images.yml` run 34323444447 at `7e2eb6a`, success | 9 Sep 07:21 |
| Identity ECR publish runs | 0; tags 0 | read 8 Nov ~07:52 |
| Control release candidate | `a24c5681f0ca98f446098444c79bc36cd4d9bc0c`; CI 41122329528, jobs 124291423818 and 124291424395 (images) success | 30 Oct 20:20 to 20:23 |
| Control publish runs | 0; tags 0 | read 8 Nov ~07:52 |
| Work release candidate | `b490b25792c4d35e5b489790508b2ae6489080cc` (tree of PR head `3ec54b5`, CI 41983857218 success, 4 jobs, no image job) | 5 Nov 06:57 to 07:07 |
| Work last image build | GHCR run 33634221986 at `869cceb`, success | 2 Sep 13:11 |
| Work ECR publish runs | 0; tags 0 | read 8 Nov ~07:52 |
| OIDC subject probes | identity 41168351504, control 41168353163, work 41168355717 | 31 Oct 04:23 |
| Scheduled `aws-session` (latest) | run 42422313396 (schedule) success | 7 Nov 22:48 |
| AWS read batch 1 | STS, ECR (8 repos, images, lifecycle), IAM publisher roles, OIDC providers, Secrets Manager (names, version counts), KMS aliases, RDS, ECS | 07:57:34 to 07:58:00 |
| AWS read batch 2 | ELBv2, EC2 (NAT, EIP, instances, ENIs), Scheduler, RDS manual snapshots, CloudTrail write events (26 h) | 07:58:13 to 07:58:20 |
| AWS Service Reference | `servicereference.us-east-1.amazonaws.com/v1/{ecs,kms,iam}/…json`, Version v1.5 | 07:54 |
| Provider source | `hashicorp/terraform-provider-aws` tag `v6.67.0`, `internal/service/kms/key.go` (sha256 `7fa79398…5c77`), `key_policy.go` (`e4783cd2…0484`), `wait.go` | 07:55 |
| Local mocked plans | Terraform 1.16.5 (zip sha256 `2bc2fcff…b5e4`), provider 6.67.0 (zip `4ce94853…7f63`), both equal to HashiCorp's SHA256SUMS; 5 runs passed | 08:00 to 08:10 |

### 5.1 Fresh AWS metadata (all [V-aws], 8 Nov)

| # | Check | Result | Time |
|---|---|---|---|
| 0 | Caller | `arn:aws:iam::229251310592:root` | 07:57:34 |
| 1 | ECR, 8 product repositories | All IMMUTABLE, scan on push, AES256, lifecycle policy (untagged 7 days; keep 20 tagged), **0 images each** | 07:57 |
| 2 | Publisher roles (3) and OIDC provider | As A-4, B-4, C-2; exactly one OIDC provider (`token.actions.githubusercontent.com`) | 07:57 |
| 3 | `munaxa-nonprod/` secrets | 10 containers (identity, identity-migrate, control-api, control-migrate, work-api, work-migrate, school-api, school-migrate, docs-api, docs-operator), all encrypted with key `45eda044-…`, **0 versions each** | 07:57 |
| 4 | KMS aliases containing `munaxa` | `alias/munaxa-nonprod-data`, `alias/munaxa-shared-tfstate`, `alias/munaxa-docs-eu-prod-tfstate`. **No licence key** | 07:57 |
| 5 | RDS `munaxa-nonprod-pg` | **stopped**, db.t4g.micro, 16.13, 20 GB gp3, not public, deletion protection on | 07:57 |
| 6 | ECS `munaxa-nonprod` | ACTIVE, 0 services, 0 running, 0 pending, 0 active task-definition families | 07:58 |
| 7 | ALB, NAT, Elastic IP, EC2 | 0, 0, 0, 0. One ENI: `eni-01a8dd0c4c248e423` "RDSNetworkInterface", no public IP | 07:58 |
| 8 | Backstop | 11 schedules `munaxa-nonprod-backstop-*`, all ENABLED | 07:58 |
| 9 | RDS manual snapshots | `munaxa-docs-eu-prod-pg-final`, 20 GB, created 4 Nov 07:33 (old Docs, retained until about 4 Dec) | 07:58 |
| 10 | CloudTrail write events, 7 Nov 05:58 to 8 Nov 07:58 | 21 events, **no AccessDenied or Unauthorized**. 7 Nov 21:00 backstop: `StopDBInstance` → `InvalidDBInstanceStateFault` (already stopped), 10 × `UpdateService` → `ServiceNotFoundException`; the rest are root CloudShell session events (latest 07:14:18) | 07:58 |

Not re-read in this task (read at 06:54 to 06:55 by the previous report): ACM certificate, deployer policies.

---

## 6. Verified versus unverified GitHub settings

| Setting | identity | control | work | Evidence |
|---|---|---|---|---|
| Release workflow present and correct in code | VERIFIED (code) | VERIFIED (code) | VERIFIED (code) | §2 to §4 |
| Workflow ever run | never | never | never | [V-gh] |
| `image/*` tags | 0 | 0 | 0 | [V-gh] |
| CI green on the release commit | VERIFIED | VERIFIED | VERIFIED (PR head, same tree) | §5 |
| Images built at the release commit | **NOT VERIFIED** | **VERIFIED** | **NOT VERIFIED** | §2, §3, §4 |
| OIDC subject format (immutable ids) | VERIFIED 31 Oct, not re-read | same | same | probes |
| Environment `image-release` exists | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable |
| Required reviewer; self-review; admin bypass off | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable |
| Deployment tag rule `image/*` | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable |
| Environment-level secrets or variables (expected none) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable |
| `AWS_IMAGE_PUBLISHER_ROLE_ARN` value | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable |
| `PLATFORM_PACKAGES_TOKEN` usable | Repository secret worked 5 Nov 08:12 [E]; expiry NOT VERIFIED | Not required if `GITHUB_TOKEN` suffices; CI build worked 30 Oct | **NOT VERIFIED** (last proof 2 Sep) | §2 A-5, §3 B-5, §4 C-3 |
| `image/*` tag ruleset; `main` ruleset | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | not readable (`list_branches` `protected` does not reflect rulesets) |

The owner checklist G-1 to G-11 of the previous report is still the way to close these; it is unchanged.

---

## 7. Phase D: Config A IAM and deployment prerequisites

### 7.1 Deployer IAM for Config A (update of `../2026-11-08-development-access-and-testing-readiness/02-CONFIG-A-IAM-ASSESSMENT.md`)

No simulation was run. The new evidence is documentation (AWS Service Reference) and provider source.

| # | Concern | What the code allows | New evidence | Verdict |
|---|---|---|---|---|
| D-1 | `ecs:RegisterTaskDefinition` resource scope | `OwnNames`: `ecs:*` on `arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-*` (`bootstrap/iam_allow.tf` 261, 270) | [V-sar] `RegisterTaskDefinition` resource type `task-definition`, ARN format `…:task-definition/${TaskDefinitionFamilyName}:${TaskDefinitionRevisionNumber}`; condition keys `aws:RequestTag/${TagKey}`, `aws:TagKeys`, `ecs:compute-compatibility`, `ecs:privileged`, `ecs:task-cpu`, `ecs:task-memory`. Families `munaxa-nonprod-<name>` produce `task-definition/munaxa-nonprod-<name>:<rev>`, which the pattern matches. `ecs:TagResource` (with `ecs:CreateAction`) also lists `task-definition` | **NOT VERIFIED** (never exercised), but the earlier "likeliest failure" is downgraded: the allow matches the documented resource. Tag-on-create satisfies `CreatesCarry*` through `default_tags` [V-repo] |
| D-1b | Actions on task definitions that take `*` only | `DescribeTaskDefinition` and `ListTaskDefinitions` are covered by `deployer-read` `ecs:Describe*`, `ecs:List*` on `*` [V-repo]. `DeregisterTaskDefinition` has **no resource type** [V-sar], so the name-scoped allow would not match it | Every task definition in the stack sets `skip_destroy = true` (`modules/service/main.tf` 214, `ops.tf` 107, 254, 356, `docs.tf` 329, 439) [V-repo], so Terraform never calls `DeregisterTaskDefinition` | **VERIFIED (code)**: no deregister call is made |
| D-2 | `iam:PassRole` limited to the intended ECS task roles | `PassOwnRoles`: `role/munaxa-shared/munaxa-nonprod-*` with `iam:PassedToService` in `ecs-tasks`, `ecs`, `scheduler` | [V-sar] `PassRole` resource `role`, condition keys `iam:PassedToService`, `iam:AssociatedResourceArn`. Every Config A role is `/munaxa-shared/munaxa-nonprod-…` [V-repo, 8 Nov 02 #2]. The allow also admits any other `munaxa-nonprod-*` role under that path, but no other path; `role/munaxa-shared/bootstrap/*` is denied | **NOT VERIFIED** (never exercised); scope is "this environment's stack roles", not "only the four Config A roles". Narrower scoping would be an IAM change and is not proposed |
| D-3 | `kms:CreateKey` (asymmetric) | `CreateWithOwnTags` on `*` with request tags | [V-sar] `CreateKey` has no resource type (so `*` is required and used); `kms:KeySpec`, `kms:KeyUsage` exist as condition keys but are not used, so `ECC_NIST_P256` / `SIGN_VERIFY` is not restricted | **NOT VERIFIED** (asymmetric create never exercised; symmetric create by the same statement exercised in G3) |
| D-4 | `kms:PutKeyPolicy` | `OwnTagged` on `*` with resource tags | [V-sar] resource `key`. [V-prov] `updateKeyPolicy` retries `NotFoundException` and `MalformedPolicyDocumentException` for up to `propagationTimeout` = 3 minutes, so a just-created `control-api` task role that IAM has not yet propagated is retried rather than failing at once. Lockout check: the new policy keeps `kms:PutKeyPolicy` for the account principal (IAM delegation) [V-prior] | **NOT VERIFIED**: needs a real apply (the lockout and principal checks run only in KMS). Propagation risk mitigated |
| D-5 | `kms:GetKeyRotationStatus` on an asymmetric key | Allowed by `OwnTagged` and by the key policy [V-prior] | [V-prov] `findKeyRotationEnabledByKeyID` is called for every key with `Origin = AWS_KMS` (no key-spec check) and any error except `NotFoundException` fails the refresh. KMS documentation: "Automatic key rotation is supported only on symmetric encryption KMS keys"; the API lists `UnsupportedOperationException` as a possible error without saying when [V-doc]. Because the provider makes this call on every asymmetric key it manages, an error here would break any Terraform-managed asymmetric key; that it is shipped this way suggests KMS answers `KeyRotationEnabled: false` [E] | **NOT VERIFIED**; first evidence comes at the Config A2 apply (the provider reads the key right after creation). Failure mode: the apply stops after `CreateKey`, the key stays in state (`prevent_destroy`), and no plan works until fixed |
| D-6 | `kms:CreateAlias` | `OwnNames` alias `alias/munaxa-nonprod-*` and `OwnTagged` key | [V-sar] resources `alias` and `key` (both checked) | **NOT VERIFIED** (pattern exercised in G3) |
| D-7 | SCPs | — | Management account: SCPs do not apply [V-prior] | **NOT APPLICABLE** |

**Config A IAM verdict: NOT VERIFIED.** The likeliest failure moves from D-1 to D-4 and D-5 (KMS-side checks the simulator cannot run). The prepared simulation (`../2026-11-08-development-access-and-testing-readiness/supporting/config-a-iam-simulation-PREPARED-NOT-RUN.sh`) remains not authorized and not run. Splitting Config A (§7.9) puts the KMS items in A2, after Identity is proven.

### 7.2 Required image digests

| Input | Repository | Source | Status |
|---|---|---|---|
| `images.identity_api` | `munaxa-identity/api` | Identity publish run summary | BLOCKED (not published) |
| `images.identity_migrate` | `munaxa-identity/migrate` | same | BLOCKED |
| `images.control_api` | `munaxa-control/api` | Control publish run summary | BLOCKED |
| `images.control_migrate` | `munaxa-control/migrate` | same | BLOCKED |
| `images.control_portal` | `munaxa-control/portal` | same | BLOCKED |
| `images.work_api`, `work_migrate`, `work_admin` | `munaxa-work/*` | Work publish run summary (Config D) | BLOCKED |
| `valkey_image` | `public.ecr.aws/valkey/valkey@sha256:<64 hex>` | Chosen at PR time (a Valkey 8.x image), by digest | NOT VERIFIED (not chosen; the sandbox cannot reach `public.ecr.aws` tokens) |
| `postgres_image` | `public.ecr.aws/docker/library/postgres@sha256:<64 hex>`, PostgreSQL 16 client | Chosen at PR time, by digest | NOT VERIFIED (without it `db-admin` is not registered and no database can be created) |

### 7.3 Non-secret configuration inputs (`infra/aws/stack/envs/nonprod.tfvars`)

| Input | Config | Format | Status |
|---|---|---|---|
| `identity_signing_kid` | A1 | 3+ characters, listed in `identity_public_keys`; proposed `identity-nonprod-2026-11` | Missing (owner) |
| `identity_public_keys` | A1 | JSON `[{"kid":…,"publicKey":"<SPKI PEM>"}]` as a heredoc string; a private key is refused | Missing (owner) |
| `db_bootstrap_products` | A1 → A2 → D | `["identity"]` → `["identity","control"]` → `[…,"work"]` | Ready to write |
| `desired_counts` | A1 onward | The whole 10-key map (a partial map breaks the plan); `control-api` and `control-portal` = 0 until Config C | Ready to write |
| `operator_access` | A2 | `{ team_domain = "https://<team>.cloudflareaccess.com", audience = "<AUD tag>" }` | Missing (owner, Cloudflare) |
| `control_licence_public_key`, `control_licence_kid` | B | SPKI PEM from KMS `GetPublicKey` after A2; kid 1 to 64 characters, proposed `control-nonprod-2026-11` | Missing (exists only after A2) |
| `control_operator_organisation_id`, `control_operator_subjects` | C | From the `identity-bootstrap` run output | Missing (after Identity bootstrap) |
| `secret_version_ids` | after each bundle write | Version ids per bundle (metadata, not values) | Missing (no versions exist) |
| Unchanged, already correct | — | `edge_enabled = false`, `services_enabled = false`, `hosts`, `certificate_domains`, `operator_cidrs = []`, backstop schedule, `docs_redis_image` | [V-prior phase 1 §8.1] |
| Declaration | every apply | `envs/nonprod.expected-changes.json` written from the PR's real plan | Missing |

### 7.4 Secret names and owner-managed values still missing (names only; no value requested)

All 10 containers exist with **0 versions** [V-aws 07:57]. Needed for the first milestone:

| Bundle | Keys | Needed by | Missing |
|---|---|---|---|
| `munaxa-nonprod/identity` | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` | Identity service, Valkey sidecar, `db-admin` | all 5 |
| `munaxa-nonprod/identity-migrate` | `DATABASE_MIGRATION_URL` | `identity-migrate`, `identity-bootstrap`, `db-admin` | 1 |
| `munaxa-nonprod/identity-bootstrap` | `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` | `identity-bootstrap` only; **not a Terraform container**: the owner creates it before the run and deletes it after | container and both keys |
| `munaxa-nonprod/control-api` | `DATABASE_URL` | Control API, `db-admin` | 1 |
| `munaxa-nonprod/control-migrate` | `DATABASE_MIGRATION_URL` | `control-migrate`, `db-admin` | 1 |
| `munaxa-nonprod/work-api` | `DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN` (placeholder of 20+ characters, then the real `mxc_` credential) | Work API, `db-admin` | all 3 |
| `munaxa-nonprod/work-migrate` | `DATABASE_MIGRATION_URL` | `work-migrate`, `db-admin` | 1 |

The RDS master secret is RDS-managed and read only by `db-admin`. School and Docs bundles are not read by any task in this milestone [V-prior phase 1 D-3].

### 7.5 Identity signing key prerequisites

ES256 (P-256) only. Generated by the owner with `node apps/api/scripts/generate-signing-key.mjs --kid identity-nonprod-2026-11` (the script exists at `5277d71` [V-repo]) or `openssl` on the owner's machine or in CloudShell, never in a shared or logged terminal. Private half only into `munaxa-nonprod/identity` `IDENTITY_SIGNING_PRIVATE_KEY`; kid and public half into tfvars (§7.3). Detail: phase 1 report §7.1 [V-prior]. **Status: missing (owner).**

### 7.6 Control licence-signing KMS prerequisites

Created by the Config A2 apply (`aws_kms_key.licence`, `ECC_NIST_P256`, `SIGN_VERIFY`, `prevent_destroy`, alias `alias/munaxa-nonprod-control-licence`; only the `control-api` task role may `kms:Sign`) [V-repo]. Prerequisites: Control API digest, `operator_access`, `identity_public_keys`; IAM D-3 to D-6. After the apply the owner reads the public half (`aws kms get-public-key …`, phase 1 §7.2) for Config B. **Status: key does not exist [V-aws 07:57]; NOT VERIFIED.** About US$1 a month once created.

### 7.7 Database and bootstrap prerequisites

1. `postgres_image` digest (else no `db-admin`).
2. Bundle values for each product in `db_bootstrap_products` (§7.4).
3. During a session: `db-admin` → `identity-migrate` → (A2) `control-migrate` → `identity-bootstrap` steps 1 to 3 (organisation, operator account, Control roles; prints the organisation id and operator `sub`) → delete `identity-bootstrap` secret → restart Identity. Each run-only task must exit 0, one at a time [V-prior runbook 7.7].
4. Work (Config D): `db-admin` with `work` → `work-migrate` → tenant bootstrap → `identity-bootstrap` with `seed-work-roles` and `bootstrap-account --role <Work role>` [V-prior runbook 7.11].

No migration runs on service start [V-prior]. **None of this has run (0 task-definition families) [V-aws 07:58].**

### 7.8 Cloudflare Access and operator access prerequisites

- **Cloudflare Access (owner):** self-hosted application for `operator-test.munaxa.com`, path empty; one Allow policy listing operator emails; Require "Authentication method: MFA" with an identity provider that reports MFA; session 8 hours or less; Full (strict) for that hostname only; DNS record proxied, created per session because the ALB name changes every session (DNS-H1). Copy the team domain and AUD tag (public identifiers) [V-prior phase 1 §5]. **Status: not created; NOT VERIFIED.**
- **Operator access in Terraform:** `operator_access` (§7.3), `operator_cidrs = []`; before it is set the ALB answers 403 on the operator host [V-prior].
- **Control operator allow-list:** `control_operator_organisation_id`, `control_operator_subjects` (Identity `sub` values of the same people allowed in Access) for Config C.
- **AWS operator access for deployment:** under the access policy, the owner (root, MFA) approves and dispatches workflows; deployment IAM (Identity Center, permission sets, break-glass) stays deferred (ACCESS-POLICY §2) and is not a prerequisite here.

### 7.9 Exact Config A Terraform inputs and expected resource changes

Local mocked plans at `646b7b8` with fake placeholders [V-local]; real counts come from the PR's plan in `aws-terraform.yml`. Address lists: [`supporting/mocked-plan-address-deltas.txt`](supporting/mocked-plan-address-deltas.txt).

| Run | Inputs added to `nonprod.tfvars` | Mocked plan | Delta |
|---|---|---|---|
| Baseline (main) | none | 77 creates | = 64 G3 + 13 backstop, the live state [V-prior] |
| **Config A1, Identity only, services off** | `images.identity_api`, `images.identity_migrate`, `valkey_image`, `postgres_image`, `identity_signing_kid`, `identity_public_keys`, `db_bootstrap_products = ["identity"]`, full `desired_counts` | 100 | **+23**: `module.identity` (9: task definition, execution role and policy, log group, security group, 4 rules), `module.migrate["identity"]` (8), `identity_bootstrap` task definition, role and policy (3), `db_admin` task definition, `docs_db_admin` task definition (F-5), ALB-to-identity egress rule |
| Config A1, session `up` | `edge_enabled`, `services_enabled` = true | plans | — |
| **Config A2, adds Control** | `images.control_api`, `control_migrate`, `control_portal`, `operator_access`, `db_bootstrap_products = ["identity","control"]` | 133 | **+33**: `aws_kms_key.licence`, `aws_kms_key_policy.licence`, `aws_kms_alias.licence`, `module.control_api` (12, incl. task role and policy), `module.control_migrate` (8), `module.control_portal` (8), 2 ALB egress rules. Real plan also shows a new `db_admin` revision (`db_bootstrap_products` changed) [E] |
| Config A (A1 + A2 at once) | all of the above | 133 | +56 |
| Config D, adds Work | `images.work_api`, `work_migrate`, `work_admin`, `db_bootstrap_products` + `work` | 161 | **+28**: `module.work_api` (10), `module.work_admin` (8), `module.migrate["work"]` (8), 2 ALB egress rules; plus a new `db_admin` revision [E] |

**Stop conditions for every Config plan:** any change, replace or destroy of RDS, VPC, subnets, bundles, ACM, backstop or bootstrap resources; any address not in the declaration; anything in `prod`.

---

## 8. Missing owner inputs and decisions

| # | Item | Type | Blocks |
|---|---|---|---|
| OI-1 | GitHub checklist G-1 to G-11 results for identity, control, work | Evidence | All publication |
| OI-2 | Identity key pair: kid and public half (private half straight into Secrets Manager) | Input | Config A1 |
| OI-3 | Bundle values for identity, identity-migrate (later control-api, control-migrate, work-api, work-migrate); `identity-bootstrap` container | Secret values (owner only) | First session |
| OI-4 | Cloudflare Access application; team domain and AUD tag | Input | Config A2 |
| OI-5 | Operator email(s) for Access and later the operator `sub` | Input | A2, C |
| OD-1 | Self-review: second reviewer on `image-release`, or explicit Testing-only risk acceptance | Decision | Publication |
| OD-2 | Approve each release at its SHA: identity `5277d71…`, control `a24c568…`, work `b490b25…` | Approval | Publication |
| OD-3 | Accept that the first publish run is also the first build of the Identity and Work images (F-1) | Decision | Identity, Work publication |
| OD-4 | Config A as one apply (56) or split A1 (23, Identity) then A2 (33, Control) (F-6) | Decision | Config A PR |
| OD-5 | IAM: authorize the prepared simulation, or rely on the first apply with stop-on-AccessDenied | Decision | Config A apply |
| OD-6 | Accept the inert `docs_db_admin` task definition in Config A, or keep Docs entirely out (a code change) (F-5) | Decision | Config A PR |
| OD-7 | Define "basic employee and administrator workflows" for this milestone given F-7 (read-only admin, no employee UI): sign-in, read views and API calls, or wait for product work | Decision | Milestone item 5 |
| OD-8 | Valkey and PostgreSQL client image choices (by digest) | Decision | Config A1 |

---

## 9. Phase E: dependency-ordered deployment sequence (proposal; nothing here is approved)

Changes column: **AWS**, **GH** (GitHub settings or tags), **SEC** (secret values), **DNS** (Cloudflare), **DATA** (application data), or none.

| # | Step | Preconditions | Component | Owner approval | Evidence of success | Stop or rollback | Changes |
|---|---|---|---|---|---|---|---|
| 1 | Owner verifies GitHub release controls | — | Settings of identity, control, work; checklist G-1 to G-11 | None (read only) | Results posted in the thread; C-1 to C-5 updated | Any mismatch: fix before step 2 (a separate approved change) | none (read) |
| 2 | Identity image publication | 1 done; OD-1, OD-2, OD-3 | Tag `image/5277d7190b3dda496443c4bd7d80c78bd4d9174e`; identity `publish-images-ecr.yml`; environment `image-release` | Release approval; reviewer approves the job | Both legs green; 2 digests in the summary; ECR shows 2 images with tags `5277d71`, `sha-5277d71…` | Build or push fails: nothing published for that leg; "Re-run failed jobs" only, never re-tag | GH (tag), AWS (ECR images) |
| 3 | Identity deployment prerequisites | 2 | Owner: key pair, Valkey and Postgres digests, bundle values `identity`, `identity-migrate` | Secret writes are owner actions | Bundles show 1 version each (metadata); public key and kid in the thread | Wrong key format: Identity refuses to start (safe) | SEC, AWS (secret versions) |
| 4 | Identity infrastructure (Config A1) and deployment | 3; OD-4, OD-5, OD-6 | Platform PR: tfvars (§7.3) + declaration (expected 23 creates); `aws-terraform.yml` plan then apply, services off; then `secret_version_ids` pin | Infrastructure approval of the exact plan | Plan equals declaration; apply 23/0/0; post-apply plan clean | Any unexpected address, change or destroy: stop. `AccessDenied`: stop, decode, report (ACCESS-POLICY D-8) | AWS |
| 5 | Identity login and authentication | 4 | `aws-session.yml up` (Identity only; DB starts); DNS `id.test` and `work.test` CNAMEs (DNS only) to the ALB; run `db-admin`, `identity-migrate`, `identity-bootstrap` one at a time; delete `identity-bootstrap` secret; then `down` | Session approval (G7); DNS by owner | Each task exit 0; `https://id.test.munaxa.com/api/auth/health/ready` 200; operator sign-in works on the sign-in page; ACM `InUseBy` set while the ALB exists | Any task non-zero: `down`, investigate; Testing data only | AWS, DNS, DATA (test accounts) |
| 6 | Control image publication and deployment | 5 (for running; publication can run any time after 1); OI-4, OI-5 | Tag `image/a24c5681…`; control `publish-images.yml`; Config A2 (expected 33 creates incl. the licence key); public key read; Config B; bundle values `control-api`, `control-migrate` | Release approval; infrastructure approvals for A2 and B | 3 digests; A2 apply 33/0/0 (plus `db_admin` revision); licence key exists, `ECC_NIST_P256`; Config B apply updates task definitions only | A2 fails after `CreateKey`: stop, key stays (prevent_destroy), do not re-apply until D-4/D-5 are understood | GH, AWS, SEC |
| 7 | Control-to-Identity integration | 6 | `up`; `control-migrate`; Config C (operator organisation and subjects, Control counts 1); operator DNS proxied behind Access | Approvals for C; session | Smoke S-1 to S-6 + S-4b (portal through Access with MFA; direct to ALB 401; `/healthz` 200; public keys endpoint returns the KMS key; no "Entitlements could not be confirmed"); then `down` | Any smoke failure: `down`; never relax `LICENSING_MODE` | AWS, DNS, DATA |
| 8 | Work image publication and deployment | 7; G-8/G-9 for Work's token | Tag `image/b490b257…`; work `publish-images-ecr.yml`; Config D (expected 28 creates + `db_admin` revision); bundles `work-api` (placeholder token), `work-migrate` | Release and infrastructure approvals | 3 digests; Config D apply as declared | As step 4 | GH, AWS, SEC |
| 9 | Work authentication and licensing | 8 | `up`; `db-admin` (with work), `work-migrate`, tenant bootstrap, `identity-bootstrap` (Work roles, Work account); operator portal: create Work deployment, issue `mxc_`; write it to `work-api`; re-pin | Session; owner writes the credential | Sign-in on `work.test` succeeds; protected route 200, user without role 403; with placeholder token licensing fails closed, with `mxc_` it is licensed (S-7 to S-9) | Licensing fails: fix token or Control; `down` | AWS, SEC, DATA |
| 10 | Basic end-to-end Testing workflows | 9; OD-7 | Admin: sign in, view employee, leave, approvals screens; API: an authenticated write and read; operator: licence view | Owner defines the scope (OD-7) | Recorded results per workflow | Failure: record, `down` | DATA (test data) |
| 11 | Session shutdown and cost verification | after every session | `aws-session.yml down`; read-only check (ALB, ECS, EIP, RDS status); Cost Explorer by the owner | None for `down`; read-only check under the access policy | 0 ALB, 0 tasks, 0 EIP, RDS stopped; cost within plan | Anything left running: `down` again; backstop at 21:00 UTC is the last line, not the plan | AWS (stop only) |

Deployment IAM and production access (ACCESS-POLICY §2, F-1 to F-7) stay documented future work, not part of this sequence.

---

## 10. Cost and shutdown limitations

Prices are the eu-central-1 list prices recorded in [`../2026-11-05-testing-readiness/03-TESTING-DEPLOYMENT-RUNBOOK.md`](../2026-11-05-testing-readiness/03-TESTING-DEPLOYMENT-RUNBOOK.md) §10 [V-prior]; totals are estimates [E].

| Item | Behaviour | Estimate |
|---|---|---|
| ECR storage | US$0.10 per GB-month; lifecycle keeps 20 tagged images per repository and expires untagged after 7 days [V-aws] | A few GB for 8 images: under US$1 a month; grows with every release until the 20-image cap |
| Stopped RDS | Storage 20 GB gp3 ≈ US$2.74 a month while stopped. **AWS starts a stopped instance after 7 days**: stopped 6 Nov ~16:18, so expected restart about **13 Nov 16:18 UTC** [V-prior, E]; while running ≈ US$0.019 an hour | Until a stop: about US$0.10 for the hours until 21:00, about US$14 a month if never stopped |
| Running ECS tasks | Fargate US$0.04656 per vCPU-hour, US$0.00511 per GB-hour | Identity + Control ≈ US$0.057 an hour; + Work ≈ US$0.085 an hour |
| Load balancer and public IPv4 | ALB US$0.027 an hour + LCU; each task and ALB node has a public IPv4 at US$0.005 an hour (no NAT by design) | Session total ≈ US$0.14 an hour (Identity + Control), ≈ US$0.17 an hour (+ Work) |
| Secrets Manager | US$0.40 per secret-month: 10 bundles + RDS master secret (+ the one-run `identity-bootstrap` while it exists) | ≈ US$4.40 a month |
| KMS | US$1 per key-month: nonprod data key, shared state key, old Docs state key; the licence key adds US$1 after A2 | ≈ US$3 now, US$4 after A2 |
| CloudWatch and other always-on | Log ingestion US$0.63 per GB (sessions only), Cloud Map private zone US$0.50 a month, S3 cents, Scheduler free tier | ≈ US$0.5 to 1 a month |
| Old Docs final snapshot | `munaxa-docs-eu-prod-pg-final`, 20 GB [V-aws 07:58], kept until about 4 Dec | ≈ US$2 a month until deleted [E] |

**Idle total** after Config A (no session, DB stopped): about **US$13 to 15 a month** while the Docs snapshot exists [E] (the earlier US$11 to 12 excluded the snapshot and the old Docs state key). At US$0.17 an hour that leaves roughly 200 session hours under the US$50 target [E].

**Shutdown limitations (recorded as they are):**

1. The backstop has 11 enabled schedules [V-aws 07:58]. Its nightly invocations on 6 and 7 Nov reached `StopDBInstance` and `UpdateService` with the right identifiers and no AccessDenied, but the database was already stopped and no service existed. **It has never been shown to stop a running database or scale a running ECS service.**
2. The first time the database is running at 21:00 UTC (a session left open, or the auto-restart around 13 Nov) is the first real test; check CloudTrail the next morning for a successful `StopDBInstance`.
3. Scheduled `aws-session down` (crons 19:17 and 01:47 UTC) runs late: the latest ran at 22:48 UTC on 7 Nov (run 42422313396, success) [V-gh]. A dispatched `down` did stop the database on 6 Nov (run 42251171427) [V-prior].
4. Nothing was started in this task to test the backstop.
5. **The environment is not "fully shut down"**: compute and networking are off (0 ALB, NAT, EIP, EC2, ECS task) [V-aws 07:58], but storage, secrets, keys, the Cloud Map zone, ECR repositories and the Docs snapshot keep costing money.

---

## 11. Exact next action for the owner, and what this task did

### 11.1 Next action

**Complete the GitHub release-controls checklist G-1 to G-11 for munaxa-identity, munaxa-control and munaxa-work** (read only: [`../2026-11-08-development-access-and-testing-readiness/01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md`](../2026-11-08-development-access-and-testing-readiness/01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md)) and post the results, together with the self-review decision (OD-1). That is the only thing between Identity and its first image publication on the GitHub side; the release approval (OD-2) and OD-3 follow.

### 11.2 Changes made

| Area | Change |
|---|---|
| AWS | **None.** Metadata-only reads (§5.1): `Describe*`, `List*`, `Get*` metadata (`GetRole`, `GetRolePolicy`, `GetLifecyclePolicy`), `LookupEvents`. No `GetSecretValue`, no `Simulate*`, no state object read |
| GitHub | **None.** Read workflow runs, jobs and tags. No tag, workflow run, setting, secret, variable or environment change. This report is one docs-only PR, not merged by Claude |
| Terraform | **None** against AWS. Local `terraform test` with a mocked provider and fake values in a scratch copy |
| Secrets, keys | **None.** No value or key read, created or exposed |
| DNS, Cloudflare | **None** |
| Production, Render, Supabase | **None** |
| CanteenHub | **Not inspected, inventoried or touched** |

---

## 12. Update, 8 Nov 2026 08:10 to 09:05 UTC: owner GitHub release controls

The owner reconnected GitHub and worked through the checklist in the thread. **No GitHub setting was changed by Claude**; every change below was made by the owner in the GitHub UI.

### 12.1 What this session can and cannot read

- Readable: `GET repos/munaxa/<repo>/rulesets` and `rulesets/<id>` (read-only).
- Not readable: `environments`, `actions/variables`, `actions/secrets` ("not permitted through this proxy", HTTP 403) and classic branch protection ("Resource not accessible by integration"). Reconnecting GitHub does not change this.
- Before the owner's change (08:10 UTC) `munaxa-identity` had **no ruleset** (empty list).

### 12.2 Rulesets, created by the owner, read back by Claude [V-gh]

| Repository | Ruleset (id) | Read | Content | Verdict |
|---|---|---|---|---|
| identity | Protect image tags (26791699) | 08:32 | tag target; active; `refs/tags/image/*`, `refs/tags/image/**/*`; creation, update, deletion, non-fast-forward; bypass Repository admin (role 5), always. A first attempt (26791314) was a branch-target ruleset on `refs/heads/image/*` and was replaced | **VERIFIED** (G-10) |
| identity | Protect main (26791541) | 08:29, 08:32 | branch; active; `~DEFAULT_BRANCH`; no bypass; deletion, non-fast-forward, linear history; pull request with 0 approvals, stale approvals dismissed; required check `verify` (GitHub Actions, integration 15368), strict | **VERIFIED** (G-11) |
| control | Protect image tags | 08:55 | as identity | **VERIFIED** (G-10) |
| control | Protect main | 08:55 | as identity; required checks `Format · Lint · Typecheck · Test · Build`, `Build the images` with **any source** (integration id null: GitHub lists only sources seen in the last 7 days and control's CI last ran 30 Oct); strict | **VERIFIED** (G-11), source pinning can be added after the next control CI run |
| work | Protect image tags | 08:55 | as identity | **VERIFIED** (G-10) |
| work | Protect main | 08:55 | as identity without linear history (Work merges with merge commits); required checks `Standards · Architecture · Localization`, `Lint · Typecheck · Test · Build`, `Mobile`, `Product isolation` (integration 15368); strict | **VERIFIED** (G-11) |

With 0 approvals these rules enforce pull requests, CI and history, not independent review. Only a repository admin can create `image/*` tags, so the tag that starts a publish is the owner's.

### 12.3 Environment, variable and secret (owner-confirmed, not readable by Claude)

At 09:05 UTC the owner confirmed in the thread that `image-release`, `AWS_IMAGE_PUBLISHER_ROLE_ARN` and `PLATFORM_PACKAGES_TOKEN` are set "as requested" in identity, control and work, that is, as specified in the checklist (`../2026-11-08-development-access-and-testing-readiness/01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md` G-1 to G-8). Recorded as **owner-confirmed**, not as VERIFIED by Claude: no screenshot or API read backs it.

- **G-9 token expiry:** the owner reported that `PLATFORM_PACKAGES_TOKEN` has **no expiry** (08:42 UTC). It cannot expire mid-release; the residual risk is a long-lived credential with `read:packages` that stays valid until revoked. Recorded as accepted for non-production Testing.
- **Self-review (OD-1):** the checklist specification leaves "Prevent self-review" unticked with the owner as reviewer, so the owner both pushes the tag and approves the publish. The owner's "as requested" is recorded as accepting this for non-production Testing only.
- **Proof at first use:** the first publish run proves G-1, G-2, G-5 and G-7 (it waits for the reviewer, runs only on the tag, assumes the role named by the variable) and G-8 (install step).

### 12.4 Updated status

| Item | Before | Now |
|---|---|---|
| G-10, G-11 (rulesets) | NOT VERIFIED | **VERIFIED** for identity, control, work |
| G-1 to G-8 | NOT VERIFIED | **Owner-confirmed** (not readable by Claude) |
| G-9 | NOT VERIFIED | Owner reported: no expiry (risk accepted for Testing) |
| OD-1 self-review | Open | Recorded as accepted for Testing (owner, 09:05) |
| Identity publication | BLOCKED | **Waiting only on the release approval (OD-2) and OD-3** (first publish run is also the first build) |
| Control publication | BLOCKED | Same |
| Work publication | BLOCKED | Same, plus C-1 build risk; deployment still BLOCKED (§4) |

## 13. Update: Identity images published at `5277d71` (09:19 to 09:36 UTC)

The owner chose "You push the tag, I verify" for Identity at `5277d7190b3dda496443c4bd7d80c78bd4d9174e`. The owner pushed `image/5277d7190b3dda496443c4bd7d80c78bd4d9174e` and approved `image-release`. Claude only read the run, CloudTrail and ECR.

### 13.1 First attempt failed at role assumption (nothing pushed)

Run [42466697538](https://github.com/munaxa/munaxa-identity/actions/runs/42466697538) attempt 1: "Resolve the source commit" passed (commit on `main`). Both image jobs then failed at "Assume the image publisher role" with `Not authorized to perform sts:AssumeRoleWithWebIdentity`. The workflow stopped on the error, as the stop-on-AccessDenied rule requires, and nothing was retried by Claude.

Root cause, from 24 CloudTrail `AssumeRoleWithWebIdentity` events in eu-central-1 (09:20:09 to 09:21:30 UTC, all `AccessDenied`, run id 42466697538 attempt 1 in the user agent) [V-aws]:

- Token claims matched the trust exactly: audience `sts.amazonaws.com`, subject `repo:munaxa@311481412/munaxa-identity@1354378376:environment:image-release`.
- The requested role was `arn:aws:iam::229251310592:role/munaxa-identity-image-publisher`. The role lives at `role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`. No role exists at the requested ARN, so STS refused.
- So `AWS_IMAGE_PUBLISHER_ROLE_ARN` in the `image-release` environment had been entered without the IAM path. The checklist and §3 A-5 give the full ARN; the value was typed short.
- Refuted alternative: session tags. configure-aws-credentials at `e1253824` deletes `Tags` and `TransitiveTagKeys` before `AssumeRoleWithWebIdentity` (`src/assumeRole.ts` lines 9 to 11), so a missing `sts:TagSession` was not the cause.

Fix: the owner corrected the variable. No code, IAM or trust change. The owner then re-ran the failed jobs (attempt 2 reads variables afresh; the same tag and commit).

### 13.2 Second attempt succeeded

| Job | Attempt 2 | Steps |
|---|---|---|
| `munaxa-identity/api` (128690908234) | success, 09:33:49 to 09:35:04 UTC | assume role, ECR sign-in, build and push, non-root and no-credential check all passed |
| `munaxa-identity/migrate` (128690908425) | success, 09:33:50 to 09:35:36 UTC | same |

### 13.3 Images in ECR (read back 09:37 UTC) [V-aws, V-gh]

| Repository | Tags | Digest | Pushed (UTC) | Size |
|---|---|---|---|---|
| `munaxa-identity/api` | `sha-5277d7190b3dda496443c4bd7d80c78bd4d9174e`, `5277d71` | `sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156` | 09:34:45 | 141.5 MB |
| `munaxa-identity/migrate` | `sha-5277d7190b3dda496443c4bd7d80c78bd4d9174e`, `5277d71` | `sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820` | 09:35:02 | 285.2 MB |

Each digest equals the digest the job pulled back in its verification step. Both repositories remain `IMMUTABLE`, one image each, OCI manifests.

### 13.4 Status

- Identity image publication: **VERIFIED** (A-1 to A-6 met in practice; G-1, G-2, G-5, G-7, G-8 proven by this run).
- Control and Work: not published. Their `AWS_IMAGE_PUBLISHER_ROLE_ARN` must carry the full path `role/munaxa-shared/bootstrap/munaxa-<product>-image-publisher`; the owner was asked to check both.
- Deployment: still NOT READY (§4, §9). Nothing deployed, no Terraform applied, no AWS resource changed by Claude.

## 14. Update: Control images published at `a24c568` (09:55 to 09:59 UTC)

The owner checked the Control `AWS_IMAGE_PUBLISHER_ROLE_ARN` (full path), pushed `image/a24c5681f0ca98f446098444c79bc36cd4d9bc0c` and approved `image-release`. Claude only read the run and ECR.

Run [42469234635](https://github.com/munaxa/munaxa-control/actions/runs/42469234635), attempt 1, all four jobs succeeded first time: "Resolve the source commit" (commit on `main`), then `api`, `migrate` and `portal` (assume role, ECR sign-in, build and push, record digest). The logs show `github_ref_protected: true` and `github_workflow_sha` = the release commit [V-gh].

| Repository | Tags | Digest | Pushed (UTC) | Size |
|---|---|---|---|---|
| `munaxa-control/api` | `sha-a24c5681f0ca98f446098444c79bc36cd4d9bc0c`, `a24c568` | `sha256:d6bf8c3c9bdd9b2d6bf67e16412f9a1bfdda19fdf67ff47cee627c63c41b7ce1` | 09:57:56 | 169.7 MB |
| `munaxa-control/migrate` | same | `sha256:203079c9ecda08a16803a9fc9785f51aa5930706dd1c119a7edc3aceb2822c18` | 09:58:34 | 417.8 MB |
| `munaxa-control/portal` | same | `sha256:5a76933c875444c7f6a4067c6219eef4c25698b4e6e924a9b2a5fd69e89c63b1` | 09:57:36 | 104.0 MB |

Each ECR digest (read back 10:00 UTC) equals the `containerimage.digest` in its job log [V-aws, V-gh]. All three repositories remain `IMMUTABLE`, one OCI image each.

Difference from Identity: Control's `publish-images.yml` has no post-push "non-root and no credential" verification step, so that property is **NOT VERIFIED** for Control images by this run (it was not claimed in §3).

Status: Control image publication **VERIFIED**. Work not published. Deployment still NOT READY; nothing deployed, no Terraform applied, no AWS resource changed by Claude.

## 15. Update: Work images published at `b490b25` (10:02 to 10:08 UTC)

The owner checked the Work `AWS_IMAGE_PUBLISHER_ROLE_ARN`, pushed `image/b490b25792c4d35e5b489790508b2ae6489080cc` and approved `image-release`. Claude only read the run and ECR.

Run [42469713757](https://github.com/munaxa/munaxa-work/actions/runs/42469713757), attempt 1, all four jobs succeeded first time: "Resolve the source commit" (commit on `main`), then `api`, `admin` and `migrate` (assume role, ECR sign-in, build and push, non-root and no-credential verification) [V-gh]. The build installed `@munaxa/*` packages with `PLATFORM_PACKAGES_TOKEN`, so the C-1 build risk did not happen.

| Repository | Tags | Digest | Pushed (UTC) | Size |
|---|---|---|---|---|
| `munaxa-work/api` | `sha-b490b25792c4d35e5b489790508b2ae6489080cc`, `b490b25` | `sha256:39a89a6fa02c556a7c135c6b5fd801ba563c0bc62883ab2f8cd863db929e3d2e` | 10:05:54 | 276.6 MB |
| `munaxa-work/admin` | same | `sha256:c06bb7ef50f21f857ddab1f762f8500110d7c90b03b616347a53f3afdb731fdf` | 10:06:49 | 294.5 MB |
| `munaxa-work/migrate` | same | `sha256:ca8c02d9e67cb703b85da4f91e3042234052529c85e7c9f42e0a4966613350fe` | 10:06:07 | 432.6 MB |

Each ECR digest (read back 10:41 UTC) equals the digest the job pulled back in its verification step [V-aws, V-gh]. All three repositories remain `IMMUTABLE`, one OCI image each.

### 15.1 Image status, all three products

| Product | Commit | Images | Status |
|---|---|---|---|
| Identity | `5277d71` | api, migrate | **VERIFIED** (§13) |
| Control | `a24c568` | api, migrate, portal | **VERIFIED** (§14; non-root check not in its workflow) |
| Work | `b490b25` | api, admin, migrate | **VERIFIED** (§15) |

All 8 ECR repositories now hold exactly one image each. Image publication is complete. Deployment is still NOT READY: the next step is step 3 of §9 (Identity prerequisites: owner key pair and secret values), then Config A1 under its own plan approval. Nothing deployed, no Terraform applied, no AWS resource changed by Claude.
