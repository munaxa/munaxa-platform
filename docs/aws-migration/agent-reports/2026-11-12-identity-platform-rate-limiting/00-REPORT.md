# Identity and Platform: remediation of the security rate-limiting defects

12 Nov 2026. Task: remediate the rate-limiting defects reported in
`2026-11-12-work-tenant-authorization-and-revocation/00-lead-orchestrator.md` §12. Repository work only.

## 1. Executive summary

**FIXED in repository code. Nothing was deployed.**

- **Platform: munaxa-platform#107** (head `a10a1ec`, squash-merged `bc1f21b`).
  - The limiter now counts every rule in its own window, under one stable key per rule and subject.
  - Refused attempts keep counting. The adaptive penalty is a separate block record.
  - Login, reset and MFA rules refuse with a 503 when their store cannot be read (`onStoreFailure: 'deny'`).
  - Baseline matchers use a canonical route and the method.
  - Counter expiry is atomic.
  - The lockout key trims the identifier.
  - The "429 only on attempts 11 and 22 of 30" pattern is gone: one address is refused on every attempt from 11 to 30.
- **Identity: munaxa-identity#16** (head `679288f`, squash-merged `a1bf695`). It works on the published Platform 2.4.1, so it needs no Platform release.
  - The edge matches the route Express really serves, in every spelling.
  - Sign-in is limited per identifier and per address. Password reset is limited per address.
  - All six second-factor and reauthentication routes are limited per session or challenge and per address.
  - Every credential rule fails closed.
  - A whitespace variant of an identifier no longer gets a fresh account lockout. That was a new High finding (F-6): a locked account could be signed into.
  - Address limits are sized for a school or office behind one NAT address. They are provisional and set through environment variables (§7, §8).
- **Tests:** Platform security 145, with a real-Redis suite in CI. Identity integration 280, including a raw-HTTP edge suite on two application instances sharing one real Redis.
- **Mutation testing:** 13 of 13 Platform mutants and 16 of 16 Identity mutants were caught.
- **Independent review:** 3 rounds. **APPROVE on both final heads.** All Medium and Low findings are fixed or justified (§13).
- **Owner decisions** (§15):
  - Identity's Valkey runs once per task, so limits hold fleet-wide only with one Identity task. Production `desired_counts.identity` is 2.
  - Adopting Platform#107 in Identity needs a Platform release.
  - The NAT thresholds are provisional.

## 2. Findings and current-state verification

The findings were written before any code change: [`01-INITIAL-FINDINGS.md`](01-INITIAL-FINDINGS.md). They were checked against Platform `535ddd4`, Identity `420df43` and Work `eabcc47` (Work was read only and not changed).

| ID | Sev. | Where | Finding | Status |
|---|---|---|---|---|
| F-1 | High | Platform | The adaptive penalty changes the window, so the key changes and the count restarts (429 only on 11 and 22) | Fixed, #107 |
| F-2 | Medium | Platform | Every limit fails open, auth limits included; `degraded` was ignored and could be hidden | Fixed, #107 (Identity on its own, #16) |
| F-3 | Low | Platform | Baseline matchers are sensitive to spelling and method | Fixed, #107 |
| F-4 | High | Identity | Under `forRoutes('*')` the edge sees `request.path` as `/`, so login and reset rules never match | Fixed, #16 |
| F-5 | Medium | Identity | No session is resolved at the edge, so MFA and per-user rules never apply | Fixed, #16 |
| F-6 | High | Identity + Platform | Whitespace variants of the identifier get a separate lockout counter, so a locked account can still be signed into | Fixed, #16 (trim) + #107 (lockout digest trims) |
| F-7 | Medium | Infra | Valkey is a sidecar of each Identity task, and prod runs 2 tasks, so limits are per task | **Owner decision** (§15); documented, infra not changed |
| F-8 | Medium | Policy | The baseline 10 per 15 min per address would lock out a school NAT | Fixed by Identity policy (§7, §8) |
| F-9 | Low | Platform | `INCRBY` then `PEXPIRE` is not atomic | Fixed, #107 (Lua when `eval` exists) |
| F-10 | Low | Identity | No Redis command timeout, so a hung store holds requests | Fixed, #16 (`commandTimeout` 2 s) |

All four reported defects were confirmed on main. F-6, F-7 and F-9 are new.

