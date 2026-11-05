# Separate post-G3 backstop apply (D-4 = Choice B): procedure, NOT executed

Prepared 5 Nov 2026 by Phase 7 Agent 3 for the lead and the owner (Tamer). Nothing in this file has been
run. It changes only Testing (nonprod), adds 13 resources, deletes nothing, and touches no ALB, DNS,
Cloudflare, secret, image or production resource.

Labels: [V-repo] repository, [L] local mocked Terraform, [E] inference, [U] unverified, [O] owner action.

## 0. Preconditions (all must hold, or stop)

| # | Precondition | Who | Check |
| --- | --- | --- | --- |
| P-0.1 | PR #43 (P1 to P4) merged to main | Lead, owner review | main contains `infra/aws/stack/backstop.tf` and `scripts/aws/stop-database.sh` |
| P-0.2 | Second root re-apply of `infra/aws/bootstrap` at the merged commit, so that P3 (`TestingBackstop`) and P4 are live. It needs its own approval and its own expected change list | Owner (root, CloudShell) [O] | See section 4, step V-1. **Without it the backstop is created but refused at runtime** (AccessDenied) |
| P-0.3 | G3 applied (64 creates) and its post-apply plan shows no changes | Owner approvals, lead | G3 run report |
| P-0.4 | `aws-nonprod-session` has `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` set to the session roles, and the repository-level `AWS_CI_ROLE_ARN` is still non-empty | Owner [O] | GitHub settings |
| P-0.5 | No Testing session is up. Only the G3 persistent layer exists | Lead | the last `aws-session.yml` run is `down` and green |

P-0.2 may come before or after G3. It must come before section 4 (verification). The recommended order is
merge #43, then the second bootstrap re-apply, then G3, then this apply.

## 1. The PR (one reviewed change, two files)

Branch from main after G3, for example `aws/backstop-on`. Title:
`feat(aws): Testing backstop on (D-4 = B), 13 creates`.

**`infra/aws/stack/envs/nonprod.tfvars`**: the one-line change.

```diff
-session_backstop_schedule = ""
+session_backstop_schedule = "cron(0 21 * * ? *)"
```

The comment above it may be updated to "On since <date> (separate apply after G3, D-4 = B)". That is
optional and changes no resource.

**`infra/aws/stack/envs/nonprod.expected-changes.json`**: the declaration that `aws-terraform.yml`
enforces. It replaces the G3 declaration. A ready file is
`/tmp/claude-0/phase7/a3/nonprod.expected-changes.backstop.json`:

```json
{
  "root": "stack-nonprod",
  "intent": "Testing's AWS-side shutdown backstop (owner decision D-4 = B, phase 7): session_backstop_schedule = cron(0 21 * * ? *) in envs/nonprod.tfvars. 13 creates: the scheduler role, its inline policy, the database stop schedule and 10 scale-in schedules. Nothing else changes.",
  "changes": [
    {"address": "aws_iam_role.session_backstop[0]", "actions": ["create"]},
    {"address": "aws_iam_role_policy.session_backstop[0]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"control-api\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"control-portal\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"docs-api\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"docs-scanner\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"docs-web\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"identity\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"school-admin\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"school-api\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"work-admin\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.scale_in[\"work-api\"]", "actions": ["create"]},
    {"address": "aws_scheduler_schedule.stop_database[0]", "actions": ["create"]}
  ]
}
```

PR checks: the job "Format, validate, mocked plan tests" must be green. It includes
`check-plan-intent.sh --validate` on both declarations, and the stack tests
`nonprod_has_an_aws_side_backstop`, `the_backstop_role_can_only_stop_and_scale_in`,
`an_empty_schedule_turns_the_backstop_off` and `prod_never_gets_the_backstop`. Local evidence [L]: the
declaration validates, and `--enforce` passes on a plan of 64 no-op plus these 13 creates. It refuses an
extra update or a missing schedule. A mocked G3 apply followed by this change plans
**13 to add, 0 to change, 0 to destroy** at exactly these addresses.

Review, then merge to main (standing rule: code review only, no AWS effect on merge).

