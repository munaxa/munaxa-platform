import { describe, expect, it } from 'vitest';
import { PORTS, ServiceRegistry, createToken } from '../src/index.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

/**
 * Resolution happens on every request in some products. It has to be a Map lookup and stay one.
 */
describe('resolution cost', () => {
  it('resolves a registered port in constant time', () => {
    const registry = new ServiceRegistry();
    for (let i = 0; i < 500; i++) registry.register(createToken<number>(`filler.${i}`), i);
    registry.register(PORTS.clock, { now: () => 0 });

    const start = performance.now();
    for (let i = 0; i < 200_000; i++) registry.get(PORTS.clock);
    const perCall = (performance.now() - start) / 200_000;

    expect(perCall).toBeLessThan(0.005);
  });

  it('does not re-run a factory under repeated resolution', () => {
    const registry = new ServiceRegistry();
    let constructions = 0;
    const token = createToken<object>('test.expensive');
    registry.registerFactory(token, () => {
      constructions++;
      return {};
    });

    for (let i = 0; i < 50_000; i++) registry.get(token);
    expect(constructions).toBe(1);
  });
});
