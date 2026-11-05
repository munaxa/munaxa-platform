# B2 diagnostic discrepancy and second re-apply evidence: executive result

**Date:** 5 Nov 2026.
**Author:** the lead.
**Labels:** [O-ev] owner AWS output, [O-rep] owner statement without output, [V-repo], [V-gh], [V-doc], [L] local, [E] inference, [U] unavailable.

## Verdict

**`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`**

- **The B2 diagnostic result** triggers row 8 of the interpretation table that was fixed before the run (`2026-11-05-second-bootstrap-reapply/07` §2). The confirmation criteria are not met (`01` §2).
- **The second bootstrap re-apply is NOT VERIFIED.** Its plan, its apply counts and its post-apply plan are not evidenced (`02`).
- **Not claimed:** G3 readiness and Testing readiness.

## Findings

**1. The B2 failure: why it is not explained, and what it does not mean.** B2 is GetLogEvents on the foreign group `log-group:/aws/other`. It returned implicitDeny with no matched statement.

By repository evidence, the unconditioned `NoLogOrDatabaseData` Deny on `*` should have applied. No other unconditioned statement matches that request (`01` §3, Q1).

The cause is **not established**. The owner's files (`summary.tsv` and A6, B2, B4 and B6 JSON, kept in `supporting/diagnostic-1-results/`) show B2 with the same shape and resource classification as B4, but with no matched statement. Nothing in the output explains the difference (`01` §3, Q3 and Q4).

A6 does not contradict B2, because it tested a different resource (the own group `/munaxa/nonprod/identity`) through a different API.

**2. What the diagnostic did establish [O-ev].** It is the first AWS evidence that the deny is enforced for GetLogEvents. By elimination, `NoLogOrDatabaseData` decided these cases: it is the only Deny in `-allow` that covers GetLogEvents (`01` §1). The reported columns are 23 characters off the render, for a reason not yet known:

| Case | Scope | Result |
| --- | --- | --- |
| B4, B5 | own-environment log groups, nonprod | explicitDeny |
| B8 | own-environment log groups, prod | explicitDeny |
| B10 | cross-environment | explicitDeny |
| B6 | `*` | explicitDeny |

No live result was `allowed`.

All other rows of the pre-established table pass. Revision 3 reproduces (B1, B3, B7, B9), and the controls behave as expected (A4, A7, A8).

The run also confirmed that the simulator applies no statement to GetLogEvents on any log-stream ARN (A1, A5). For FilterLogEvents it does accept a stream ARN (A9).

**3. Security meaning** (`01` §3, Q6):
- No access grant was observed.
- B2 concerns a group that no Allow reaches, so the live request is refused anyway [V-repo + L].
- What is not demonstrated is the deny itself for foreign groups. Until B2 is explained, "a `*` Deny is always reported by the simulator" cannot be assumed.

**4. Policy change.** None is indicated. The changes I considered and rejected are in `01` §4.

**5. Bootstrap evidence** (`02`):
- **No GitHub log or repository file holds it.** The bootstrap is CloudShell-only by design.
- **The attachments and the platform#43 Sid markers are live,** by simulation revision 3's preflight [O-ev]. The whole documents are not compared.
- **Owner-reported or unavailable [O-rep / U]:** the plan, the apply counts, and the post-apply "No changes".
- **This evidence is at risk:** it is in CloudShell `/tmp/p7`, which does not persist.

**6. Independent review:** `03`, unmodified. **AGREE WITH CHANGES.** The reviewer independently confirmed the B2 statement table, the blocked verdict, "re-apply NOT VERIFIED", and that no policy change is needed. The lead applied the findings:

| Finding | Handling |
| --- | --- |
| F1 (High): preflight does verify attachments | Fixed in `02`: attachments are verified, at lines 61 to 151 |
| F2, F3: `-allow` columns are 23 characters off the render | Fixed in `01` §1: the deciding statement is argued by elimination; the offset is recorded as unexplained |
| F4: "many cases" decided by a lone managed Deny | Fixed: the review found none apart from D30.1 |
| F5, F6: follow-up rows 4 and 1 | Fixed: row 4 requires C7 = implicitDeny; a synthetic `allowed` is a simulator defect |
| F7: table not yet fixed in advance | Fixed by merging this report before the owner runs the test |
| F8: A9 over-generalised | Fixed in `01` §2 |
| F9, F12: wording | Fixed |
| F10: preflight checks Sid strings only | Fixed in `00` and `02` |
| F11: evidence-print gaps | Fixed: `python3 -I`, all attachments listed, local clone commit printed. New sha256 `794a6c28…3eff` |
| F13 | Confirmation, no change |

## Owner decision request

None of these is an AWS change.

1. **Run `supporting/reapply-evidence-print.sh` in the same CloudShell, and send the output.** It reads local files only and makes no AWS call. Please do this soon, because CloudShell `/tmp` may be cleared.
2. **Decide whether to approve the 10-call read-only follow-up test,** `supporting/b2-followup-diagnostic.sh`. Its interpretation is fixed in `01` §5. It separates three explanations for B2:
   - a lone managed-policy Deny not being reported;
   - the `/aws/` group name;
   - a GetLogEvents-specific behaviour.

   The diagnostic files you sent (thank you) do not explain B2.

## Reports

| File | Content |
| --- | --- |
| `01-B2-DETAILED-ANALYSIS.md` | Table rows applied, questions 1 to 6, the follow-up test |
| `02-BOOTSTRAP-APPLY-EVIDENCE.md` | What is verified, what is owner-reported, and what is unavailable |
| `03-INDEPENDENT-REVIEW.md` | Independent reviewer, unmodified |
| `04-DECISION-AND-NEXT-STEPS.md` | Decision table A to E, and the next action |
| `supporting/b2-followup-diagnostic.sh` | 10 read-only simulator calls. Not run |
| `supporting/reapply-evidence-print.sh` | Local file reads only. Not run |

## Authorization confirmation

The lead made **no AWS call** and used no credentials.

**Not done:**
- No IAM or Terraform change, no plan, apply or dispatch.
- No G3, no backstop apply, and no Testing session.
- No image, no secret change, no migration, no DNS change, and no production change.

**Not touched:**
- CanteenHub was not inspected.
- Render and Supabase were not touched.
