import type { CachePort, CacheSetOptions } from '@munaxa/interfaces';
import type { DurationMs } from '@munaxa/types';

/**
 * The slice of a Redis client the platform actually uses.
 *
 * Declaring it here rather than importing `ioredis` or `redis` is what keeps the platform cloud
 * agnostic: `ioredis`, `node-redis`, a Valkey client, an Upstash HTTP client and a test double
 * all satisfy this shape, and none of them becomes a dependency of every Munaxa product.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: readonly (string | number)[]): Promise<string | null>;
  del(...keys: readonly string[]): Promise<number>;
  exists(...keys: readonly string[]): Promise<number>;
  incrby(key: string, increment: number): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  /** Optional — used only by `clear(namespace)`, which is itself optional. */
  scan?(cursor: string, ...args: readonly (string | number)[]): Promise<[string, string[]]>;
  /** Optional — used by the lock's compare-and-delete. Falls back to a non-atomic path. */
  eval?(script: string, numKeys: number, ...args: readonly string[]): Promise<unknown>;
}

export interface RedisCacheOptions {
  /** Prepended to every key. Set it per application so two products never collide. */
  readonly keyPrefix?: string;
  /** Values larger than this are refused rather than silently filling the cache. */
  readonly maxValueBytes?: number;
}

/**
 * `CachePort` over any Redis-compatible server.
 *
 * Values are JSON. That costs a little CPU and buys the thing that matters here: a value written
 * by one service and read by another does not depend on both running the same Node version, the
 * same serializer, or the same class definitions.
 */
export class RedisCache implements CachePort {
  readonly #redis: RedisLike;
  readonly #prefix: string;
  readonly #maxValueBytes: number;

  constructor(redis: RedisLike, options: RedisCacheOptions = {}) {
    this.#redis = redis;
    this.#prefix = options.keyPrefix ?? 'munaxa:';
    this.#maxValueBytes = options.maxValueBytes ?? 512 * 1024;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.#redis.get(this.#key(key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A value we cannot parse is a value someone else wrote, or a corrupted one. Treat it as a
      // miss rather than throwing on a read path — but do not delete it, since it is not ours.
      return undefined;
    }
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const payload = this.#encode(value);
    const args: (string | number)[] = [];
    if (options.keepTtl) args.push('KEEPTTL');
    else if (options.ttl !== undefined) args.push('PX', Math.max(1, Math.round(options.ttl)));
    await this.#redis.set(this.#key(key), payload, ...args);
  }

  async setIfAbsent<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<boolean> {
    const args: (string | number)[] = ['NX'];
    if (options.ttl !== undefined) args.push('PX', Math.max(1, Math.round(options.ttl)));
    const result = await this.#redis.set(this.#key(key), this.#encode(value), ...args);
    return result !== null;
  }

  async delete(key: string): Promise<boolean> {
    return (await this.#redis.del(this.#key(key))) > 0;
  }

  async has(key: string): Promise<boolean> {
    return (await this.#redis.exists(this.#key(key))) > 0;
  }

  async increment(key: string, by = 1, options: CacheSetOptions = {}): Promise<number> {
    const full = this.#key(key);
    const next = await this.#redis.incrby(full, by);
    // Only the call that created the key sets the expiry. Doing it on every hit would turn a
    // fixed window into a sliding one and let a steady stream of requests keep a limit alive
    // forever.
    if (next === by && options.ttl !== undefined) {
      await this.#redis.pexpire(full, Math.max(1, Math.round(options.ttl)));
    }
    return next;
  }

  async ttl(key: string): Promise<DurationMs | undefined> {
    const remaining = await this.#redis.pttl(this.#key(key));
    return remaining < 0 ? undefined : remaining;
  }

  /**
   * Delete a namespace with SCAN, never KEYS.
   *
   * KEYS blocks the server for the duration of a full keyspace walk; on a shared cache that is an
   * outage for every other tenant on the box.
   */
  async clear(namespace?: string): Promise<void> {
    if (!this.#redis.scan) {
      throw new Error('This Redis client does not support SCAN; clear(namespace) is unavailable');
    }
    const match = `${this.#prefix}${namespace ? `${namespace}:` : ''}*`;
    let cursor = '0';
    do {
      const [next, keys] = await this.#redis.scan(cursor, 'MATCH', match, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await this.#redis.del(...keys);
    } while (cursor !== '0');
  }

  #key(key: string): string {
    return `${this.#prefix}${key}`;
  }

  #encode(value: unknown): string {
    const payload = JSON.stringify(value ?? null);
    if (payload.length > this.#maxValueBytes) {
      throw new Error(
        `Cache value for is ${payload.length} bytes, above the ${this.#maxValueBytes}-byte limit`,
      );
    }
    return payload;
  }
}
