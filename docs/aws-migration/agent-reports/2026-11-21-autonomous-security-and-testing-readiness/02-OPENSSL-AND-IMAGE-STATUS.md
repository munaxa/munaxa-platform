# 02. D-SSL (OpenSSL advisory of 17 Nov 2026) and image status

Written 21 Nov 2026, 11:35 to 12:30 UTC (14:35 to 15:30 Amman). Repository and CI work only. No
image was published, no exception was added, no scanner was changed.

## 1. Result

**BLOCKED upstream. No supported fix exists today, so the gate stays fail-closed.**

- [VERIFIED] No Alpine branch ships an OpenSSL newer than `3.5.9-r1`: 3.22, 3.23, 3.24 (the
  pinned `node:22-alpine` base is Alpine 3.24.4) and **edge** all top out at `3.5.9-r1`
  (`apk policy` on a GitHub runner, run 44899818400; evidence in
  [supporting/d-ssl-probe-evidence.txt](supporting/d-ssl-probe-evidence.txt)).
- [VERIFIED] The OpenSSL project's advisory of 17 Nov 2026 (`openssl-library.org/news/secadv/20261117.txt`,
  read by the runner in run 44900002078) says: the fixes are in the public repository, and
  **releases containing them are scheduled for 1 December 2026**; OpenSSL 3.5 users should upgrade
  to **3.5.10**. So Alpine cannot ship a fixed package before that release, except as a backport.
- [VERIFIED] The OpenSSL project rates the three advisories the runner printed in full as
  **Severity: Low** (CVE-2026-35190, CVE-2026-107493, CVE-2026-124709). Grype rates the same CVEs
  High from their CVSS records. The remaining two (CVE-2026-107494, QUIC RETIRE_CONNECTION_ID;
  CVE-2026-84786, DANE client NULL dereference) and CVE-2026-121482 were not printed in full
  [UNVERIFIED severity per OpenSSL].
- [TESTED] Every product image CI run today fails **only** on these advisories. The HIGH/CRITICAL
  lines of each failed image job, deduplicated:

