import { describe, expect, it } from 'vitest';
import { FixedClock, toTenantId } from '@munaxa/types';
import { CacheLock, MemoryCache, RedisCache, forTenant, namespaced } from '../src/index.js';
import { FakeRedis } from './fake-redis.js';

describe('tenant isolation', () => {
  it('cannot be escaped by a crafted key', async () => {
    const inner = new MemoryCache();
    const acme = forTenant(inner, toTenantId('acme'), 'sessions');
    const globex = forTenant(inner, toTenantId('globex'), 'sessions');

    await globex.set('secret', 'globex-data');

    // A key that tries to climb out of its namespace lands in a key of its own, not in globex's.
    await acme.set('../globex:secret', 'attacker');
    expect(await globex.get('secret')).toBe('globex-data');

    // Nor can a tenant read across by embedding a separator.
    expect(await acme.get(':globex:secret')).toBeUndefined();
  });

  it('gives no way to reach the unscoped cache from a scoped handle', async () => {
    const inner = new MemoryCache();
    await inner.set('root-key', 'root-value');
    const scoped = namespaced(inner, 'tenant');

    expect(await scoped.get('root-key')).toBeUndefined();
    expect(Object.keys(scoped)).not.toContain('inner');
  });

  it('confines clear() to the caller namespace', async () => {
    const inner = new MemoryCache();
    await inner.set('sessions:a', 1);
    await inner.set('audit:a', 2);

    await namespaced(inner, 'sessions').clear?.();

    expect(await inner.get('sessions:a')).toBeUndefined();
    expect(await inner.get('audit:a')).toBe(2);
  });
});

describe('lock fencing', () => {
  it('refuses a release from a stale holder', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    const locks = new CacheLock(cache, clock);

    const first = await locks.acquire('job', 1_000);
    clock.advance(1_000); // first holder's lease expires while it was stalled
    const second = await locks.acquire('job', 1_000);

    // The stalled holder wakes up and tries to release — it must not free the new holder's lock.
    expect(await locks.release(first!)).toBe(false);
    expect(await cache.get('job')).toBe(second!.token);
  });

  it('refuses an extend from a stale holder', async () => {
    const clock = new FixedClock(0);
    const locks = new CacheLock(new MemoryCache({ clock }), clock);

    const first = await locks.acquire('job', 1_000);
    clock.advance(1_000);
    await locks.acquire('job', 1_000);

    expect(await locks.extend(first!, 60_000)).toBe(false);
  });

  it('never reuses a token', async () => {
    const locks = new CacheLock(new MemoryCache());
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const handle = await locks.acquire(`job-${i}`, 1_000);
      tokens.add(handle!.token);
    }
    expect(tokens.size).toBe(200);
  });
});

describe('resource bounds', () => {
  it('bounds memory even when keys are attacker-influenced', async () => {
    const cache = new MemoryCache({ maxEntries: 100 });
    for (let i = 0; i < 10_000; i++) await cache.set(`ip:198.51.100.${i}`, i);
    expect(cache.size).toBe(100);
  });

  it('refuses an oversized value rather than filling a shared cache', async () => {
    const cache = new RedisCache(new FakeRedis(new FixedClock(0)), { maxValueBytes: 1_024 });
    await expect(cache.set('k', 'x'.repeat(2_000))).rejects.toThrow(/above the 1024-byte limit/);
  });

  it('does not schedule timers that keep a process alive', () => {
    // Expiry is lazy plus sampled on write, deliberately: an interval-driven cache holds the
    // event loop open and fires during unrelated tests.
    const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
    const cache = new MemoryCache();
    void cache.set('k', 'v', { ttl: 10 });
    expect(process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length).toBe(before);
  });
});

describe('expiry is enforced, not advisory', () => {
  it('does not serve a value past its ttl even if it is still in the map', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock, sweepSampleSize: 0 });
    await cache.set('session:s1', 'live', { ttl: 1_000 });
    clock.advance(5_000);

    expect(await cache.get('session:s1')).toBeUndefined();
    expect(await cache.has('session:s1')).toBe(false);
    expect(await cache.ttl('session:s1')).toBeUndefined();
  });
});
