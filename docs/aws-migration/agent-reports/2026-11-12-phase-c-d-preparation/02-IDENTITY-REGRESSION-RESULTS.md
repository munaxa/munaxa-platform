# 02. Identity regression results (Phase C4)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

## How the tests were run

**[L]** `supporting/tools/identity-ci-local.sh <worktree> <db>` reproduces the `verify` job of Identity's `.github/workflows/ci.yml` in this session's container. It uses **real local services, no mocks**:
- PostgreSQL 16, with the CI's non-superuser roles `identity_mig` and `identity_app`;
- every migration applied in order, as the migration role;
- the CI grant list;
- redis-server 7.0.15 on 6379, as the CI's service container.

The steps are:
1. `pnpm format:check`
2. `lint`
3. `prisma:generate`
4. `typecheck`
5. `build`
6. `prisma:validate`
7. `test` (config unit)
8. `test:integration` with `CACHE_CONNECTION_TEST_REQUIRE_SERVER=1`. The cache suite cannot skip: it starts its own replication pair behind a switchable TCP proxy and a TLS-only server with a per-run CA.
9. `check:catalogue-drift`

Two worktrees:
- **Baseline:** Identity main `25823b1` on the published-equivalent Platform 2.4.1 (01, C2).
- **Candidate:** identity#18 head `098df24` on the Platform 2.5.0 candidate packed from `47ffd08`.

Both runs passed every step **[L]**. Logs (test result lines only):
- `supporting/identity-ci-local-2.4.1-25823b1.log`
- `supporting/identity-ci-local-2.5.0-098df24.log`

| Suite | 2.4.1 baseline | 2.5.0 candidate |
| --- | --- | --- |
| format, lint, prisma generate, typecheck, build, prisma validate, catalogue drift | pass | pass |
| config unit | **59/59** | **59/59** |
| integration (19 files) | **291/291** | **292/292** (+1 new test) |

Per file:

| File | 2.4.1 | 2.5.0 |
| --- | --- | --- |
| `auth-edge-limits.http.integration.test.ts` | 32 | 32 |
| `auth-failure-semantics.integration.test.ts` | 9 | 9 |
| `cache-connection.integration.test.ts` | 11 | 11 |
| `conformance.integration.test.ts` | 20 | 20 |
| `mfa-flow.integration.test.ts` | 25 | 25 |
| `mfa-http.integration.test.ts` | 5 | 5 |
| `mfa-store.integration.test.ts` | 38 | 38 |
| `operator.integration.test.ts` | 11 | 11 |
| `password-change.integration.test.ts` | 7 | 7 |
| `password-recovery.integration.test.ts` | 30 | 30 |
| `rds-certificate-trust.test.ts` | 4 | 4 |
| `readiness.integration.test.ts` | 9 | 9 |
| `return-to.test.ts` | 4 | 4 |
| `row-level-security.integration.test.ts` | 16 | 16 |
| `session-management.integration.test.ts` | 35 | 35 |
| `session-view.test.ts` | 6 | 6 |
| `token-introspection.http.integration.test.ts` | 6 | 6 |
| `token-introspection.integration.test.ts` | 18 | **19** |
| `token-size.integration.test.ts` | 5 | 5 |
| config: `environment.test.ts` | 49 | 49 |
| config: `password-recovery.test.ts` | 10 | 10 |

**The new test on the baseline [L]:** run alone against 2.4.1, it **fails**. Five of its six bad tokens are accepted as active (01, C3). On 2.5.0 it passes. This is the only behavioural difference the suites found, and it is the intended one.

## Coverage of each requested area

