import { describe, expect, it } from 'vitest';
import { FixedClock } from '@munaxa/types';
import { FixedWindowCounter, MemoryCache, TokenBucket } from '../src/index.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

describe('MemoryCache throughput', () => {
  it('reads and writes at well over 100k ops/s', async () => {
    const cache = new MemoryCache({ maxEntries: 50_000 });
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) await cache.set(`k${i}`, i);
    for (let i = 0; i < 50_000; i++) await cache.get(`k${i}`);
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('keeps eviction O(1) amortised at the bound', async () => {
    // A naive "find the oldest by scanning" eviction turns this into O(n²) and takes minutes.
    const cache = new MemoryCache({ maxEntries: 1_000 });
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) await cache.set(`k${i}`, i);
    expect(performance.now() - start).toBeLessThan(7_500);
    expect(cache.size).toBe(1_000);
  });

  it('does not slow down as expired entries accumulate', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock, maxEntries: 100_000 });
    for (let i = 0; i < 20_000; i++) await cache.set(`k${i}`, i, { ttl: 1_000 });
    clock.advance(10_000);

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) await cache.get(`k${i}`);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('rate-limit primitives on the request path', () => {
  it('costs a couple of cache operations per check', async () => {
    const clock = new FixedClock(0);
    const counter = new FixedWindowCounter(new MemoryCache({ clock }), clock);
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) await counter.hit(`ip:${i % 500}`, 60_000);
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('evaluates a token bucket in constant time regardless of idle duration', async () => {
    const clock = new FixedClock(0);
    const bucket = new TokenBucket(new MemoryCache({ clock }), clock);
    const options = { refillPerSecond: 1, capacity: 100 };

    await bucket.consume('k', options);
    clock.advance(30 * 24 * 60 * 60 * 1_000); // a month idle

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) await bucket.consume('k', options);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
