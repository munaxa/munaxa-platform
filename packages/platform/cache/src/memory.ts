import type { CachePort, CacheSetOptions } from '@munaxa/interfaces';
import { systemClock, type Clock, type DurationMs } from '@munaxa/types';

/**
 * An in-process cache with TTL and a bounded size.
 *
 * This is not a development stand-in — it is the right implementation for single-process
 * deployments, for tests, and as the near tier of a two-tier cache. The bound matters: an
 * unbounded Map keyed by anything a client influences (a session id, an IP address, a rate-limit
 * bucket) is a memory-exhaustion primitive, so entries are evicted least-recently-used once
 * `maxEntries` is reached.
 *
 * Expiry is lazy plus sampled: reads drop expired entries they touch, and each write samples a
 * few keys. There is no interval timer, so a cache does not keep a process alive or fire during
 * a test run.
 */
export interface MemoryCacheOptions {
  readonly maxEntries?: number;
  readonly clock?: Clock;
  /** Keys sampled for expiry on each write. Zero disables sampling. */
  readonly sweepSampleSize?: number;
}

interface Entry {
  value: unknown;
  expiresAt: number | undefined;
}

export class MemoryCache implements CachePort {
  readonly #entries = new Map<string, Entry>();
  readonly #maxEntries: number;
  readonly #clock: Clock;
  readonly #sweepSampleSize: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 10_000;
    this.#clock = options.clock ?? systemClock;
    this.#sweepSampleSize = options.sweepSampleSize ?? 8;
  }

  get size(): number {
    return this.#entries.size;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.#live(key);
    if (!entry) return undefined;
    // Re-insert to mark as recently used; Map preserves insertion order, which is what makes
    // the first key returned by keys() the LRU victim.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const existing = this.#live(key);
    const expiresAt =
      options.keepTtl && existing ? existing.expiresAt : this.#deadline(options.ttl);
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt });
    this.#evict();
  }

  async setIfAbsent<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<boolean> {
    if (this.#live(key)) return false;
    await this.set(key, value, options);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.#entries.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.#live(key) !== undefined;
  }

  async increment(key: string, by = 1, options: CacheSetOptions = {}): Promise<number> {
    const entry = this.#live(key);
    const current = typeof entry?.value === 'number' ? entry.value : 0;
    const next = current + by;
    // A counter's window must not slide on every hit, so an existing expiry is kept unless the
    // caller explicitly asks otherwise. This is the semantic Redis gives INCR, and rate limiting
    // depends on it.
    const expiresAt =
      entry && options.keepTtl !== false ? entry.expiresAt : this.#deadline(options.ttl);
    this.#entries.set(key, { value: next, expiresAt });
    this.#evict();
    return next;
  }

  async ttl(key: string): Promise<DurationMs | undefined> {
    const entry = this.#live(key);
    if (!entry?.expiresAt) return undefined;
    return Math.max(0, entry.expiresAt - this.#clock.now());
  }

  async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      this.#entries.clear();
      return;
    }
    const prefix = `${namespace}:`;
    for (const key of this.#entries.keys()) {
      if (key.startsWith(prefix)) this.#entries.delete(key);
    }
  }

  #deadline(ttl: DurationMs | undefined): number | undefined {
    return ttl === undefined ? undefined : this.#clock.now() + ttl;
  }

  #live(key: string): Entry | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && this.#clock.now() >= entry.expiresAt) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }

  #evict(): void {
    this.#sweep();
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  #sweep(): void {
    if (this.#sweepSampleSize <= 0) return;
    const now = this.#clock.now();
    let sampled = 0;
    for (const [key, entry] of this.#entries) {
      if (sampled++ >= this.#sweepSampleSize) break;
      if (entry.expiresAt !== undefined && now >= entry.expiresAt) this.#entries.delete(key);
    }
  }
}
