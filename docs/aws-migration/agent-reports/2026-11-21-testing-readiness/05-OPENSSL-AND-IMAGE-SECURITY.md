# 05. OpenSSL (D-SSL) and image security

**Gate unchanged: zero HIGH and zero CRITICAL (Grype), fail closed. Nothing suppressed, no
threshold lowered, no allow-list, no base-image switch, no image published.**

## 1. Upstream status (last verified 21 Nov 2026, 16:16 to 16:40 UTC)

Source: pkgs.alpinelinux.org package pages (fetched through a web reader; dl-cdn.alpinelinux.org and
the package site are blocked for direct download from this environment).

| Branch | `libssl3` | `libcrypto3` | Built |
| --- | --- | --- | --- |
| edge/main | 3.5.9-r1 | (openssl 3.5.9-r1) | 2026-11-11 |
| v3.24/main (the images' branch: node:22-alpine, Alpine 3.24.4) | 3.5.9-r0 shown | 3.5.9-r1 shown | 2026-09-30 / 2026-11-18 |
| v3.23/main | 3.5.9-r0 | | 2026-09-30 |
| v3.22/main | 3.5.9-r0 | | 2026-09-30 |

**No 3.5.10 in any branch.** The v3.24 pages disagree with each other (the images already install
3.5.9-r1 successfully from v3.24, so the index has r1); the reading is recorded as fetched. The five
HIGH findings (CVE-2026-124709, -107494, -121482, -84786, -107493 on 3.5.9-r1) stand. The 1 Dec
date for OpenSSL 3.5.10 is a target, not a guarantee.

## 2. Bump PRs (prepared, correctly blocked)

| PR | Head | Behind `main` | What it pins | Stages covered |
| --- | --- | --- | --- | --- |
| [identity#24](https://github.com/munaxa/munaxa-identity/pull/24) (draft) | `bedda9c` | 1 (identity#25, docs only) | `libssl3`/`libcrypto3` `3.5.10-r0` in `apps/api/Dockerfile`; `verify-image.sh` minimum 3.5.10-r0 | api and migrate (same Dockerfile) |
| [control#13](https://github.com/munaxa/munaxa-control/pull/13) (draft) | `80e10f9` | 0 | same; drops the `openssl` CLI from the runtime | api, migrate, portal |
| [docs#182](https://github.com/munaxa/munaxa-docs/pull/182) (draft) | `c417953` | 0 | `zlib=1.4-r0`, `libssl3`/`libcrypto3` `3.5.10-r0` in the `alpine` base stage and the `runtime-fs` root | api, web, worker, migrate (all from `runtime`). `infra/antivirus/Dockerfile` is Ubuntu noble (ClamAV), not Alpine, unaffected |
| [work#35](https://github.com/munaxa/munaxa-work/pull/35) (draft) | `8dadcc9` | 0 | api and admin Dockerfiles | api, admin |
| School | patch kept in the sprint scratch; opens after school#29 | | | |

Each pin is exact (`=3.5.10-r0`), so a build either gets the fixed package or fails. They fail by
design today ("no such package"). [V, `git diff origin/main...head` of each]

## 3. Control #14 (code; must precede Control images)

[control#14](https://github.com/munaxa/munaxa-control/pull/14), head `a95dfa6`: "Format · Lint ·
Typecheck · Test · Build" **success**; "Build the images" **failure** (run 44918620776, Grype exit 2
on the D-SSL CVEs). Not merged, by rule. Order after 3.5.10: control#13 → update #14 → green →
merge #14 → control#12 → build Control images from that `main`.

## 4. When 3.5.10 (or `-r1`) is in v3.24/main

1. Confirm the exact package version on pkgs.alpinelinux.org v3.24/main for both packages; if it is
   `3.5.10-r1`, update the pins in all four PRs to that revision (pins are exact).
2. Rebase/update each bump PR; mark ready; CI builds every image and runs Grype; merge only on 0
   HIGH / 0 CRITICAL with every required check green.
3. Then the dependent PRs in order: control#14, control#12, docs#181, docs#178 (each re-run on the
   new `main`; merge only green).
4. Confirm `main` CI image scans for Identity, Control and Docs: 0 HIGH, 0 CRITICAL; record run ids.
5. Record the three `main` SHAs for publication (file 07 step 4).

If a new HIGH appears in a different package at that point, it is a new blocker, handled the same
way: no suppression.
