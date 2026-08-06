import type { CachePort } from '@munaxa/interfaces';
import type { DurationMs } from '@munaxa/types';
import { race, tick, type TestHarness } from './harness.js';

/**
 * `CachePort` conformance.
 *
 * The two properties everything else rests on are `setIfAbsent` (exactly one winner, fleet-wide)
 * and `increment` (no lost updates). Distributed locks, MFA replay protection, one-time-code
 * consumption and rate limiting are all one of those two wearing a hat, so an adapter that gets
 * them wrong does not have a slow cache — it has a bypassed second factor.
 */
export interface CacheConformanceOptions {
  /** A fresh, empty cache per call. */
  createCache(): CachePort | Promise<CachePort>;
  /** Advance the adapter's notion of time. Omit for adapters with real TTLs; those tests skip. */
  advance?: (this: void, ms: DurationMs) => void | Promise<void>;
  /** Set when the adapter cannot scan, so `clear(namespace)` is unavailable. */
  supportsNamespaceClear?: boolean;
  /** Concurrency used by the race tests. Raise it against a real server. */
  concurrency?: number;
}

export function runCacheConformance(harness: TestHarness, options: CacheConformanceOptions): void {
  const { describe, it, expect } = harness;
  const concurrency = options.concurrency ?? 50;

  describe('CachePort conformance', () => {
    it('round-trips a value', async () => {
      const cache = await options.createCache();
      await cache.set('k', { n: 1 });
      expect(await cache.get('k')).toEqual({ n: 1 });
      expect(await cache.has('k')).toBe(true);
    });

    it('reports a miss as undefined rather than throwing', async () => {
      const cache = await options.createCache();
      expect(await cache.get('absent')).toBeUndefined();
      expect(await cache.has('absent')).toBe(false);
      expect(await cache.delete('absent')).toBe(false);
    });

    it('distinguishes a stored null from a miss', async () => {
      const cache = await options.createCache();
      await cache.set('k', null);
      expect(await cache.has('k')).toBe(true);
    });

    it('setIfAbsent has exactly one winner under concurrency', async () => {
      // The single most important assertion in this file. Every one-time-use guarantee in the
      // platform is this method: a second winner is a replayed OTP or a double-held lock.
      const cache = await options.createCache();
      const { fulfilled } = await race(concurrency, async (i) => {
        await tick(i % 3);
        return cache.setIfAbsent('once', i, { ttl: 60_000 });
      });

      expect(fulfilled.filter((won) => won === true)).toHaveLength(1);
      expect(fulfilled.filter((won) => won === false)).toHaveLength(concurrency - 1);
    });

    it('setIfAbsent keeps the winner’s value', async () => {
      const cache = await options.createCache();
      expect(await cache.setIfAbsent('k', 'first', { ttl: 60_000 })).toBe(true);
      expect(await cache.setIfAbsent('k', 'second', { ttl: 60_000 })).toBe(false);
      expect(await cache.get('k')).toBe('first');
    });

    it('setIfAbsent releases the key once it is deleted', async () => {
      const cache = await options.createCache();
      await cache.setIfAbsent('k', 1, { ttl: 60_000 });
      await cache.delete('k');
      expect(await cache.setIfAbsent('k', 2, { ttl: 60_000 })).toBe(true);
    });

    it('increment loses no updates under concurrency', async () => {
      // A read-modify-write implementation passes every sequential test and fails this one, which
      // is exactly the shape of a rate limit that can be bypassed by sending requests in parallel.
      const cache = await options.createCache();
      await race(concurrency, async (i) => {
        await tick(i % 3);
        return cache.increment('counter', 1, { ttl: 60_000 });
      });

      expect(await cache.get('counter')).toBe(concurrency);
    });

    it('increment returns the value after its own increment', async () => {
      const cache = await options.createCache();
      expect(await cache.increment('c', 5, { ttl: 60_000 })).toBe(5);
      expect(await cache.increment('c', 3, { ttl: 60_000 })).toBe(8);
    });

    it('increment hands out every value exactly once', async () => {
      // Sequence allocation depends on this: two callers must never receive the same number.
      const cache = await options.createCache();
      const { fulfilled } = await race(concurrency, () => cache.increment('seq', 1, { ttl: 60_000 }));
      expect(new Set(fulfilled).size).toBe(concurrency);
    });

    if (options.advance) {
      const advance = options.advance;

      it('expires a value at its ttl', async () => {
        const cache = await options.createCache();
        await cache.set('k', 'v', { ttl: 1_000 });
        await advance(999);
        expect(await cache.get('k')).toBe('v');
        await advance(2);
        expect(await cache.get('k')).toBeUndefined();
      });

      it('reports remaining ttl', async () => {
        const cache = await options.createCache();
        await cache.set('k', 'v', { ttl: 1_000 });
        await advance(400);
        const remaining = await cache.ttl('k');
        expect(remaining ?? 0).toBeLessThanOrEqual(600);
        expect(remaining ?? 0).toBeGreaterThan(0);
      });

      it('does not slide a counter window on each increment', async () => {
        // A counter whose expiry is pushed out by every hit is a window that never closes, and a
        // rate limit that a steady stream of requests keeps alive forever.
        const cache = await options.createCache();
        await cache.increment('c', 1, { ttl: 1_000 });
        await advance(500);
        await cache.increment('c', 1, { ttl: 1_000 });
        expect((await cache.ttl('c')) ?? 0).toBeLessThanOrEqual(500);
      });

      it('frees an expired setIfAbsent key', async () => {
        // This is lock-lease expiry: a holder that crashes must not hold the key forever.
        const cache = await options.createCache();
        await cache.setIfAbsent('lock', 'holder-a', { ttl: 1_000 });
        await advance(1_001);
        expect(await cache.setIfAbsent('lock', 'holder-b', { ttl: 1_000 })).toBe(true);
      });
    }

    if (options.supportsNamespaceClear !== false) {
      it('clears one namespace without touching another', async () => {
        const cache = await options.createCache();
        await cache.set('sessions:a', 1);
        await cache.set('audit:a', 2);
        await cache.clear?.('sessions');
        expect(await cache.get('sessions:a')).toBeUndefined();
        expect(await cache.get('audit:a')).toBe(2);
      });
    }
  });
}
