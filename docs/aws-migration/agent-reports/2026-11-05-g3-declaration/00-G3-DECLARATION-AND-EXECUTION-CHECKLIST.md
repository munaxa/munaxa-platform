# G3 declaration PR and owner execution checklist

- **Date:** 5 Nov 2026, from 21:16 UTC. **Author:** the lead of this thread.
- **Scope:** documentation and one declaration-only pull request. **No AWS API call, no AWS CLI, no AWS connector, no root credentials, no Terraform plan or apply against AWS, no deployment, no image, no secret, no migration, no DNS, Cloudflare or Access change, no IAM change, no Render or Supabase change, nothing stopped or deleted.** CanteenHub was not inspected, searched or touched.
- **Based on:** `2026-11-05-g3-plan-review/` (platform #51, squash-merged as `83e760ed18fbecde38b431350f92fd12656804f5`), verdict READY FOR G3 OWNER APPROVAL, conditional on D-B.

## Status

# G3 DECLARATION PR READY FOR OWNER APPROVAL

This does not authorize G3. The declaration PR is a gate: merging it lets the `aws-terraform.yml` apply job enforce exactly these 64 creates. G3 itself still needs the owner's two approvals in `aws-nonprod`, on the **actual plan** produced at the declaration merge commit, not on the historical run 41977870108 or the mocked plan.

## 1. D-B recorded [owner decision]

Owner message in the project thread, 5 Nov 2026 21:16:18 UTC. Recorded in `2026-11-05-g3-plan-review/04-REMAINING-BLOCKERS.md` (OD-10 update row; the original row and every limitation are kept as written) and noted in `00-G3-PLAN-REVIEW.md`:

- **D-B accepted** by the owner: the second bootstrap re-apply is accepted as **PARTIALLY VERIFIED** for the **non-production Testing environment only**.
- The evidence verdict stays **PARTIALLY VERIFIED**. The acceptance is **not** evidence of a fully verified Terraform apply, and no missing evidence has been recovered (the plan text and post-apply plan output remain unrecoverable; the four publisher roles and the role trust policies remain unread; `2026-11-05-evidence-recovery/`).
- The **session-role pre-check remains mandatory**. Any AccessDenied or unexpected pre-check result is a **hard stop**.
- **B2 remains ROOT CAUSE UNRESOLVED — ACCEPTED FOR TESTING ONLY.**
- **No IAM policy change** is authorized by either acceptance.
- **Production requires a separate review and decision.**

## 2. Baseline check

| Check | Result | Evidence |
| --- | --- | --- |
| Current main | `83e760ed18fbecde38b431350f92fd12656804f5` (platform #51) | [V-repo] `git fetch origin main` at about 21:20 UTC |
| Infrastructure difference from the reviewed `0c58174a5088560f2fb28748f331ac604c84aaae` | **None.** `git diff --stat 0c58174 83e760e -- infra .github scripts` is empty; the only changes are the 11 report files of #51 under `docs/aws-migration/agent-reports/` | [V-repo] |
| Reviewed Terraform stack | Unchanged: `infra/aws/stack` tree `614a12d3e1133f142437bc6c7d136cd27ba2f90d` at `0c58174`, `6b8997a` and `83e760e` | [V-repo] |

The baseline did not change, so the review package applies as written.

## 3. Package re-check

| Item | Result |
| --- | --- |
| Draft declaration | `supporting/nonprod.expected-changes.g3-DRAFT.json`, sha256 `7653ee6abf6503b1dda09cacdcb94e19eb2395e521f702b8650b69174dacbe9f`. `check-plan-intent.sh --validate`: **"Declaration valid: root stack-nonprod, 64 declared change(s)."** Actions: 64 × `["create"]`, nothing else. Its address set equals the run 41977870108 list exactly (sorted `diff` empty) |
| Excluded resources | No address matches `aws_lb`, `aws_nat_gateway`, `aws_eip`, `aws_ecs_service`, `aws_secretsmanager_secret_version` or `prod` (grep count 0). No image (no task definition) and no secret value |
| Independent review findings R-1 to R-13 | Still applied in `00` to `04` (unchanged since #51) |
| DNS-H1 | Kept (`03` §4 and §5 step 8): update the ALB CNAMEs after **every** `up` |
| Database stop and backstop | Kept: `04` C-3 (`down` before and right after the apply), C-6 (no session before the backstop is verified) |
| Testing budget tag limitation | Kept: `02` §9 (until `Environment` is an active cost allocation tag the Testing budget reads US$0; ECS task IPv4 charges may be untagged) |

## 4. The declaration PR

- **Branch:** `claude/project-thread-fxrse6`, opened **after** this report merges (only one push branch is available to this session, so the report and the declaration cannot be open at the same time). Its link and head commit are in the project thread reply and on the PR.
- **Change:** only `infra/aws/stack/envs/nonprod.expected-changes.json`, replaced by the reviewed draft above, byte for byte.
- **Not merged by the lead.** The standing merge rule does not cover it; the owner reviews and merges it.

## 5. Owner execution checklist (not executed)

| # | Step | Expected result | Stop if |
| --- | --- | --- | --- |
| 1 | Review and merge the declaration PR | Merge commit on main changes only the declaration; record its SHA | The PR changes anything else |
| 2 | Dispatch `aws-session.yml`, `down`, on `main` | Both jobs green | |
| 3 | Check both session roles are assumed | Job "Stop the database": OIDC to `AWS_CI_ROLE_ARN`, then `sts:AssumeRole` of the deployer succeed; job "Testing down": the same, plus "Assume the deployer for the database calls" succeeds | **Any AccessDenied: STOP** |
| 4 | Check the pre-G3 notices | "no database munaxa-nonprod-pg yet: nothing to stop" and "nonprod stack not applied yet (no s3://munaxa-shared-tfstate-229251310592/nonprod/stack.tfstate): nothing to take down" | **Any error, any other ending (for example "cannot tell whether the nonprod stack exists"), or the stack reported as existing: STOP** |
| 5 | If step 3 or 4 is not as expected | Nothing else runs; report the run id to the lead | — |
| 6 | Dispatch `aws-terraform.yml` on `main` at the declaration merge commit: environment `nonprod`, action `apply` | The plan job waits for approval in `aws-nonprod`; approve it to run the plan | Head SHA is not the merge commit |
| 7 | Read the **real** plan in the plan job | `64 to add, 0 to change, 0 to destroy`; no replace; the intent check passes in `--enforce` mode; every address is one of the 64 | **Any other count, any replace, update or destroy, any address outside the 64, or an intent failure: do not approve the apply** |
| 8 | Approve the apply job (second `aws-nonprod` approval), within 4 hours of the plan | Apply succeeds | Apply errors: stop, report; do not destroy without approval (`2026-11-05-testing-readiness/03` §9) |
| 9 | Immediately dispatch `aws-session.yml`, `down` | "database munaxa-nonprod-pg: was available, stop requested" (it may first wait while the instance finishes creating) | The job fails: stop the database in the RDS console as root (reversible) |
| 10 | Verify the database is stopped | RDS console status **Stopped**, or a later `down` prints "database munaxa-nonprod-pg: stopped" | Not stopped |
| 11 | Same day, within 72 h of the apply: read `certificate_validation_records` (CloudShell `terraform output -json certificate_validation_records` or the ACM console) and add the **two** validation CNAMEs in Cloudflare as **DNS only** | Records present | 72 h passed: a new certificate needs a separately approved plan |
| 12 | Verify ACM status | Certificate **Issued** | CAA error: add an Amazon CAA record |
| 13 | Backstop: its own PR (`session_backstop_schedule = "cron(0 21 * * ? *)"`, 13-create declaration), plan, review and approved apply; verify the first 21:00 UTC run (Scheduler: no target error) | 13 created | Any other change |
| 14 | No Testing session until the backstop is verified and all first-session prerequisites are done (images, Access app, Identity keys, secrets, Config A and B; `2026-11-05-g3-plan-review/04` §5) | — | — |

## 6. Remaining blockers and hard stops

- **Hard stops:** steps 3, 4, 7 above; any production address; any apply that does not come from the plan generated at the declaration merge commit.
- **Before G3:** the owner's merge of the declaration PR and the two `aws-nonprod` approvals.
- **After G3, before the first session:** G6 validation (72 h), the backstop, image tag protection and images, the Cloudflare Access application, the Identity key pair, secret values and pins, `valkey_image` and `postgres_image` digests, the Control licence key two-step, DNS-H1 per session (`2026-11-05-g3-plan-review/04` §5).
- **Accepted for Testing only:** B2; the second re-apply as PARTIALLY VERIFIED. Both return for Production.

## 7. Confirmation

No AWS API call, Terraform plan or apply against AWS, deployment, image publication, secret write, migration, DNS or Cloudflare change, IAM change, Render or Supabase change, or CanteenHub interaction was performed. The only repository writes are this documentation PR and the declaration PR.
