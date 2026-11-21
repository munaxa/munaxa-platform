# 05. PRs, CI and tests

Live GitHub state read 21 Nov 2026 ~19:08-19:30 UTC.

## 1. `main` heads at the start (unchanged from the previous report's end)

| Repository | `main` |
| --- | --- |
| munaxa-platform | `6633c4e` (#155) |
| munaxa-identity | `d6225ff` (#25) |
| munaxa-control | `7b607e0` (#11) |
| munaxa-docs | `f1fca8f` (#180) |
| munaxa-work | `61c115b` (#34) |
| munaxa-school | `a22ad9e` (#28) |

## 2. Open PRs (12), all re-checked; none eligible

| PR | Head | State | Required checks on that head | Blocker | Still needed? |
| --- | --- | --- | --- | --- | --- |
| [control#14](https://github.com/munaxa/munaxa-control/pull/14) | `a95dfa6` | ready | Format/Lint/Test/Build success; **Build the images failure** ([run 44918620776](https://github.com/munaxa/munaxa-control/actions/runs/44918620776)) | D-SSL | Yes, before any Control image |
| [control#13](https://github.com/munaxa/munaxa-control/pull/13) | `80e10f9` | draft | fails by design | D-SSL | Yes |
| [control#12](https://github.com/munaxa/munaxa-control/pull/12) | `09358d6` | ready | image job failure ([run 44900055997](https://github.com/munaxa/munaxa-control/actions/runs/44900055997)) | D-SSL | Yes |
| [control#9](https://github.com/munaxa/munaxa-control/pull/9) | `ab45d35` | draft | | owner Packages grant | Optional |
| [docs#182](https://github.com/munaxa/munaxa-docs/pull/182) | `c417953` | draft | fails by design | D-SSL | Yes |
| [docs#181](https://github.com/munaxa/munaxa-docs/pull/181) | `c1adc48` | ready | Container images + Migration image failure ([run 44900058536](https://github.com/munaxa/munaxa-docs/actions/runs/44900058536)) | D-SSL | Yes |
| [docs#178](https://github.com/munaxa/munaxa-docs/pull/178) | `401b19b` | ready | same two failures ([run 44892120918](https://github.com/munaxa/munaxa-docs/actions/runs/44892120918)); 10 other checks success | D-SSL | Yes (runbook correction) |
| [identity#24](https://github.com/munaxa/munaxa-identity/pull/24) | `bedda9c` | draft | fails by design | D-SSL | Yes |
| [identity#19](https://github.com/munaxa/munaxa-identity/pull/19) | `531ae2c` | draft | | Packages grant | Optional |
| [work#35](https://github.com/munaxa/munaxa-work/pull/35) | `8dadcc9` | draft | fails by design | D-SSL | Yes (not this deployment) |
| [work#32](https://github.com/munaxa/munaxa-work/pull/32) | `05fcc4c` | draft | | Packages grant | Optional |
| [school#29](https://github.com/munaxa/munaxa-school/pull/29) | `50bde7c` | draft | | owner yes on Render `SCHOOL_LOCAL_AUTH` | Not this deployment |
| munaxa-platform | none open at start | | | | |

No head moved since the 16:45 UTC check. No branch protection was bypassed, no failing check
overridden, no image PR merged. The platform ruleset requires the three `ci.yml` checks on a head
up to date with `main`.

## 3. This task's PR

munaxa-platform branch `claude/project-thread-m8dqzx`: IC-1 regression tests, README C2, Docs
bootstrap script in `scripts/aws/owner/` with its test harness and CI step, this report. Merged under
the standing rule when every required check passes (PR number, run ids and merge SHA: the index
entry and the final thread message).

## 4. Tests run by this task (local unless stated)

| Command | Result |
| --- | --- |
| `python3 -I -W error -m unittest discover -s infra/aws/identity-center -p 'test_*.py' -v` | **18 OK** (13 + 5 new) |
| `python3 -m pytest -q scripts/aws/owner/test` | **64 passed, 27 sub-tests** (before the new file) |
| `MUNAXA_DOCS_DIR=<munaxa-docs clone> python3 scripts/aws/owner/test/test_docs_bootstrap_plan.py -v` | **19 OK** (new; in CI without the real-constants test, which skips) |
| `terraform -chdir=infra/aws/stack test` (1.16.5, aws 6.67.0, mocked) | **93 passed** |
| `terraform -chdir=infra/aws/bootstrap test` | **23 passed** |
| `terraform -chdir=infra/aws/modules/service test` | **17 passed** |
| `terraform fmt -check -recursive infra/aws` | clean |
| `python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'` | **143 OK** |
| `python3 -I -m unittest discover -s infra/aws/stack/session-cleanup -p 'test_*.py'` | OK |
| Apply 1/2 offline plan (`supporting/apply1-apply2-mocked.tftest.hcl`) | **7 passed** (file 06) |
| Apply 1 change set with placeholders (scratch worktree): stack tests / connector tests / `check-plan-intent.sh --validate` | **95 passed** / **143 OK** / valid, 37 declared |
| Terraform 1.16.5 zip and aws 6.67.0 zip vs HashiCorp `SHA256SUMS` | match |

Not run locally: `shellcheck` (not installed here; CI runs it, now also on the bootstrap script).
No image build: D-SSL makes every scan fail by design and the bump PRs already show it.
