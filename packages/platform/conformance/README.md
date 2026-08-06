# @munaxa/conformance

The executable specification of every Munaxa platform port.

The platform assumes things about a product's stores that prose cannot enforce: that `setIfAbsent`
has exactly one winner across a fleet, that `markRotated` is a compare-and-swap, that
`appendChained` serialises per tenant. Every one of those is a security property, and every one is
invisible in a sequential test — which is how Platform 1.0 shipped four of them broken.

This package turns those assumptions into tests an adapter runs against its own implementation.

## Usage

```ts
import { describe, it, expect } from 'vitest';
import { runCacheConformance } from '@munaxa/conformance';

runCacheConformance(
  { describe, it, expect },
  {
    createCache: () => new RedisCache(client, { keyPrefix: `test:${randomUUID()}:` }),
    concurrency: 200,
  },
);
```

The suites take the test runner as a parameter, so this package depends on no test framework and
works under vitest, jest or node's own runner.

## Suites

| Function | Port |
| --- | --- |
| `runCacheConformance` | `CachePort` |
| `runAuditConformance` | `AuditRepositoryPort` |
| `runRefreshTokenConformance` | `RefreshTokenStorePort` |
| `runResetTokenConformance` | `ResetTokenStorePort` |
| `runSessionConformance` | `SessionStorePort` |

Also exported: `tick`, `race` and `Seeded` — the interleaving helpers the suites are built on.
`Seeded` is a deterministic xorshift, so an ordering that fails reproduces instead of becoming a
flake somebody retries away.

## Run it against real infrastructure

The properties under test are properties of the storage engine. A mock cannot fail the way Redis
or Postgres can, so running these against a fake proves nothing.

The suites are deliberately hostile: they create interleaving with seeded jitter rather than
hoping for it, because an adapter that is only atomic when nothing yields is an adapter that
passes CI and fails in production.

See the [adapter guide](../../../docs/security-platform/adapter-guide.md) for the exact statement
each atomic operation needs, and
[distributed guarantees](../../../docs/security-platform/distributed-guarantees.md) for what the
platform promises once they hold.
