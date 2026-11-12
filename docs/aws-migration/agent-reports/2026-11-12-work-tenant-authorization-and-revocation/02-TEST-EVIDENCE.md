# WK-01 and WK-02: test evidence

All numbers below were produced in the session container against a local PostgreSQL 16 and Redis,
with the same commands the repositories' CI runs (format, lint, typecheck, migrate, test, build and
the repository checks). CI results on the final heads are in `00-lead-orchestrator.md` section 9.

## Gate results on the final heads

| Repository @ head | Gate | Result |
|---|---|---|
| munaxa-work @ `253f7c9` (tests unchanged since `5cf123b`) | engineering standards, architecture, localization, dependencies, platform parity | PASS |
| | format, lint, typecheck | PASS |
| | `pnpm db:migrate` on an empty database | PASS |
| | `pnpm test` (all packages, Postgres suites included) | **5,771 passed, 0 failed** |
| | build, `check:production-output`, `prisma validate` | PASS |
| | `pnpm audit --audit-level high` | PASS (1 low, 2 moderate, pre-existing) |
| munaxa-identity @ `a257bda` | format, lint, prisma generate, typecheck, build | PASS |
| | provision, migrate, grants, prisma validate | PASS |
| | unit tests | 46 passed |
| | `test:integration` | **246 passed, 0 failed** (three consecutive runs) |
| | catalogue drift, key scan, secret scan, audit | PASS |

## New and changed tests

**munaxa-identity**
- `packages/testing/src/token-introspection.integration.test.ts` (18): live and refreshed token;
  logout; revoke one; revoke others; password change; password recovery through the outbox link;
  suspected-compromise lockdown; disable; token-version bump; refresh after revocation; refresh replay;
  concurrent refresh/revocation race (5 rounds); forged, sessionless, expired, malformed; another
  session or organisation; dependency failure answers unavailable; HTTP surface (Bearer only,
  no-store, 503).
- `packages/testing/src/token-introspection.http.integration.test.ts` (6, compiled application over
  real HTTP): mounted under `/api` with no-store; inactive after revocation; inactive without a token;
  320 calls from one address are not held to `api-per-ip`; per-account 429 `RATE_LIMITED` while another
  account is still answered; routed spellings (`INTROSPECT`, trailing slash) answered.

**munaxa-work**
- `apps/api/src/tenancy/cross-tenant.postgres.spec.ts` (17, full `AppModule`, `work_app` with the real
  runtime grants, real ES256 tokens, stand-in Identity over HTTP).
- `apps/api/src/identity/session-revocation.spec.ts` (26, controlled clocks) and
  `session-revocation.instances.spec.ts` (16, two independent port instances, real HTTP).
