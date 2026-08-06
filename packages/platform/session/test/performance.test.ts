import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID } from '@munaxa/types';
import { fingerprint } from '../src/index.js';
import { USER, createInput, fixture } from './helpers.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

/**
 * `validate` runs on every authenticated request in every product. It is the single hottest
 * platform call, and the store behind it is usually a network hop — so the platform's own share
 * of that budget has to be negligible.
 */
describe('validation cost', () => {
  it('validates in microseconds against an in-process store', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());

    const start = performance.now();
    for (let i = 0; i < 50_000; i++) await manager.validate(ROOT_TENANT_ID, session.id);
    expect((performance.now() - start) / 50_000).toBeLessThan(0.05);
  });

  it('touches without re-reading the world', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      clock.advance(1);
      await manager.touch(ROOT_TENANT_ID, session.id);
    }
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('scale', () => {
  it('creates sessions at a steady cost with many users in the store', async () => {
    const { manager, store } = fixture({ maxConcurrent: 100 });
    for (let i = 0; i < 5_000; i++) {
      await manager.create(createInput({ userId: `user-${i}` as never }));
    }
    expect(store.size).toBe(5_000);

    const start = performance.now();
    for (let i = 0; i < 200; i++)
      await manager.create(createInput({ userId: `late-${i}` as never }));
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('lists one user’s active sessions without scanning cost dominating', async () => {
    const { manager } = fixture({ maxConcurrent: 50 });
    for (let i = 0; i < 50; i++) await manager.create(createInput());

    const start = performance.now();
    for (let i = 0; i < 5_000; i++) await manager.listActive(ROOT_TENANT_ID, USER);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('evicts at the concurrency limit without unbounded work', async () => {
    const { manager, clock } = fixture({ maxConcurrent: 5 });
    const start = performance.now();
    for (let i = 0; i < 2_000; i++) {
      clock.advance(1);
      await manager.create(createInput());
    }
    expect(performance.now() - start).toBeLessThan(7_500);
    expect(await manager.listActive(ROOT_TENANT_ID, USER)).toHaveLength(5);
  });
});

describe('fingerprinting', () => {
  it('costs one hash', () => {
    const input = { userAgent: 'Mozilla/5.0', acceptLanguage: 'en-GB', platform: 'macOS' };
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) fingerprint(input);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
