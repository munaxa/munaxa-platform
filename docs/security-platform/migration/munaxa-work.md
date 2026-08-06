# Migration guide — Munaxa Work

> **Nothing in this guide has been executed.** Phase P1 built the platform; migrating Work is a
> later phase. This describes how it will be done and what to watch.

## Current implementation

Work is the least mature of the three security-wise, which changes the shape of this migration
entirely: for Docs and School the task is *replacing* working implementations, and for Work it is
mostly *adopting* capabilities it does not have.

| Capability | Work today | After migration |
| --- | --- | --- |
| Authentication | Product-local, minimal | `@munaxa/auth` |
| Sessions | Likely token-only, no server-side state | `@munaxa/session` |
| RBAC | Ad hoc role checks in handlers | `@munaxa/rbac` |
| Audit | Little or none | `@munaxa/audit` |
| Rate limiting | Little or none | `@munaxa/security` |
| Security headers | Framework defaults | `securityHeaders()` |
| MFA | None | `MfaService` |

Being behind is an advantage here: there is less to unpick, fewer stored formats to preserve, and
the migration can adopt the platform's defaults rather than negotiate with existing behaviour.

**Sequence Work third.** Docs proves the platform against a modern codebase; School proves it under
real load and real data. Work then adopts a platform that two products have already exercised.

## Migration steps

### Step 1 — the edge, first and immediately

Work benefits most and risks least here, so do it first:

```ts
const pipeline = securityPipeline({
  rateLimiter: new RateLimiter({ cache, rules: [...BASELINE_RATE_LIMIT_RULES] }),
  trustedOrigins: config.MUNAXA_TRUSTED_ORIGINS,
  apiOnly: false,
  scanBodies: true,
  onEvent: (event) => audit.write(edgeEvent(event)),
});
```

That is headers, CSP, rate limiting, origin checking and threat tripwires in one change, on a
codebase that currently has close to none of them. Roll the CSP out with `cspReportOnly: true` first.

### Step 2 — audit, before anything else changes

Wire `AuditService` with a repository and the logging sink early, even before authentication moves.
Two reasons: it starts producing a trail immediately, and it means the authentication migration
itself is auditable.

### Step 3 — authentication and sessions together

Because Work has no meaningful session infrastructure, this is closer to a build than a migration:

1. Implement `UserDirectoryPort` over the Work user table. Add `tokenVersion` (default 1).
2. Implement `SessionStorePort` and `RefreshTokenStorePort` — likely new tables.
3. Wire `LoginService`, `SessionManager`, `TokenService`, `RefreshTokenService`.
4. Adopt the platform defaults wholesale. Work has no legacy behaviour to preserve, so there is no
   reason to configure anything down.

If Work currently issues a long-lived JWT with no server-side session, the change is significant and
worth stating plainly: access tokens become short-lived, refresh becomes a real endpoint, and the
client must handle a 401 by refreshing rather than by signing the user out. Do the client work
first.

### Step 4 — RBAC

Work's ad hoc checks (`if (user.role === 'admin')`) become permissions:

1. Enumerate every role check in the codebase. This is the bulk of the work and is worth doing as
   its own reviewable change.
2. Map them to `resource:action` permissions.
3. Define roles, starting from `defaultRoles()` and adding Work's own.
4. Replace each check with `authorizer.require(context, { permission })`.
5. Turn on `authorizationMiddleware` with `fallbackDeny: true` **last** — it will surface every
   endpoint you missed, which is the point, and it should surface them in staging.

### Step 5 — MFA and password policy

New capability. Roll out as opt-in first, then required for administrators, then per tenant policy.

`PasswordPolicyService` will reject passwords that Work currently accepts (under 12 characters, or
in a breach corpus). That only applies at *set* time — existing passwords keep working until they are
changed, which is the correct behaviour and not something to work around.

## Compatibility considerations

- **Session model change.** The largest one. Long-lived token → short access token plus refresh.
  Client work precedes server work.
- **Authorization tightening.** `fallbackDeny` will find unmapped endpoints. Staging first.
- **Password policy at set time.** Sign-ups and password changes get stricter; existing logins do not.
- **Rate limits where there were none.** Some integrations may be making more requests than anyone
  realised. Run in report-only — log `security.ratelimit.exceeded` without enforcing — for a week
  before enforcing.
- **Headers.** A strict CSP on a codebase that has not had one will break something. Report-only
  first, and read the reports.

## Rollback

Work's migration is additive, so rollback is mostly a deploy revert.

1. **Edge** — revert the deploy. No data changes.
2. **Audit** — additive; leave the records.
3. **Authentication and sessions** — the one step needing care, because it introduces tables and
   changes the client contract. Keep the old login path behind `auth.platform-login` and keep the
   client able to handle both shapes for a full release cycle. New tables are additive and can be
   left in place after a rollback.
4. **RBAC** — keep `fallbackDeny: false` until the endpoint map is complete in production. Flipping
   it is a one-line, instantly reversible change; that is the intended shape of the risk.
5. **MFA** — opt-in, so a rollback affects only the users who enrolled. Keep their enrolments; they
   remain valid when the feature returns.

## Definition of done

- Work runs `securityPipeline` on every route.
- Every role check goes through `Authorizer`; `fallbackDeny` is on.
- Sessions are server-side and revocable; access tokens are short-lived.
- Work emits `SECURITY_EVENTS` names into a hash-chained trail.
- MFA is available, and required for administrators.
