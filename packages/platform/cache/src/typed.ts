import type { CachePort } from '@munaxa/interfaces';
import type { DurationMs } from '@munaxa/types';
import { namespaced } from './namespace.js';

/**
 * A typed view over a namespace.
 *
 * Call sites that cache one kind of record — sessions, resolved permission sets, tenant config —
 * get a small typed object instead of stringly-typed keys and `as` casts at every read.
 */
export class TypedCache<T> {
  readonly #cache: CachePort;
  readonly #ttl: DurationMs | undefined;

  constructor(cache: CachePort, namespace: string, ttl?: DurationMs) {
    this.#cache = namespaced(cache, namespace);
    this.#ttl = ttl;
  }

  get(key: string): Promise<T | undefined> {
    return this.#cache.get<T>(key);
  }

  async set(key: string, value: T, ttl: DurationMs | undefined = this.#ttl): Promise<void> {
    await this.#cache.set(key, value, ttl === undefined ? {} : { ttl });
  }

  async delete(key: string): Promise<boolean> {
    return this.#cache.delete(key);
  }

  /**
   * Read through to `load` on a miss.
   *
   * Deliberately does not deduplicate concurrent misses across processes — that needs a lock, and
   * taking one on every cache miss costs more than the occasional duplicate load. Where a load is
   * genuinely expensive, wrap the call in `withLock`.
   */
  async getOrLoad(
    key: string,
    load: () => Promise<T | undefined>,
    ttl: DurationMs | undefined = this.#ttl,
  ): Promise<T | undefined> {
    const cached = await this.get(key);
    if (cached !== undefined) return cached;

    const loaded = await load();
    // A negative result is not cached: for permissions and sessions, caching "absent" turns a
    // race during creation into a user-visible failure that persists for the whole TTL.
    if (loaded !== undefined) await this.set(key, loaded, ttl);
    return loaded;
  }
}

/**
 * Two tiers: a small in-process cache in front of a shared one.
 *
 * The near tier absorbs the repeated reads a single request makes (a session, a permission set);
 * the far tier keeps instances consistent. Writes and deletes go to both, near-first on delete so
 * a revocation cannot be re-populated from the far tier by a concurrent read on the same box.
 *
 * The honest caveat: a near-tier entry can be up to its own TTL stale after another instance
 * writes. Keep the near TTL to seconds, and never put a revocation check behind it.
 */
export class TieredCache implements CachePort {
  readonly #near: CachePort;
  readonly #far: CachePort;
  readonly #nearTtl: DurationMs;

  constructor(near: CachePort, far: CachePort, nearTtl: DurationMs = 5_000) {
    this.#near = near;
    this.#far = far;
    this.#nearTtl = nearTtl;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const near = await this.#near.get<T>(key);
    if (near !== undefined) return near;
    const far = await this.#far.get<T>(key);
    if (far !== undefined) await this.#near.set(key, far, { ttl: this.#nearTtl });
    return far;
  }

  async set<T>(key: string, value: T, options?: Parameters<CachePort['set']>[2]): Promise<void> {
    await this.#far.set(key, value, options);
    await this.#near.set(key, value, { ttl: this.#nearTtl });
  }

  async setIfAbsent<T>(
    key: string,
    value: T,
    options?: Parameters<CachePort['setIfAbsent']>[2],
  ): Promise<boolean> {
    // Only the shared tier can arbitrate — the near tier does not know what other instances did.
    const won = await this.#far.setIfAbsent(key, value, options);
    if (won) await this.#near.set(key, value, { ttl: this.#nearTtl });
    return won;
  }

  async delete(key: string): Promise<boolean> {
    await this.#near.delete(key);
    return this.#far.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.#near.has(key)) || this.#far.has(key);
  }

  async increment(
    key: string,
    by?: number,
    options?: Parameters<CachePort['increment']>[2],
  ): Promise<number> {
    // Counters must be authoritative, so they bypass the near tier entirely.
    await this.#near.delete(key);
    return this.#far.increment(key, by, options);
  }

  ttl(key: string): Promise<DurationMs | undefined> {
    return this.#far.ttl(key);
  }

  async clear(namespace?: string): Promise<void> {
    await this.#near.clear?.(namespace);
    await this.#far.clear?.(namespace);
  }
}
