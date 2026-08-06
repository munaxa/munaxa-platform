# Distributed guarantees

What the platform promises when there is more than one of it.

Platform 1.0 was correct on one process. That is not the same thing as being correct, and the
difference does not show up as an error — a second replica produces a broken audit chain that reads
as tampering, a refresh rotation that silently stops detecting reuse, a TOTP code that can be
replayed once per pod, and a session limit that is a suggestion. Every one of those failures
returns HTTP 200.

This document says exactly what each operation guarantees, what it needs from the store underneath
to guarantee it, and what happens when the store cannot provide it.

## The consistency model

Three rules, in priority order.

**1. Anything single-use is store-owned.** If a security property is "this may happen at most
once" — a refresh token rotated, a reset link consumed, a TOTP step spent, a one-time code
redeemed, a notification sent — the decision is made by the store, in one conditional operation,
and exactly one caller is told `true`. No service field, no local cache and no read-then-write
participates in that decision. A service may read first to *avoid* work, never to *authorise* it.

**2. Anything ordered is store-sequenced.** The audit chain's sequence numbers and hash linkage are
allocated by the store inside its own critical section. A replica never proposes a sequence number;
it supplies a sealing function and receives the record the store committed.

**3. Everything else is allowed to be eventually consistent, and says so.** Permission caches,
rate-limit counters and session last-seen timestamps tolerate staleness measured in seconds. Where
staleness could be a security decision — a revoked session, a rotated token — the read is
linearizable and the port documents it.

Rules 1 and 2 are the ones that changed in 2.0. Rule 3 was already true.

## Guarantee vocabulary

Every port method in `@munaxa/interfaces` carries three JSDoc tags. They are not decoration; they
are the contract an adapter is agreeing to, and `@munaxa/conformance` tests them.

| Tag | Values | Meaning |
| --- | --- | --- |
| `@atomicity` | `none` | Plain read or blind write. Never use the result to decide anything. |
| | `atomic` | Single indivisible operation. A concurrent reader sees before or after, never halfway. |
| | `compare-and-swap` | Succeeds only if the precondition still holds. Exactly one concurrent caller succeeds. |
| | `serialised` | The operation runs to completion with no other operation on the same key interleaved. |
| `@consistency` | `eventual` | May return stale data. Fine for hints, never for revocation. |
| | `read-your-writes` | A caller sees its own writes; other callers may lag. |
| | `linearizable` | Every caller sees a single, agreed order. Required wherever a stale read is a bypass. |
| `@idempotency` | `idempotent` | Repeating it changes nothing. Safe to retry. |
| | `at-most-once` | Repeating it fails. This *is* the security property; retrying is a replay. |
| | `at-least-once` | Repeating it double-counts. The platform never retries these — see `increment`. |

`UnsupportedGuaranteeError` exists so an adapter can refuse a guarantee it cannot provide, rather
than pretending. `ChainConflictError` exists so an optimistic adapter can say "somebody beat you"
without inventing an error shape the service has to pattern-match on strings.

## The four operations everything rests on

### `CachePort.setIfAbsent` — the single-winner primitive

Distributed locks, TOTP step consumption, one-time-code redemption and notification deduplication
all reduce to this one method. Exactly one caller across the entire fleet may receive `true` for a
given key.

Must map to `SET key value NX PX ttl`, an insert against a unique index, or an equivalent. A
`has()` followed by a `set()` is **not** an implementation of this method — it passes every
sequential test and fails in production the moment two requests arrive together.

### `AuditRepositoryPort.appendChained` — store-owned sequencing

The caller supplies a sealing function; the store calls it with the current chain head and commits
the record it returns, all without another writer interleaving. Two adapter strategies both
conform:

- **Pessimistic.** `SELECT … FOR UPDATE` on the tenant's head row, or SQLite's `BEGIN IMMEDIATE`.
  Simple, and correct on any relational store.
- **Optimistic.** A unique index on `(tenant_id, sequence)`; let writers race and translate the
  constraint violation into `ChainConflictError`. `AuditService` retries up to `maxChainAttempts`
  (default 5) and counts conflicts on `conflictCount`.

Pick optimistic when writes are spread across many tenants, pessimistic when one tenant dominates.

### `RefreshTokenStorePort.markRotated` — claim before you issue

```sql
UPDATE refresh_tokens
   SET rotated_at = $at, replaced_by = $replacedBy
 WHERE tenant_id = $tenantId AND id = $id AND rotated_at IS NULL
```

Return whether it affected a row. `RefreshTokenService.rotate` claims *before* issuing the
replacement, so a losing caller has changed nothing and can safely revoke the family. Returning
`true` when no row was affected is a security defect, not a performance one: it is the difference
between reuse detection working and reuse detection appearing to work.

### `ResetTokenStorePort.markConsumed` — single use that survives a mail scanner

Same shape, conditioned on `consumed_at IS NULL AND revoked_at IS NULL`. A reset link is emailed,
and email is followed by scanners, link previewers and impatient double-clicks — often within the
same second and onto different replicas. `PasswordResetService.complete` runs every read-only
check first, then claims, and only the winner changes the password.

