import { describe, expect, it, vi } from 'vitest';
import { toTenantId } from '@munaxa/types';
import { FeatureFlags, LayeredConfig, PLATFORM_SCHEMA, parseConfig } from '../src/index.js';

/**
 * Performance suites need a timeout above their own budgets.
 *
 * Vitest defaults to 5s per test, while the budgets below deliberately allow more — they carry
 * ~2.5x headroom because `turbo run test` runs every package concurrently on the same cores. A
 * test whose budget exceeds the timeout can never fail on its budget: the timeout fires first and
 * reports "timed out in 5000ms", which says nothing about the throughput actually being measured.
 *
 * This makes the budget the signal again. It does not relax any budget.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

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
    for (let i = 0; i < 200_000; i++)
      config.resolve(toTenantId('tenant-4999'), 'session.idleTimeout');
    expect(performance.now() - start).toBeLessThan(1_250);
  });

  it('evaluates a flag with a percentage rollout cheaply', () => {
    const flags = new FeatureFlags({ rollout: { rolloutPercentage: 50 } });
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) flags.evaluate('rollout', { userId: `user-${i}` });
    // One SHA-256 over a short string per evaluation; a flag check must never be the slow part.
    expect(performance.now() - start).toBeLessThan(2_500);
  });

  it('short-circuits an unknown flag without hashing', () => {
    const flags = new FeatureFlags({});
    const start = performance.now();
    for (let i = 0; i < 500_000; i++) flags.evaluate('missing', { userId: 'u' });
    expect(performance.now() - start).toBeLessThan(1_250);
  });
});
