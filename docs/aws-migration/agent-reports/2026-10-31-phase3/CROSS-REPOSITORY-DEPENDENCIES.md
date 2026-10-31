# Cross-repository dependencies: phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Baseline: [`../2026-10-30-phase2/CROSS-REPOSITORY-DEPENDENCIES.md`](../2026-10-30-phase2/CROSS-REPOSITORY-DEPENDENCIES.md).

## 1. Code dependencies

| # | Consumer → provider | What | Phase 2 | Now |
| --- | --- | --- | --- | --- |
| D1 | Work → Platform | `OPENAPI_ENABLED=false` | merged `329a8b9` | Re-verified on main (`services.tf:536`) [V] |
| D2 | School → Platform | `school-bootstrap` task | merged `329a8b9` | Re-verified (`ops.tf:298-369`) [V] |
| D3 | Docs → Platform | Docs in `stack/docs.tf` | merged | Unchanged [V] |
| D4 | Platform ↔ Docs | Vendored cluster roles SQL (F-3) | guarded both sides | Hashes equal and bodies identical at platform `cc59c7f` / docs `23139a7` [V] |
| D5 | Platform (G5) → Docs | Release image with Control licensing | docs#168 merged | Image still waits for G5 [V] |
| D6 | Platform → Control | KMS licence key policy (P10), ADR-0008 | merged | Re-verified (`services.tf:230`; ADR Accepted at `a24c568`) [V] |
| D7 | Control → Cloudflare | Access app with MFA | instructions fixed | Re-verified (`cloudflare-access.md:35-40`) [V]; applied at G6 [O] |
| D10 | Products → Platform bootstrap | ECR repositories, publisher roles, OIDC subjects | ids verified; form unverified | **Subject form verified by issued tokens** in all five repositories (SECURITY §2) [V] |
| D11 | Platform workflows → bootstrap outputs | `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN` from the maps | per environment | Re-verified in `aws-terraform.yml` and `aws-session.yml` [V]; README order amended (platform#31) |
| D12 (new) | Platform bootstrap → account | Deployer deny for other projects (N-2) | — | platform#31 |
| D13 (new) | Docs bootstrap ↔ Platform bootstrap | Two account-wide budgets after G2 (`munaxa-account-monthly` US$10 in Docs state; `munaxa-shared-account-monthly` US$50) | — | Both kept (brief); TD-13 |
| D14 (new) | Platform bootstrap → Docs bootstrap | The GitHub OIDC provider is created by the Docs bootstrap (`Project = MunaxaDocs`) and only **read** by the platform bootstrap (as root). The deployer never needs it | — | [V] code |

## 2. Main SHAs this phase builds on [V]

| Repository | `main` | Last push CI on main |
| --- | --- | --- |
| munaxa-platform | `cc59c7f` (phase 2 reports, #30), then platform#31 | `c41f08d`: run 41147461520 **failure** (timing test, see MASTER); `cc59c7f`: no push run (Markdown-only, `paths-ignore`) |
| munaxa-control | `a24c568` | run 41122329528 success |
| munaxa-identity | `b97b3ab` | unchanged since phase 2 |
| munaxa-docs | `23139a7` | run 41123171477 success |
| munaxa-work | `da84612` | unchanged since phase 2 |
| munaxa-school | `54cf3eb` | unchanged since phase 2 |

## 3. Run-time order (unchanged)

G2 bootstrap → environments, then variables → first nonprod plan → G3 persistent layer → G4 secret
values → G5 images (Identity `b97b3ab`, Control `a24c568`, Work `da84612`, School `54cf3eb`, Docs
`23139a7` or later) → G6 Cloudflare → G7 first session (`db-admin` → `docs-db-admin` →
`identity-migrate` → `identity-bootstrap` → `control-migrate` → licence public key → Control →
`mxc_` credentials → `work-migrate` → `school-migrate` → `school-bootstrap` → `docs-provision`).
