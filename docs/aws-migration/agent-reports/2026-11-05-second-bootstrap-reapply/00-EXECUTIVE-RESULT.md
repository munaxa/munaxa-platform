# Second bootstrap re-apply at 6b8997a: executive result

**Date:** 5 Nov 2026.
**Author:** the lead.

**Labels:**

| Label | Meaning |
| --- | --- |
| [O-ev] | owner-provided AWS evidence |
| [V-repo] | repository |
| [V-doc] | AWS documentation |
| [L] | local analysis |
| [E] | inference |
| [U] | unverified |
| [O] | owner action |

## Verdict

**`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`**

**The second bootstrap re-apply is NOT VERIFIED.** Simulation revision 3 matched 477 of 481 cases.

- **A policy defect is excluded by inspection** (high confidence).
- **The leading hypothesis** is the IAM simulator's resource model for `GetLogEvents` (medium-high confidence). It is not proven by AWS evidence.
- **The independent review** (`08`) agrees with changes. It asked for this verdict until the controlled test confirms the hypothesis, and its findings were applied (below).

A confirming test result (row 9 in `07` §2) would change the verdict to `SIMULATION EXPECTATION DEFECT IDENTIFIED — OWNER REVIEW REQUIRED`.

**Not authorized, and not claimed:**
- G3 readiness;
- Testing readiness;
- the backstop apply.

## What happened

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| before 10:10 | The owner, as root in CloudShell, ran the approved second re-apply at `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` (runbook `phase7/08`) | [O-ev], owner statement. The plan and apply output was not supplied to this thread [U] |
| before 10:10 | The owner ran simulation revision 3 (481 calls). Preflight passed, so the platform#43 markers are live | [O-ev] |
| 10:10 to 10:11 | Result `477/481`, 4 unexpected mismatches, 0 API errors, 0 harness errors. All four are `logs:GetLogEvents` on log-stream ARNs, expected explicitDeny, actual implicitDeny | [O-ev], `04` |
| 10:15 onwards | Investigation, without AWS calls | `06`, `07` |

## The four mismatches in one paragraph

**The policy is correct by inspection** [V-repo + L]:
- The live deny `NoLogOrDatabaseData` (in both deployer `-allow` policies) has `Resource: "*"` and no condition. A `*` resource matches every ARN.
- For the same request, the simulator also ignored two more statements whose patterns match the ARN string:
  - the `OwnNames` `logs:*` Allow;
  - the inline `NeverTheOtherEnvironmentByName` Deny.
- The same deny produced the expected `explicitDeny` for 8 other logs actions and 4 RDS and ECS actions.

**The most likely cause** [E, medium-high]: the IAM simulator applies no statement to `GetLogEvents` on a log-stream ARN. The Service Authorization Reference names this ARN form as the action's resource type [V-doc], so the simulator's model differs from it. Run 1 showed the same symptom for an ARN outside an action's resource type (SR083.2).

**Security impact:**
- **No cross-environment access, privilege escalation, or session network or security-group change follows from any of the four** [E, high].
- **The open point:** the `GetLogEvents` part of R10, the deny on the deployer reading its own environment's log events, has **not yet been observed in an AWS evaluation**.

## What the owner is asked to decide [O]

1. **Approve and run the controlled read-only test.**
   - Script: `supporting/getlogevents-diagnostic.sh`, which makes 19 IAM simulator calls and nothing else.
   - Send the lead `summary.tsv`.
   - Also send the B-block JSON files.
   - The interpretation table in `07` §2 (10 rows, with a catch-all) was fixed before the run.
2. **On a confirming result, approve the revised acceptance criteria for simulation revision 4** (`07` §3):
   - 5 request resources change;
   - 4 log-stream canaries are added;
   - every expected value stays as it is;
   - 485 calls in total.

   Revision 4 is prepared and independently reviewed before it is run. No re-apply is needed.
3. **If the test does not confirm the hypothesis,** the verdict stays `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. If any live request shows `allowed`, it becomes a policy defect (`07` §4).

## Independent review findings and handling

| Finding | Severity | Handling |
| --- | --- | --- |
| F1: interpretation table not exhaustive | High | Fixed: `07` §2 has 10 ordered rows, including the R10 failure mode (row 8), non-reproduction, the controls and a catch-all |
| F2: verdict overclaimed | Medium | Fixed: the verdict is now `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` |
| F3: jq read top-level matches only, line only | Medium | Fixed: the script reads top-level and per-resource matches with line and column. Re-tested offline with a stub |
| F4: `MissingContextValues` dropped; JSON files not requested | Low | Fixed: new column; the owner is asked for the B JSON files |
| F5: "three statements" per case | Low | Fixed: at most two per case |
| F6: stronger run 1 precedent not cited | Low | Fixed: N70.1, N71.1 and N74.1 cited in `06` |
| F7: `-allow-tagged` left out | Low | Fixed: noted in `06` §3.2, no matching statement |
| F8: line numbers | Low | Fixed: `iam_allow.tf` 422 to 436, `iam.tf` 190 to 197 |
| F9: confidence stated three ways | Low | Fixed: policy defect excluded (high); simulator hypothesis medium-high |
| F10: two label errors | Low | Fixed: the prod log-group claim is now [E]; the `07` §4 check list is revised |
| F11, F12 | Info | Noted in `06`; F12 stays with L-1 |

The diagnostic script changed after the review. Its new sha256 is `be3cbb81aa8a6764573b19b3be1ec754f319282c0c76f9e5da9b45d6eae8d189`.

## Report map

| File | Content |
| --- | --- |
| `00-EXECUTIVE-RESULT.md` | This file |
| `04-SIMULATION-REV3.md` | Actual result and the four mismatches |
| `06-MISMATCH-ROOT-CAUSES.md` | Case-by-case diagnosis, investigation requirements 1 to 10 |
| `07-REMEDIATION-PLAN.md` | Controlled test, revision 4 proposal, fallback paths |
| `08-INDEPENDENT-REVIEW.md` | Independent reviewer findings |
| `supporting/getlogevents-diagnostic.sh` | Owner-run read-only test, not run |

Numbers 01 to 03 and 05 are reserved for the owner's re-apply plan and apply output and the post-apply checks. Those were not supplied to this thread, so the files are not created; nothing in them is claimed.

## Authorization confirmation

The lead made **no AWS call** and used no credentials.

**Not done:**
- No IAM policy, AWS resource or simulation expected value was changed.
- No Terraform plan or apply ran, and no workflow was dispatched.
- No G3 apply, no backstop apply, and no Testing session.

**Out of bounds, and not touched or inspected:**
- CanteenHub;
- Render;
- Supabase.
