# 02. PR #130 merge and CI evidence, and the PR #129 decision

## 1. Pre-merge checks (owner decision D-PR, instruction section 3)

All read through the GitHub API on 15 Nov 2026 before the merge.

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| State | open, not merged | open, not merged, not draft | PASS |
| Head | `5578ce88b974fb430832f83a3a219ebc9daec30f` | `5578ce88b974fb430832f83a3a219ebc9daec30f` | PASS |
| Base | `68fa6f93fd55c2480f3a8e6e486b5957539eaafa`, equal to `main` | `68fa6f9…`, `main` was `68fa6f9…` | PASS |
| Commits | the remediation commits plus the owner-review commits, nothing else | 11 commits, each one from the remediation thread or the owner-review thread (reports 10 to 13 and their fixes) | PASS |
| Files | the report folder, Terraform, connector scripts, tests | 52 files; the only workflow change adds Python test steps to `aws-terraform.yml` | PASS |
| Review fixes present | reports 10-13 and the fixes they describe (3 High, 6 Medium) | present at the head | PASS |
| Mergeable | clean | `mergeable_state: clean` | PASS |
| CI on the exact head | required checks green | "Format, validate, mocked plan tests" success (run 43654115685); "Lint · Typecheck · Test · Build" success; "Accessibility" success; "Façades" success. "Plan" and "Apply" jobs skipped by design (they run only on a manual dispatch from `main`) | PASS |

## 2. Merge

- Method: squash (this repository refuses merge commits).
- The merge call carried `expectedHeadSha = 5578ce8…`, so GitHub would have refused it if the head
  had moved.
- **Merge commit: `2f6d44317b921d4cf59649285f2481c8bef9fdb0`** on `main`
  (<https://github.com/munaxa/munaxa-platform/commit/2f6d44317b921d4cf59649285f2481c8bef9fdb0>).
- The merge does not trigger any Terraform plan or apply, image publication or deployment. The
  `aws-terraform.yml` plan and apply jobs run only on a manual `workflow_dispatch` from `main`,
  behind the `aws-nonprod` environment approval. No dispatch was made.
- Effect on AWS: none. `nonprod.tfvars` on `main` keeps `session_cleanup_enabled` false and
  `identity_probe_source` empty, so a plan of `main` today shows none of the cleanup or probe
  resources (offline mocked plan test `main_defaults_create_none_of_it`, file 08).

## 3. PR #129 (not merged, not closed)

The instruction says not to merge #129 merely because #130 merged, and to record a reason before
closing it. It was inspected, and it is **left open, not merged, not closed**, for these reasons:

- #129 is documentation only (9 files, 483 additions): the folder
  `2026-11-14-identity-stage-d-correction-and-stage-e-readiness/` (00-07) and one index row.
- It is **not superseded**. Its file 02 is the only written record of the read-only AWS check of
  14 Nov 20:36-20:40 UTC (0 services, 0 tasks, DB stopped, only the six stage D writes, and so on),
  and of the S-1 resolution and the $10 account budget finding. None of that is on `main`.
- Reports already on `main` (the #130 folder, files 00, 01, 04 and 10) link to that folder, so those
  links are dangling until #129 merges.
- Its blocker list (BE-1 to BE-8) is now historical: #130 fixed BE-1, BE-2, BE-3, BE-4 and BE-8 in
  the repository.
- It now conflicts with `main` in `agent-reports/README.md` (one index row), so it needs a rebase
  before it can merge.

Recommendation for the owner (yes/no): rebase #129 on `main` and merge it as the historical record.
Nothing in this task depends on it.
