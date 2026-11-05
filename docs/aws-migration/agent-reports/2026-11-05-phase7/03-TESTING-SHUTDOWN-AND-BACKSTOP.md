# 03 Testing shutdown and AWS-side backstop (Phase 7, Agent 3)

> **Lead note (Phase 7 consolidation).** This report was written against PR #43 head `e78aa92`. Its patch `a3-P1-fix-cancelled-up-and-annotations.patch` (findings 2 to 4: `!success()` after a cancelled or timed-out `up`, `::error::` on every red path, waiting through `creating`) was applied by the lead in commit `58b80f4`, now in PR #43 (head `744c67c`). The stop-script cases pass 22 of 22 on that head [L]. Finding 1 (the backstop is inert until the second re-apply) sets the gate order in `08` §6 and `09`.


Date: 5 Nov 2026, about 06:50 to 08:30 UTC. Scope: PR munaxa/munaxa-platform#43, head `e78aa92`
(detached worktree `/tmp/claude-0/phase7/a3/wt`). Owner decision D-4 = Choice B: the backstop (P2) is a
separate small apply right after G3, G3 stays 64 creates, P1 is merged before the first `up`, and no
Testing session starts before the backstop and P4 are verified.

No AWS call of any kind was made. No GitHub write was made. GitHub was read only through the GitHub
MCP read tools. Public pages were fetched with curl: GitHub docs sources (raw.githubusercontent.com,
github/docs), the AWS CDK scheduler-targets README and source, the Terraform AWS provider docs, the
AWS public price list bulk files (pricing.us-east-1.amazonaws.com) and the AWS programmatic Service
Authorization Reference (servicereference.us-east-1.amazonaws.com). docs.github.com, docs.aws.amazon.com
and aws.amazon.com were refused by the proxy. **Local policy evaluation here is not an AWS IAM
simulation.**

Labels: [V-repo] repository, [V-gh] GitHub API, [V-aws] live AWS (only from owner-pasted reports),
[V-ext] public vendor document or price list fetched in this session, [L] local simulation or test,
[E] inference or estimate, [U] unverified, [O] owner action required.

## 1. Summary

1. The code in #43 does what P1 and P2 promise in every scenario I modelled, with one real defect: a
   cancelled `up` (job timeout or manual cancel) leaves the database running, because the cleanup step
   uses `failure()`, which is false on cancellation [L, V-ext GitHub docs]. A fix patch is in this
   directory.
2. **The backstop does nothing at runtime until bootstrap is re-applied a second time with P3.** AWS runs
   bootstrap `46dfbd9` [V-aws owner report], whose nonprod boundary has no `rds:StopDBInstance` or
   `ecs:UpdateService` [V-repo `git diff 46dfbd9 e78aa92 -- infra/aws/bootstrap/iam.tf`]. The backstop
   role carries that boundary, so every 21:00 call would be an implicit deny, silently (no DLQ, no alarm).
   The same second re-apply is needed for P4 (R10). The "backstop verified" gate must therefore include
   the re-apply. The backstop apply itself would still succeed [E].
3. Mocked Terraform [L]: the G3 plan stays **64 creates**, identical to the addresses of real plan run
   41977870108. With `session_backstop_schedule = "cron(0 21 * * ? *)"`, a fresh plan is 77 creates. A
   mocked G3 apply followed by a no-change re-plan and then the backstop plan gives exactly **13 to add,
   0 to change, 0 to destroy**, at the 13 addresses in section 5.
4. P3 renders as asked [L]: only the nonprod boundary has `TestingBackstop`, with `rds:StopDBInstance`
   on `db:munaxa-nonprod-*` and `ecs:UpdateService` on `service/munaxa-nonprod/*`. The prod boundary has
   no such statement.
5. Tests [L]: stop script 22 cases against a fake `aws`, 21 pass on #43 (the extra `creating` case shows a
   low finding) and 22 pass with the patch. Workflow model 26 scenarios: 2 leave the database running on
   #43, 0 with the patch. actionlint 1.7.7 and shellcheck 0.10.0 were installed with verified checksums.
   They report 1 info (SC2015, benign) and 0 errors.
6. Cost: the backstop costs US$0.00 a month (about 341 scheduled invocations against 14 million free,
   then US$1.15 per million [V-ext price list]). After 21:00 a forgotten session costs about US$0.037 an
   hour (ALB plus 2 public IPv4), down from about US$0.31 [V-ext prices, E usage]. Budgets only notify.

## 2. Design as implemented (#43)

