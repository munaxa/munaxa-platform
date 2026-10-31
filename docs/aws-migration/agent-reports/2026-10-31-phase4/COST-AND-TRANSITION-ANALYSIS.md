# Cost and transition analysis: phase 4 (G2), 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

## 1. What G2 created that costs money

| Item | US$ / month | Basis | Label |
| --- | --- | --- | --- |
| KMS customer-managed key (state) | ≈ 1.00 | list price per key-month; rotation on (each rotated key version may add about US$1/month from the second year) | [E] |
| S3 state bucket | < 0.01 | 2 state versions, ≈ 0.4 MB | [E] |
| 11 ECR repositories | 0 | empty until G5; storage-billed only | [E] |
| IAM roles and policies | 0 | free | [V by pricing model] |
| 2 budgets | 0 to ≈ 1.24 | the account now has 4 budgets; from memory, 2 free per account then ≈ US$0.02/day each | [U] |
| **G2 total** | **≈ 1.00 to 2.30** | unchanged from the phase 3 estimate | [E] |

**Measured:** nothing yet. Cost Explorer shows charges with a delay of up to 24 h, and this phase had
no non-root read access (connector signed out). [U]

## 2. Budgets now in the account [V]

| Budget | Limit | Owner |
| --- | --- | --- |
| `munaxa-account-monthly` | US$10 | Docs bootstrap (unchanged) |
| `munaxa-docs-eu-prod-monthly` | US$10 | Docs bootstrap (unchanged) |
| `munaxa-shared-account-monthly` | US$50 | platform bootstrap (new) |
| `munaxa-shared-testing-monthly` | US$50 on `user:Environment$nonprod` | platform bootstrap (new) |

Cost allocation tags `Environment` and `Project` were activated at 13:43:41 UTC [V]; the Testing
budget can only see tagged spend from then on (AWS applies them going forward, with up to 24 h
delay) [E].

## 3. Transition picture [E]

| Scenario | Old Docs | Testing | Account |
| --- | --- | --- | --- |
| Now (after G2, before G3) | ≈ 47.80 (29 Oct measurement) | ≈ 1 to 2.30 | ≈ 48.80 to 50.10 |
| Testing idle after G3 | 47.80 | 11 to 13 + bootstrap | ≈ 60 to 63 |
| After G9, 40 session hours | 0 | ≈ 20 to 27 | ≈ 20 to 27 |

The US$50 **Testing** target holds. The **account** passes US$50 while old Docs runs (already accepted
in phase 2, TD-1). The Docs `munaxa-account-monthly` (US$10) will keep alerting (TD-13).

## 4. Uncertainty

Prices are list prices from memory, not re-checked (no Pricing access) [U]. The old Docs idle figure
dates from 29 Oct [U since]. [R] after G2 settles, read Cost Explorer for 31 Oct to 2 Nov with a
suitable identity.
