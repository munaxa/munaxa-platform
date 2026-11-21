# 01. D-SSL: alternatives tested, decision, earliest release path

**Decision: gate kept fail-closed. No base image available today gives zero HIGH and zero CRITICAL.**
No finding was suppressed, no threshold changed and no exception was added. Nothing was published.

## 1. The finding

Every Alpine product image carries `libssl3`/`libcrypto3` `3.5.9-r1`. Grype v0.121.2 (database of
21 Nov 2026) reports 5 HIGH in it: CVE-2026-124709, CVE-2026-107494, CVE-2026-121482,
CVE-2026-84786, CVE-2026-107493. In Grype's NVD records the vulnerable range is `< 3.5.10`.
`scan-image.sh` fails on HIGH (`--fail-on high`), so every image scan in all five product
repositories fails on these five CVEs, and only on them.

## 2. Upstream facts [VERIFIED, probe runs 44907849133 and 44908117323 on identity branch `claude/project-thread-4sspd9`]

| Source | Fact |
| --- | --- |
| OpenSSL advisory 20261117 | The OpenSSL project rates the CVEs Low. They are fixed in **3.5.10, 4.0.4 and 4.1.1, scheduled for 1 Dec 2026**. The advisory says "OpenSSL 3.1, 3.2, 3.3, 3.4, and 3.6 are out of support and have not been analysed." |
| openssl-3.5 branch | Fix commits are public: f3acb0a33 (QUIC), 9491b0d9c (suiteb), c8f6d04f8 (PEM), 468c287cf (CRL CPU). |
| Alpine aports | 3.24/main and edge stop at `3.5.9-r1`; 3.22 and 3.23 are at `3.5.9-r0`. MRs 112072 and 112073 (open) and 111652 (merged 18 Nov) backport only the earlier r1 CVEs. **No backport of the 17 Nov fixes exists on any branch.** |
| Alpine nodejs | Alpine's own `nodejs` is 24.x and links the shared libssl. It is not Node 22 and would not avoid the finding. |
| Debian trixie | `openssl 3.5.9-1~deb13u1` is in Grype's vulnerable range. |
| Node's bundled OpenSSL | The node:22 binary bundles OpenSSL 3.5.9. Removing the Alpine libssl does not remove the bundled copy. Prisma's engine also needs `libssl.so.3` (linux-musl-openssl-3.0.x). |

## 3. Images built and tested [TESTED, run 44908117323]

Both variants were built from the same Identity source. Each was then run through the same checks:
- the CI Grype policy (`scan-image.sh`, unchanged),
- migrate from zero against PostgreSQL 16,
- a production-mode boot (EC signing key, MFA key, password reset disabled, Redis with a password),
- `/health/ready`, the Docker HEALTHCHECK, a Prisma query and the 59 unit tests.

| Check | Alpine (current Dockerfile) | Wolfi (`cgr.dev/chainguard/wolfi-base@sha256:be019c1c…`, nodejs-22 22.23.2-r1) |
| --- | --- | --- |
| Builds | yes | yes |
| Migrate from zero | PASS | PASS |
| Production boot, `/health/ready` | 200 | 200 |
| Docker HEALTHCHECK | healthy | healthy |
| Prisma query | OK | OK |
| Unit tests | 59/59 | 59/59 |
| Non-root | yes | yes |
| Size, runtime (`docker images`) | 602 MB | 566 MB |
| OpenSSL | 3.5.9-r1 | `openssl-3.6-lib` 3.6.5-r6 (**3.6 is out of support upstream**) plus 4.0 libs |
| **Grype, runtime** | **FAIL: 5 D-SSL CVEs only** | **FAIL: 7 HIGH on nodejs-22** (CVE-2026-123865, -123866, -123863, -105482, -123872, -123864, -106069) |
| Grype, migrate | FAIL: D-SSL only | FAIL |

**Verdicts:**

| Option | Verdict | Reason |
| --- | --- | --- |
| Wolfi | Rejected | 7 HIGH on nodejs-22 and an OpenSSL line that is out of upstream support (it boots and is slightly smaller). |
| Debian slim | Rejected | Same vulnerable version. |
| Alpine edge or another channel | Rejected | No fixed package exists on any channel. |
| Node's bundled OpenSSL | Rejected | It is 3.5.9 too, and Prisma needs the system libssl. |
| A Grype exception | Not used | Needs owner approval with an expiry; not recommended, and not asked for here. |

## 4. Earliest release path

1. **1 Dec 2026:** OpenSSL publishes 3.5.10.
2. **Alpine** publishes `libssl3`/`libcrypto3` `3.5.10-r0` in 3.24/main. This usually comes within days of an upstream release; the date is not guaranteed.
3. **Claude** re-runs CI on the five draft bump PRs. They are already open and pinned to `3.5.10-r0`:
   - identity#24
   - control#13 (also removes the `openssl` CLI from the Control image)
   - docs#182
   - work#35
   - school: the patch is ready; the PR opens after the School thread's branch is free
4. **Claude** merges each PR under the standing rule once its scan shows 0 HIGH and 0 CRITICAL. It then merges control#12, docs#181 and docs#178, whose required checks fail today only because of D-SSL.
5. **Images can be published from that point** (owner actions in file 05, session 2).

If Alpine names the package `3.5.10-r1` or later, the pin in each PR changes in one commit with
`bump.py <version>`. The exact-version check in every Dockerfile makes a wrong guess fail loudly
rather than install something else.
