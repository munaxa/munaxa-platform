# Decisions and blockers: phase 4 (G2), 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Ids continue from [`../2026-10-31-phase3/DECISIONS-AND-BLOCKERS.md`](../2026-10-31-phase3/DECISIONS-AND-BLOCKERS.md).

## 1. Decisions taken this phase (by Tamer, in the project thread)

| Id | Decision | When (UTC) |
| --- | --- | --- |
| TD-15 | G2 approved (G2 only) | 05:46 |
| TD-16 | "Try to do it yourself": root use of the AWS connector allowed for G2. Not exercised: the connector stayed signed out, and it cannot run Terraform | 06:06 |
| TD-17 | Apply the saved plan despite `{"create":49,"read":4}` | 12:43 |
| TD-18 | Re-apply the bootstrap with the platform#33 fix after merge | 13:29 |

Earlier decisions preserved: account 229251310592, eu-central-1, public ECS networking, Docs
recreated clean in the shared stack, US$50 Testing target, security monitoring deferred, old Docs
untouched until acceptance and G9, CanteenHub out of scope.

## 2. Discrepancies from phase 3

| # | Phase 3 said | Actual | Effect |
| --- | --- | --- | --- |
| Y1 | Plan summary exactly `{"create":49}` | `{"create":49,"read":4}` (deferred policy-document data sources) | Owner approved; [R] runbook text should expect the 4 reads |
| Y2 | Simulation 3 (`munaxa`/`nonprod`) `allowed` | `explicitDeny`: platform#31 N-2 denies were true on a missing tag (G2-1) | Fixed by platform#33, re-applied |
| Y3 | Simulations as written | They omit `aws:RequestedRegion`; `ThisRegionOnly` then denies in the simulator (G2-2) | [R] add it in future runbooks |
| Y4 | "Step 3: plan, apply, migrate" in one CloudShell sitting | CloudShell home volume full; `/tmp` lost on an idle restart between apply and migrate | Recovered from a verified backup; [R] future runbooks: back up state to the home volume right after apply, and migrate immediately |
| Y5 | Runbook §9 item 5 CloudTrail check | Not run (brief forbids inventorying other workloads) | [U] |

## 3. Open decisions (Tamer)

| Id | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| G3 | Approve the first nonprod persistent-layer apply | G3+ | Only after NEXT-EXECUTION-PLAN §3 |
| TD-14 | How non-Munaxa untagged resources stay out of the deployer's reach | **G3** | Confirm they carry a `Project` tag |
| TD-13 | Two account-wide budgets (US$10 Docs, US$50 shared) | Nothing | Keep both until G9 |
| TD-9 | Protect munaxa-control `main` | Nothing in Testing | Now |
| TD-2, TD-3 | Token audiences, real MFA claim | Production | Before Production |

## 4. Blockers

| # | Blocker | Severity | Gate | Action |
| --- | --- | --- | --- | --- |
| B3 | GitHub environments and variables not created | Blocks the first workflow run | Next step | [O] NEXT-EXECUTION-PLAN §2 |
| B2 | Untagged-resource residual | Medium | **G3** | [O] Docs VPC tag inventory + TD-14 |
| B1 | No non-root AWS identity; connector is root | High (operational) | Lead's AWS reads | Keep using CloudShell |
| B4 | Cost not measured since 29 Oct | Low | G3 cost sign-off | Cost Explorer read after 1 Nov |

No blocker remains **within G2** on the AWS side.

## 5. Owner actions

1. GitHub environments, then variables (NEXT-EXECUTION-PLAN §2). **Pending.**
2. Keep the AWS connector signed out.
3. Before G3: Docs VPC tag inventory and TD-14.
4. Optional: free CloudShell home space (`~/bootstrap`, 790 MB, is Docs' working copy: the owner
   decides; nothing in G2 needs it removed).
