# 21 Nov 2026: autonomous security remediation and Testing readiness

Owner brief 21 Nov 2026 11:33 UTC (14:33 Amman). Work 11:35 to about 12:40 UTC. Repository work
only: **no AWS call, no Terraform apply, no image published, no secret read or written, no
deployment, no Cloudflare/DNS change, no branch-protection change, Stage E not repeated, C-1/C-2
not executed.**

Status labels: VERIFIED, IMPLEMENTED, TESTED, BLOCKED, RECOMMENDED, OWNER ACTION REQUIRED.

## 1. Outcome

| Item | Result | Label | File |
| --- | --- | --- | --- |
| D-SSL (5 OpenSSL HIGHs on libssl3/libcrypto3 3.5.9-r1) | No fixed Alpine package anywhere (3.22, 3.23, 3.24, edge stop at 3.5.9-r1); OpenSSL's fix release 3.5.10 is scheduled for **1 Dec 2026**; OpenSSL rates the advisories it printed in full as Low. Gate kept fail-closed, no exception. Alternatives tested; Wolfi is cleaner but not compatible without a five-repository migration, so not adopted | BLOCKED (upstream), VERIFIED | 02 |
| Image scans today | every product image fails **only** on D-SSL; no other HIGH/CRITICAL | TESTED | 02 |
| Actions supply chain | every third-party action pinned to a commit SHA, no persisted checkout tokens, least-privilege defaults: identity#23 `b08e887`, work#34 `61c115b`, school#27 `1e5977e` **merged**; control#12, docs#181 open (D-SSL in a required check) | IMPLEMENTED | 01 |
| School deploy findings SC-04, SC-05 | requested migration/rollout that cannot run now fails instead of ending green: school#28 | IMPLEMENTED, TESTED (39/39) | 05 |
| Stage E finding F-1 | C-8G status ignores CloudFormation's `aws:` tags: platform#152 | IMPLEMENTED, TESTED | 01 |
| RDS restart stop (option C) | built in code, **off by default** (no plan change): platform#152; 11 simulator + 4 Terraform tests; stack suite 91/91 | IMPLEMENTED, TESTED | 06 |
| Platform #151 | already merged `e7b0c0b` (11:23 UTC); Stage E report and addendum on `main`, no sensitive data | VERIFIED | 03 |
| Control C-1/C-2/C-3 | re-validated offline on `main`: 33/0/0, 0/3/0, 19 creates; old a24c568 digests correctly refused | TESTED | 04 |
| Identity O-4 | pinned images run the same Identity code as `main`; republication is for image security only, after D-SSL | VERIFIED | 04 |
| Docs | prerequisites and ordered checklist; docs#178 accurate, waits on D-SSL | VERIFIED | 04 |
| Work, School | blockers listed; Work custody script (W-3) is the next repository gap | VERIFIED, RECOMMENDED | 05 |

## 2. PRs

| PR | Result |
| --- | --- |
| [identity#22](https://github.com/munaxa/munaxa-identity/pull/22) | temporary read-only D-SSL probe; CLOSED unmerged |
| [identity#23](https://github.com/munaxa/munaxa-identity/pull/23) | MERGED squash `b08e887` |
| [work#34](https://github.com/munaxa/munaxa-work/pull/34) | MERGED squash `61c115b` |
| [school#27](https://github.com/munaxa/munaxa-school/pull/27) | MERGED squash `1e5977e` |
| [school#28](https://github.com/munaxa/munaxa-school/pull/28) | SC-04/SC-05; see the final index row for its merge |
| [control#12](https://github.com/munaxa/munaxa-control/pull/12) | OPEN: required `Build the images` fails on D-SSL only |
| [docs#181](https://github.com/munaxa/munaxa-docs/pull/181) | OPEN: required `Container images` fails on D-SSL only |
| [platform#152](https://github.com/munaxa/munaxa-platform/pull/152) | this report + F-1 + RDS restart stop; merged when required checks pass |
| docs#178, identity#19, control#9, work#32 | unchanged (D-SSL; owner Packages grant) |

## 3. CI and tests

| Run / suite | Result |
| --- | --- |
| identity#23 run 44900958149 | `verify` success; images job D-SSL only |
| work#34 run 44900060343 | 4/4 required success; images job D-SSL only |
| school#27 run 44900062129 | JS/TS, security success; images job D-SSL only |
| control#12 run 44900055997 | lint/test/build success; images D-SSL only |
| docs#181 run 44900058536 | all required success except images (D-SSL only) |
| D-SSL probe runs 44899818400, 44900002078, 44900698548 | evidence in `supporting/d-ssl-probe-evidence.txt` |
| platform `infra/aws/stack` `terraform test` (1.16.7, mocked) | 91 passed, 0 failed (87 existing + 4 new) |
| Control C-1/C-2 harness | 7 passed, 0 failed |
| `rds-restart-stop` simulator tests | 11 passed |
| `session-cleanup` simulator tests | 49 passed |
| `scripts/aws/connector` tests | 49 passed, 68 subtests |
| School `deploy-gate.test.mjs` | 39 passed |

## 4. Remaining vulnerabilities

Five HIGH (per Grype; Low per OpenSSL for the three it printed in full) in every Alpine product
image: CVE-2026-124709, CVE-2026-107494, CVE-2026-121482, CVE-2026-84786, CVE-2026-107493 on
`libssl3`/`libcrypto3` (and Control's `openssl`) `3.5.9-r1`. Node's bundled OpenSSL 3.5.9 is
affected too and invisible to the scanner. The published Identity Testing images (`9a8c6ebd`,
`5f3bdcce`) additionally carry the OpenSSL `-r0` HIGHs and npm-tooling HIGHs (O-4).

## 5. Testing readiness by product

| Product | Readiness |
| --- | --- |
| Identity | Stage E **done**; next: clean image after D-SSL (O-4) |
| Control | code and plans ready; blocked by D-SSL (release), then owner steps A-7, C-1, A-4C, C-2, A-9 |
| Docs | code ready; blocked by D-SSL, Docs bootstrap, release, bundles, Resend decision, Control credential |
| Work | code ready; blocked by D-SSL, W-3 custody script, Control credential, tenant binding |
| School | not ready: no Identity integration (SC-07), no release, no secrets design |

## 6. Files

01 security remediation · 02 OpenSSL and image status · 03 PR integration · 04 Identity, Control,
Docs readiness · 05 Work and School · 06 RDS and cost safeguards · 07 remaining owner actions ·
`supporting/` (probe evidence, Control harness and plan addresses).

## 7. Confirmation

No unauthorised deployment or infrastructure operation occurred. No AWS API was called by this
task (the D-SSL probe ran on a GitHub-hosted runner against public registries only). The Testing
operator email does not appear anywhere in this report.