| Layer | What | When | Independent of | Label |
| --- | --- | --- | --- | --- |
| `aws-session.yml` job `database` | Stops `munaxa-nonprod-pg` through `stop-database.sh`. Concurrency group `aws-nonprod-database`, 45 min timeout | every `down`, crons `17 19` and `47 1` UTC | the Terraform group and its approvals | [V-repo] |
| `aws-session.yml` job `session` | Plans and applies `edge_enabled`/`services_enabled`, plan filter on 7 resource types. Starts the database on `up` and stops it on `down` or a failed `up`. Group `aws-terraform-nonprod` (job level, shared with `aws-terraform.yml`), 50 min timeout | the same triggers | nothing: it waits behind any nonprod Terraform run | [V-repo] |
| `backstop.tf` (P2) | 11 EventBridge Scheduler schedules (1 RDS stop, 10 ECS desired count 0), role `munaxa-nonprod-session-backstop`, flexible window OFF, retries 3 within 3600 s, no DLQ | `cron(0 21 * * ? *)` UTC once the separate apply sets it | GitHub | [V-repo] |
| Bootstrap boundary (P3) | nonprod `TestingBackstop` allow | live only after the second root re-apply | | [V-repo], [O] |
| RDS | restarts a stopped instance after 7 days | | | [E, AWS documented] |
| Budgets | US$50 account and Testing, notifications only | billing lag of hours to a day | | [V-repo Phase 6] |

The ALB cannot be removed by the backstop, because its ARN changes every session. That is a known gap
of about US$0.037 an hour [V-repo comment, E].

## 3. P1 review: `aws-session.yml` and `stop-database.sh`

### 3.1 Requirement checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| DB stop independent of a Terraform workflow waiting for approval | **Met.** The `database` job has its own group `aws-nonprod-database`. It needs no Terraform and no state | [V-repo lines 55 to 64] |
| No shared group blocking the DB stop | **Met.** Groups are repository-wide, and only the `session` job shares `aws-terraform-nonprod`. GitHub keeps one running and one pending entry per group by default and cancels the older pending one (`queue: single`). A cancelled pending database job is harmless, because the newer one is the same stop | [V-ext github/docs `actions-group-concurrency.md`] |
| DB stop failures visible | **Met, with a gap.** Every failure ends red. Two paths end red without an `::error::` annotation (a describe failing mid-wait, and a failing `stop-db-instance`). Patched | [L cases 17 to 19] |
| Transitional states | **Met, except `creating`.** The script waits for `starting`, `backing-up`, `modifying`, `maintenance`, `rebooting`, `renaming`, `upgrading`, `storage-optimization`, `configuring-*` and `resetting-master-credentials`. `creating` (during the G3 apply) ends red at once. Patched | [L case 22] |
| DB stopped after a failed startup or apply | **Met for failures, not for cancellation.** See F-2 | [L workflow model] |
| Job timeouts within the 1 h credentials | **Met.** `database`: 45 min. The stop script waits at most 1800 s plus one 30 s poll (about 31 min), and the deployer credentials are issued about 1 min into the job with a 1 h life (no `--duration-seconds`, and role chaining caps at 1 h). `session`: 50 min, with the CI and deployer credentials issued in the first 1 to 2 min | [V-repo], [E] |
| Fail closed | **Met.** A missing deployer, a HeadObject error other than 404, an unknown state and an AccessDenied all end red. Only "state object 404" and "DBInstanceNotFound" end green, each with a notice | [V-repo], [L] |
| Repository-level `AWS_CI_ROLE_ARN` still needed | **Yes.** Both job `if`s read `vars.AWS_CI_ROLE_ARN`. A job `if` may use only `github, needs, vars, inputs`, and environment variables become available only after the runner declares the environment, so the job `if` sees repository and organization variables only. Keep a non-empty repository variable. Inside the job, the `aws-nonprod-session` value overrides it | [V-ext github/docs `contexts.md` table and line 363] |
| `aws-nonprod-session` environment variables | `AWS_CI_ROLE_ARN = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session` and `AWS_DEPLOYER_ROLE_ARN = arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session` (bootstrap outputs `session_ci_role_arns`, `session_deployer_role_arns`). Both jobs use the same environment and both variables. I cannot read environment variables, so whether they are set is [U] [O] | [V-repo `iam_session.tf` lines 44 to 45 and 86 to 87, `outputs.tf` lines 34 to 42] |
| `env` in step `if` | Allowed (`jobs.<job_id>.steps.if` may use `env`). `SESSION` is a job-level env, so it is set | [V-ext `contexts.md`] |
| `database` on schedule events | Runs. `inputs` is empty on `schedule`, and `(inputs.session \|\| 'down') == 'down'` is true. The same expression in the job name produced "Testing down" in scheduled run 41943924455 | [V-gh job 126971301674] |

