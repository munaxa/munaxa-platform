/**
 * Where the accessibility matrix spends its time — Phase 8.10.
 *
 * The suite grew from twelve hand-picked stories to sixteen hundred browser-driven combinations
 * across four phases, and each phase added cost for a good reason. Nobody has ever measured which
 * part of the bill belongs to which reason, so any claim that something is "expensive" or that a
 * change made it "faster" has been an inference.
 *
 * This records that instead. It is deliberately permanent and deliberately trivial: a counter and a
 * sum per named step, printed at the end of a run. A suite that cannot say where its minutes go
 * cannot be optimised honestly, and Phase 8.5's 305 false failures are the standing reminder that
 * this repository's instruments need to be checked rather than trusted.
 */

interface Step {
  count: number;
  totalMs: number;
}

const steps = new Map<string, Step>();

/** Time one step and add it to the ledger. Returns whatever the step returned. */
export async function timed<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    const step = steps.get(name) ?? { count: 0, totalMs: 0 };
    step.count += 1;
    step.totalMs += performance.now() - started;
    steps.set(name, step);
  }
}

/** Count something that is not worth timing — a context, a worker, a story. */
export function counted(name: string, by = 1): void {
  const step = steps.get(name) ?? { count: 0, totalMs: 0 };
  step.count += by;
  steps.set(name, step);
}

export interface Ledger {
  readonly step: string;
  readonly count: number;
  readonly totalSeconds: number;
  readonly eachMs: number;
}

/**
 * The ledger, heaviest first.
 *
 * Wall-clock time is not the sum of these: the matrix runs six workers in parallel, so the totals
 * are worker-seconds. That is the number that matters for deciding what to change — halving a step
 * that costs 40 worker-seconds cannot save eleven minutes, however inefficient it looks.
 */
export function ledger(): Ledger[] {
  return [...steps.entries()]
    .map(([step, { count, totalMs }]) => ({
      step,
      count,
      totalSeconds: Math.round(totalMs) / 1000,
      eachMs: count === 0 ? 0 : Math.round(totalMs / count),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function resetLedger(): void {
  steps.clear();
}
