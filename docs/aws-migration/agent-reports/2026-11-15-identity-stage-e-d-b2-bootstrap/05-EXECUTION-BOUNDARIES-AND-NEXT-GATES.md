# 05. Execution boundaries and next gates

## 1. Done and not done in this task

| Done | Not done (prohibited or not reached) |
| --- | --- |
| Repository inspection at `9752146` | Any `terraform apply`, including of a saved plan |
| Offline renders and bootstrap tests | Any AWS write, any IAM change in AWS |
| GitHub read of the session workflow runs | Any AWS read by Claude (the connector needs a new sign-in) |
| Owner CloudShell plan script and its offline tests | The real AWS plan (owner step, pending) |
| This report, on an unmerged docs PR (the instruction says merge nothing) | Workflow dispatch, RDS, ECS, migrations, bootstrap or db-admin tasks |
| | Secrets, credentials, CloudFormation, C-8G, the alert subscription, cleanup executions, Stage E, production |

## 2. Next gates, in order (each a separate owner approval)

1. **Owner runs the plan script** (file 02 §2) and pastes the log.
2. Claude reviews the real plan and brings a yes or no on `D-B2 PLAN VERIFIED — READY FOR OWNER APPROVAL`.
3. **D-B2 apply.** This is an owner-approved apply of the saved plan only, in CloudShell, followed by a clean post-apply plan with the flag.
4. **D-B3 and D-PIN.** The nonprod plan from `main` must show exactly the 12 declared changes:
   - the 8 cleanup creates;
   - the backstop policy update;
   - the probe task-definition create;
   - the L-A0 identity-bootstrap task-definition replacement;
   - the L-A0 execution-policy update.

   `check-plan-intent.sh --enforce` checks this. The apply follows only after a separate approval.
5. Subscribe `alert@munaxa.com` and confirm it.
6. Run the idle cleanup dry run.
7. One real scheduled cleanup run (21:05 UTC) must succeed.
8. H-20 `gate` must pass before any session `up`.

Stage E remains unauthorized.

## 3. Risks carried

- **The scheduled `down` will fail at its switch-plan step** until step 4 is applied. The database stop job, the 21:00 UTC AWS backstop and the stopped database are unaffected (file 01 §6).
- **Every later bootstrap plan must pass `-var testing_session_cleanup=true`.** Without it, Terraform removes these permissions. A follow-up could make this persistent, for example with a committed variable file, but that is not part of D-B2.
- **The saved plan goes stale** if the bootstrap state or the policies change before the apply. In that case the apply script refuses it, and the plan is made again.
- **AWS connector:** Claude's read-only access needs the owner to sign in to the AWS connector again. That is not needed for D-B2, because the owner's script makes the reads.
