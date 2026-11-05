# Independent review addendum: §9 and the §1 "Update, 16:20 UTC" note

- **Date:** 5 Nov 2026
- **Reviewer:** separate reviewer. This reviewer was not the lead and did not run the reads.
- **Reviewed:** `EVIDENCE-RECOVERY-REPORT.md` §9 and the §1 update note.
- **Scope.** The reviewer made no AWS call, ran no Terraform, wrote nothing to GitHub, and did not touch CanteenHub, Render or Supabase.
- **Inputs:**
  - the lead's raw read outputs, as relayed in the brief and treated as the evidence;
  - the `munaxa-platform` repository, branch `claude/project-thread-22wpu4`;
  - the local renders in `/tmp/claude-0/phase7/a2/supporting/rendered-744c67c/`.

## Verdict: AGREE WITH CHANGES

The overall verdict, **PARTIALLY VERIFIED**, is right:
- The reads strongly support the apply's *effect*.
- The plan text and the post-apply plan result remain lost.

Claims 4 and 5 are justified as VERIFIED. Claims 2, 6a and 6b need narrower wording. Rows 1 and 3 present lock-file inference as evidence. The B2 paragraph goes slightly too far. None of the findings below reverses a verdict.

## Findings

| # | Severity | Location | Issue | Correction |
| --- | --- | --- | --- | --- |
| R1 | Medium | §9 matrix, row 6a; §1 update ("the exact attachments") | "VERIFIED (exact sets, 6 roles)" reads as complete coverage, but parts were not read. (1) The four publisher roles (`aws_iam_role.publisher`, one per `image_repositories` key, `iam.tf` line 577) were not read. §9 does not say so, although E3 and the earlier F1 flagged them. (2) Role trust policies were not read (`GetRole`). The code sets no role permissions boundary, so that point is moot. CloudTrail does show no attach, detach, trust or inline write on any role between 05:14 and 16:12, so nothing changed them during the apply | Write: "VERIFIED for the 6 deployer, session and CI roles: exact managed and inline sets. Publisher roles and trust policies not read; CloudTrail shows no write to them in the window." In §1, write "the exact attachments of the 6 roles read" |
| R2 | Medium | §9 matrix, row 2 | "VERIFIED" stands for an effect that has been reconstructed, not for the result itself. The evidence is strong: exactly 4 `CreatePolicyVersion` calls and 1 `PutRolePolicy`; the same 5 `policy` diffs; 68 → 68 instances; no address, `id`, `arn` or create-date change, so no replace. Two gaps remain. (a) That the writes came from Terraform 1.16.5 with provider 6.67.0 is [E]: the events' `userAgent` was not read. (b) The `Apply complete!` line and any warnings it printed are lost | Keep the verdict, but always pair it with its qualifier: "apply effect VERIFIED (0 added, 5 changed, 0 destroyed, as API writes and as a state diff); Terraform output UNRECOVERABLE; Terraform as the caller [E] (userAgent not read)" |
| R3 | Medium | §9 matrix, rows 1 and 3, and the sentence "The three operations happened in the runbook's order" | Here the lock-file mapping is stated as fact. Only the lock table carries [E]. The facts are narrower: three locking operations at 09:52:44, 09:55:23 and 09:56:33, and only the middle one wrote state. That they were the step 6 plan, the step 7 saved-plan apply and the step 8 plan is inference. The step 8 exit code is unknown. A plan that showed changes (exit 2) would leave the same lock trace. Row 1's "the plan's effect is verified by 2 and 5" also overreaches: it verifies what was *applied*, not what the saved plan showed, nor whether its stop checks passed (`ADDRESSES-OK`, the "policy only" check, no "changed outside of Terraform") | Row 1: "Plan text UNRECOVERABLE. A locking operation at 09:52:44 without a state write is consistent with the step 6 plan [E]." Row 3: "Result UNRECOVERABLE. A locking operation without a state write at 09:56:33 is consistent with step 8 [E]; its exit code is unknown." Label the order sentence [E] |
| R4 | Medium | §9 (not covered) | The stage 1 gate was evidently skipped, and §9 does not say so. Runbook `phase7/08` line 102: "Paste the output to the lead" before applying. The lock timeline puts the apply about 2.5 minutes after the plan. E11 found nothing posted between 09:30 and 10:15 except E1 and E2. So, on the evidence, nobody but the owner saw the plan before the apply. This is a process deviation, not a defect in the result | Add one line: "The plan was not reviewed by the lead before the apply (runbook stage 1 gate) [E, from the lock timeline and E11]." |
| R5 | Medium | §9 O-1, "Other attribute differences" [E: refresh-only] | **The explanation is sound, but it can be tightened.** The repository supports it directly. At the first re-apply, `aws_iam_role_policy.deployer["nonprod"/"prod"]` was modified (`2026-11-05-bootstrap-reapply/evidence/run1-cloudshell-apply-and-simulation.txt` lines 35 to 45). So serial 3 kept the role's computed `inline_policy` as it was read *before* that modification, and serial 4 holds the refreshed text. The same holds for `attachment_count` and `managed_policy_arns`: the attachments were created after the policies and roles in that same apply. The `tags` null → `{}` change appears only on objects created at 05:12:52; `workload_boundary["nonprod"]`, which exists since 31 Oct, shows `policy` only. That pattern fits creation-time values. **Not checked:** that serial 4's role `inline_policy` "deployer" text equals serial 4's `aws_iam_role_policy.deployer` `policy`. The state versions already read would show this offline. Also, the raw diff gives "tags" without values on `deployer_read`, `workload_boundary["prod"]` and `ci_session`, so the "null → `{}`" summary is generalised | Cite the run 1 evidence. State that the role-inline equality was not checked, or check it on the next approved read. Write "tags (null → `{}` where shown)". The phrase "No other configuration attribute changed" stays [E] for the role computed fields. CloudTrail independently corroborates it, since no write other than the five happened |
| R6 | Low-Medium | §9 "What this does not change", B2 | **What holds:** "The cause is not a policy-content difference" holds only between live and render. The render's `NoLogOrDatabaseData` is `Deny` on `logs:GetLogEvents` with `Resource "*"` and no condition, so as written it should deny `/aws/other`. The diagnostic ran at about 11:25, and CloudTrail shows no IAM write from 10:15 to 16:12, so the documents read at 16:1x are the ones that diagnostic saw. The report could say so. **What goes too far:** "That supports … a simulator-side explanation". The evidence equally fits a harness-side cause (how the B2 case builds its request) | Write: "This narrows B2 to the simulator or the harness, not to policy content. No hypothesis is confirmed." The B2 handling is otherwise correct: it stays UNRESOLVED, the follow-up is unrun and needs its own approval |
| R7 | Low | §9 O-3, "matched to the 17 significant digits" | A JSON float (IEEE double) carries about 15.9 significant digits, or 53 bits, not 17. The trailing digits of the returned values are artefacts of the conversion. Re-run locally: all 5 values given round to exactly the same double as the local 61-bit checksum, with absolute differences of 4 to 48, below one unit in the last place; the lengths are equal. So about 53 bits of hash plus the exact length match. Against accidental difference that is ample. The hash is not collision-resistant against a deliberate forgery (out of scope). The lead's 1e-15 relative tolerance (about ±1,100 absolute) is looser than the precision allows | Write: "matched to double precision (about 53 bits), with exact length; non-cryptographic" |
| R8 | Low | §9 O-2 coverage | Three small coverage limits. (1) The gap 05:13:03 to 05:14:00 (end of the first apply) was not queried. It does not matter for serial 3 → 4. (2) The connector's own scripts after 16:12 are outside the queried window. "Nothing was created, changed or deleted" rests on the script content, not on CloudTrail. (3) "SubscribeToURP … (the owner's console sign-in)" attributes a `signup.amazonaws.com` event to the sign-in: that is [E] | Label (3) [E]. Note (2) |
| R9 | Low | §9 "Calls made" | `s3:GetObject` on an SSE-KMS object implies `kms:Decrypt`; it is not listed. The step 8 check (the new state version is `aws:kms` with the state key) was not reported, although the GetObject response would carry it | List `kms:Decrypt` (implicit). Report the SSE fields, or mark them not checked |
| R10 | Low | §9 / §6 | §9 does not mention the still-pending passive check: the next scheduled `aws-session.yml` run must assume both session roles without AccessDenied (runbook line 132). §9 changes nothing about the trust path | One line: still pending |