## 2. Dispatch (owner approvals)

1. Actions, then **AWS Terraform**, then Run workflow on `main`: `environment = nonprod`, `action = apply`.
2. The **plan** job waits for the `aws-nonprod` reviewer (approval 1 of 2). Approve it. It plans with
   `envs/nonprod.tfvars` and runs `check-plan-intent.sh --enforce` against the merged declaration.
3. Read the job summary before the second approval. It must show:
   - plan summary: 13 creates, 0 updates, 0 deletes, 0 replacements
   - "The plan matches the declared changes exactly (13 resource action(s))."
   - commit = the merge commit of the PR in section 1
4. The **apply** job waits for the reviewer again (approval 2 of 2). Approve only if step 3 holds. It
   checks that the saved plan is from the same commit, at most 4 h old, and has the same sha256, then
   applies that saved plan only.
5. Then dispatch `environment = nonprod`, `action = plan`. It must report no changes
   (`changes=false`). Any diff is a stop condition.

Concurrency: the run holds `aws-terraform-nonprod` while it waits for approvals, so a scheduled
`aws-session.yml` `down` switches job waits behind it. The `database` job does not wait (its own group).
Approve promptly, or reject, rather than leave it waiting [E].

## 3. Stop conditions (do not approve, or stop and report)

- The plan is anything other than exactly 13 creates at the addresses above. That includes any update,
  delete or replace, and any change to `aws_db_instance.main`, the ECS cluster, a security group or the
  ALB.
- The intent check is not "matches exactly".
- The plan is for a commit other than the reviewed merge commit, or the apply job refuses the plan as
  stale or changed.
- G3 is not applied, or its post-apply plan is not clean.
- A Testing session is up, or an `aws-session.yml` run is in progress.
- Anything prod appears in the plan, or the run used `environment = prod`.
- After the apply: the follow-up plan shows changes, or any check in section 4 fails. Do not start a
  Testing session. The rollback is the reverse PR (`session_backstop_schedule = ""`, a declaration of 13
  deletes) through the same two-approval path. It deletes only these 13 resources.

## 4. Post-apply verification (read-only, owner in CloudShell) [O]

Reads only. Nothing is changed and no secret is read. The owner pastes the outputs and the lead checks
them.

V-1. The boundary is live with P3 (precondition P-0.2):

```bash
P=arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary
V=$(aws iam get-policy --policy-arn "$P" --query Policy.DefaultVersionId --output text)
aws iam get-policy-version --policy-arn "$P" --version-id "$V" --query 'PolicyVersion.Document.Statement[?Sid==`TestingBackstop`]'
aws iam get-policy-version --policy-arn "${P}-prod" --version-id "$(aws iam get-policy --policy-arn "${P}-prod" --query Policy.DefaultVersionId --output text)" --query 'PolicyVersion.Document.Statement[?Sid==`TestingBackstop`]'
```

Expected: nonprod lists one statement with `rds:StopDBInstance` and `ecs:UpdateService` on
`db:munaxa-nonprod-*` and `service/munaxa-nonprod/*`. Prod returns `[]`.

V-2. The role, its trust and its policy:

```bash
aws iam get-role --role-name munaxa-nonprod-session-backstop --query 'Role.{Path:Path,Boundary:PermissionsBoundary.PermissionsBoundaryArn,Trust:AssumeRolePolicyDocument}'
aws iam list-role-policies --role-name munaxa-nonprod-session-backstop
aws iam get-role-policy --role-name munaxa-nonprod-session-backstop --policy-name stop-testing --query PolicyDocument
aws iam list-attached-role-policies --role-name munaxa-nonprod-session-backstop
```

Expected: path `/munaxa-shared/`, boundary `munaxa-shared-workload-boundary`, trust
`scheduler.amazonaws.com` with `aws:SourceAccount = 229251310592`, one inline policy `stop-testing`
(`rds:StopDBInstance` on `arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg`, `ecs:UpdateService`
on `service/munaxa-nonprod/*` with `ecs:cluster`), and no attached policies.

V-3. The 11 schedules:

