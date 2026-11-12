import { SlidingWindowCounter, TokenBucket, type SlidingWindowState } from '@munaxa/cache';
import type { CachePort } from '@munaxa/interfaces';
import {
  cacheKey,
  systemClock,
  type Clock,
  type DurationMs,
  type PlatformRequest,
  type SecurityContext,
  type TenantId,
} from '@munaxa/types';
import { canonicalRoutePath } from './normalize.js';

/**
 * Distributed rate limiting.
 *
 * Everything here is stored through `CachePort`, so the same rules hold across a fleet: one
 * Redis, one Cloudflare KV namespace, or one process, without the rule definitions changing.
 *
 * Three things the design insists on:
 *
 * - **Dimension, not just key.** A limit is per IP, per user, per tenant, per session or per
 *   endpoint. Limiting only by IP punishes offices and mobile carriers behind one address; only
 *   by user leaves unauthenticated endpoints — the ones being attacked — unprotected.
 * - **Fail open, loudly — except where it must not.** If the cache is down, requests are allowed
 *   and `degraded` is set: a general API limit that fails closed converts a cache outage into a
 *   total outage. A rule guarding credentials (`onStoreFailure: 'deny'`) refuses instead, also with
 *   `degraded` set, because an unreadable login limit is no login limit.
 * - **Adaptive.** Repeated violations lengthen a block on the subject, so a determined attacker
 *   gets progressively less throughput while an ordinary user who double-clicked does not. The
 *   block is a separate record: the count itself always lives in the rule's own window, so neither
 *   a refusal nor a longer penalty can start it again from zero.
 */
export type RateLimitDimension = 'ip' | 'user' | 'tenant' | 'session' | 'endpoint' | 'global';

export type RateLimitAlgorithm = 'sliding-window' | 'token-bucket';

export interface RateLimitRule {
  readonly id: string;
  /** Matched against method and path. Omit to apply everywhere. */
  readonly match?: (request: RateLimitTarget) => boolean;
  readonly dimension: RateLimitDimension;
  readonly limit: number;
  readonly window: DurationMs;
  readonly algorithm?: RateLimitAlgorithm;
  /** Burst allowance for the token bucket. Defaults to `limit`. */
  readonly burst?: number;
  /**
   * Lengthens the block after repeated violations: the first lasts one `window`, each later one
   * `adaptiveFactor` times the last, up to 16 windows. 1 (the default) disables adaptation.
   * Sliding-window rules only.
   */
  readonly adaptiveFactor?: number;
  /**
   * What the rule answers when its counter store fails. `allow` (the default) admits the request
   * with `degraded` set; `deny` refuses it with `degraded` set. Use `deny` for limits that guard a
   * credential — sign-in, a reset, a second factor — where admitting unlimited attempts during an
   * outage is the failure the limit exists to prevent.
   */
  readonly onStoreFailure?: 'allow' | 'deny';
  /** How many requests this one counts as. Use for expensive endpoints. */
  readonly cost?: number;
}

export interface RateLimitTarget {
  readonly method: string;
  readonly path: string;
  readonly tenantId: TenantId;
  readonly ipAddress?: string;
  readonly userId?: string;
  readonly sessionId?: string;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly rule?: string;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
  readonly retryAfterSeconds: number;
  /**
   * True when the backing store failed for at least one applicable rule. With `allowed` true the
   * request was admitted anyway (`onStoreFailure: 'allow'`); with `allowed` false it was refused
   * because a rule could not be read (`'deny'`), which is an outage, not the caller's fault.
   */
  readonly degraded?: boolean;
}

export interface RateLimiterOptions {
  readonly cache: CachePort;
  readonly rules: readonly RateLimitRule[];
  readonly clock?: Clock;
  /** Called when the store fails. Wire it to a metric — silent degradation is worse than none. */
  readonly onDegraded?: (error: unknown, rule: RateLimitRule) => void;
}