## Degradation, declared

Some guarantees need something the deployment may not have. The platform never pretends; it reports
the mode it is actually running in, so a product can log it at startup and alert on it.

| Property | Best mode | Fallback | Reported by |
| --- | --- | --- | --- |
| Session concurrency limit | `store-transaction` — `SessionStorePort.createWithinLimit` | `distributed-lock` (a `LockPort`), then `best-effort` | `SessionManager.limitEnforcement` |
| Token bucket exactness | `compare-and-swap` — `CachePort.compareAndSet` | `best-effort` (over-admits under concurrency) | `TokenBucket.enforcement` |
| TOTP replay protection | shared `CachePort` replay guard | per-process memory — one replay per replica | `MfaService.distributed` |
| Notification deduplication | shared `CachePort` | per-process memory — one copy per replica | `NotificationService.distributed` |

`best-effort` is a legitimate configuration for a single-replica deployment. It is not a legitimate
configuration for a fleet, and the distributed test suite asserts the overshoot rather than hiding
it: with six replicas and a limit of three, the best-effort path really does create more than
three sessions.

## Failing in the right direction

There is no universally safe direction, so each mechanism picks one deliberately.

**Fails open** — rate limiting. A limiter that fails closed turns a cache blip into a total
outage. Requests are allowed, `degraded: true` is set on the decision, and `onDegraded` fires.
A permanently degraded limiter is a permanently absent one, so this is meant to be alerted on.

**Fails closed** — MFA replay protection, one-time codes, authorization. If the replay guard is
unreachable the platform cannot distinguish a first use from a replay, and "allow it, we could not
check" is the entire attack.

**Fails loudly without failing the request** — audit sinks. A SIEM being down must not fail a
login, so sink errors are counted (`failureCount`) and reported through `onSinkError`. The
*chain append* is different: it is not a sink, and if it fails the request fails, because a request
that proceeds unaudited is worse than a request that fails.

## CAP, concretely

The platform is a library, not a database, so its position is inherited from whatever store it is
given. What it does control is which operations it refuses to make available under partition.

During a partition from the store, the platform is **CP for anything single-use and ordered**:
`appendChained`, `markRotated`, `markConsumed` and `setIfAbsent` all fail rather than guess. There
is no local fallback, no queue-and-reconcile, and no "assume it was fine". A login that cannot be
audited does not happen.

It is **AP for anything advisory**: rate limiting, permission caches, session last-seen updates.
These degrade to allowing traffic and re-reading from the source of truth when the store returns.

Clock skew is deliberately not a correctness input. Chain verification is over the hash linkage and
the store-owned sequence, not over timestamps, so a replica whose clock is a minute out can neither
reorder the chain nor resurrect a spent one-time code. Timestamps are evidence, not authority.

## What the atomicity costs

Measured by `packages/platform/conformance/test/benchmark.test.ts`, which runs the 1.0 shape and
the 2.0 shape back to back in the same process — an absolute figure from CI means nothing, but a
ratio measured on the same cores in the same second is comparable. Representative run:

| Operation | 1.0 (unsynchronised) | 2.0 (atomic) | Ratio |
| --- | --- | --- | --- |
| Audit append, store layer | 0.0031 ms/op | 0.0037 ms/op | 1.22× |
| Refresh rotation, end to end | 0.0528 ms/op | 0.0625 ms/op | 1.18× |
| Cache write vs `compareAndSet` | 0.0007 ms/op | 0.0008 ms/op | 1.05× |
| Audit append, 2,000 concurrent, full service | — | 0.0060 ms/op | — |
| Token bucket, uncontended | — | 0.0009 ms/op | — |

The overhead is one extra conditional write on the rotation path and one extra comparison on the
cache path. Refresh rotation is dominated by token generation and hashing, which is why adding a
compare-and-swap moves it by under a fifth. Against a networked store the ratio is smaller still,
because the round trip dominates everything.

Rotation and reset are already the expensive half of their request. Audit append is on every
authenticated path, which is why it is benchmarked at the store layer as well as end to end: the
serialisation is a promise chain per tenant, not a lock service, and 2,000 concurrent appends cost
6 µs each.

## Proving an adapter

`@munaxa/conformance` is the executable version of this document. Every adapter — Prisma,
Postgres, Redis, Cloudflare KV, SQLite, D1, in-memory, or one that does not exist yet — runs it
against its own implementation:

```ts
import { describe, it, expect } from 'vitest';
import { runCacheConformance } from '@munaxa/conformance';

runCacheConformance({ describe, it, expect }, {
  createCache: () => new RedisCache(freshClient(), { keyPrefix: `test:${randomUUID()}:` }),
});
```

The suites take the test runner as a parameter, so the package depends on no test framework. They
are deliberately hostile: they create interleaving with seeded jitter rather than hoping for it,
because an adapter that is only atomic when nothing yields is an adapter that passes CI and fails
in production. See the [adapter guide](./adapter-guide.md) for what each suite requires.
