# 04. Control and Docs security remediation review

## 1. Control: the 7 HIGH findings

**Status: NOT FIXED. NEEDS VERIFICATION after a release (A-5C).** Old Control images (`a24c568`) must not be used for Testing.

### 1.1 Live evidence [V]

ECR basic scan of `munaxa-control/{api,migrate,portal}:a24c568` (scanned 8 Nov 2026), identical on all three:

| CVE | Severity | Package | Version in image |
| --- | --- | --- | --- |
| CVE-2026-109518 | HIGH | apt | 2.6.1 |
| CVE-2026-53613, CVE-2026-53615, CVE-2026-78410 | HIGH | util-linux | 2.38.1-5+deb12u3 |
| CVE-2026-76844, CVE-2026-85091 | HIGH | zlib | 1.2.13.dfsg-1 |
| CVE-2026-84243 | HIGH | glibc | 2.36-9+deb12u14 |
| CVE-2026-13595 | MEDIUM | util-linux | 2.38.1-5+deb12u3 |
| CVE-2026-86805 | MEDIUM | glibc | 2.36-9+deb12u14 |
| CVE-2026-115456, -95818, -97399 | LOW | gcc-12, glibc | |

No Testing configuration references these images: `infra/aws/stack/envs/nonprod.tfvars` on main sets only `identity_api` and `identity_migrate` [V code]. The C-1 PR must pin new digests (ordering rule 4, file 06).

### 1.2 Why control#10 cannot fix them

1. **The new base still ships the vulnerable packages.** The amd64 image of `node:22-bookworm-slim@sha256:e9f565d3…` (manifest `47725aca…`), read from Docker Hub without a Docker daemon (layer digests verified, `/var/lib/dpkg/status` of the top layer): apt **2.6.2**, util-linux **2.38.1-5+deb12u3**, zlib1g **1:1.2.13.dfsg-1**, libc6 **2.36-9+deb12u14** [V]. Only apt moved.
2. **`apt-get upgrade` upgraded nothing.** control#10 CI run 44711137266 (20 Nov 09:32 UTC), image job: the `os` stage and the `portal` stage both logged `0 upgraded, 0 newly installed` for the upgrade step [V log]. Debian had published no fixed package.

So a release of control#10 would clear at most the apt finding: about **6 of 7 HIGH would remain** [E; only an ECR scan decides].

### 1.3 Replacement: control#11