export class RateLimiter {
  readonly #cache: CachePort;
  readonly #rules: readonly RateLimitRule[];
  readonly #clock: Clock;
  readonly #window: SlidingWindowCounter;
  readonly #bucket: TokenBucket;
  readonly #onDegraded: RateLimiterOptions['onDegraded'];

  constructor(options: RateLimiterOptions) {
    this.#cache = options.cache;
    this.#rules = options.rules;
    this.#clock = options.clock ?? systemClock;
    this.#window = new SlidingWindowCounter(options.cache, this.#clock);
    this.#bucket = new TokenBucket(options.cache, this.#clock);
    this.#onDegraded = options.onDegraded;
  }

  /**
   * Evaluate every applicable rule, in order; the first denial wins and later rules are not
   * charged. A store failure on any rule is reported (`degraded`) on the answer, whichever rule's
   * numbers it carries, so a caller can never mistake a partly unreadable decision for a clean one.
   */
  async check(target: RateLimitTarget): Promise<RateLimitDecision> {
    let tightest: RateLimitDecision | undefined;
    let degraded = false;

    for (const rule of this.#rules) {
      if (rule.match && !rule.match(target)) continue;

      const subject = subjectFor(rule.dimension, target);
      // A rule whose dimension is absent from the request — a per-user limit on an anonymous
      // endpoint — does not apply. It must not silently become a global limit.
      if (subject === undefined) continue;

      const decision = await this.#evaluate(rule, target, subject);
      degraded ||= decision.degraded === true;
      if (!decision.allowed) return degraded ? { ...decision, degraded } : decision;
      if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
    }

    const answer = tightest ?? {
      allowed: true,
      limit: 0,
      remaining: Number.MAX_SAFE_INTEGER,
      resetAt: this.#clock.now(),
      retryAfterSeconds: 0,
    };
    return degraded ? { ...answer, degraded } : answer;
  }