### 3.2 Findings (severity-ranked)

**F-1 (High, sequencing, no code change): the backstop is inert until the second bootstrap re-apply.**
Live bootstrap is `46dfbd9` [V-aws owner report, 5 Nov 05:15 UTC]. The PR's `TestingBackstop` statement
(P3), R7's `NeverFromADeployerSession` and P4's session SG denies exist only in `e78aa92`. A permissions
boundary limits the role whatever its own policy grants, so with the live boundary the scheduler role is
refused `rds:StopDBInstance` and `ecs:UpdateService` (implicit deny) [E, IAM evaluation logic]. There is
no DLQ and no alarm, so the only signs are Scheduler error metrics and CloudTrail entries with
`AccessDenied`. Phase 6's plan lists the second re-apply as "optional, before the first Testing session"
(`09-NEXT-EXECUTION-PLAN.md` step 9). It is mandatory for the D-4 gate, and also for R10 (P4), which the
owner requires fixed before the first session (`2026-11-05-phase7/01-RESIDUAL-RISK-DECISIONS.md`).
Order: merge #43, then the second root re-apply (P3 and P4 live), then G3, then the backstop apply, then
verification, then the first session. The backstop apply may run before the re-apply, but it can be
verified only after it.

**F-2 (Medium, defect, patched): a cancelled `up` leaves the database running.** The cleanup condition is
`always() && deployer ok && exists && (down || (up && failure()))`. When `timeout-minutes` is reached,
GitHub cancels the job. It then re-evaluates the remaining step conditions, and `failure()` is true only
when a previous step failed, which a cancelled step is not [V-ext `expressions.md` "failure",
`workflow-cancellation.md` steps 1 to 4]. A plausible trigger is `aws_acm_certificate_validation` in the
`up` apply, which waits for Cloudflare DNS for up to its provider timeout of 75 min [E, Phase 6 §4.3],
beyond the 50 min job timeout. A manual cancel of a slow `up` has the same effect. The database then runs
until the next cron or the 21:00 backstop (at most about 24 h × US$0.019 ≈ US$0.46, plus Fargate if the
apply created services) [E]. The fix is `!success()` instead of `failure()` (patch, section 9).
Model: 2 of 14 `up` scenarios leave the database running on #43, and 0 with the patch [L]. One caveat
[U]: after a cancellation the server force-terminates jobs still marked for cancellation after 5 min.
Whether a step that continues because its `if` is true is also bound by that limit is not stated. A stop
of an `available` instance takes seconds, but waiting out `starting` may be cut short.

**F-3 (Low, patched): two red paths without an annotation.** `status=$(describe)` inside the wait loop
and the bare `aws rds stop-db-instance` exit through `set -e`. The job is red and the AWS error is in the
log, but there is no `::error::` line in the run summary [L cases `describe-fails-mid-wait`,
`token-expires-mid-wait`, `stop-call-fails-race`].

**F-4 (Low, patched): `creating` is not a waited state.** A `down` (or cron) during or just after G3 finds
`creating` and ends red at once without stopping the database. The `session` job, queued behind the G3
run in `aws-terraform-nonprod`, stops it later. The red run is therefore noise, not a leak [L case
`creating-then-backing-up-then-available`, E].

**F-5 (Low, not patched): time budget of a failed `up` start.** `aws rds wait db-instance-available`
gives up after 30 min. The stop step may then wait another 1800 s, which exceeds the 50 min job timeout
(and the 1 h deployer credentials), so it is cancelled while waiting. The database becomes available and
runs until the cron or backstop. This is rare (a start that takes over 30 min) and is covered by P2 [E].

**F-6 (Low, informational): the scheduled `session` job waits behind an approval.**
`aws-terraform.yml` uses a workflow-level group `aws-terraform-nonprod`. A nonprod plan or apply run
holds it while its jobs wait for the `aws-nonprod` reviewer, up to the 30-day approval limit and across
both approval waits of an apply run [E, documented semantics]. The scheduled `down` switches job is then
`pending`, and a newer queued job (the second cron, a manual `up` or `down`) cancels and replaces it
[V-ext]. A pending `down` replaced by an `up` lets that `up` run when the group frees. That is intended,
but worth knowing. Cost while blocked: the database is stopped by the `database` job and by the backstop.
Fargate is scaled in by the backstop at 21:00. The ALB and its 2 IPv4 addresses remain at about
US$0.037 an hour, about US$0.89 a day [V-ext prices, E]. A 30-day block would cost at most about
US$27 [E]. GitHub.com now documents `concurrency.queue: max` (up to 100 pending) [V-ext
`actions-group-concurrency.md`, feature `actions-nga` on fpt]. It is recorded here as a fact only.

