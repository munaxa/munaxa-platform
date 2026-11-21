# 06. PRs and CI

Checked live on GitHub at ~16:17 to 16:45 UTC, 21 Nov 2026. Reports are not taken as proof.

## 1. Repository `main` heads at the start

| Repository | `main` |
| --- | --- |
| munaxa-platform | `d01dfa1` (#154) |
| munaxa-identity | `d6225ff` (#25) |
| munaxa-control | `7b607e0` (#11) |
| munaxa-docs | `f1fca8f` (#180) |
| munaxa-work | `61c115b` (#34) |
| munaxa-school | `a22ad9e` (#28) |

## 2. Open PRs and why none (other than this report's) was merged

| PR | Head | State | Required checks | Blocker | Next action |
| --- | --- | --- | --- | --- | --- |
| [control#14](https://github.com/munaxa/munaxa-control/pull/14) | `a95dfa6` | ready | Build/test success; **Build the images failure** (run [44918620776](https://github.com/munaxa/munaxa-control/actions/runs/44918620776)) | D-SSL | After control#13 merges: update, re-run, merge on green; before any Control image |
| [control#13](https://github.com/munaxa/munaxa-control/pull/13) | `80e10f9` | draft | fails by design (3.5.10-r0 absent) | D-SSL | Mark ready when Alpine ships |
| [control#12](https://github.com/munaxa/munaxa-control/pull/12) | `09358d6` | ready | Build/test success; **Build the images failure** (run [44900055997](https://github.com/munaxa/munaxa-control/actions/runs/44900055997)) | D-SSL | Re-run after #13, #14 |
| [control#9](https://github.com/munaxa/munaxa-control/pull/9) | `ab45d35` | draft | | Owner GitHub Packages Read grant (optional) | |
| [docs#182](https://github.com/munaxa/munaxa-docs/pull/182) | `c417953` | draft | fails by design | D-SSL | |
| [docs#181](https://github.com/munaxa/munaxa-docs/pull/181) | `c1adc48` | ready | **Container images** and **Migration image** failure (run [44900058536](https://github.com/munaxa/munaxa-docs/actions/runs/44900058536)); 9 others success | D-SSL | Re-run after #182 |
| [docs#178](https://github.com/munaxa/munaxa-docs/pull/178) | `401b19b` | ready | same two failures (run [44892120918](https://github.com/munaxa/munaxa-docs/actions/runs/44892120918)) | D-SSL (docs-only change, but the required image check runs on every PR) | Re-run after #182 |
| [identity#24](https://github.com/munaxa/munaxa-identity/pull/24) | `bedda9c` | draft | fails by design | D-SSL | |
| [identity#19](https://github.com/munaxa/munaxa-identity/pull/19) | `531ae2c` | draft | | Packages grant | |
| [work#35](https://github.com/munaxa/munaxa-work/pull/35) | `8dadcc9` | draft | fails by design | D-SSL; Work not in this deployment | |
| [work#32](https://github.com/munaxa/munaxa-work/pull/32) | `05fcc4c` | draft | | Packages grant | |
| [school#29](https://github.com/munaxa/munaxa-school/pull/29) | `50bde7c` | draft | | Owner yes on Render `SCHOOL_LOCAL_AUTH`; not in this deployment | |
| munaxa-platform | none open at start | | | | |

No branch protection was bypassed, no failing check was overridden, no image PR was merged.

## 3. This task's PR

munaxa-platform, branch `claude/project-thread-kmnjwu`: custody-script caller check, Identity
Center policies and tests, OPERATOR-ACCESS.md update, CI steps, and this report. Merged under the
standing rule once the three required `ci.yml` checks and the `aws-terraform.yml` checks pass (PR
number, run ids and merge SHA in the README index entry and the final thread message).

## 4. Tests actually run by this task

| Test | Where | Result |
| --- | --- | --- |
| Custody scripts (docs, control, work, new caller identity) | local, `python3 -m pytest -q scripts/aws/owner/test` | **64 passed, 27 sub-tests passed** (before the change: 61 passed) |
| Identity Center permission sets | local, `python3 -I -W error -m unittest discover -s infra/aws/identity-center` | **13 OK** |
| Docs bootstrap delta | local, Terraform 1.16.5 + aws 6.67.0, `terraform test` (offline) | **2 passed**; plan 2 add, 3 change, 0 destroy |
| Docs bootstrap plan script policy-delta check (jq) | local, synthetic plans | correct delta accepted; extra change refused; missing ARN refused |
| Docs bootstrap plan script | `bash -n` | syntax OK |
| CI on this PR | GitHub Actions | see the PR (all required checks must pass before merge) |

Not run: shellcheck (not installed locally; CI runs it on the three custody scripts), any AWS call
(connector sign-in expired; nothing needed it), any image build (D-SSL makes the scan fail by
design and the bump PRs already show it).
