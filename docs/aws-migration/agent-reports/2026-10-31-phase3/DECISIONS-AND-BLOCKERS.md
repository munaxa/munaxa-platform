# Decisions and blockers: phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Ids continue from
[`../2026-10-30-phase2/DECISIONS-AND-CONFLICTS.md`](../2026-10-30-phase2/DECISIONS-AND-CONFLICTS.md).

## 1. Decisions preserved (brief §3), and how

| Decision | Applied |
| --- | --- |
| Existing account 229251310592, eu-central-1, public ECS networking | No change; platform#31 touches IAM denies and the runbook only |
| Docs recreated in the shared stack, clean database, empty storage, no data migration | Unchanged (`stack/docs.tf`) |
| Old Docs Production kept until acceptance and G9 | Untouched; the deployer is denied it by name, by `Project = MunaxaDocs`, and now by any non-`munaxa` project |
| Security monitoring deferred | Nothing added |
| Testing budget US$50, existing account-wide budget kept, separate Testing budget kept | No budget code changed. See TD-13 for the two account-wide budgets |
| No production, Cloudflare, Render, Supabase change | None made |
| CanteenHub out of scope | Not accessed or investigated. Phase 2's N-2 / TD-11 asked where it lives; this phase **withdraws TD-11** and closes the code side of N-2 with a project-neutral deny instead (platform#31) |

## 2. Discrepancies between the phase 2 reports and the repositories

| # | Report said | Actual | Effect |
| --- | --- | --- | --- |
| X1 | #29 merged "with all checks green" | True of the PR head `7af38e0`; but the **push run on main `c41f08d` failed** (run 41147461520: `@munaxa/rbac` `performance.test.ts:49`, 8165.6 ms against a 7500 ms limit). Same class of timing failure that phase 2 re-ran on the PR | Not an infra defect; the Terraform checks passed. platform#31's runs are the current evidence. [R] make the timing tests tolerant of hosted-runner variance in a separate PR |
| X2 | The reports PR merged "by the same rule after its checks pass" | Its PR run 41147507005 passed; **no push run on main `cc59c7f`**, because `ci.yml` push has `paths-ignore: ['**/*.md']` | By design; no gap |
| X3 | README G2: "about 46 resources" | The configuration creates **49** | Fixed in platform#31; a 46 at G2 would have looked like an anomaly |
| X4 | P11: "the owner reads the subject setting (P-7)" | Not needed: verified from issued tokens in all five repositories | P-7 closed |
| X5 | P-5 included "which account holds canteenhub-prod" | The phase 3 brief forbids it | Dropped; replaced by the N-2 code fix and the before-G3 owner confirmation |
| X6 | Budget scope: "the account budget" | The account also holds the Docs bootstrap's `munaxa-account-monthly` (US$10) and `munaxa-docs-eu-prod-monthly` (US$10) (Phase 0, munaxa-docs `bootstrap/budget.tf`) | TD-13 |

## 3. Decisions still required (Tamer)

| Id | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| **G2** | Approve the bootstrap apply as root in CloudShell, per G2-BOOTSTRAP-READINESS §3 | G3 onward | Approve |
| TD-13 (new) | Two account-wide budgets after G2: the Docs bootstrap's `munaxa-account-monthly` (US$10, in Docs Production's state, alerts monthly while old Docs runs) and the platform's `munaxa-shared-account-monthly` (US$50) | Nothing | Keep both until G9, as the brief says; changing the Docs one is a Docs Production change |
| TD-14 (new) | How non-Munaxa resources without a `Project` tag are kept out of the deployer's reach (N-2 residual) | **G3** | Owner confirms the account's non-Munaxa resources carry a `Project` tag, so the platform#31 deny covers them |
| TD-2, TD-3 | Token audiences, real MFA claim | Production | Before Production |
| TD-7 | School Firebase on Testing | Nothing | Leave off |
| TD-9 | Protect munaxa-control `main` (C8) | Nothing in Testing | Now, in GitHub settings |
| TD-10 | Work GHCR publish (W3) | Nothing | Retire with Render |
| TD-12 | Activate `Environment`/`Project` cost allocation tags | Testing budget accuracy | At G2 step 5 |
| TD-11 | ~~Where canteenhub-prod lives~~ | — | **Withdrawn** (out of scope by the phase 3 brief) |

## 4. Blockers

### Blocking G2: **none**

Every pre-G2 item is resolved in code and verified locally and in CI (MASTER-EXECUTION-STATUS), or
is a step of the owner's G2 run itself (the read-only pre-checks in CloudShell).

### Not blocking G2, blocking later gates

| # | Blocker | Severity | Gate | Evidence | Action |
| --- | --- | --- | --- | --- | --- |
| B1 | No non-root AWS identity; the connector is root and signed out | High (operational) | Lead's AWS read-only checks (any phase) | SECURITY §1 | [O] Keep G2 in CloudShell. A non-root identity is a separate, approved change |
| B2 | P9/N-2 untagged resources | Medium | G3 | SECURITY §3 | [O] Docs VPC tag inventory (read only) and TD-14 |
| B3 | Environments, variables, `image-release` environments | — | First workflow run | README G2 step 4 | [O] G2 step 6, in order |
| B4 | Cost figures not re-measured since 29 Oct | Low | Before G3 cost sign-off | COST §0 | [O] / next phase with a suitable identity |
| B5 | munaxa-control `main` unprotected | Low | — | C8 | [O] TD-9 |
| B6 | G4 secrets, G5 images, G6 Cloudflare, G7 session | — | G4 to G7 | baseline plan | Separate approvals |

## 5. Branch protection, as observed

| Repository | `main` protection | Evidence |
| --- | --- | --- |
| munaxa-platform | Ruleset: the 3 `ci.yml` checks required and the branch up to date (the `ci.yml` header says all three of its checks are required) | Phase 2 (405 until updated) [V, phase 2] |
| munaxa-control | **None** | C8, control#7 merged with no gate [V, phase 2] |
| Others | Not re-checked this phase (no change made there) | [U] |
