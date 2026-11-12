# 03. Identity compatibility tests

All runs are local **[L]**: PostgreSQL 16 and redis-server 7.0.15 (Redis protocol, same commands as
Valkey 8 for what Identity uses) in this session's container. **[U]** Behaviour against ElastiCache
Valkey 8.1 itself is first seen in Phase E.

## Identity on Platform 2.4.1 (identity#17 as a change to main)

| Suite | Before (main `a1bf695`) | identity#17 |
| --- | --- | --- |
| config unit | 47 | 59 |
| integration | 280 | 291 |
| typecheck, lint, build, format, prisma validate, catalogue drift | pass | pass |

CI on the PR runs the same suites with `redis-server` installed and
`CACHE_CONNECTION_TEST_REQUIRE_SERVER=1`, so the cache tests cannot be silently skipped.

## Identity on the local 2.5.0 candidate (B3)

Platform tarballs packed from platform#112's tree (`/tmp/claude-0/tgz-250`, SHA256SUMS recorded),
installed through pnpm overrides in a detached Identity worktree.

| Suite | Result |
| --- | --- |
| config unit | 59/59 |
| integration | 291/291 |
| typecheck, lint | pass |

One compatibility difference was found and corrected in identity#17 (`b3d2594`): with 2.5.0's sliding
window, `Retry-After` after twice the limit is "end of this window plus the decay of the carried
count", up to about 1.5 windows (455 s seen for a 5-minute window). The old test bound (one window)
failed whenever the test started early in the fixed window. The bound is now strictly less than two
windows; the behaviour is the truthful one and is a #107 design property, not an Identity regression.

Over TLS (`rediss://` with a per-run CA via `NODE_EXTRA_CA_CERTS`): 290/291; the one failure is the
hung-store test whose admin socket speaks plaintext to the TLS server, a harness limit.

## What the new cache tests prove

| Test | Proves |
| --- | --- |
| failover pair behind a switchable TCP proxy | after a real promotion the refused write fails closed, the next lands on the new primary, the value is counted once and keeps its expiry; a control client without the option keeps failing |
| endpoint stuck on a replica | readiness is false (ROLE), the write is refused, at most 3 new connections in 3 s (no resend loop), nothing applied after promotion |
| store gone and back | fails closed, recovers without restart |
| wrong password (plain and TLS) | refused, no unauthenticated handle |
| TLS-only server, own CA | connects with the right CA and host name; refuses another CA, another host name, plaintext |
| config | production URL rules, blank URL refused, redaction, canonical loopback |

Mutations: `reconnectOnError` back to 2 fails 2 tests; a weakened `ROLE` check fails 1;
`rejectUnauthorized: false` fails 3; removing `reconnectOnError` fails 1 **[L]**.

## Preserved behaviour

MFA replay markers (`setIfAbsent`), lockout and rate-limit counting, fail-closed readiness, the
identity#16 edge limits and 503s: all their existing tests pass unchanged on both Platform versions.
