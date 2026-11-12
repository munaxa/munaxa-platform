# 06. Independent security review

Three rounds, by reviewers who did not write the code, read-only (no push, no comment, no AWS call).

- **Round 1:** two reviewers in parallel: (a) Terraform and release workflow (#110, #111);
  (b) Identity cache connection and version PR (#17, #112).
- **Round 2:** the same reviewers verified every fix on the new heads and reran the tests.
- **Round 3:** a fresh reviewer approved all four final heads (result below).

## Round 1 findings

| ID | PR | Severity | Finding | Fix (head) | Round 2 |
| --- | --- | --- | --- | --- | --- |
| R-M1 | #111 | **Medium** | `echo "filters=$(...)"` hides a failing script from `set -e`; an empty list makes `pnpm -r publish` publish the whole workspace (irreversible) | list assigned first; Pack and Publish refuse anything but exactly 13 filters, tested in bash (`d8bfb28`); then whole-string match (`e5116b0`) | resolved |
| R-L2 | #111 | Low | dry run on any ref ran under a token with `packages: write` | separate `dry-run` job, `contents: read` (`d8bfb28`) | resolved |
| R-L3 | #111 | Low | `actions/setup-node@v5` pinned by tag | pinned to `a0853c24…` v5.0.0 (`d8bfb28`) | resolved (pin not checked online) |
| R-L4 | #111 | Low | tests checked YAML text only | job-aware tests, guard run in bash, no publish outside Publish, SHA pins (`d8bfb28`) | resolved |
| I1 | #17 | **Medium** | `reconnectOnError` returning 2 resends without limit while the endpoint names a replica (96 connections in 5 s reproduced) and applies the write after the caller saw a timeout | returns 1; stuck-replica test; docs (`51af808`) | resolved (2 connections in 5 s, nothing applied late) |
| I2 | #17 | Low | readiness `PING` is answered by a replica | `ROLE` must be `master` (`51af808`) | resolved |
| I3 | #17 | Low | whitespace-only `REDIS_URL` gave production an in-process cache | trimmed check (`51af808`) | resolved |
| I4 | #17 | Low | `describeEnvironment` showed the store password | `redactRedisUrl` (`51af808`) | resolved |
| I5 | #17 | Info | `127.0.0.01` counted as loopback | canonical octets (`51af808`) | resolved |
| T-1..T-5 | #110 | Low | deployer Deny vs documented grant; KMS `SourceArn`; slow log copies values; alias drift; ROTATE default | see [02](02-TERRAFORM-SECURITY-REVIEW.md) (`1ee378a`) | T-1, T-3, T-5 resolved; T-2 partly (SourceAccount unverified); T-4 open |
| — | #112 | — | none; Info on changelog wording | — | approved in round 1 |

Round 2 notes, all handled: whole-string filter guard (Low, fixed `e5116b0`); padded URL failing in
ioredis, query kept by redaction, `ROLE` dependency undocumented (Info, fixed `cfb0e29`).

## Open Low and Info items, with rationale

| ID | Severity | Item | Why it is acceptable now |
| --- | --- | --- | --- |
| T-2 | Low | Whether CloudWatch's KMS request carries `aws:SourceAccount` is unverified | Nothing exists until Phase E; Phase E step: `set-alarm-state` on one alarm, confirm history and email. If it fails, remove the condition in a reviewed PR |
| T-11 | Low | Ops-topic alarms use the shared data key | Production only, service principal; own key recommended before Phase E |
| T-4 | Low | Alias provider kept identical by review only | One file, two adjacent blocks; CI check recommended with the next infra PR |
| N1 | Low | On Platform 2.4.1 a failover between `INCRBY` and `PEXPIRE` can leave a counter without expiry | Same exposure existed before for any error between the two; 2.5.0's single script closes it, and production adopts 2.5.0 before the cache exists |
| N2 | Info | `ROLE` needs `@admin`/`@dangerous` under ElastiCache RBAC | Default AUTH-token user may run it; documented in identity `docs/production-readiness.md`; fails closed |
| — | Info | `npm pack --dry-run` keeps `workspace:^` | The 13 depend only on each other |
| — | Info | Changelog generated offline; omits two #107 behaviours | Attribution checked; recorded in [04](04-PLATFORM-RELEASE-READINESS.md) |
| — | Info | Async replication can lose an acknowledged write (e.g. a replay marker) in an unplanned failover | Inherent to ElastiCache; the replica is a later in-place step; TOTP window is short |
| T-6..T-10 | Info | apply_immediately, precondition drift, draining overlap, engine events, 503 metric | see 02 |

## Round 3 (final heads)

| PR | Head | Verdict |
| --- | --- | --- |
| platform#110 | `1ee378aaf4b978e58f06ed4952f3a3cb5678a062` | **APPROVE** (no Critical, High or Medium) |
| platform#111 | `e5116b0f8e6ab229de006cfdfa586d7a3319f4a2` | **APPROVE** (no Critical, High or Medium) |
| platform#112 | `98a51ab81d087df9f11aabf7b5777a29f793ebbb` | **APPROVE** (no Critical, High or Medium) |
| identity#17 | `cfb0e29378418dd4a753ce16facf74448c7a44a1` | **APPROVE** (no Critical, High or Medium) |

Round 3 tests: stack 66, module 14, bootstrap 12; release script 19; Identity config 59 and
integration 291 (none skipped) on 2.5.0. Its notes:

- **T-11, Low (#110):** the CloudWatch KMS statement grants `kms:Decrypt`/`GenerateDataKey*` on the shared
  data key (RDS, logs, secrets), limited by `aws:SourceAccount` only. Accepted for now: the grant
  exists only in production with the cache, and CloudWatch can use it only as the alarm-action
  service. **[R]** Give the ops topic its own KMS key before Phase E (small Terraform PR).
- **Info (#111):** anyone who can push can still publish by dispatching an edited workflow from a
  branch; the fix is the owner's environment-secret setting ([04](04-PLATFORM-RELEASE-READINESS.md)).
- **Info (#112):** merge #111 before #112 (done in that order), so the old workflow never sees 2.5.0.
- **Info (identity#17):** `servername` set for IP-literal hosts gives Node's DEP0123 warning in tests;
  production uses a DNS name.
