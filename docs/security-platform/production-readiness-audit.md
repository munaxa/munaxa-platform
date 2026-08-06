# Production readiness audit — P2

**Scope:** all twelve packages under `packages/platform/*`, their public API, dependency graph,
cryptography, concurrency behaviour, documentation and tests.
**Method:** static review plus executable probes. Every defect below was reproduced with running
code, not inferred from reading. Reproductions are included.
**Date:** 2026-08-06. **Reviewed at:** commit `0c77b26` (P1 head).

---

## 1. Executive summary

The platform's *architecture* is sound: the layering holds, the dependency graph is acyclic, no
package touches a product, there are no third-party runtime dependencies, and the port model
genuinely decouples the platform from any deployment target. Cryptographic primitive selection is
correct and conservative. The compatibility surfaces are pinned by tests.

The platform's *concurrency model* is not production-ready. Four separate mechanisms — the audit
chain, refresh-token rotation, MFA replay protection and the session concurrency limit — are correct
on one process and silently wrong on two. Every one of them was written and tested single-threaded,
and the test suites passed because the suites are single-threaded too. This is the recurring flaw in
the codebase and it is concentrated, not diffuse: the same "read state, decide, write state" shape
appears in four places, and none of the four is atomic.

That matters more than the count suggests, because these are not degradations. A broken audit chain
does not report an error, it reports *tampering*. A split token family does not fail a login, it
silently disables reuse detection — the platform's headline defence against refresh-token theft.

**Three defects were fixed during this audit** (all in-place, no API change beyond one additive
optional interface member): a colliding key derivation in `hmacSignerFromSecret`, a redundant
signature per token issued, and runtime dependencies declared but never imported. The dependency
diagrams in the architecture documents were also wrong and have been corrected.

**Recommendation: No-Go today. Conditional Go for Munaxa Docs after the four P0 items.** They are
well-understood, individually small, and three of the four are fixed the same way — by moving a
check-then-act into the store interface as a compare-and-swap.

---

## 2. Scores

| Dimension | Score | Basis |
| --- | ---: | --- |
| **Overall platform quality** | **74 / 100** | Strong design, materially incomplete concurrency story |
| Architecture | 86 / 100 | Clean layering, acyclic, no product coupling; some speculative ports |
| Security | 71 / 100 | Primitives and protocol choices are right; four multi-replica correctness defects |
| API stability | 72 / 100 | Formats pinned and tested; 503 exports is large, and there is no versioning tooling |
| Cryptography | 84 / 100 | Correct primitives; one derivation defect (fixed); no HSM/KMS path |
| Performance | 82 / 100 | Hot paths measured and cheap; one redundant signature (fixed); non-atomic bucket |
| Scalability | 62 / 100 | Cache and rate limiting scale; audit, MFA and session limits assume one writer |
| Documentation | 88 / 100 | Comprehensive and honest; the dependency graph was factually wrong (fixed) |
| Test quality | 76 / 100 | Excellent adversarial tests; zero concurrency tests, which is exactly what was missed |
| Consumer readiness | 70 / 100 | Wiring is clean; the default CSP will break a React app without guidance |

The overall score is not an average — it is weighted toward security and scalability, because those
are what "mandatory dependency for every Munaxa product" actually means.

---

## 3. Findings

Severity: **P0** blocks all migration · **P1** blocks School/Work · **P2** quality and debt.

### P0-1 — The audit chain assumes a single writer

`AuditService` keeps `#heads` (last hash and sequence per tenant) in process memory. Two replicas
writing to one repository each maintain their own head, so sequence numbers collide and
`previousHash` links point at records the other replica wrote.

```ts
const repository = new MemoryAuditRepository();
const replicaA = new AuditService({ sinks: [repository], clock });
const replicaB = new AuditService({ sinks: [repository], clock });
await replicaA.record(context, { name: 'auth.login.succeeded', outcome: 'success' });
await replicaB.record(context, { name: 'auth.login.succeeded', outcome: 'success' });
await replicaA.record(context, { name: 'auth.logout.succeeded', outcome: 'success' });

verifyChain(repository.chain(ROOT_TENANT_ID));
// → { valid: false, brokenAt: 1, reason: 'previous hash does not match the preceding record' }
// Sequences observed: [1, 1, 2]
```

