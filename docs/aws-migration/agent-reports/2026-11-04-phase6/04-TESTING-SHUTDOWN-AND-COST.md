# 04 Testing shutdown and cost controls (Phase 6, Agent 5)

Date: 4 Nov 2026, written about 20:05 to 21:00 UTC. Scope: `munaxa-platform` main `b6b4a0a` (#39), which
contains #37 (`c688e9e`) and #38 (`46dfbd9`). No AWS call was made, no workflow was dispatched, nothing was
pushed. Every patch below is a file in `evidence/`, validated offline only.

Labels: [V-repo] repository evidence, [V-gh] GitHub API evidence, [E] inferred or estimated (including
documented GitHub or AWS behaviour that I could not re-read in this session, and public price lists),
[U] not yet verified, [O] owner action required. No IAM simulation has run for anything in this report.

## 1. Summary

1. The only shutdown mechanism today is the GitHub schedule `0 20 * * *` in `.github/workflows/aws-session.yml`
   (line 32) [V-repo]. It has never done anything: all 5 scheduled runs so far concluded `skipped`, and they
   started 3 h 11 min to 6 h 05 min after the cron time [V-gh]. No run has happened since #37. The first
   run that is not skipped is expected tonight, between about 23:00 and 02:00 UTC [E].
2. #37 fixed the worst cost bug, because `down` now stops the database even when its plan or apply fails
   [V-repo lines 177 to 192]. Several ways to fail open are still there. A run that fails before the deployer
   step, or at the state check, never stops the database. A database in any state other than `available`
   or `starting` is left running, and the run still ends green. The workflow-wide concurrency group
   `aws-terraform-nonprod` lets an approval wait in `aws-terraform.yml` hold the backstop for up to the
   approval timeout, and a newer queued run cancels the pending backstop. The job has no `timeout-minutes`.
3. Budgets only send notifications [V-repo `infra/aws/bootstrap/budget.tf`]. Billing data also lags, so a
   forgotten session (about US$7.30 a day [E]) reaches the Testing 80 % alert only after days.
4. Recommended minimum-cost reliable design: keep the GitHub workflow as the normal path and harden it
   (P1, US$0). Add an AWS-side backstop with EventBridge Scheduler universal targets that stops the database
   and sets every nonprod ECS service to desired count 0 at 21:00 UTC (P2 stack, P3 boundary). It costs
   US$0.00 a month [E], because it makes about 341 invocations against a free tier of 14 million. The one
   gap is the ALB, whose ARN changes every session, so a fixed schedule cannot delete it. That gap is worth
   about US$0.037 an hour [E].
5. R10 can be closed outright instead of being accepted (P4). The task groups' `from_alb` ingress rule names
   the persistent ALB security group, so it can be persistent too, because it admits nothing while no ALB
   exists. The session deployer then needs no security-group rule action at all, and P4 denies all of them.
   This also removes the L-2 hole in the session plan filter.

## 2. What the code does today

### 2.1 `aws-session.yml` (main `b6b4a0a`)

| Item | Code | Label |
| --- | --- | --- |
| Triggers | `workflow_dispatch` (`up`/`down`), `schedule: '0 20 * * *'` = `down` (lines 23 to 32, 62) | [V-repo] |
| Concurrency | workflow level, `group: aws-terraform-nonprod`, `cancel-in-progress: false` (lines 34 to 36). `aws-terraform.yml` uses `aws-terraform-${{ inputs.environment \|\| github.ref }}` at workflow level (its lines 43 to 45), which is the same group for every nonprod plan or apply dispatch | [V-repo] |
| Job gate | `if: github.ref == 'refs/heads/main' && vars.AWS_CI_ROLE_ARN != ''` (line 50) | [V-repo] |
| Environment | `aws-nonprod-session`, no reviewer by design (line 54) | [V-repo] |
| Job timeout | none, so the GitHub default of 360 min applies | [V-repo], [E] default |
| Credentials | CI role through OIDC, `role-duration-seconds: 3600` (line 79). Deployer through `aws sts assume-role` with no `--duration-seconds`, so 1 h, which is also the role-chaining maximum | [V-repo], [E] |
| State guard (#37) | HeadObject on the state key. A 404 makes `down` green with a notice and makes `up` fail. Any other error is red (lines 106 to 131) | [V-repo] |
| Plan check | Every change must have one of 9 resource types, including every `aws_vpc_security_group_ingress_rule` and `egress_rule` at any address (lines 153 to 161) | [V-repo] |
| `up` | Database start comes after the plan check (lines 164 to 171), then apply. A failed apply leaves the database running | [V-repo] |
| `down` stop (#37) | `always() && down && deployer ok && state exists` (line 180). It waits out `starting` and stops `available`. **Any other state is silently left running, and the run is green** (lines 185 to 192) | [V-repo] |

### 2.2 Stack switches

- `edge_enabled` controls the ALB, the listeners, the operator rules and `aws_acm_certificate_validation`
  (`infra/aws/stack/edge.tf` lines 67 to 180, all `count = var.edge_enabled`). The ALB security group and its
  80/443 ingress from `0.0.0.0/0` are persistent (edge.tf lines 37 to 53). The ALB's egress to tasks is
  persistent and is keyed by the services that have an image (`services.tf` lines 40 to 51). Nonprod ALB
  deletion protection is off (edge.tf line 79) [V-repo].
- `services_enabled` sets `create_service` for every module (`services.tf` line 16 and the module calls).
  Off means the ECS services are **deleted**, not scaled to 0 (`modules/service/main.tf` line 337) [V-repo].
  Today `images = {}` (`envs/nonprod.tfvars`), so no service module exists at all. A session currently
  creates only the edge [V-repo].
- `from_alb` task ingress has `count = var.routed`, and `routed = var.edge_enabled`
  (`modules/service/main.tf` lines 186 to 195, `services.tf` line 17) [V-repo]. Tasks run in public subnets
  with `assign_public_ip = true` and there is no NAT (`network.tf` lines 2 to 3, `modules/service/main.tf`
  line 348) [V-repo]. Nothing pays a NAT gateway fixed charge, but each running task holds a public IPv4
  address [E price US$0.005 an hour].
- Database: `munaxa-nonprod-pg`, `db.t4g.micro`, single-AZ, deletion protection on (`data.tf` lines 79 to
  106, `variables.tf` line 200) [V-repo]. A single-AZ instance can be stopped. RDS starts it again by itself
  after 7 days stopped [E, AWS documented].

### 2.3 Session roles (#38, code only, root re-apply pending)

- `munaxa-shared-ci-nonprod-session` is trusted only from `repo:munaxa/munaxa-platform:environment:aws-nonprod-session`
  on `refs/heads/main`. `munaxa-shared-deployer-nonprod-session` is trusted only from that CI role with
  SourceIdentity `github-actions` (`infra/aws/bootstrap/iam_session.tf` lines 14 to 90) [V-repo].
- Its policy is the nonprod deployer's state access plus guardrails (source document), plus `deployer_read`,
  `-session-read` and an inline policy. That inline policy covers `elasticloadbalancing:*` on the nonprod ALB
  ARNs, ECS service create, update and delete, Cloud Map, PassRole, `rds:Start/StopDBInstance`, and
  Authorize/RevokeSecurityGroupIngress on any group tagged munaxa/nonprod (lines 94 to 232) [V-repo]. The
  nonprod deployer's allow policies are attached only to `aws_iam_role.deployer` (`iam_allow.tf` lines 416
  to 437), not to the session role [V-repo].
- After the re-apply the nonprod CI role no longer trusts `aws-nonprod-session`. Until the owner sets
  `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` as environment variables of `aws-nonprod-session`, every
  session run fails at OIDC (Phase 5 N-3) [V-repo, E]. In that failure mode nothing, including the
  database, is stopped by GitHub.

### 2.4 Budgets (`infra/aws/bootstrap/budget.tf`, `variables.tf` lines 79 to 94)

| Budget | Limit | Filter | Notifications | Recipients |
| --- | --- | --- | --- | --- |
| `munaxa-shared-account-monthly` | US$50 | none | ACTUAL > 80 %, ACTUAL > 100 %, FORECASTED > 100 % | admin@munaxa.com, alert@munaxa.com |
| `munaxa-shared-testing-monthly` | US$50 | `TagKeyValue user:Environment$nonprod` | ACTUAL > 80 %, FORECASTED > 100 % | same |

[V-repo]. Neither budget has a budget action, so **nothing is stopped**. Billing data reaches Budgets
hours to about a day late [E]. Public IPv4 charges for tasks are not reliably attributed to resource tags,
so the Testing budget under-reads (Phase 5) [E]. The cost allocation tags were reported active in #34
[V-repo commit message].

## 3. Observed schedule lag (GitHub API)

Source: `mcp__github__actions_list list_workflow_runs aws-session.yml`, read at 2026-11-04 20:05 UTC. Raw
data: `evidence/aws-session-scheduled-runs.tsv`.

| Run | Cron due (UTC) | created_at (UTC) | Lag | Conclusion | Head |
| --- | --- | --- | --- | --- | --- |
| 41144903826 | 30 Oct 20:00 | 30 Oct 23:30:47 | 3 h 31 min | skipped | 329a8b9 |
| 41251490157 | 31 Oct 20:00 | 31 Oct 23:11:42 | 3 h 12 min | skipped | 9acc541 |
| 41362021669 | 1 Nov 20:00 | 1 Nov 23:25:18 | 3 h 25 min | skipped | 9acc541 |
| 41563819348 | 2 Nov 20:00 | 3 Nov 02:04:35 | 6 h 05 min | skipped | 9acc541 |
| 41747107325 | 3 Nov 20:00 | 4 Nov 00:28:44 | 4 h 29 min | skipped | 9acc541 |

[V-gh]. Job 126302780051 of the latest run is `skipped`, which matches the job-level `if` on
`vars.AWS_CI_ROLE_ARN` [V-gh]. The workflow has `total_count = 5`, with no `workflow_dispatch` run at all.
No cron was missed entirely: each day produced exactly one run.

**Nightly run after #37:** none yet. The 4 Nov 20:00 UTC run had not been created by 20:05 UTC, and the
observed lag puts it at about 23:00 to 02:00 UTC [V-gh, E]. I therefore cannot say whether it succeeded
[U]. Expected outcome on `b6b4a0a` [E from code]: the repository variable is now set, so the job runs
(Phase 5 run 41887322394 used it [V-gh via Phase 5]). OIDC goes to the nonprod CI role, which still trusts
`aws-nonprod-session` because #38 is not re-applied. The deployer is assumed, HeadObject returns 404 because
G3 is not applied, and the run ends **green with the notice "nonprod stack not applied yet"**. Plan, apply
and the database step are skipped. A red run would most likely mean an OIDC or trust mismatch, or a missing
environment. The lead should read the run log on 5 Nov [U].

Why the lag happens [E, GitHub documented]: scheduled runs are queued best-effort. They are delayed at high
load, especially at the start of every hour, and can be dropped. In a public repository, schedules are also
disabled after 60 days without repository activity. `munaxa-platform` is public (Phase 5 [V]).

## 4. Scenarios

### 4.1 A scheduled run is skipped or dropped

- **Skipped by the job `if`** (variable missing or emptied): the run is grey, no notification is sent, and
  nothing is stopped [V-gh history]. Cost: everything that is up stays up until a manual `down`.
- **Skipped because only environment variables are set** (Agent 6, `a6/05b-REPOSITORY-PROTECTION.md` B-8):
  a job-level `if` is evaluated before the job enters its environment. `vars.AWS_CI_ROLE_ARN` there
  therefore sees only repository and organization variables [E, GitHub documented]. If the owner sets the
  role ARNs only on `aws-nonprod-session` (Phase 5 plan step 6.2) and removes or never keeps the repository
  variable, every session run is skipped, including the P1 `database` job, which uses the same gate. Keep a
  repository-level `AWS_CI_ROLE_ARN` (any non-empty value works for the gate, and the environment value wins
  inside the job), or gate on a dedicated repository variable such as `vars.AWS_SESSIONS_ENABLED` [O].
- **Dropped or delayed by GitHub**: nothing runs that night. The next chance is 24 h later. With 3 to 6 h of
  lag, a session started just after one backstop can last about 21 to 30 h [E].
- **Schedules disabled after 60 days without activity**: the backstop stops silently [E].
- Cost of one missed night with a full session up: about 24 × US$0.31 ≈ **US$7.30** [E, Phase 5 hourly
  model]. With only the database up (after a 7-day auto-restart): 24 × US$0.019 ≈ US$0.46 [E].

### 4.2 The run is queued behind another run (concurrency)

GitHub semantics [E, documented]: per concurrency group, at most one run is in progress and one is
pending. When another run is queued, the pending run is cancelled. `cancel-in-progress: false` protects
only the running one. Groups are repository-wide, so `aws-session.yml` and `aws-terraform.yml` share
`aws-terraform-nonprod`.

| Case | Effect today | Label |
| --- | --- | --- |
| An `aws-terraform.yml` nonprod plan or apply waits for the `aws-nonprod` reviewer when the cron fires | The concurrency is workflow level, so the waiting run holds the group. The backstop stays pending until the approval or rejection, up to the environment wait timeout (30 days) | [V-repo], [E] |
| While the backstop is pending, the owner dispatches `up`, another nonprod plan, or a manual `down` | **The pending backstop is cancelled** and replaced. With `up`, the session then runs until the next night | [E] |
| Two schedules fire while blocked (only with P1, which has two crons) | The second cancels the first pending one: no loss | [E] |
| An `up` is still running when the cron fires | The `down` waits and then runs. This is correct | [E] |
| PR runs of `aws-terraform.yml` | Group `aws-terraform-refs/pull/<n>/merge`: no interference | [V-repo] |

### 4.3 A session lasts longer than one hour

- No timer ends a session. A session is a state (ALB, services and database up) that lasts until a `down`.
  The 3600 s credential limit applies only to a single job [V-repo]. A longer session simply costs about
  **US$0.31 an hour** [E, Phase 5] until the backstop actually runs (in practice 23:00 to 02:00 UTC).
- A single **job** longer than about 1 hour: the CI and deployer credentials expire after 3600 s [V-repo,
  E]. A plausible cause is `aws_acm_certificate_validation` in `up`. It is created every session with no
  `validation_record_fqdns`, it waits for Cloudflare DNS, and its provider timeout is 75 min by default [E].
  `aws rds wait db-instance-available` stops after 30 min [E]. The apply then fails mid-way, possibly leaving
  a state lock. The database was already started, and nothing stops it until the next `down` [V-repo, E].
  With no `timeout-minutes`, a hung step runs for up to 360 min [E].

### 4.4 The stop (`down`) run fails

| Failure point | Database | ALB and services | Visible? |
| --- | --- | --- | --- |
| OIDC (e.g. after the #38 re-apply, before the environment variables are set: N-3) | stays up | stay up | red |
| Deployer assume | stays up | stay up | red |
| HeadObject error other than 404 | **stays up** (the step needs `exists == 'true'`) | stay up | red |
| `terraform init` / plan / plan check / apply | stopped (#37) | stay up, every night, until the code or drift is fixed | red |
| Database in `backing-up`, `modifying`, `maintenance`, `storage-optimization`, ... | **stays up** | removed | **green** |
| `starting` for more than 30 min | wait fails | removed | red |

A red scheduled run notifies the user who last changed the cron line [E, documented]. No other alert exists.

### 4.5 Other AWS-side behaviour

- RDS starts itself after 7 days stopped [E]. Today it then runs until the next successful `down` (up to
  about 30 h with lag). That is about US$0.50 each time, or up to about US$2.50 a month (Phase 5) [E].
- ECS services stay at `desired_count` (1 each in nonprod) while they exist. A crash-looping task is still
  billed for Fargate and its IPv4 address. Terraform deletes services on `down` and waits for draining [E].
- The G3 apply creates the database **running**. Unless `down` is dispatched right after G3, it runs until
  the first successful nightly `down` (Phase 5 [R] item) [V-repo, E].

## 5. AWS-side backstop: options

| Option | What it stops | Cost a month [E] | IAM and change | Verdict |
| --- | --- | --- | --- | --- |
| A. GitHub schedule only (today) | everything, when it runs | 0 | none | not reliable (section 4) |
| B. Harden the workflow (P1) | everything; the database even while blocked | 0 | workflow PR only | do it |
| **C. EventBridge Scheduler, universal targets (P2 + P3)** | database (`rds:stopDBInstance`), tasks (`ecs:updateService` desiredCount 0 for each service) | **0.00** (11 schedules × 31 days ≈ 341 invocations; free tier 14 M a month, then US$1.00 per million) | one role `munaxa-nonprod-session-backstop` with the nonprod boundary; the boundary needs `rds:StopDBInstance` + `ecs:UpdateService` on nonprod ARNs (bootstrap root re-apply) | **do it** |
| D. C plus a Lambda that finds the ALB by tag and deletes it | also the ALB | about 0 (free tier) | Lambda code, `lambda:*` and `elasticloadbalancing:DeleteLoadBalancer` for the stack deployer and boundary, drift handling | not worth US$0.89 a day of residual |
| E. Budget action (SSM `STOP_RDS_INSTANCES` at a threshold) | database only, once a threshold is crossed | possibly charged for action-enabled budgets beyond 2 [U] | budgets execution role in bootstrap | billing lag of hours to days: not a nightly backstop |
| F. EventBridge rule on RDS event "started because stopped too long" → SSM `AWS-StopRdsInstance` | the 7-day restart only | about 0 | SSM automation role | covered by C at a fixed time |

Why C cannot delete the ALB: `DeleteLoadBalancer` needs the ALB ARN, which carries a random ID that is new
every session, and a schedule's input is fixed [E]. ECS `UpdateService` takes cluster and service names,
and `StopDBInstance` takes the identifier. Both are stable [V-repo names].

Residual with C: from the scheduler time until the next successful `down`, only the ALB (US$0.027 an hour)
and its two public IPv4 addresses (US$0.010 an hour) keep running, about **US$0.037 an hour, US$0.89 a
day** [E, eu-central-1 public prices]. Compare US$0.31 an hour today. Fargate, task IPv4 and the database
are stopped.

Interaction with Terraform [E from code]: a service at desired count 0 shows `desired_count 0 -> 1` in the
next `up` plan. That is an `aws_ecs_service` update, which the session filter allows and the session IAM
can do. `down` deletes the services regardless. A schedule that fires when nothing exists fails with
`ServiceNotFoundException` or `InvalidDBInstanceState`. Nothing changes, and the failure shows only as a
Scheduler metric. Whether Scheduler retries those client errors is [U]. The patch sets at most 3 retries
within 1 h.

Effect on sessions: 21:00 UTC (midnight at the owner's UTC+3) becomes a **hard** end for Fargate and the
database, independent of GitHub. A session started after 21:00 UTC can run until 21:00 UTC the next day.
`cron(0 21,3 * * ? *)` would cap that at 18 h, but it would also cut an early-morning session. The schedule
is a variable, so the lead or owner decides.

## 6. R10: can the session deployer modify network ingress unnecessarily?

Yes, on `46dfbd9` [V-repo `iam_session.tf` lines 112 to 179]:

- `SessionIngressOnOwnGroups` and `SessionNewRules` allow `ec2:AuthorizeSecurityGroupIngress` on **any**
  group tagged Project = munaxa and Environment = nonprod, with any CIDR and any port. The only exceptions
  are the four groups denied by Name tag (alb, database, db-admin, default-unused). IAM has no condition key
  for the rule's CIDR or source group [E, Phase 5 Agent 2]. Task groups hold public IPv4 tasks, so one call
  can open a task port to `0.0.0.0/0`. That bypasses the ALB, the operator restriction and Cloudflare
  Access.
- `RevokeSecurityGroupIngress` is not denied on the ALB or database groups. The session could remove the
  ALB's 443 rule or the database's ingress from the services. That hurts availability only.
- The session plan filter allows every `aws_vpc_security_group_ingress_rule` and `egress_rule` at any
  address (Phase 5 L-2) [V-repo lines 153 to 159].
- `elasticloadbalancing:*` on the nonprod ALB ARNs also allows `ModifyRule` and `ModifyListener`. A workflow
  on main could rewrite the operator-host rules (Control ADR-0006) [E]. Narrowing ELB actions needs a
  Terraform API call list and an IAM simulation [U]. It is left to Agent 2.

All of these need code on main that uses `aws-nonprod-session`. The real control is required approvals on
main [O]. Even so, the session never *needs* a rule write:

- Every session-time rule is a `from_alb` rule, and each one names the ALB security group as its source.
  That group is persistent [V-repo edge.tf lines 37 to 42].
- A rule that references a group admits only ENIs in that group. With no ALB, the group has no ENI, so the
  rule admits nothing [E, documented SG semantics].
- **P4** therefore makes `from_alb` persistent (new module flag `admit_alb`, set on the 9 routable modules,
  the same set as the persistent `alb_to_service` egress). It removes all three session SG allow statements,
  adds `SessionNeverSecurityGroupRules`, which denies every rule write on `*`, and drops the SG rule types
  from the session plan filter.
- G3 is unaffected, because with `images = {}` no service module exists [V-repo]. When images arrive, the
  rules are created on the reviewed `aws-terraform.yml` path.
- Phase 5 simulation S04.1/S04.2 then become `explicitDeny` instead of `implicitDeny`. A new case for
  ingress should be added (Agent 2) [O for the owner run].

## 7. Recommended design and costs

1. **P1 workflow (US$0):**
   - `down` gets a separate `database` job with its own concurrency group `aws-nonprod-database`. A pending
     or approval-blocked Terraform group can then no longer delay the database stop. The switches job keeps
     `aws-terraform-nonprod`, now at job level.
   - The database is stopped by a tested script (`scripts/aws/stop-database.sh`). It waits out every
     passing state and ends red, never green, when it cannot stop.
   - A failed `up` also stops the database.
   - Timeouts: 50 and 45 min, inside the 1 h credentials.
   - Two crons off the hour: `17 19` and `47 1`.
2. **P2 + P3 AWS-side backstop (US$0.00 a month [E]):**
   - EventBridge Scheduler at 21:00 UTC: `rds:stopDBInstance` and `ecs:updateService` desiredCount 0 for
     10 services, with role `munaxa-nonprod-session-backstop`. That role holds only those two actions, on
     the nonprod database and the nonprod cluster's services.
   - The nonprod boundary gets a `TestingBackstop` statement for those two actions on nonprod ARNs (prod
     unchanged).
   - The stack deployer can already create all of this: `OwnNames` covers `scheduler:*` on
     `schedule/*/munaxa-nonprod-*`, `OwnRolesWithOwnBoundary` and `PassOwnRoles` cover
     `scheduler.amazonaws.com`, and the session refresh can read it (`scheduler:GetSchedule`,
     `RefreshOwnRoles`) [V-repo `iam_allow.tf` lines 79, 253 to 268, 354 to 384; `iam_session.tf` lines 288
     to 292].
3. **P4 R10 closure (US$0).**
4. Owner actions [O]:
   - Re-apply bootstrap once, with #38 and P3 together.
   - Set the two `aws-nonprod-session` environment variables in the same sitting (N-3).
   - Apply P2 through `aws-terraform.yml`. Either add it to G3 (the plan goes from 64 to 77 creates: 1 role,
     1 role policy, 11 schedules, so the plan must be redone and `nonprod.expected-changes.json` updated) or
     apply it as the first change after G3.
   - Dispatch `down` right after G3.
   - Require approvals on main.
5. Optional, free [E]: add an ACTUAL notification at about 25 % (US$12.50) to the Testing budget for an
   earlier warning. Notifications on existing budgets cost nothing. It still lags by up to a day.

Estimated cost of a "forgotten session" incident, eu-central-1 [E]:

| Design | First night | Each further day |
| --- | --- | --- |
| Today | up to 30 h × 0.31 ≈ US$9.30 | US$7.30 |
| P1 only | same for Fargate and ALB, database stopped even when blocked: ≈ US$7 a day | ≈ US$7 |
| P1 + P2/P3 | until 21:00 UTC at 0.31 an hour, then ALB only: ≤ US$0.89 a day | ≤ US$0.89 until a `down` succeeds |
| RDS 7-day restart with P2 | ≤ 24 h × 0.019 ≈ US$0.46 | none |

Monthly fixed cost of the backstop: Scheduler US$0.00, IAM US$0.00, Scheduler metrics US$0.00 [E]. The
Phase 5 conclusion (US$50 holds for about 90 to 117 session hours) is unchanged, and the risk of exceeding
it through one forgotten session falls from about 5 days to over a month [E].

## 8. Patches (in `evidence/`, not applied anywhere)

All four apply cleanly to `origin/main` `b6b4a0a`, in order P1, P2, P3, P4 (`git apply`, checked in a
scratch export). The result is byte-identical to my worktree `a5/wt`.

| Patch | Files | Validation |
| --- | --- | --- |
| `P1-aws-session-workflow.patch` | `.github/workflows/aws-session.yml`, new `scripts/aws/stop-database.sh` | YAML parses (2 jobs, 2 crons). `bash -n` on every `run:` block. Stop script tested against a fake `aws` CLI in 9 states (`evidence/test/stop-database-cases.txt`). actionlint and shellcheck **not run**: downloading them was refused in this session [U] |
| `P2-stack-aws-side-backstop.patch` | new `infra/aws/stack/backstop.tf`, `variables.tf` (`session_backstop_schedule`), 3 new runs in `tests/stack.tftest.hcl` | Terraform 1.16.5, aws provider 6.67.0 (SHA256 checked against the HashiCorp SUMS) from a filesystem mirror: fmt ok, validate ok, `terraform test` **17 passed, 0 failed** (was 14) (`evidence/test/stack-terraform-test.txt`) |
| `P3-bootstrap-boundary-backstop.patch` | `infra/aws/bootstrap/iam.tf` (nonprod boundary `TestingBackstop`), 1 new run in `tests/bootstrap.tftest.hcl` | fmt, validate, `terraform test` **10 passed, 0 failed** (was 9) |
| `P4-r10-no-session-sg-rules.patch` (apply after P1) | `modules/service/{main,variables}.tf` (`admit_alb`), `stack/services.tf`, `stack/docs.tf`, `bootstrap/iam_session.tf`, bootstrap R10 test, the session plan filter | Both roots validate. Stack 17/17 and bootstrap 10/10 pass with P1 to P4 together. The filter was tested with jq on a sample plan: the old filter lets every SG rule through, and the new one refuses them all (`evidence/test/session-filter-results.txt`) |

Not covered offline [U]:

- Any live behaviour of the schedules (permissions at runtime, Scheduler retry behaviour on 4xx).
- A real session plan JSON through the new filter.
- An IAM simulation of the boundary and session changes.
- The race in which the P1 database job outlives the `down` switches job while an immediate `up` starts the
  database. The job then stops it again, so the owner would re-dispatch.

## 9. Ten-line summary

1. Today the GitHub cron `0 20 * * *` is the only shutdown, and it has never acted: 5 of 5 scheduled runs `skipped` [V-gh].
2. Scheduled runs started 3 h 12 min to 6 h 05 min late, so in practice the backstop lands at 23:00 to 02:00 UTC [V-gh].
3. No nightly run since #37 yet. Tonight's is expected green with "nonprod stack not applied yet" [E, U].
4. #37 stops the database on a failed plan or apply. It still leaves it running on an OIDC, assume or HeadObject failure, and silently in non-`available` states [V-repo].
5. The shared workflow-level group lets an approval wait block the backstop, and a newer dispatch cancels the pending backstop [E].
6. Budgets only notify, with billing lag. A forgotten session costs about US$7.30 a day [E].
7. EventBridge Scheduler universal targets (stop RDS, ECS desired count 0) give a GitHub-independent backstop at US$0.00 a month. Only the ALB, about US$0.89 a day, remains [E].
8. R10 is real on 46dfbd9: the session can open any non-ALB, non-database nonprod group to 0.0.0.0/0 on public-IP tasks [V-repo].
9. Making `from_alb` persistent removes every session SG-rule need, so all rule writes can be denied (P4). G3 is unchanged because there are no images [E].
10. Owner: re-apply bootstrap with #38 + P3, set the session environment variables at the same time, apply P2 with or right after G3, dispatch `down` after G3, and require approvals on main [O].

Proposed patches: P1 `evidence/P1-aws-session-workflow.patch`, P2 `evidence/P2-stack-aws-side-backstop.patch`,
P3 `evidence/P3-bootstrap-boundary-backstop.patch`, P4 `evidence/P4-r10-no-session-sg-rules.patch`.
