# Decision table and next controlled action

**Date:** 5 Nov 2026. Lead.

**What none of the outcomes below permits:** G3, the backstop apply, a Testing session, an image publication, a secret change, a migration, a DNS or Cloudflare change, or any production change. Each of these keeps its own separate approval and its own preconditions.

## 1. Decision table

| Outcome | What can proceed | What remains blocked |
| --- | --- | --- |
| **A. B2 explained, and revision 4 justified.** B2.json or the follow-up test (`01` §5, rows 4 to 6) gives a cause; the independent review agrees; no row is `allowed` | Prepare revision 4 (docs-only PR). Its proposed changes are below this table | Running revision 4 until the owner approves its acceptance criteria. Re-apply verification until revision 4 passes in full **and** outcome E is closed. G3 |
| **B. B2 explained, but revision 4 unnecessary.** For example, the cause is a simulator behaviour already covered by an existing canary, and the own-environment and cross-environment GetLogEvents denies are already observed (B4, B5, B8, B10) | The owner may accept the diagnostic results (B4/B5/B8/B10, plus the explained B2) as the evidence for D30.1, LD01.1, LD30.1 and LD50.1, in place of revision 4 | That acceptance is an owner decision, not the lead's. Without it, the four revision 3 cases stay failed. Re-apply verification until outcome E is closed. G3 |
| **C. B2 unresolved** (now; B2.json does not explain it) | The owner runs the evidence print (no AWS call), and decides whether to approve and run the follow-up test | Revision 4. Re-apply verification. G3. Any statement that `NoLogOrDatabaseData` is fully demonstrated |
| **D. Any live simulation returns `allowed`** for a log or database data action | Nothing, except incident handling: stop, record the row, and prepare a reviewed policy fix PR. A third re-apply only on a new explicit owner approval | Everything, including any further Testing work. Treat it as a security finding |
| **E. Bootstrap apply evidence incomplete** (now, in parallel with C) | The owner runs `supporting/reapply-evidence-print.sh`. It reads local CloudShell files only and makes no AWS call | Declaring the second re-apply verified. If `/tmp/p7` is gone, any AWS read (S3 state versions, a no-change plan) needs a separate approval |

**Revision 4, as proposed in `2026-11-05-second-bootstrap-reapply/07` §3:**
- The five GetLogEvents requests move to the log-group form.
- Four log-stream canaries are added.
- No expected value changes.

**D30.1 under revision 4.** It then sits on `/aws/other`, which is exactly B2. So D30.1 would fail again unless the cause found under outcome A changes its request or its expectation, and that change would itself need owner approval.

## 2. Status now

- **Verdict:** **`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`**. The pre-established table, row 8, is triggered by B2 (`01` §2).
- **Bootstrap re-apply:** **NOT VERIFIED**. The intended policies are live by preflight. The plan, apply and post-plan are not evidenced (`02`).
- **Not authorized:** G3 and Testing.

## 3. Recommended next controlled action

These are owner actions, and no AWS change is proposed.

1. **Run the evidence print in the same CloudShell:** `bash reapply-evidence-print.sh /tmp/p7`. It makes no AWS call. Send the output.
2. **The first diagnostic's files are done.** They were received at 11:25 UTC, and they do not explain B2.
3. **Approve and run `supporting/b2-followup-diagnostic.sh`.** It makes 10 read-only IAM simulator calls, and its interpretation is fixed in `01` §5. Send `summary.tsv` and every `C*.json`.

The lead then updates `01`, has the result independently reviewed, and applies the decision table above.
