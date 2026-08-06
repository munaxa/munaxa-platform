/**
 * Time in the platform is always explicit.
 *
 * Nothing calls `Date.now()` directly: every expiry, timeout and window reads a `Clock`, so
 * tests can advance time deterministically and deployments can share a clock source.
 */

/** Milliseconds since the Unix epoch. */
export type EpochMillis = number;

/** A duration in milliseconds. */
export type DurationMs = number;

export interface Clock {
  /** Current wall-clock time. */
  now(): EpochMillis;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock you drive by hand. The platform's own tests use nothing else. */
export class FixedClock implements Clock {
  #current: EpochMillis;

  constructor(start: EpochMillis = 0) {
    this.#current = start;
  }

  now(): EpochMillis {
    return this.#current;
  }

  advance(by: DurationMs): EpochMillis {
    this.#current += by;
    return this.#current;
  }

  set(to: EpochMillis): void {
    this.#current = to;
  }
}

export const SECOND: DurationMs = 1_000;
export const MINUTE: DurationMs = 60 * SECOND;
export const HOUR: DurationMs = 60 * MINUTE;
export const DAY: DurationMs = 24 * HOUR;

const DURATION_UNITS: Readonly<Record<string, DurationMs>> = {
  ms: 1,
  s: SECOND,
  m: MINUTE,
  h: HOUR,
  d: DAY,
  w: 7 * DAY,
};

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/;

/**
 * Parse `'15m'`, `'7d'`, `'250ms'` into milliseconds.
 *
 * Configuration is written by humans in units; everything downstream works in milliseconds.
 * A bare number is rejected rather than guessed at — "3600" has meant seconds in one config
 * file and milliseconds in the next often enough to be worth a startup failure.
 */
export function parseDuration(input: string | number): DurationMs {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      throw new TypeError(`Invalid duration: ${input}`);
    }
    return input;
  }
  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) {
    throw new TypeError(`Invalid duration: ${JSON.stringify(input)} (expected e.g. '15m', '7d')`);
  }
  const [, amount, unit] = match;
  return Number(amount) * (DURATION_UNITS[unit as string] as DurationMs);
}

/** True when `at` is at or past `deadline`. Exclusive-of-nothing: equality counts as expired. */
export function isExpired(deadline: EpochMillis, at: EpochMillis): boolean {
  return at >= deadline;
}