## 3. Root causes

- **F-1.** `SlidingWindowCounter` keys a bucket as `floor(now / window)`. `#penaltyWindow` passed it a longer window after each violation. A new window length gives a new bucket index, hence a new key starting at 0.
- **F-2.** `#evaluate` caught store errors and returned `allowed: true, degraded: true`. Neither `rateLimitStep` nor `check()` acted on `degraded`.
- **F-3.** Matchers used `endsWith` and `includes` on the raw path, with no method check.
- **F-4.** Express reports `request.path` relative to the mount point. Nest's `forRoutes('*')` mounts at the route, so `path` is `/`. Only `originalUrl` carries the target.
- **F-5.** `EdgeMiddleware` passes no `resolveSession`. A rule whose dimension is absent is skipped by design.
- **F-6.** The directory finds an account by `trim().toLowerCase()`, but the lockout digest used only `toLowerCase()`.
- **F-7.** It is a deployment topology choice (`infra/aws/stack/services.tf`), not a code defect.
- **F-8.** Platform's baseline values are per-person values applied per address.

## 4. Reproduction

The supporting files hold the raw output of the baseline runs, taken before any code change.

**Platform, [`supporting/baseline-reproduction-platform.txt`](supporting/baseline-reproduction-platform.txt).** Baseline `login-per-ip`: 30 posts from one address, one second apart. Output: `REFUSED 11,22`.

**Identity, [`supporting/baseline-reproduction-identity.txt`](supporting/baseline-reproduction-identity.txt).**
- 40 sign-in posts from one address returned 40 × 401. The only rate-limit header seen was `ratelimit-limit: 300` (`api-per-ip`). Forgot, reset and MFA verify behaved the same.
- The lockout bypass:
  1. 11 wrong passwords: the 11th was refused with 429.
  2. The correct password, canonical spelling: refused with 429 (locked).
  3. 9 wrong passwords with `" " + identifier`: all 401, so all were evaluated.
  4. `"  " + identifier` with the correct password: **200, signed in while the account was locked.**

**After the fix**, each reproduction is a regression test:
- Platform `ratelimit-counter.test.ts` and `redis-server.test.ts` refuse attempts 11 to 30.
- Identity `auth-edge-limits.http.integration.test.ts` limits every spelling, and every whitespace variant gets 429.

## 5. Platform design (munaxa-platform#107)

**Stable counter.**
- `#evaluate` always counts with `hitWithHistory(key, rule.window, cost)`. The key is `rl:<rule>:<tenant>:<subject>:<bucket>`.
- The sliding estimate is `previous × (1 − elapsed) + current`.
- A refused attempt still increments the counter, so the count is the subject's whole history.

**Adaptive penalty, applied only when `adaptiveFactor > 1`.**
- A separate key `rl:…:block` holds the moment the subject is admitted again.
- It is set with `setIfAbsent`, so a concurrent burst records one violation, not one per request.
- The first block is 1 window. Each later block is `factor^violations` windows, capped at 16 windows.
- `:violations` lives for 32 windows. A subject that misbehaves for more than 32 windows starts escalating again from 1 window. This is documented and accepted.
- While a block is set, attempts are refused and still counted.
- `Retry-After` is the later of the block end and the moment the sliding estimate drops below the limit (`admittedAgainAt`).

**Store failure.**
- New per-rule `onStoreFailure: 'allow' | 'deny'`. The default is `allow`, so existing general limits are unchanged.
- A failing `deny` rule refuses with `degraded: true`. The pipeline answers 503 `SECURITY_RATE_LIMIT_UNAVAILABLE` with `Retry-After: 5`, and the audit detail says `reason: 'store-unavailable'`.
- A real over-limit refusal is always returned as is, so it stays a 429 even if an earlier fail-open rule was degraded.
- An allowed answer carries `degraded` if any rule degraded.

**Malformed values.**
- A counter or block value that is not a finite, non-negative number throws `isCount` / `#blockedUntil`, so it is a store failure handled by the rule's policy. Before the fix it was an unlimited pass.
- An unreadable violation count is read as a high one, so the next block is long.

**Configuration checks.** A rule with `limit ≤ 0`, `window ≤ 0`, or `cost` above its capacity is refused at construction. Capacity is `limit`, or `burst ?? limit` for a token bucket.

