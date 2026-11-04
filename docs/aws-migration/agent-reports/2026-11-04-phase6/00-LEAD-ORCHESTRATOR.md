# Phase 6: security remediation, readiness closure and G3 revalidation (lead report)

Date: 4 Nov 2026, 20:01 to about 22:30 UTC. Requested by Tamer (Phase 6 brief, 20:01 UTC). Lead orchestrator: Claude, with six separate Claude agents (Agents 2 to 7). Labels: [V-repo] verified from repository evidence, [V-gh] verified from GitHub workflow evidence, [V-aws] verified from live AWS evidence, [E] inferred or estimated, [U] not yet verified, [O] owner action required.

Baseline: munaxa-platform main `b6b4a0a` (#39). The bootstrap code is `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (#38). AWS still runs the G2 bootstrap `1331ef8`. The product repos are unchanged: docs `b8c7e25`, work `f812dfe`, school `54cf3eb`, identity `4001ed8`, control `a24c568`.

## Executive summary

### A. What was completed

- **No PR was merged in this phase except this docs-only reports PR.** The lead held every code patch back on purpose. The independent review showed that merging them before the re-apply would invalidate the simulation script (BL-1), and the brief bars merging infrastructure changes without approval.
- **The G3 plan record was reconciled** (`03`):
  - Run 41887322394 ran on `46dfbd920c6ee7ac940f0b7ca05656aca461f777` [V-gh]. The SHA in the brief, `46df920c…`, is the same SHA with "bd" missing.
  - Four lists are the same 64 addresses, all creates: the plan log, `g3-expected-addresses.txt`, the proposed declaration, and a new offline mocked plan.
  - Nothing under `infra/`, `.github/` or `scripts/` changed after the plan.
- **The bootstrap re-apply count was reconciled** (`01` §5, `03` §3) by two separate offline harnesses (Agents 2 and 4) and checked by Agent 7:
  - The expected plan line is `19 to add, 6 to change, 0 to destroy`, with 1 move.
  - The 6 changes are 4 real updates plus 2 trust re-reads whose content is identical.
  - "17" in Phase 5 predates the B-2 fix. The "budget artifacts" exist only in the test harness, so a budget change in the real plan is a stop.
- **The simulation was reconciled** (`02`):
  - The Phase 5 script makes 214 simulate calls: 203 principal and 11 custom. "93" was the first version of the script.
  - Critical defect: 4 cases used the mocked state key ARN, and the script always exited 0.
  - The new script makes 332 read-only calls. It reads the real key ARN at run time, runs a preflight, writes a TSV, and exits 0, 1 or 2.
  - Locally it matches 332 of 332 against policies rendered from 46dfbd9 [V-repo, local evaluation only].
- **The runbook was written** (`01` §6): a safe root re-apply in CloudShell with stop conditions and rollback. The lead then fixed the independent reviewer's BL-1 to BL-3 and the three follow-ups from the re-review.
- **The residual register R1 to R20 was written** (`07`). No risk in it is accepted.
- **Shutdown analysis** (`04`) [V-gh]:
  - All 5 scheduled `aws-session.yml` runs were `skipped`, and they started 3 h 12 min to 6 h 05 min late.
  - Proposed: a US$0 workflow hardening (P1) and an AWS-side Scheduler backstop at about US$0.00 a month [E] (P2, P3). R9 is closed by P4.
- **Product readiness and repo protection** (`05`, `05b`):
  - The TLS fixes are merged. The RDS bundle is byte-identical to AWS's bundle [V-repo].
  - The open items are listed by product.
  - All 7 repos are public, and `tam2om` is the only collaborator on each.
  - Apply output would be printed in public logs; a patch exists.
- **Local tests** [V-repo, offline]:
  - At 46dfbd9: bootstrap 9 passed, stack 14 passed.
  - With all patches: bootstrap 12, stack 17 (Agent 7 re-ran these); 20 with the a6 patch (Agent 6).

### B. What remains unresolved

Blockers for G3 apply are gates 2 to 10 and gate 11 in `09` (the gate table). In short:

- the owner re-apply and simulation (D-1);
- the residual decisions R1 to R10, R14, R15, R18 to R20 (D-2);
- a fresh plan after the re-apply;
- the session role ARNs;
- the shutdown safeguards (P1, P2 not yet merged, D-3 and D-4);
- apply-log suppression before G3;
- G6 DNS within 72 h;
- product prerequisites: the valkey and postgres images (the valkey regex probably names a repo that does not exist), the Control licence-key order, `seed-work-roles`, `CONTROL_PLANE_TOKEN` (minimum 20, 20 and 32 characters), and the Docs image, which is 17 commits stale;
- repo protection (D-5).

Unverified until AWS runs the code [U]:

- RDS's `aws:ViaAWSService`;
- CreateKey's implicit key-policy check;
- tag-on-create;
- service-linked roles;
- environment variable resolution in the job-level `if`;
- tonight's first nightly session run since #37. It had not started at 20:05 UTC; expected green with "not applied yet" [E].

### C. AWS authorization status

- **No AWS write of any kind** happened in Phase 6. There was no bootstrap re-apply, no G3 plan or apply, no IAM change and no IAM simulation.
- **No AWS API call was made at all.** The AWS MCP connector, which is signed in as root, was not used by the lead or any agent. Terraform ran offline only, without credentials.
- **No workflow was dispatched.** No image was published, and no secret, GitHub environment, variable, ruleset, DNS, Cloudflare, Render or Supabase change was made. No migration or deploy ran.
- **CanteenHub was not accessed or referenced.**

### D. G3 status

**READY FOR OWNER BOOTSTRAP APPROVAL**, for the root re-apply at `46dfbd920c6ee7ac940f0b7ca05656aca461f777` only. This holds once this reports PR is on main, because runbook step 9 fetches the simulation script from main. It is not G3 apply readiness: G3 apply remains prohibited until every gate in `09` is met.

### E. Owner decisions

These are in `08-OWNER-DECISIONS.md`, each with a recommendation and the consequence of not deciding:

- **D-1:** approve the re-apply at 46dfbd9. Recommended: yes.
- **D-2:** residuals. Recommended: accept the IAM-unscopable ones for Testing, fix R9 and R10 via the second re-apply, and revisit before production.
- **D-3:** patch timing. Recommended: after D-1, a second re-apply with a regenerated script.
- **D-4:** the AWS-side backstop. Recommended: a separate apply right after G3, so G3 stays at 64.
- **D-5:** repo protection and a bot identity. Recommended: tag and main rulesets now, the bot identity before G5.

### F. Next execution sequence

See `09-NEXT-EXECUTION-PLAN.md`:

1. merge the reports;
2. D-1 and D-2;
3. root re-apply at 46dfbd9;
4. the 332-call simulation, exit 0;
5. set the session role ARNs;
6. the re-apply report;
7. a fresh nonprod plan, which must be exactly the 64 creates;
8. the patch PR, then optionally a second re-apply;
9. the G3 declaration PR;
10. **a separate G3 apply approval**, then `down` and G6 within 72 h.

### G. Independent review verdict (Agent 7, quoted, not modified)

- First review: **"NOT READY — BLOCKERS REMAIN"**, with three blockers in the approval material:
  - BL-1: no single SHA, and the patches flip 14 simulation cases;
  - BL-2: wrong exit code in runbook step 8;
  - BL-3: the simulation script is not in the pinned clone.
- Re-review after the lead's fixes: **"READY FOR OWNER BOOTSTRAP APPROVAL"**. In Agent 7's words: "This covers only the root re-apply of `infra/aws/bootstrap` at 46dfbd920c6ee7ac940f0b7ca05656aca461f777, run with the corrected section 6. It is conditional on the reports PR being on main before the owner is asked. It does not cover G3, any patch, or a second re-apply."
- The re-review asked for three wording fixes. The lead applied all three: the hash check now gates the script with `&&`; a stale "no other case affected" sentence was removed; the "or the merge SHA" passages in `01` §8 and `07` were superseded.
- Agent 7's full text is `06-INDEPENDENT-REVIEW.md`, §0 to §9. Its findings N-1 to N-3 were added to the register as R18 to R20.

## Files in this folder

| File | Author |
| --- | --- |
| `00-LEAD-ORCHESTRATOR.md`, `08-OWNER-DECISIONS.md`, `09-NEXT-EXECUTION-PLAN.md`, `AGENT-TASK-LEDGER.md`, `README.md` | Lead |
| `01-IAM-BOOTSTRAP-SECURITY.md` | Agent 2. Section 6 has 6 marked lead fixes after the review |
| `02-IAM-SIMULATION-EVIDENCE.md` | Agent 3 |
| `03-TERRAFORM-G3-RECONCILIATION.md` | Agent 4 |
| `04-TESTING-SHUTDOWN-AND-COST.md` | Agent 5 |
| `05-CROSS-PRODUCT-READINESS.md`, `05b-REPOSITORY-PROTECTION.md` | Agent 6 |
| `06-INDEPENDENT-REVIEW.md` | Agent 7 (independent), unmodified |
| `07-RESIDUAL-RISK-REGISTER.md` | Agent 2, with lead additions R18 to R20 and a lead note |
| `supporting/` | The owner simulation script and its diff against Phase 5, the simulation matrix, the expected re-apply changes, the run 41887322394 plan table, the scheduled-run lag data, and `patches/` (all proposed, none merged) |

Agent reports refer to working folders such as `a2/evidence/`. Those were not published, apart from the files in `supporting/`. Historical Phase 5 reports were not edited. Their known errata are recorded here:

- "17 to add" should be 19;
- "93 simulations" should be 214;
- "all 214 simulate-principal-policy" should be 203 principal plus 11 custom;
- "AWS reads all succeeded": the plan exercised only STS and state, because the stack has no data sources;
- "2 budget artifacts" exist only in the harness.

The suggested wording is in `supporting/patches/patch-phase5-count-corrections.diff`, not applied.
