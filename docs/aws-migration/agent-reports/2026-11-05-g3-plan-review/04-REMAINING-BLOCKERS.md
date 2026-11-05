# Remaining blockers, conditions and owner decisions

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead of this thread. Documentation only; nothing below has been done.
- **Baseline:** `2026-11-05-testing-readiness/04-BLOCKERS-AND-OWNER-DECISIONS.md` (BL-1 to BL-16, platform #50, `0c58174`). This file restates them **for the G3 decision**, with the owner decisions of 5 Nov 20:00 UTC applied.

## 1. Owner decisions recorded (5 Nov 2026, 20:00 UTC, in the project thread) [owner decision]

| # | Decision |
| --- | --- |
| OD-1 | AWS account `229251310592`; infrastructure Region `eu-central-1` |
| OD-2 | Testing on ECS Fargate with public IPs in public subnets; **no NAT Gateway** |
| OD-3 | RDS PostgreSQL 16, `db.t4g.micro`, private, single AZ |
| OD-4 | Testing monthly budget target **US$50**; on-demand Testing sessions |
| OD-5 | Product order: **Identity, then Control, then Work** |
| OD-6 | Docs: **recreate**, do not restore old test data (consistent with the retired eu-prod stack and its final snapshot, whose KMS key is pending deletion) |
| OD-7 | DNS/G6: follow G3 dependencies and the documented validation sequence (`03`) |
| OD-8 | Root used temporarily for AWS operations; **no IAM users, access keys or Identity Center** |
| OD-9 | **B2: ROOT CAUSE UNRESOLVED — ACCEPTED FOR TESTING ONLY.** No IAM policy change authorized. **Does not apply to Production** |
| OD-10 | **Not yet decided:** D-B, accept the second bootstrap re-apply as PARTIALLY VERIFIED (testing-readiness `04` §2; the lead's recommendation there was to accept for Testing). The G3 approval must include it; without it the verdict is NOT READY — BLOCKERS REMAIN |

## 2. B2 record

**Completed 10-call follow-up diagnostic** (`2026-11-05-next-diagnostic/supporting/b2-followup-diagnostic.sh`, sha256 `83bdb7acaa2fb9ce4dd669ba4d8ba07c6b380545137a644af89171fee021f6d6` verified on main in this task; run by the owner) — results as **reported by the owner** [O-rep]; the raw JSON output is **not** on main:

| Owner-reported result | Script case(s) [V-repo script lines 62 to 78] |
| --- | --- |
| `logs:GetLogEvents` on `log-group:/aws/other` repeatedly returned **implicitDeny** | C9 (repeat of B2) |
| A synthetic **Deny-only** policy produced the same result | C2 (`syn-deny-only.json`, custom simulation, same resource) |
| Other tested foreign resources returned **explicitDeny** | C3 to C6 (FilterLogEvents, RDS log download, ACM export, inline Secrets Manager deny); C7 (`/other`) not stated separately |
| The own Identity log-group test returned **explicitDeny** | C10 (`/munaxa/nonprod/identity`, repeat of B4) |
| No missing context values were reported | all |

**Reading against the table fixed before the run** (`next-diagnostic/01` §5) [E]: rows 2 and 3 do not apply (C9 implicitDeny, C10 explicitDeny, control C6 explicitDeny as reported). **Row 1 cannot be ruled out**: the owner gave no row count and no values for C1, C7 and C8, so an ERROR, a missing row or an `allowed` there is not excluded. **If** row 1 is ruled out by the raw output, row 4 needs C2 = explicitDeny, which was not observed; **row 5 (C1 or C2 = implicitDeny) is the first match as reported**: "the foreign group name is not evaluated even synthetically; a resource-name behaviour of the simulator; owner review required". That table states that no row alone makes a cause confirmed, and this reading rests on the owner's summary, not on the retained output (C1, C7 and C8 values not stated).

**Conclusion: ROOT CAUSE UNRESOLVED — ACCEPTED FOR TESTING ONLY.** The diagnostic shows only what the IAM policy simulator returns; it does not prove how AWS authorizes a real request. No IAM policy was or will be changed under this acceptance. **Residual risk:** a `logs:GetLogEvents` on a foreign `/aws/*` log group by the nonprod deployer may not be explicitly denied; the deployer still has no Allow for it, so the expected live result is still a denial [E]. To close B2 for Production: attach the raw output to the reports, an independent review, and, if wanted, an AWS Support question (row 7 route).

## 3. Status of the earlier blockers for the G3 decision

| # | Blocker (testing-readiness `04`) | Status now | Blocks G3 approval? |
| --- | --- | --- | --- |
| BL-1 | G3 not applied | This package; awaiting owner approval | It **is** the decision |
| BL-2 | B2 | **Accepted for Testing only** (OD-9) | No (closed by decision, not by evidence) |
| BL-3 | Second re-apply PARTIALLY VERIFIED; session trust path not exercised since | **Still open**: no `aws-session.yml` run since 41943924455 (5 Nov 00:47 UTC) [V-gh, checked at about 20:05 UTC and again by the reviewer at about 20:16 UTC] | **Yes unless the owner accepts D-B (OD-10)**, then a hard-stop precondition: C-3 |
| BL-4 | Backstop off | Open; applied after G3 by design (D-4 = B) | No (G3 runs no session). Blocks the first session |
| BL-5, BL-6 | Images; tag protection | Open | No. Block Config A |
| BL-7 | Cloudflare Access | Open | No. Blocks Control |
| BL-8 | Secret values | Open; bundles exist only after G3 | No |
| BL-9, BL-10, BL-12 | Identity keys; licence key two-step; Valkey and Postgres digests | Open | No |
| BL-11 | README F-1 to F-4 | **Closed** in platform #50 (`0c58174`) [V-repo] | No |
| BL-13 | G6 DNS | Open; **72-hour clock starts at G3** | **Condition** C-4 |
| BL-14 | Current spend unknown | **Closed:** owner Cost Explorer read, US$5.99 for 1 to 6 Nov, its size and timing consistent with the old Docs stack (`02` §2; attribution is an inference) [O-rep + E] | No |
| BL-15, BL-16 | School DB name; Docs publisher after retirement | Open | No |

**Apart from D-B (OD-10), which the owner decides together with G3, no open item blocks the G3 approval decision.** The items below are conditions of the approval.

## 4. Conditions of a G3 approval, in order

| # | Condition | Why | Who |
| --- | --- | --- | --- |
| C-1 | Merge the G3 declaration PR: `infra/aws/stack/envs/nonprod.expected-changes.json` = [`supporting/nonprod.expected-changes.g3-DRAFT.json`](supporting/nonprod.expected-changes.g3-DRAFT.json) (64 `create` entries, validated). Owner approval: it gates an apply | `--enforce` refuses an empty declaration | Lead opens, owner approves |
| C-2 | Dispatch `aws-terraform.yml` on `main` at that merge commit, `nonprod` / `apply`. In the plan job: **exactly** `64 to add, 0 to change, 0 to destroy`, intent check passes, no address outside the list. Otherwise **stop** | No real plan at the current code yet (`01` G-M1) | Owner approves the plan job, reads, then approves the apply job (within 4 h) |
| C-3 | **Before** the apply: dispatch `aws-session.yml` `down` once (before G3 it ends at "state key not found"); it must assume both session roles without AccessDenied. **Hard stop:** any AccessDenied, or any ending other than "state key not found", means do not dispatch the apply. **After** the apply: dispatch `down` again at once; it must stop the database. If it fails, stop `munaxa-nonprod-pg` in the RDS console as root | The database runs from creation (`01` G-M2); the session path has not run since the second re-apply (BL-3) | Owner dispatch (workflow dispatches are owner-approved actions) |
| C-4 | Within 72 h of the apply (target: same day): ACM validation records as DNS-only CNAMEs; certificate Issued | `03` §5 | Owner in Cloudflare |
| C-5 | Post-apply: a plan shows no changes; record resource count (64) and the apply run id in a report | Evidence | Lead |
| C-6 | No session until the backstop is applied and verified | D-4 = B; GitHub schedule unreliable | Owner |

## 5. Blockers that remain after G3 (first session), in priority order

| Priority | Item | What closes it |
| --- | --- | --- |
| 1 | BL-4 backstop (13 creates) | PR with `session_backstop_schedule = "cron(0 21 * * ? *)"` and the 13-address declaration (phase 7 `supporting/backstop/`); owner approves plan and apply; first 21:00 UTC run shows no target error |
| 2 | BL-13 G6 validation | C-4 |
| 3 | BL-6 then BL-5: tag protection, Identity and Control images | Owner confirms `image-release` and `image/*` rulesets; pushes tags; approves publish runs; digests by PR |
| 4 | BL-7 Cloudflare Access app | Owner creates it (MFA Require rule); team domain and AUD by PR |
| 5 | BL-9 Identity signing key pair | `pnpm keys:generate` locally; private half to the bundle, public half and kid by PR |
| 6 | BL-8 secret values and pins | Owner writes values (never Git, logs or chat); lead pins versions by PR |
| 7 | BL-12, BL-10 digests and licence key two-step | Config A (services off) → read the licence public key → Config B |
| 8 | **DNS-H1** CNAMEs change every session | Docs-only runbook fix; owner updates CNAMEs after each `up` |
| 9 | Work images and Config D | After Identity and Control pass |
| 10 | BL-15, BL-16 | Before School and Docs |

## 6. Production (not covered by any Testing acceptance)

B2 (OD-9), the residual risks R1 to R20 accepted for Testing only (phase 7 `01`), R7, R19, R20, member accounts (R15) and the root-only operating model all return as Production decisions. Nothing in this package authorizes a Production action.
