# 02. Repository and PR status

Read from GitHub on 20 Nov 2026 between 18:20 and 19:00 UTC [V].

## 1. Main branches (unchanged since PR #145)

| Repository | main |
| --- | --- |
| munaxa-platform | `0f06836` |
| munaxa-docs | `9d06698` |
| munaxa-identity | `2db6ed9` |
| munaxa-control | `1f58c90` |
| munaxa-work | `eabcc47` |
| munaxa-school | `4c2b4a4` |

No newer report or PR supersedes PR #145; its open PRs have had no new commits, reviews or comments since 09:45 UTC.

## 2. Open PRs reviewed

| PR | Head | CI | Disposition |
| --- | --- | --- | --- |
| [platform#141](https://github.com/munaxa/munaxa-platform/pull/141) | `6b038fb` | green [D] | merge (docs only) |
| [platform#142](https://github.com/munaxa/munaxa-platform/pull/142) | `dc23db4` | green [D] | merge (docs only) |
| [platform#143](https://github.com/munaxa/munaxa-platform/pull/143) | `eb060e9` | green [V]; 31/31 tests locally [T] | merge; no blocking defect (file 04 §3) |
| [platform#144](https://github.com/munaxa/munaxa-platform/pull/144) | `dfdfd23` | green [D] | merge (docs only) |
| [platform#145](https://github.com/munaxa/munaxa-platform/pull/145) | `78d9c50` | green [D] | merge (docs only); corrections in file 01 |
| [docs#178](https://github.com/munaxa/munaxa-docs/pull/178) | `d39c1c1` | green [D] | merge (docs only) |
| [docs#179](https://github.com/munaxa/munaxa-docs/pull/179) | `4c6ec2a` | **24/24 green** [V] | merge before A-5; D-G1 decision (file 04 §2) |
| [control#10](https://github.com/munaxa/munaxa-control/pull/10) | `6ca2287` | green [V] | **superseded by control#11; close when #11 merges** (it cannot clear 6 of 7 HIGH, file 04 §1) |
| control#9, identity#19, work#32 | drafts | n/a | unchanged (need a package Read grant) |
| platform#98, #126, #127, #128 | older report PRs | n/a | unchanged, out of scope |

## 3. PRs opened in this task

| PR | Head | CI (20 Nov, about 18:45 UTC) |
| --- | --- | --- |
| [munaxa-control#11](https://github.com/munaxa/munaxa-control/pull/11) | `18e4d31`, later `98d7583` | Lint job **success**. The first image build **failed** with `ERR_PNPM_FETCH_401` on `@munaxa/auth`. **Correction (22:05 UTC): this was my own CI bug, not a token problem.** Inserting the verify step moved the build step's `env: NODE_AUTH_TOKEN` onto the new step, so the build got an empty secret. Another project session pushed the fix (`ee9caa7`), added a Grype scan and moved `effect` to 3.22.4 (`98d7583`). The image job on `98d7583` failed again at 21:58 UTC, and that session is handling it. The Alpine `os` stage passed (zlib 1.4-r0) |
| [munaxa-identity#21](https://github.com/munaxa/munaxa-identity/pull/21) | `bf7e372` | **green**: "verify" and "Images (runtime and migrate)" success |
| [munaxa-work#33](https://github.com/munaxa/munaxa-work/pull/33) | `48cc9c8` | running at the time of writing (Product isolation and Mobile success); final result in the PR |
| [munaxa-school#26](https://github.com/munaxa/munaxa-school/pull/26) | `277ca4a` | running at the time of writing (Security scans and Detect changed areas success); final result in the PR |
| this report's PR | see PR | see PR |

## 4. Local and offline checks [T]

| Check | Result |
| --- | --- |
| `terraform test` in `infra/aws/stack` (Terraform 1.16.5, AWS provider 6.67.0 from releases.hashicorp.com, SHA-256 verified; mocked, no credentials) | **77 passed, 0 failed**, including the 2 new withdrawn-image tests |
| `terraform fmt -check`, `terraform validate` | clean |
| PR #143 owner-script tests | 31 passed |
| `bash -n` on control `verify-image.sh` | clean (shellcheck not installed here; CI does not run it for control) |
| Docker builds | not possible here (no daemon); CI builds them |