## What the reviewer confirmed

**Comparison basis:**
- `git rev-parse 744c67c:infra/aws/bootstrap` and `6b8997a:infra/aws/bootstrap` both give `b83d107719c5bfc4e2891cc15ab121509aae84aa`.
- `git diff --quiet 744c67c 6b8997a -- infra/aws/bootstrap` reports them identical. The only commit in between is `6b8997a`, the squash merge.
- So the `744c67c` render is the correct comparison for `6b8997a`. This matches runbook line 13.

**Runbook `phase7/08`:**
- Expected plan `0 to add, 5 to change, 0 to destroy`, `policy` only (line 18).
- The five addresses: lines 25 to 29 and 84 to 88.
- Baseline 68, "49 + 19" (line 72).
- Step order: plan (6), saved-plan apply (7), post plan (8), simulation (9).
- The §9 lock mapping follows this order.

**The 5 API writes against the 5 planned updates:**
- 4 `CreatePolicyVersion` calls map to `deployer_allow` ×2 and `workload_boundary` ×2.
- 1 `PutRolePolicy` (`session-deployer` on `munaxa-shared-deployer-nonprod-session`) maps to `aws_iam_role_policy.deployer_session["nonprod"]`.
- No `DeletePolicyVersion`; the version counts (v2, v3) are under the limit of 5.