| Repository | CI run (PR head) | Images | HIGH/CRITICAL findings |
| --- | --- | --- | --- |
| identity | 44900958149 (#23) | runtime, migrate | libssl3 + libcrypto3 3.5.9-r1 × 5 CVEs |
| control | 44900055997 (#12) | api, migrate, portal | libssl3 + libcrypto3 + **openssl** 3.5.9-r1 × 5 CVEs |
| docs | 44900058536 (#181) | api, web, worker, migrate (antivirus passes) | libssl3 + libcrypto3 3.5.9-r1 × 5 CVEs |
| work | 44900060343 (#34) | api, migrate, admin | libssl3 + libcrypto3 3.5.9-r1 × 5 CVEs |
| school | 44900062129 (#27) | api, migrate, admin | libssl3 + libcrypto3 3.5.9-r1 × 5 CVEs |

The five CVEs: CVE-2026-124709, CVE-2026-107494, CVE-2026-121482, CVE-2026-84786, CVE-2026-107493.
Grype fix state `unknown`, no fixed version. No npm, zlib, musl or other finding at HIGH or above in
any image.

## 2. Where OpenSSL is in the images [VERIFIED, round 3 run 44900698548]

- Node.js does **not** use the system library: `ldd /usr/local/bin/node` in the pinned base lists
  only musl, libstdc++ and libgcc; `process.versions.openssl` is `3.5.9` (Node's own bundled,
  statically linked copy). That copy is invisible to Grype (no package record) and needs a Node
  release after 1 Dec to pick up 3.5.10. [RECOMMENDED] track it with the base-image bump.
- In the base image, `libssl.so.3`/`libcrypto.so.3` are linked by `apk`, `ssl_client` (BusyBox
  wget) and OpenSSL's engines and legacy provider. In the product images they are also loaded by
  Prisma's query engine and schema engine (`linux-musl-openssl-3.0.x`), which use them for the TLS
  connection to PostgreSQL (`sslmode=require`).
- Exposure, by code path [INFERENCE, not a vendor statement]: the two QUIC advisories concern QUIC
  servers/peers; no Munaxa image runs OpenSSL QUIC. The DANE advisory concerns DANE-enabled TLS
  clients; Prisma's PostgreSQL client does not enable DANE. CVE-2026-107493 needs an application
  that passes its own stack to `PEM_X509_INFO_read_bio_ex()`; OpenSSL's advisory says OpenSSL's own
  callers never do. The practical risk in Testing is low. That is a reason for patience, not for an
  exception: the gate rule is unchanged.
- Only Control installs the `openssl` **CLI** in its runtime (`Dockerfile` line 50, "OpenSSL for
  Prisma's query engine"). Prisma detects the library from `/usr/lib/libssl.so.3` first, so the CLI
  is very likely unnecessary. [RECOMMENDED] drop it in the same PR as the D-SSL pin bump, where the
  image build proves Prisma still loads (not done today: an image change cannot be verified while
  the scan gate fails).

## 3. Alternatives considered (round 2, run 44900002078)

| Base | HIGH/CRITICAL (Grype, same DB) | Verdict |
| --- | --- | --- |
| `node:22-alpine` newest (= the pinned `1314fb30`) | the 5 D-SSL CVEs once raised to 3.5.9-r1 | current; no newer Alpine |
| `node:22-trixie-slim` / `gcr.io/distroless/nodejs22-debian13` | libssl3t64 3.5.7: the same OpenSSL CVEs plus older ones; glibc, util-linux, sqlite HIGHs | worse |
| `node:22-bookworm-slim` / `distroless/nodejs22-debian12` | Critical 2, High 62 (bookworm-slim); OpenSSL 3.0.18 with Critical CVEs (distroless 12) | worse |
| `cgr.dev/chainguard/wolfi-base` | 0 High, 0 Critical (Low 1, Medium 1); OpenSSL 3.6.x line | cleaner today, **not adopted** |

Why Wolfi is not adopted now: it is glibc-based, so every product would change Prisma binary
targets, package names, the verify scripts and the Docs `scratch` runtime layout, across five
repositories, and the free `latest` tags are rolling (pinning by digest works, but the free
catalogue keeps no old versions). That is a platform migration with its own compatibility risk,
to remove Low-rated (per OpenSSL) findings that the upstream release fixes in 10 days. The brief
allows an alternative base only if "demonstrably safer and compatible"; compatibility is not
demonstrated, and demonstrating it is larger than the risk it removes. [RECOMMENDED] keep Alpine.

## 4. What was done, and what was deliberately not done

- [IMPLEMENTED] The probe (identity PR #22) was a temporary, read-only workflow: public images only,
  `permissions: contents: read`, nothing pushed, no secret. Closed unmerged with a comment; its file
  was removed again in the same branch before identity#23 merged.
- [NOT DONE, by rule] No Grype `ignore` rule or time-bound exception, no scanner change, no
  downgrade, no floating tag, no `apk upgrade` without a pin.
- [NOT DONE] No image published; no registry scan.

## 5. Monitoring and the remediation branch

- **Monitoring method:** every CI run of the five repositories re-reads Alpine and the Grype
  database, so the first green image job on any PR or `main` push is the signal. [RECOMMENDED] a
  Claude check on **2 Dec 2026** (and again 5 Dec): run the probe's round 1 (`apk policy libssl3
  libcrypto3` on the pinned base) and look for `3.5.10-r0` (or a `3.5.9-r2` backport) in
  `v3.24/main`.
- **Reproducible remediation (one PR per repository, prepared here, not branched):** when Alpine
  publishes the fixed package `<V>`:
  1. Replace every `3.5.9-r1` with `<V>` in: identity `apps/api/Dockerfile` and
     `.github/scripts/verify-image.sh`; control `Dockerfile` (and remove `openssl=` there, see §2)
     and its verify script; docs `Dockerfile` (Docs has no separate verify-script pin); work `apps/api/Dockerfile`,
     `apps/admin/Dockerfile` and verify script; school `apps/api/Dockerfile`, `apps/admin/Dockerfile`
     and verify script (`grep -rn '3\.5\.9-r1' .` lists every line). If the Node project ships a
     new `node:22-alpine` with the fix, prefer bumping the base digest too (it also refreshes Node's
     bundled OpenSSL).
  2. CI must show the image job green with **zero** HIGH/CRITICAL (no exception file).
  3. Merge under the standing rule; then the owner publishes (O-4 sequence, file 04 §3).

## 6. Image status by product [VERIFIED code, CI; ECR not re-read today]

| Product | `main` now | Published, in use | Next image |
| --- | --- | --- | --- |
| Identity | `b08e887` | Testing pin api `9a8c6ebd`, migrate `5f3bdcce` (source `2db6ed9`; used by Stage E) | after D-SSL (O-4, file 04) |
| Control | `7b607e0` | none usable (a24c568 withdrawn) | after D-SSL (A-5C) |
| Docs | `f1fca8f` | only old `f8a8bea`; no `migrate` repository | after D-SSL and Docs bootstrap (A-3, A-5) |
| Work | `61c115b` | none usable (b490b25 withdrawn) | after D-SSL; not on the first Testing path |
| School | `a22ad9e` | none | after D-SSL and S-3; not on the first Testing path |
