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

  async reset(key: string): Promise<void> {
    await this.#cache.delete(key);
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

  async reset(key: string): Promise<void> {
    await this.#cache.delete(key);
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

  constructor(cache: CachePort, clock: Clock = systemClock) {
    this.#cache = cache;
    this.#clock = clock;
  }

  async consume(key: string, options: TokenBucketOptions, cost = 1): Promise<TokenBucketResult> {
    const now = this.#clock.now();
    const stored = await this.#cache.get<BucketState>(key);
    const state: BucketState = stored ?? { tokens: options.capacity, updatedAt: now };

    const refill = ((now - state.updatedAt) / 1_000) * options.refillPerSecond;
    const tokens = Math.min(options.capacity, state.tokens + Math.max(0, refill));

    // Time to hold the record: long enough that a bucket does not reset by expiring mid-throttle.
    const ttl = Math.ceil((options.capacity / options.refillPerSecond) * 2_000);

    if (tokens < cost) {
      await this.#cache.set(key, { tokens, updatedAt: now }, { ttl });
      const deficit = cost - tokens;
      return {
        allowed: false,
        remaining: Math.floor(tokens),
        retryAfter: Math.ceil((deficit / options.refillPerSecond) * 1_000),
      };
    }

    const remaining = tokens - cost;
    await this.#cache.set(key, { tokens: remaining, updatedAt: now }, { ttl });
    return { allowed: true, remaining: Math.floor(remaining), retryAfter: 0 };
  }
}
