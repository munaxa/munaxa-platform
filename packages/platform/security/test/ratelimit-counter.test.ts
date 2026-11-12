import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import type { CachePort } from '@munaxa/interfaces';
import {
  FixedClock,
  ROOT_TENANT_ID,
  emptyResponse,
  toTenantId,
  type EpochMillis,
  type PlatformRequest,
} from '@munaxa/types';
import {
  BASELINE_RATE_LIMIT_RULES,
  RateLimiter,
  canonicalRoutePath,
  securityPipeline,
  type RateLimitRule,
  type RateLimitTarget,
} from '../src/index.js';

/**
 * The counter a rate limit keeps, and whether a refusal, a penalty or a window boundary can reset it.
 *
 * The defect these pin: the adaptive penalty used to change the *window length* the count was kept
 * in, and the window length is part of the counter's key, so the count restarted at zero after each
 * refusal. Ten guesses per fifteen minutes became 28 of 30 one second apart (refused: 11 and 22).
 */

const START: EpochMillis = Date.UTC(2026, 10, 12, 10, 0, 0);
const MINUTE = 60_000;
const LOGIN = BASELINE_RATE_LIMIT_RULES.find((rule) => rule.id === 'login-per-ip')!;

const loginFrom = (ipAddress: string, path = '/api/auth/login'): RateLimitTarget => ({
  method: 'POST',
  path,
  tenantId: ROOT_TENANT_ID,
  ipAddress,
});

const setup = (rules: readonly RateLimitRule[], cache?: (clock: FixedClock) => CachePort) => {
  const clock = new FixedClock(START);
  const store = cache?.(clock) ?? new MemoryCache({ clock });
  return { clock, cache: store, limiter: new RateLimiter({ cache: store, clock, rules }) };
};

const refusedAttempts = async (
  limiter: RateLimiter,
  clock: FixedClock,
  attempts: number,
  spacing: number,
  target: RateLimitTarget = loginFrom('203.0.113.7'),
): Promise<number[]> => {
  const refused: number[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!(await limiter.check(target)).allowed) refused.push(attempt);
    clock.advance(spacing);
  }
  return refused;
};

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('the adaptive penalty no longer restarts the count', () => {
  it('regression: 30 attempts one second apart are refused from the 11th on, not only on 11 and 22', async () => {
    const { clock, limiter } = setup([LOGIN]);

    expect(await refusedAttempts(limiter, clock, 30, 1_000)).toEqual(range(11, 30));
  });

  it('keeps one counter while the penalty grows: a block ending does not hand back a fresh budget', async () => {
    const { clock, limiter } = setup([LOGIN]);
    await refusedAttempts(limiter, clock, 11, 1_000);

    // The first block is one window (15 min). An attacker who keeps going through it, then waits only
    // for the block to end, is still over the limit on history, and is blocked again for longer.
    await refusedAttempts(limiter, clock, 20, 30_000); // 10 min more of attempts, all refused
    clock.set(START + 15 * MINUTE + 11_000);
    const after = await limiter.check(loginFrom('203.0.113.7'));

    expect(after.allowed).toBe(false);
    expect(after.retryAfterSeconds).toBeGreaterThanOrEqual(15 * 60);
  });

  it('counts refused attempts, so a subject that keeps trying stays refused', async () => {
    const rule: RateLimitRule = { id: 'r', dimension: 'ip', limit: 5, window: 10 * MINUTE };
    const { clock, limiter } = setup([rule]);

    // 5 allowed, then one attempt a minute for an hour: every one refused, across six window
    // boundaries, because the refused attempts are what keeps the estimate above the limit.
    await refusedAttempts(limiter, clock, 5, 1_000);
    expect(await refusedAttempts(limiter, clock, 60, MINUTE)).toEqual(range(1, 60));
  });

  it.each([
    [10_000, 30],
    [89_000, 240],
  ])(
    'cannot be reset by timing attempts across window or penalty boundaries (every %i ms)',
    async (spacing, ceiling) => {
      const { clock, limiter } = setup([LOGIN]);
      let admitted = 0;
      // Six hours of probing, crossing every fixed-window and block boundary on the way.
      for (let elapsed = 0; elapsed < 6 * 60 * MINUTE; elapsed += spacing) {
        if ((await limiter.check(loginFrom('203.0.113.7'))).allowed) admitted += 1;
        clock.advance(spacing);
      }
      // Ten per fifteen minutes is at most 240 in six hours, whatever the timing.
      expect(admitted).toBeLessThanOrEqual(ceiling);
    },
  );

  it('records one violation for a concurrent burst, not one per request', async () => {
    const { cache, limiter } = setup([LOGIN]);
    await Promise.all(range(1, 40).map(() => limiter.check(loginFrom('203.0.113.7'))));

    const key = 'rl:login-per-ip:root:203.0.113.7';
    expect(await cache.get<number>(`${key}:violations`)).toBe(1);
  });
});

