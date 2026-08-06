import { describe, expect, it } from 'vitest';
import type { CachePort } from '@munaxa/interfaces';
import { FixedClock, ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import {
  CacheLock,
  FixedWindowCounter,
  MemoryCache,
  NamespacedCache,
  SlidingWindowCounter,
  TokenBucket,
  TypedCache,
  forTenant,
  namespaced,
  withLock,
} from '../src/index.js';

describe('MemoryCache', () => {
  it('stores and reads values', async () => {
    const cache = new MemoryCache();
    await cache.set('a', { n: 1 });
    expect(await cache.get<{ n: number }>('a')).toEqual({ n: 1 });
    expect(await cache.has('a')).toBe(true);
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('expires entries against the injected clock', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    await cache.set('a', 1, { ttl: 1_000 });

    clock.advance(999);
    expect(await cache.get('a')).toBe(1);
    clock.advance(1);
    expect(await cache.get('a')).toBeUndefined();
  });

  it('reports remaining ttl', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    await cache.set('a', 1, { ttl: 1_000 });
    clock.advance(400);
    expect(await cache.ttl('a')).toBe(600);
    expect(await cache.ttl('missing')).toBeUndefined();
  });

  it('setIfAbsent only wins once', async () => {
    const cache = new MemoryCache();
    expect(await cache.setIfAbsent('k', 'first')).toBe(true);
    expect(await cache.setIfAbsent('k', 'second')).toBe(false);
    expect(await cache.get('k')).toBe('first');
  });

  it('keeps a counter window fixed across increments', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    await cache.increment('c', 1, { ttl: 1_000 });
    clock.advance(500);
    await cache.increment('c', 1, { ttl: 1_000 });
    // The second hit must not push the expiry out, or the window slides forever.
    expect(await cache.ttl('c')).toBe(500);
    expect(await cache.get('c')).toBe(2);
  });

  it('evicts least-recently-used entries at the bound', async () => {
    const cache = new MemoryCache({ maxEntries: 3 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    await cache.get('a'); // 'a' becomes most recent, 'b' is now the victim
    await cache.set('d', 4);

    expect(cache.size).toBe(3);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
  });

  it('clears a namespace without touching neighbours', async () => {
    const cache = new MemoryCache();
    await cache.set('sessions:a', 1);
    await cache.set('other:a', 2);
    await cache.clear('sessions');
    expect(await cache.get('sessions:a')).toBeUndefined();
    expect(await cache.get('other:a')).toBe(2);
  });
});

describe('namespacing', () => {
  it('prefixes every operation', async () => {
    const inner = new MemoryCache();
    const scoped = namespaced(inner, 'sessions');
    await scoped.set('s1', 'value');

    expect(await inner.get('sessions:s1')).toBe('value');
    expect(await scoped.get('s1')).toBe('value');
  });

  it('isolates tenants from each other', async () => {
    const inner = new MemoryCache();
    const acme = forTenant(inner, toTenantId('acme'), 'sessions');
    const globex = forTenant(inner, toTenantId('globex'), 'sessions');

    await acme.set('s1', 'acme-session');
    expect(await globex.get('s1')).toBeUndefined();
    expect(await acme.get('s1')).toBe('acme-session');
  });

  it('rejects an ambiguous namespace', () => {
    expect(() => new NamespacedCache(new MemoryCache(), 'a:b')).toThrow(TypeError);
  });

  it('encodes colons in tenant identifiers', async () => {
    const inner = new MemoryCache();
    const scoped = forTenant(inner, toTenantId('iss:acme'), 'sessions');
    await scoped.set('k', 1);
    expect(await inner.get('sessions:iss%3Aacme:k')).toBe(1);
  });
});

describe('counters', () => {
  it('counts within a fixed window and resets at the boundary', async () => {
    const clock = new FixedClock(0);
    const counter = new FixedWindowCounter(new MemoryCache({ clock }), clock);

    expect((await counter.hit('ip:1', 60_000)).count).toBe(1);
    expect((await counter.hit('ip:1', 60_000)).count).toBe(2);

    const state = await counter.hit('ip:1', 60_000);
    expect(state.resetAt).toBe(60_000);

    clock.set(60_000);
    expect((await counter.hit('ip:1', 60_000)).count).toBe(1);
  });

  it('smooths the boundary with a sliding window', async () => {
    const clock = new FixedClock(0);
    const counter = new SlidingWindowCounter(new MemoryCache({ clock }), clock);

    for (let i = 0; i < 10; i++) await counter.hit('ip:1', 60_000);

    // Halfway into the next window, half of the previous window still counts.
    clock.set(90_000);
    const state = await counter.hit('ip:1', 60_000);
    expect(state.count).toBeGreaterThanOrEqual(5);
    expect(state.count).toBeLessThanOrEqual(7);
  });

  it('refills a token bucket over time', async () => {
    const clock = new FixedClock(0);
    const bucket = new TokenBucket(new MemoryCache({ clock }), clock);
    const options = { refillPerSecond: 1, capacity: 3 };

    expect((await bucket.consume('k', options)).allowed).toBe(true);
    expect((await bucket.consume('k', options)).allowed).toBe(true);
    expect((await bucket.consume('k', options)).allowed).toBe(true);

    const denied = await bucket.consume('k', options);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);

    clock.advance(2_000);
    expect((await bucket.consume('k', options)).allowed).toBe(true);
  });

  it('does not over-admit a token bucket under concurrency', async () => {
    // The 1.0 bucket was a read, a decision and a write with awaits between them: fifty callers
    // all read a full bucket and all decided they could spend it. With compare-and-set the
    // losers re-read and see the balance the winners left.
    const clock = new FixedClock(0);
    const bucket = new TokenBucket(new MemoryCache({ clock }), clock);
    const options = { refillPerSecond: 0.001, capacity: 5 };

    const results = await Promise.all(
      Array.from({ length: 50 }, () => bucket.consume('k', options)),
    );

    expect(bucket.enforcement).toBe('compare-and-swap');
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it('reports best-effort enforcement on a cache that cannot compare-and-set', async () => {
    // Cloudflare KV and most CDN caches. The limit still applies; it is just approximate under
    // concurrency, and a deployment gets to see that rather than assume otherwise.
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    const withoutCas: CachePort = {
      get: (key) => cache.get(key),
      set: (key, value, cacheOptions) => cache.set(key, value, cacheOptions),
      setIfAbsent: (key, value, cacheOptions) => cache.setIfAbsent(key, value, cacheOptions),
      delete: (key) => cache.delete(key),
      has: (key) => cache.has(key),
      increment: (key, by, cacheOptions) => cache.increment(key, by, cacheOptions),
      ttl: (key) => cache.ttl(key),
    };
    const bucket = new TokenBucket(withoutCas, clock);

    expect(bucket.enforcement).toBe('best-effort');
    // Sequentially it is still exact — the degradation is only under concurrency.
    const options = { refillPerSecond: 0.001, capacity: 2 };
    expect((await bucket.consume('k', options)).allowed).toBe(true);
    expect((await bucket.consume('k', options)).allowed).toBe(true);
    expect((await bucket.consume('k', options)).allowed).toBe(false);
  });

  it('never refills a token bucket beyond its capacity', async () => {
    const clock = new FixedClock(0);
    const bucket = new TokenBucket(new MemoryCache({ clock }), clock);
    const options = { refillPerSecond: 10, capacity: 2 };

    await bucket.consume('k', options);
    clock.advance(60_000);
    expect((await bucket.consume('k', options)).remaining).toBe(1);
  });
});

describe('locks', () => {
  it('excludes a second holder until release', async () => {
    const locks = new CacheLock(new MemoryCache());
    const first = await locks.acquire('job', 5_000);
    expect(first).not.toBeNull();
    expect(await locks.acquire('job', 5_000)).toBeNull();

    expect(await locks.release(first!)).toBe(true);
    expect(await locks.acquire('job', 5_000)).not.toBeNull();
  });

  it('expires the lease so a crashed holder cannot deadlock', async () => {
    const clock = new FixedClock(0);
    const locks = new CacheLock(new MemoryCache({ clock }), clock);
    await locks.acquire('job', 1_000);

    clock.advance(1_000);
    expect(await locks.acquire('job', 1_000)).not.toBeNull();
  });

  it('runs work under a lock and always releases', async () => {
    const cache = new MemoryCache();
    const locks = new CacheLock(cache);

    await expect(withLock(locks, 'job', 1_000, async () => 'done')).resolves.toBe('done');
    await expect(
      withLock(locks, 'job', 1_000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await locks.acquire('job', 1_000)).not.toBeNull();
  });

  it('returns undefined when the lock is held', async () => {
    const locks = new CacheLock(new MemoryCache());
    const held = await locks.acquire('job', 5_000);
    expect(await withLock(locks, 'job', 1_000, async () => 'ran')).toBeUndefined();
    await locks.release(held!);
  });
});

describe('TypedCache', () => {
  it('reads through on a miss and caches the result', async () => {
    const cache = new TypedCache<{ id: string }>(new MemoryCache(), 'sessions', 1_000);
    let loads = 0;
    const load = async () => {
      loads++;
      return { id: 's1' };
    };

    expect(await cache.getOrLoad('s1', load)).toEqual({ id: 's1' });
    expect(await cache.getOrLoad('s1', load)).toEqual({ id: 's1' });
    expect(loads).toBe(1);
  });

  it('does not cache an absent result', async () => {
    const cache = new TypedCache<string>(new MemoryCache(), 'x');
    let loads = 0;
    const load = async () => {
      loads++;
      return undefined;
    };
    await cache.getOrLoad('k', load);
    await cache.getOrLoad('k', load);
    expect(loads).toBe(2);
  });

  it('is scoped to its namespace', async () => {
    const inner = new MemoryCache();
    await new TypedCache<number>(inner, 'permissions').set('u1', 5);
    expect(await inner.get('permissions:u1')).toBe(5);
    expect(await inner.get(`${ROOT_TENANT_ID}:u1`)).toBeUndefined();
  });
});
