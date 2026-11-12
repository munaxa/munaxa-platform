# 08. PRs, CI and workflow runs

## PRs

| PR | Head | CI | Review | State |
| --- | --- | --- | --- | --- |
| [munaxa-platform#117](https://github.com/munaxa/munaxa-platform/pull/117) | `8e98cb0` | all required checks green (Lint/Typecheck/Test/Build, Accessibility, Façades; Terraform mocked tests) | APPROVE | **squash-merged `015a13311871a56aabd87443e073dd8cc13609fa`** |
| [munaxa-identity#19](https://github.com/munaxa/munaxa-identity/pull/19) | `888c532` | `verify` green, but only from the pnpm cache (02) | APPROVE | **draft**, waits on the package Read grant |
| [munaxa-work#32](https://github.com/munaxa/munaxa-work/pull/32) | `7d30ba2` | 4/4 green, from cache | APPROVE | **draft**, same |
| [munaxa-control#9](https://github.com/munaxa/munaxa-control/pull/9) | `2cb5371` | verify green (cache); **Build the images: failure, 403** (run 43293572031) | APPROVE | **draft**, same. A comment on the PR explains the failure |
| this report | | | | docs-only PR, standing merge rule |

The draft PRs were not merged: merging them now would make CI on main fail at its first cache miss.

## Workflow runs relevant here

| Run | What |
| --- | --- |
| [identity 43293534190](https://github.com/munaxa/munaxa-identity/actions/runs/43293534190) | CI on #19 first head, success (cache hit) |
| [control 43293572031](https://github.com/munaxa/munaxa-control/actions/runs/43293572031) | CI on #9, image build `ERR_PNPM_FETCH_403` |
| [identity 42466697538](https://github.com/munaxa/munaxa-identity/actions/runs/42466697538) | 8 Nov ECR publish at `5277d71`, approved in `image-release` by tam2om (evidence for 03) |
| [identity 43287805158](https://github.com/munaxa/munaxa-identity/actions/runs/43287805158) | CI on main `5a5994f`, success |

**No `publish-images-ecr.yml` run was started in this thread.**

## Tests and checks executed

| Check | Result |
| --- | --- |
| `supporting/workflow-token-check.py` on the four mains | 11 of 12 workflow files fail (expected; the findings in 01) |
| The same on the four PR branches | 12/12 pass |
| YAML parse of every changed workflow | pass |
| PR CI | see the table above |
| Independent review | APPROVE (07) |
| Terraform offline plan | **not run**: Terraform is not installed in this session. The delta was recalculated from a configuration diff (06 §3) |
