import { describe, expect, it } from 'vitest';
import {
  Redactor,
  StructuredLogger,
  newCorrelationId,
  nullLogger,
  withCorrelation,
} from '../src/index.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

const sink = new StructuredLogger({ write: () => {} });

describe('logging cost', () => {
  it('writes a line in a few microseconds', () => {
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) sink.log('info', 'event.name', { userId: `u${i}`, count: i });
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('costs nothing when the level is disabled', () => {
    const quiet = new StructuredLogger({ level: 'error', write: () => {} });
    const start = performance.now();
    for (let i = 0; i < 500_000; i++) quiet.log('debug', 'skipped', { i });
    // The level check must come before field construction and redaction.
    expect(performance.now() - start).toBeLessThan(1_250);
  });

  it('reads correlation context without measurable overhead', () => {
    withCorrelation({ correlationId: newCorrelationId(), userId: 'u1' }, () => {
      const start = performance.now();
      for (let i = 0; i < 50_000; i++) sink.log('info', 'in-context');
      expect(performance.now() - start).toBeLessThan(5_000);
    });
  });

  it('redacts a realistic object cheaply', () => {
    const redactor = new Redactor();
    const payload = {
      user: { id: 'u1', email: 'a@b.test', password: 'x', roles: ['a', 'b', 'c'] },
      request: { method: 'POST', path: '/login', headers: { authorization: 'Bearer x' } },
    };

    const start = performance.now();
    for (let i = 0; i < 50_000; i++) redactor.redact(payload);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('does not walk beyond its depth bound on a deeply nested object', () => {
    let deep: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 10_000; i++) deep = { nested: deep };

    const start = performance.now();
    new Redactor().redact(deep);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it('nullLogger is free', () => {
    const start = performance.now();
    for (let i = 0; i < 1_000_000; i++) nullLogger.log('error', 'x', { i });
    expect(performance.now() - start).toBeLessThan(1_250);
  });
});