describe('concurrency and several instances', () => {
  const rule: RateLimitRule = { id: 'burst', dimension: 'ip', limit: 10, window: MINUTE };

  // The same two properties against a real Redis server, each instance on its own connection:
  // test/redis-server.test.ts (CI runs it with a Redis service).
  it('admits exactly the limit from 100 concurrent requests', async () => {
    const { limiter } = setup([rule]);
    const decisions = await Promise.all(range(1, 100).map(() => limiter.check(loginFrom('a'))));

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
  });

  it('shares one limit between independent limiter instances on one store', async () => {
    const clock = new FixedClock(START);
    const store = new MemoryCache({ clock });
    const instances = range(1, 4).map(
      () => new RateLimiter({ cache: store, clock, rules: [LOGIN] }),
    );
    const decisions = await Promise.all(
      range(0, 39).map((index) => instances[index % 4]!.check(loginFrom('203.0.113.7'))),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
    // The block one instance set holds on every other.
    for (const instance of instances) {
      expect((await instance.check(loginFrom('203.0.113.7'))).allowed).toBe(false);
    }
  });
});

describe('expiry, recovery and Retry-After', () => {
  it('is refused until Retry-After has passed, and admitted once it has', async () => {
    const rule: RateLimitRule = { id: 'r', dimension: 'ip', limit: 5, window: 10 * MINUTE };
    const { clock, limiter } = setup([rule]);
    await refusedAttempts(limiter, clock, 5, 0, loginFrom('a'));

    const refused = await limiter.check(loginFrom('a'));
    expect(refused.allowed).toBe(false);
    const waitMs = refused.retryAfterSeconds * 1_000;
    expect(waitMs).toBeGreaterThan(0);
    expect(waitMs).toBeLessThanOrEqual(20 * MINUTE);

    // Halfway there it is still refused (the estimate rounds, so Retry-After is an upper bound and
    // admission can come a few seconds sooner; it never comes later).
    clock.advance(waitMs / 2);
    const again = await limiter.check(loginFrom('a'));
    expect(again.allowed).toBe(false);
    // That refusal counted too; its own Retry-After is honoured as well.
    clock.advance(again.retryAfterSeconds * 1_000);
    expect((await limiter.check(loginFrom('a'))).allowed).toBe(true);
  });

  it('recovers fully once the history has aged out: the full budget is back', async () => {
    const { clock, limiter } = setup([LOGIN]);
    await refusedAttempts(limiter, clock, 15, 1_000);

    clock.advance(2 * 15 * MINUTE + 1_000); // the block (one window) and both counted windows
    expect(await refusedAttempts(limiter, clock, 10, 1_000)).toEqual([]);
    expect((await limiter.check(loginFrom('203.0.113.7'))).allowed).toBe(false);
  });

  it('keeps a counter until its window ends, never shorter', async () => {
    const rule: RateLimitRule = { id: 'r', dimension: 'ip', limit: 3, window: 10 * MINUTE };
    const { clock, limiter } = setup([rule]);
    await refusedAttempts(limiter, clock, 3, 0, loginFrom('a'));

    clock.advance(10 * MINUTE - 1);
    expect((await limiter.check(loginFrom('a'))).allowed).toBe(false);
  });

  it('answers 429 with Retry-After through the security pipeline', async () => {
    const { clock, limiter } = setup([LOGIN]);
    const pipeline = securityPipeline({ apiOnly: true, rateLimiter: limiter });
    const request: PlatformRequest = {
      method: 'POST',
      path: '/api/auth/login',
      headers: {},
      cookies: {},
      ipAddress: '203.0.113.7',
    };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await pipeline(request, emptyResponse())).toBeUndefined();
    }
    const response = emptyResponse();
    const refused = await pipeline(request, response);

    expect(refused?.status).toBe(429);
    expect(response.headers['retry-after']).toMatch(/^[1-9]\d*$/);
    expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(15 * 60 - 10);
    expect(clock.now()).toBe(START);
  });
});

