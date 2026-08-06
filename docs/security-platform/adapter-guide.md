# Writing an adapter

An adapter is the code that connects a platform port to your database, cache or queue. This guide
covers the four adapters that carry a security guarantee, the exact statement each one needs, and
how to prove yours is correct before it reaches production.

Read [distributed guarantees](./distributed-guarantees.md) first. This document assumes you know
what `@atomicity compare-and-swap` means and why it is not optional.

## Start with the conformance suite

Write the test before the adapter. `@munaxa/conformance` is the specification in executable form,
and it will fail on the implementation you were about to write.

```ts
// test/redis-cache.conformance.test.ts
import { describe, it, expect } from 'vitest';
import { runCacheConformance } from '@munaxa/conformance';
import { RedisCache } from '../src/redis-cache.js';

runCacheConformance(
  { describe, it, expect },
  {
    // A fresh, empty cache per test. A shared key prefix per run is usually enough.
    createCache: () => new RedisCache(client, { keyPrefix: `conformance:${randomUUID()}:` }),
    // Omit for a real server with real TTLs — the expiry tests skip themselves.
    advance: undefined,
    // Raise it against a real server; the default is tuned for an in-process store.
    concurrency: 200,
  },
);
```

Five suites ship today: `runCacheConformance`, `runAuditConformance`, `runRefreshTokenConformance`,
`runResetTokenConformance` and `runSessionConformance`. The platform's own memory adapters run all
five (`packages/platform/conformance/test/memory-adapters.test.ts`) — they are the reference
implementations, so "behave like the memory store" is advice you can actually check.

Run the suites against a **real** instance of your backing, not a fake. The properties being tested
are properties of the storage engine, and a mock cannot fail the way Redis can.

## `CachePort`

### `setIfAbsent` — the one that matters

```
SET key value NX PX <ttl>
```

Or, on a relational store, an insert against a unique key with the conflict swallowed:

```sql
INSERT INTO cache_entries (key, value, expires_at)
VALUES ($key, $value, $expiresAt)
ON CONFLICT (key) DO NOTHING
-- return whether a row was inserted
```

Do not implement it as `has()` then `set()`. Every one-time-use guarantee in the platform is this
method: a second winner is a replayed one-time code, a replayed TOTP step, or two holders of the
same lock.

### `increment`

Must be a server-side increment (`INCRBY`, `UPDATE … SET n = n + $by RETURNING n`), never
read-modify-write. Rate limiting is precisely the condition under which concurrent increments
happen, so a lost update is a bypassed limit. Note the TTL semantics: an existing expiry is
**kept** unless the caller says otherwise, because a window that slides on every hit is a window
that never closes.

`increment` is documented `at-least-once` — a retried increment counts twice. The platform never
retries it, and neither should your adapter's connection layer.

### `compareAndSet` — optional

```sql
UPDATE cache_entries SET value = $next, expires_at = $expiresAt
 WHERE key = $key AND value = $expected
```

On Redis: `WATCH`/`MULTI`/`EXEC`, or a small Lua script. Compare by *encoded* form, not by
reference — a networked adapter deserialises on every read, so the object the caller offers as
`expected` is never the object you hold. Passing `undefined` as `expected` means "only if absent".

Leave it unimplemented if your backing cannot do it (Cloudflare KV, most CDN caches). The platform
detects its absence and degrades explicitly: `TokenBucket.enforcement` reports `best-effort`.
Implementing it incorrectly is far worse than not implementing it.

## `AuditRepositoryPort`

`appendChained` receives a sealing function and must call it with the current head, then commit the
record it returns, with no other writer for that tenant interleaving.

**Pessimistic** — the straightforward one:

```sql
BEGIN;
SELECT sequence, hash FROM audit_records
 WHERE tenant_id = $tenantId
 ORDER BY sequence DESC LIMIT 1
   FOR UPDATE;
-- call seal(head) here, then:
INSERT INTO audit_records (...) VALUES (...);
COMMIT;
```

SQLite and D1 use `BEGIN IMMEDIATE` instead of row locking. Cloud SQL, RDS and Neon all support the
statement above unchanged.

**Optimistic** — better when writes spread across many tenants:

```sql
CREATE UNIQUE INDEX audit_tenant_sequence ON audit_records (tenant_id, sequence);
```

Read the head without locking, seal, insert, and translate a unique-constraint violation into
`ChainConflictError`:

