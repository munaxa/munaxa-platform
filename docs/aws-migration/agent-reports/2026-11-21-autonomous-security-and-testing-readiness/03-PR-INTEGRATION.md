# 03. PR integration

## 1. Platform #151 [VERIFIED]

#151 was already **merged** before this task started, as squash `e7b0c0b` (21 Nov 11:23 UTC), by
the thread "Integrate report PRs and reconcile Testing readiness". `main` at 11:35 UTC was
`e7b0c0b`. Rechecked on `main`:

- `docs/aws-migration/agent-reports/2026-11-21-identity-stage-e-session/00-STAGE-E-SESSION-REPORT.md`
  is present (8,578 bytes); its index row is on `main`.
- The addendum in `2026-11-21-autonomous-pr-integration-and-testing-readiness/` is present.
- No secret value, token, password or the operator email appears in either folder (S-13, S-14 in
  file 01). The operator is named by its Identity subject id, a non-secret identifier needed for
  Control and Work tenant binding.

Nothing further was needed for #151.

## 2. Open PRs at the start (11:35 UTC) and their disposition

| PR | State at start | Relevant? | Disposition |
| --- | --- | --- | --- |
| [docs#178](https://github.com/munaxa/munaxa-docs/pull/178) (head `401b19b`) | open, ready | **yes, accurate**: the runbook said the S3 adapter could not use an ECS task role; the code (`infrastructure.module.ts` `signingCredentials`, `ecs-task-credentials.ts`, `configuration.ts` `STORAGE_CREDENTIALS_SOURCE` enum `STATIC`/`ECS_TASK_ROLE`, 503 when unconfigured, key pair refused beside `ECS_TASK_ROLE`) does exactly what the new text says [VERIFIED code] | OPEN. Required `Container images` fails on D-SSL only (run 44892115358); merge with or after the D-SSL pin bump |
| [identity#19](https://github.com/munaxa/munaxa-identity/pull/19), [control#9](https://github.com/munaxa/munaxa-control/pull/9), [work#32](https://github.com/munaxa/munaxa-work/pull/32) | drafts | yes: per-run package token instead of `PLATFORM_PACKAGES_TOKEN` | OPEN drafts, unchanged. Need the owner's Packages Read grant first. They will need a rebase onto today's workflow pinning (the same `ci.yml` lines); do that when the grant exists |

## 3. PRs created today

| PR | Purpose | Result |
| --- | --- | --- |
| [identity#22](https://github.com/munaxa/munaxa-identity/pull/22) | temporary D-SSL probe | CLOSED unmerged with an evidence comment |
| [identity#23](https://github.com/munaxa/munaxa-identity/pull/23) | Actions hardening | MERGED `b08e887` |
| [work#34](https://github.com/munaxa/munaxa-work/pull/34) | Actions hardening | MERGED `61c115b` |
| [school#27](https://github.com/munaxa/munaxa-school/pull/27) | Actions hardening | MERGED `1e5977e` |
| [school#28](https://github.com/munaxa/munaxa-school/pull/28) | SC-04/SC-05 deploy fail-closed | MERGED `a22ad9e` |
| [control#12](https://github.com/munaxa/munaxa-control/pull/12) | Actions hardening | OPEN, blocked by D-SSL in a required check |
| [docs#181](https://github.com/munaxa/munaxa-docs/pull/181) | Actions hardening | OPEN, blocked by D-SSL in a required check |
| [platform#152](https://github.com/munaxa/munaxa-platform/pull/152) | this report, F-1 fix, RDS restart stop (off) | see the PR; merged under the standing rule when the three required checks pass on a head up to date with `main` |

All merges were squash merges by the GitHub integration; no permission error occurred. No branch
protection, ruleset or review requirement was bypassed.

## 4. Merge rule applied

Merge only when every **required** check passed on the final head, the head is up to date where the
ruleset demands it, the PR is not draft or superseded, there is no critical or high review finding,
and nothing deploys on merge. A failing non-required check was accepted only when it was the same
D-SSL failure `main` already has (identity, work, school image jobs).
