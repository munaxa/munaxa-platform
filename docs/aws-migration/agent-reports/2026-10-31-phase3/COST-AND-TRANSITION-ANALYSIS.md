# Cost and transition analysis: phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

## 0. Evidence and its limits

- **Nothing was re-measured.** The AWS connector needs a new sign-in and is root, so no Cost
  Explorer, Budgets or Pricing call was made (brief §5A) [V].
- The old Docs idle figure remains the **29 Oct measurement**, about US$1.55 a day, **≈ US$47.80 a
  month** [V on 29 Oct, U since]. The Testing figures are phase 2's estimates [E].
- What is new in this phase: the **G2 cost** (below), the **existing budgets** in the account, and
  the effect of the merged code on the Testing estimate (none: platform#31 changes IAM only).

## 1. G2 bootstrap cost [E]

| Item | US$ / month |
| --- | --- |
| KMS key for state | ≈ 1.00 |
| S3 state (kilobytes, versioned) | < 0.01 |
| 11 ECR repositories, empty until G5 | 0 |
| IAM roles and policies | 0 |
| 2 new budgets | 0 to ≈ 1.24 [U: from memory, the first two budgets per account are free and each further one about US$0.02 a day; the account already has two Docs budgets] |
| **Total added by G2** | **≈ 1.00 to 2.30** |

## 2. Budgets after G2 [V from code; live state U]

| Budget | Owner (Terraform) | Scope | Limit | Status |
| --- | --- | --- | --- | --- |
| `munaxa-account-monthly` | munaxa-docs `infra/terraform/bootstrap/budget.tf` (Docs Production state) | Whole account | US$10 (`monthly_account_budget_usd` default; Phase 0 saw US$10, spent US$7.02 on 29 Oct) | **Existing; kept unchanged** (brief §3). It will alert every month while old Docs runs (≈ US$48) |
| `munaxa-docs-eu-prod-monthly` | munaxa-docs bootstrap | `user:Environment=Production` tag | US$10 | Existing; reads US$0 until cost allocation tags are active (Phase 0) |
| `munaxa-shared-account-monthly` | munaxa-platform bootstrap (G2) | Whole account | US$50 | New at G2 |
| `munaxa-shared-testing-monthly` | munaxa-platform bootstrap (G2) | `user:Environment$nonprod` | US$50 | New at G2; reads US$0 until TD-12 [O] |

The platform bootstrap must not change the Docs budgets (they are in Docs Production's state, which
the brief protects). That leaves two account-wide budgets after G2 (US$10 and US$50); see
DECISIONS-AND-BLOCKERS TD-13.

## 3. Transition picture (unchanged from phase 2) [E]

| Scenario | Old Docs | Testing | Account total |
| --- | --- | --- | --- |
| After G2, before G3 | 47.80 | ≈ 1 to 2.30 (bootstrap) | **≈ 48.80 to 50.10** |
| Testing idle (after G3) | 47.80 | 11 to 13 (+ bootstrap) | 59.80 to 63.10 |
| 20 session hours | 47.80 | 15.20 to 19.00 (+ bootstrap) | 64.00 to 69.10 |
| 40 session hours | 47.80 | 19.40 to 25.00 (+ bootstrap) | 68.20 to 75.10 |
| After G9 retirement, 40 h | 0 | 19.40 to 25.00 (+ bootstrap) | 20.40 to 27.30 |

**Testing alone stays within US$50** up to roughly 120 session hours a month [E]. The account total
exceeds US$50 while old Docs runs; that is time-limited and was settled in phase 2 (TD-1).

## 4. Safe cost actions

| # | Action | Gate |
| --- | --- | --- |
| 1 | Activate `Environment`/`Project` cost allocation tags (TD-12), so the Testing budget measures something | [O] Billing, at G2 step 5 |
| 2 | After sign-in by a suitable identity: Cost Explorer 22 Oct to 31 Oct, to replace the 29 Oct figure | [O] / next phase |
| 3 | Shorten the old Docs overlap (acceptance in the first Testing session, then G9) | G9 |

Nothing in this phase changed a resource or a budget.