**F-7 (Info): `up` while the database is `stopping`.** The start step calls `start-db-instance` only for
`stopped`. For `stopping` it goes straight to the waiter, which never reaches `available` and fails after
30 min. The cleanup then stops it. The result is red and slow, but closed [E].

**F-8 (Info): race between a `down` database job and an immediate `up`.** This is known from Phase 6. The
groups are different, so the `down` database job may stop a database that the new `up` just started. The
`up` waiter then fails, and the cleanup stops it. Re-dispatch `up` [E].

**F-9 (Info, tonight): the old cron on main `7cd448d`.** Main still has `0 20 * * *` and the pre-P1 job.
Run 41943924455 (cron 4 Nov 20:00, created 5 Nov 00:47:25, lag 4 h 47 min) ended **green**, with init,
plan, start, apply and stop skipped, as Phase 6 predicted [V-gh]. That run was before the 05:15 UTC
re-apply. After the re-apply, the nonprod CI role no longer trusts `aws-nonprod-session` (Phase 6 §2.3),
so tonight's run is red at OIDC unless the two environment variables above are set [E] [O]. Nothing
exists to stop yet, so this is noise.

**F-10 (Info, outside this workstream): prod stack roles name the nonprod boundary.**
`services.tf:470`, `ops.tf`, `docs.tf` hard-code `munaxa-shared-workload-boundary`. The prod deployer may
create roles only with `munaxa-shared-workload-boundary-prod` (`OwnRolesWithOwnBoundary`). A prod apply
would be refused. The backstop is nonprod-only, so it is unaffected [V-repo].

## 4. P2 review: `backstop.tf`

| Item | Code | Assessment | Label |
| --- | --- | --- | --- |
| Gate | `environment == "nonprod" && session_backstop_schedule != ""`. Default `""`, `nonprod.tfvars` `""` | G3 unchanged. Prod never gets it (test `prod_never_gets_the_backstop`) | [V-repo], [L] |
| Schedule | `cron(0 21 * * ? *)`, timezone UTC, flexible window OFF | A valid 6-field Scheduler cron. 21:00 UTC is midnight at UTC+3. A session started after 21:00 runs until the next 21:00 (hard end) | [V-repo], [E] |
| Targets | `arn:aws:scheduler:::aws-sdk:rds:stopDBInstance`, `arn:aws:scheduler:::aws-sdk:ecs:updateService` | Same format the CDK builds (`arn:${Partition}:scheduler:::aws-sdk:${service}:${action}`, service lowercase, action camelCase) | [V-ext CDK `universal.ts` line 95, README] |
| Input shape | `{"DbInstanceIdentifier": "munaxa-nonprod-pg"}`, `{"Cluster": "munaxa-nonprod", "Service": "<name>", "DesiredCount": 0}` | PascalCase SDK member names, as in the CDK's own universal example `DbClusterIdentifier`. The AWS user guide page could not be fetched, so the exact key casing is [U]. Section 7 shows how the first 21:00 run proves it | [V-ext CDK README], [U] |
| Service names | 10, equal to the `name` of every module with `create_service = local.running` (control-migrate is run-only) | Complete and correct | [V-repo services.tf, docs.tf] |
| Role trust | `scheduler.amazonaws.com`, `aws:SourceAccount = 229251310592` | Correct. No `aws:SourceArn`. For Scheduler that key is the schedule group ARN (`schedule-group/default`), which other schedules in the account share, so it would add little. The real control is `iam:PassRole`: only principals allowed to pass `munaxa-nonprod-*` roles to Scheduler (the nonprod deployer) can attach this role | [V-repo], [E] |
| Role permissions | `rds:StopDBInstance` on `aws_db_instance.main.arn`. `ecs:UpdateService` on `service/munaxa-nonprod/*` with `ArnEquals ecs:cluster = cluster ARN` | Least privilege. `ecs:cluster` is a valid condition key for UpdateService on the `service` resource. `StopDBInstance` also lists the `snapshot` resource (the optional `DBSnapshotIdentifier`); the input sets none, and a snapshot request would be denied | [V-ext servicereference ecs.json, rds.json] |
| Boundary | nonprod `munaxa-shared-workload-boundary` | Matches the nonprod boundary name. Effective rights need P3 live (F-1). The boundary's `NeverFromADeployerSession` deny does not apply, because Scheduler sets no source identity | [V-repo], [E] |
| Retries, event age | 3 retries, 3600 s | Allowed ranges 0 to 185 and 60 to 86400 | [V-ext Terraform docs] |
| Retries on 4xx | `InvalidDBInstanceState` and `ServiceNotFoundException` | Whether Scheduler retries these is [U]. Worst case 4 attempts per target per night: 44 invocations, still free | [U], [E] |
| No DLQ | | A failure is visible only in CloudWatch `AWS/Scheduler` metrics and CloudTrail. There is no alarm | [E] |
| Deletes nothing | StopDBInstance without a snapshot, desired count 0. No delete, no ALB, no DNS, no Cloudflare | Confirmed from code | [V-repo] |
| Production | nothing (no prod schedule, no prod ARN in the policy, prod boundary has no grant) | Confirmed | [V-repo], [L] |
| Drift | A scaled-in service shows `desired_count 0 -> 1` in the next `up` (an `aws_ecs_service` update, which the filter allows). `down` deletes services anyway. Schedules carry no tags | As designed | [V-repo] |
| Session refresh | The session deployer reads the new resources through `scheduler:GetSchedule` (deployer_read) and `RefreshOwnRoles` (`iam:GetRole`, `GetRolePolicy` on `munaxa-nonprod-*`). Both are live at `46dfbd9` | Session plans keep working after the backstop apply | [V-repo iam_allow.tf line 79, iam_session.tf lines 264 to 268] |
| Deployer can create it | `OwnNames` `scheduler:*` on `schedule/*/munaxa-nonprod-*`, `OwnRolesWithOwnBoundary`, PassRole to `scheduler.amazonaws.com`. Unchanged between `46dfbd9` and `e78aa92` | The separate apply can run on the live bootstrap | [V-repo] |

