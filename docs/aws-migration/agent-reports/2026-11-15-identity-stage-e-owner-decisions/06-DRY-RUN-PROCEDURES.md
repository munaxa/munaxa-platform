# 06. Execution procedures (D-B2, D-B3, D-B4, D-B5): prepared, NONE run

Each procedure below is an AWS change or an AWS execution. Each needs the owner's explicit approval
of that step, given in the thread after the owner has seen the exact plan or output it depends on.
None of them was run in this task.

## 1. Order

| # | Step | Who | Depends on |
| --- | --- | --- | --- |
| 1 | D-B2 bootstrap plan (§3), Claude checks it | owner (root, CloudShell) | PR #130 merged (done) |
| 2 | D-B2 apply of that saved plan | owner | owner approval after step 1 |
| 3 | Merge PR #132, nonprod plan, Claude checks it (§4) | Claude, owner approves the `aws-nonprod` environment | step 2; same day as step 4 |
| 4 | D-B3 + D-PIN apply of that saved plan | owner approves the environment | owner approval after step 3 |
| 5 | D-B5 subscription (§6) | Claude (root connector), owner clicks the email | step 4, owner approval |
| 6 | D-B4 idle dry run (§5.1) | Claude (root connector) | step 4, owner approval |
| 7 | First real run of R at 21:05 UTC (automatic after step 4); Claude reads its result | read-only | step 4 |
| 8 | D-B4 active-session dry run (§5.2) | Claude, inside a session | a session `up`, which is Stage E (D-E is NO today) |

## 2. Stop rules for every step

- Any count, address or attribute other than the expected ones: **stop, do not apply**.
- Any drift ("changed outside of Terraform"): stop.
- Never `-auto-approve` on a fresh plan; only `apply` of the saved, checked plan file.
- No secret value is printed or read in any step.

## 3. D-B2 bootstrap plan and apply (root, CloudShell)

Same pattern as the reviewed 6 Nov stage B2 script
(`2026-11-06-g3-recovery-execution/supporting/stage-b2-owner-cloudshell.sh`); Claude prepares the
script for that day with the then-current pin and the owner runs it.

1. Terraform 1.16.5 downloaded and checked against its published SHA-256; clone `munaxa-platform`
   and check out `main` at the approved commit (detached, verified).
2. `cd infra/aws/bootstrap`; check the provider lock hash; `terraform init -reconfigure`; refuse any
   state-migration prompt; `terraform test` must pass (14).
3. `terraform plan -var testing_session_cleanup=true -out=<plan>`; the summary must be exactly
   `Plan: 2 to add, 2 to change, 0 to destroy.` and no drift.
4. `terraform show -json` and compare addresses and actions with exactly:
   `aws_iam_policy.deployer_session_cleanup[0] create`,
   `aws_iam_policy.deployer_session_read["nonprod"] update`,
   `aws_iam_policy.workload_boundary["nonprod"] update`,
   `aws_iam_role_policy_attachment.deployer_session_cleanup[0] create`.
   The two updates may change only the `policy` attribute; no `prod` address.
5. The owner sends the output (no secrets in it) to Claude; Claude checks the policy JSON against
   `iam_session_cleanup.tf` and reports yes/no. **Stop.**
6. After the owner's approval: `terraform apply <plan>`; expect `2 added, 2 changed, 0 destroyed`;
   then `terraform plan -var testing_session_cleanup=true -detailed-exitcode` must be 0 (no changes).

Note for every later bootstrap apply: `testing_session_cleanup` is a `-var`, so each later
bootstrap plan must pass `-var testing_session_cleanup=true` too, or it would remove these
permissions (a later plan would show it as 2 destroys and 2 updates and be stopped by the address
check). Recorded as a gate in file 09.

## 4. D-B3 and D-PIN nonprod plan and apply (PR #132)

1. Precondition: the session is down (no service, no task, DB stopped), D-B2 applied, and the owner
   approves merging #132 on a day when the apply follows. If #131 has merged first, update #132's
   declaration to 12 changes first (file 05 §3).
