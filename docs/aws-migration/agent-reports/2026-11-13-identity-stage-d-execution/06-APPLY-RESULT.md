# 06. Apply result (decision A)

The owner approved decision A at 21:42 UTC, then approved both `aws-nonprod` gates.

**Result: STAGE D APPLIED AND VERIFIED (21:45:12 UTC).** Nothing runs: 0 ECS services, 0 tasks, database stopped.

## Run

| Field | Value |
| --- | --- |
| Run | [43513076111](https://github.com/munaxa/munaxa-platform/actions/runs/43513076111), `environment=nonprod`, `action=apply`, ref `main` |
| Commit | `68fa6f93fd55c2480f3a8e6e486b5957539eaafa` (main unchanged since the merge) |
| Plan job | 21:43:38–21:44:24. `Plan: 1 to add, 1 to change, 4 to replace, 0 to destroy.` Same six addresses as run 43509702203. The intent check ran with `--enforce` (`action=apply` with changes): **"The plan matches the declared changes exactly (6 resource action(s))."** Saved plan SHA-256 `18786f25f231900ed3c7a23d72ae3c211a91f5f698e4a17be734bd32228e537b` |
| Apply job | 21:44:39–21:45:15. Plan was for this commit and fresh; the fetched plan's hash matched; `terraform apply` of the saved plan only: "Applied the saved plan of commit 68fa6f9…" |

## Verification (read-only AWS, 21:46–21:48 UTC) [V]

CloudTrail write events since 21:40 UTC: exactly the six planned changes, all by `munaxa-shared-deployer-nonprod/gha-run-43513076111`, with no errors.

| Time | Event | Resource |
| --- | --- | --- |
| 21:45:09 | `secretsmanager:CreateSecret` | `munaxa-nonprod/docs-migrate` (container, **no version, no value**) |
| 21:45:10 | `iam:PutRolePolicy` | `munaxa-nonprod-docs-db-admin-execution` / `execution` |
| 21:45:11 | `ecs:RegisterTaskDefinition` ×4 | the four families below |

| Family | Revisions now ACTIVE | Revision 2 |
| --- | --- | --- |
| `munaxa-nonprod-identity` | 2, 1 | api `@sha256:9a8c6ebd…3c3b`. All six identity secret references and the Valkey `REDIS_PASSWORD` are pinned to `80914756-…`, including `MFA_ENCRYPTION_KEYS`. Env: `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11`, `MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`, `NODE_ENV=production` |
| `munaxa-nonprod-identity-migrate` | 2, 1 | migrate `@sha256:5f3bdcce…b874`; `DATABASE_MIGRATION_URL` pinned to `a3cc6622-…` |
| `munaxa-nonprod-identity-bootstrap` | 2, 1 | api `@sha256:9a8c6ebd…3c3b`; `DIRECT_DATABASE_URL` pinned to `a3cc6622-…`; no MFA env |
| `munaxa-nonprod-db-admin` | 2, 1 | `IDENTITY_APP_URL` pinned to `80914756-…`; `IDENTITY_OWNER_URL` pinned to `a3cc6622-…` |

- Revision 1 of each family stays ACTIVE, which is the rollback point.
- Cluster `munaxa-nonprod`: 0 services, 0 tasks. RDS `munaxa-nonprod-pg`: stopped.

## Effect on the risks

- **S-1:** the pending docs-migrate delta is now applied, so the scheduled `down` switch plan should be empty again [E]. The next scheduled run confirms it.
- **docs-migrate:** the secret has no value yet. The owner writes it before the first docs-db-admin run, as before (CONTRACT).
- **S-2, S-3, B-1:** unchanged.

## Not performed

- No service or task started.
- No migration, bootstrap or db-admin run.
- No secret value written or read.
- No database start or stop.
- No other dispatch.
- No production change.

The first Identity session (stage E) is a separate owner decision.
