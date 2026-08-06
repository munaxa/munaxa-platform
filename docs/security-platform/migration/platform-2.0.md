# Upgrading to Platform 2.0

2.0 is a breaking release with one theme: every decision that had to happen at most once now
happens at most once across a whole fleet, not merely within one process.

Nothing about the API surface changed for cosmetic reasons. If a signature moved, it moved because
the old one could not express a guarantee the platform was already claiming to provide.

**Who needs to act.** Anyone who implemented a port. Anyone who constructed `AuditService`,
`OtpService`, `MfaService`, `NotificationService`, `SessionManager` or `TokenBucket` directly.
Products consuming only the higher-level services will find the surface largely unchanged — but
the wiring must be revisited, because the defaults are safe and the *fallbacks* are not.

## Why

The P2 [production readiness audit](../production-readiness-audit.md) returned No-Go on four
defects that shared a shape: a check-then-act sequence correct on one process and silently wrong on
two. None of them raise an error on the path that is wrong.

| Defect | 1.0 behaviour on two replicas | Visible symptom |
| --- | --- | --- |
| Audit chain head kept in a service field | Both replicas seal against the same head | `verifyChain` reports tampering that never happened |
| Refresh rotation read `rotatedAt`, then wrote | Both exchanges succeed | Reuse detection silently stops working |
| TOTP replay guard was a per-process `Map` | Each replica accepts the code once | A stolen code is worth one sign-in per pod |
| Session limit counted, then created | Every replica sees room | The limit is a hint |

Two more of the same shape were found during 2.0's own concurrency sweep and fixed here: password
reset consumption, and notification deduplication.

## Breaking changes

### `@munaxa/audit`

`AuditService` now requires a repository. The chain head lives in the store.

```ts
// 1.0
const audit = new AuditService({ sinks: [repository] });
audit.resume(tenantId, await repository.latest(tenantId)); // required after every restart

// 2.0
const audit = new AuditService({ repository });            // sinks are now optional
```

- `repository: AuditRepositoryPort` is **required**. `sinks` is now optional and means "also mirror
  to these" — a SIEM, an NDJSON file, a collector. The repository is the chain; the sinks are
  copies.
- **`resume()` is removed.** There is nothing to resume. A restarted process and a replica that
  never restarted are indistinguishable, which is the point.
- `maxChainAttempts` (default 5) bounds the retry loop for optimistic adapters. `conflictCount`
  exposes how often writers collided — worth a gauge.
- A failed *chain append* now fails the caller. A failed *sink* still does not: a SIEM outage must
  not fail a login, but a request that proceeds unaudited is worse than a request that fails.

### `@munaxa/interfaces`

New required port members. Any adapter you wrote will fail to typecheck until you add them; that is
deliberate, because the alternative is an adapter that silently lacks the guarantee.

| Port | Added | Required? |
| --- | --- | --- |
| `AuditRepositoryPort` | `appendChained(tenantId, seal)` | Yes — new port, extends `AuditSinkPort` |
| `RefreshTokenStorePort` | `markRotated(tenantId, id, at, replacedBy)` | Yes |
| `ResetTokenStorePort` | `markConsumed(tenantId, id, at)` | Yes |
| `SessionStorePort` | `createWithinLimit(session, limit)`, `countActive(...)` | Optional, strongly recommended |
| `CachePort` | `compareAndSet(key, expected, next, options)` | Optional |

Also new: `ChainConflictError`, `isChainConflict`, `UnsupportedGuaranteeError`, and the
`@atomicity` / `@consistency` / `@idempotency` vocabulary documented on every method. See the
[adapter guide](../adapter-guide.md) for the exact statement each one needs.

### `@munaxa/auth`

`OtpService` is asynchronous, because its state can now live in a shared cache:

```ts
// 1.0
const { challenge, code } = otp.issue(tenantId, userId);
if (otp.verify(challenge.id, code)) { … }

// 2.0
const { challenge, code } = await otp.issue(tenantId, userId);
if (await otp.verify(challenge.id, code)) { … }
```

`issue`, `verify` and `get` all return promises. `purgeExpired()` is unchanged. Pass `cache` to
make it work across replicas; without it the service is single-process and says so.

`MfaService` takes an optional `replayGuard: CachePort`. **Wire it in any deployment with more than
one replica** — without it, TOTP replay protection is per-process. `MfaService.distributed` reports
which mode you are in.

`RefreshTokenService.rotate` now claims the token before issuing the replacement. No signature
change, but the failure mode moved: a losing caller gets `AUTH_TOKEN_REUSED` and the family is
revoked, where 1.0 would have quietly succeeded.

`PasswordResetService.complete` claims the token with `markConsumed` before changing anything. All
read-only validation still runs first, so concurrent attempts fail with the same
`AUTH_RESET_TOKEN_INVALID` they always did — there is just no longer a window where two of them
both win.

`LoginService` emits `auth.account.locked` exactly once per lockout, on the attempt that crosses
the threshold, instead of on every attempt past it.

### `@munaxa/session`

`SessionManager` takes an optional `locks: LockPort` and `limitLockLease` (default 5,000 ms), and
exposes `limitEnforcement`:

- `store-transaction` — the store implements `createWithinLimit`. Exact, one round trip.
- `distributed-lock` — a `LockPort` is wired. Exact, two round trips.
- `best-effort` — neither. **The limit is a hint**, and with six replicas it really does overshoot.

Log this at startup. The distributed test suite asserts the overshoot rather than hiding it.

