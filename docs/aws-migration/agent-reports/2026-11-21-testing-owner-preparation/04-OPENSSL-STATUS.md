# 04. OpenSSL (D-SSL) status

**Gate unchanged: Grype, zero HIGH and zero CRITICAL, fail closed. Nothing suppressed, no threshold
lowered, no exception, no base-image change, no OpenSSL library removed, nothing published.**

## 1. Last verified status: 21 Nov 2026, ~19:08-19:09 UTC

Source: pkgs.alpinelinux.org, repo `main`, x86_64 ([supporting/openssl-alpine-check-2026-11-21.txt](supporting/openssl-alpine-check-2026-11-21.txt)).

| Branch | `libssl3` | `libcrypto3` | `openssl` origin | Built |
| --- | --- | --- | --- | --- |
| **v3.24/main** (the images: node:22-alpine 3.24.4) | **3.5.9-r1** | **3.5.9-r1** | 3.5.9-r1 | 2026-11-18 23:31:47 |
| edge/main | 3.5.9-r1 | 3.5.8-r0 (stale index row) | 3.5.9-r1 | 2026-11-11 |

**OpenSSL 3.5.10 is not available in any checked branch.** This reading resolves the earlier
inconsistency: v3.24 now shows 3.5.9-r1 for both packages. The five HIGH findings
(CVE-2026-124709, -107494, -121482, -84786, -107493) stand. 1 Dec is a target date, not a promise.

## 2. Bump PRs (unchanged heads, correctly blocked)

| PR | Head | Pins | Stages |
| --- | --- | --- | --- |
| [identity#24](https://github.com/munaxa/munaxa-identity/pull/24) draft | `bedda9c` | `libssl3=3.5.10-r0`, `libcrypto3=3.5.10-r0`; `verify-image.sh` minimum | api, migrate |
| [control#13](https://github.com/munaxa/munaxa-control/pull/13) draft | `80e10f9` | same; no `openssl` CLI in the runtime | api, migrate, portal |
| [docs#182](https://github.com/munaxa/munaxa-docs/pull/182) draft | `c417953` | same + `zlib=1.4-r0` in the `alpine` base and `runtime-fs` | api, web, worker, migrate (antivirus is Ubuntu ClamAV, not Alpine) |
| [work#35](https://github.com/munaxa/munaxa-work/pull/35) draft | `8dadcc9` | same | api, admin (not this deployment) |

School remediation is separate and does not block Docs.

## 3. When the fixed package appears (Claude, repository side, no owner step)

1. Read pkgs.alpinelinux.org **v3.24/main** for `libssl3` **and** `libcrypto3`; record the exact
   version and build time. If it is `3.5.10-r1` (or later), change the exact pins in the four PRs.
2. Update each bump PR to `main`, mark ready, let CI build every image and run Grype.
3. Merge each only with every required check green and **0 HIGH / 0 CRITICAL**.
4. Then, in order, each updated to `main` and re-run: **control#14 → control#12 → docs#181 → docs#178**.
   control#14 must be in Control `main` before any Control image is built.
5. Confirm the `main` image jobs of Identity, Control and Docs: 0 HIGH, 0 CRITICAL; record run ids
   and the three `main` SHAs (Stage 1, file 06).

If a new HIGH appears in another package then, it is a new blocker handled the same way.