[munaxa-control#11](https://github.com/munaxa/munaxa-control/pull/11) (branch `claude/project-thread-cg20a3`, head `18e4d31`, stacked on control#10's two commits):

- Base = the exact `node:22-alpine@sha256:1314fb30…` Identity ships (identity#20), with `zlib=1.4-r0` pinned and checked. The Identity `2db6ed9` images on that base scan with **no findings** in ECR (13 Nov) [V].
- Alpine has no util-linux and no glibc in the image (musl); zlib is the fixed 1.4-r0. The `portal` stage now builds `FROM os`.
- New `.github/scripts/verify-image.sh`, run in CI for api, migrate and portal, and in `publish-images.yml` on the pushed digest: linux/amd64; not root; Alpine; no glibc or util-linux package; zlib >= 1.4-r0 and the loaded libz belongs to it; packages = base + openssl + ca-certificates; for api and migrate a `linux-musl-openssl-3.0.x` Prisma engine that `dlopen`s.
- Keeps the `effect` override.

What can be verified without a Docker daemon: the base's package versions (done above), the Dockerfile and lockfile (musl variants of `@next/swc`, `sharp` and `@rollup` are present) [V]. What cannot: the build itself (CI does it), and whether the scanner reports anything for the new image (only ECR on push).

CI result: see file 02.

### 1.4 Release and scan steps still needing approval

| Step | Who | Evidence of success |
| --- | --- | --- |
| Merge control#11 (close control#10) | owner yes | merge commit on main |
| A-5C: push tag `image/<sha>` (environment `image-release`) | owner yes | publish run green, including "Verify the pushed image" |
| ECR scan on push | automatic | `DescribeImageScanFindings` for api, migrate, portal: **0 HIGH, 0 CRITICAL**. Only then is SF-1 VERIFIED COMPLETE |
| C-1 config PR pins the three new digests | owner yes on the apply | plan shows the new digests |

## 2. Docs #179

**Status: CI GREEN [V]. Expect 1 HIGH at the next Docs scan.**

- Diff: `ARG NODE_IMAGE=node:22-bookworm-slim@sha256:e9f565d3…` (was a tag only), and the `effect` override `^3.22.1` with lockfile 3.21.0 to 3.22.5 [V].
- CI on head `4c6ec2a`: 24 of 24 checks success, including "Container images · three targets from one commit", "Release smoke · images from this commit" and "Migration image · disposable databases" [V].
- Audit: the override clears GHSA-7589-6fvf-x4pw; `pnpm audit --audit-level high` passes in CI [V].
- Docker build: the api, web and migrate images run on a hand-built Debian rootfs (`runtime-fs`) with **no util-linux and no zlib**, but with `libc6`. The CI image job logged `0 upgraded` for `apt-get upgrade` too [V log], so libc6 stays at 2.36-9+deb12u14.
- The live Docs api and web images (`f8a8bea`, scanned 25 Oct) show glibc 2.36-9+deb12u14 with only MEDIUM 1 and LOW 2 [V]. Control's 8 Nov scan of the same glibc version adds **CVE-2026-84243 (HIGH)**. So a Docs release now is expected to show **1 HIGH (glibc)** at scan [E]. There is no Debian fix to take today.
- Antivirus image (`f8a8bea`): no findings [V].

Owner decision (new, D-G1): accept 1 HIGH glibc finding on Docs api, web and migrate for **Testing only** until Debian publishes a fix (then rebuild), or hold A-5. Recommendation: accept for Testing (no public users; services run only inside sessions), and re-scan before any production use.

## 3. Platform #143: owner secret scripts

**Status: REVIEWED. No blocking defect. 31/31 tests pass [T]. READY FOR OWNER APPROVAL (merge, then A-4 / A-4C).**

| Check | Result |
| --- | --- |
| Tests | `python3 -m pytest scripts/aws/owner/test` on head `eb060e9`: **31 passed** (23 Docs, 8 Control) [T] |
| CI on `eb060e9` | "Format, validate, mocked plan tests" and "Lint · Typecheck · Test · Build" success; plan/apply jobs skipped [V] |
| Values in argv | none: every AWS call is `--cli-input-json file:///dev/stdin` from a sealed memfd [code] |
| Values in environment | none: `env -i` re-exec; the CLI gets a fixed allow-list (container credential variables only) [code] |
| Values in files | none: no temp file holds a value; the CLI home is a fresh `mkdtemp` deleted on exit; core dumps off; `PR_SET_DUMPABLE 0` [code] |
| Values in output | none: `say()` prints names, version ids, the tenant id and fixed words; errors print an AWS error code only; Python tracebacks are replaced by the exception class name [code]; tests assert no generated value in stdout/stderr [T] |
| Concurrency | `flock` on `/tmp/{docs,control}-testing-secrets.lock`, `O_NOFOLLOW`, mode 0600; test for contention [T] |
| Idempotency | one `PutSecretValue` per bundle with a fresh `ClientRequestToken`; read-back of value and labels; stored-then-error resume tested [T] |
| Live preconditions [V] | all five bundles (`docs-api`, `docs-migrate`, `docs-operator`, `control-api`, `control-migrate`) exist with **0 versions**, KMS key `45eda044…` (matches the scripts' `KMS_KEY`), no rotation, not replicated, not scheduled for deletion; `munaxa-nonprod-pg` has port 5432 (matches `DB_INSTANCE`) |

Remaining notes (not blockers):

1. Both scripts call `get-secret-value` themselves (read-back after a write, resume, and Docs `status`). This is by design: the owner runs them in CloudShell and no value is printed. Claude never runs them.
2. PR #145 file 09 says "`status` performs no `get-secret-value`": true for Control only. The Docs header documents the read.
3. `control-testing-secrets.sh` keeps an unused `KEY_ARG` (it accepts exactly one argument, so it is always empty). Cosmetic.
4. The scripts trust the CloudShell AWS CLI after checking it is root-owned under `/usr/local/aws-cli/v2/`. That is the correct trust anchor for CloudShell.

## 4. Docs #178

Runbook correction only (the S3 adapter signs with the ECS task role). CI green (12 checks) [D, PR #145]; unchanged since. Merge (docs only).

## 5. `effect` advisory (GHSA-7589-6fvf-x4pw)

| Repository | PR | State |
| --- | --- | --- |
| docs | #179 | green |
| control | #10 / #11 | lint job green on #11 |
| identity | [#21](https://github.com/munaxa/munaxa-identity/pull/21) | new; see file 02 |
| work | [#33](https://github.com/munaxa/munaxa-work/pull/33) | new; see file 02 |
| school | [#26](https://github.com/munaxa/munaxa-school/pull/26) | new; see file 02 |

The lockfiles were edited by hand (GitHub Packages is not reachable from this session): `effect@3.21.0` to `3.22.5`, integrity `sha512-AdIU4llI…` read from the npm registry, its two dependencies unchanged (`@standard-schema/spec` 1.1.0, `fast-check` 3.23.2 satisfy `^1.0.0` and `^3.23.1`). `pnpm install --frozen-lockfile` in CI is the check.

## 6. Work (not on the Docs path)

`munaxa-work/api:b490b25` still has **CRITICAL 1** (CVE-2026-4738, zlib) [V]. Rebuild from main (W-2) after work#33.
