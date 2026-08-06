import { SlidingWindowCounter, TokenBucket } from '@munaxa/cache';
import type { CachePort } from '@munaxa/interfaces';
import {
  systemClock,
  type Clock,
  type DurationMs,
  type PlatformRequest,
  type SecurityContext,
  type TenantId,
} from '@munaxa/types';

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
 * - **Fail open, loudly.** If the cache is down, requests are allowed and `degraded` is set. A
 *   rate limiter that fails closed converts a cache outage into a total outage.
 * - **Adaptive.** Repeated violations widen the penalty window, so a determined attacker gets
 *   progressively less throughput while an ordinary user who double-clicked does not.
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
  /** Multiplies the penalty window after repeated violations. 1 disables adaptation. */
  readonly adaptiveFactor?: number;
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
  /** True when the backing store failed and the request was allowed rather than dropped. */
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

  /** Evaluate every applicable rule; the first denial wins. */
  async check(target: RateLimitTarget): Promise<RateLimitDecision> {
    let tightest: RateLimitDecision | undefined;

    for (const rule of this.#rules) {
      if (rule.match && !rule.match(target)) continue;

      const subject = subjectFor(rule.dimension, target);
      // A rule whose dimension is absent from the request — a per-user limit on an anonymous
      // endpoint — does not apply. It must not silently become a global limit.
      if (subject === undefined) continue;

      const decision = await this.#evaluate(rule, target, subject);
      if (!decision.allowed) return decision;
      if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
    }

    return (
      tightest ?? {
        allowed: true,
        limit: 0,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: this.#clock.now(),
        retryAfterSeconds: 0,
      }
    );
  }

  async #evaluate(
    rule: RateLimitRule,
    target: RateLimitTarget,
    subject: string,
  ): Promise<RateLimitDecision> {
    const key = `rl:${rule.id}:${target.tenantId}:${subject}`;
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

      const penalty = await this.#penaltyWindow(rule, key);
      const state = await this.#window.hit(key, penalty, cost);
      const allowed = state.count <= rule.limit;
      if (!allowed) await this.#recordViolation(rule, key);

      return {
        allowed,
        rule: rule.id,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - state.count),
        resetAt: state.resetAt,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((state.resetAt - this.#clock.now()) / 1_000)),
      };
    } catch (error) {
      this.#onDegraded?.(error, rule);
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

  /** Widen the window for a subject that keeps hitting the limit. */
  async #penaltyWindow(rule: RateLimitRule, key: string): Promise<DurationMs> {
    const factor = rule.adaptiveFactor ?? 1;
    if (factor <= 1) return rule.window;

    const violations = (await this.#cache.get<number>(`${key}:violations`)) ?? 0;
    if (violations === 0) return rule.window;
    // Bounded so a long-running attack cannot push a window out to something unrecoverable for a
    // shared address behind NAT.
    return Math.min(rule.window * factor ** Math.min(violations, 4), rule.window * 16);
  }

  async #recordViolation(rule: RateLimitRule, key: string): Promise<void> {
    if ((rule.adaptiveFactor ?? 1) <= 1) return;
    await this.#cache.increment(`${key}:violations`, 1, { ttl: rule.window * 16 });
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

    const key = `rl:${ruleId}:${tenantId}:${subject}`;
    await this.#window.reset(key, rule.window);
    await this.#cache.delete(key);
    await this.#cache.delete(`${key}:violations`);
    return true;
  }
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
    match: (target) => target.path.endsWith('/login') && target.method === 'POST',
    dimension: 'ip',
    limit: 10,
    window: 15 * 60 * 1_000,
    adaptiveFactor: 2,
  },
  {
    id: 'login-per-account',
    match: (target) => target.path.endsWith('/login') && target.method === 'POST',
    dimension: 'user',
    limit: 5,
    window: 15 * 60 * 1_000,
    adaptiveFactor: 2,
  },
  {
    id: 'password-reset-per-ip',
    match: (target) => target.path.includes('/password/reset'),
    dimension: 'ip',
    limit: 5,
    window: 60 * 60 * 1_000,
    adaptiveFactor: 2,
  },
  {
    id: 'mfa-verify-per-session',
    match: (target) => target.path.includes('/mfa/'),
    dimension: 'session',
    limit: 10,
    window: 15 * 60 * 1_000,
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