**Attachment expectations against the code:**
- **Deployers** (`deployer_allow`, `deployer_allow_tagged`, `deployer_read` attachments): `-allow`, `-allow-tagged` and `-read`, plus inline `deployer`.
- **Session deployer:** `deployer_read` (via `deployer_session_read`), `-session-read` (via `deployer_session_refresh`), and inline `session-deployer`.
- **CI roles:** inline policies only.
- The live sets reported match the code.
- `attachment_count` on `deployer_read` going 0 → 3 equals 2 deployers plus the session deployer.

**Fingerprints, re-run locally** with the same canonicalisation (`sort_keys`, compact) and the same polynomial:

| Document | Length (local and live) | Local checksum | Live (double) |
| --- | --- | --- | --- |
| `allow_nonprod` | 5701 | 1141660568453501741 | equal as a double |
| `allow_prod` | 5634 | 642046613624122074 | equal as a double |
| `boundary_nonprod` | 3000 | 298452774340489536 | equal as a double |
| `boundary_prod` | 2743 | 899796571856827352 | equal as a double |
| `session_inline_nonprod` | 9468 | 907610254812451157 | equal as a double |

The other 9 live values were not supplied to this reviewer and are **not independently confirmed**.

**Refresh-only explanation.** Run 1 evidence shows that `aws_iam_role_policy.deployer` was modified at the first re-apply. That supports the reading that serial 3 held a stale role-level `inline_policy` (R5).

**Claim verdicts:**
- **Claim 4** (serial 3 → 4, same lineage, no intermediate state version) is justified as VERIFIED.
- **Claim 5** (68 → 68 managed, no address added or removed, no replace) is justified as VERIFIED.
- **Claims 2, 6a and 6b** are justified with the R1, R2 and R7 wording.

**Overall: PARTIALLY VERIFIED is the right verdict.**
