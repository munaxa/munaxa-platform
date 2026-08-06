import type { DurationMs } from '@munaxa/types';

/**
 * The one cache abstraction in the ecosystem.
 *
 * `CachePort` is deliberately smaller than Redis: everything on it can be implemented on an
 * in-process Map, a Redis cluster, a Cloudflare KV namespace or a future managed cache without
 * emulation. Anything Redis-specific that leaks into this interface becomes a deployment
 * constraint for every Munaxa product, so it stays out.
 *
 * Implementations must treat keys as opaque and must not collide across namespaces; use
 * `namespaced()` from `@munaxa/cache` rather than concatenating prefixes by hand.
 */
export interface CachePort {
  /**
   * @atomicity none
   * @consistency eventual — never decide a revocation on a cache read alone
   * @idempotency idempotent
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * @atomicity atomic — a concurrent reader sees the old value or the new one, never a partial
   * @consistency read-your-writes
   * @idempotency idempotent
   */
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;

  /**
   * Set only if absent. Returns false when the key already existed.
   *
   * The platform's single-use primitive: distributed locks, one-time-code consumption and TOTP
   * step consumption all reduce to it. Exactly one caller across the whole fleet may receive
   * `true` for a given key — an implementation that can return `true` twice breaks MFA replay
   * protection, not merely a cache.
   *
   * Must map to `SET key value NX PX ttl`, an insert with a unique key, or an equivalent. A
   * `has()` followed by a `set()` is **not** an implementation of this method.
   *
   * @atomicity compare-and-swap
   * @consistency linearizable
   * @idempotency at-most-once
   */
  setIfAbsent<T>(key: string, value: T, options?: CacheSetOptions): Promise<boolean>;

  /**
   * @atomicity atomic
   * @consistency linearizable
   * @idempotency idempotent — deleting an absent key returns false, not an error
   */
  delete(key: string): Promise<boolean>;

  /**
   * @atomicity none
   * @consistency eventual
   * @idempotency idempotent
   */
  has(key: string): Promise<boolean>;

  /**
   * Atomic increment. Creates the key at `by` when missing.
   *
   * Must be a server-side increment (`INCRBY`), not read-modify-write: rate limiting is exactly
   * the condition under which concurrent increments happen, so a lost update is a bypassed limit.
   *
   * @atomicity atomic
   * @consistency linearizable
   * @idempotency at-least-once — a retried increment counts twice, so the platform never retries
   */
  increment(key: string, by?: number, options?: CacheSetOptions): Promise<number>;

  /**
   * Replace a value only if it is still the one that was read. Optional.
   *
   * `increment` covers counters, but state that is not a single number — a token bucket's
   * `{tokens, updatedAt}` pair — cannot be updated atomically without it. Callers read, compute,
   * then offer the new value along with the old one; a `false` result means somebody else got
   * there first and the caller must re-read rather than overwrite.
   *
   * Compare by identity of the stored value, not by deep equality: an adapter that serialises
   * should compare the serialised bytes (Redis `WATCH`/`MULTI`, a `SET … NX` over a version
   * token, or `UPDATE … WHERE value = $expected`). Passing `undefined` as `expected` means
   * "only if the key is absent", which makes this a superset of `setIfAbsent`.
   *
   * Backings that cannot do this — Cloudflare KV, most CDN caches — leave it unimplemented, and
   * callers degrade explicitly rather than silently: see `TokenBucket.enforcement`.
   *
   * @atomicity compare-and-swap
   * @consistency linearizable
   * @idempotency at-most-once — a retried swap fails, because the expected value has moved on
   */
  compareAndSet?<T>(
    key: string,
    expected: T | undefined,
    next: T,
    options?: CacheSetOptions,
  ): Promise<boolean>;

  /** Remaining lifetime in ms, `undefined` when the key is missing or has no expiry. */
  ttl(key: string): Promise<DurationMs | undefined>;
  /** Drop every key under a namespace. Optional: some backings cannot scan. */
  clear?(namespace?: string): Promise<void>;
}

export interface CacheSetOptions {
  /** Lifetime from now. Omit for no expiry — rare, and a leak in most call sites. */
  readonly ttl?: DurationMs;
  /** Keep the existing expiry instead of resetting it (increment counters need this). */
  readonly keepTtl?: boolean;
}

/**
 * Fixed-window and sliding-window counters.
 *
 * Separate from `CachePort` because rate limiting needs the count and the window reset time in
 * one round trip; doing it with get/set races under concurrency, which is exactly the condition
 * a rate limiter operates in.
 */
export interface CounterPort {
  /** Increment within the window and report the state after the increment. */
  hit(key: string, window: DurationMs, cost?: number): Promise<CounterState>;
  peek(key: string): Promise<CounterState | undefined>;
  /**
   * Clear a subject's count. Implementations that bucket by window need the same `window` the
   * hits were recorded with in order to find those buckets; omitting it clears only an unbucketed
   * key, which is why every caller that limits should pass it.
   */
  reset(key: string, window?: DurationMs): Promise<void>;
}

export interface CounterState {
  readonly count: number;
  /** Epoch millis at which this window ends. */
  readonly resetAt: number;
}

/**
 * A mutual exclusion primitive with a fencing token.
 *
 * The token is not decoration: a holder that stalls past the lease and wakes up later must not be
 * able to release, or extend, a lock a second holder now owns. Implementations compare the token
 * on release and extend.
 */
export interface LockPort {
  acquire(key: string, lease: DurationMs, options?: LockAcquireOptions): Promise<LockHandle | null>;
  release(handle: LockHandle): Promise<boolean>;
  extend(handle: LockHandle, lease: DurationMs): Promise<boolean>;
}

export interface LockAcquireOptions {
  /** Total time to keep retrying before giving up. Default: fail immediately. */
  readonly waitFor?: DurationMs;
  readonly retryInterval?: DurationMs;
}

export interface LockHandle {
  readonly key: string;
  /** Fencing token. Opaque to callers, compared by the implementation. */
  readonly token: string;
  readonly acquiredAt: number;
  readonly expiresAt: number;
}
