/**
 * @munaxa/cache — one `CachePort`, several backings, no product-visible difference.
 *
 * Everything in the platform that needs shared state — rate limit counters, session lookups,
 * lockout tallies, distributed locks — goes through `CachePort`. A product deploying on a single
 * node wires `MemoryCache`; a product on Kubernetes wires `RedisCache`; a product on an edge
 * runtime writes an adapter for whatever KV store it has. None of that reaches the packages that
 * consume the cache.
 */

export * from './memory.js';
export * from './redis.js';
export * from './namespace.js';
export * from './counters.js';
export * from './locks.js';
export * from './typed.js';
