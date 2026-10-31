# Cross-repository dependencies: phase 2, 30 Oct 2026

Baseline: [`../2026-10-30/CROSS-REPOSITORY-DEPENDENCIES.md`](../2026-10-30/CROSS-REPOSITORY-DEPENDENCIES.md).
This file records what changed in this pass and what is still open. "Resolved in code" means merged
to `main`. Nothing is deployed.

## 1. Code dependencies

| # | Consumer → provider | What | Status before | Status now |
| --- | --- | --- | --- | --- |
| D1 | Work → Platform | `OPENAPI_ENABLED=false` on work-api (W4) | platform#27 open | **merged** as `329a8b9` (head `811acf9` pinned) |
| D2 | School → Platform | `school-bootstrap` task for the first platform owner | platform#27 open | **merged** as `329a8b9` (head `811acf9` pinned) |
| D3 | Docs → Platform | Docs services, `docs-db-admin`, `docs-provision`, bucket, task roles in `stack/docs.tf` | Merged (#26) | Unchanged, resolved in code |
| D4 | Platform ↔ Docs | Cluster roles SQL copy (F-3) | Copy only, no drift check | Checked on both sides: docs#168 (**merged** as `23139a7` (head `53c44b5` pinned, 11 checks green)) and platform#29 (**merged** as `c41f08d` (head `7af38e0` pinned)) |
| D5 | Platform (G5) → Docs | A Docs release image with Control licensing; the publish workflow must install `@munaxa/*` | docs#167 stuck | docs#168: **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green). The image itself waits for G5 |
| D6 | Platform → Control | KMS licence key and least-privilege key policy (ADR-0008) | ADR "Proposed"; key policy lacked `GetKeyRotationStatus` | ADR Accepted (control#7, merged `a24c568`); P10 in platform#29 (**merged** as `c41f08d` (head `7af38e0` pinned)) |
| D7 | Control → Platform / Cloudflare | Access team domain and AUD in `operator_access`; Access policy with MFA | MFA not in the instructions | Instructions fixed (platform#29); the application itself is G6 |
| D8 | Work, Control → Identity | Token audiences `munaxa-work,munaxa-control` | Shared token | Unchanged; accepted for Testing (TD-2) |
| D9 | Control → Identity | MFA claim | Always false | Unchanged; Access MFA compensates in Testing (TD-3) |
| D10 | All products → Platform bootstrap | ECR repositories, publisher roles, OIDC subjects (P11) | Unverified subjects | Ids verified; the subject-form setting needs the owner's read (B3) |
| D11 | Platform workflows → Platform bootstrap | `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN` | One role pair | Per environment after platform#29: the nonprod pair as repository variables, the prod pair as `aws-prod` environment variables |

## 2. Run-time order (unchanged in substance; CONTRACT §6)

`db-admin` → `docs-db-admin` → `identity-migrate` → `identity-bootstrap` (Identity runbook steps 1 to 3)
→ `control-migrate` → (KMS public key into tfvars) → control-api and portal → `mxc_` credentials for Work,
School and Docs → `work-migrate` and the first tenant → `school-migrate` → `school-bootstrap` →
`docs-provision` → Docs services.

## 3. Still open across repositories

- G5 images for all five products, from these `main` SHAs or later: Identity `b97b3ab`, Control
  `a24c568`, Work `da84612`, School `54cf3eb`, Docs (main after #168).
- `mxc_` credentials, which need Control running (G7).
- TD-2 and TD-3 Identity work before Production.
