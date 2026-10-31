# Master execution status: phase 2, 30 Oct 2026

The lead checked PR states, head SHAs and check runs on GitHub during the pass (20:03 UTC on 30 Oct to about
00:05 UTC on 31 Oct). "Deployed" is **No** for every row. No AWS write happened.

## By repository

| Repository | `main` at start | `main` at end | PRs opened or updated | Merged | Not merged | CI (this pass) | Remaining blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| munaxa-platform | `fc393fc` | the reports PR's merge commit (after `c41f08d`) | #27 (updated from main), #29 (new), the reports PR | **#27** → `329a8b9` (head `811acf9` pinned); **#29** → `c41f08d` (head `7af38e0` pinned); the reports PR | None | #27 and #29: all required checks success on their pinned heads (see 01) | G2 (owner, AWS write); P11 subject read; N-2; P9 residual inventory |
| munaxa-control | `739be21` | `a24c568` | #7 (new) | **#7** → `a24c568` (head `f530170` pinned) | — | #7: "Format · Lint · Typecheck · Test · Build" success, "Build the images" success (run 41121447291) | C8 `main` unprotected (owner); KMS public key after G3 |
| munaxa-identity | `b97b3ab` | `b97b3ab` | none | — | — | none run (no change) | G4 signing key; G5; runbook steps after the first migrate |
| munaxa-docs | `406eaee` | `23139a7` | #168 (new); #167 **closed without merge** (superseded by #168, comment posted; branch kept) | **#168** → `23139a7` | #167 (closed, superseded) | all 11 checks success on `53c44b5` (run 41120856489: lint/typecheck/test/build incl. the new F-3 step, integration on PostgreSQL, five end-to-end shards, container images, release smoke, product isolation, production Terraform workflow check) | F-2 release image (G5); `mxc_` credential; Resend or mail out of scope |
| munaxa-work | `da84612` | `da84612` | none | — | — | none run (no change) | G2, G4, G5; Identity and Control first; TD-10 |
| munaxa-school | `54cf3eb` | `54cf3eb` | none | — | — | none run (no change) | G2 to G7; TD-7 |

## By finding

| Finding | Status | Where |
| --- | --- | --- |
| P9 Docs Production reach | Fixed in code: **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29 |
| R-17 per-environment deployers | Fixed in code: **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29 |
| P10 `GetKeyRotationStatus` | Fixed in code: **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29 |
| P11 OIDC subject | Ids verified; the setting needs the owner's read | SECURITY §1 |
| W4 `OPENAPI_ENABLED=false` | **merged** as `329a8b9` (head `811acf9` pinned) | platform#27 |
| School first owner | **merged** as `329a8b9` (head `811acf9` pinned) | platform#27 |
| ADR-0008 | **Accepted, merged** `a24c568` | control#7 |
| R-07b Docs publish pins | **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green) | docs#168 |
| F-3 roles SQL drift | Guarded on both sides: docs#168 **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green), platform#29 **merged** as `c41f08d` (head `7af38e0` pinned) | |
| N-3 Access without MFA rule | Instructions fixed: **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29 |
| I2 audiences, I3 MFA claim | Accepted for Testing; before Production | 03 |

## Owner gates (unchanged unless noted)

| Gate | State |
| --- | --- |
| G2 bootstrap | Open: the next phase |
| G3 to G7 | Open |
| G9 retirement of old Docs | **Closed**. Conditions in DOCS-REPLACEMENT-AND-RETIREMENT §5 |
| TD-1 budget scope | **Closed** by the brief (Testing only); implemented in #29 |
| TD-4, TD-5 | **Closed** in code (#29) |
| TD-6 | **Closed** (control#7) |
