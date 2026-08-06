import { describe, expect, it } from 'vitest';
import { FixedClock, toTenantId } from '@munaxa/types';
import { MemoryCache, RedisCache, forTenant, namespaced } from '../src/index.js';
import { FakeRedis } from './fake-redis.js';

/**
 * Cache keys are a wire format between deployed versions.
 *
 * During a rolling deploy, an old instance and a new one read each other's entries. If the key
 * layout or the value encoding changes, the effect is not a crash — it is every session lookup
 * missing at once, which logs the whole user base out mid-deploy. These pin both.
 */
describe('key layout', () => {
  it('keeps the namespace separator and ordering', async () => {
    const inner = new MemoryCache();
    await namespaced(inner, 'sessions').set('s1', 1);
    expect(await inner.get('sessions:s1')).toBe(1);
  });

  it('keeps tenant scoping as namespace-then-tenant', async () => {
    const inner = new MemoryCache();
    await forTenant(inner, toTenantId('acme'), 'sessions').set('s1', 1);
    expect(await inner.get('sessions:acme:s1')).toBe(1);
  });

  it('keeps the default Redis key prefix', async () => {
    const redis = new FakeRedis(new FixedClock(0));
    await new RedisCache(redis).set('k', 1);
    expect(redis.raw('munaxa:k')).toBeDefined();
  });
});

describe('value encoding', () => {
  it('stores JSON, readable by any client and any Node version', async () => {
    const redis = new FakeRedis(new FixedClock(0));
    await new RedisCache(redis, { keyPrefix: '' }).set('session', {
      userId: 'u1',
      roles: ['admin'],
    });
    expect(redis.raw('session')).toBe('{"userId":"u1","roles":["admin"]}');
  });

  it('reads a value written by a prior version of the adapter', async () => {
    const redis = new FakeRedis(new FixedClock(0));
    await redis.set('munaxa:session', '{"userId":"u1"}');
    expect(await new RedisCache(redis).get('session')).toEqual({ userId: 'u1' });
  });

  it('preserves null as a value distinct from a miss', async () => {
    const cache = new MemoryCache();
    await cache.set('k', null);
    expect(await cache.has('k')).toBe(true);
    expect(await cache.get('k')).toBeNull();
  });
});

describe('CachePort surface', () => {
  it('still implements every 1.0 method', () => {
    const cache = new MemoryCache();
    for (const method of ['get', 'set', 'setIfAbsent', 'delete', 'has', 'increment', 'ttl']) {
      expect(typeof (cache as unknown as Record<string, unknown>)[method], method).toBe('function');
    }
  });
});