**Matching and subjects.**
- `canonicalRoutePath` removes the absolute-form scheme and host, the query and the fragment, then applies `normalizePath` (decode once, `\` → `/`, dot segments, repeated slashes) and lowercases.
- `isRoute(target, method, predicate)` drives the baseline login, reset (forgot and reset, `POST`) and MFA (not `GET`/`HEAD`) rules.
- `addressSubject` counts IPv6 by its /64, and IPv4-mapped addresses as IPv4.

**Cache.**
- When the client offers `eval`, `RedisCache.increment` runs one Lua script: `INCRBY`, then `PEXPIRE` only if `PTTL == -1`. That also repairs an orphaned counter.
- Without `eval`, it is the old two-command path. See the note in `01`.

**Auth.** `LoginService`'s lockout digest uses `identifier.trim().toLowerCase()`.

**Release.** The changeset is a minor for security and cache and a patch for auth, and lists every behaviour change. **Not published.** The release dispatch was not authorised for this task.

## 6. Identity routing design (munaxa-identity#16)

The design is pinned to the published Platform 2.4.1. It is in `apps/api/src/security/auth-edge-limits.ts` and `edge.middleware.ts`.

**Route identity.**
- `canonicalRoute(request.originalUrl)` does the same folding as §5. No header takes part.
- Express routes case variants, one trailing slash, a query and absolute-form targets to the handler. All of them are counted.
- Spellings Express answers with 404 (`//`, `%6C`, `./`, `x/..`, `;`, `%2F`) are also folded onto the route. A respelling can only be counted more, never less.

**Rules.**
- One Platform `RateLimiter` per rule, so every `degraded` is seen. A degraded rule gives 503 `AUTH_UNAVAILABLE` with `Retry-After: 5`.
- Every rule is non-adaptive, so the 2.4.1 count-restart defect cannot occur.
- Rules are evaluated in order and the first refusal stops. `login-per-identifier` runs before `login-per-ip`, so one hammered account does not spend its school's address budget.
- A refusal is 429 `SECURITY_RATE_LIMITED` with `Retry-After`, plus an audit event `security.ratelimit.exceeded` (rule, retry, never the identifier).

**Subjects.**
- Sign-in: `id:` + sha256 of (organisation, identifier), both trimmed and lowercased. A missing or blank organisation is the default organisation, as `AuthService` resolves it. The key is the same whether or not the account exists.
- MFA routes inside a session: the session `sid`, from the access-token cookie verified locally with no database.
- `mfa/verify`: the digest of the challenge cookie.
- Enrolment: the session `sid`, or the enrolment challenge digest.
- Addresses: `addressSubject` (IPv6 /64).

**Other changes.**
- `api-per-ip` keeps the identity#15 carve-out. Only spellings Express routes to `/api/auth/introspect` get `introspect-per-ip` (12,000 per minute); a percent-encoded 404 spelling stays at 300 per minute.
- The identity#15 limits are unchanged: introspect-per-ip 12,000 per minute, introspect-per-user 600 per minute.
- The reset-request service puts the identifier rule (3 per hour) before the address rule (30 per hour, `PASSWORD_RESET_REQUESTS_PER_IP`). Both are non-adaptive.
- `password-change` is no longer adaptive.
- `AuthService` trims the identifier before `authenticate` (F-6).
- The Redis client has `commandTimeout` 2 s (F-10).
- New settings with bounded ranges, in `packages/config`. The policy is documented in `docs/rate-limits.md`.

## 7. Policy table (Identity, as merged)

| Route (canonical), method | Rule | Subject | Default (env, range) | Window | Refusal / store failure |
|---|---|---|---|---|---|
| `/api/auth/login` POST | login-per-identifier | (organisation, identifier) digest | 20 (`EDGE_LOGIN_PER_IDENTIFIER_LIMIT`, 10–200) | 15 min | 429 / 503 |
| `/api/auth/login` POST | login-per-ip | address | 300 (`EDGE_LOGIN_PER_IP_LIMIT`, 30–100,000) | 5 min | 429 / 503 |
| `/api/auth/login` POST | account lockout (Platform) | (organisation, identifier) | 10 failures (`LOGIN_MAX_ATTEMPTS`) | 15 min lock | 429 / 503 |
| `/api/auth/password/forgot`, `/reset` POST | password-reset-per-ip | address | 60 (`EDGE_PASSWORD_RESET_PER_IP_LIMIT`, 10–10,000) | 1 h | 429 / 503 |
| `/api/auth/password/forgot` POST (service) | per identifier; per address | (organisation, identifier); address | 3; 30 (`PASSWORD_RESET_REQUESTS_PER_IP`, 5–10,000) | 1 h | 429 / 503 |
| MFA verify, reauthenticate, enrolment, enrolment confirm, recovery codes (POST), `/api/auth/mfa` DELETE | mfa-per-session | challenge digest or session `sid` | 10 (`EDGE_MFA_PER_SESSION_LIMIT`, 5–100) | 15 min | 429 / 503 |
| same six | mfa-per-ip | address | 300 (`EDGE_MFA_PER_IP_LIMIT`, 30–100,000) | 15 min | 429 / 503 |
| MFA (service, unchanged) | per challenge; per account | — | 5; 10 | challenge TTL; 15 min | 401 / locked |
| `/api/auth/introspect` GET (identity#15, unchanged) | introspect-per-ip; per-user | address; account | 12,000/min; 600/min | 1 min | 429 / admits |
| everything else | api-per-ip | address | 300/min | 1 min | 429 / admits |

The full table and its rationale are in Identity `docs/rate-limits.md`.

## 8. Shared-NAT analysis

A school or office reaches Identity from one public address. Per-address limits are sized for a population. What stops guessing at one account does not depend on the address.

**Per account.**
- At most 10 wrong passwords per 15 minutes (lockout), and at most 20 sign-in posts per 15 minutes at the edge.
- Neither resets when the address, the case, surrounding whitespace or the organisation spelling changes.

**Per address.**
- 300 sign-in posts per 5 minutes, about 900 in a 15-minute morning rush. That is enough for several hundred people with typos and retries. A refused post is told when to retry.
- One person hammering one account inside the school is refused on the identifier rule first, so the school is not charged. This is tested over HTTP.

**Credential stuffing from one address.** At most 3,600 attempts per hour, and each account still has its own lockout. An attacker inside the school shares the school's address. That is the trade-off of any address limit, so the address limits are set high and the account limits low.

**Lockout abuse.** Lockout is temporary (15 minutes). Keeping a known account locked means sending 10 wrong passwords every 15 minutes. That is the accepted cost of account lockout, and it is visible as `auth.account.locked`.

**Password reset** never locks anyone out. 3 per identifier and 30 per address per hour.

**Tested** (`auth-edge-limits.http.integration.test.ts`, with limits scaled down):
- A full address allowance of different people (30) signs in from one address, all with 200, and another address is unaffected.
- An identifier refused on its own count is not charged to the shared address.
- The address limit refuses past its allowance with `Retry-After`, and admits again only once the window has passed (on real Redis with a fixed clock).

**The thresholds are provisional.** There is no production traffic yet. Review `security.ratelimit.exceeded` and the ALB per-address counts after the first month, or before onboarding a site with more than about 500 people. They can be changed through environment variables, with no infrastructure change.

## 9. Multi-instance and failure behaviour

**One store.**
- All counters are in the one Redis the task uses, and increments are atomic.
- Platform `redis-server.test.ts`: 4 limiter instances, each on its own connection, with 60 concurrent checks, admit exactly 10 and record one violation.
- Identity HTTP tests run two compiled application instances on one real Redis, and the limits hold across both.

**Topology (F-7, owner decision).**
- The AWS stack runs Valkey as a sidecar of each Identity task, and `prod.tfvars` has `desired_counts.identity = 2`.
- With 2 tasks, every limit, lockout and MFA challenge exists once per task.
- Nonprod runs one task. Run one Identity task per Valkey until a shared store exists. This is documented in `docs/rate-limits.md` and `docs/production-readiness.md`. Infra was not changed (outside this task's authority).

**Failures (all tested).**
- Store refused or connection lost: credential routes answer 503 with `Retry-After: 5`. The sign-in, reset and MFA services also refuse.
- Store hung (`CLIENT PAUSE`): the command fails after 2 s, and a 503 is returned in under 6.5 s.
- Malformed counter: store failure. Platform `deny` rules refuse.
- `api-per-ip` and introspection admit on a store failure, so a cache outage does not take down every route.
- Recovery: after the store returns, requests are admitted again.

## 10. Files changed

**munaxa-platform#107** (12 files, +1,056 / −43):
- `.changeset/rate-limiter-stable-counter.md`, `.github/workflows/ci.yml` (Redis service, dedicated `MUNAXA_REQUIRE_REDIS=1` step), `turbo.json` (`MUNAXA_TEST_REDIS_URL` in the test env)
- `packages/platform/auth/src/login.ts`, `auth/test/security.test.ts`
- `packages/platform/cache/src/counters.ts`, `cache/src/redis.ts`
- `packages/platform/security/src/ratelimit.ts`, `middleware.ts`, `normalize.ts`
- `packages/platform/security/test/ratelimit-counter.test.ts` (new), `redis-server.test.ts` (new)

**munaxa-identity#16** (14 files, +1,396 / −49):
- `apps/api/src/security/auth-edge-limits.ts` (new), `edge.middleware.ts`
- `apps/api/src/platform/security.ts`, `platform/cache.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/password/password-recovery.ts`, `password-change.ts`
- `packages/config/src/environment.ts`, `environment.test.ts`, `.env.example`
- `docs/rate-limits.md` (new), `docs/production-readiness.md`
- `packages/testing/src/auth-edge-limits.http.integration.test.ts` (new), `password-recovery.integration.test.ts`

Work was not modified.

## 11. Tests and mutations

**Platform security tests (145).**
- The 11/22 regression, and that refused attempts keep counting.
- Penalty and escalation, with boundary probing at 10 s and 89 s spacing.
- One violation per burst; 100 concurrent checks; 4 instances; 4 instances against real Redis.
- `Retry-After`, recovery, expiry, isolation by rule, subject and tenant.
- Store failure in both modes, mixed degraded rules, a 503 through the pipeline.
- Matchers and `canonicalRoutePath`, NaN and malformed values, construction checks, IPv6 /64.
- Auth: one lockout across spellings.

**Identity: full `test:integration` 280 passed.**
- Raw-HTTP edge suite (`auth-edge-limits.http.integration.test.ts`): every spelling, case, trailing and duplicate slash, encoding, query, absolute form, wrong method, unrelated route, missing identity, shared NAT, window expiry, two instances, store down, store hung, recovery, organisation scoping, the default organisation, IPv6 /64, the introspection carve-out.
- Unit tests: 47. Format, lint, typecheck, build and `prisma validate` are clean.

**Mutations.** Each mutant was applied to the source; the tests run (with real Redis and PostgreSQL); the source restored.
- Platform: **13 of 13 caught** ([script](supporting/platform-mutations.py), [output](supporting/platform-mutations-output.txt)).
- Identity: **16 of 16 caught** ([script](supporting/identity-mutations.py), [output](supporting/identity-mutations-output.txt)).
- They include:
  - the counter key following the penalty window;
  - refusals not counted;
  - fail-open on a deny rule;
  - matching on the raw path or `request.path`;
  - no lowercasing;
  - each policy removed;
  - one counter for every subject;
  - the identifier not trimmed;
  - no command timeout;
  - adaptive reset;
  - no organisation scope;
  - no default organisation;
  - IPv6 per address;
  - the encoded introspection spelling;
  - NaN accepted;
  - expiry dropped;
  - a 429 reported as a 503;
  - cost above the limit accepted.

## 12. CI links and SHAs

| PR | Final head | CI run on the final head |
|---|---|---|
| munaxa-platform#107 | `a10a1ec0073d50b9407283be38856891e96b6992` | https://github.com/munaxa/munaxa-platform/actions/runs/43207221429 |
| munaxa-identity#16 | `679288f315fae713e3b782925741d44549c7202f` | https://github.com/munaxa/munaxa-identity/actions/runs/43207306370 |

One earlier Platform run at `a47d668` (43204661789) failed only in `performance.test.ts` "renders the header set in microseconds". It measured 0.106 ms against a 0.1 ms budget, in code this PR does not touch, and was a timing flake on the runner. On the final head, the accessibility job failed once with one colour-contrast hit on a hover state in `foundations-themes--munaxa-work · docs · dark`. That is UI code this PR does not touch, and the job passed on the two earlier heads. A rerun of the failed job passed. All jobs are green on `a10a1ec`.

## 13. Review findings

An independent reviewer agent made three rounds, each on exact SHAs.

**Round 1 (`f5a2363` / `47b5d17`).**
- **Platform: CHANGES REQUIRED.**
  - Medium: NaN counter fails open. Fixed.
  - Low: a real 429 became a 503 when another rule degraded. Fixed.
  - Low: escalation resets after 32 windows. Documented.
  - Low: the changeset understated the changes. Fixed.
  - Low: `cost > limit` gave `Retry-After: Infinity`. Fixed by a construction check.
  - Medium: IPv6 rotation. Fixed.
- **Identity: APPROVE, with findings.**
  - High: per-task Valkey. Owner decision, §15.
  - Medium: a comment falsely said a Platform upgrade needs no change. Fixed.
  - Medium: IPv6 not grouped by /64. Fixed.
  - Low: identifier not scoped by organisation. Fixed.
  - Low: encoded introspection spellings got 12,000 per minute. Fixed.
  - Low: the shared `AUTH_UNAVAILABLE` code. Justified: the body deliberately names no dependency, and the audit reason tells the cases apart.
  - Info: `inspectPath` can never fire. No change.

**Round 2 (`a47d668` / `500cbc9`): APPROVE on both.** The remaining Lows were fixed anyway:
- L1: changeset wording.
- L2: token-bucket cost checked against `burst`.
- L3: the construction check is listed in the changeset.
- L4: the default organisation had a second budget when typed explicitly.

**Round 3 (`a10a1ec` / `679288f`): APPROVE on both.** No new findings.

No Critical, High or Medium code finding remains. The only open High is F-7, which is deployment topology.

## 14. PR links and merge status

- munaxa-platform#107: https://github.com/munaxa/munaxa-platform/pull/107. **Squash-merged 12 Nov 2026 as `bc1f21bf2b9a54b9dc185bd5ef0ba15b8c69bc28`.**
- munaxa-identity#16: https://github.com/munaxa/munaxa-identity/pull/16. **Squash-merged 12 Nov 2026 as `a1bf695f91e5c84246fd5a49422ff64e2f054dcf`.**
- This report: a separate docs PR on munaxa-platform.

Merge conditions were checked before each merge:
- CI was green on the final head.
- The reviewer approved the final head.
- Shared-NAT behaviour was evaluated (§8).
- No auto-deploy or migration runs on merge.

## 15. Remaining risks and owner decisions

1. **One Identity task per Valkey (F-7).** Until there is a shared store (for example ElastiCache, or Valkey as its own service), keep `desired_counts.identity = 1` wherever limits matter. Production tfvars currently say 2. Decide before any production deployment.
2. **Platform release.** #107 is merged but not published. Identity is pinned to 2.4.1 and does not need it, because its rules are non-adaptive and fail closed on their own. Other consumers keep the 2.4.1 defects (count restart, fail-open) until a release is dispatched and adopted. Adopting it in Identity needs its own re-test, because the IPv6 and malformed-value semantics change.
3. **NAT thresholds are provisional** (§8). Review them after the first month of traffic, or before a site with more than 500 people is onboarded.
4. **Deployment of the fix** needs a new Identity image built from main. That is outside this task, and the AW-01 / MFA key prerequisites already listed in `docs/production-readiness.md` apply.
5. **Accepted.**
   - An attacker can keep one known account locked (standard lockout cost, audited).
   - An attacker inside a school shares its address budget.
   - Escalation of a block restarts after 32 windows of continuous abuse, and attempts are still refused and counted.

## 16. Confirmation of boundaries

During this task, nobody:
- created, modified or deleted an AWS resource, or made any AWS call;
- ran Terraform;
- read or changed a secret;
- published an image or package;
- dispatched a release or deploy;
- deployed or enabled any product;
- migrated a deployed database;
- changed IAM, KMS, RDS, ECS, networking, DNS, Cloudflare or certificates;
- inspected or changed a GitHub App;
- exposed any password, token or cookie.

All tests used local PostgreSQL and Redis inside the session container, with generated test-only keys. Work was not modified, and the identity#15 introspection limits were not weakened. No runtime dependency was added: the real-Redis test brings its own minimal RESP client.
