# 09. Remaining blockers and execution gates

**Stage E is NOT authorized (D-E: NO) and NOT ready.** Nothing in this task touched AWS.

## 1. Owner approvals still needed, in order (each a yes/no)

| # | Approval | Prepared in | What happens on yes |
| --- | --- | --- | --- |
| G-1 | Merge PR #131 (L-A0 redesign) after its separate review | file 03, 07, 08 | Docs, scripts, template and the bootstrap task definition reference change in the repository; no AWS change by itself. Its next nonprod apply carries 2 more changes (§2) |
| G-2 | D-B2: owner runs the bootstrap plan in CloudShell and sends the output | file 06 §3 | Claude checks: exactly 2 creates, 2 updates |
| G-3 | D-B2: apply that saved plan | file 06 §3 | Cleanup permissions exist in IAM |
| G-4 | D-B3 + D-PIN: merge PR #132, dispatch the nonprod plan | file 04, 05, 06 §4 | Claude checks the plan: 9 creates, 1 update (plus the bootstrap task definition replacement and its policy update if #131 merged first) |
| G-5 | D-B3 + D-PIN: apply that saved plan (environment approval) | same | State machine, daily R, alarms, topic, probe task definition exist. R starts running daily at 21:05 UTC |
| G-6 | D-B5: subscribe `alert@munaxa.com` to the alerts topic; owner clicks the confirmation | file 06 §6 | Alarm emails reach the owner |
| G-7 | D-B4: idle dry run | file 06 §5.1 | One execution record, nothing changed |
| G-8 | Stage E itself (D-E), which includes the active-session dry run, C-8G `create`, the bootstrap window and the probe | file 03 §5, file 06 §5.2 | A separate decision; not requested now |
| G-9 | PR #129: rebase and merge as the historical record (optional) | file 02 §3 | Dangling links from the #130 reports resolve |

## 2. Ordering constraints

- **#131 and #132 together:** whichever merges second must declare the union. If #131 is merged
  first, #132's `envs/nonprod.expected-changes.json` gains
  `aws_ecs_task_definition.identity_bootstrap[0]` (`delete`, `create`) and
  `aws_iam_role_policy.identity_bootstrap_execution[0]` (`update`), 12 changes in all. If #132 is
  applied first, #131 must carry its own declaration of those 2 changes and its own apply. Either
  way `check-plan-intent.sh --enforce` refuses a plan that does not match.
- **Merge = apply day for #132:** an unapplied #132 on `main` makes the scheduled `down` fail at its
  switch-plan step (the database stop still runs), as happened with S-1.
- **D-B2 before D-B3:** the stack apply needs the deployer permissions that D-B2 adds.
- **Every later bootstrap apply** must pass `-var testing_session_cleanup=true`, or it removes the
  cleanup permissions. Recommended follow-up: a small PR that makes this persistent (for example a
  committed variable file for the bootstrap root). Not done here: not requested.
- **Before the first `up`:** H-20 `gate` must pass, which needs one real successful run of R
  (21:05 UTC) after G-5, and the D-B5 subscription confirmed.

## 3. Open risks carried forward

| Id | Risk | Status |
| --- | --- | --- |
| L-A0 | Password through the connector | **Redesigned** (PR #131, unmerged). The C-8/C-8R scripts are deleted on #131 and the D-LA0 canary was not run. On `main` the old scripts still exist until #131 merges; they must not be run |
| B-H1 (T6) | The nonprod deployer can read the operator secret during an open window by running a task with the bootstrap execution role | Accepted with residual risk (60 min bounded window); C-24 correlation follow-up |
| B-L3 | The operator email appears in bootstrap CloudWatch logs and possibly in CloudTrail | Recorded |
| A-10, A-11, B-L2 | C-24 relies on unverified CloudTrail field shapes | Verify on the first real session |
| S-2, S-3 | RDS master secret `AWSPENDING`; test certificate not auto-renewable while unused (report `2026-11-14-identity-stage-d-correction-and-stage-e-readiness`, PR #129) | Open, unchanged |
| B-1 | $10 account budget exceeded on 14 Nov (US$10.21) | Open; the cleanup adds a few cents a month (Step Functions, alarms) |

## 4. What was not done (strict boundaries respected)

No Terraform apply or plan against AWS, no workflow dispatch, no RDS start or stop, no ECS service
or task, no migration, bootstrap or db-admin run, no secret created, read, updated or deleted, no
credential generated, no IAM, KMS, network, DNS, certificate, budget or schedule change, no image
published, nothing deployed, nothing in production, Stage E not started, no CreateSecret canary, no
C-8/C-8R run. The only GitHub write beyond branches and PRs was the squash merge of PR #130 (and the
docs-only report PR under the standing rule).
