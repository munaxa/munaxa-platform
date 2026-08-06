import type { CachePort, CounterPort, CounterState } from '@munaxa/interfaces';
import { systemClock, type Clock, type DurationMs } from '@munaxa/types';

/**
 * Fixed-window counters over any `CachePort`.
 *
 * The window is derived from the clock rather than from the first hit: bucket `k` covers
 * `[floor(now/window)*window, +window)`. That makes the same key produce the same window on
 * every process in a cluster with no coordination, which is what lets several application
 * instances share one rate limit.
 *
 * The known cost of fixed windows is the boundary burst — up to 2× the limit across two adjacent
 * windows. Where that matters, use `SlidingWindowCounter` below, which pays one extra read to
 * remove it.
 */
export class FixedWindowCounter implements CounterPort {
  readonly #cache: CachePort;
  readonly #clock: Clock;

  constructor(cache: CachePort, clock: Clock = systemClock) {
    this.#cache = cache;
    this.#clock = clock;
  }

  async hit(key: string, window: DurationMs, cost = 1): Promise<CounterState> {
    const { bucketKey, resetAt } = this.#bucket(key, window);
    const count = await this.#cache.increment(bucketKey, cost, { ttl: window });
    return { count, resetAt };
  }

  async peek(key: string): Promise<CounterState | undefined> {
    // Without the window the exact bucket is unknown, so peek reads the current one at the
    // caller's last-used window size. Callers that need it pass the window to `hit` with cost 0.
    const count = await this.#cache.get<number>(key);
    if (count === undefined) return undefined;
    const ttl = await this.#cache.ttl(key);
    return { count, resetAt: this.#clock.now() + (ttl ?? 0) };
  }

  async reset(key: string, window?: DurationMs): Promise<void> {
    await this.#cache.delete(key);
    if (window === undefined) return;
    // Hits live under `key:<bucket index>`; clear the current window and the one before it, which
    // is the most a sliding estimate can still be reading from.
    const index = Math.floor(this.#clock.now() / window);
    await this.#cache.delete(`${key}:${index}`);
    await this.#cache.delete(`${key}:${index - 1}`);
  }

  #bucket(key: string, window: DurationMs): { bucketKey: string; resetAt: number } {
    const now = this.#clock.now();
    const index = Math.floor(now / window);
    return { bucketKey: `${key}:${index}`, resetAt: (index + 1) * window };
  }
}

/**
 * Sliding-window counter, approximated from two adjacent fixed windows.
 *
 * The estimate is `previous × (overlap fraction) + current`, the standard approximation used by
 * CDNs. It costs one extra read per check and removes the boundary burst that lets a caller
 * spend two full windows' worth of budget in a few milliseconds.
 */
export class SlidingWindowCounter implements CounterPort {
  readonly #cache: CachePort;
  readonly #clock: Clock;

  constructor(cache: CachePort, clock: Clock = systemClock) {
    this.#cache = cache;
    this.#clock = clock;
  }

