# Identity and Platform rate limiting: initial findings (before any code change)

Written 12 Nov 2026 after reading `2026-11-12-work-tenant-authorization-and-revocation/00-lead-orchestrator.md`
(section 12) and its test evidence, and after checking every claim against the current default branches:

| Repository | Commit inspected |
|---|---|
| munaxa-platform | `535ddd4` (main) |
| munaxa-identity | `420df43` (main, includes identity#15) |
| munaxa-work | `eabcc47` (main, includes work#31; read only, it does not use `RateLimiter`) |

Reproductions ran in the session container against the real code (Platform unit harness; Identity's compiled
application over real HTTP with local PostgreSQL 16). Raw output: `supporting/baseline-reproduction-*.txt`.

Severity is this thread's assessment: **High** means a security limit is absent or bypassable today; **Medium**
means a limit is weaker than intended or fails open; **Low** means hardening.

## F-1 (High, Platform) The adaptive penalty restarts the count after every refusal

1. **Code path.** `packages/platform/security/src/ratelimit.ts`, `RateLimiter.#evaluate` →
   `#penaltyWindow` → `SlidingWindowCounter.hit(key, penalty, cost)` in `packages/platform/cache/src/counters.ts`.
2. **Why it fails.** The counter's storage key is `<key>:<floor(now / window)>`. `#penaltyWindow` returns a
   *different window length* once a violation is recorded (15 min → 30 → 60 …), so the bucket index, and
   therefore the key, changes. The new key starts at zero: the request after a refusal is counted as the first.
3. **Reproduction.** Baseline `login-per-ip` (10 per 15 min, factor 2), 30 attempts one second apart from one
   address: refused **only attempts 11 and 22** (`supporting/baseline-reproduction-platform.txt`), exactly the
   pattern in the earlier report. An attacker gets 28 of 30 guesses through instead of 10.
4. **Intended.** Once a subject is over the limit, every further attempt is refused until its history drops back
   below the limit; the penalty may lengthen the refusal, never shorten it.
5. **Legitimate users.** None benefit from the defect; a stable counter refuses exactly what the rule says.
6. **Fix.** Count always in the rule's own window (stable key). The adaptive penalty becomes a separate
   *block* record whose TTL is the penalty, set when the limit is crossed; refused attempts still increment the
   counter. Tests: the 11/22 regression, refusals keep counting, window crossing cannot restart, recovery after
   the window, mutation of the key.

## F-2 (Medium, Platform) Every limit fails open, including authentication limits

1. **Code path.** `RateLimiter.#evaluate` `catch` → `{ allowed: true, degraded: true }`; `securityPipeline`'s
   `rateLimitStep` ignores `degraded`. `check()` keeps only the decision with the fewest remaining, so a
   degraded rule can also be hidden behind an earlier rule at exactly its limit.
2. **Why it fails.** A store outage (or an attacker who can make it slow) removes the login, reset and MFA limits.
3. **Scenario.** Valkey stops answering; every edge rule allows. (Identity's own login lockout and password
   services already refuse on a cache failure, so in Identity today this affects only the edge.)
4. **Intended.** Security-critical rules refuse (503 with `Retry-After`) when their state cannot be read;
   general API limits may keep failing open so a cache outage is not a total outage.
5. **Legitimate users.** During a store outage, sign-in is unavailable either way (LoginService needs the cache).
6. **Fix.** Per-rule `onStoreFailure: 'deny'` (default stays `allow`), baseline authentication rules set it,
   `check()` propagates `degraded`, the pipeline answers a degraded refusal with 503. Tests: store failure for
   both modes, mixed rules.

## F-3 (Low, Platform) Baseline matchers are spelling- and method-sensitive

`login-*` uses `path.endsWith('/login')` (case-sensitive, fails on a trailing slash), `password-reset-per-ip`
`path.includes('/password/reset')` (any method, so page views count, and it misses `/password/forgot`, the
request route), `mfa-verify-per-session` `path.includes('/mfa/')` (any method). Fix: match a canonical path
and the method. No product uses the baseline auth rules correctly today (see F-4).

## F-4 (High, Identity) The edge never sees the route, so login and password-reset rules never match

1. **Code path.** `apps/api/src/security/edge.middleware.ts`, `edgePathOf` returns `request.path` except for
   introspection; `AppModule.configure` mounts the middleware with `forRoutes('*')`, under which Express reports
   `request.path` as `/`.
2. **Why it fails.** `login-per-ip`, `login-per-account` and `password-reset-per-ip` match on the path; with
   `/` they never apply.
3. **Reproduction.** 40 `POST /api/auth/login` from one address with wrong credentials: 40 × 401, no 429; the
   only `ratelimit-limit` header seen is `300` (`api-per-ip`). Same for `/password/forgot`, `/password/reset` and
   `/mfa/verify` (`supporting/baseline-reproduction-identity.txt`).
4. **Intended.** Each security-sensitive route has a policy that applies to every spelling Express routes to it.
5. **Legitimate users.** Today nobody is limited at the edge; switching the baseline on as it stands would hold a
   whole school or office NAT address to 10 sign-ins per 15 minutes (F-8).
6. **Fix.** One canonical route identity from `originalUrl` (absolute-form, query and fragment removed,
   percent-decoded, dot segments resolved, lowercased, repeated and trailing slashes collapsed), matched exactly
   with the method. Express 5 under Nest 11 measured: it routes case variants, one trailing slash, query strings
   and absolute-form request targets (`POST http://host/api/auth/login`) to the handler; it answers 404 for
   doubled slashes, percent-encoded letters, dot segments, `;` and `%2F`. The canonical form covers all of them.

## F-5 (Medium, Identity) The MFA rule and every per-user rule never apply at the edge

1. **Code path.** `EdgeMiddleware` passes no `resolveSession`, so `targetFor` has no `userId` or `sessionId`.
   `RateLimiter.check` skips a rule whose dimension is absent.
2. **Why it fails.** `mfa-verify-per-session` (and `login-per-account`, `api-per-user`) never fire.
3. **Scenario.** A caller holding a valid challenge cookie is limited only by the challenge's own 5 attempts and
   the account's 10-failure counter (both correct and unaffected), not by the edge.
4. **Intended.** MFA routes are limited per credential (challenge or session) and per address; a request with no
   identity is still limited per address and refused by the handler.
5. **Fix.** Edge subject for MFA routes: the session's verified `sid` (signature checked locally, no database), or a
   digest of the challenge cookie; never the raw value. Per-address rule always applies.

## F-6 (High, Identity) Whitespace variants of the identifier bypass the per-account lockout

1. **Code path.** `AuthService.login` passes the identifier as typed to Platform `LoginService.authenticate`,
   whose lockout key is `sha256(identifier.toLowerCase())`; `PrismaUserDirectory.findByIdentifier` looks the
   account up by `identifier.trim().toLowerCase()`.
2. **Why it fails.** `" victim@x"`, `"victim@x "`, `"\tvictim@x"` … find the same account but each has its own
   lockout counter.
3. **Reproduction.** 10 wrong passwords → 11th is 429 and the correct password is refused (locked). Then 9 more
   wrong passwords with `" " + identifier` are all evaluated (401, not 429), and the correct password with
   `"  " + identifier` **signs in (200) while the account is locked**.
4. **Intended.** One lockout counter per account whatever the spelling; changing the address or the spelling does
   not reset it.
5. **Legitimate users.** None rely on the defect.
6. **Fix.** Identity trims the identifier before `authenticate` (the exact normalisation the directory uses);
   Platform's lockout digest trims too (defence in depth for other consumers). Test: the reproduction above
   becomes 429 for every variant.

## F-7 (Medium, multi-instance) Identity's counters are per task when it runs more than one task

`infra/aws/stack/services.tf` runs Valkey as a **sidecar of each Identity task** (`127.0.0.1:6379`), and
`envs/prod.tfvars` sets `desired_counts.identity = 2`. Every limit, lockout counter and MFA challenge would then
exist once per task: limits are N × weaker and an MFA challenge issued by one task cannot be redeemed on the
other. Nonprod runs one task, so nothing is wrong there today. The code itself shares state correctly through one
Redis (to be proved with two application instances). Fixing the topology (one shared store) is an infrastructure
change outside this task's authority; it is reported as an owner decision, not changed.

## F-8 (Medium, policy) The baseline thresholds would lock out a shared NAT address

`login-per-ip` 10 per 15 min and `password-reset-per-ip` 5 per hour (and Identity's reset-request service rule,
5 per hour per address) are shared by every person behind one school or office address. A class of 30 signing in
at 08:30, or a sixth pupil asking for a reset within the hour, would be refused. The per-account controls are what
stop guessing against one account; the per-address limits must be sized for a population.

## F-9 (Low, Platform) Counter expiry is set by a second command

`RedisCache.increment` runs `INCRBY` then `PEXPIRE`. A failure between them leaves a counter without an expiry; for
the adaptive `:violations` key that keeps the longest penalty forever. Fix: one Lua script when the client offers
`eval` (ioredis does), and repair a missing expiry otherwise.

## F-10 (Low, Identity) No command timeout on the Redis client

`openCache` sets `maxRetriesPerRequest: 3` but no `commandTimeout`; a hung (not refused) connection holds requests.
Fix: a bounded `commandTimeout`, so a hung store becomes an error, which the limits treat as defined above.

## Verified as correct (no change proposed)

- Introspection's own limits (`introspect-per-ip` 12,000/min, `introspect-per-user` 600/min) and its carve-out
  from `api-per-ip` (identity#15) work as reported.
- Platform `LoginService` checks lockout before verifying, counts unknown identifiers too (no enumeration),
  and Identity answers a cache failure with 503 (fails closed).
- Password-reset request: per-address and per-(organisation, identifier) limits in the service, fail closed on a
  store failure, same response whether or not the account exists.
- MFA: per-challenge attempts reserved with `INCR` before checking; per-account failure counter across challenges.
- `trust proxy` is `TRUST_PROXY_HOPS` (1 behind the ALB in the stack), so `request.ip` is the client address and a
  client's own `X-Forwarded-For` cannot choose its bucket.
- Increments are atomic (`INCRBY`), so concurrent requests cannot undercount.

## Constraint that shapes the fix

Identity consumes the published `@munaxa/*` 2.4.1 from GitHub Packages. Publishing a new Platform version is a
manual release dispatch, which this task may not run. So the Identity change must be correct on 2.4.1: its
authentication rules are non-adaptive (unaffected by F-1), evaluated one limiter per rule so a store failure is
seen and refused (F-2), and matched on Identity's own canonical route (F-4). The Platform fix (F-1, F-2, F-3, F-9)
lands on Platform main for the next release; adopting it in Identity is a later, separate change.

## Note added after implementation

F-9's proposed fix was narrowed during implementation. The expiry is set atomically with the increment, and a counter left without an expiry is repaired, **only when the client offers `eval`**. ioredis offers it, and so does every Munaxa deployment. A client without `eval` still gets the old two-command behaviour. See `00-REPORT.md` §5.
