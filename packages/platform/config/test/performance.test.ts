import { describe, expect, it } from 'vitest';
import { toTenantId } from '@munaxa/types';
import { FeatureFlags, LayeredConfig, PLATFORM_SCHEMA, parseConfig } from '../src/index.js';

describe('startup cost', () => {
  it('parses the platform schema in well under a millisecond', () => {
    const env = { MUNAXA_SIGNING_SECRET: 's'.repeat(48), MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43) };
    const start = performance.now();
    for (let i = 0; i < 1_000; i++) parseConfig(PLATFORM_SCHEMA, env);
    expect((performance.now() - start) / 1_000).toBeLessThan(1);
  });
});

describe('request-path cost', () => {
  it('resolves layered configuration in constant time regardless of tenant count', () => {
    const config = new LayeredConfig({ 'session.idleTimeout': 900_000 });
    for (let i = 0; i < 5_000; i++) {
      config.setTenantValue(toTenantId(`tenant-${i}`), 'session.idleTimeout', i);
    }

    const start = performance.now();
    for (let i = 0; i < 200_000; i++) config.resolve(toTenantId('tenant-4999'), 'session.idleTimeout');
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('evaluates a flag with a percentage rollout cheaply', () => {
    const flags = new FeatureFlags({ rollout: { rolloutPercentage: 50 } });
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) flags.evaluate('rollout', { userId: `user-${i}` });
    // One SHA-256 over a short string per evaluation; a flag check must never be the slow part.
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it('short-circuits an unknown flag without hashing', () => {
    const flags = new FeatureFlags({});
    const start = performance.now();
    for (let i = 0; i < 500_000; i++) flags.evaluate('missing', { userId: 'u' });
    expect(performance.now() - start).toBeLessThan(500);
  });
});
