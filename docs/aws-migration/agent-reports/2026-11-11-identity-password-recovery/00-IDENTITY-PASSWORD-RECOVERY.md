# Identity password recovery and password change (Agent 2)

Date: 11 Nov 2026. Repository: `munaxa/munaxa-identity`. Part of the Identity security-hardening
assignment (Agent 2 of 4: password recovery and password change). Independent review by Agent 4.

**Status: implemented, tested, reviewed, merged. Not deployed.** No AWS, Terraform, secrets, IAM,
DNS, deployment, workflow-dispatch or live-database operations were performed.

## 1. Merged PRs

| PR | Head reviewed and merged | Squash commit on main | Review |
| --- | --- | --- | --- |
| [identity#9](https://github.com/munaxa/munaxa-identity/pull/9) password reset with atomic completion and fail-closed delivery | `d42d63e26a11d8b44c04e6d45adfceddbeb8060c` | `9639ccbeec9c1fcddf8c0b0996ae38e16947f064` | Agent 4 approved 272abd6, 7bffd5d (after main merge) and d42d63e (after #10 merge). No critical/high. M-1, M-2 resolved as docs |
| [identity#11](https://github.com/munaxa/munaxa-identity/pull/11) authenticated password change | `819e0195737213bda91a0f7400a11181f8dbf617` | `51fbcd0e993d9935c60cca2f5ee872c169231ed0` | Agent 4 approved at 819e019. Medium M-1 (no MFA step-up) assigned to MFA PR 2 |

Each merge happened only after Agent 4 approved the exact head SHA and CI `verify` was green on it.

## 2. Architecture changes

- **`PrismaService.unitOfWork(tenantId, work)`** (identity#9). One PostgreSQL transaction, held in
  `AsyncLocalStorage`. Every `withTenant` for the same tenant inside it joins that transaction; a
  different tenant throws; nesting throws. This is how Platform's multi-call sequences become
  atomic without changing Platform or duplicating its logic.
- **Atomic reset completion.** Platform's `PasswordResetService.complete()` is five separate port
  calls (claim token, write password, bump token version, revoke other reset tokens, `onReset`).
  Identity runs: lock account row `FOR UPDATE`, re-check account is not disabled, Platform
  `complete()`, and `CredentialRevocation.revokeAllForUser(..., 'password-reset')` (every session
  and refresh lineage), all in one `unitOfWork`. A failure or crash at any point rolls everything
  back; the link remains usable.
- **No Platform PR was needed.** The atomicity is achieved by the transaction boundary around
  unchanged Platform code.
- **Request path** answers `202` after only input-shape and rate-limit checks, then performs the
  organisation/account lookup, token write and email in the background. Same status, body and
  latency for known, unknown and disabled accounts and unknown organisations.
- **Delivery port** = Platform `NotificationTransportPort` (`apps/api/src/delivery/email.ts`).
  Transports: `none` (recovery unavailable, no tokens written) and `outbox` (dev only, 0600 JSON
  files, refused in production). Failed delivery after bounded retries revokes the token.
- **Links** built only from `IDENTITY_PASSWORD_RESET_URL`, never from `Host`/`X-Forwarded-Host`.
- **GET never consumes.** `GET /reset` inspects and renders a form; the token moves to a hidden
  field; `POST /reset` consumes it.
- **Abuse limits** in the shared cache: 5/h per IP and 3/h per (organisation, identifier digest)
  on `POST /forgot`; edge baseline `password-reset-per-ip` on `/reset`; 5 per 15 min per account
  on `POST /password/change`. All fail closed (503) when the cache is unreachable.
- **Password change** (identity#11): `resolvePrincipal` (from identity#8), then in one
  `unitOfWork`: lock account, Platform `LoginService.changePassword` (current password, policy,
  breach check, hash, token-version bump), revoke outstanding reset links, revoke every session
  and refresh lineage including the caller's. Cookies cleared; user signs in again.

Routes: `GET/POST /api/auth/password/forgot`, `GET/POST /api/auth/password/reset`,
`POST /api/auth/password/change`.

## 3. Database migrations

None. `identity_reset_token` already existed in the baseline migration with RLS and the needed
grants. No migration was run against any live database.

## 4. Tests and CI evidence

| Suite | New tests | Notes |
| --- | --- | --- |
| `packages/testing/src/password-recovery.integration.test.ts` | 28 | Real Postgres as the restricted app role |
| `packages/testing/src/password-change.integration.test.ts` | 6 | |
| `packages/config/src/password-recovery.test.ts` | 10 | Fail-closed configuration |

Covered: known/unknown/disabled/unknown-org identical responses; response returned while the
lookup is blocked (timing); byte-identical HTTP responses with a poisoned `Host`; link from
configuration only; only newest of multiple links valid; token hashed at rest; delivery failure
revokes the token; no transport writes nothing; per-identifier and per-IP limits; limiter outage
fails closed; no token/address/link in logs; GET inspected 5 times without consumption;
cross-organisation token refused; sessions, refresh lineages, token version after reset; single
use; 8 concurrent completions exactly one winner; expiry; policy and breach rejection without
spending the link; disabled-after-issue refused; **atomicity** with injected failure at
revocation, token-version bump and hashing, and with `pg_terminate_backend` of the transaction's
connection mid-way (simulated crash), each asserting no state changed; unit-of-work tenant and
nesting refusals; outbox file mode and no-overwrite; password change revokes all incl. current
session and reset links, wrong current password changes nothing, no session refused,
policy/breach, rate limit and fail-closed, rollback on injected failure.

CI `verify` (GitHub Actions, full repository checks: format, lint, prisma generate, typecheck,
build, migrations from zero, prisma validate, unit, integration, catalogue drift, key and secret
scans, `pnpm audit`): green on identity#9 head d42d63e (run 43025680427) and on identity#11 head
819e019 (run 43026102739).

Local replica of `ci.yml` (Postgres 16, Redis 7, same roles and grants, Platform 2.4.1 built from
source because the package registry is not reachable from the session) at the identity#11 head:
43 unit and 175 integration tests passing.

## 5. Security review findings and resolutions

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| #9 M-1 | Medium | Reset token in the link query string; ALB/CDN access logs and browser history can hold it | Documented as a blocking deployment prerequisite in `docs/runbooks/password-recovery.md`: keep LB/CDN access logs off this path or treat them as secret. Token moves to a form field after the first GET |
| #9 M-2 | Medium | Default `enabled` + no production transport means production refuses to start | Documented as a blocking prerequisite: set `IDENTITY_PASSWORD_RESET=disabled` in production; reset is unusable in production until an SES task-role transport exists |
| #9 L-1 | Low | Background queue full drops requests with a log only | Accepted; noted in runbook |
| #11 M-1 | Medium | Password change has no TOTP step-up for MFA-enrolled accounts | Assigned to MFA PR 2 (Agent 1); Agent 4 holds that PR to it |
| #11 Lows | Low | Two informational items on the PR | Accepted, no code change |

No critical or high findings.

## 6. Remaining risks

- **No production email transport.** Reset is disabled in production until an SES v2 adapter
  using the ECS task role exists (needs a new dependency and lockfile update with registry access,
  plus SES identity, DKIM, sandbox exit, IAM `ses:SendEmail` with `ses:FromAddress` condition, and
  a network route to SES).
- Reset token in the email link query string (see #9 M-1).
- Access tokens already issued remain valid until expiry (15 min default) at services that only
  verify signatures; Identity's own routes and refresh refuse them at once.
- `PASSWORD_HISTORY` not enforced (pre-existing: no history store wired).
- `@munaxa/notifications` not adopted (same lockfile constraint); Identity's `sendEmail` does
  bounded retries.
- Password change lacks MFA step-up until MFA PR 2.

## 7. Production deployment prerequisites (exact)

1. Task definition env: `IDENTITY_PASSWORD_RESET=disabled` for every `NODE_ENV=production`
   Identity task built from main at or after 9639ccb. Without it, Identity exits at startup.
2. Do not set `IDENTITY_EMAIL_TRANSPORT=outbox` on any deployed environment (refused in
   production anyway).
3. Before ever enabling reset: build and review the SES task-role transport; set
   `IDENTITY_PASSWORD_RESET_URL` (https, origin in `CSRF_TRUSTED_ORIGINS`, no query/fragment) and
   `IDENTITY_EMAIL_FROM`; ensure ALB/CDN access logs do not capture query strings on
   `/api/auth/password/reset` or are treated as secret.
4. No new secret. The reset-token pepper is the existing `IDENTITY_SIGNING_SECRET`.

## 8. Confirmation

No AWS API calls, Terraform plan/apply, CloudFormation, ECS, RDS, Secrets Manager, KMS, IAM,
network, DNS, Cloudflare, secret creation or retrieval, workflow dispatch, image publish,
deployment or live-database migration was performed by this work. Email provider credentials were
not invented. Test data only.