## 5. Terraform evidence (local, mocked provider)

Terraform 1.16.5 and aws provider 6.67.0 from the lead's verified mirror. My copy of the lead harness is
`/tmp/claude-0/phase7/a3/g3mock/aws` (the lead's copy was not modified; `diff -r` against `e78aa92`
`infra/aws` shows no difference outside `tests/`).

| Run | Result | Label |
| --- | --- | --- |
| `infra/aws/bootstrap` `terraform test` | 12 passed, 0 failed | [L] |
| `infra/aws/stack` `terraform test` | 24 passed, 0 failed | [L] |
| `terraform fmt -check -recursive infra/aws` | clean | [L] |
| G3 mocked plan, `nonprod.tfvars` (backstop `""`) | **Plan: 64 to add, 0 to change, 0 to destroy.** The 64 addresses are identical to `fresh-plan-run-41977870108-addresses.txt` (`diff` empty) | [L] |
| Same, `-var session_backstop_schedule=cron(0 21 * * ? *)` | Plan: 77 to add. The difference is the 13 below | [L] |
| `tests/postg3.tftest.hcl` (mine): `apply` with backstop off, then `plan` with no changes, then `plan` with the schedule | apply pass, "No changes. Your infrastructure matches the configuration.", then **Plan: 13 to add, 0 to change, 0 to destroy**. 3 passed, 0 failed | [L] |

The 13 creates of the separate apply:

```
aws_iam_role.session_backstop[0]
aws_iam_role_policy.session_backstop[0]
aws_scheduler_schedule.scale_in["control-api"]
aws_scheduler_schedule.scale_in["control-portal"]
aws_scheduler_schedule.scale_in["docs-api"]
aws_scheduler_schedule.scale_in["docs-scanner"]
aws_scheduler_schedule.scale_in["docs-web"]
aws_scheduler_schedule.scale_in["identity"]
aws_scheduler_schedule.scale_in["school-admin"]
aws_scheduler_schedule.scale_in["school-api"]
aws_scheduler_schedule.scale_in["work-admin"]
aws_scheduler_schedule.scale_in["work-api"]
aws_scheduler_schedule.stop_database[0]
```

The mock needed ARN-shaped defaults for `aws_kms_key`, `aws_iam_role`, `aws_ecs_cluster`,
`aws_db_instance`, `aws_secretsmanager_secret`, `aws_acm_certificate`, `aws_cloudwatch_log_group` and
`aws_s3_bucket` to apply. The mocked database ARN in the policy is random, because the lead harness
overrides `aws_db_instance.main`. Stack test `the_backstop_role_can_only_stop_and_scale_in` asserts the
real form `arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg` [L].

Declared intent: `nonprod.expected-changes.backstop.json` (13 creates) passes `check-plan-intent.sh
--validate`. `--enforce` passes on a synthetic post-G3 plan JSON (64 no-op plus the 13 creates), and
refuses an extra `aws_db_instance.main` update and a missing `scale_in["docs-web"]` [L, synthetic plan
JSON, not a Terraform output].

P3, rendered from a mocked bootstrap plan [L] (`p3/boundary-nonprod.txt`, `p3/boundary-prod.txt`):

