# Session architectures

The platform supports two persistence models for sessions, and neither is privileged. Pick the one
the product already has.

---

## The two models

**Stateful — a `sessions` table.** A row is created at sign-in and consulted on every request. The
access token carries `sid`; the row decides. `SessionStorePort`, `SessionRecord`.

**Refresh-family — a token lineage.** There is no session row. The access token is self-contained
and short-lived, and the only server-side object is the refresh lineage: one row per family, with
tokens rotating within it. "Sign out everywhere" revokes families. `RefreshFamilyStorePort`,
`RefreshFamily`.

Both call their thing "a session" and they are not the same object. The platform previously served
only the first, so a product built the second way could not adopt `SessionManager` without adding a
table and rewriting its refresh flow — a product change, not a migration. That gap is closed.

---

## Adopting the family model

```ts
import { SessionManager, sessionStoreOverFamilies } from '@munaxa/session';

const sessions = new SessionManager({
  store: sessionStoreOverFamilies(new PrismaRefreshFamilyStore(prisma)),
  policy: { maxConcurrent: 5, onLimitReached: 'evict-oldest' },
});
```

`SessionManager` is unchanged. Everything defined over sessions — idle and absolute deadlines,
concurrency limits, revocation reasons, listing, the conformance suite — applies to a product that
has never had a sessions table.

The mapping between the two records is an identifier re-brand and nothing else: no field is
invented, defaulted or dropped, and a round-trip test pins that, because a lost field would mean the
two paths silently diverge in lifecycle behaviour. A family id in a log or a support ticket means
the same thing on both sides.

---

## What the family table needs

`RefreshFamily` carries the same lifecycle fields as `SessionRecord`. A product that already stores
a family will typically be adding columns rather than a table:

| Field | Usually already present | Usually new |
| --- | --- | --- |
| `id`, `tenantId`, `userId`, `createdAt` | ✅ | |
| `revokedAt`, `revocationReason` | ✅ | |
| `ipAddress`, `userAgent`, `deviceId` | ✅ | |
| `lastSeenAt` | | ← moves forward on each rotation |
| `idleExpiresAt` | | ← a family that stops rotating dies here |
| `absoluteExpiresAt` | | ← never moves; a stolen lineage kept warm still dies |
| `authMethods`, `mfaSatisfied`, `tokenVersion` | | ← what a session decision reads |

The two deadlines are the substantive addition, and they are the reason the model is worth adopting:
a refresh lineage with no absolute deadline lives as long as the thief keeps rotating it.

---

## Concurrency limits

This is where the model choice has teeth. `SessionManager.limitEnforcement` reports one of:

| Mode | When | Guarantee |
| --- | --- | --- |
| `store-transaction` | the store implements `createWithinLimit` | exact |
| `distributed-lock` | a `LockPort` is wired | exact, one extra round trip |
| `best-effort` | neither | **a burst of parallel sign-ins can exceed the limit** |

A limit is a security control, and a mobile client reconnecting is its normal input, not an exotic
case. Implement `createWithinLimit` on the family store:

```sql
BEGIN;
SELECT count(*) FROM refresh_families
 WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
   AND idle_expires_at > $now AND absolute_expires_at > $now
   FOR UPDATE;
-- evict oldest or refuse, then INSERT
COMMIT;
```

`sessionStoreOverFamilies` forwards `createWithinLimit` and `countActive` **only when the underlying
store has them**, so `limitEnforcement` reports the true mode rather than a flattering one. Log it at
startup — the difference between `store-transaction` and `best-effort` is the difference between a
limit and a hint.

---

## Proof, not assertion

The session conformance suite runs against both stores. The family-backed path passes the same
tests, including the atomic-limit cases, so "identical semantics" is checkable rather than a claim
in this document:

```ts
runSessionConformance(harness, { createStore: () => new MemorySessionStore(), makeSession });
runSessionConformance(harness, {
  createStore: () => sessionStoreOverFamilies(new MemoryRefreshFamilyStore()),
  makeSession,
});
```

Run it against your adapter too — `@munaxa/conformance` is a dev dependency, and a store that
passes has demonstrated the tenant scoping and the atomicity that the port's documentation asks for.

---

## Choosing

- **Already have a session table** → stateful. Nothing changes.
- **Already have a refresh family** → family model. Add the deadline and decision columns, implement
  `createWithinLimit`, wire `sessionStoreOverFamilies`.
- **Greenfield** → stateful, unless the access token must be verifiable without a database read.
  A session row consulted per request is the simpler thing to reason about; the family model trades
  that for a self-contained access token and pays for it with revocation latency bounded by the
  access-token lifetime rather than being immediate.

What the platform will not do is pretend a limit is enforced when it is not, in either model.