  async #evaluate(
    rule: RateLimitRule,
    target: RateLimitTarget,
    subject: string,
  ): Promise<RateLimitDecision> {
    const key = cacheKey('rl', rule.id, target.tenantId, subject);
    const cost = rule.cost ?? 1;

    try {
      if ((rule.algorithm ?? 'sliding-window') === 'token-bucket') {
        const result = await this.#bucket.consume(
          key,
          {
            refillPerSecond: rule.limit / (rule.window / 1_000),
            capacity: rule.burst ?? rule.limit,
          },
          cost,
        );
        return {
          allowed: result.allowed,
          rule: rule.id,
          limit: rule.limit,
          remaining: result.remaining,
          resetAt: this.#clock.now() + result.retryAfter,
          retryAfterSeconds: Math.ceil(result.retryAfter / 1_000),
        };
      }

      // Every attempt is counted — refused ones included — and always in the rule's own window, so
      // the counter's key never depends on how often the subject has been refused. (It used to be
      // counted in the penalty window, whose different length meant a different key: the count
      // restarted at zero after each refusal.)
      const state = await this.#window.hitWithHistory(key, rule.window, cost);
      const now = this.#clock.now();
      const over = state.count > rule.limit;
      const blockedUntil = await this.#blockedUntil(rule, key, now, over);
      const allowed = !over && blockedUntil === undefined;

      return {
        allowed,
        rule: rule.id,
        limit: rule.limit,
        remaining: allowed ? Math.max(0, rule.limit - state.count) : 0,
        resetAt: state.resetAt,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(
              1,
              Math.ceil(
                (Math.max(
                  blockedUntil ?? now,
                  admittedAgainAt(state, rule.window, rule.limit, cost, now),
                ) -
                  now) /
                  1_000,
              ),
            ),
      };
    } catch (error) {
      this.#onDegraded?.(error, rule);
      if (rule.onStoreFailure === 'deny') {
        return {
          allowed: false,
          rule: rule.id,
          limit: rule.limit,
          remaining: 0,
          resetAt: this.#clock.now() + STORE_FAILURE_RETRY_MS,
          retryAfterSeconds: STORE_FAILURE_RETRY_MS / 1_000,
          degraded: true,
        };
      }
      return {
        allowed: true,
        rule: rule.id,
        limit: rule.limit,
        remaining: 0,
        resetAt: this.#clock.now(),
        retryAfterSeconds: 0,
        degraded: true,
      };
    }
  }

  /**
   * The end of the subject's adaptive block, or `undefined` when it is not blocked.
   *
   * A subject that goes over the limit while not blocked is blocked: for one window the first time,
   * then `adaptiveFactor` times longer for each violation remembered (at most 16 windows, so a long
   * attack cannot push a shared NAT address out to something unrecoverable). Only one of several
   * concurrent requests crossing the limit records the violation (`setIfAbsent` on the block), so a
   * burst escalates the penalty once, not once per request. While blocked, attempts still count.
   */
  async #blockedUntil(
    rule: RateLimitRule,
    key: string,
    now: number,
    over: boolean,
  ): Promise<number | undefined> {
    const factor = rule.adaptiveFactor ?? 1;
    if (factor <= 1) return undefined;

    const blockKey = `${key}:block`;
    const existing = await this.#cache.get<number>(blockKey);
    if (existing !== undefined && existing > now) return existing;
    if (!over) return undefined;

    const violationsKey = `${key}:violations`;
    const violations = (await this.#cache.get<number>(violationsKey)) ?? 0;
    const penalty = Math.min(rule.window * factor ** Math.min(violations, 4), rule.window * 16);
    const until = now + penalty;
    if (await this.#cache.setIfAbsent(blockKey, until, { ttl: penalty })) {
      await this.#cache.increment(violationsKey, 1, { ttl: rule.window * 32 });
      return until;
    }
    // Another request recorded this violation first; its block is the one that stands.
    return (await this.#cache.get<number>(blockKey)) ?? until;
  }

  /**
   * Clear a subject's counters — an administrator unblocking a customer.
   *
   * The rule is looked up rather than taken on trust, because the window it was recorded with is
   * what determines which bucket keys exist; resetting without it deletes nothing and leaves the
   * customer blocked while the support ticket says otherwise.
   */
  async reset(ruleId: string, tenantId: TenantId, subject: string): Promise<boolean> {
    const rule = this.#rules.find((candidate) => candidate.id === ruleId);
    if (!rule) return false;

    const key = cacheKey('rl', ruleId, tenantId, subject);
    await this.#window.reset(key, rule.window);
    await this.#cache.delete(key);
    await this.#cache.delete(`${key}:violations`);
    await this.#cache.delete(`${key}:block`);
    return true;
  }
}

/** How long a rule that refuses on a store failure tells the caller to wait. */
const STORE_FAILURE_RETRY_MS = 5_000;

/**
 * The earliest time a further request of `cost` would be admitted, if nothing else arrives.
 *
 * The sliding estimate is `previous × (1 − elapsed/window) + current`, so it falls as the previous
 * window's weight runs down and drops a step at each boundary, when `current` becomes `previous`.
 * Rounding is ignored, which can only make the answer slightly later than the truth.
 */
function admittedAgainAt(
  state: SlidingWindowState,
  window: DurationMs,
  limit: number,
  cost: number,
  now: number,
): number {
  const room = limit - cost;
  if (room < 0) return Number.POSITIVE_INFINITY;
  const end = state.windowStart + window;

  // Within the current window: the previous window's share must fall to what `current` leaves.
  const spare = room - state.current;
  if (spare >= 0) {
    if (state.previous <= spare) return now;
    const at = state.windowStart + window * (1 - spare / state.previous);
    if (at < end) return Math.max(now, at);
  }
  // In the next window `current` is the previous one, and the new current starts at zero.
  if (state.current <= room) return Math.max(now, end);
  return end + window * (1 - room / state.current);
}

function subjectFor(dimension: RateLimitDimension, target: RateLimitTarget): string | undefined {
  switch (dimension) {
    case 'ip':
      return target.ipAddress;
    case 'user':
      return target.userId;
    case 'session':
      return target.sessionId;
    case 'tenant':
      return target.tenantId;
    case 'endpoint':
      return `${target.method} ${target.path}`;
    case 'global':
      return 'global';
  }
}

/** Build a target from a request and whatever context has been resolved so far. */
export function targetFor(
  request: PlatformRequest,
  context: Pick<SecurityContext, 'tenantId'> & { userId?: string; sessionId?: string },
): RateLimitTarget {
  return {
    method: request.method,
    path: request.path,
    tenantId: context.tenantId,
    ...(request.ipAddress === undefined ? {} : { ipAddress: request.ipAddress }),
    ...(context.userId === undefined ? {} : { userId: context.userId }),
    ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
  };
}

/**
 * The rules every Munaxa product should start from.
 *
 * The authentication limits are deliberately much tighter than the API ones, and the login rule
 * is adaptive: credential stuffing looks exactly like a lot of failed logins from a few addresses.
 */
export const BASELINE_RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  {
    id: 'login-per-ip',
    match: (target) => isRoute(target, 'POST', (path) => path.endsWith('/login')),
    dimension: 'ip',
    limit: 10,
    window: 15 * 60 * 1_000,
    adaptiveFactor: 2,
    onStoreFailure: 'deny',
  },
  {
    id: 'login-per-account',
    match: (target) => isRoute(target, 'POST', (path) => path.endsWith('/login')),
    dimension: 'user',
    limit: 5,
    window: 15 * 60 * 1_000,
    adaptiveFactor: 2,
    onStoreFailure: 'deny',
  },
  {
    id: 'password-reset-per-ip',
    match: (target) =>
      isRoute(
        target,
        'POST',
        (path) => path.includes('/password/reset') || path.includes('/password/forgot'),
      ),
    dimension: 'ip',
    limit: 5,
    window: 60 * 60 * 1_000,
    adaptiveFactor: 2,
    onStoreFailure: 'deny',
  },
  {
    id: 'mfa-verify-per-session',
    match: (target) =>
      target.method.toUpperCase() !== 'GET' &&
      target.method.toUpperCase() !== 'HEAD' &&
      (canonicalRoutePath(target.path).includes('/mfa/') ||
        canonicalRoutePath(target.path).endsWith('/mfa')),
    dimension: 'session',
    limit: 10,
    window: 15 * 60 * 1_000,
    onStoreFailure: 'deny',
  },
  {
    id: 'api-per-user',
    dimension: 'user',
    limit: 1_000,
    window: 60 * 1_000,
    algorithm: 'token-bucket',
    burst: 100,
  },
  {
    id: 'api-per-ip',
    dimension: 'ip',
    limit: 300,
    window: 60 * 1_000,
  },
];

/**
 * Whether a target is `method` on a route whose canonical path satisfies `path`.
 *
 * The path is canonicalised first (`canonicalRoutePath`), so `/LOGIN`, `/login/`, `/login?x` and
 * `http://host/login` are all the login route; a matcher on the raw string would let a respelling
 * step around it.
 */
export function isRoute(
  target: Pick<RateLimitTarget, 'method' | 'path'>,
  method: string,
  path: (canonical: string) => boolean,
): boolean {
  return target.method.toUpperCase() === method && path(canonicalRoutePath(target.path));
}

/** The headers a rate-limited response should carry, in the widely-adopted draft form. */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'ratelimit-limit': String(decision.limit),
    'ratelimit-remaining': String(Math.max(0, decision.remaining)),
    'ratelimit-reset': String(Math.max(0, Math.ceil((decision.resetAt - Date.now()) / 1_000))),
  };
  if (!decision.allowed) headers['retry-after'] = String(decision.retryAfterSeconds);
  return headers;
}