2. Merge #132 (squash). Dispatch `aws-terraform.yml` from `main` with `environment=nonprod`,
   `action=plan`. `check-plan-intent.sh --enforce` runs in the job and refuses any undeclared change.
3. Claude reads the plan output and checks: 9 creates, 1 update (file 04 §1 and file 05), the
   backstop policy diff is only the added `StartTheSessionCleanup` statement, the state machine
   definition names only nonprod resources, the schedule is `cron(5 21 * * ? *)` UTC with
   `{"dryRun":false}`, and the probe task definition equals the manifest. **Stop; report yes/no.**
4. After the owner's approval: `action=apply` of the saved plan, `aws-nonprod` environment approval
   by the owner. Then a post-apply plan must show no changes.

## 5. D-B4 dry runs (`{"dryRun": true}`)

State machine: `arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup`.
A dry run reports what it would do and changes nothing. Any other input fails with `BadInput`.

### 5.1 Idle path (nothing running)

1. Read-only pre-check through the connector: `DescribeStateMachine` (ACTIVE),
   `ListExecutions` (none RUNNING), ECS `ListServices`/`ListTasks` (0 desired, 0 running), RDS
   `DescribeDBInstances` (stopped), ELBv2 `DescribeLoadBalancers` names (no `munaxa-nonprod`).
2. `states:StartExecution` with name `dry-run-idle-<UTC yyyymmddThhmm>` and input
   `{"dryRun": true}` (owner-approved execution).
3. `DescribeExecution` every 10 s up to 5 minutes. Expected: `SUCCEEDED`, with a status per branch
   from the state machine's own vocabulary: secret `absent`, ALB `absent`, ECS nothing to scale or
   stop, database `stopped`. Any `error`, `unexpected-*` or `incomplete` status: stop and report.
4. `GetExecutionHistory` (event types and state names only) to confirm no `Delete*`, `UpdateService`,
   `StopTask` or `StopDBInstance` call was made.
5. Expected effects: one execution record; none on any resource. It does **not** satisfy H-20
   `gate`, which needs a real (`dryRun false`) success; that comes from R at 21:05 UTC.

### 5.2 Active-session path (only inside an authorized session)

Runs during the first session window, after `up` and before the probe. Because `up` starts ECS
services and an ALB, this step belongs to Stage E and is **not authorized** now (D-E is NO).

1. Same pre-check, expecting the session's ALB and running tasks to be present.
2. `StartExecution` name `dry-run-active-<UTC>` input `{"dryRun": true}`.
3. Expected output: ALB `would-delete` (found by name and matched as the internet-facing
   application load balancer in this VPC), ECS and database `would-stop`, secret `absent` (after
   L-A0 the one-run copy does not exist). Any `unexpected-*` or `error` status: stop.
4. Confirm nothing changed: same ALB ARN, same running task count, database still available.
5. Any `FAILED` branch, or any resource changed: stop the session through the normal `down` path and
   report.

## 6. D-B5 alarm email subscription

- Topic: `arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts` (exists only
  after step 4).
- Address: `alert@munaxa.com`, already in approved configuration (`infra/aws/bootstrap/variables.tf`
  `budget_alert_emails`, used by the applied budgets). No new address is invented.
- Why the connector: the deployer role has no `sns:Subscribe`, and Terraform does not hold the
  subscription by design (an unconfirmed email subscription cannot be managed cleanly).
- Call (root connector, owner-approved): `sns:Subscribe` with `Protocol=email`,
  `Endpoint=alert@munaxa.com`, `ReturnSubscriptionArn=true`. The topic policy's `aws:SecureTransport`
  deny is satisfied because the connector calls over HTTPS.
- Owner action: click "Confirm subscription" in the email AWS sends to that address.
- Check: `ListSubscriptionsByTopic` shows one subscription with a real ARN (not
  `PendingConfirmation`).