```bash
aws scheduler list-schedules --region eu-central-1 --name-prefix munaxa-nonprod-backstop --query 'Schedules[].[Name,State,GroupName]' --output table
for n in database identity control-api control-portal work-api work-admin school-api school-admin docs-api docs-web docs-scanner; do
  aws scheduler get-schedule --region eu-central-1 --name "munaxa-nonprod-backstop-$n" \
    --query '{n:Name,s:State,e:ScheduleExpression,tz:ScheduleExpressionTimezone,fw:FlexibleTimeWindow.Mode,arn:Target.Arn,in:Target.Input,r:Target.RetryPolicy,dlq:Target.DeadLetterConfig}' --output json
done
```

Expected: 11 schedules, all `ENABLED`, in group `default`, `cron(0 21 * * ? *)`, `UTC`, `OFF`, target
`arn:aws:scheduler:::aws-sdk:rds:stopDBInstance` or `...:ecs:updateService`, input as in `backstop.tf`,
retries 3, event age 3600, no DLQ.

V-4. The first 21:00 UTC firing (the next morning). This proves the runtime path that no local test can
prove: the input casing (`DbInstanceIdentifier`) and the boundary [U until then].

```bash
aws cloudtrail lookup-events --region eu-central-1 --lookup-attributes AttributeKey=EventName,AttributeValue=StopDBInstance \
  --start-time "$(date -u -d 'yesterday 20:55' +%FT%TZ)" --query 'Events[].CloudTrailEvent' --output text \
  | jq -r '[.eventTime, .userIdentity.arn, (.errorCode // "OK"), (.requestParameters.dBInstanceIdentifier // "-")] | @tsv'
aws cloudtrail lookup-events --region eu-central-1 --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateService \
  --start-time "$(date -u -d 'yesterday 20:55' +%FT%TZ)" --query 'Events[].CloudTrailEvent' --output text \
  | jq -r '[.eventTime, .userIdentity.arn, (.errorCode // "OK")] | @tsv'
aws cloudwatch get-metric-statistics --region eu-central-1 --namespace AWS/Scheduler --metric-name TargetErrorCount \
  --start-time "$(date -u -d 'yesterday 20:55' +%FT%TZ)" --end-time "$(date -u -d 'yesterday 22:05' +%FT%TZ)" --period 3600 --statistics Sum
aws rds describe-db-instances --db-instance-identifier munaxa-nonprod-pg --query 'DBInstances[0].DBInstanceStatus' --output text
```

Pass: every event's identity is `assumed-role/munaxa-nonprod-session-backstop/...`. StopDBInstance
returns `OK` (the database was running) or `InvalidDBInstanceState` (it was already stopped: input parsed
and authorized). UpdateService returns `ServiceNotFoundException` while no session exists. The database
is `stopped`.
Fail (stop, no session): `AccessDenied` (P3 not live), `ValidationException` or a missing-parameter error
(input shape), or no event at all (schedule, trust or Scheduler problem).

A stronger test (optional, owner's choice): start the database by hand at about 20:40 UTC, then confirm at
21:05 that the backstop stopped it (StopDBInstance `OK`). This costs about US$0.02 [E].

V-5. P4 is live (from the second bootstrap re-apply). The session deployer has `SessionNeverSecurityGroupRules`:

```bash
aws iam get-role-policy --role-name munaxa-shared-deployer-nonprod-session --policy-name session-deployer \
  --query 'PolicyDocument.Statement[?Sid==`SessionNeverSecurityGroupRules`].[Effect,Action]'
```

Expected: `Deny` with the 7 security-group rule actions. With V-1 to V-5 green, and the regenerated
owner simulation for the second re-apply passed, the D-4 gate "backstop and P4 verified" is met, and the
first Testing session may be dispatched.

## 5. What this apply does not do

It does not delete or change any G3 resource. It does not start or stop anything at apply time (the first
action is at the next 21:00 UTC). It does not touch the ALB (whose ARN changes every session), DNS or
Cloudflare. It creates nothing in production. It costs US$0.00 a month (about 341 invocations against 14
million free) [E from the public price list].