| Boundary | Sids | Backstop grant |
| --- | --- | --- |
| `munaxa-shared-workload-boundary` (nonprod) | EcrSignIn, EcrPull, Logs, OwnSecrets, OwnRdsMasterSecret, OwnRdsMasterSecretByTag, OwnKeys, OwnFileBuckets, ScheduledTasks, PassOwnRoles, ThisRegionOnly, NeverFromADeployerSession, NeverTheOtherEnvironment, NeverMunaxaDocsProduction, MunaxaDocsImagesPullOnly, **TestingBackstop** | `rds:StopDBInstance`, `ecs:UpdateService` on `arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-*` and `arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*` |
| `munaxa-shared-workload-boundary-prod` | the same 15 without TestingBackstop | none |

## 6. Test results

### 6.1 `stop-database.sh` against a fake `aws` (`test/run-cases.sh`, `test/fakebin/aws`)

`STOP_WAIT_SECONDS=2`, `STOP_POLL_SECONDS=1`. There are 22 cases: 21 state cases plus a missing argument.
On #43: **21 passed, 1 failed** (`creating`, F-4). With the patch: **22 passed, 0 failed**
(`test/stop-database-cases.txt`, `test/stop-database-cases-patched.txt`).

| Case | #43 exit | describe calls | stop calls | `::error::` | Patched |
| --- | --- | --- | --- | --- | --- |
| stopped | 0 | 1 | 0 | 0 | same |
| stopping | 0 | 1 | 0 | 0 | same |
| available | 0 | 1 | 1 | 0 | same |
| starting, starting, available | 0 | 3 | 1 | 0 | same |
| backing-up until the timeout | 1 | 3 | 0 | 1 | same |
| modifying, then available | 0 | 2 | 1 | 0 | same |
| maintenance, then stopped | 0 | 2 | 0 | 0 | same |
| storage-optimization until the timeout | 1 | 3 | 0 | 1 | same |
| not found (DBInstanceNotFound) | 0 (notice) | 1 | 0 | 0 | same |
| AccessDenied | 1 | 1 | 0 | 1 | same |
| endpoint unreachable | 1 | 1 | 0 | 1 | same |
| unknown: failed / storage-full / inaccessible-encryption-credentials / deleting / None | 1 each | 1 | 0 | 1 | same |
| describe fails mid-wait | 255 | 2 | 0 | **0** | 1, annotated |
| ExpiredToken mid-wait | 254 | 2 | 0 | **0** | 1, annotated |
| available, but StopDBInstance returns InvalidDBInstanceState | 254 | 1 | 1 | **0** | 1, annotated |
| `STOP_WAIT_SECONDS=0`, starting | 1 | 1 | 0 | 1 | same |
| creating, backing-up, available | **1 (red at once)** | 1 | 0 | 1 | 0, waited, stopped |
| no argument | 1 (usage) | | | | same |

### 6.2 Workflow scenarios (`test/workflow_model.py`, 26 scenarios)

The model reads `aws-session.yml` with PyYAML and asserts the exact `if` strings. It then applies
GitHub's rules: implicit `success()`, `always()`, `failure()` (true only after a failed step) and
cancellation [V-ext docs]. The rules are hand-coded, so this is [L] reasoning, not GitHub.

| `up` | DB at end | `down` (session job) | DB at end |
| --- | --- | --- | --- |
| fails at checkout, setup-terraform, OIDC or deployer | stopped (never started) | same failures | left to the `database` job |
| state check 403 or other | stopped (never started) | same | left to the `database` job |
| state 404 (before G3) | stopped, red | state 404 | green notice |
| init, plan or plan-filter fails | stopped (cleanup ran) | init, plan or apply fails | stopped (cleanup ran) |
| start fails (waiter) | stopped (cleanup ran; F-5 timing) | | |
| apply fails | stopped (cleanup ran) | | |
| cancelled during plan | stopped (never started) | cancelled during plan or apply | stopped (`always()`) |
| **cancelled during start** | **starting, left running** (patched: cleanup runs) | | |
| **cancelled during apply** | **available, left running** (patched: cleanup runs) | | |
| all succeed | available (the session) | all succeed | stopped |

Database job gating (by reading the expressions): it runs on `schedule` and dispatched `down`, and is
skipped on `up`, on a ref other than main, and with an empty repository `AWS_CI_ROLE_ARN`. When both
crons fire close together, or a cron fires during a manual `down`, the second one waits in
`aws-nonprod-database` and then finds `stopped` or `stopping` (green). A third cancels the pending one,
which is harmless [E].

### 6.3 Static checks (`test/static-checks.txt`)

