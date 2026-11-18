# 03. Workflow status, risks, next decision, actions not performed

> **Status note, 18 Nov 2026.** This file was written before the D-B3/D-PIN apply. It records
> what was known up to 18 Nov 08:31 UTC. Since then:
>
> - D-B3/D-PIN was applied in run 44267788619 (file 04).
> - §3 "next owner decision" has been taken.
> - §4 "no apply" applied only until then.
> - Risk 1 happened in a different form. The first scheduled `down` after the apply, run
>   44274042137 (09:14 UTC), still failed at "Plan the switches". The cause was
>   `states:ListStateMachineVersions`, not `ValidateStateMachineDefinition`.
>
> The repository fix is PR #137 (not applied). See
> `2026-11-18-identity-post-d-b3-verification-next-gates/` files 03 and 04.

## 1. Scheduled Testing `down` ("Deployment failed", 18 Nov)

These are the `aws-session.yml` runs since the 15 Nov merges:

| Run | Scheduled | Conclusion | "Plan the switches" | Database stop |
| --- | --- | --- | --- | --- |
| 43774638948 | 15 Nov 23:24 | failure | failed | success |
| 43832834804 | 16 Nov 08:38 | failure | failed | success |
| 44003429600 | 17 Nov 02:30 | cancelled | not run (the `down` job waited for environment approval and was cancelled when the next run queued) | success (separate job, 02:30) |
| 44058453773 | 17 Nov 09:45 | cancelled | not run (same) | success (separate job) |
| 44217528747 | 18 Nov 01:39, `down` approved 08:15 | failure | failed | success: `database munaxa-nonprod-pg: stopped` (both the separate job at 01:40 and the down job's own step) |

The cause in run 44217528747 is this error:

```
Error: validating Step Functions State Machine definition: ... AccessDeniedException: User:
arn:aws:sts::229251310592:assumed-role/munaxa-shared-deployer-nonprod-session/gha-run-44217528747
is not authorized to perform: states:ValidateStateMachineDefinition ... with aws_sfn_state_machine.session_cleanup[0]
```

Here is what happens:

- The session job plans with the narrow session role `munaxa-shared-deployer-nonprod-session`, not with the full nonprod deployer.
- Because the D-B3 resources are on `main` but not yet applied, that plan includes creating the state machine.
- When the AWS provider plans a new or changed state machine, it checks the definition with `states:ValidateStateMachineDefinition`.
- D-B2 gave that permission only to the full nonprod deployer (cleanup policy, statement `ValidateDefinitions`), as designed.

So the down job fails before it changes anything. It applies nothing, and the separate database-stop step still stops the database. This is the failure predicted on 15 Nov: the scheduled `down` fails at its switch step until D-B3/D-PIN is applied.

**Owner action:** none to fix it now. It clears once D-B3/D-PIN is applied. Until then, every scheduled `down` will show as failed. Its database-stop step and the 21:00 UTC AWS backstop keep the database stopped.

## 2. Risks

1. **Session role after the D-B3 apply.**
   - Once the state machine exists and its definition is unchanged, the session plan should no longer need to validate it. It only refreshes the state machine, and D-B2 granted that through `RefreshSessionCleanup`.
   - Claude expects the first scheduled `down` after the apply to pass. This is not verified, so that run is the check.
   - If it still fails, the fix is a small bootstrap change. Allow `states:ValidateStateMachineDefinition` (no resource) for the session role, or make sure no session-run plan changes the definition. Either way it needs an owner-approved bootstrap plan and apply.
2. **Bootstrap flag.** Every later bootstrap plan or apply must pass `-var testing_session_cleanup=true`. Without it, Terraform would remove the D-B2 permissions.
3. **Plan age.** The D-B3 apply must use a fresh plan made in apply mode, under 4 hours old. Run 43868859420 shows what to expect, but it cannot be applied.
4. **After the D-B3 apply, two things become live:**
   - the daily cleanup schedule R, with its alarms and alert topic, which has no subscription until D-B5;
   - the identity-bootstrap task definition that reads `identity-operator`. That secret does not exist until C-8G, so running the bootstrap task before C-8G would fail. Neither task is authorized to run.
5. **Environment approvals.** The scheduled `down` job waits for an `aws-nonprod` approval and is cancelled if none comes before the next run, as happened twice on 17 Nov. The separate "Stop the database" job does not wait, and it succeeded in every run listed above.

## 3. Next owner decision

**D-B3/D-PIN apply.** This means a yes or no on dispatching `aws-terraform.yml` with `nonprod` and `apply` at `main` `19fa5bc`, or at a later documentation-only commit.

- The plan job must match the same 12 changes exactly, and the declaration enforces this.
- The owner then approves the apply job.
- Claude then checks a clean follow-up plan and the next scheduled `down`.

After that, the gates are:

1. D-B5: subscribe `alert@munaxa.com`;
2. the idle cleanup dry run;
3. one real 21:05 UTC cleanup run;
4. the H-20 gate;
5. then Stage E, which is still not authorized.

## 4. Actions not performed

- **D-B3/D-PIN:** no apply. The only dispatch was the plan-only run.
- **Bootstrap:** no change beyond the approved D-B2 saved plan. No new plan replaced it.
- **Services and data:**
  - no RDS start;
  - no ECS service or task;
  - no migration, Identity bootstrap or DB-admin run.
- **Secrets and credentials:**
  - no CloudFormation operator-secret stack;
  - no C-8G;
  - no secret created, read, updated or deleted;
  - no credential or password generated.
- **Alerts and cleanup:**
  - no alert subscription;
  - no cleanup state-machine execution.
- **Stage E:** none.
- **Production:** no changes.
- **Terraform flags:** no `-auto-approve` and no `-target`.