**Why it is P0:** `verifyChain` reporting `valid: false` is the platform's tamper alarm. On any
multi-replica deployment it fires permanently and for a benign reason, which trains an operator to
ignore it — the alarm is worse than useless, it is actively harmful. The threat model claims
tamper evidence; on two replicas there is none.

**Fix:** the chain head must be allocated by the store, not the process. Add
`appendChained(tenantId, event): Promise<AuditRecord>` to `AuditRepositoryPort`, implemented as a
single transaction that reads the tail, computes the hash and inserts — or a monotonic sequence
column with `SELECT … FOR UPDATE`. Keep `#heads` only as an in-process fast path guarded by the
store's returned sequence. Alternatively, chain **per writer**: add a `writerId` to the record and
verify N chains rather than one. The first is better; the second is cheaper.

### P0-2 — Refresh rotation is check-then-act, defeating reuse detection

`RefreshTokenService.rotate` reads the record, checks `rotatedAt`, then writes. Two concurrent
rotations of the same token both observe `rotatedAt: null` and both succeed.

```ts
const results = await Promise.allSettled([
  refresh.rotate(ROOT_TENANT_ID, issued.token),
  refresh.rotate(ROOT_TENANT_ID, issued.token),
]);
// → both fulfilled. Two live tokens, one family, no reuse detected.
```

**Why it is P0:** it is precisely the attacker's race. A thief who replays the stolen token at the
same moment the legitimate client refreshes gets a valid token *and* no `auth.token.reuse.detected`
event. The platform's headline refresh-theft defence has a window in which it does not work, and the
window is the one an attacker with a copied token naturally occupies.

**Fix:** make the rotation atomic in the store. Add
`markRotated(tenantId, id, at, replacedBy): Promise<boolean>` to `RefreshTokenStorePort`, returning
false when the row was already rotated (`UPDATE … WHERE rotated_at IS NULL` and check the affected
row count). `rotate` treats false as a replay and revokes the family. This is a required-method
addition to a port, so it is a major version — do it before adoption, not after.

### P0-3 — MFA and OTP replay protection is per-process

`MfaService.#usedSteps` and `OtpService.#challenges` are in-process `Map`s. A TOTP code consumed on
replica A is accepted again on replica B, and an OTP challenge issued on A does not exist on B.

```ts
const replicaA = new MfaService({ store, clock });
const replicaB = new MfaService({ store, clock });
await replicaA.verifyTotpCode(tenant, user, code); // true
await replicaA.verifyTotpCode(tenant, user, code); // false — replay caught locally
await replicaB.verifyTotpCode(tenant, user, code); // true  — replay succeeds
```

Both maps also grow without bound: `#usedSteps` has one entry per (tenant, user) forever, and
`#challenges` only shrinks when a caller remembers to invoke `purgeExpired()`.

**Why it is P0:** the single-use property is the reason a phished or shoulder-surfed code is
survivable, and `OtpService` is simply non-functional behind a load balancer — a user gets a code
from one replica and verifies against another that never issued it.

**Fix:** both belong behind `CachePort`, which already provides the needed primitive:
`setIfAbsent(key, step, { ttl: window })` is exactly single-use semantics and expires itself. Take
an optional `CachePort` on both services and fall back to the in-process map with a documented
single-replica caveat.

### P0-4 — The session concurrency limit is check-then-act

`SessionManager.create` lists active sessions, then creates. Six concurrent logins against
`maxConcurrent: 2` produce six sessions.

```ts
await Promise.all(Array.from({ length: 6 }, () => manager.create(input)));
(await manager.listActive(tenant, user)).length; // → 6, limit was 2
```

**Why it is P0:** the limit is a security control (it bounds an attacker's foothold and is a
compliance requirement for several enterprise customers), and a burst of parallel logins is the
normal shape of a mobile client reconnecting, not an exotic condition.

**Fix:** enforce it in the store's create — an insert guarded by a count, or a
`createIfUnderLimit(session, max)` port method — or take a `LockPort` per (tenant, user) around
create. The lock is available today and needs no port change; the store-side check is better.

### P1-1 — Scoped role assignments mangle wildcard permissions

`PermissionResolver` appends the scope to each permission string. Applied to a wildcard grant, the
`*` stops being trailing and the result matches nothing:

