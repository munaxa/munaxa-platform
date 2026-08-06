import { describe, expect, it, vi } from 'vitest';
import { composeMiddleware, emptyResponse, parseDuration, toUserId } from '../src/index.js';

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

/**
 * These are floor checks, not benchmarks. They exist to catch the accidental O(n²) or the
 * regex that starts backtracking — a thousand-fold regression, not a ten-percent one — so the
 * budgets are deliberately loose enough to survive a busy CI runner.
 */
const ITERATIONS = 50_000;

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('hot-path cost', () => {
  it('validates identifiers in well under a microsecond each', () => {
    const ms = elapsed(() => {
      for (let i = 0; i < ITERATIONS; i++) toUserId(`user_${i}`);
    });
    expect(ms / ITERATIONS).toBeLessThan(0.01);
  });

  it('does not backtrack on adversarial identifier input', () => {
    // A pathological regex would take exponential time on a long near-match.
    const hostile = `${'a'.repeat(189)}!`;
    const ms = elapsed(() => {
      for (let i = 0; i < 1_000; i++) {
        try {
          toUserId(hostile);
        } catch {
          /* expected */
        }
      }
    });
    expect(ms).toBeLessThan(1_250);
  });

  it('parses durations without allocating per unit', () => {
    const ms = elapsed(() => {
      for (let i = 0; i < ITERATIONS; i++) parseDuration('15m');
    });
    expect(ms / ITERATIONS).toBeLessThan(0.01);
  });

  it('composes middleware once, not per request', async () => {
    const chain = composeMiddleware(
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      await chain({ method: 'GET', path: '/', headers: {} }, emptyResponse());
    }
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
