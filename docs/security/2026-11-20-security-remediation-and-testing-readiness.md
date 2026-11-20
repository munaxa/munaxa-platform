# Security remediation and Testing readiness, 20 to 21 Nov 2026

Owner request: 20 Nov 2026, 22:51 UTC ("Munaxa: Execute Security Remediation, PR Readiness and
Testing Preparation"). This report follows
[`2026-11-20-cross-repository-vulnerability-remediation.md`](2026-11-20-cross-repository-vulnerability-remediation.md)
(platform#147) and revalidates it against GitHub as it stood at 23:00 to 23:59 UTC on 20 Nov.

> **Integration (23:03 to 23:25 UTC).** The owner then authorized the merges. The PRs in section 2 were
> squash-merged on the heads in section 7: identity `7615589`, control `7b607e0`, work `a93c642`,
> school `0011680`, docs `f1fca8f`, platform#146 `9e3721e`. See
> [`2026-11-20-autonomous-pr-integration-report.md`](2026-11-20-autonomous-pr-integration-report.md).
> O-1 below is done for those PRs.

**Boundaries held.**

- Nothing was published, dispatched, deployed, applied or migrated. Merges came later, under the
  owner's 23:03 authorization (note above). Nothing was closed.
- There were no AWS writes and no Terraform plan against live state, and no secret was read or
  created.
- Stage E and C-1/C-2 were not run.
- One read-only AWS check was attempted. It was refused, because the AWS connector needs a new
  sign-in (section 11).
- The only CI runs were triggered by pushes to existing PR branches, plus one re-run of failed Docs
  jobs.

**Status labels.** FIXED AND VERIFIED · CODE FIXED — BUILD PENDING · BUILD VERIFIED — REGISTRY SCAN
PENDING · REGISTRY VERIFIED · BLOCKED BY OWNER ACTION · BLOCKED BY TECHNICAL ISSUE · ACCEPTED TEMPORARY
RISK · NOT FIXED · NOT AUTHORIZED.

**What the labels can mean today.** No image was published, so no product image can be REGISTRY
VERIFIED. FIXED AND VERIFIED is used only for repository controls whose evidence is complete: tests,
`pnpm audit`, and Terraform tests.

---

## 1. Executive summary

| Area | Status | Evidence |
| --- | --- | --- |
| Control, Work, School, Identity images | **BUILD VERIFIED — REGISTRY SCAN PENDING** | CI builds every target, `verify-image.sh` passes, and Grype `--fail-on high` finds 0 HIGH/CRITICAL (section 7) |
| Docs api, web, migrate, antivirus | **BUILD VERIFIED — REGISTRY SCAN PENDING** | same, on docs#180 |
| **Docs worker** (CRITICAL glibc CVE-2026-5450 plus HIGH findings on Debian) | **BUILD VERIFIED** (never published) | moved to the same scratch Alpine runtime as the API. CI now builds, starts (read-only, no capabilities), checks and scans it |
| Docs CI Docker Hub `429` | **FIXED AND VERIFIED** (no 429 in two full runs) | The secrets **were already set**: jobs logged "authenticated" and still got 429. Pulls now go through mirror.gcr.io in the Docker daemon and in BuildKit, with Docker Hub as the fallback |
| Next.js 15.5.28 (MEDIUM) | **BUILD VERIFIED — REGISTRY SCAN PENDING** | 15.5.29 (published 3 Nov) in Docs, Control, Work, School |
| School GHCR publish (`deploy.yml`) pushed **without** verify or scan | **CODE FIXED** | It now builds and loads, verifies, scans, keeps the reports, and only then pushes |
| effect GHSA-7589-6fvf-x4pw | **FIXED AND VERIFIED** | `pnpm audit --audit-level high` passes in five repos (CI) |
| Withdrawn digests (10) | **FIXED AND VERIFIED** (code) | 87/87 offline Terraform tests; per-digest tests; count guard; no pin references a withdrawn digest |
| RDS master secret rotation | **BLOCKED BY OWNER ACTION** (AWS connector sign-in) | rotation due 23:59:59 UTC 20 Nov; no evidence yet |
| Identity Stage E | **NOT AUTHORIZED**; blocked on P-1 (rotation) and on owner decision D-I1 (republish first) | section 12 |
| Testing deployment | **NOT AUTHORIZED** | section 13 |

**Remaining CRITICAL/HIGH in any candidate image: none** (section 7).

Remaining CRITICAL/HIGH in published images:
- **10 withdrawn digests.** Terraform refuses them.
- **The current Identity Testing pin `9a8c6ebd` / `5f3bdcce`.** It very likely has 4 OpenSSL HIGH
  findings plus npm tooling. Grype was not run on that digest, because pulling it needs ECR access
  (decision D-I1).

## 2. Current repository and PR status (live, 20 Nov 23:00 UTC)

**main heads:**

| Repository | main |
| --- | --- |
| platform | `0f06836` |
| identity | `2db6ed9` |
| control | `1f58c90` |
| work | `eabcc47` |
| school | `4c2b4a4` |
| docs | `9d06698` |

None moved during this task.

**Repository rules.** Every repository has a ruleset on main: PR required, 0 approvals, plus required
checks. **School has no ruleset on main** (`rules/branches/main` is empty). That is an owner setting
(O-8).

The table lists PRs in merge order. "Head" is the commit after this task's pushes. The PR states
were taken at 23:00 UTC: all 7 PRs were open, mergeable and clean (Docs blocked only by its failed
required checks), with 0 review comments and no unresolved threads.

| # | PR | Head before → after | Required checks | State |
| --- | --- | --- | --- | --- |
| 1 | [identity#21](https://github.com/munaxa/munaxa-identity/pull/21) | `b2bb8f7` → `c29ccaa` | `verify` | see section 7 |
| 2 | [control#11](https://github.com/munaxa/munaxa-control/pull/11) | `d5c5fe3` → `d491fc3` | Format · Lint · Typecheck · Test · Build; Build the images | see section 7 |
| 3 | [work#33](https://github.com/munaxa/munaxa-work/pull/33) | `62b72c5` → `a35cc5c` | Standards; Lint · Typecheck · Test · Build; Mobile; Product isolation | see section 7 |
| 4 | [school#26](https://github.com/munaxa/munaxa-school/pull/26) | `f6844bf` → `cc48717` | none (no ruleset) | see section 7 |
| 5 | [docs#180](https://github.com/munaxa/munaxa-docs/pull/180) (draft) | `9921b90` → `6dad33f` | Container images; Lint/Test/Build; Product isolation; Integration; 3 end-to-end suites | see section 7 |
| 6 | [platform#146](https://github.com/munaxa/munaxa-platform/pull/146) | `f8b3b25` (unchanged) | Lint/Test/Build; Accessibility; Façades | green (4 success, 2 skipped) |
| 7 | [platform#147](https://github.com/munaxa/munaxa-platform/pull/147) | `48d5e2b` → `359058c` (erratum: O-6, O-7) | same | green on `48d5e2b`; docs-only change |
| 8 | this report's PR | stacked on #147 | same | — |

**Superseded, ready to close (owner):**
- [control#10](https://github.com/munaxa/munaxa-control/pull/10) (`6ca2287`). Both of its commits are
  in control#11.
- [docs#179](https://github.com/munaxa/munaxa-docs/pull/179) (`9cfba30`). All of its commits are in
  docs#180.

**Unrelated changes.** Each PR's diff against main was read. All changes are image, CI or dependency
security changes, plus `scripts/migrate.mjs` in Control (needed so the migrate image works without
pnpm).

## 3. Exact commits and changed files in this task

| Repository | Commit | Change | Files |
| --- | --- | --- | --- |
| docs | `0d21bd9` | the worker on the Alpine runtime too; no Debian image left | `Dockerfile`, `prisma/schema.prisma`, `docs/operations/deployment.md` |
| docs | `0ee22cf` | pull Docker Hub images through mirror.gcr.io; start, check and scan the worker image | `.github/actions/registry-mirror/action.yml` (new), `.github/actions/docker-hub-auth/service-container.sh`, `.github/workflows/ci.yml`, `.github/workflows/publish-images.yml` |
| docs | `6dad33f` | next 15.5.29 | `apps/web/package.json`, `pnpm-lock.yaml` |
| control | `d491fc3` | next 15.5.29 | `apps/portal/package.json`, `pnpm-lock.yaml` |
| work | `4ddeb82` | next 15.5.29 | `apps/{admin,employee-portal,manager-portal}/package.json`, `pnpm-lock.yaml` |
| work | `a35cc5c` | keep the GHCR publish's SBOMs and scan reports | `.github/workflows/publish-images.yml` |
| school | `c0c305c` | next 15.5.29 | `apps/admin/package.json`, `munaxademo/package.json`, `pnpm-lock.yaml` |
| school | `cc48717` | GHCR publish in `deploy.yml` verifies and scans before pushing | `.github/workflows/deploy.yml` |
| identity | `c29ccaa` | keep the GHCR publish's SBOMs and scan reports | `.github/workflows/publish-images.yml` |
| platform | `359058c` (#147) | erratum: O-6 superseded, O-7 wrong | `docs/security/2026-11-20-cross-repository-vulnerability-remediation.md` |

**How the lockfiles were changed.** GitHub Packages (`@munaxa/*`) is not reachable from this
session, so `pnpm install` cannot resolve the workspace here. The Next.js change was therefore made in
each lockfile directly:

- `next`, `@next/env` and the eight `@next/swc-*` entries moved from 15.5.28 to 15.5.29.
- Each integrity hash was taken from the npm registry: 10 per repository.
- Both versions declare identical dependencies, apart from the `@next/*` family version (compared from
  the registry).

CI's `pnpm install --frozen-lockfile` is the check that the edit is consistent.

## 4. Vulnerabilities fixed, and evidence

| Finding | Products | Status | Evidence |
| --- | --- | --- | --- |
| CVE-2026-4738 zlib (CRITICAL) | Work, School (latent), all | BUILD VERIFIED — REGISTRY SCAN PENDING | exact `zlib=1.4-r0` and the mapped `libz.so.1.4` (`verify-image.sh`); Grype clean |
| OpenSSL 3.5.9-r0, 4 HIGH (CVE-2026-88823, -95691, -95692, -107496) | all Alpine images | BUILD VERIFIED — REGISTRY SCAN PENDING | exact `libssl3`/`libcrypto3=3.5.9-r1`; Grype clean |
| npm, pnpm and corepack bundled HIGH findings | all Node images | BUILD VERIFIED — REGISTRY SCAN PENDING | tooling deleted; `verify-image.sh` refuses it; Grype clean |
| Debian glibc, gcc-12 and OpenSSL 3.0.22 (1 CRITICAL, 11 HIGH) | Docs api, web, migrate | BUILD VERIFIED — REGISTRY SCAN PENDING | Alpine scratch runtime; Grype clean (run 44826840472) |
| the same Debian findings | **Docs worker** | see section 5 | moved to the same runtime |
| Control Debian 7 HIGH | Control | BUILD VERIFIED — REGISTRY SCAN PENDING | Alpine; Grype clean |
| GHSA-7589-6fvf-x4pw (effect) | five repos | FIXED AND VERIFIED | `pnpm audit --audit-level high` in CI |
| Next.js 15.5.28 (MEDIUM) | Docs, Control, Work, School | BUILD VERIFIED — REGISTRY SCAN PENDING | 15.5.29; frozen install, builds and tests green |
| GHCR push without a gate | School `deploy.yml` | CODE FIXED (only runs on dispatch) | workflow now verifies and scans before `docker push` |

## 5. Docs worker: investigation and outcome

### What the worker is today

- **Code** (`apps/worker/src`, 145 lines): a NestJS standalone context with an empty `WorkerModule`.
  It logs its start line and composes no consumer. `main.ts` says every consumer (outbox, timers,
  preview, OCR, search, audit export) runs in the API process.
- **Dependencies:** `@nestjs/common`, `@nestjs/core`, `bullmq`, `ioredis`, `reflect-metadata`, `rxjs`,
  and two workspace packages. All are pure JavaScript, with no native module and no Prisma client.
- **LibreOffice and Tesseract:** called only by `apps/api/.../libreoffice.converter.ts` and
  `tesseract-ocr.adapter.ts`, in the API. The API image has neither, and refuses at boot if configured
  for them (`OFFICE_DRIVER`, `OCR_DRIVER`, default `NONE`).
- **Publishing and deployment:** no workflow publishes the worker, and munaxa-platform has no worker
  resource.

### Why it was Debian

Only so that the `WITH_LIBREOFFICE` and `WITH_TESSERACT` build arguments could `apt-get install`
those packages. Those arguments installed binaries into an image where nothing calls them.

### What changed

- **`0d21bd9`: one runtime for every image.**
  - The worker is now `FROM runtime`: scratch, musl, no shell, no busybox, no apk, uid 1000, with
    dumb-init as PID 1.
  - It holds the worker's build output from the same Alpine `build` stage as the API.
  - `build-debian` and `runtime-debian` are deleted, along with `NODE_DEBIAN_IMAGE` and the two build
    arguments.
  - Prisma `binaryTargets` drops `debian-openssl-3.0.x`. `native` still covers CI's Ubuntu runners and
    developers' machines.
  - `docs/operations/deployment.md` now says that no image carries LibreOffice or Tesseract, and that
    an engine image is a separate target which must pass the same gate.
- **`0ee22cf`: the worker is checked and scanned in CI.**
  - **Build:** CI builds and loads it.
  - **Image contents:** the musl loader is present. There is no glibc (`ld-linux`, `libc.so.6`,
    `x86_64-linux-gnu`), no shell or package manager, no LibreOffice or Tesseract, no `.npmrc`, and
    the image user is `node`.
  - **Runtime:** it runs with `--read-only --cap-drop ALL --security-opt no-new-privileges` and must
    log `Worker started.`.
  - **Scan:** it joins the Grype `--fail-on high` loop, with its SBOM kept as an artifact.

### What is not done, and why that is right

There is no LibreOffice or Tesseract image. Building one now would add about 700 MB of packages,
which the scanner must then pass, for code paths that are disabled by default and live in a different
process. When a deployment needs office conversion or OCR, it needs:

- an engine target on the same pinned Alpine base (Alpine 3.24 ships `libreoffice` and
  `tesseract-ocr` in community);
- that target scanned under the same gate;
- the API or a consumer worker composed to call it.

That is a design decision, not a security fix. Until then the API refuses the configuration rather
than degrading silently.

**Status:** BUILD VERIFIED on `6dad33f` (section 7). The worker stays unpublished.

## 6. CI reliability improvements (Docs)

**Root cause.** The 429s on 20 Nov came from `registry-1.docker.io` while the job was logged in. The
log line from job 136612489921 reads "Docker Hub pulls: authenticated (repository secrets
DOCKERHUB_USERNAME and DOCKERHUB_TOKEN)". A logged-in account still has a pull limit, and one Docs CI
run pulls node, ubuntu, postgres, redis, moby/buildkit, syft and grype across eight parallel jobs.
**No owner action is needed.** The earlier report's O-7 was wrong and has been corrected in #147.

**Changes (`0ee22cf`):**

- **New action `.github/actions/registry-mirror`.** It adds `registry-mirrors: ["https://mirror.gcr.io"]`
  to the runner's Docker daemon, restarts it, and fails if the mirror did not take. It also writes a
  `buildkitd.toml` with the same mirror.
- **Where it runs:**
  - before the Docker Hub login in all five pulling CI jobs (integration, end-to-end, images,
    migration image, release smoke);
  - in the release workflow's application, antivirus and release-smoke jobs.
- **BuildKit.** Every `docker/setup-buildx-action` gets
  `buildkitd-config: ${{ steps.hub-mirror.outputs.buildkitd-config }}`, so `FROM` resolution uses the
  mirror too.
- **Fallback.** The daemon tries the mirror first and Docker Hub second, and the existing login still
  covers the fallback.
- **Error message.** `service-container.sh`'s message now says that both the mirror and Docker Hub
  refused, rather than asking for secrets that already exist.

**Integrity.** Every base image is pinned by digest, and a digest names its content, so the mirror
cannot change what is built. postgres and redis are CI-only and by tag, as before. Only `docker.io`
is mirrored; ECR and GHCR are untouched. No credential is involved.

**Coverage tested from this session.** mirror.gcr.io serves the node `1314fb30` and `e9f565d3`
digests, ubuntu `73b99939`, the grype and syft digests, `postgres:16-alpine`, `redis:7-alpine` and
`moby/buildkit:buildx-stable-1`. Results were 200, or 302 to blob storage.

**Not applied to Control, Work, School or Identity.** Their CI did not hit 429 on 20 Nov. The same
action can be copied if they do (recommended follow-up, section 16).

## 7. CI results and run IDs

**Before this task** (the 20 Nov evidence in #147):

| Repository | Run | Head | Result |
| --- | --- | --- | --- |
| Identity | 44826285883 | `b2bb8f7` | all success; runtime and migrate 0 HIGH/CRITICAL |
| Control | 44826265540 | `d5c5fe3` | success; api, migrate, portal clean |
| Work | 44826272828 | `62b72c5` | success; api, migrate, admin clean |
| School | 44826278948 | `f6844bf` | success; api, migrate, admin clean |
| Docs | 44826840472 | `3642e1f` | all success; api, web, migrate, antivirus clean |
| Docs | 44829172801 / 44829173095 (+ 1 re-run) | `9921b90` | 8 image-pulling jobs failed on Docker Hub 429; all others success |

**After this task:**

| Repository | Head | Run(s) | Result |
| --- | --- | --- | --- |
| Identity | `c29ccaa` | 44833377176 | all success; runtime and migrate verified, Grype 0 HIGH/CRITICAL |
| Control | `d491fc3` | 44832974072 | all success (incl. Next.js 15.5.29 frozen install, portal build); api, migrate, portal verified, 0 HIGH/CRITICAL |
| Work | `a35cc5c` | 44833371774 | all success; api, migrate, admin verified, 0 HIGH/CRITICAL |
| School | `cc48717` | 44833366558 | all success; api, migrate, admin verified, 0 HIGH/CRITICAL |
| Docs | `6dad33f` | 44832946855 (push), 44832951843 (pull_request, 1 re-run) | every job success in both runs: lint/typecheck/test/build, integration, six end-to-end suites, migration image, release smoke, container images. **The worker check passed** ("OK - worker: musl, no glibc, no shell, no package manager, user node, boots read-only with no capabilities") and api, web, worker and antivirus scanned with 0 HIGH/CRITICAL. **No Docker Hub 429 in either run.** One job in the pull_request run first failed with a browser `Page.captureScreenshot` protocol error in one visual test. The same job passed in the push run on the same commit, and passed on its single re-run |
| Platform #147 | `359058c` | 44833459517 (1 re-run) | a timing assertion in `packages/platform/rbac` (`8927 < 7500` µs) failed on a docs-only commit and passed on re-run |

## 8. Image build and scan results

Every product image is checked by `verify-image.sh` in CI (Docs: the equivalent inline checks in
`ci.yml` and `scripts/migration-image/verify.sh`) and scanned by Grype in CI. Grype is v0.121.2,
pinned by digest, with Syft v1.57.0 SBOMs.

**Verified directly from the implementation:**

| Control | Control | Work | School | Identity | Docs |
| --- | --- | --- | --- | --- | --- |
| Base pinned by digest | yes | yes (`check-pinned.sh`) | yes (`check-pinned.sh`) | yes | yes (antivirus too) |
| Exact OS package versions enforced | zlib, openssl, libssl3, libcrypto3 | zlib, libssl3, libcrypto3 | same | same | same, in the `apk --root` runtime |
| zlib ≥ 1.4-r0, OpenSSL ≥ 3.5.9-r1 at run time | `verify-image.sh` | same | same | same | build-time `apk list -I` check, plus scan |
| Node tooling removed | yes | yes | yes | yes | not present (scratch runtime) |
| Non-root | `node`, uid checked | same | same | same | uid 1000, checked |
| Prisma musl engine loads | api, migrate (`dlopen`) | api, migrate | api, migrate | runtime, migrate | engine-family check plus release smoke |
| No credential, `.npmrc` or proxy CA | `verify-image.sh` | same | same | same | I-5 and history checks |
| Build and runtime separated | multi-stage | multi-stage | multi-stage | multi-stage | scratch runtime |
| Scan before every push | ECR | ECR and GHCR | ECR and **GHCR (new)** | ECR and GHCR | ECR (api, web, migrate, antivirus) |
| Pushed digest pulled back and verified | yes | ECR yes; GHCR checks only before push | ECR yes | ECR yes; GHCR has its own post-push checks | yes |
| Grype exceptions | none (no `.grype.yaml`) | none | none | none | `ignore: []` |
| SBOM and scan reports kept | CI 90 days, release 400 | same; GHCR **(new)** | same; GHCR **(new)** | same; GHCR **(new)** | CI and release |

**Remaining MEDIUM and LOW findings** (below the gate):

- busybox CVE-2025-60876: no fix, and not present in the Docs runtime;
- glob, minimatch and uuid in development or transitive trees;
- OpenTelemetry packages (School).

Next.js is handled (section 4). The rest have no fixed version compatible with the current major,
or sit only in build stages. They are not worth churning ahead of the release.

## 9. Registry scan status

**Not REGISTRY VERIFIED for any new image**, because no image was published. Each publish workflow
runs Grype before `docker push`, and ECR scans on push. A digest counts as REGISTRY VERIFIED only when
both are clean for that exact digest. The publication checklist is in section 13.

## 10. Withdrawn digest protection

Checked on platform#146 at `f8b3b25`, offline (Terraform 1.16.5, aws provider 6.67.0,
`-backend=false`):

- **`terraform test`: 87 passed, 0 failed.** `terraform validate`: valid. `fmt -check`: clean.
- **All 10 digests are in `locals.withdrawn_image_digests`.** `var.images` validation matches the
  trailing `sha256:<64 hex>` of any value, so a withdrawn digest is refused whatever repository path
  names it. One test uses a withdrawn digest under another repository's path.
- **Each digest has its own refusal run.** Work api `39a89a6f` appears twice: its own run plus the
  cross-repository run.
- **Count guard:** `length(local.withdrawn_image_digests) == 10`. A removed or added entry fails the
  test until the count and a refusal run are updated. Earlier mutation check: removing `c06bb7ef`
  fails its run.
- **No `.tfvars`, `.json` or `.tf` under `infra/` (outside the list and its tests) references a
  withdrawn digest.** The Testing pins are the Identity `2db6ed9` digests. The prod `images` map is
  empty.

**Status: FIXED AND VERIFIED (code).** It takes effect when #146 merges.

## 11. RDS rotation verification status

- **Status: BLOCKED BY OWNER ACTION.** The AWS connector needs a new sign-in. The read-only call at
  about 23:10 UTC was refused before reaching AWS.
- **Timing.** The rotation is due at 23:59:59 UTC on 20 Nov, so it could not be verified at the time
  of writing anyway.
- **Known evidence** (report #146 file 03 and the 09:20 UTC metadata check):
  - hourly `RotationFailed` while the database was stopped;
  - database auto-start at 21:07 UTC;
  - `AWSPENDING 5f35b6a0`, `AWSCURRENT b04015a3`.
- **Owner of the checks.** The thread "Verify RDS secret rotation and cleanup" owns the post-rotation
  checks V-1 to V-6 and is waiting on the same sign-in. Those checks are: RotationSucceeded in
  CloudTrail; AWSCURRENT moved to the new version and AWSPREVIOUS to `b04015a3`; no AWSPENDING; no
  failure after success; NextRotationDate advanced by 7 days.
- **Nothing was assumed.** No GetSecretValue, rotation, label change or RDS action was taken or is
  proposed.

## 12. Identity Stage E readiness

| # | Check | Status now |
| --- | --- | --- |
| P-1 | RDS rotation verified | **PENDING** (section 11) |
| P-2, P-3 | ECS idle, no session edge | last verified 18:3x UTC 20 Nov; recheck on the day |
| P-4 | cleanup R succeeded | recheck after 20 Nov 21:05 run (connector) |
| P-5 | E-1 guard discover | manifest and guard consistent on main (`stage-e-manifest.tftest.hcl` passes within the 87) |
| P-6 | H-20 gate | enforced by `aws-session.yml` |
| P-7 | budget | 3.98 / 50 at last check |
| P-8 | no pending change to a Stage E family | holds: no merged config PR since `0f06836`. **C-2 must still wait for Stage E** |
| P-9 | no late scheduled `down` in the window | window 13:00 to 18:30 Amman, after the morning run has finished |
| P-10 | operator secret and stack absent | secret absent at last check; recheck on the day |

**Candidate image.** identity#21 `c29ccaa`. Its CI builds and verifies runtime and migrate, and Grype
finds 0 HIGH/CRITICAL (section 7).

**Decision D-I1: republish Identity before Stage E?**

- **Recommended: yes.** The current pin very likely carries 4 OpenSSL HIGH findings and npm tooling.
- A yes adds steps before Stage E: merge #21, publish, then a pin PR, then a nonprod plan and apply.
  The apply creates new task-definition revisions for `identity`, `identity-migrate`,
  `identity-bootstrap` and `identity-probe`. The manifest is revision-free, so only the image digests
  change.
- **A no** means Stage E runs on `9a8c6ebd` as an ACCEPTED TEMPORARY RISK, for Testing only, with the
  owner named and expiring at the first republish.

**Exact pin changes after a republish.** Replace the old digest with the new one in each of these:

| File | Lines (main) | Old digest |
| --- | --- | --- |
| `infra/aws/stack/envs/nonprod.tfvars` | 64 `identity_api`, 65 `identity_migrate` | `9a8c6ebd…3c3b`, `5f3bdcce…b874` |
| `infra/aws/stack/envs/nonprod.stage-e-tasks.json` | api at 153, 239, 287, 386; migrate at 100 | same |
| `scripts/aws/connector/e1-task-guard.py` (test fixtures) | api at 254, 349, 404, 509; migrate at 197 | same |

Then:

1. Run `terraform test` (stack, including `stage-e-manifest.tftest.hcl`) and the E-1 guard's tests.
2. Add the old pair to `withdrawn-images.tf`, with two refusal runs and the count raised to 12.

## 13. Testing deployment sequence, and the publication checklist

**Sequence.** This is the Docs-first order from #145 and #146. It is unchanged except for D-I1.
Nothing is authorized.

1. **Identity:**
   - P-1 rotation verified;
   - D-I1, and if yes the republish, pin PR, plan and apply;
   - P-1 to P-10 on the day;
   - Stage E (A-1). **Stage E precedes C-2.**
2. **Control:**
   - merge #11, then publish (A-5C) to a clean ECR scan;
   - A-4C bundles;
   - A-7 (Cloudflare Access, C-1);
   - C-2 only after Stage E (A-8).
3. **Docs:**
   - merge #180, then A-3 bootstrap plan and apply;
   - A-4 bundles;
   - A-5 release to a clean ECR scan;
   - licensing A-9 and A-10.
   - D-G1 is no longer needed: there is no glibc exception.
4. **Work and School:** after their own publication and their tenant and deployment prerequisites
   (Work: the Identity #15 tenant re-binding). No Work or School resource exists in Testing.

**Publication checklist, per product.** Run each only after the owner's yes.

| Product | Source commit | Targets → ECR repositories | Workflow and trigger | Needs (names only) | Scan gates | Pin to update after |
| --- | --- | --- | --- | --- | --- | --- |
| Identity | merge commit of identity#21 on main | runtime → `munaxa-identity/api`, migrate → `munaxa-identity/migrate` | `publish-images-ecr.yml`, tag `image/<40-hex sha>` on a main commit | environment `image-release` (reviewer), var `AWS_IMAGE_PUBLISHER_ROLE_ARN`, secret `PLATFORM_PACKAGES_TOKEN`, OIDC | `verify-image.sh` and Grype before push; verify after pull-back; ECR scan on push | `images.identity_*` (nonprod.tfvars), Stage E manifest, E-1 fixtures (section 12) |
| Control | merge commit of control#11 | api, migrate, portal → `munaxa-control/{api,migrate,portal}` | `publish-images.yml`, tag `image/<sha>` | same (plus `GITHUB_TOKEN`) | same | `images.control_*` (C-1/C-2 config PR) |
| Work | merge commit of work#33 | api, migrate, admin → `munaxa-work/{api,migrate,admin}` | `publish-images-ecr.yml`, tag `image/<sha>` | same | same | `images.work_*` |
| School | merge commit of school#26 | api, migrate, admin → `munaxa-school/{api,migrate,admin}` | `publish-images-ecr.yml`, **workflow_dispatch** on main | same | same | `images.school_*` |
| Docs | merge commit of docs#180 | api, web, migrate (+ antivirus, bootstrap) → `munaxa-docs/*` | `publish-images.yml`, tag `image/<sha>` | `image-release`, publisher role, `PLATFORM_PACKAGES_TOKEN` | Grype before push; engine and uid checks; release smoke on the pushed digests; ECR scan | `images.docs_*` |

**Rule for every row.** A digest is released only when Grype in the run and the ECR scan of that exact
digest both show 0 HIGH/CRITICAL. Only then may a reviewed PR pin it.

## 14. Outstanding owner decisions

Each is a yes/no. Nothing below is authorized yet.

| Id | Decision | Recommendation |
| --- | --- | --- |
| O-1 | Merge, in order: identity#21, control#11, work#33, school#26, docs#180 (mark ready first), platform#146, platform#147, this PR. Each only with its required checks green on the head listed in section 7 | yes |
| O-2 | Close control#10 and docs#179 as superseded | yes |
| O-3 | **Reconnect the AWS connector** (claude.ai → Settings → Connectors → AWS MCP), so the rotation checks (P-1) and the Stage E preflight can run read-only | yes |
| D-I1 | Republish Identity from #21 and re-pin before Stage E | yes |
| O-5 | After merge, publish Control, Work, School and Docs images (tag or dispatch, per section 13) | yes, one product at a time |
| O-8 | Add a ruleset on munaxa-school `main` (PR required, required checks: "Lint · Typecheck · Test · Build (JS/TS)", "Images (api, migrate, admin)"), like the other repositories. Repository settings → Rules → Rulesets → New branch ruleset | yes |
| A-1 | Identity Stage E (after P-1 and D-I1) | decide after P-1 |

**Withdrawn or no longer needed:**
- **D-G1:** no glibc exception.
- **O-6:** the worker is fixed rather than isolated.
- **O-7:** the Docker Hub secrets were already set.
- **A-2G.**

## 15. Security risks and accepted exceptions

- **Accepted exceptions: none.** Every `.grype.yaml` is empty or absent, and `scan-image.sh` refuses
  pending, expired or class-wide rules.
- **Current Identity Testing pin.** It very likely carries HIGH findings. It is not deployed (nothing
  runs), and D-I1 decides it.
- **Withdrawn digests.** They remain in ECR (tags are immutable). Terraform refuses them.
- **The CI mirror.** mirror.gcr.io is now a CI dependency. Digest pins keep the build's integrity, and
  Docker Hub stays as the fallback.
- **Lockfile edits by hand (Next.js).** CI's frozen install and the full test suites are the check.
- **School main has no ruleset** (O-8).

## 16. Exact next actions

1. Owner: O-3 (reconnect AWS). Then the rotation thread runs V-1 to V-6, and P-1 is decided.
2. Owner: O-1 and O-2 for the PRs whose section 7 row is green.
3. Owner: D-I1. If yes, publish Identity, then Claude opens the pin PR described in section 12 and
   runs the offline tests.
4. Owner: A-1 Stage E, in the 13:00 to 18:30 Amman window after the morning `down`.
5. Then follow section 13 in order. Each release must be REGISTRY VERIFIED before its digest is
   pinned.
6. Follow-ups, not blocking:
   - copy the registry mirror into the other four repositories' CI if they hit 429;
   - add a weekly rescan of pinned digests;
   - consider ECR enhanced scanning (owner cost decision).