describe('isolation between subjects, rules and tenants', () => {
  it('refusing one address, session or account leaves every other alone', async () => {
    const rules: RateLimitRule[] = [
      { id: 'per-ip', dimension: 'ip', limit: 2, window: MINUTE },
      { id: 'per-session', dimension: 'session', limit: 2, window: MINUTE },
      { id: 'per-user', dimension: 'user', limit: 2, window: MINUTE },
    ];
    for (const rule of rules) {
      const { limiter } = setup([rule]);
      const target = (subject: string): RateLimitTarget => ({
        method: 'POST',
        path: '/x',
        tenantId: ROOT_TENANT_ID,
        ipAddress: subject,
        sessionId: subject,
        userId: subject,
      });
      await limiter.check(target('noisy'));
      await limiter.check(target('noisy'));
      expect((await limiter.check(target('noisy'))).allowed, rule.id).toBe(false);
      expect((await limiter.check(target('quiet'))).allowed, rule.id).toBe(true);
    }
  });

  it('keeps each rule and each tenant on its own counter', async () => {
    const { limiter } = setup([
      { id: 'a', dimension: 'ip', limit: 1, window: MINUTE, match: (t) => t.path === '/a' },
      { id: 'b', dimension: 'ip', limit: 1, window: MINUTE, match: (t) => t.path === '/b' },
    ]);
    const at = (path: string, tenant = 'acme'): RateLimitTarget => ({
      method: 'POST',
      path,
      tenantId: toTenantId(tenant),
      ipAddress: '198.51.100.1',
    });
    await limiter.check(at('/a'));
    expect((await limiter.check(at('/a'))).allowed).toBe(false);
    expect((await limiter.check(at('/b'))).allowed).toBe(true);
    expect((await limiter.check(at('/a', 'globex'))).allowed).toBe(true);
  });
});