```ts
// role: { permissions: ['courses:*'] }, assignment: { scope: 'course-42' }
resolved.permissions; // → ['courses:*:course-42']
hasPermission(resolved.permissions, 'courses:grade:course-42'); // → false
```

The administrator sees a role assigned and a permission listed; the check silently denies. **Fix:**
reject wildcards in scoped assignments at assignment time, or expand `resource:*` to
`resource:*:scope` semantics in `grantCovers` — the first is safer and simpler to reason about.

### P1-2 — `SigningKeyPort` is declared and wired to nothing

Five ports are declared in `@munaxa/interfaces` and consumed by no package: `SigningKeyPort`,
`EventPublisherPort`, `EventSubscriberPort`, `IdGeneratorPort`, `RandomPort`.

`SigningKeyPort` matters more than the others: it promises `current()` / `byId()` /
`verificationKeys()`, i.e. JWT key rotation. `TokenService` instead takes a `Signer` from
`@munaxa/crypto`, which resolves a single key ring at construction. Rotating a JWT signing key today
means constructing a new `TokenService`. The port advertises a capability the implementation does not
have. **Fix:** either wire `TokenService` to `SigningKeyPort`, or delete the port. Do not ship both.

### P1-3 — The default CSP will break a React application

`script-src 'nonce-…' 'self' 'strict-dynamic'`: in every browser that supports `strict-dynamic`, the
`'self'` host-source is *ignored*. Any `<script src>` without a nonce is blocked. `style-src 'self'`
likewise blocks the inline styles React and CSS-in-JS emit.

This is a correct, deliberately strict policy — and it is the single most likely cause of a failed
first deploy for Munaxa Docs. **Fix:** no code change required, but the Docs migration guide must
lead with it, and the platform should ship a documented `compatibleCsp()` preset for the
report-only rollout period so the strict policy is a destination rather than a precondition.

### P1-4 — The Firebase provider preset is a footgun

`providerPresets.firebase` returns an `OidcProviderConfig`, and `OidcProvider.completeAuthorization`
deliberately does **not** verify the id token's signature — safe only because the token arrives
directly from the token endpoint over TLS. Firebase tokens normally arrive from the *client*. A
product wiring this preset the way Firebase is usually used would accept unverified tokens.

**Fix:** remove the preset until JWKS verification exists, or gate it behind a
`FirebaseIdTokenVerifier` that requires a JWKS source. The port is fine; the convenience preset is
the hazard.

### P1-5 — `TokenBucket` is a non-atomic read-modify-write

`consume` reads state, computes, writes. Across replicas sharing one Redis, concurrent consumes lose
updates and the effective burst exceeds `capacity`. The probe did not exceed capacity locally
(`MemoryCache` operations resolve without interleaving), which is itself the point: **the test suite
cannot observe this class of bug.** Sliding and fixed windows are unaffected — they use the atomic
`increment`. **Fix:** implement the bucket as a Lua script on the Redis adapter, or document it as
approximate and use windows for anything security-relevant.

### P1-6 — Hand-built cache keys do not escape their separators

`@munaxa/cache` provides `forTenant`, which percent-encodes colons. Three packages build keys by
interpolation instead and skip that: `rbac:${tenantId}:${userId}`,
`auth:failures:${tenantId}:${identifier}`, `rl:${rule}:${tenantId}:${subject}`. Tenant `a:b` with
user `c` collides with tenant `a` and user `b:c`. Tenant identifiers derived from an OIDC issuer
routinely contain colons. **Fix:** route every key through the `namespaced`/`forTenant` helpers.

Related: the lockout key embeds the raw lowercased identifier, putting user email addresses in Redis
keys in plaintext. Hash it.

### P1-7 — No versioning tooling

`package.json` declares `"release": "changeset publish"`, there is no `.changeset` directory, no
per-package `CHANGELOG.md`, and all twelve packages are `1.0.0`. The deprecation policy exists as
prose in the extension guide and is enforced by nothing. **Fix:** initialise changesets, add a
`@deprecated`-to-removal policy (two minor versions), and make the release workflow refuse to
publish a package whose version did not change while its `dist` did.

### P2 — Quality and debt

