# Nonprod readiness: ACM validation, shutdown backstop, product-testing prerequisites

- **Date:** 6 Nov 2026, 17:00 UTC onward. **Author:** the lead of the thread "Prepare nonprod for product testing".
- **Brief:** the owner's "Munaxa AWS — Next Non-Production Readiness Phase" (6 Nov, 17:00 UTC).
- **Starting point:** G3 recovery report [`../2026-11-06-g3-recovery-execution/`](../2026-11-06-g3-recovery-execution/) (platform #60, `21116f9`).
- **AWS access:**
  - The AWS connector's sign-in had expired, so the lead made **no AWS call**.
  - The owner ran every AWS read as root in CloudShell, from a script pinned by commit and sha256 (`supporting/`). Those reads were read only.
  - The plan and apply ran in GitHub Actions as the nonprod deployer, `munaxa-shared-deployer-nonprod`, with the owner's approval in `aws-nonprod`.
  - No root credential was used for any write.
- **Labels:**
  - **[V]** verified from an AWS read or a job log (source given);
  - **[E]** inferred;
  - **[O]** owner action;
  - **[P]** pending at the time of writing.

## 1. Executive summary and verdict

# NOT READY FOR PRODUCT TESTING

This phase delivered its own scope:

- **The ACM certificate is ISSUED** (17:50:36 UTC, valid to 22 May 2027), after the owner added the two DNS-only validation CNAMEs in Cloudflare. No conflict existed (§3) [V 21:21].
- **The shutdown backstop is deployed.** It is the 13 nonprod creates, planned at exactly 13/0/0/0 against an exact intent check in run 42261528996, and applied at 17:45:34 UTC [V]. The post-apply plan is clean (run 42265993972) [V].
- **The backstop's first run is verified** for the no-session case. At 21:00 UTC Scheduler assumed the role and made all 11 calls with the expected parameters; none was denied (§9) [V, CloudTrail]. A stop of an *available* database or a *running* service has not yet happened and stays NOT VERIFIED.

Product testing still needs:

- **Product images.** There are 0 in all 11 product repositories [V].
- **Secret values.** All 10 containers have 0 versions [V].
- **The Control signing key.** It has not been created, because it only exists once a Control image is set.
- **The Cloudflare Access application.**
- **Product DNS** (per session, G6).

The full checklist is in §11. Completing this phase does not complete the project.

## 2. Initial-state verification

Owner run of `supporting/nonprod-readonly-check.sh`, pinned at `2ae4367`, sha256 `53243de1…1e11`. It ran from 17:23:24 to 17:23:58 UTC, as `arn:aws:iam::229251310592:root`, in eu-central-1. The verbatim output is in `supporting/owner-output-1723-readonly.txt`. [V]

| Fact in the brief | Read at 17:23 UTC | Same? |
|---|---|---|
| ACM certificate PENDING_VALIDATION, two records | `7cb48297-…`: PENDING_VALIDATION, created 22:46:18 on 5 Nov, `InUseBy` empty, the two records exactly as in the brief | yes |
| RDS `munaxa-nonprod-pg` stopped | `stopped`, `db.t4g.micro`, PG 16.13, private, encrypted, deletion protection on, parameter group `in-sync`. Last event: "DB instance stopped", 16:25:15 | yes |
| ECS `munaxa-nonprod` active, 0 services, 0 tasks | ACTIVE, 0 / 0 / 0 | yes |
| Scheduler has 0 schedules | 0 named `munaxa-*` (the script filters to munaxa names) | yes |
| No product images | 0 images in each of the 11 product repositories (identity, control, work, school) | yes |
| Billable session resources | no ALB, NAT gateway, EC2 instance or Elastic IP | yes |
| New observation | one network interface in the nonprod VPC, `eni-01a8dd0c4c248e423`: `available` (unattached), **no public IP**, so no charge [E]. Its origin is read by script v2 (§12) | n/a |
| Secret containers | the 10 `munaxa-nonprod/*` containers, **0 versions each** (metadata only; no value read) | n/a |
| KMS | `alias/munaxa-nonprod-data` Enabled. There is no Control licence key, because it is created only when a Control image is set (`services.tf` 283) | n/a |
| Budgets | account 6.21 of 10 USD; shared account 6.21 of 50; shared testing 0.05 of 50 | n/a |

## 3. ACM DNS validation

**Ownership** [V]:

- The repository records the zone as `munaxa.com` in Cloudflare (`munaxa-docs` `docs/operations/production-service-inputs.md` §1).
- Public DNS confirms it. The owner's DNS-over-HTTPS read at 17:37 UTC returned `munaxa.com NS` = `bristol.ns.cloudflare.com`, `rick.ns.cloudflare.com`.
- There is no Route 53 public zone; the stack has only a Cloud Map private zone.

**Conflicts** [V, same read]:

- `munaxa.com CAA`: NOERROR with no record, so any CA may issue, including Amazon.
- `test.munaxa.com`, `operator-test.munaxa.com` and both validation names: NXDOMAIN for CNAME and A. No record exists, so there is nothing to duplicate or conflict with.
- No wildcard was seen: `test.munaxa.com` itself is NXDOMAIN.

**Owner action [O].** In the Cloudflare dashboard, zone `munaxa.com` → DNS → Records → Add record, twice. Proxy status **DNS only**, TTL Auto. Keep both records permanently, because ACM renews through them.

| Type | Name (Cloudflare appends `.munaxa.com`) | Target |
|---|---|---|
| CNAME | `_03282899ed2d1640c316f06ff46b2cc7.test` | `_535bee6b5545840de86f4ee4156b5e4c.wzccmgtwzk.acm-validations.aws` |
| CNAME | `_d67e37ad6024932ab65abd1e6dad5356.operator-test` | `_77d8da377c7af0e8e77699d08b59fd02.wzccmgtwzk.acm-validations.aws` |

- **Deadline:** the request is 72 hours old at about 22:46 UTC on 8 Nov. After that the certificate fails and needs a separately approved replacement.
- **Not changed by this phase:** no DNS record, nameserver, proxy setting or Cloudflare setting.
- **Result [V, script v2, 21:21 UTC, `supporting/owner-output-2121-readonly-v2.txt`]:** the owner reported "Dns added" at 19:43 UTC. The certificate is **ISSUED**: `IssuedAt` 2026-11-06T17:50:36Z, `NotAfter` 2027-05-22T23:59:59Z, both validations `SUCCESS`, `InUseBy` empty. Public DNS returns both CNAMEs with exactly the targets above. `test.munaxa.com` and `operator-test.munaxa.com` now answer NOERROR with no record (empty non-terminals created by the validation names), not NXDOMAIN; that is expected and has no effect.

## 4. Shutdown-backstop architecture and inventory

`infra/aws/stack/backstop.tf` is unchanged in substance: only its header comment changed. Reviewed against the current code:

- **Trigger.** EventBridge Scheduler at `cron(0 21 * * ? *)` in `UTC`, with flexible window OFF, in the `default` group. There are 11 schedules, each making one universal-target call.
- **Database.** `munaxa-nonprod-backstop-database` calls `arn:aws:scheduler:::aws-sdk:rds:stopDBInstance` with input `{"DbInstanceIdentifier":"munaxa-nonprod-pg"}`.
- **Services.** `munaxa-nonprod-backstop-<service>` calls `aws-sdk:ecs:updateService` with `{"Cluster":"munaxa-nonprod","Service":"<service>","DesiredCount":0}`. This covers all 10 services nonprod can run (identity, control-api, control-portal, work-api, work-admin, school-api, school-admin, docs-api, docs-web, docs-scanner).
- **Execution role.** `munaxa-nonprod-session-backstop`, path `/munaxa-shared/`, with the nonprod workload boundary.
- **Retry.** 3 attempts within 3,600 s. No dead-letter queue, because that would need an SQS permission the deployer does not have, plus a new paid-tier resource.
- **What it does not do.** It does not delete the ALB, whose ARN changes every session; the next `down` removes it (about US$0.037 an hour until then). It is not a budget shutdown.
- **Manual path preserved.** `aws-session.yml` `down` and `scripts/aws/stop-database.sh` are unchanged.

Resource inventory (13 creates, all nonprod):

| # | Address | AWS name |
|---|---|---|
| 1 | `aws_iam_role.session_backstop[0]` | `role/munaxa-shared/munaxa-nonprod-session-backstop` |
| 2 | `aws_iam_role_policy.session_backstop[0]` | inline `stop-testing` |
| 3 | `aws_scheduler_schedule.stop_database[0]` | `munaxa-nonprod-backstop-database` |
| 4 to 13 | `aws_scheduler_schedule.scale_in["<service>"]` × 10 | `munaxa-nonprod-backstop-<service>` |

**Seven-day restart.** RDS starts a database that has been stopped for 7 consecutive days. The next would be about 16:25 UTC on 13 Nov if nothing starts it before then. The daily 21:00 UTC run stops it the same evening, so it runs for at most about 24 hours. The GitHub `down` at 19:17 UTC usually stops it earlier [E]. If the restart is still in `starting` at 21:00, StopDBInstance fails (InvalidDBInstanceState, not retried) and the next evening's run stops it.

## 5. Terraform plan and exact actions

| Step | Evidence |
|---|---|
| Local `terraform fmt -check`, `validate` (bootstrap, stack), Terraform 1.16.5 and AWS provider 6.67.0 (sha256-verified from releases.hashicorp.com) | clean [V, local] |
| Mocked full plan with `envs/nonprod.tfvars` (G3 harness) | 77 creates = the 64 G3 addresses (byte-identical list) + exactly the 13 declared addresses; 0 update, replace or destroy [V, local] |
| PR #61 checks (head `2ae4367`) | "Format, validate, mocked plan tests" green, including the new idempotency step; Lint/Typecheck/Test/Build, Accessibility and Façades green [V] |
| Merge | #61 squash-merged as `b2b78a40c97dc80a9f3acf7cabb46b0cbf5b1af6`, 17:25 UTC, under the standing merge rule. Merging applies nothing |
| Real plan, [run 42261528996](https://github.com/munaxa/munaxa-platform/actions/runs/42261528996), job "Plan nonprod (apply)", 17:36:59 to 17:37:20 | **`Plan: 13 to add, 0 to change, 0 to replace, 0 to destroy.`** "No resource is updated or replaced." `check-plan-intent.sh --enforce`: "The plan matches the declared changes exactly (13 resource action(s))." [V, job log] |
| Saved plan | stored at `s3://munaxa-shared-tfstate-229251310592/nonprod/plans/42261528996.tfplan`, sha256 `caec681225ac748c066221210645a7e37c0d30ba095ecfaf5ad29f40f049f88a` [V, apply job log] |

The 13 planned addresses are exactly §4's inventory:

- no production address, no address outside the nonprod stack state;
- no DNS, Cloudflare, ALB, NAT, ECS service or database change;
- no destroy and no replacement.

The pre-apply conditions of brief §7 (plan saved, counts, resource and permission list, nonprod-only, no destroy or replace, no prod, no DNS) were all met before the owner approved the apply.

## 6. IAM permission and trust review

| Item | Value | Least privilege |
|---|---|---|
| Trust | `scheduler.amazonaws.com`, `sts:AssumeRole`, `StringEquals aws:SourceAccount = 229251310592` | only Scheduler of this account |
| Inline policy `stop-testing` | `rds:StopDBInstance` on `arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg`; `ecs:UpdateService` on `service/munaxa-nonprod/*` with `ArnEquals ecs:cluster = cluster/munaxa-nonprod` | 2 actions, 1 database, 1 cluster |
| Boundary | `munaxa-shared-workload-boundary` (nonprod). Its `TestingBackstop` statement allows exactly those 2 actions on `db:munaxa-nonprod-*` and `service/munaxa-nonprod/*`. It also denies anything tagged `Environment = prod` and any use from a deployer session | cannot exceed nonprod |
| What the deployer needed | `scheduler:*` on `schedule/*/munaxa-nonprod-*` (OwnNames); `iam:CreateRole` with the nonprod boundary (OwnRolesWithOwnBoundary); `iam:PutRolePolicy`, `iam:TagRole` (ManageOwnRoles); `iam:PassRole` to `scheduler.amazonaws.com` (PassOwnRoles) | **no bootstrap or IAM guardrail change was needed or made** |
| Refresh by the session deployer | `scheduler:GetSchedule` (deployer_read); `iam:GetRole*` on its own roles (RefreshOwnRoles) | session plans can read the new resources |
| Prod | the prod deployer is denied `role/munaxa-shared/munaxa-nonprod-*` (NeverTheOtherEnvironmentByName). The prod boundary has no `TestingBackstop`, and `backstop.tf` creates nothing when `environment = prod` (test `prod_never_gets_the_backstop`) | untouched |

Provider behaviour, checked in the 6.67.0 source (`internal/service/scheduler/schedule.go`):

- CreateSchedule is retried for up to 2 minutes on Scheduler's "execution role … must allow … to assume" ValidationException, which covers IAM propagation.
- `schedule_expression_timezone` defaults to `UTC`.
- `input` is compared as a plain string.

## 7. Tests and failure scenarios

**New stack test `the_backstop_schedules_fit_what_scheduler_accepts`.** Stack tests: 25/25 [V, local and CI]. It guards, offline, the defect classes the G3 recovery exposed:

- names at most 64 characters of `[0-9a-zA-Z-_.]`, inside the deployer's `munaxa-nonprod-*` allow;
- descriptions at most 512 characters, with no em dash or apostrophe (the EC2 description failure);
- `cron(0 21 * * ? *)`, `UTC`, never disabled, window OFF;
- retry inside the documented RetryPolicy ranges;
- the **exact** target input keys;
- the trust policy;
- every nonprod service covered.

**New `scripts/aws/stop-database.test.sh`.** 10/10 [V, local; CI step "The database stop script is idempotent"]. It covers the manual `down` path:

- already stopped; stopping; absent;
- available (one stop); auto-restart `starting` then available (one stop); still starting after the wait (red);
- describe denied (red); stop refused (red); unknown state (red);
- a second run (no-op).

**Backstop idempotency, by API semantics** [E from AWS documentation; proven by the first run, §9]:

| Situation at 21:00 UTC | Call result | Effect |
|---|---|---|
| database stopped (normal) | `InvalidDBInstanceState` | none |
| database available (session left on, or auto-restart) | stop accepted | stopped |
| database `starting` (auto-restart in progress) | `InvalidDBInstanceState` | next evening |
| no services (normal) | 10 × `ServiceNotFoundException` | none |
| services running | desired count 0 | tasks drain; the ALB stays until the next `down` |
| role or policy broken | `AccessDenied` in CloudTrail | visible in §9 evidence |

**Defect class not testable offline.** Scheduler "does not validate the contents of the Input field at schedule creation time. A schedule with invalid input parameters will be created successfully but will fail on every invocation" (Scheduler DLQ documentation).

- The RDS API reference names the parameter `DBInstanceIdentifier`. The code uses `DbInstanceIdentifier`, the AWS SDK member name that SDK integrations use; the AWS pages read did not confirm which universal targets accept.
- **Resolved by the first run (R-1 closed) [V].** CloudTrail recorded `StopDBInstance` by the backstop role at 21:00:48 UTC with `requestParameters` `{"dBInstanceIdentifier":"munaxa-nonprod-pg"}` and `InvalidDBInstanceStateFault` ("Instance munaxa-nonprod-pg is not in available state."). The input was accepted and mapped, and IAM allowed the call; the fault is the expected answer for a stopped database.

**Failure visibility** [E]:

- Every call is a CloudTrail management event with its error code.
- RDS records "DB instance stopped".
- AWS/Scheduler metrics are per schedule group only, and the 10 nightly `ServiceNotFoundException` answers count as `TargetErrorCount` in `default`. **The metrics alone cannot show a failed database stop; read CloudTrail.**
- There is no alarm. An alarm or dead-letter queue would need a further IAM change (bootstrap, production-adjacent), which the brief forbids.

## 8. Deployment evidence

[Run 42261528996](https://github.com/munaxa/munaxa-platform/actions/runs/42261528996) [V, job logs]:

- **Plan job.** Approved by the owner, 17:36 UTC.
- **Apply job.** Approved by the owner. It verified the saved plan's commit (`b2b78a4`) and sha256 (`caec6812…f88a`), ran `terraform apply` of that saved plan from 17:45:08, and finished **"Applied the saved plan of commit b2b78a40c97dc80a9f3acf7cabb46b0cbf5b1af6."** at **17:45:34 UTC**, with no warning.

**Post-apply plan** ([run 42265993972](https://github.com/munaxa/munaxa-platform/actions/runs/42265993972), report only, approved by the owner, 19:43:12 to 19:43:28 UTC) [V, job log]:

- **`Plan: 0 to add, 0 to change, 0 to replace, 0 to destroy.` "No changes."**
- The provider re-reads the 13 new resources (and the 64 G3 ones) with no drift. That is the check against the refresh defect class of the G3 recovery.
- The job's warning "The plan does not match envs/nonprod.expected-changes.json (report only)" is expected: the declaration still lists the 13 creates that are now applied.

## 9. Shutdown execution evidence

First run: 21:00 UTC on 6 Nov. The owner ran script v2 (`supporting/nonprod-readonly-check.sh` at `ede42ce`, sha256 `c2fa8ac71ab525b94dccb6ddd40322a095fb9f2ed480f127e135ad698ebf1546`, checksum "OK") from 21:21:43 to 21:22:28 UTC as root in CloudShell, read only. Output: `supporting/owner-output-2121-readonly-v2.txt`.

| # | Pass criterion | Result | |
|---|---|---|---|
| 1 | 11 schedules present, ENABLED, `cron(0 21 * * ? *)` UTC, expected targets and inputs | 11 in group `default`, all ENABLED, UTC, window OFF, retry 3600 s / 3, created 17:45:24 to 17:45:33; targets `aws-sdk:rds:stopDBInstance` and `aws-sdk:ecs:updateService` with the declared inputs | **PASS** [V] |
| 2 | `AssumeRole` of the backstop role by `scheduler.amazonaws.com` | 21:00:04 to 21:00:48 by `scheduler.amazonaws.com`, all OK; role `LastUsed` 21:00:49 | **PASS** [V] |
| 3 | `StopDBInstance` by the role with `dBInstanceIdentifier = munaxa-nonprod-pg` | 21:00:48, `{"dBInstanceIdentifier":"munaxa-nonprod-pg"}`, `InvalidDBInstanceStateFault` (already stopped) | **PASS** [V] |
| 4 | 10 `UpdateService`, `ServiceNotFoundException`, no `AccessDenied` | 10 calls 21:00:04 to 21:00:49, one per service, `{"cluster":"munaxa-nonprod","desiredCount":0,…}`, all `ServiceNotFoundException`; no `AccessDenied` | **PASS** [V] |
| 5 | Database still `stopped` | `stopped`; no new RDS event since 16:25:15 | **PASS** [V] |

- **Role as deployed** [V]: path `/munaxa-shared/`, boundary `munaxa-shared-workload-boundary`, trust `scheduler.amazonaws.com` with `aws:SourceAccount` = 229251310592, one inline policy `stop-testing` (`rds:StopDBInstance` on the one database; `ecs:UpdateService` on `service/munaxa-nonprod/*` with `ecs:cluster` equal to the nonprod cluster), no attached policy.
- **Metrics** [V]: group `default`, hour 20:21: `InvocationAttemptCount` 11, `TargetErrorCount` 11, `InvocationDroppedCount` 11, no throttling. The two faults are non-retryable, so Scheduler drops them rather than retrying; that is the expected picture when no session is running, and why CloudTrail is the evidence.
- **Not yet exercised:** a stop that actually changes state (an `available` database or a running service). The semantics are proven (input mapped, IAM allowed, correct resource), but the state change itself is **NOT VERIFIED** until a night where a session was left up or RDS auto-restarted (about 13 Nov).

## 10. Cost

| Item | Recurring cost |
|---|---|
| 11 schedules × 1 run a day ≈ 335 invocations a month | US$0 (free tier: 14 million a month) |
| IAM role and policy | US$0 |
| CloudTrail Event history, RDS events, Scheduler metrics | US$0 (no trail, alarm or dashboard added) |
| Effect on cost | caps a forgotten session at the next 21:00 UTC. A forgotten database costs at most about US$0.46 a day; Fargate tasks are scaled to 0; the ALB with its 2 IPv4 addresses stays until the next `down`, about US$0.89 a day [E, phase-5 price list] |

No NAT gateway, always-on compute, alarm, queue or other paid service was added. There is no hard budget shutdown.

## 11. Product-testing readiness checklist

| # | Item | Status | Evidence or next step |
|---|---|---|---|
| 1 | ACM certificate | **VERIFIED COMPLETE** | ISSUED 17:50:36, to 22 May 2027, both validations SUCCESS [V 21:21] (§3) |
| 2 | Shutdown backstop deployed | **VERIFIED COMPLETE** | run 42261528996, 13/0/0/0, applied 17:45:34 [V] |
| 3 | Backstop execution | **VERIFIED COMPLETE** (invocation, IAM, inputs); stop of a running database or service **NOT VERIFIED** | first run 21:00 UTC, 5/5 criteria PASS [V, CloudTrail] (§9) |
| 4 | Post-apply plan clean | **VERIFIED COMPLETE** | run 42265993972: 0/0/0/0, "No changes" [V] |
| 5 | RDS stopped, auto-restart handled | **VERIFIED COMPLETE** (state); restart handling **PARTIALLY VERIFIED** | `stopped` [V 21:21]; the nightly stop call works (§9); next auto-start about 13 Nov, stopped by the next 21:00 run |
| 6 | ECS cluster, 0 services, 0 tasks | **VERIFIED COMPLETE** | [V 17:23] |
| 7 | ECR images for Identity, Control, Work, School | **BLOCKED — ENGINEERING** | 0 in all 11 repositories [V]; each product's "Publish image" workflow and a digest PR (owner approves) |
| 8 | Cloudflare Access for `operator-test.munaxa.com` | **BLOCKED — OWNER ACTION** | not evidenced; `operator_access` unset in `nonprod.tfvars`; Terraform refuses a Control image without it |
| 9 | Signing keys (Control KMS licence key, Identity signing material) | **NOT STARTED** | Control key created only with a Control image; Identity key in its secret bundle, empty |
| 10 | Secret containers filled | **NOT STARTED** | 10 containers, 0 versions each [V] |
| 11 | Product DNS (G6: host CNAMEs to the ALB per session, DNS-H1) | **NOT STARTED** | needs an `up`; names NXDOMAIN today [V] |
| 12 | IAM or authorization blockers for a session | **NOT VERIFIED** | B2 accepted for Testing only (unchanged); session `up` with services never run against real AWS |
| 13 | Testing cost and shutdown controls | **VERIFIED COMPLETE** (budgets, manual `down`, backstop invocation) | budgets [V]; 0.05 USD testing spend; backstop §9 |
| 14 | Database migrations, smoke tests | **NOT STARTED** | out of scope (forbidden in this brief) |

**Product testing is not ready.** Items 7 to 12 must close first.

## 12. Remaining risks and next actions

1. **Done:** ACM CNAMEs added by the owner (19:43); certificate ISSUED 17:50:36 [V]. Keep both records for renewal.
2. **Done:** script v2 run at 21:21; §9 recorded.
3. **Risk R-1 (input key): closed** by the 21:00:48 CloudTrail record (§7, §9).
4. **Risk R-2: failure visibility is manual.** CloudTrail has to be read; there is no alarm. An alarm would need a bootstrap IAM change, to be decided by the owner.
5. **Risk R-3 (ENI): closed.** `eni-01a8dd0c4c248e423` is requester-managed by `amazon-rds` ("RDSNetworkInterface"), the stopped database's interface, no public IP, no charge, not ours to delete [V 21:21]. The lead deleted nothing.
6. **Risk R-4: ALB.** The ALB is not removed by the backstop. A forgotten session costs about US$0.89 a day until the next `down`.
7. **Open: state-changing stop not yet observed** (§9). Read CloudTrail after the first 21:00 UTC run that finds the database `available` (about 13 Nov at the latest).
8. **Open: GitHub scheduled `down` at 19:17 UTC** was not observed to start on 6 Nov by 21:23 (GitHub cron delay is common). The manual `down` and the 21:00 backstop are independent of it.
9. **Next phases, owner order:**
   - images (Identity → Control → Work);
   - Cloudflare Access app;
   - secret values and Identity signing material;
   - Config A and B applies;
   - first `up` with DNS (testing-readiness runbook `2026-11-05-testing-readiness/03`).

## 13. Scope statement

- **Production:**
  - No production resource exists, and none was created, changed or read.
  - No production role, schedule, workflow, IAM policy or boundary was changed.
  - No bootstrap re-apply was needed; the shared bootstrap is unchanged since the G3 recovery (`9e45133`).
- **CanteenHub:** not inspected, searched, inventoried or touched. Every read in the scripts is filtered to `munaxa` names, the nonprod VPC or the nonprod cluster.
- **Not done:**
  - no DNS, Cloudflare, nameserver or proxy change;
  - no image published; no product deployed; no migration;
  - no secret value read or written; no Terraform state content read;
  - no Render or Supabase change; no delete or cleanup;
  - no repository or organisation setting changed; no branch protection bypassed;
  - no product-testing session started; no new credential; no identity architecture change.
- **Changed:**
  - code in platform #61 (`b2b78a4`);
  - 13 nonprod AWS resources, through the reviewed apply.
