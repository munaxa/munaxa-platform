import { describe, expect, it } from 'vitest';
import { FixedClock } from '@munaxa/types';
import {
  CacheLock,
  FixedWindowCounter,
  MemoryCache,
  RedisCache,
  TieredCache,
  TokenBucket,
  namespaced,
  withLock,
} from '../src/index.js';
import { FakeRedis } from './fake-redis.js';

/**
 * The same behaviour has to hold whichever backing is wired. These run the platform's real usage
 * patterns — a rate limit, a lock, a session read — against `MemoryCache` and `RedisCache` and
 * assert identical outcomes, which is the promise `CachePort` makes to a product choosing a
 * deployment.
 */
function backings(clock: FixedClock) {
  const redis = new FakeRedis(clock);
  return [
    ['MemoryCache', new MemoryCache({ clock })] as const,
    ['RedisCache', new RedisCache(redis, { keyPrefix: 'test:' })] as const,
  ];
}

describe('CachePort conformance', () => {
  it.each([0, 1])('behaves identically across backings (run %i)', async () => {
    const clock = new FixedClock(1_000);
    for (const [name, cache] of backings(clock)) {
      await cache.set('k', { v: 1 }, { ttl: 1_000 });
      expect(await cache.get('k'), name).toEqual({ v: 1 });
      expect(await cache.setIfAbsent('k', { v: 2 }), name).toBe(false);
      expect(await cache.increment('c', 2, { ttl: 1_000 }), name).toBe(2);
      expect(await cache.increment('c', 3, { ttl: 1_000 }), name).toBe(5);
      expect(await cache.delete('k'), name).toBe(true);
      expect(await cache.get('k'), name).toBeUndefined();
    }
  });

  it('applies the same fixed-window rate limit on both backings', async () => {
    const clock = new FixedClock(0);
    for (const [name, cache] of backings(clock)) {
      const counter = new FixedWindowCounter(cache, clock);
      const results = [];
      for (let i = 0; i < 5; i++) results.push((await counter.hit('login:ip', 60_000)).count);
      expect(results, name).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('excludes concurrent lock holders on both backings', async () => {
    const clock = new FixedClock(0);
    for (const [name, cache] of backings(clock)) {
      const locks = new CacheLock(cache, clock);
      const handle = await locks.acquire('rotate-keys', 30_000);
      expect(handle, name).not.toBeNull();
      expect(await locks.acquire('rotate-keys', 30_000), name).toBeNull();
      await locks.release(handle!);
    }
  });
});

describe('RedisCache command construction', () => {
  it('sets a millisecond expiry with PX and honours NX', async () => {
    const clock = new FixedClock(0);
    const redis = new FakeRedis(clock);
    const cache = new RedisCache(redis, { keyPrefix: 'app:' });

    await cache.set('a', 1, { ttl: 2_500 });
    expect(redis.commands).toContain('SET app:a PX 2500');

    expect(await cache.setIfAbsent('a', 2, { ttl: 1_000 })).toBe(false);
    expect(redis.commands).toContain('SET app:a NX PX 1000');
  });

  it('sets the counter expiry only on the call that creates the key', async () => {
    const clock = new FixedClock(0);
    const redis = new FakeRedis(clock);
    const cache = new RedisCache(redis);

    await cache.increment('hits', 1, { ttl: 60_000 });
    await cache.increment('hits', 1, { ttl: 60_000 });

    expect(redis.commands.filter((command) => command.startsWith('PEXPIRE'))).toHaveLength(1);
  });

  it('scans rather than walking the keyspace when clearing a namespace', async () => {
    const clock = new FixedClock(0);
    const redis = new FakeRedis(clock);
    const cache = new RedisCache(redis, { keyPrefix: 'app:' });

    await cache.set('sessions:a', 1);
    await cache.set('sessions:b', 2);
    await cache.set('other:c', 3);
    await cache.clear('sessions');

    expect(redis.commands.some((command) => command.startsWith('SCAN'))).toBe(true);
    expect(redis.commands.some((command) => command.startsWith('KEYS'))).toBe(false);
    expect(await cache.get('sessions:a')).toBeUndefined();
    expect(await cache.get('other:c')).toBe(3);
  });

  it('treats an unparseable value as a miss instead of throwing', async () => {
    const clock = new FixedClock(0);
    const redis = new FakeRedis(clock);
    await redis.set('munaxa:legacy', 'not-json');
    await expect(new RedisCache(redis).get('legacy')).resolves.toBeUndefined();
  });
});

describe('TieredCache', () => {
  it('serves the second read from the near tier', async () => {
    const clock = new FixedClock(0);
    const redis = new FakeRedis(clock);
    const far = new RedisCache(redis);
    const tiered = new TieredCache(new MemoryCache({ clock }), far, 5_000);

    await tiered.set('session:s1', { userId: 'u1' }, { ttl: 60_000 });
    redis.commands.length = 0;

    expect(await tiered.get('session:s1')).toEqual({ userId: 'u1' });
    expect(redis.commands).toEqual([]);
  });

  it('drops the near tier on delete so a revocation is not resurrected', async () => {
    const clock = new FixedClock(0);
    const near = new MemoryCache({ clock });
    const tiered = new TieredCache(near, new MemoryCache({ clock }), 5_000);

    await tiered.set('session:s1', 'live');
    await tiered.delete('session:s1');

    expect(await near.get('session:s1')).toBeUndefined();
    expect(await tiered.get('session:s1')).toBeUndefined();
  });

  it('keeps counters authoritative by bypassing the near tier', async () => {
    const clock = new FixedClock(0);
    const far = new MemoryCache({ clock });
    const tiered = new TieredCache(new MemoryCache({ clock }), far, 5_000);

    await tiered.increment('c', 1, { ttl: 1_000 });
    await far.increment('c', 1, { ttl: 1_000 }); // another instance
    expect(await tiered.increment('c', 1, { ttl: 1_000 })).toBe(3);
  });
});

describe('rate limiting a login endpoint end to end', () => {
  it('throttles by IP, recovers after the window, and leaves other IPs alone', async () => {
    const clock = new FixedClock(0);
    const cache = namespaced(new MemoryCache({ clock }), 'ratelimit');
    const bucket = new TokenBucket(cache, clock);
    const options = { refillPerSecond: 0.2, capacity: 5 };

    const attempt = (ip: string) => bucket.consume(`login:${ip}`, options);

    for (let i = 0; i < 5; i++) expect((await attempt('1.2.3.4')).allowed).toBe(true);
    expect((await attempt('1.2.3.4')).allowed).toBe(false);
    expect((await attempt('5.6.7.8')).allowed).toBe(true);

    clock.advance(5_000);
    expect((await attempt('1.2.3.4')).allowed).toBe(true);
  });
});

describe('withLock under contention', () => {
  it('runs the guarded work exactly once', async () => {
    const clock = new FixedClock(0);
    const locks = new CacheLock(new MemoryCache({ clock }), clock);
    let runs = 0;

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        withLock(locks, 'daily-export', 10_000, async () => {
          runs++;
          return 'exported';
        }),
      ),
    );

    expect(runs).toBe(1);
    expect(results.filter(Boolean)).toEqual(['exported']);
  });
});
