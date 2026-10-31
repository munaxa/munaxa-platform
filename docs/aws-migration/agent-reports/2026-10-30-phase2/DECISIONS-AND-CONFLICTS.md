# Decisions and conflicts: phase 2, 30 Oct 2026

Ids continue from the baseline's [`DECISIONS-AND-CONFLICTS.md`](../2026-10-30/DECISIONS-AND-CONFLICTS.md)
(TD-n = Tamer decisions).

## 1. Decisions confirmed by the 30 Oct phase 2 brief, and how they were applied

| Decision | Applied how |
| --- | --- |
| Region eu-central-1; both-account strategy as previously selected; public ECS networking | No change to any of them. #29 changes only IAM, the budget and docs |
| Docs recreated inside the shared architecture, clean database, empty storage, **no test-data migration** | Already in code (`stack/docs.tf`, #26). Restated in DOCS-REPLACEMENT-AND-RETIREMENT |
| Old Docs infrastructure temporary; retire only after successful validation | Retirement conditions written (DOCS-REPLACEMENT §5). G9 stays closed |
| Testing budget about US$50 a month **for the new Testing environment** | This settles **TD-1** as "Testing only". Implemented as a separate Testing budget on `Environment = nonprod` (platform#29). The account budget of US$50 (29 Oct decision) is kept unchanged as the account-wide ceiling, and it will alert during the transition |
| Defer broader monitoring; do not defer essential controls | P9, R-17 and P10 fixed in code; the Access MFA requirement documented |
| Do not touch canteenhub-prod | Not touched. N-2 (its location versus the deployer's reach) needs a read-only check |
| Merge eligible PRs without asking | Applied with head-SHA pinning and green required checks: control#7. See the master status for the rest |

## 2. Decisions closed in this pass

| Id | Decision | Closed by |
| --- | --- | --- |
| TD-1 | Scope of the US$50 target | The brief: the new Testing environment. Implemented in #29 |
| TD-4 | P9: the deployer's reach over Docs Production | Fixed in code with tag denies (#29). Residual: untagged resources, to be inventoried read only |
| TD-5 | R-17: per-environment deployers | Fixed in code (#29), before G2 rather than "before Production", because both live in bootstrap |
| TD-6 | ADR-0008 accepted | control#7, merged `a24c568` |
| TD-8 | School first-owner seeding | platform#27 `school-bootstrap` (**merged** as `329a8b9` (head `811acf9` pinned)) |

## 3. Decisions still required (Tamer)

| Id | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| TD-2 | When to build per-product token audiences | Production only | Before Production, as planned |
| TD-3 | When Identity gets a real MFA claim | Production only. Testing is covered by the Access MFA rule | Before Production |
| TD-7 | School Firebase sign-in on Testing | Nothing critical | Leave it off for the first session |
| TD-9 | Protect munaxa-control `main` (C8) | Nothing in Testing | Do it now (GitHub settings) |
| TD-10 | Work GHCR publish on `image/**` (W3) | Nothing in Testing | Retire it with Render |
| TD-11 (new) | Where canteenhub-prod lives (N-2) | G3, if it is in this account | A read-only check first |
| TD-12 (new) | Activate the `Environment` cost allocation tag | The Testing budget's accuracy | Yes, at G2 |

## 4. Conflicts and inconsistencies found in this pass

| # | Conflict | Resolution |
| --- | --- | --- |
| L7 | Agent 1's final report (baseline 01) says P9 and R-17 were "fixed in code in a follow-up PR". **No such PR or branch exists on GitHub**, and main still had both defects | Treated as not fixed. Fixed in #29. The baseline report is left unchanged as a historical record |
| L8 | TD-3 says Access is the operator's second factor, but `cloudflare-access.md` allowed a single-factor one-time-PIN login with no MFA rule | Fixed in the instructions (#29) |
| L9 | The baseline plan put R-17 "before Production", while the roles live in bootstrap, which G2 applies once as root | Done before G2, so G2 creates the per-environment roles directly and no rename is needed later |
| L10 | GitHub showed docs#167 at `6f0ea79` while its branch was at `a53852d` | Superseded by docs#168, which carries the same commits and ran checks on its real head |
| L11 | The account-wide US$50 budget versus the brief's Testing-only target | Both kept: the account budget as a ceiling, plus the Testing budget. During the transition, alerts from the account budget are expected |

No conflict stopped a workstream.