| # | Finding | Recommendation |
| --- | --- | --- |
| P2-1 | 503 public exports across 12 packages; `types` alone exports 91 | Split into `@munaxa/types` and a `/testing` subpath for `FixedClock`, `MemoryLogger`, `Memory*Store`; test doubles are half the surface |
| P2-2 | Five unused ports (see P1-2) | Delete four, wire one |
| P2-3 | Performance suites run inside the default `test` task and fail intermittently under `turbo`'s parallelism | Move to a `test:perf` task, excluded from the CI gate |
| P2-4 | No coverage thresholds configured | Add per-package floors; the number matters less than the ratchet |
| P2-5 | `AuditService.record` awaits every sink on the request path | Await only the durable repository; queue the rest |
| P2-6 | `apiSecurityHeaders()` omits HSTS | Add it |
| P2-7 | `MemoryCache.increment` bypasses LRU reordering | Reinsert like `get` does |
| P2-8 | `securityPipeline` attaches `cspNonce` to the response via a cast | Add it to `PlatformResponse` |
| P2-9 | `parseApiKey` returns a `tenantHint` of `'root'` that means "unknown" | Return `undefined` and make the caller's tenant explicit |
| P2-10 | 18 empty `catch` blocks — **all verified intentional**, each rethrows a typed error or returns a documented value | No action; noted because "no silent failures" was a claim worth checking |

---

## 4. What holds up

Stated plainly, because a review that lists only faults misrepresents the codebase:

- **Dependency graph.** Verified acyclic by traversal. No hidden dependencies: every `@munaxa/*`
  import in `src/` is declared. No package imports a product. Three Node built-ins total
  (`node:crypto`, `node:util`, `node:async_hooks`), zero third-party runtime dependencies.
- **Tenant isolation.** Every store read filters by tenant; a cross-tenant read is indistinguishable
  from a miss; `RoleHierarchy` rejects foreign-tenant roles at construction. Tested adversarially in
  five packages.
- **Cryptographic choices.** scrypt at 16384/8/1 with per-record salts; AES-256-GCM with a
  per-message nonce the caller cannot supply; HKDF for purpose separation; `timingSafeEqual`
  everywhere a secret is compared; SHA-1 confined to the k-anonymity breach protocol, correctly.
  Nothing hand-rolls a protocol except TOTP, which is eighty lines of HMAC against a frozen RFC and
  is pinned to published test vectors.
- **Enumeration resistance.** Identical error codes, identical public messages and comparable timing
  across unknown-account and wrong-password paths, asserted rather than asserted-to.
- **Error handling.** One `PlatformError` type, a closed code list, a public projection that cannot
  leak `details`, and no silent failures found.
- **Test adversariality.** The security suites assert that attacks *fail* — forged JWT payloads,
  `alg: none`, tampered GCM tags, cross-tenant reads, CSV formula injection, log injection,
  double-submit CSRF with an attacker-planted cookie. That is the right shape.

---

## 5. Test quality assessment

Strong on adversarial single-threaded behaviour, absent on concurrency — and the gap is exactly
where the P0 defects live.

| Category | Assessment |
| --- | --- |
| Unit | Good. Behaviour, not implementation; edge cases present |
| Integration | Good. Real cross-package flows: login → session → tokens; rotation with reuse; reset revoking sessions |
| Security | Very good. Attacker-shaped, one per named threat |
| Performance | Adequate as floor checks; wrongly placed in the CI gate (P2-3) |
| Backward compatibility | Very good. Formats at rest pinned with fixtures |
| **Concurrency** | **Absent.** No test runs two instances against one store, and no test issues concurrent calls against one record. Four P0 defects follow directly |
| Property/fuzz | Absent. `normalizePath`, `grantCovers` and `parseDuration` are natural candidates |
| Multi-replica | Absent. Should be a shared conformance suite each product runs against its own adapters |

The highest-value test investment is a **port conformance suite** shipped from
`@munaxa/interfaces/testing`: a product runs it against its Prisma or D1 adapter and learns whether
its implementation satisfies the semantics the platform assumes — including the atomicity the P0
fixes will require.

---

## 6. Consumer readiness

