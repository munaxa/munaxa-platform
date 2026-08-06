/**
 * The test-runner seam.
 *
 * The suites in this package are assertions about behaviour, not about vitest. Taking
 * `describe`/`it`/`expect` as parameters means a product can run them under vitest, jest, node's
 * built-in runner or anything else, and — more importantly — that `@munaxa/conformance` does not
 * put a test framework in the dependency tree of a published package.
 */
export interface TestHarness {
  // Declared as properties rather than methods so destructuring them is safe: none of them may
  // depend on `this`, which is exactly what makes `const { it } = harness` legitimate.
  describe: (this: void, name: string, body: () => void) => void;
  it: (this: void, name: string, body: () => void | Promise<void>) => void;
  expect: ExpectFn;
}

export interface ExpectFn {
  (actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
  };
}

/**
 * Yield to the event loop and, optionally, wait.
 *
 * Conformance suites use this to *create* interleaving rather than hope for it: an adapter whose
 * atomicity comes from "nothing awaited between the read and the write" must still hold when the
 * platform's own code awaits around it.
 */
export function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  });
}

/**
 * Run `count` copies of `work` concurrently and collect what happened.
 *
 * Deliberately does not use `Promise.all`: a rejection is a *result* here, not a failure of the
 * test. Half of what these suites assert is that exactly one caller wins and the rest are refused.
 */
export async function race<T>(
  count: number,
  work: (index: number) => Promise<T>,
): Promise<{ fulfilled: T[]; rejected: unknown[] }> {
  const settled = await Promise.allSettled(Array.from({ length: count }, (_, i) => work(i)));
  return {
    fulfilled: settled.filter(isFulfilled).map((r) => r.value),
    rejected: settled
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r): unknown => r.reason),
  };
}

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}

/**
 * A deterministic pseudo-random source, seeded per suite.
 *
 * Distributed simulations need *varied* orderings and *reproducible* failures. `Math.random()`
 * gives the first and not the second, which turns a real interleaving bug into a flake nobody can
 * reproduce. This is an xorshift — not cryptographic, and never used for anything but ordering.
 */
export class Seeded {
  #state: number;

  constructor(seed = 0x2f6e2b1) {
    this.#state = seed || 1;
  }

  next(): number {
    this.#state ^= this.#state << 13;
    this.#state ^= this.#state >>> 17;
    this.#state ^= this.#state << 5;
    return (this.#state >>> 0) / 0x1_00_00_00_00;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** A delay in [0, maxMs), for simulating network jitter between replicas. */
  delay(maxMs: number): Promise<void> {
    return tick(this.int(maxMs));
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }
}