- actionlint 1.7.7: tarball sha256 `023070a2...0757`, equal to the release `checksums.txt`.
- shellcheck 0.10.0: the binary sha256 `f35ae15a...6deb` is identical in the GitHub release tarball and
  in the PyPI wheel `shellcheck-py 0.10.0.1`. The wheel's sha256 equals the PyPI JSON digest.
- `aws-session.yml`: 1 info, SC2015 at line 159 (`[ -n "$bucket" ] && [ -n "$key" ] || {...; exit 1;}`).
  It is benign, because the `||` branch is wanted whenever either test fails. There are no expression,
  context or type errors.
- `stop-database.sh`: shellcheck default 0 findings. `-o all` gives style notes only (SC2250, SC2292).
- The same results hold with the patch. `bash -n` passes.

## 7. Failure modes of the backstop chain

| Component | Failure | Effect | Visible where | Label |
| --- | --- | --- | --- | --- |
| Scheduler | schedule not created (apply not done) | GitHub only: lag of 3 to 6 h, drops, the 60-day disable | `aws scheduler list-schedules` (owner) | [E] |
| Scheduler | input key casing wrong (`DbInstanceIdentifier`) | ValidationException every night, nothing stopped | CloudTrail `StopDBInstance` errorCode, `AWS/Scheduler` TargetErrorCount | [U] |
| Scheduler | service throttling or outage | up to 3 retries within 1 h, then dropped (no DLQ) | InvocationDroppedCount | [E] |
| IAM | P3 not live (boundary `46dfbd9`) | AccessDenied every night (F-1) | CloudTrail errorCode `AccessDenied` | [V-repo], [E] |
| IAM | trust wrong | Scheduler cannot assume: no target call | TargetErrorCount, no CloudTrail target event | [E] |
| RDS | already `stopped` or `stopping` (the usual night) | InvalidDBInstanceState, harmless. This error proves that input parsing and authorization worked | CloudTrail | [E] |
| RDS | `starting` or `backing-up` at 21:00 (7-day restart, or backup window 01:00 to 02:00 UTC is not at 21:00) | InvalidDBInstanceState, then retries within 1 h. If still not available, it runs until a GitHub `down` or the next night (≤ US$0.46) | CloudTrail | [E] |
| RDS | deleted or renamed | DBInstanceNotFound, harmless | CloudTrail | [E] |
| ECS | service missing (every night without a session) | ServiceNotFoundException × 10, harmless | CloudTrail | [E] |
| ECS | update succeeds while the ALB still runs | Fargate and task IPv4 stop. ALB plus 2 IPv4 remain (US$0.037/h) until `down` | | [E] |
| ECS | a new service name added later and not in `backstop_services` | that service is not scaled in | code review | [V-repo] |
| GitHub | cron skipped, dropped or disabled | the backstop still acts at 21:00 | run list | [V-gh lag] |
| GitHub | `session` pending behind an approval | DB stopped (database job plus backstop), Fargate 0 at 21:00, ALB remains | run list "pending" | [E] |
| GitHub | `database` job red | the backstop stops the DB at 21:00 | run list red, email to the cron editor | [E] |
| GitHub | repository `AWS_CI_ROLE_ARN` emptied | both jobs skipped (grey), the backstop still acts | run list grey | [V-ext], [E] |

## 8. Cost (eu-central-1), recalculated on `e78aa92`

Prices are from the AWS price list bulk files fetched 5 Nov 2026 [V-ext]: AWSELB (last modified 2 Nov),
AmazonVPC (3 Nov), AWSEvents (24 Sep), AmazonRDS (29 Oct), AmazonECS (19 Oct). Usage is [E]. Task sizes
are from code [V-repo]: 3.0 vCPU and 9.0 GB for 10 x86 tasks.

