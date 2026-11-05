# Phase 7: owner decisions D-2 to D-5, security remediation, G3 preparation

**Date:** 5 Nov 2026, 06:39 to about 09:15 UTC.
**Author:** the lead orchestrator.
**Labels:** [V-repo] repository evidence, [V-gh] GitHub workflow or API evidence, [V-aws] live AWS evidence, [L] local test or simulation, [O-ev] owner-provided evidence, [E] inference or estimate, [U] unverified, [O] owner action required.

**Final verdict: READY FOR SECOND BOOTSTRAP APPROVAL.**

The independent review agrees (Agent 7, `10-INDEPENDENT-REVIEW.md`, no Blocker or High findings). The verdict covers only the owner's second root re-apply at `6b8997a4f9793989abfddae205b4dd6f4ed1d20c`, followed by owner simulation revision 3.

**G3 apply is not authorized in this phase.**

## A. Executive summary

**Done:**
- **D-2.** The owner's residual-risk decisions are recorded for Testing only. All 20 risks are listed, and each original description is kept word for word (`01`).
- **D-3. The Phase 6 patches** (p6-01, p6-02, P1 to P4, a6) were applied in one coordinated code PR, platform#43.
  - Three findings from the Phase 7 reviews were added to the same PR: a session network-placement gap, a case where the database could keep running after a cancelled `up`, and a missing `ListRoleTags` read.
  - The PR was independently reviewed and merged as `6b8997a`. It is code only.
- **D-3. Owner simulation revision 3** was regenerated for the merged bootstrap: 481 read-only calls, sha256 `12cd2ca7…6e22b`. A local evaluator gives 481/481. Agent 7 reviewed it independently.
- **D-3. A second bootstrap runbook** was prepared. It is pinned to `6b8997a`, and the expected plan is `0 to add, 5 to change, 0 to destroy`. It has not been executed (`08`).
- **D-4.**
  - P1 hardens the workflow, and it is merged.
  - P2 (the backstop) and P3 (its boundary permission) are merged, but the backstop is switched off, so G3 stays at 64 creates. A separate 13-create apply is drafted for after G3 (`03`, `supporting/backstop/`).
- **D-5.**
  - The protection plan, the exact ruleset JSON and the owner steps are ready (`05`).
  - Three code-only product PRs were merged:
    - identity#6: GHCR publishing on dispatch only;
    - work#29: GHCR publishing on dispatch only, and no `paths-ignore`;
    - school#24: no `paths-ignore`.
  - The bot identity recommendation is a machine user.
- **G3.** The mocked plan still shows 64 creates, at the same addresses as run 41977870108 (`07`).

**What remains** (all owner-gated, see `09`):
- the second re-apply plus simulation revision 3;
- the GitHub settings (rulesets, tag protection, `image-release` reviewer) and the bot identity;
- G3 and G6 approvals;
- the backstop apply, then verification of the backstop and P4;
- product prerequisites, then the first Testing session.

## B. D-2 to D-5 decision status

| Decision | Original decision (owner, 5 Nov 06:38 UTC) [O-ev] | Implementation status | Evidence | Remaining owner action |
| --- | --- | --- | --- | --- |
| D-2 | Accept the listed residual risks for Testing only | Recorded. R9 and R10 are **not** accepted: they are fixed in code and must be live in AWS before the first session | `01` | None for G3. Before production, every risk must be decided again |
| D-3 | Coordinated code PR, regenerated simulation, independent review, separate re-apply | Done in code. platform#43 is merged as `6b8997a`. Revision 3 is ready, and the runbook is ready but not run | `02`, `08`, `10` | Approve and run the second re-apply and revision 3 (`08`) |
| D-4 | Choice B: the backstop is a separate small apply right after G3 | P1 merged. P2 and P3 merged with the backstop off. The separate apply is drafted | `03`, `07`, `supporting/backstop/` | Approve the backstop apply after G3, and verify it before the first `up` |
| D-5 | Repository and image-tag protection; resolve the shared identity first | Plan and JSON ready. Three product workflow PRs merged. No GitHub setting changed | `05`, `supporting/rulesets/` | Apply the rulesets and environments (steps O-2 to O-6), and decide the bot identity |