### `@munaxa/cache`

`TokenBucket` retries on a lost compare-and-swap (constructor takes `maxAttempts`, default 5) and
exposes `enforcement`: `compare-and-swap` or `best-effort`. Under sustained contention it denies
rather than admitting on a stale read — the safe direction for a bucket guarding an expensive
operation.

`MemoryCache` implements `compareAndSet`.

### `@munaxa/notifications`

`NotificationService` takes an optional `dedupeStore: CachePort`. Deduplication now *claims* before
delivery instead of remembering after it, because remembering afterwards means both replicas have
already sent by the time either remembers. A failed delivery releases the claim, so a genuine retry
is not suppressed by its own first attempt. `distributed` reports whether the claim is shared.

Critical-priority messages are still never deduplicated: three password-change emails are a
nuisance, one missing password-change email is an unnoticed takeover.

## Upgrade steps

**1. Update the dependencies.** All platform packages move to `2.0.0` together. They are versioned
in lockstep; mixing 1.x and 2.x will not typecheck.

**2. Update your adapters.** Add `appendChained`, `markRotated` and `markConsumed`. The compiler
will find every site. Follow the [adapter guide](../adapter-guide.md) for the exact statements —
the naive implementation of each one is the bug this release exists to fix.

**3. Add the conformance suite to your test run.**

```ts
import { describe, it, expect } from 'vitest';
import { runRefreshTokenConformance } from '@munaxa/conformance';

runRefreshTokenConformance({ describe, it, expect }, {
  createStore: () => new PrismaRefreshTokenStore(freshDatabase()),
  makeRecord: (overrides) => ({ …, ...overrides }),
});
```

Run it against a real database. This is the step that tells you whether your `markRotated` is a
compare-and-swap or a hopeful `UPDATE`.

**4. Migrate the schema.**

```sql
-- The audit chain needs the sequence to be enforced, not merely stored.
CREATE UNIQUE INDEX audit_tenant_sequence ON audit_records (tenant_id, sequence);

-- markRotated / markConsumed condition on these; they must be nullable and indexed with their key.
CREATE INDEX refresh_tokens_lookup ON refresh_tokens (tenant_id, token_hash);
CREATE INDEX refresh_tokens_family ON refresh_tokens (tenant_id, family_id);
CREATE INDEX sessions_by_user     ON sessions (tenant_id, user_id);
```

Existing rows need no backfill. Sequence numbers already stored stay valid, and a chain written by
1.0 verifies unchanged under 2.0 — the canonical form did not move.

**5. Rewire the services.** Replace `new AuditService({ sinks: [repo] })` with
`new AuditService({ repository: repo })`, delete every `resume()` call, `await` the `OtpService`
methods, and pass the shared cache to `MfaService.replayGuard` and
`NotificationService.dedupeStore`.

**6. Log the enforcement modes at startup.**

```ts
logger.log('info', 'platform.enforcement', {
  sessions: sessionManager.limitEnforcement,
  rateLimit: tokenBucket.enforcement,
  mfaReplay: mfa.distributed,
  notifyDedupe: notifications.distributed,
});
```

A deployment that believes it has replay protection and does not is the failure this release is
about. Make it visible, and alert on `best-effort` in anything running more than one replica.

**7. Verify against the shape you actually deploy.** Run your integration tests with at least two
service instances over one shared store. `packages/platform/conformance/test/fleet.ts` is the
platform's own harness for this and is worth copying: it builds N independent service objects
sharing only the stores, with latency injected in front of each one — because an in-process store
settles its promises in the same microtask, which makes read-decide-write atomic by accident and
hides the exact race you are trying to test.

## Consumer impact

| Consumer | Impact | Notes |
| --- | --- | --- |
| Munaxa Docs | Adapters and wiring | The conditional-Go product in the P2 audit. Its four P0s are the four fixed here. |
| Munaxa School | Adapters and wiring | Same shape; also relies on session limits, so wire a lock or `createWithinLimit`. |
| Munaxa Work | Wiring only, if it has not adopted yet | Adopt 2.0 directly; do not adopt 1.x. |
| Munaxa CRM / ERP / AI | None yet | Not adopted. |

No product has been migrated. That remains deliberate and out of scope for this phase.

## Rollback

2.0 is rollback-safe at the data layer and not at the code layer.

**Data.** No format changed. Audit canonical form, password hashes, ciphertext envelopes, JWT
claims, cookie names and cache keys are all pinned by each package's `test/compat.test.ts` and all
verify identically under both versions. `rotated_at`, `replaced_by` and `consumed_at` were already
in the 1.0 schema. The new unique index is additive; drop it and 1.0 runs unchanged. A chain
written by 2.0 verifies under 1.0's `verifyChain`.

**Code.** Reverting to 1.x requires reverting the call sites: restoring `resume()`, making the OTP
calls synchronous again, and dropping the new port methods. Adapters that gained `markRotated` and
`markConsumed` are harmless under 1.x — the extra methods are simply never called.

**The honest caveat.** Rolling back restores the four defects. If you roll back while running more
than one replica, refresh reuse detection stops working and the audit chain will fork the moment
two replicas write at once — and a forked chain does not repair itself when you roll forward again.
Prefer rolling forward with a fix. If you must roll back, scale to a single replica first.

## Version

All twelve platform packages plus the new `@munaxa/conformance` are `2.0.0`. See each package's
`CHANGELOG.md` for the per-package detail, and
[distributed guarantees](../distributed-guarantees.md) for what the new contracts promise.