- `apps/api/src/identity/platform-token-authentication.spec.ts` (claims required, assurance claims,
  session check called with the token's own claims, throw refuses, never asked after a bad signature).
- `packages/testing/src/tenant-binding.integration.test.ts` (resolution, one-to-one, RLS with check,
  runtime cannot write, ownership), `bootstrap-binding.integration.test.ts` (binding, refusals incl.
  the review H1 reproduction, several memberships, retired binding), updated
  `membership-resolution`, `bootstrap-tenant`, Identity-module persistence tests.
- `packages/config/src/platform-revocation.test.ts` (configuration: production refuses `disabled` and
  `http`, URL default, credentials/fragment refused, window bounds).

## Adversarial cases required by the brief

**WK-01**

| # | Case | Test (Work) | Checks |
|---|---|---|---|
| 1 | Cross-tenant read | cross-tenant: "cannot read B's person, and learns nothing" | 401, no B data in body |
| 2 | Update / delete | "cannot update it", "cannot change its status (the archive/delete path)" | refused, row unchanged (number, status, version, `updated_at`, names) |
| 3 | Changed tenant id | mallory's A token with `x-munaxa-tenant: B`; B's id from tenant A | refused / not found, row unchanged |
| 4 | Nested resource | "the nested profile" | refused in B, B absent in A |
| 5 | Search / reporting | "search" | refused in B, B absent in A |
| 6 | Export / download | "export", "a document download for an id from another tenant" | refused, no link |
| 7 | Missing tenant context | unbound organisation; token without `tid` | 401 |
| 8 | Invalid / revoked membership | "an ended membership in the bound tenant stops resolving"; revoked session | 200 then 401 |
| 9 | Multiple memberships | mallory's B token acts in B with B grants only (403), never A's | 403, no data |
| 10 | Admin / operator boundaries | wildcard and foreign-product grants confer nothing; no operator bypass exists | 403 |
| 11 | Background jobs | jobs run under a system context with an explicit tenant (ADR-0033) and never resolve from a token; existing job isolation suites pass | n/a |
| 12 | Cache isolation | "authenticated answers are no-store and vary by credential and tenant"; "the same URL answers each tenant with its own rows only" | headers, bodies |

**WK-02**

| # | Case | Test |
|---|---|---|
| 1 | Before revocation | instances "1. is accepted before revocation, with its organisation, session and MFA claims intact"; Identity "a live session" |
| 2 | Immediately after | instances "2. with no positive cache (window 0), refused on the very next request on both instances"; unit "refuses on the very next request once Identity says revoked" |
| 3 | Two instances | instances 2 and 3 (300 ms window and the shipped 5 s default); unit "both stop accepting a revoked session within the window, with no coordination" |
| 4 | Refresh after revocation | instances "4. ..."; Identity "refresh after revocation" |
| 5 | Refresh replay | instances "5. ..."; Identity "refresh replay" |
| 6 | Logout reuse | instances "6. ..."; Identity "logout" |
| 7 | Password recovery reuse | instances "7. ..."; Identity "password recovery", "password change" |
| 8 | Lockdown reuse | instances "8. account lockdown, even before its session step has run"; Identity "suspectedCompromise", "disable" |
| 9 | Store unavailable | instances "9. Identity unavailable (503)", "9. unreachable or too slow"; unit failure table; Identity "unavailable" |
| 10 | Expired / malformed | instances "10. ..."; Identity "forged, sessionless, expired, malformed" |
| 11 | Stale cache | instances "11. a stale cached active does not outlive the window, and a cached refusal is never replaced"; unit window, LRU, wall-clock step-back, late positive after refusal |
| 12 | Concurrent refresh + revocation | instances "12. ..."; Identity concurrent race (5 rounds) |

## Mutation tests

Each mutation was applied to a scratch copy, the named suites run, and the copy restored.

| Mutant | Killed by |
|---|---|
| Work M1: directory asks the unbound `app_memberships_of` (pre-fix tenant choice), package rebuilt | cross-tenant 11/17 fail; persistence 2 fail |
| Work SQL: binding's organisation predicate removed in `app_bound_memberships_of` | cross-tenant 11 fail; tenant-binding 2 fail; persistence 2 fail |
| Work M2: session check skipped | instances 11, adapter 1, cross-tenant 1 fail |
| Work M3: positive reused until token expiry | unit 4, instances 4 fail |
| Work M4: negative overwritable by a positive | unit 1 fail (test added after it first survived) |
| Work M5: cached negative ignored | unit 2 fail |
| Work M6: answer about another subject/session accepted | unit 3 fail |
| Work M7: Identity failure treated as active | unit 5 fail |
| Work M8: `no-store` removed | cross-tenant 1 fail |
| Work M9: token without `tid` accepted | adapter 1 fail |
| Identity I1: refusal reported as unavailable | 13 fail |
| Identity I2: dependency failure reported as inactive | 2 fail |
| Identity I3: signature-only check (no session or account state) | 15 fail |
| Identity I4: `no-store` dropped | 2 fail |

The introspection carve-out test failed before the edge path fix, which is how the edge defect in
`00-lead-orchestrator.md` section 12 was found.

## Low left open

- The "routed spellings" HTTP test proves those spellings reach the handler, not that they are counted
  under the introspection limit rather than `api-per-ip` (one request cannot fill 300 a minute). The
  exact-match and normalisation logic is small and was reviewed; left as is to keep the approved head.