  async hit(key: string, window: DurationMs, cost = 1): Promise<CounterState> {
    const now = this.#clock.now();
    const index = Math.floor(now / window);
    const elapsed = now - index * window;
    const currentKey = `${key}:${index}`;
    const previousKey = `${key}:${index - 1}`;

    const current = await this.#cache.increment(currentKey, cost, { ttl: window * 2 });
    const previous = (await this.#cache.get<number>(previousKey)) ?? 0;
    const weight = 1 - elapsed / window;

    return {
      count: Math.round(previous * weight + current),
      resetAt: (index + 1) * window,
    };
  }

  async peek(key: string): Promise<CounterState | undefined> {
    const count = await this.#cache.get<number>(key);
    if (count === undefined) return undefined;
    const ttl = await this.#cache.ttl(key);
    return { count, resetAt: this.#clock.now() + (ttl ?? 0) };
  }

  async reset(key: string, window?: DurationMs): Promise<void> {
    await this.#cache.delete(key);
    if (window === undefined) return;
    const index = Math.floor(this.#clock.now() / window);
    await this.#cache.delete(`${key}:${index}`);
    await this.#cache.delete(`${key}:${index - 1}`);
  }
}

/**
 * A token bucket, stored as two numbers.
 *
 * Where a window counter answers "how many in the last minute", a bucket answers "at what rate,
 * with how much burst" — the better fit for expensive operations (password hashing, an outbound
 * provider call) where a short burst is fine but a sustained rate is not.
 */
export interface TokenBucketOptions {
  /** Tokens added per second. */
  readonly refillPerSecond: number;
  /** Maximum tokens the bucket can hold — the burst allowance. */
  readonly capacity: number;
}

export interface TokenBucketResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Milliseconds until the requested cost would be available. Zero when allowed. */
  readonly retryAfter: DurationMs;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

export class TokenBucket {
  readonly #cache: CachePort;
  readonly #clock: Clock;
  readonly #maxAttempts: number;

  constructor(cache: CachePort, clock: Clock = systemClock, maxAttempts = 5) {
    this.#cache = cache;
    this.#clock = clock;
    this.#maxAttempts = Math.max(1, maxAttempts);
  }

  /**
   * How well this bucket holds under concurrency, given the cache it was built on.
   *
   * `compare-and-swap` means the limit is exact across every replica. `best-effort` means the
   * backing cannot compare-and-set, so concurrent consumers can each read the same balance and
   * each spend it — over-admitting by up to the number of simultaneous in-flight requests. That
   * is a deliberate, reportable degradation rather than a silent one: a limiter in front of an
   * expensive operation should be told which it is, and a deployment that needs the exact
   * behaviour should choose a backing that provides it.
   */
  get enforcement(): 'compare-and-swap' | 'best-effort' {
    return this.#cache.compareAndSet ? 'compare-and-swap' : 'best-effort';
  }

  async consume(key: string, options: TokenBucketOptions, cost = 1): Promise<TokenBucketResult> {
    // Time to hold the record: long enough that a bucket does not reset by expiring mid-throttle.
    const ttl = Math.ceil((options.capacity / options.refillPerSecond) * 2_000);

    for (let attempt = 1; ; attempt++) {
      const now = this.#clock.now();
      const stored = await this.#cache.get<BucketState>(key);
      const state: BucketState = stored ?? { tokens: options.capacity, updatedAt: now };

      const refill = ((now - state.updatedAt) / 1_000) * options.refillPerSecond;
      const tokens = Math.min(options.capacity, state.tokens + Math.max(0, refill));
      const allowed = tokens >= cost;
      const next: BucketState = { tokens: allowed ? tokens - cost : tokens, updatedAt: now };

      const written = await this.#write(key, stored, next, ttl);
      if (!written && attempt < this.#maxAttempts) continue;

      // Out of attempts under sustained contention: the balance is not what this caller computed,
      // so it refuses rather than admitting on a stale read. Denying under contention is the safe
      // direction for a bucket that guards an expensive operation.
      if (!written) {
        return {
          allowed: false,
          remaining: 0,
          retryAfter: Math.ceil((cost / options.refillPerSecond) * 1_000),
        };
      }

      if (!allowed) {
        return {
          allowed: false,
          remaining: Math.floor(tokens),
          retryAfter: Math.ceil(((cost - tokens) / options.refillPerSecond) * 1_000),
        };
      }
      return { allowed: true, remaining: Math.floor(next.tokens), retryAfter: 0 };
    }
  }

  async #write(
    key: string,
    expected: BucketState | undefined,
    next: BucketState,
    ttl: number,
  ): Promise<boolean> {
    const compareAndSet = this.#cache.compareAndSet?.bind(this.#cache);
    if (!compareAndSet) {
      await this.#cache.set(key, next, { ttl });
      return true;
    }
    return compareAndSet(key, expected, next, { ttl });
  }
}
