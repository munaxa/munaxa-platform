# AWS migration, phase 2 execution reports: 30 Oct 2026

This package reports on the second execution pass on 30 Oct 2026 (20:03 UTC to about 00:05 UTC on 31 Oct). The
lead orchestrator ran it from one session. It follows the first pass, whose reports are in
[`../2026-10-30/`](../2026-10-30/) (merged in #28, `fc393fc`). The first pass's reports are the
baseline and are **not** changed here.

- **Scope:** code, Terraform, CI and documentation in munaxa-platform, munaxa-control,
  munaxa-identity, munaxa-docs, munaxa-work and munaxa-school, plus read-only inspection of GitHub.
- **AWS:** none. This phase made **no AWS write and no infrastructure change**. Read-only AWS checks
  were also impossible: the AWS connector's sign-in had expired (errors at about 20:20 UTC and again at 23:45 and 23:56 UTC), so every AWS
  figure here is carried over from the 29 Oct measurement or from earlier estimates, and marked as such.
- **Security note:** when it works, the AWS connector is signed in as the **root** user of account
  `229251310592`. This pass used it for read-only calls only, and the attempt failed. A root session
  in a tool is a standing risk, recorded as S-ROOT in
  [SECURITY-FINDINGS-AND-REMEDIATION.md](SECURITY-FINDINGS-AND-REMEDIATION.md).

Each claim is marked **[V]** (verified in this pass, with the evidence named), **[C]** (carried
over from the 30 Oct baseline, not re-verified), **[A]** (assumption or estimate) or **[R]**
(recommendation).

## Files

| File | What it holds |
| --- | --- |
| [00-lead-orchestrator.md](00-lead-orchestrator.md) | Consolidated execution report and final status |
| [01-aws-platform-terraform.md](01-aws-platform-terraform.md) | munaxa-platform: P9, R-17, P10, P11, F-3, platform#27 and #29, the budget |
| [02-control-plane.md](02-control-plane.md) | munaxa-control: ADR-0008 accepted (control#7), main still unprotected |
| [03-identity.md](03-identity.md) | munaxa-identity: token audiences, MFA via Cloudflare Access, the limits accepted for Testing |
| [04-munaxa-docs.md](04-munaxa-docs.md) | munaxa-docs: the #167 head fault, docs#168, F-3, licensing in the image, shared-stack representation |
| [05-munaxa-work.md](05-munaxa-work.md) | munaxa-work: OPENAPI_ENABLED, authentication and authorization, configuration |
| [06-munaxa-school.md](06-munaxa-school.md) | munaxa-school: the `school-bootstrap` first-owner task |
| [07-security-cost-integration-review.md](07-security-cost-integration-review.md) | The lead's review of this pass's own changes. It is **not** independent; see its header |
| [CROSS-REPOSITORY-DEPENDENCIES.md](CROSS-REPOSITORY-DEPENDENCIES.md) | Dependencies across repositories, and which ones are now resolved |
| [DECISIONS-AND-CONFLICTS.md](DECISIONS-AND-CONFLICTS.md) | Decisions applied, decisions still open, conflicts found |
| [MASTER-EXECUTION-STATUS.md](MASTER-EXECUTION-STATUS.md) | One status table across every repository and workstream |
| [NEXT-EXECUTION-PLAN.md](NEXT-EXECUTION-PLAN.md) | The single next phase recommended (G2 bootstrap), with prerequisites and exact steps |
| [DOCS-REPLACEMENT-AND-RETIREMENT.md](DOCS-REPLACEMENT-AND-RETIREMENT.md) | The clean Docs rebuild, no data migration, and the conditions for retiring the old stack |
| [SECURITY-FINDINGS-AND-REMEDIATION.md](SECURITY-FINDINGS-AND-REMEDIATION.md) | Every open and closed finding, with status and evidence |
| [COST-AND-TRANSITION-ANALYSIS.md](COST-AND-TRANSITION-ANALYSIS.md) | Costs during the transition and after retirement, and safe reductions |

## Pull requests in this pass

| PR | Repository | What | Outcome |
| --- | --- | --- | --- |
| [#27](https://github.com/munaxa/munaxa-platform/pull/27) | munaxa-platform | Work API `OPENAPI_ENABLED=false`; `school-bootstrap` task | **merged** as `329a8b9` (head `811acf9` pinned) |
| [#29](https://github.com/munaxa/munaxa-platform/pull/29) | munaxa-platform | P9, R-17, P10, F-3 check, Testing budget, Access MFA rule, bootstrap tests | **merged** as `c41f08d` (head `7af38e0` pinned) |
| [#168](https://github.com/munaxa/munaxa-docs/pull/168) | munaxa-docs | Replaces #167 (same two commits) plus an F-3 hash pin | **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green) |
| [#167](https://github.com/munaxa/munaxa-docs/pull/167) | munaxa-docs | Head stuck at `6f0ea79` | **closed without merge** (superseded by #168, comment posted; branch kept) |
| [#7](https://github.com/munaxa/munaxa-control/pull/7) | munaxa-control | ADR-0008 status: Accepted | **merged** as `a24c568` (head `f530170` pinned, checks green) |
| This report's PR | munaxa-platform | This directory | See the PR on GitHub |