| Consumer | Ready? | Blockers |
| --- | --- | --- |
| **Munaxa Docs** | After P0 | P0-1..4; must plan for the CSP (P1-3). Least risky first adopter |
| **Munaxa School** | After P0 + P1 | Largest user base; P0-2 and P0-3 matter most where MFA is in use |
| **Munaxa Work** | After P0 + P1 | Adopting wholesale, so it inherits every defect at once |
| CRM / ERP / AI | After P1 + P2-1 | Not yet built; they should not adopt a surface about to be split |

Glue code required per product is genuinely small — six port implementations (~250 lines against an
existing schema), a composition root (~150 lines), one framework adapter (~30 lines). That part of
the design works.

---

## 7. Platform gaps (documented, not defects)

Absent by decision, listed so no product assumes otherwise: SAML (port exists, placeholder throws),
passkeys and WebAuthn (`AuthMethod` reserves them, nothing implements them), hardware keys,
biometrics, magic links, JWKS verification for client-supplied id tokens, KMS/HSM signing, automated
secret rotation (the `KeyRing` supports rotation; nothing schedules it), enterprise federation
(SCIM, directory sync), and adaptive authentication beyond the advisory risk score.

None of these blocks migration. All of them fit the existing ports, which was the point of declaring
the ports first.

---

## 8. Prioritised remediation plan

| Priority | Item | Effort | Port change? |
| --- | --- | --- | --- |
| P0-1 | Store-allocated audit chain head | 2–3 d | Yes — `AuditRepositoryPort.appendChained` |
| P0-2 | Atomic refresh rotation | 1–2 d | Yes — `RefreshTokenStorePort.markRotated` |
| P0-3 | MFA/OTP state behind `CachePort` | 1–2 d | No — additive constructor option |
| P0-4 | Session limit under a lock or store guard | 1 d | No if lock-based |
| P1-1 | Reject wildcards in scoped assignments | 2 h | No |
| P1-2 | Wire or delete `SigningKeyPort` (+ 4 unused ports) | 1 d | Yes — removal is major |
| P1-3 | `compatibleCsp()` preset + migration guidance | 4 h | No |
| P1-4 | Remove or gate the Firebase preset | 2 h | No |
| P1-5 | Atomic token bucket (Lua) or document as approximate | 1 d | No |
| P1-6 | Route all cache keys through the helpers; hash identifiers | 4 h | No |
| P1-7 | Changesets, CHANGELOGs, deprecation policy | 1 d | No |
| — | Port conformance suite for product adapters | 2–3 d | No |

**Sequencing:** the four P0s and the port conformance suite are one release, and since three of them
change ports, they should land together as `2.0.0` **before** any product depends on `1.x`. The P1
set follows as `2.1.0` before School and Work.

Total: roughly two to three weeks for one engineer, dominated by P0-1 and the conformance suite.

---

## 9. Fixed during this audit

| Fix | Rationale |
| --- | --- |
| `hmacSignerFromSecret` now uses HKDF | It XOR-folded the secret into 32 bytes, which is not injective in a trivially constructible way: `'p'.repeat(32)` and `'p'.repeat(32) + 'q'.repeat(64)` derived the same signing key. Confirmed, then fixed. Safe to change now because no product has adopted the platform |
| One signature per token instead of two | `#encode` signed an empty string purely to read the `kid`. Under RS256 that doubled the cost of the hottest path. Added an optional `Signer.kid`, implemented on both platform signers, with a fallback for custom ones |
| Removed three unused runtime dependencies from `@munaxa/auth`, one from `@munaxa/notifications` | They forced consumers to install packages the code never imports |
| Corrected the dependency graphs in `architecture.md` and `package-dependencies.md` | They drew `auth → rbac/session/audit`, which the code does not do. A diagram that does not match the code is worse than no diagram |

---

## 10. Go / No-Go

> **No-Go for migration today.**
> **Conditional Go for Munaxa Docs** once P0-1 through P0-4 are fixed and the port conformance suite
> exists. **Conditional Go for School and Work** after the P1 set.

The reasoning is narrow and worth stating exactly. The architecture does not need redesigning —
the layering, the ports, the tenancy model and the cryptography are right, and no product-specific
modification will be needed. What is missing is that four mechanisms were built for a single process
and every production deployment runs several. That is a bounded, well-understood class of fix, not a
structural problem.

What would make this a Go without qualification is not more features. It is the P0 four, plus one
concurrency test per fix, plus a conformance suite that lets each product prove its own adapters
satisfy the semantics the platform assumes.
