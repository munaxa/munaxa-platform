# Phase 7 (5 Nov 2026): owner decisions D-2 to D-5, security remediation, G3 preparation

Start at [`00-LEAD-ORCHESTRATOR.md`](00-LEAD-ORCHESTRATOR.md). It holds the executive summary and sections A to J.

**Status: READY FOR SECOND BOOTSTRAP APPROVAL.** This covers the root re-apply at `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` and owner simulation revision 3 (`08`). The independent reviewer, Agent 7, agrees.

**G3 apply is not authorized.** Phase 7 made no AWS call of any kind. It published no image, wrote no secret and changed no GitHub setting.

| File | Content |
| --- | --- |
| `01` | Residual risks R1 to R20 with the owner's Testing-only decisions |
| `02` | IAM patches by Sid, and simulation revision 3 (481 calls) |
| `03` | Testing shutdown, the EventBridge backstop, cost and failure modes |
| `04` | Session network security and public log exposure |
| `05` | Repository protection and bot identity |
| `06` | Product readiness and deployment order |
| `07` | G3 impact: the plan is still 64 creates |
| `08` | Second bootstrap re-apply runbook. Not executed |
| `09` | Owner actions |
| `10` | Independent review, unmodified |
| `AGENT-TASK-LEDGER.md` | Agent assignments, and the conflicts the lead resolved |

**`supporting/` contents:**

- **`simulation/`**
  - `b2-owner-simulation.sh` (revision 3), sha256 `12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b`
  - the diff from revision 2
  - the case table
  - the expected re-apply changes
  - the reference check
  - the policy sizes
  - the mock runs
- **`rulesets/`**: ruleset and environment JSON for the owner.
- **`backstop/`**: the separate post-G3 apply, and its 13-create declaration.
- **G3 addresses**: the mocked G3 addresses and the backstop addresses.
