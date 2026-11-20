# 02. Repository and PR status

Read from GitHub on 20 Nov 2026 between 09:20 and 09:45 UTC [V].

## 1. Main branches

| Repository | main | Changed since 19 Nov report |
| --- | --- | --- |
| munaxa-platform | `0f06836` | no |
| munaxa-docs | `9d06698` | no |
| munaxa-identity | `2db6ed9` | no |
| munaxa-control | `1f58c90` | no |
| munaxa-work | `eabcc47` | no |
| munaxa-school | `4c2b4a4` | no |

## 2. Open PRs in scope

| PR | What | State | CI | Reviews / comments | Depends on | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| [platform#141](https://github.com/munaxa/munaxa-platform/pull/141) | H-20 IAM plan/apply report (19 Nov) | open | green | none | none | merge (docs only) |
| [platform#142](https://github.com/munaxa/munaxa-platform/pull/142) | first scheduled cleanup verification (20 Nov 00:05 Amman) | open | green | none | none | merge (docs only) |
| [platform#143](https://github.com/munaxa/munaxa-platform/pull/143) | Docs and Control owner secret scripts, tests, CI step | open, head `eb060e9` | green (Terraform mocked tests, lint/test/build) | 19 Nov independent review APPROVE (recorded in the 19 Nov report); my CI note on a flaky `@munaxa/rbac` timing test | none | merge; running the scripts is A-4 / A-4C |
| [platform#144](https://github.com/munaxa/munaxa-platform/pull/144) | 19 Nov Docs-first program report | open | green | none | none | merge (docs only); superseded in part by this report, kept for history |
| [docs#178](https://github.com/munaxa/munaxa-docs/pull/178) | runbook: S3 adapter signs with the ECS task role | open | green (12 checks) | none | none | merge (docs only) |
| [docs#179](https://github.com/munaxa/munaxa-docs/pull/179) | **new:** Node base image pinned by digest; `effect` override | open, head `4c6ec2a` | **green on `4c6ec2a`** (first run failed only `pnpm audit`, the new upstream advisory; fixed by the override) | none | none | merge before the Docs release (A-5) |
| [control#10](https://github.com/munaxa/munaxa-control/pull/10) | **new:** base image refresh plus OS upgrades (7 HIGH CVEs); `effect` override | open, head `6ca2287` | **green on `6ca2287`** (first run failed only `pnpm audit`, same advisory; 83/83 tests) | none | none | merge before the Control release (A-5C) |
| this report's PR | 2026-11-20 report | open | see PR | none | none | merge (docs only) |

None of these PRs deploys anything on merge. The platform `aws-terraform.yml` plan and apply jobs run only on manual dispatch. They were skipped on every PR run [V check runs].

## 3. Upstream advisory found today

GHSA-7589-6fvf-x4pw (high, `effect` <= 3.22.0, reached through `prisma > @prisma/config`) makes `pnpm audit --audit-level high` fail on **every** repository that uses Prisma 6.19:

| Repository | Lockfile has effect 3.21.0 | Fixed |
| --- | --- | --- |
| docs | yes | docs#179 |
| control | yes | control#10 |
| identity | yes | not in scope today; one-line override, same as docs#179 |
| work | yes | not in scope |
| school | yes | not in scope |
| platform | no | n/a |

Assessment [E]: `@prisma/config` loads the Prisma configuration in the CLI (build and the migrate image), not request input, so exposure to the ReDoS is low; the override removes it anyway. The next PR in identity, work or school will fail CI until the same override is added.


> **Update 20 Nov 23:20 UTC:** control#10 was closed without merging. It was replaced by [control#11](https://github.com/munaxa/munaxa-control/pull/11) (Alpine base; fixes the 7 HIGH CVEs and the `effect` advisory), which belongs to the thread "Fix image vulnerabilities across all apps". control#11 is the source for A-5C.
