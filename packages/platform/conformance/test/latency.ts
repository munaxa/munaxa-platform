import { Seeded, tick } from '../src/index.js';

/**
 * Wrap a store so every method takes time, the way a networked one does.
 *
 * Without this the simulations are not simulations. An in-process `Map` resolves its promises in
 * the same microtask, so a read-decide-write sequence over it is effectively atomic by accident —
 * which means a test can pass against the memory adapter and the identical code can lose sessions
 * against Postgres. Injecting a real delay between the read and the write is what turns "correct
 * because nothing yielded" into "correct because it was coordinated", and it is the difference
 * between a test that proves the fix and a test that agrees with it.
 *
 * The delay is drawn from a seeded PRNG, so a failing interleaving is reproducible.
 */
export function withLatency<T extends object>(target: T, maxMs = 4, seed = 4_242): T {
  const seeded = new Seeded(seed);

  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver) as unknown;
      if (typeof value !== 'function') return value;

      return async (...args: unknown[]): Promise<unknown> => {
        await seeded.delay(maxMs); // the request crossing the network
        const result: unknown = (value as (...a: unknown[]) => unknown).apply(object, args);
        const settled = await result;
        await tick(); // the response coming back
        return settled;
      };
    },
  });
}
