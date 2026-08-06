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
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  /** Set only if absent. Returns false when the key already existed — the basis of locking. */
  setIfAbsent<T>(key: string, value: T, options?: CacheSetOptions): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  /** Atomic increment. Creates the key at `by` when missing. */
  increment(key: string, by?: number, options?: CacheSetOptions): Promise<number>;
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
  reset(key: string): Promise<void>;
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
