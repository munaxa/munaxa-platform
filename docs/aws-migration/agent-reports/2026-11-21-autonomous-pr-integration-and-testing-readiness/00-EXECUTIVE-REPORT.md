# Autonomous PR integration and Testing readiness reconciliation (21 Nov 2026)

Owner brief: 21 Nov 2026 09:56 UTC (12:56 Amman), "Autonomous PR Integration, AWS Readiness
Reconciliation and Next-Stage Preparation". Repository work and routine PR merges only.
Work window: 09:56 to about 11:00 UTC.

Tags: **[V]** verified (GitHub API, git, CI logs, code on `main`), **[I]** inference,
**[U]** unverified, **[L]** live status relayed from the Stage E thread, not re-checked.

## 1. Executive summary

- **Merged (squash, expected head SHA each time):** platform #142, #141, #143 and this report PR.
  Exact SHAs in section 3.
- **Carried onto `main` through this PR and closed:** platform #148 and #144 (to save a 15-minute
  CI round each under the ruleset, section 5), #145 (README conflict), and #98, #126, #127, #128
  (historical reports from 11 to 13 Nov that never reached `main`, README conflicts). Their files
  are copied byte for byte from each PR head; their index rows are copied unchanged.
- **Still open:** docs #178 (accurate, blocked only by D-SSL in CI); drafts identity#19,
  control#9, work#32 (owner Packages grant).
- **Closed as superseded:** docs #179 (everything it did is in docs #180 / `f1fca8f`).
- **GitHub permission:** the integration **can** merge and update branches. The "403 Resource
  not accessible by integration" seen earlier on #141 did not recur. Merges are gated by a ruleset
  requiring the three `ci.yml` checks; a PR whose head has never run CI is refused with
  "405 Repository rule violations: 3 of 3 required status checks are expected" (seen on #148).
- **New blocker today (D-SSL):** Grype now reports 5 HIGH OpenSSL advisories on
  libssl3/libcrypto3 3.5.9-r1 with **no fixed version**. It fails docs CI and will fail every
  Alpine image scan in Identity, Control, Work, School and Docs. Fail-closed as designed; owner
  decision (file 02 section 6).
- **Identity Stage E is RUNNING** in another thread (owner-approved 08:11 UTC) [L]. This task did
  not touch it.
- **RDS:** rotation succeeded 20 Nov; the 28 Nov restart time in #148 becomes stale once Stage E
  stops the database today [I]. Recommended design: event-driven delayed stop (not implemented).
  File 01, with a read-only checklist for 28 Nov.
- **No prohibited operation** was performed (section 16).

## 2. Repository and PR state at the start (09:56 to 10:10 UTC) [V]

| Repo | PR | Head at start | Base | Draft | Checks | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| platform | #141 H-20 IAM report | `6b038fb` | `0f06836` (behind) | no | green (19 Nov) | accurate; docs only |
| platform | #142 post-R verification | `e4956d2` | `9fd0a3a` | no | green | accurate; docs only |
| platform | #148 rotation verification | `734baca` | `9fd0a3a` | no | **never ran** | accurate as of 04:30 UTC |
| platform | #143 owner secret scripts | `eb060e9` | `0f06836` | no | green (20 Nov) | touches `.github/workflows/aws-terraform.yml` (test step only) |
| platform | #144 Docs-first program (19 Nov) | `dfdfd23` | `0f06836` | no | — | historical, still useful |
| platform | #145 Docs-first next readiness (20 Nov) | `282d1f9` | `0f06836` | no | — | README conflict; two stale lines (section 4) |
| platform | #98, #126, #127, #128 | various | 11-14 Nov | no | — | README conflicts; reports never on `main` |
| docs | #178 S3 task-role runbook | `d39c1c1` | `9d06698` | no | — | accurate (section 4) |
| docs | #179 Debian base pin | `9cfba30` | `9d06698` | no | — | superseded by #180 |
| identity / control / work | #19 / #9 / #32 per-run package token | 12 Nov | — | **yes** | — | need a GitHub Packages Read grant (owner); left open |
| school | none open | | | | | |

**Live operations on merge [V]:** platform `main` pushes run only `ci.yml` (no AWS credentials,
no `id-token`); `aws-session.yml`, `aws-terraform.yml` apply and `release.yml` are
`workflow_dispatch`/schedule only. The docs merge runs docs CI only. No merge triggers a
deployment, apply or publication. #143's `infra/aws/stack/scripts/docs-owner-password.test.mjs`
is not referenced by any `file()` in the stack, so it cannot change a plan during Stage E.

## 3. Merge results [V]

| PR | Merged at (UTC) | Squash SHA on `main` | Checked after merge |
| --- | --- | --- | --- |
| platform #142 | 21 Nov 10:05 | `2beb70e51e53ed475135407bcd88c0d945586a4e` | yes |
| platform #141 | 21 Nov 10:23 | `38d9f942505fd7f1683fa18da0b447bf7cdedb3a` | yes |
| platform #143 | 21 Nov 10:38 | `3ff48a44447d166dcd3053c3ffe5ca6aa68acb22` | yes |
| platform (this report PR) | see the PR | squash SHA recorded in the PR's closing comment and the agent-report index | yes |

Carried, not merged on their own (closed with a link to this PR): #148 head `6ea9b2f`, #144 head
`766360e`, #145 head `282d1f9`, #128 `9578664`, #127 `ecbc358`, #126 `76c4385`, #98 `c7b06ae`.
Closed as superseded: docs #179 head `9cfba30`.

## 4. Reconciliation of superseded and stale content

- **#144** (19 Nov program): kept as the historical Docs-first program. Its order (Identity E →
  Control → Docs) and owner list A-1 to A-10 are still valid; A-4C and A-5C were added by #145.