```ts
catch (error) {
  if (isUniqueViolation(error, 'audit_tenant_sequence')) {
    throw new ChainConflictError(tenantId, attemptedSequence, { cause: error });
  }
  throw error;
}
```

`AuditService` retries conflicts up to `maxChainAttempts` (default 5) and exposes `conflictCount`.
Any other error is not retried and surfaces to the caller, which is what makes a request fail
rather than silently proceed unaudited.

Both strategies pass the conformance suite. What does not pass is reading the head, awaiting
something, and then inserting — the suite injects jitter between the read and the write precisely
to catch that.

`query` must scope by tenant in the `WHERE` clause, not by filtering after the fetch.

## `RefreshTokenStorePort`

```sql
-- markRotated
UPDATE refresh_tokens
   SET rotated_at = $at, replaced_by = $replacedBy
 WHERE tenant_id = $tenantId AND id = $id AND rotated_at IS NULL
```

Return whether a row was affected. This is the most important method in the port — it is what makes
refresh-token reuse detection work — and returning `true` when no row was affected disables it
silently, under exactly the concurrency an attacker creates naturally.

```sql
-- revokeFamily: one statement, not a read followed by N writes
UPDATE refresh_tokens
   SET revoked_at = $at, revocation_reason = $reason
 WHERE tenant_id = $tenantId AND family_id = $familyId AND revoked_at IS NULL
-- return the affected row count
```

The conformance suite checks that ten concurrent `revokeFamily` calls over five live tokens revoke
five in total, never fifty.

Index `(tenant_id, token_hash)` — it is on the hot path of every token refresh — and
`(tenant_id, family_id)`.

## `ResetTokenStorePort`

```sql
-- markConsumed
UPDATE reset_tokens
   SET consumed_at = $at
 WHERE tenant_id = $tenantId AND id = $id
   AND consumed_at IS NULL AND revoked_at IS NULL
```

Same shape, same stakes. Two winners means two password changes, and the one that lands second is
the one that stays.

## `SessionStorePort`

`createWithinLimit` is optional but strongly recommended: it is the only way to enforce a
concurrency limit exactly, and without it `SessionManager` falls back to a distributed lock or, if
there is no lock either, to best effort.

```sql
BEGIN;
SELECT id FROM sessions
 WHERE tenant_id = $tenantId AND user_id = $userId
   AND revoked_at IS NULL AND idle_expires_at > $now AND absolute_expires_at > $now
 ORDER BY last_seen_at ASC
   FOR UPDATE;
-- if count >= maxConcurrent:
--   onLimitReached = 'evict-oldest' → revoke the oldest (count - maxConcurrent + 1)
--   onLimitReached = 'deny'         → COMMIT and return { created: false, evicted: [] }
INSERT INTO sessions (...) VALUES (...);
COMMIT;
```

Return the sessions you evicted; `SessionManager` emits a `session.revoked` event for each, and a
user who sees "signed out on your other device" needs that event to exist.

Every read — `get`, `listByUser`, `delete` — must be tenant-scoped in the query. A session id
appears in a cookie, a log line and a support ticket; another tenant that guesses one must get a
result indistinguishable from a miss.

## Idempotency and retries

Read the `@idempotency` tag before adding a retry anywhere in your connection layer.

- `idempotent` — retry freely.
- `at-most-once` — **never** retry. `markRotated`, `markConsumed` and `setIfAbsent` are the
  security property; a transparent retry after an ambiguous timeout can turn one claim into two
  observed claims and revoke a legitimate user's session family.
- `at-least-once` — `increment` double-counts on retry. The platform does not retry it.

If your driver retries automatically (many connection poolers do), disable it for these statements
or make the operation idempotent with a client-supplied token.

## Checklist before you ship

- [ ] All applicable conformance suites pass against a real instance of the backing.
- [ ] The concurrency tests were run at production-like concurrency, not the default.
- [ ] Every atomic operation is one statement or one transaction — grep your adapter for a `get`
      followed by a `set` on the same key.
- [ ] Automatic retries are off for `at-most-once` operations.
- [ ] Tenant scoping is in the `WHERE` clause of every read, not applied afterwards.
- [ ] Indexes exist on `(tenant_id, token_hash)`, `(tenant_id, family_id)`,
      `(tenant_id, user_id)` and `(tenant_id, sequence)`.
- [ ] Startup logs `SessionManager.limitEnforcement`, `TokenBucket.enforcement`,
      `MfaService.distributed` and `NotificationService.distributed`, so the mode you are actually
      running in is visible rather than assumed.
