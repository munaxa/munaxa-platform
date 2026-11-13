# 01. Current state (13 Nov 2026, 14:50 to 16:00 UTC)

Legend: **[V]** verified by Claude in GitHub or the repository, **[W]** reported by a workflow run, **[L]** local test, **[E]** expectation, **[O]** owner action.

The source of truth was `2026-11-13-identity-cve-2026-4738-remediation/` (all nine files read). The live repositories were checked against it. Nothing newer supersedes it: it is the newest folder in the index, and no PR or commit after `b2d93aa` changes Identity, the stack or the runbook [V].

## Latest `main` commits

| Repository | `main` | CI on `main` |
| --- | --- | --- |
| munaxa-platform | `b2d93aa` docs(agent-reports): Identity CVE-2026-4738 remediation (#120) | **CI failed** (run 43362019028): one wall-clock test, `@munaxa/rbac` `performance.test.ts` "checks against a large grant set in microseconds", measured 7513 ms against a 7500 ms bound [V]. The commit is documentation only. This is the second wall-clock flake in a week (the earlier one was in `@munaxa/security`). Not related to this task; a follow-up should widen or remove such bounds |
| munaxa-identity | `2db6ed9` fix(image): pin the base by digest and take zlib 1.4-r0 (#20) | **green** (run 43323607151) [V] |
| munaxa-control | `1f58c90` docs: ADR-0008 is accepted (#8) | not re-run since (no change) |
| munaxa-work | `eabcc47` fix(security): bind grants to their organisation (#31) | not re-run since (no change) |

## Open PRs

| PR | State | Relevance |
| --- | --- | --- |
| munaxa-platform#98 | open since 11 Nov | the password-recovery report; documentation only, unrelated to P-5 |
| munaxa-identity#19, munaxa-work#32, munaxa-control#9 | **draft** | package-token hardening (per-run `GITHUB_TOKEN` with `packages: read` instead of `PLATFORM_PACKAGES_TOKEN`). Blocked on the owner granting each `@munaxa` package **Read** access for these repositories under "Manage Actions access" (thread "Secure package tokens and publish Identity images"; list in project files `reports/2026-11-12-identity-image-publication/OWNER-ACTION-package-read-access.md`). Not touched here |
| **munaxa-platform#121** | draft, opened by this task | P-5 (05) |

## Terraform implementation and NonProduction configuration [V]

- `infra/aws/stack`, Terraform `~> 1.16.5`, hashicorp/aws `~> 6.67`. Backend S3 `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate`, KMS alias `munaxa-shared-tfstate`, `use_lockfile = true`, region `eu-central-1`. Both provider configurations pin `allowed_account_ids = [var.account_id]` = `229251310592`.
- `envs/nonprod.tfvars` on main: `services_enabled = false`, `edge_enabled = false`, Identity only (`desired_counts.identity = 1`, the rest 0), images = the **8 Nov `5277d71` images** (`71d01fdf…`, `d175ef37…`), `identity_security_config` commented out, `secret_version_ids.identity = ad02f18e-…`, `identity-migrate = a3cc6622-…`.
- `identity_security_config` (AW-01, platform#102): `{ mfa_primary_kid, mfa_policy, mfa_privileged_roles = [] }`, null by default. When set: `MFA_ENCRYPTION_KEYS` joins the bundle's key list (`data.tf:171`), the task gets the secret reference, `MFA_ENCRYPTION_PRIMARY_KID`, `MFA_POLICY` and the fixed `IDENTITY_PASSWORD_RESET=disabled` (`services.tf:99`).
- `envs/nonprod.expected-changes.json` on main still declares Config A1 (22 creates, applied 10 Nov).

## The state matches main, plus the known docs-migrate delta [V, from a real plan run by the schedule]

The scheduled `aws-session.yml` `down` (run 43396042072, 13 Nov 08:48 UTC, on `b2d93aa`, as `munaxa-shared-deployer-nonprod-session`) ran a **real** plan of the at-rest switches. Its summary:

```
Plan: 1 to add, 1 to change, 0 to replace, 0 to destroy.
| update | aws_iam_role_policy.docs_db_admin_execution[0] |
| create | aws_secretsmanager_secret.service["docs-migrate"] |
::error::the session plan changes more than the session: ...
```

This is the pending L-5 delta recorded in `infra/aws/CONTRACT.md`. Everything else in the state equals main's configuration. That is the best available evidence for "current Terraform configuration versus deployed infrastructure" while the AWS connector is down (02).

**Finding S-1 (Medium, operational, pre-existing).** Since platform#105 merged (12 Nov 08:51), every scheduled Testing `down` fails at "Plan the switches" (runs 43186450457, 43337833043, 43396042072). The job's separate "Stop the database" step still runs and reported `database munaxa-nonprod-pg: stopped` each time [W]. So the database shutdown still works, but the Terraform part of the GitHub backstop cannot run until the delta is applied (stage D, P-6). The EventBridge backstop (21:00 UTC) is separate and is a Stage R check. Nothing is running at rest, so there is nothing for `down` to switch off today. The P-5 declaration includes the delta, so stage D clears it.

## Identity image publisher and the latest digests [V]

`publish-images-ecr.yml` at `2db6ed9`: tag-triggered (`image/<sha>`), the commit must be on main, protected environment `image-release` (approved by `tam2om`), immutable tags `<short>` and `sha-<full>`, `verify-image.sh` on the pushed digest. Run 43359947421 job logs report (re-read today):

| Job | `containerimage.digest` | Base |
| --- | --- | --- |
| `munaxa-identity/api` (job 131670838386) | `sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b` | `node:22-alpine@sha256:1314fb30…` |
| `munaxa-identity/migrate` (job 131670838297) | `sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874` | the same |

## Testing runbook and expected changes

`2026-11-12-phase-c-d-preparation/03-NONPROD-DEPLOYMENT-RUNBOOK.md` (stages A, B, R, C, D, E) is current. Stages A (Platform 2.5.0) and B (images, now from `2db6ed9`) are done. The plan expectation in `2026-11-12-identity-image-publication/06` §3 (1 create, 1 update, 3 replacements; no IAM change for Identity) is confirmed here offline (06).

One runbook line needs a reading, recorded here rather than by editing an older report: runbook 03 §5 "stop on any destroy" means any destroy **other than** the three declared task-definition replacements (which `skip_destroy` keeps registered).
