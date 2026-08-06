/**
 * @munaxa/conformance — the executable specification of every platform port.
 *
 * The platform assumes things about its stores that prose cannot enforce: that `setIfAbsent` has
 * exactly one winner across a fleet, that `markRotated` is a compare-and-swap, that
 * `appendChained` serialises per tenant. Every one of those assumptions is a security property,
 * and every one of them is invisible in a sequential test — which is how Platform 1.0 shipped
 * four of them broken.
 *
 * A product runs these against its own adapters:
 *
 * ```ts
 * import { describe, it, expect } from 'vitest';
 * import { runCacheConformance } from '@munaxa/conformance';
 *
 * runCacheConformance({ describe, it, expect }, {
 *   createCache: () => new RedisCache(freshRedisClient(), { keyPrefix: `test:${randomUUID()}:` }),
 * });
 * ```
 *
 * The suites take the test runner as a parameter, so this package depends on no test framework
 * and works under vitest, jest or node's own runner. They are also deliberately *hostile*: they
 * create interleaving with jitter rather than hoping for it, because an adapter that is only
 * atomic when nothing yields is an adapter that fails in production and passes in CI.
 */

export * from './harness.js';
export * from './cache.js';
export * from './audit.js';
export * from './tokens.js';
export * from './sessions.js';