describe('store failure', () => {
  const broken = (): CachePort =>
    new Proxy(new MemoryCache(), {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function'
          ? () => Promise.reject(new Error('connection lost'))
          : value;
      },
    });

  it('refuses, marked degraded, for a rule that must not fail open', async () => {
    const limiter = new RateLimiter({ cache: broken(), rules: [LOGIN] });
    const decision = await limiter.check(loginFrom('203.0.113.7'));

    expect(decision).toMatchObject({ allowed: false, degraded: true, rule: 'login-per-ip' });
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('admits, marked degraded, for a general rule (an outage must not become a total outage)', async () => {
    const limiter = new RateLimiter({
      cache: broken(),
      rules: [{ id: 'api', dimension: 'ip', limit: 300, window: MINUTE }],
    });

    expect(await limiter.check(loginFrom('a'))).toMatchObject({ allowed: true, degraded: true });
  });

  it('reports a degraded rule even when another rule has fewer remaining', async () => {
    let failing = false;
    const store = new MemoryCache();
    const flaky = new Proxy(store, {
      get: (target, property) => {
        const value = Reflect.get(target, property) as unknown;
        if (typeof value !== 'function') return value;
        const method = value as (...a: unknown[]) => Promise<unknown>;
        return (...args: unknown[]): Promise<unknown> =>
          failing && String(args[0]).includes(':second:')
            ? Promise.reject(new Error('timeout'))
            : method.apply(target, args);
      },
    });
    const limiter = new RateLimiter({
      cache: flaky,
      rules: [
        { id: 'first', dimension: 'ip', limit: 1, window: MINUTE },
        { id: 'second', dimension: 'ip', limit: 100, window: MINUTE },
      ],
    });
    failing = true;

    expect(await limiter.check(loginFrom('a'))).toMatchObject({ allowed: true, degraded: true });
  });

  it('answers a degraded refusal with 503 and Retry-After, not 429', async () => {
    const pipeline = securityPipeline({
      apiOnly: true,
      rateLimiter: new RateLimiter({ cache: broken(), rules: [LOGIN] }),
    });
    const response = emptyResponse();
    const refused = await pipeline(
      { method: 'POST', path: '/login', headers: {}, cookies: {}, ipAddress: 'a' },
      response,
    );

    expect(refused?.status).toBe(503);
    expect(refused?.body).toMatchObject({ code: 'SECURITY_RATE_LIMIT_UNAVAILABLE' });
    expect(response.headers['retry-after']).toBe('5');
  });
});

describe('baseline rules match every spelling of their route, and only their route', () => {
  const rule = (id: string) => BASELINE_RATE_LIMIT_RULES.find((candidate) => candidate.id === id)!;
  const matches = (id: string, method: string, path: string) =>
    rule(id).match!({ method, path, tenantId: ROOT_TENANT_ID });

  it.each([
    '/api/auth/login',
    '/api/auth/LOGIN',
    '/API/Auth/Login/',
    '/api//auth//login',
    '/api/auth/%6Cogin',
    '/api/auth/login?next=/',
    '/api/auth/login#x',
    'http://identity.example/api/auth/login',
    '/api/auth/x/../login',
  ])('login-per-ip matches POST %s', (path) => {
    expect(matches('login-per-ip', 'POST', path)).toBe(true);
    expect(matches('login-per-ip', 'post', path)).toBe(true);
  });

  it('login rules do not match another method or another route', () => {
    expect(matches('login-per-ip', 'GET', '/api/auth/login')).toBe(false);
    expect(matches('login-per-ip', 'POST', '/api/auth/logout')).toBe(false);
    expect(matches('login-per-ip', 'POST', '/api/auth/login/extra')).toBe(false);
  });

  it('password-reset-per-ip covers the request and the completion, posted, not page views', () => {
    expect(matches('password-reset-per-ip', 'POST', '/api/auth/password/forgot')).toBe(true);
    expect(matches('password-reset-per-ip', 'POST', '/api/auth/Password/Reset/')).toBe(true);
    expect(matches('password-reset-per-ip', 'GET', '/api/auth/password/reset?token=x')).toBe(false);
  });

  it('mfa-verify-per-session covers state-changing MFA routes, not page views', () => {
    expect(matches('mfa-verify-per-session', 'POST', '/api/auth/MFA/verify')).toBe(true);
    expect(matches('mfa-verify-per-session', 'DELETE', '/api/auth/mfa')).toBe(true);
    expect(matches('mfa-verify-per-session', 'GET', '/api/auth/mfa/enroll')).toBe(false);
  });

  it('canonicalRoutePath folds every spelling to one lowercase path', () => {
    expect(canonicalRoutePath('HTTPS://h:443/A//b/./c/../D/?q#f')).toBe('/a/b/d');
    expect(canonicalRoutePath('/')).toBe('/');
  });
});