- **#145** (20 Nov): kept. Two statements are superseded and are corrected here, not rewritten:
  1. "docs#179 pins the Docs base": docs#179 was **closed**; docs#180 (`f1fca8f`) is the source of
     the Docs release (A-5), on Alpine, including the worker.
  2. "RDS rotation NEEDS VERIFICATION" and the instance name `munaxa-test-pg`: rotation
     **SUCCEEDED** 20 Nov 21:26:28 UTC on `munaxa-nonprod-pg` (#148).
- **#146 / #147 (20 Nov):** "rotation PENDING" is superseded by #148; "Docs worker NOT FIXED" is
  superseded by #147's own 23:45 UTC update (worker on Alpine `scratch`).
- **#148 (21 Nov 04:30):** "Stage E NOT AUTHORIZED" was true when written; the owner approved
  Stage E at 08:11 UTC [L]. The AutomaticRestartTime 28 Nov 00:57:33 becomes stale once Stage E
  stops the database (file 01 section 2).
- **#141 file 00** says "Nothing merged ... the report PR stays open for the owner": historical;
  merged today under the owner's standing merge authorization.
- **docs #178:** verified against code. `signingCredentials` in
  `apps/api/src/infrastructure/infrastructure.module.ts` returns an `EcsTaskCredentialProvider`
  for `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE`; configuration tests refuse a missing or
  non-relative `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`; platform `infra/aws/stack/docs.tf` sets
  `ECS_TASK_ROLE`; `infra/aws/CONTRACT.md` scopes the role to the one bucket. The runbook
  correction is accurate.
- **docs #179:** closed with a comment: every Debian stage it pinned is gone on `main`; the
  antivirus pin, `effect` override, `scan-image.sh` and `.grype.yaml` are already on `main`.

## 5. GitHub permission investigation [V]

1. `get_me`: the connection acts as `tam2om`.
2. `update_pull_request_branch` succeeded on platform #141, #143, #144, #148 and docs #178, so the
   integration has contents and pull-request write.
3. `merge_pull_request` succeeded on #142 (squash, expected head SHA) at the first attempt.
4. Two attempts on #148 returned **405 "Repository rule violations found. 3 of 3 required status
   checks are expected"**: the first before its head had ever run CI, the second at 10:23 UTC with
   all checks green but after #141 had landed on `main`. The ruleset therefore requires the three
   `ci.yml` checks **on a head that is up to date with `main`**. This is a protection, not a
   permission problem; each merge costs one branch update and one CI round (about 10 to 15
   minutes, dominated by the Accessibility job). That is why #148 and #144 were carried into this
   PR instead of being merged one by one.
5. The earlier **403 "Resource not accessible by integration"** on #141 was not reproduced. Most
   likely cause [I]: a different session's connection, or a transient installation token
   problem. If it appears again on a PR that changes `.github/workflows/*`, the cause would be a
   missing `workflows` permission on the GitHub App installation; the owner (organization admin)
   would grant it under the app's installation settings. #143 changes a workflow file and
   merged at the first attempt (10:38 UTC), so the `workflows` permission is present.
6. Nothing in organization, repository, branch-protection or app settings was changed or bypassed.

## 6. CI and test evidence [V]

- Platform PR checks on every merged head: "Lint · Typecheck · Test · Build", "Accessibility",
  "Façades", "Format, validate, mocked plan tests" all success (run ids in each PR's checks).
- #143 locally (this session, Python 3, offline): `test_docs_testing_secrets.py` **23/23 OK**,
  `test_control_testing_secrets.py` **8/8 OK**. `shellcheck` is not installed here; it ran in CI
  ("Format, validate, mocked plan tests", success).
- Docs #178 (head `401b19b`, after the branch update): run 44892115358 job "Migration image ·
  disposable databases" **failed** at 10:02 UTC on the Grype gate (D-SSL, five HIGH OpenSSL
  advisories, no fix); the diff itself is one Markdown file. Not merged; comment posted on the PR.
- Work `main` `a93c642` CI success 20 Nov 23:26 UTC; School PR CI success 20 Nov 23:10 UTC (no
  push CI on School `main`).

## 7. Security review of #143 (owner secret scripts)

| Requirement | Result | Where |
| --- | --- | --- |
| Values never in argv, env, temp files or logs | PASS: each request is written to a `memfd` and given to the CLI as stdin (`--cli-input-json file:///dev/stdin`); responses come back on a pipe; output prints only names, ARNs, version ids, key names, tenant id | `aws()`, `say()` |
| stdin and terminal | hidden input via `getpass` on `/dev/tty`; the Python program itself comes from a quoted heredoc (`<<'PY'`), so nothing is expanded | `ask()` |
| Environment | `env -i` with a fixed PATH; proxy, endpoint, CA, `LD_PRELOAD`, Python and AWS credential variables unset; CLI config and credentials files `/dev/null`; fresh empty CLI home | top of script, `cli_env()` |
| Process hardening | `umask 077`, `ulimit -c 0`, `PR_SET_DUMPABLE 0`, `set +x`, refuses to be sourced | top of script |
| AWS CLI integrity | only root-owned CLI v2 outside any home directory; every path component checked | `find_cli()` |
| Locking | exclusive `flock` on `/tmp/<name>.lock`, opened `O_NOFOLLOW | O_CLOEXEC`, mode 0600; second run stops before any AWS call | lock block |
| Idempotency / resume | one `ClientRequestToken` per run; read-back of value and labels after each write; existing bundles reused so a password is never split | `put()` and `bundles` mode |
| Deletion | only `provision-delete`, only the fixed provision secret, only with this script's `Purpose` tag, after typing DELETE | `provision-delete` |
| Account / region | `sts get-caller-identity` must be 229251310592; region pinned | preflight |
| Tests and AWS | tests replace the CLI with `fake_aws.py` and a fake container-credentials URI; no AWS call is possible from them | `test/` |
| Residual notes | the CloudShell container token is passed to the CLI in its environment (it is the session credential, not an application secret; accepted). Runs from two different CloudShell environments are not mutually locked; the label checks stop such a race with `AFTER_WRITE` | — |

**Verdict:** no critical or high finding; merged. **Merging does not authorize running either
script** (owner items A-4, A-4C).

## 8 to 13. Readiness, security, cost

See **file 01** (RDS rotation and restart, section 7 of the brief) and **file 02** (Testing order,
Identity Stage E, Control C-1/C-2, Docs, Work and School, D-SSL and image status, cost and
idle-state controls, owner-only actions).

### Images still requiring publication and registry scanning [V code, I registry]

| Image | Source on `main` | Registry state | Blocker |
| --- | --- | --- | --- |
| Identity api, migrate | `7615589` | Testing pin `9a8c6ebd`/`5f3bdcce` (2db6ed9, pre-OpenSSL-pin) in use by Stage E | D-SSL, then D-I1 |
| Control api, migrate, portal | `7b607e0` | only withdrawn `a24c568` | D-SSL, A-5C |
| Docs api, web, migrate, worker | `f1fca8f` | only old `f8a8bea`; no migrate repository | D-SSL, A-3, A-5 |
| Work api, migrate, admin | `a93c642` | only withdrawn `b490b25` | D-SSL; not in first Testing deployment |
| School api, admin | `0011680` | none on the new base | D-SSL, O-8; not in first Testing deployment |

Controls still in place on every product `main` [V]: `node:22-alpine@sha256:1314fb30…` pinned,
exact `zlib=1.4-r0`, `libssl3`/`libcrypto3=3.5.9-r1` checked at build, npm/corepack/pnpm removed
from runtime stages, non-root `USER` in every final stage, `verify-image.sh` and `scan-image.sh`
(Syft + Grype `--fail-on high`) in CI and before every push, publication verified by digest, and
10 withdrawn digests refused by `infra/aws/stack/withdrawn-images.tf`.

## 14. Owner-only actions

File 02 section 8. The one decision worth taking now is **D-SSL** (recommended: wait for the
Alpine fix; no exception).

## 15. Next recommended execution sequence

1. Stage E thread finishes: session report, `down`, cleanup verified [L].
2. 22 Nov: read-only check of the new AutomaticRestartTime (file 01 section 5, step 1).
3. When Alpine ships a fixed OpenSSL: one pin-bump PR per product repository (Claude), CI green.
4. Owner: D-I1 Identity republish and pin PR; A-5C Control release; A-3 Docs bootstrap.
5. A-4 / A-4C bundle scripts (owner, CloudShell), A-7 + C-1, then A-8 C-2 + D-1, then A-9 / A-10.
6. 28 Nov: read-only rotation and restart check (file 01 section 5).

**Next execution task for Claude:** the D-SSL pin bump across the five repositories as soon as a
fixed Alpine package exists; until then, the 22 Nov read-only restart-time check if the owner
wants it.

## 16. Confirmation

During this task Claude made **no AWS call of any kind**, ran no Terraform plan or apply,
dispatched no workflow, started or stopped nothing, read no secret value, created or changed no
secret, ran neither owner script, ran no migration, published no image, changed no DNS,
Cloudflare, GitHub organization, repository-settings or secret, and **did not execute or
interfere with Identity Stage E** or Control C-1/C-2. The only writes were GitHub: branch
updates, squash merges, PR comments, closing superseded PRs, and this report's branch and PR.
The Testing operator email appears nowhere in this report or in any merged PR (checked with a
fixed-string search against the private runtime input, 0 matches).