| Item | Price [V-ext] | Monthly or hourly cost | Notes |
| --- | --- | --- | --- |
| Scheduled invocations | first 14,000,000 a month US$0, then US$1.15 per million | 11 × 31 = 341 a month, ≤ 1,364 with all retries: **US$0.00**. Without any free tier: US$0.0016 | Free-tier assumption: the price list tier, monthly [E] |
| Backstop IAM role and policy, Scheduler metrics | no charge | US$0.00 | [E] |
| GitHub Actions minutes (2 crons, public repository) | free for public repositories | US$0.00 | [E] |
| ALB hour | US$0.027 per hour or partial hour | 0.027/h | billed per started hour |
| ALB LCU | US$0.008 per LCU-hour | ≈ 0 to 0.008/h at test traffic | [E] usage |
| Public IPv4 (in use or idle) | US$0.005 per hour | ALB 2 × 0.005 = 0.010/h. 10 tasks = 0.050/h | ALB node count [E] |
| Fargate x86 | US$0.04656 per vCPU-h, US$0.00511 per GB-h | 3 × 0.04656 + 9 × 0.00511 = **0.1857/h** | |
| RDS db.t4g.micro Single-AZ PostgreSQL | US$0.019 per hour | 0.019/h while running | |
| RDS gp3 storage, 20 GB | US$0.137 per GB-month | **US$2.74 a month, billed while stopped** | |
| RDS backup storage beyond the free allocation | US$0.103 per GB-month | ≈ 0 (≤ 20 GB) | whether the allocation holds while stopped is [U] (Phase 5) |
| Session hour, all 10 services | sum of the above | **≈ US$0.29 to 0.30/h** (0.1857 + 0.060 + 0.027 + 0 to 0.008 + 0.019), plus logs 0 to 0.03 | consistent with Phase 5's 0.29 to 0.34 |
| After 21:00 when `down` failed (backstop worked) | ALB + 2 IPv4 + LCU | **≈ US$0.037/h, ≈ US$0.89 a day** | |
| Backstop RDS target fails, ECS works | | + US$0.019/h (≤ US$0.46 a day) | |
| Backstop ECS target fails, RDS works | | + 0.1857 + 0.050 = US$0.236/h (≈ US$5.66 a day) | |
| Backstop fails entirely (for example F-1) and GitHub fails | | ≈ US$0.30/h, ≈ US$7.2 a day | [E] |
| Testing idle fixed part | Phase 5 | US$8.64 to 11.14 a month, central account total US$14.34 | [E, Phase 5 `04-COST-AND-BUDGET.md` §4 and §6] |

A forgotten session with P1 and P2 working costs at most one evening at US$0.30/h until 21:00, then about
US$0.89 a day until a `down` succeeds. From the central fixed cost of US$14.34, a full month of that is
about US$14.34 + 30 × 0.89 ≈ US$41, so one forgotten session no longer exceeds US$50 by itself. With the
backstop inert (F-1), US$50 is reached in about 5 days, as in Phase 5 [E]. **The two
US$50 budgets only send notifications.** Nothing is stopped by them, and billing data lags by hours to a
day [V-repo Phase 6 §2.4].

## 9. Proposed fix (not applied to the PR)

`/tmp/claude-0/phase7/a3/a3-P1-fix-cancelled-up-and-annotations.patch` (sha256
`59f10c04689deb6afe29b2f64afb07df65b8fb701ef8c13268285748ff9eb280`) applies cleanly to `e78aa92`
(`git apply --check`, checked in a clean detached worktree). It changes:

1. `aws-session.yml`, the cleanup step: `(env.SESSION == 'up' && failure())` becomes `(env.SESSION ==
   'up' && !success())`, so a cancelled or timed-out `up` also stops the database (F-2). `always()` stays,
   so the step is still evaluated on cancellation.
2. `stop-database.sh`: an `::error::` line and exit 1 when `stop-db-instance` fails, or when a describe
   fails while waiting (F-3). `creating` joins the waited states (F-4).

Validated [L]: stop-script cases 22 of 22 pass, the workflow model leaves the database running in 0 of 26
scenarios, actionlint reports only the same SC2015 info, and shellcheck reports nothing. The change
touches no Terraform, so G3 stays 64 and the backstop stays 13.

## 10. Files

- `/tmp/claude-0/phase7/a3/backstop-separate-apply.md`: the post-G3 procedure (not executed)
- `/tmp/claude-0/phase7/a3/nonprod.expected-changes.backstop.json`: the 13-create declaration for that PR
- `/tmp/claude-0/phase7/a3/a3-P1-fix-cancelled-up-and-annotations.patch`
- `/tmp/claude-0/phase7/a3/test/`: `run-cases.sh`, `fakebin/aws`, `stop-database-cases*.txt`,
  `workflow_model.py`, `workflow-scenarios*.txt`, `static-checks.txt`, synthetic plan JSONs and intent results
- `/tmp/claude-0/phase7/a3/g3mock/`: `g3-default.txt` (64), `g3-default-creates.txt`, `g3-backstop.txt`
  (77), `postg3.txt` (apply, no-op, 13), `backstop-13.txt`, `aws/stack/tests/postg3.tftest.hcl`
- `/tmp/claude-0/phase7/a3/p3/`: `render.txt`, `boundary-nonprod.txt`, `boundary-prod.txt`
- `/tmp/claude-0/phase7/a3/pricing/`: price list and service reference JSON, with `SHA256SUMS`
- `/tmp/claude-0/phase7/a3/docs-fetch/`: GitHub docs sources, CDK and Terraform docs used above
