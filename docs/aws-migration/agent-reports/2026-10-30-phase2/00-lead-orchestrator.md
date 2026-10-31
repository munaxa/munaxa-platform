# 00 · Lead orchestrator: phase 2 execution report, 30 Oct 2026

- **Brief:** "Munaxa AWS Migration: Next Approved Execution Phase" (Tamer, 20:02 UTC).
- **Baseline:** [`../2026-10-30/`](../2026-10-30/) (platform#28, `fc393fc`), read in full: 00 to 07,
  CROSS-REPOSITORY-DEPENDENCIES, DECISIONS-AND-CONFLICTS, MASTER-EXECUTION-STATUS,
  NEXT-EXECUTION-PLAN, README and `supporting/`.
- **Method:** one lead session did all six workstreams directly. No specialist threads or subagents were
  started, because the work fit one session and each specialist would have had to re-read the
  same baseline. Each per-repository report (01 to 06) is the lead's. 07 is a self-review and says so.
- **Final state recorded at:** 31 Oct 2026, about 00:05 UTC (the pass ran from 20:03 UTC; a GitHub API outage between about 21:30 and 23:40 UTC delayed the last merges).

## 1. Verified facts at the start [V]

| Item | Finding |
| --- | --- |
| Default branches | All six repositories use `main`: platform `fc393fc`, control `739be21`, identity `b97b3ab`, docs `406eaee`, work `da84612`, school `54cf3eb` |
| Open PRs | Only platform#27 (head `8c2773b`, all checks green) and docs#167 (GitHub head `6f0ea79`) |
| docs#167 | **Still stuck.** GitHub's head is `6f0ea798…`, while the branch is at `a53852d`. No pull_request run on `a53852d` |
| P9, R-17 | **Not fixed on GitHub.** The baseline's 01 said they were fixed "in a follow-up PR", but no such PR or branch exists |
| P10 | Open in `stack/services.tf` |
| P11 | Repository and owner ids match the GitHub API. The same subject form works for munaxa-docs (run 40456924209). The platform and product repositories' subject setting is not readable with my tools |
| OPENAPI_ENABLED, School first owner | On platform#27 only, not on main |
| ADR-0008 | "Proposed" in munaxa-control |
| Identity | One token for both audiences; `mfaSatisfied` always false; the Access instructions had **no MFA rule** (N-3, new) |
| Docs image | The release (`f8a8bea`) predates licensing; the publish workflow cannot install `@munaxa/*` until #167's fix lands |
| F-3 | Copy identical (sha256 `a6cf9e96…`), with no drift check |
| Platform `main` ruleset | 3 required checks and an up-to-date branch: the first #27 merge attempt returned 405 until the branch was updated |
| AWS | The connector needs a new sign-in (read-only call failed). When signed in, it is **root** |

## 2. Changes made

| Repository | PR | Head | Change |
| --- | --- | --- | --- |
| munaxa-platform | [#27](https://github.com/munaxa/munaxa-platform/pull/27) | `811acf9` | Reviewed; branch updated from main (merge commit only) |
| munaxa-platform | [#29](https://github.com/munaxa/munaxa-platform/pull/29) | `1cbd551` | R-17, P9, P10, F-3 check, Testing budget, Access MFA rule, bootstrap tests |
| munaxa-docs | [#168](https://github.com/munaxa/munaxa-docs/pull/168) | `53c44b5` | #167's two commits unchanged, plus the F-3 hash pin |
| munaxa-control | [#7](https://github.com/munaxa/munaxa-control/pull/7) | `f530170` | ADR-0008 Accepted (docs only) |
| munaxa-platform | the reports PR | — | This directory |

## 3. Changes merged

- control#7 → `a24c568` (squash; head SHA pinned `f530170fee7e…`; both checks green).
- platform#27 → `329a8b9` (squash; head `811acf9` pinned; all checks green after updating the branch from main).
- platform#29 → `c41f08d` (squash; head `7af38e0` pinned; all checks green after one re-run of an unrelated timing test).
- docs#168 → `23139a7` (squash; head `53c44b5` pinned; 11 checks green).
- The reports PR (this directory) is merged by the same rule after its checks pass.

## 4. Changes not merged

- docs#167: closed without merge, superseded by docs#168 (its two commits are in #168 unchanged). Its branch is kept.
- Nothing else is open from this pass.

## 5. Tests executed, with results

| Test | Result |
| --- | --- |
| `terraform fmt -check -recursive infra/aws` (local, 1.16.5) | Clean |
| `terraform validate` bootstrap, stack (aws 6.67.0) | Valid |
| `terraform test` stack | 14 passed, 0 failed |
| `terraform test` bootstrap (new) | 3 passed, 0 failed |
| Mutation: P9 sid renamed | The bootstrap test fails, as intended |
| F-3: Docs file sha256 versus the platform header hash | Equal (`a6cf9e96…`) |
| `sha256sum --check --strict` (Docs) | OK |
| Prettier on every changed Markdown and workflow file | Clean |
| platform#27 CI | success on `811acf9`: Format/validate/mocked plan tests, Lint · Typecheck · Test · Build, Façades, Accessibility (runs 41120426983, 41120426980); Plan/Apply skipped (dispatch only) |
| platform#29 CI | success on `7af38e0`: Format, validate, mocked plan tests; Façades; Accessibility; Lint · Typecheck · Test · Build (runs 41146204039, 41146204027). Lint · Typecheck · Test · Build first failed on an unrelated timing test (`packages/platform/security` performance.test.ts:44, 0.1075 against a 0.1 limit; the same job passed on `1cbd551`), and passed on one re-run. Plan/Apply skipped (dispatch only) |
| docs#168 CI | all 11 checks success on `53c44b5` (run 41120856489: lint/typecheck/test/build incl. the new F-3 step, integration on PostgreSQL, five end-to-end shards, container images, release smoke, product isolation, production Terraform workflow check) |
| control#7 CI | Success (run 41121447291: lint/typecheck/test/build and image build) |

No Terraform plan against AWS, no container run, no integration test against AWS.

## 6. Security status (detail: [SECURITY-FINDINGS-AND-REMEDIATION.md](SECURITY-FINDINGS-AND-REMEDIATION.md))

| Id | Status |
| --- | --- |
| P9 | Fixed in code (**merged** as `c41f08d` (head `7af38e0` pinned)). Residual: untagged resources, to be inventoried |
| R-17 | Fixed in code (**merged** as `c41f08d` (head `7af38e0` pinned)) |
| P10 | Fixed in code (**merged** as `c41f08d` (head `7af38e0` pinned)). Confirm at the first refresh after G3 |
| P11 | Partly verified (ids, and the form works for Docs). The owner reads the subject setting before B3 |
| W4 | **merged** as `329a8b9` (head `811acf9` pinned) |
| ADR-0008 | Accepted and merged |
| I2, I3 | Accepted for Testing. Access MFA rule documented (**merged** as `c41f08d` (head `7af38e0` pinned)) |
| S-ROOT | Open: a root session in the AWS connector |
| N-2 | Open: where canteenhub-prod lives, versus the deployer's reach |
| Critical | **None open** |

## 7. Docs replacement

- No test-data migration is required, and none is planned or built.
- The new Docs infrastructure is represented in the shared architecture (`stack/docs.tf`).
- The old Docs infrastructure is **untouched**.
- The retirement conditions are in [DOCS-REPLACEMENT-AND-RETIREMENT.md](DOCS-REPLACEMENT-AND-RETIREMENT.md) §5.

## 8. Cost ([COST-AND-TRANSITION-ANALYSIS.md](COST-AND-TRANSITION-ANALYSIS.md))

Old Docs about US$47.80 a month idle [C]. Testing US$11 to 13 idle plus US$0.21 to 0.30 per session
hour [A]. During the transition, the account totals US$58.80 to 72.80 (above US$50). After retirement,
it totals US$11 to 25 at up to 40 session hours. The US$50 target is achievable **for Testing**, but
not for the whole account while old Docs runs. Nothing was re-measured, because the AWS connector had expired.

## 9. Outstanding blockers

G2 (owner, AWS write), the P11 read, N-2, AWS connector sign-in for the read-only checks, C8 protection,
and G3 to G7 after that. G9 stays closed.

## 10. Decisions still required

TD-2 and TD-3 (before Production), TD-7, TD-9, TD-10, and new TD-11 (canteenhub-prod location) and
TD-12 (cost allocation tags). See DECISIONS-AND-CONFLICTS §3.

## 11. Actions explicitly not performed

No `terraform apply`, and no plan against AWS. No AWS resource created, modified or deleted. No AWS
API call succeeded at all (one read-only attempt failed on sign-in). No KMS key, Secrets Manager, IAM,
ECR, ECS, RDS or budget change. No image published. No deployment. No remote database migration or
seed. No Cloudflare, Render or Supabase change. No GitHub settings change. Old Docs was not touched,
and nothing was retired. canteenhub-prod was not touched.

## 12. Next phase

Phase 3: read-only AWS checks, then the owner's G2 bootstrap apply and the first nonprod plan. See
[NEXT-EXECUTION-PLAN.md](NEXT-EXECUTION-PLAN.md).
