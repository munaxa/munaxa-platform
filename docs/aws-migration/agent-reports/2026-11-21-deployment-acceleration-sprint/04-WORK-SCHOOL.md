# 04. Work and School

## Work

### W-3 custody script: DONE in the repository

On `main` with this PR:
- `scripts/aws/owner/work-testing-secrets.sh`
- `scripts/aws/owner/test/test_work_testing_secrets.py`
- the `aws-terraform.yml` CI step
- the `infra/aws/README.md` G4 entry

The script follows the Control and Docs custody pattern:

| Mode | What it does |
| --- | --- |
| `bundles` | 1. Fills `munaxa-nonprod/work-migrate` (`DATABASE_MIGRATION_URL`, `work_owner`).<br>2. Then fills `munaxa-nonprod/work-api` with `DATABASE_URL` (`work_app`), a generated `PII_MATCH_SECRET` (48 random bytes, base64url) and `CONTROL_PLANE_TOKEN` (hidden input, or a marked placeholder).<br>It writes one version per bundle, reads it back, is resumable and allows one run at a time. It prints version ids only. |
| `replace-key CONTROL_PLANE_TOKEN` | Writes one new work-api version in which only that key changes. `PII_MATCH_SECRET` is never replaced, because rotating it invalidates the stored duplicate-match digests. |
| `status` | Metadata only. |

Checks run on 21 Nov:
- shellcheck: clean.
- Offline tests: 30/30 (fake AWS CLI).
- The Docs suite (23/23) and the Control suite (8/8) still pass alongside it.

### Work path to Testing (after Docs; not executed)

1. Merge work#35, the D-SSL bump, after Alpine ships 3.5.10.
2. Publish the Work images: `image/<sha>` tag and `image-release` approval.
3. The owner runs `work-testing-secrets.sh bundles` (with the `mxc_` credential from a Control session, or the placeholder, followed later by `replace-key`).
4. Work config PR: digests, version ids for the keys `work-migrate` and `work-api`, `db_bootstrap_products` with `"work"` added, and the declaration. Then plan and apply.
5. Work session with W-4 `bootstrap-tenant` for organisation `munaxa-group` (owner approval).

## School

### SC-07 Identity integration: IMPLEMENTED on the API side, draft school#29 (not merged)

school#29 is at head `50bde7c`, one commit on `a22ad9e`. The full design is in munaxa-school
`docs/security/identity-integration.md`.

**What it builds:**
- **Identity tokens accepted by the School API.** The check uses `node:crypto` and applies the same rules as `@munaxa/auth` TokenService: ES256 only, key chosen by `kid`, exact issuer, overlapping audience, `exp`/`iat`/`nbf` with clock skew.
  - `@munaxa/auth` is not yet in School's lockfile, so the shared package could not be used.
  - Configuration is `PLATFORM_AUTH_*`: all four values or none, public keys only.
  - Revocation is checked through Identity introspection (the Work WK-02 port).
- **Organisation to school binding.**
  - New table `TenantPlatformBinding`: unique in both directions, protected by row-level security (RLS), read-only for `munaxa_app` (the migration, `app-role.sql` and `runtime-grants.sql` each revoke writes).
  - New column `User.platformSubject`, unique per school.
  - The token's organisation only filters to its bound school; it never chooses a school by itself.
- **Permissions** come only from the token's `school:` grants.
- **Owner scripts:** `identity:bind` (as the database owner; re-runnable; audited) and `identity:catalogue` (the 120 `school:` grants for Identity's role seed).
- **Licensing:** School already calls Control through `@munaxa/licensing`, exactly like Work, so no code change was needed. The licence's `tenantRef` is the School tenant id.

**Tests run locally:**

| Check | Result |
| --- | --- |
| Unit | 606/606 (70 suites) |
| e2e on PostgreSQL 16 | 339/339, including a new `identity-auth` spec with 12 tests |
| Format, lint, typecheck | pass for `@school/api` and `packages/*` |
| Build | pass |
| SC-04/SC-05 deploy gate | 39/39 |

The admin and munaxademo apps could not be type-checked here (GitHub Packages returned 401). Neither app was changed. CI must prove the full workspace and the images.

**Why it is a draft (risk):**
- School's own login is **off in production unless `SCHOOL_LOCAL_AUTH=enabled`**, and production refuses to start with neither Identity nor this switch.
- School production is on Render, so merging before that variable is set in the Render dashboard would stop the next deploy from starting.
- The admin web and mobile apps still use School's own login.
- Setting the Render variable is a production configuration change: **owner yes required**.

**Owner product decisions** (none blocks the first Testing deployment):
1. Permissions from Identity roles: School's own role editor stops applying to Identity users.
2. Parents and students: Identity accounts, or keep School login?
3. Platform console staff: move to Control?
4. Admin web sign-in flow through Identity.
5. How existing accounts are linked.
6. A per-client audience in Identity.
7. Retiring the Firebase session exchange.

The full 10-step School Testing sequence is in the School document.

### School D-SSL bump

The same `3.5.10-r0` patch as the other products is ready. It is held back from the SC-07 branch
so that it cannot block SC-07's merge: its build fails until Alpine ships. It opens as its own PR
once school#29 has merged and the branch is free.

### Render

Nothing on Render was changed. `render.yaml` and the connected services are untouched, as
instructed. SC-06 (what the staging blueprint should claim) remains an owner decision.
