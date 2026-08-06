# Migration guide — Munaxa School

> **Nothing in this guide has been executed.** Phase P1 built the platform; migrating School is a
> later phase. This describes how it will be done and what to watch.

## Current implementation

School has the ecosystem's most mature authentication stack, and much of the platform's shape came
from reading it: refresh rotation, session management, the audit trail and password policy were all
proven there first.

That maturity is exactly what makes this migration delicate. School has real users, long-lived
sessions and stored credentials in formats that were chosen before the platform existed.

| Capability | School today | Platform equivalent | Notes |
| --- | --- | --- | --- |
| Password hashing | Product-local (likely bcrypt) | `ScryptPasswordHasher` + `PasswordHasherRegistry` | Transparent upgrade on login |
| Login | `LoginService` (School) | `LoginService` (platform) | Same idea; platform adds dummy-hash timing defence |
| Refresh rotation | School-local | `RefreshTokenService` | Platform adds family revocation on reuse |
| Sessions | School-local | `SessionManager` | Platform adds an absolute deadline |
| Audit trail | School-local | `AuditService` | Platform adds hash chaining |
| Password policy | School-local | `PasswordPolicyService` | Platform adds breach checking |
| Permission guards | School-local | `@munaxa/rbac` | Platform adds policies and scoped assignments |
| MFA | Partial | `MfaService`, `OtpService` | |

## Migration steps

School is a NestJS application, so most of this is provider wiring.

### Step 1 — the ports, with no behaviour change

Implement `UserDirectoryPort`, `SessionStorePort`, `RefreshTokenStorePort`, `ResetTokenStorePort`,
`RoleRepositoryPort`, `RoleAssignmentPort` and `AuditRepositoryPort` over School's existing Prisma
schema. Register them as Nest providers keyed by the `PORTS` tokens.

Ship this on its own. Nothing consumes the ports yet; the deploy is a no-op, and it isolates every
schema-mapping problem into a release that cannot break a login.

Two schema additions are likely:

- `tokenVersion INT NOT NULL DEFAULT 1` on the user table.
- `familyId`, `rotatedAt`, `replacedBy` on the refresh token table, if School's rotation does not
  already track a lineage. Backfill `familyId` per existing token with a fresh value: each becomes a
  family of one, which is correct — they have no known ancestry.

### Step 2 — password hashing

```ts
const registry = new PasswordHasherRegistry(new ScryptPasswordHasher()).registerLegacy('$2b$', {
  id: 'bcrypt',
  hash: (password) => bcrypt.hash(password, 12),
  verify: (password, encoded) => bcrypt.compare(password, encoded),
  needsRehash: () => true,
});
```

Every existing user keeps logging in; each successful login rewrites their hash as scrypt. After a
season, query for remaining `$2b$` hashes — those are dormant accounts, and they can be handled as a
product decision rather than a technical one.

**Never force a password reset for this.** A mass reset email is indistinguishable from a phishing
campaign, and it trains users to click reset links.

### Step 3 — authentication services

Replace School's services with the platform's, one endpoint at a time, behind
`FeatureFlags`:

1. **Login** — platform `LoginService`. Watch for behaviour changes School's tests may encode:
   errors are now uniform (no "user not found"), and the unknown-account path performs real work.
2. **Refresh** — platform `RefreshTokenService`. The new behaviour is **family revocation on
   reuse**. Expect a small rise in unexpected sign-outs on rollout: some will be genuine detection,
   and some will be clients that legitimately retry a refresh after a network timeout. If the
   support volume is real, the fix is client-side single-flight refreshing, not weakening detection.
3. **Reset** — platform `PasswordResetService`. Existing School reset tokens will not verify;
   outstanding links break. Announce it, or run both verifiers for one token lifetime.
4. **MFA** — platform `MfaService`. TOTP parameters match RFC 6238 defaults (SHA-1, 6 digits, 30
   seconds); if School used the same, enrolments carry over unchanged. **Verify this before
   deploying** — a mismatch invalidates every enrolled authenticator app, and the fix is a
   re-enrolment campaign.

### Step 4 — sessions

The platform adds an **absolute timeout** (12 hours by default). If School has only an idle timeout,
sessions that have been alive for weeks will end at the first validation after deploy.

Options, in order of preference:

- Deploy during a low-traffic window and accept one round of sign-ins.
- Set `absoluteTimeout` high initially (`SESSION_POLICY_CEILING.absoluteTimeout` is 30 days) and
  tighten it over subsequent releases.
- Backfill `absoluteExpiresAt` on existing rows as `createdAt + 30d`, then tighten.

### Step 5 — RBAC

School's permission model maps onto `resource:action`. Two things to get right:

- School's roles become `RoleDefinition`s. Where School has a role per scope
  ("teacher of course 42"), use a **scoped assignment** instead: one `teacher` role, assigned with
  `scope: 'course-42'`, which resolves to `courses:grade:course-42`.
- Call `PermissionResolver.invalidateUser` everywhere School mutates a role assignment. Missing one
  leaves a revoked teacher with access for the cache TTL.

### Step 6 — audit

Implement `AuditRepositoryPort`, call `resume` at startup, and add the platform's exporters. School's
existing records stay queryable; the chain starts from the first platform-written record.

## Compatibility considerations

| Change | Effect | Mitigation |
| --- | --- | --- |
| bcrypt → scrypt | None, if the legacy verifier is registered | Register it *before* deploying |
| Refresh reuse detection | Some users signed out unexpectedly | Client-side single-flight refresh |
| Absolute session timeout | Long-lived sessions end | Start high, tighten over releases |
| Uniform auth errors | Front end branching on messages breaks | Update the front end first |
| Reset token format | Outstanding links break | Announce, or dual-verify for one lifetime |
| TOTP parameters | Enrolments break if they differ | **Verify before deploying** |
| Breach checking | Some password changes now rejected | Expected; the message names the reason |

## Rollback

School carries the most user-facing risk, so every step is behind a flag and every schema change is
additive.

1. **Flag per capability** — `auth.platform-login`, `auth.platform-refresh`, `auth.platform-reset`,
   `session.platform-manager`. Roll each to 5% → 50% → 100% over separate releases.
2. **Additive schema only.** `tokenVersion` and the refresh-token lineage columns are new columns
   with defaults; the old code ignores them, so a rollback is a deploy revert.
3. **The one-way door is password rehashing.** Once a hash is scrypt, pre-migration School code
   cannot verify it. Keep both verifiers registered for at least one full release cycle *after* the
   rollback window closes, and keep the ability to disable rehashing without disabling the platform
   login path.
4. **Sessions.** Rolling back the session manager signs users out — the platform's records are not
   readable by School's old code. Treat this as the step with the longest bake time.

## Definition of done

- School has no product-local authentication, session, audit or RBAC framework.
- Every user's password hash is scrypt, or their account is dormant and knowingly so.
- School emits only `SECURITY_EVENTS` names, and its dashboards read them.
- The absolute session timeout is at the platform default.