| Area | Where it is tested | 2.4.1 | 2.5.0 |
| --- | --- | --- | --- |
| Authentication and login | `auth-failure-semantics` (wrong password, disabled account, lockout reported separately, never a token on failure), `auth-edge-limits.http` | pass | pass |
| Token verification and expiration | `token-introspection` ("an expired one is inactive", new own-signature test), `token-size` | pass (new test fails) | pass |
| Exact audience validation | new test: `aud` superstrings refused, exact string accepted | **fails** (substring accepted) | pass |
| MFA enrollment and verification | `mfa-store` (confirm, drift, expiry, replacement), `mfa-flow` | pass | pass |
| MFA recovery codes | `mfa-store` (keyed hashes, single use, concurrent spend once, case, "cannot be saved or spent without an active factor"), `mfa-flow` | pass | pass |
| MFA replay protection | `mfa-store` (same code twice, across replicas, concurrent), `mfa-flow` (replayed code on a fresh challenge) | pass | pass |
| Session creation and revocation | `session-management` (35), `token-introspection` (every revocation route, refresh race) | pass | pass |
| RBAC and role hierarchy | `row-level-security`, `conformance` (store ports), `token-size` (roles and perms in tokens), `operator` | pass | pass |
| Rate limiting | `auth-edge-limits.http` (32: every route spelling, refusals count, IPv6 /64, 503 on store loss, Retry-After) | pass | pass |
| Lockouts and counters | `auth-failure-semantics`, `auth-edge-limits.http` (whitespace identifier shares the lockout), `mfa-flow` (account failure limit across challenges) | pass | pass |
| Redis/Valkey connection failure | `cache-connection` ("fails closed while the store is gone and recovers"), `auth-failure-semantics` ("dependency-unavailable when the cache is down"), `readiness` | pass | pass |
| READONLY reconnect | `cache-connection` (real failover pair: refused write fails closed, next lands on the new primary; stuck replica: not ready, nothing resent) | pass | pass |
| TLS certificate validation | `cache-connection` (right CA and host; refuses another CA, another host name, plaintext) | pass | pass |
| Incorrect password rejection | `auth-failure-semantics`; `cache-connection` (wrong store password, plain and TLS) | pass | pass |
| IPv4 and IPv6 URL handling | config `environment.test` (production `REDIS_URL` rules, loopback = 127/8 canonical, `::1`, `localhost`); `auth-edge-limits.http` (IPv6 /64) | pass | pass |
| Production configuration validation | config `environment.test` (49) | pass | pass |
| Readiness against primary and replica | `cache-connection` (stuck-replica: `ROLE` not master, so not ready), `readiness` (9) | pass | pass |
| Fail-closed behaviour | all of the above; plus 503 `AUTH_UNAVAILABLE` on credential routes | pass | pass |

**[L]** Additional check outside the suites: `addressSubject` idempotence (01). Identity's subject, passed through Platform 2.5.0's `addressSubject`, is unchanged for every input tried.

## Investigated, not regressions

- **Retry-After up to about 1.5 windows on 2.5.0.** Corrected in identity#17 (Phase A). The test bound is now "below two windows". It passed in both runs.
- **`[ioredis] Unhandled error event: ECONNREFUSED` lines in the log.** These come from the cache suite's deliberate store-gone and failover cases (the TCP proxy is closed on purpose). The same lines appear in both runs, and every test passes.
- **IPv6 general limits now per /64** (`api-per-ip` 300/min, `introspect-per-ip` 12,000/min).
  - This is stricter for many IPv6 hosts in one /64.
  - **[E]** Effect: nil for Testing. Production Work tasks reach Identity from their own public IPv4 addresses (no NAT; `assign_public_ip = true`), and a school's IPv6 clients normally share a /64 behind one router anyway.
  - **[R]** Recorded in `docs/rate-limits.md`.

## What these results do not show

- **[U]** ElastiCache for Valkey 8.1 itself: TLS certificate chain, `ROLE` and `EVAL` permissions for the default AUTH user, real failover timing. Seen first in Phase E.
- **[U]** The Testing sidecar image `valkey/valkey@sha256:757b…` (Valkey 8.1.11). Locally the protocol is redis-server 7.0.15, using the same commands.
- **[U]** The published 2.5.0 tarballs. They are compared with the candidate's content digests after publication (01).
