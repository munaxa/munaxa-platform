import { describe, expect, it, vi } from 'vitest';
import {
  MissingDependencyError,
  PORTS,
  ServiceRegistry,
  createToken,
  type CachePort,
} from '../src/index.js';

describe('ServiceRegistry', () => {
  it('resolves a registered instance', () => {
    const registry = new ServiceRegistry();
    const token = createToken<{ value: number }>('test.thing');
    registry.register(token, { value: 42 });
    expect(registry.get(token).value).toBe(42);
  });

  it('constructs a factory once and memoises it', () => {
    const registry = new ServiceRegistry();
    const token = createToken<number>('test.lazy');
    const factory = vi.fn(() => 7);
    registry.registerFactory(token, factory);

    expect(registry.get(token)).toBe(7);
    expect(registry.get(token)).toBe(7);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('names the missing token rather than failing later with a TypeError', () => {
    const registry = new ServiceRegistry();
    expect(() => registry.get(PORTS.cache)).toThrow(MissingDependencyError);
    expect(() => registry.get(PORTS.cache)).toThrow(/platform\.cache/);
  });

  it('reports every missing dependency at once', () => {
    const registry = new ServiceRegistry().register(PORTS.clock, { now: () => 0 });
    expect(() => registry.assertRegistered(PORTS.clock, PORTS.cache, PORTS.logger)).toThrow(
      /platform\.cache, platform\.logger/,
    );
  });

  it('has() distinguishes registered from resolvable', () => {
    const registry = new ServiceRegistry();
    expect(registry.has(PORTS.locks)).toBe(false);
    registry.registerFactory(PORTS.locks, () => ({
      acquire: async () => null,
      release: async () => false,
      extend: async () => false,
    }));
    expect(registry.has(PORTS.locks)).toBe(true);
  });
});

describe('port tokens', () => {
  it('gives every port a unique, namespaced description', () => {
    const descriptions = Object.values(PORTS).map((token) => token.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description).toMatch(/^platform\.[a-zA-Z]+$/);
    }
  });

  it('binds a token to its interface at compile time', () => {
    const registry = new ServiceRegistry();
    const cache: CachePort = {
      get: async () => undefined,
      set: async () => undefined,
      setIfAbsent: async () => true,
      delete: async () => false,
      has: async () => false,
      increment: async () => 1,
      ttl: async () => undefined,
    };
    registry.register(PORTS.cache, cache);
    // The type of `resolved` is CachePort, not unknown — that is the whole point of the brand.
    const resolved = registry.get(PORTS.cache);
    expect(typeof resolved.increment).toBe('function');
  });
});
