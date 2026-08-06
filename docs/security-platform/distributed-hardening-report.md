# P3 — Distributed systems hardening report

**Scope:** eliminate every single-process assumption in the platform, and prove the result on the
topology a deployment actually has. No application was migrated. No product-specific logic was
added.

**Outcome:** all four P0 findings from the [production readiness audit](./production-readiness-audit.md)
are resolved, five more defects of the same class were found and resolved during this phase, and
the platform ships as **2.0.0**.

**Recommendation: Go** for adoption on multi-replica deployments, conditional on the two wiring
requirements in [§7](#7-conditions-on-the-go).

---

## 1. What was actually wrong

Every finding in this phase has one shape, and it is worth naming precisely because it is the shape
that will recur:

> A sequence that reads state, decides on it, and writes — where the decision is a security
> property. Correct with one process, because nothing interleaves. Silently wrong with two, because
> both processes read before either writes.

None of them raise an error on the path that is wrong. A double rotation looks like a successful
refresh. A replayed TOTP code looks like a successful sign-in. A forked audit chain looks like
tampering. That is why "our tests pass" and "we have never seen it in production" are both
consistent with the bug being present the whole time.

The fix is always the same too: move the decision into the store, as one conditional operation, and
let the store tell exactly one caller yes.

## 2. Findings and resolutions

| # | Finding | Class | Resolution |
| --- | --- | --- | --- |
| P0-1 | Audit chain head kept in a service field | Ordering | `AuditRepositoryPort.appendChained` — the store allocates the sequence and calls the caller's sealer inside its own critical section. `resume()` removed. |
| P0-2 | Refresh rotation read `rotatedAt`, then wrote | At-most-once | `RefreshTokenStorePort.markRotated` — compare-and-swap. `rotate()` claims before issuing. |
| P0-3 | TOTP replay guard was a per-process `Map` | At-most-once | `MfaService.replayGuard: CachePort`, consuming the step through `setIfAbsent`. |
| P0-4 | Session limit counted, then created | Invariant | `SessionStorePort.createWithinLimit`, a `LockPort` fallback, and `limitEnforcement` reporting which is in use. |
| P3-1 | Password reset marked consumed with a blind write | At-most-once | `ResetTokenStorePort.markConsumed` — compare-and-swap. All read-only checks run first; the claim is the gate. |
| P3-2 | Notification dedupe was a per-process `Map` | At-most-once | `dedupeStore: CachePort`, claiming *before* delivery and releasing on failure. |
| P3-3 | `TokenBucket` read the balance, decided, then wrote | Invariant | Optional `CachePort.compareAndSet`, bounded retry, and `enforcement` reporting `best-effort` where the backing cannot do it. |
| P3-4 | `DeviceService.recognize` wrote the whole record | Lost update | `DeviceRegistryPort.touch` writes only the last-seen fields. |
| P3-5 | `auth.account.locked` emitted on every attempt past the threshold | Duplicate signal | Emitted on `failures === maxAttempts`; `increment` is atomic, so exactly one caller crosses it. |

P3-4 deserves a sentence of its own because it is the least obvious and among the more serious.
`untrustAll` is what a password change calls. If the device was making a request at that moment,
`recognize` wrote the whole record back — carrying its copy of `trustedAt` over the untrust that
had already landed. The device stayed trusted, nothing errored, and the user believed they had
revoked it. An attacker holding a trusted device and generating traffic could survive the victim
changing their password.

## 3. The concurrency sweep

The findings above came from three inputs: the P2 audit (P0-1 to P0-4), reading each service for
state it held privately (P3-2, P3-3, P3-5), and a mechanical sweep.

The sweep enumerated every `await`-separated read→write pair in `packages/platform/*/src` — eleven
sites. One was a defect (P3-4, `DeviceService.recognize`). The other ten are accepted, and the
reasons matter more than the count, because "accepted" here has to mean something other than "we
looked at it":

| Site | Why it is accepted |
| --- | --- |
| `LoginService.#recordFailure` | Reads the lock key, increments the failure key. Different keys, and the increment is atomic. |
| `ApiKeyService.verify` → `update(lastUsedAt)` | Purely informational. Last-writer-wins on a timestamp loses nothing. |
| `ApiKeyService.revoke` | Read then set `revokedAt`. Idempotent and convergent; concurrent revokes agree. |
| `RefreshTokenService.rotate` fast path | Reads `rotatedAt` only to save a write. The decision is the compare-and-swap below it. |
| `RefreshTokenService.revoke` | Read then set `revokedAt`. Idempotent and convergent. |
| `SessionManager.revoke` | Read then set `revokedAt`. Idempotent and convergent. |
| `DeviceService.trust` / `untrust` | Both write the trust fields and nothing else, so a concurrent pair converges on whichever intent landed last. `recognize` no longer participates. |
| `TypedCache` invalidation | `has` then `delete` on a cache tier. Deleting something already gone is a no-op. |
| `PasswordResetService.request` | See below. |

The last one is worth stating rather than burying. `request` revokes outstanding tokens and then
saves a new one, so two concurrent requests can interleave such that both tokens survive — which
weakens "only the newest link works" to "one of the two most recent links works". Both were
requested by whoever controls the address, neither is usable without the mailbox, and closing it
would need a transaction spanning two statements for no security gain. Documented, not fixed.

A sweep of this kind finds the pairs that are textually adjacent. It does not find state held in a
field and read many lines away, which is what three of the four P0s were — so it is a check on the
reading, not a substitute for it.

## 4. How it is proven

Four layers, each answering a question the one above it cannot.

**Conformance** (`@munaxa/conformance`, 44 tests). The executable specification every adapter must
pass — Prisma, Postgres, Redis, Cloudflare KV, SQLite, D1, memory, or one that does not exist yet.
It asserts single-winner semantics under deliberately created interleaving, not hoped-for
interleaving. The platform's own memory adapters run it, so "behave like the memory store" is
advice that can be checked.

**Distributed simulation** (11 tests). N independent service instances over one shared store, with
latency injected in front of every store. The latency is not decoration: an in-process `Map`
settles its promises in the same microtask, so read-decide-write over it is atomic by accident and
hides the exact race under test. Removing the injection makes the session-limit test pass whether
or not the lock is wired — which is how a test can agree with a fix without proving it.

**Stress** (11 tests). Thousands of concurrent operations, asking whether the retry loops make
progress rather than livelocking at the traffic level nobody load-tested. 5,000 concurrent audit
appends across 8 replicas produce a gapless, verifiable chain; 500 callers presenting one refresh
token produce exactly one winner.

**Failure injection** (16 tests). The cache is gone, a call hangs, a write lands halfway, a worker
is killed mid-request, clocks disagree by 90 seconds, a queue delivers twice, everything retries at
once, the store partitions and heals. Each asserts the platform fails in the direction it
documented.

The best-effort session-limit test asserts the **overshoot**. Hiding a documented degradation
behind a passing test is how a degradation becomes a surprise.

## 5. Scalability review

**Horizontal.** Replicas share nothing but the stores. No gossip, no leader election, no sticky
sessions, no coordination protocol. Adding a replica adds capacity and changes no invariant, which
is what makes the same artefact deployable on Kubernetes, Docker Swarm, Azure App Service, AWS ECS,
Cloud Run, Cloudflare Workers, Render and Fly.io without conditionals.

**Contention.** The one serialisation point is the audit chain, per tenant. It is a per-tenant
promise chain in the memory adapter and a per-tenant row lock or unique index in a real one, so
tenants never queue behind each other — the "keeps tenant chains independent" conformance test
exists to keep it that way. A single tenant writing more audit events than one row lock can serve
is the ceiling; the optimistic adapter strategy raises it, and `conflictCount` is the gauge that
tells you when you are near it.

**Cost.** Measured at 1.05×–1.22× the unsynchronised path (§6). The rotation path is dominated by
token generation and hashing; the audit path is dominated by the hash. On a networked store the
round trip dominates both and the ratio approaches 1.

**Memory.** Every in-process cache is bounded, because an unbounded map keyed by anything a client
influences is a memory-exhaustion primitive. `MemoryCache` evicts LRU; `MemoryAuditRepository`
bounds its record count; the `#recentlySent` fallback in notifications sweeps at 10,000. Removing
the per-process state in this phase also removed three unbounded-growth vectors that 1.0 had.

**Known ceilings.** Best-effort session limits over a store with no transaction and no lock;
best-effort token buckets over a cache with no compare-and-set. Both are reported at runtime rather
than assumed.

## 6. Before and after

`packages/platform/conformance/test/benchmark.test.ts` runs the 1.0 shape and the 2.0 shape back to
back in the same process. An absolute figure from CI means nothing; a ratio on the same cores in
the same second is comparable.

| Operation | 1.0 | 2.0 | Ratio |
| --- | --- | --- | --- |
| Audit append, store layer | 0.0031 ms/op | 0.0037 ms/op | 1.22× |
| Refresh rotation, end to end | 0.0528 ms/op | 0.0625 ms/op | 1.18× |
| Cache write vs `compareAndSet` | 0.0007 ms/op | 0.0008 ms/op | 1.05× |
| Audit append, 2,000 concurrent, full service | — | 0.0060 ms/op | — |
| Token bucket, uncontended | — | 0.0009 ms/op | — |

The overhead is one extra conditional write on the rotation path and one extra comparison on the
cache path. Nothing added a network round trip.

## 7. Security review

**What improved.** Refresh-token reuse detection now works under the concurrency an attacker
naturally creates — previously it was disabled precisely when it mattered. A stolen TOTP code is
worth one sign-in rather than one per replica. A reset link is single-use against mail scanners and
double-clicks. The audit chain's tamper alarm no longer fires permanently for a benign reason,
which is the difference between an alarm and noise. A trusted device can no longer survive the
password change that revoked it.

**Failure directions, deliberate and opposite.** Rate limiting fails **open** with `degraded: true`
and an `onDegraded` callback — a limiter that fails closed turns a cache blip into a total outage,
and a permanently degraded limiter is a permanently absent one, so it is meant to be alerted on.
MFA replay protection, one-time codes and authorization fail **closed** — if the replay guard is
unreachable the platform cannot distinguish a first use from a replay, and "allow it, we could not
check" is the entire attack. Audit sinks fail loudly without failing the request; the audit
*append* fails the request, because proceeding unaudited is worse than failing.

**New surface, reviewed.** `compareAndSet` compares by encoded form and is optional, so a backing
that cannot provide it degrades rather than lying. `ChainConflictError` carries a tenant id and a
sequence number and nothing else. `markRotated` / `markConsumed` return a boolean and leak nothing
about why. Authorization denials still return one error code regardless of whether a permission or
a policy denied, so a denial is not an oracle for which. No new error message includes a token, a
hash or a secret.

**Retry hazards.** The `@idempotency` tag exists because a transparent retry on an `at-most-once`
operation after an ambiguous timeout can turn one claim into two observed claims — which would
revoke a legitimate user's token family. The adapter guide says to disable driver-level retries for
those statements, and this is the sharpest edge in the release.

**Not addressed here, by design.** Everything in the [threat model](./threat-model.md) marked as a
product responsibility: transport security, input validation, business-layer authorization,
tenant-boundary enforcement at the query layer.

## 8. Conditions on the Go

Two, and they are wiring rather than code:

1. **Share the cache.** `MfaService.replayGuard`, `OtpService.cache` and
   `NotificationService.dedupeStore` must all be given the shared `CachePort` on any deployment
   with more than one replica. Without it those mechanisms are per-process and the platform says so
   through `distributed`, but it cannot refuse to start.
2. **Give the session limit something to enforce with.** Either implement
   `SessionStorePort.createWithinLimit` or wire a `LockPort`. `limitEnforcement` reports
   `best-effort` otherwise, and best-effort means the limit is a hint.

Both should be logged at startup and alerted on. A deployment that believes it has replay
protection and does not is the exact failure this phase exists to prevent, and the only defence
against it is making the mode visible.

Every adapter must also pass `@munaxa/conformance` against a real instance of its backing before it
carries production traffic. That is the step that distinguishes a `markRotated` that is a
compare-and-swap from one that is a hopeful `UPDATE`.

## 9. Verification

```
pnpm exec turbo run build typecheck test lint --filter='./packages/platform/*'
```

52 tasks, all passing. 865 tests across 13 packages, including 44 conformance, 11 distributed
simulation, 11 stress, 16 failure injection and 5 benchmarks. `pnpm format:check` clean.

Backward compatibility is pinned by each package's `test/compat.test.ts` and unchanged: audit
canonical form, password hashes, ciphertext envelopes, JWT claims, cookie names, cache keys,
environment variables and event names all verify identically under 1.0 and 2.0. A chain written by
either version verifies under the other.

## 10. What happens next

Application migration may begin. It did not begin here, and nothing in this phase touched Munaxa
Docs, School, Work, CRM, ERP or AI.

The order that follows from this report: Munaxa Docs first, since its four P0 blockers are the four
resolved here; then Munaxa School, which additionally depends on session limits and so must wire a
lock or a transactional store; then Munaxa Work, which should adopt 2.0 directly and never adopt
1.x. Each product's first task is its adapters, and each adapter's first task is the conformance
suite.