## C. Pull requests and merges

| Repository | PR | Head | Merge commit | CI | Status |
| --- | --- | --- | --- | --- | --- |
| munaxa-platform | [#43](https://github.com/munaxa/munaxa-platform/pull/43) | `744c67c` | `6b8997a` | All checks success on `744c67c`. This includes "Format, validate, mocked plan tests". Plan and Apply were skipped, because they run on dispatch only [V-gh] | Merged 5 Nov |
| munaxa-identity | [#6](https://github.com/munaxa/munaxa-identity/pull/6) | `b15cf10` | `5277d71` | verify: success [V-gh] | Merged |
| munaxa-work | [#29](https://github.com/munaxa/munaxa-work/pull/29) | `3ec54b5` | `b490b25` | 4 of 4 success [V-gh] | Merged |
| munaxa-school | [#24](https://github.com/munaxa/munaxa-school/pull/24) | `177495a` | `9671bcb` | Lint, test and build plus security scans: success. Flutter and the Supabase preview skipped [V-gh] | Merged |
| munaxa-platform | Reports PR (this folder) | - | - | Docs only | See the index |

**Baselines** before editing, origin/main [V-repo]:
- platform `7cd448d`
- docs `b8c7e25`
- work `f812dfe`
- school `54cf3eb`
- identity `4001ed8`
- control `a24c568`

No PR was open in any of the six repositories at the start.

**Merge safety.** No merge can publish, deploy or migrate:
- the ECR publish workflows run only on `image/**` tags;
- the GHCR workflows now run on dispatch only;
- School's deploy runs on dispatch only [V-repo].

## D. Security review

- **Accepted for Testing only:**
  - R1, R2, R3, R5, R6;
  - R4, for G3 only;
  - R7, R19, R20;
  - R8 and R18, for nonprod only.
- **Fixed in code but not yet live in AWS** (they become live with the second re-apply):
  - R9: no session security-group rule, and now no network-placement change either;
  - R10: no log or database data reads;
  - R11, R12, R13;
  - the self-assumption part of R7.
- **Production blockers:**
  - R4: remove the default security group;
  - R7, R19 and R20: guardrails;
  - R14: repository protection and the bot identity;
  - R15: member accounts;
  - R17: the prod boundary in the stack;
  - every risk that was accepted for Testing must be decided again.
- **Open findings from the independent review:** M-1 to M-3 and L-1 to L-8. They are listed, with their handling, in `10` §4 and `09`.
  - M-1 (reports not yet on main) is closed by the reports PR.
  - M-2 (the PR #43 body was out of date) is closed: the body was updated before the merge.

## E. Testing shutdown

**Normal path (P1):**
- `aws-session.yml` `down` stops the database in its own job, which has its own concurrency group. It never waits behind an approval.
- The stop is idempotent, it handles transitional states, and it fails closed.
- A failed, cancelled or timed-out `up` stops the database again.
- GitHub cron runs at 19:17 and 01:47 UTC.

**AWS backstop (P2 and P3):**
- EventBridge Scheduler runs at 21:00 UTC. It stops `munaxa-nonprod-pg` and sets the desired count of 10 nonprod services to 0, using a role that can do nothing else.
- Production gets nothing. Nothing is deleted. The ALB and DNS are not touched.
- The backstop is off in G3. It works only after the second re-apply, because `TestingBackstop` must be in the live boundary first.

**Costs** [E, with price-list figures]:

| Item | Cost |
| --- | --- |
| Scheduler | US$0.00 a month (free tier) |
| A session | about US$0.29 to 0.30 an hour |
| After 21:00 with only the ALB and its 2 IPv4 addresses left | US$0.037 an hour |
| RDS storage while stopped | about US$2.74 a month |
| A failed scheduled target | adds US$0.019 an hour (RDS) or US$0.236 an hour (ECS) |

With the backstop working, one forgotten session stays under US$50 a month. Without it, US$50 is reached in about 5 days. The budget only sends notifications. The failure-mode table is in `03`.

## F. Repository protection

**Actual state** [V-gh, `list_branches`]:
- `main` is protected in platform and docs only. It is not protected in identity, control, work, school or the umbrella repository.
- Platform's ruleset requires 0 approvals (Phase 5 read).
- No `image/*` tags exist in the four product repositories. Docs has 7.
- The rulesets and environments APIs cannot be read with the agents' tools [U].

**Bot identity.** All agent work appears as `tam2om`. Requesting tam2om as reviewer on #43 failed with "Review cannot be requested from pull request author" [V-gh].
- **Recommendation:** a machine user, `munaxa-bot`, with the Write role, connected to Claude so that agents act as it. tam2om stays the only admin and the only reviewer.
- A GitHub App is cleaner, but its key handling is not solved for this session [U].
- **Phase A now:** 0 approvals, required checks, no force push or deletion, and protected tags.
- **Phase B after the bot exists:** 1 approval, including approval of the latest push.
- **Effect on the merge rule:** in Phase B, Claude can no longer merge its own PRs. The owner approves each one.

## G. G3 impact

**The 64-create plan is unchanged** [L, mocked plan; no real plan was dispatched in Phase 7]:
- As patched, the backstop would have made G3 77 creates. The lead turned it off by default.
- `admit_alb` and the a6 validations affect only service modules, and G3 has none (`images = {}`).

## H. Owner actions

These are listed in `09-OWNER-ACTIONS.md`. Only owner decisions and approvals are listed.

## I. Independent review verdict

Agent 7, exact conclusion line: **`READY FOR SECOND BOOTSTRAP APPROVAL`**. Its conditions are in `10` §5.

## J. Authorization confirmation

- No G3 apply occurred, and no Terraform plan or apply was dispatched in this phase.
- No second bootstrap re-apply occurred.
- No AWS call of any kind was made: no write and no read. The AWS root connector was not used.
- No image was published to ECR or GHCR.
- No secret was created, read, written or changed.
- No remote migration ran.
- No DNS or Cloudflare change was made.
- No production deployment occurred.
- No GitHub setting, ruleset, environment or variable was changed.
- CanteenHub was not inspected or touched. Render and Supabase were not inspected or changed. School's CI shows a "Supabase Preview" check, which was skipped and was not inspected.

## Report map

| File | Content |
| --- | --- |
| `01-RESIDUAL-RISK-DECISIONS.md` | D-2, R1 to R20 |
| `02-IAM-REMEDIATION-AND-SIMULATION.md` | The patches by Sid, simulation revision 3 |
| `03-TESTING-SHUTDOWN-AND-BACKSTOP.md` | P1, P2, P3, cost, failure modes |
| `04-SESSION-SECURITY-AND-LOGGING.md` | P4, network placement, log exposure |
| `05-REPOSITORY-PROTECTION.md` | D-5, rulesets, bot identity |
| `06-CROSS-PRODUCT-READINESS.md` | Products, deployment order |
| `07-G3-PLAN-IMPACT.md` | G3 stays at 64 |
| `08-SECOND-BOOTSTRAP-RUNBOOK.md` | The owner runbook, not executed |
| `09-OWNER-ACTIONS.md` | What only the owner can do |
| `10-INDEPENDENT-REVIEW.md` | Agent 7, unmodified |
| `AGENT-TASK-LEDGER.md` | Who did what |

Paths under `/tmp/claude-0/…` in the agent reports are the agents' scratch folders in the session container. They are not published; the evidence that matters is copied into `supporting/`.
