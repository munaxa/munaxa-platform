# Migration guide — Munaxa Docs

> **Nothing in this guide has been executed.** Phase P1 built the platform; migrating Docs is a
> later phase. This describes how it will be done and what to watch.

## Current implementation

Docs is the more modern of the two reference implementations, and several of its ideas are already
in the platform — its `CachePort`, its distributed rate limiting and its CSP work were the direct
input to `@munaxa/cache` and `@munaxa/security`.

| Capability | Docs today | Platform equivalent |
| --- | --- | --- |
| `CachePort` abstraction | Docs-local interface + Redis/memory adapters | `@munaxa/cache` — `CachePort`, `MemoryCache`, `RedisCache`, `TieredCache` |
| Distributed rate limiting | Docs-local, Redis-backed | `RateLimiter` + `BASELINE_RATE_LIMIT_RULES` |
| CSP and security headers | Docs-local middleware with nonce support | `securityHeaders()` / `securityPipeline()` |
| CSRF | Docs-local double-submit | `CsrfProtection` (signed and session-bound) |
| Sessions | Docs-local | `@munaxa/session` |
| Authentication | Docs-local | `@munaxa/auth` |
| Audit | Partial | `@munaxa/audit` |

Because Docs is closest to the platform's design, it is the right product to migrate **first**: the
concept mapping is nearly one-to-one, and the migration validates the platform before School — whose
data is larger and whose downtime is more visible — depends on it.

## Migration steps

### Step 1 — cache (lowest risk, highest confidence)

1. Add `@munaxa/cache` and `@munaxa/interfaces`.
2. Replace the Docs `CachePort` interface with the platform's. The method set is deliberately close;
   expect to reconcile `setIfAbsent` semantics and the `keepTtl` behaviour on `increment`.
3. Keep the existing Redis client. `RedisCache` takes a structural `RedisLike`, so no client change
   is needed.
4. Delete the Docs implementations once nothing imports them.

**Verify:** cache keys are identical before and after — during a rolling deploy, old and new
instances read each other's entries. `cache/test/compat.test.ts` pins the layout; write the Docs
equivalent asserting the *Docs* prefix, and if it differs from `munaxa:`, pass `keyPrefix`.

### Step 2 — security headers and CSRF

1. Replace the Docs header middleware with `securityHeaders()`. Compare the emitted CSP against the
   current one directive by directive; carry any Docs-specific `connect-src` or `img-src` entries
   through the `csp` option rather than weakening the default.
2. Roll the CSP out with `cspReportOnly: true` and a `reportUri` first. Docs renders markup, so this
   is the step most likely to break a page, and report-only makes that visible without breaking it.
3. Swap CSRF last. The platform's tokens are signed and session-bound; existing Docs tokens will not
   verify. Issue platform tokens on the next page load and accept both for one deploy cycle, or
   accept a single forced re-submission for in-flight forms.

**Verify:** the nonce reaches every inline script. `securityPipeline` puts it on the response object
as `cspNonce`; the template layer must read it from there.

### Step 3 — rate limiting

1. Move Docs rules into `RateLimitRule` shape.
2. Keep the rule ids Docs alerts on, or update the alerts in the same change. A renamed rule id
   silently stops firing an alert rather than failing.
3. Wire `onDegraded` to a metric. Docs' current limiter may fail closed — the platform's fails open,
   which is the deliberate difference and needs to be understood before it happens in production.

**Verify:** counters use the same key layout, or accept that limits reset once at deploy.

### Step 4 — sessions and authentication

1. Implement `UserDirectoryPort`, `SessionStorePort`, `RefreshTokenStorePort` and
   `ResetTokenStorePort` against the Docs schema.
2. If Docs hashes passwords with bcrypt or argon2, register the existing verifier on
   `PasswordHasherRegistry`. Logins keep working, and each successful login silently rewrites the
   hash in scrypt. **Do not force a password reset.**
3. Add `tokenVersion` to the Docs user table (default 1) before anything reads it.
4. Move endpoint by endpoint: login, then refresh, then reset, then MFA.

**Verify:** existing sessions survive, or are deliberately not carried over. If the Docs session
record cannot be projected onto `SessionRecord`, choose a maintenance window and sign everyone out —
that is a product decision, not a technical necessity, and it should be made rather than discovered.

### Step 5 — audit

1. Implement `AuditRepositoryPort` over the Docs audit table.
2. Call `AuditService.resume` at startup with the last record per active tenant, or every restart
   begins a new chain and `verifyChain` reports a break at each deploy.
3. Existing records have no chain. Verification starts from the first platform-written record; say
   so in the runbook rather than leaving someone to discover it during an audit.

## Compatibility considerations

- **Cache keys and the rolling deploy.** The one that bites silently: a changed prefix means every
  session lookup misses at once, mid-deploy.
- **Password hashes.** Register the legacy verifier before deploying. Without it, every user is
  locked out.
- **CSRF tokens.** Format change forces re-issue. Plan the overlap.
- **Error responses.** Platform errors are `{ code, message }` with deliberately vague messages. If
  the Docs front end branches on error text, it will need updating — and its current specificity may
  itself be an enumeration oracle worth removing.
- **Rate limit failure mode.** Closed → open. Understand it before the first cache outage.

## Rollback

Each step is independently reversible, which is the reason for the ordering.

1. **Behind a flag.** Use `FeatureFlags` with a percentage rollout for the login path
   (`auth.platform-login`). Roll to 5%, then 50%, then 100%, and keep the old path compiled for a
   full release cycle.
2. **Cache, headers, rate limiting** — revert the deploy. No data changes.
3. **Authentication** — the risk is one-way changes to stored data. `tokenVersion` is additive.
   Rehashed passwords are the exception: once a hash is scrypt, the old code cannot verify it, so
   keep the legacy verifier registered until the rollback window has closed. Roll back with rehashing
   disabled if you have to, and re-enable it on the way forward.
4. **Audit** — records are append-only. A rollback leaves platform-written records in the table;
   they remain readable and verifiable as their own chain segment.

## Definition of done

- No Docs-local implementation of caching, rate limiting, headers, CSRF, sessions or authentication
  remains.
- Docs emits only `SECURITY_EVENTS` names.
- The Docs test suite covers its port implementations against the same behaviours the platform's
  memory implementations satisfy.
- The Docs runbook points at `docs/security-platform/` rather than describing its own mechanisms.
