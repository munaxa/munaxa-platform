import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import { KeyRing, secureBytes } from '@munaxa/crypto';
import {
  FixedClock,
  ROOT_TENANT_ID,
  emptyResponse,
  type PlatformRequest,
  type PlatformResponse,
} from '@munaxa/types';
import {
  BASELINE_RATE_LIMIT_RULES,
  CsrfProtection,
  RateLimiter,
  rateLimitHeaders,
  securityPipeline,
  type SecurityPipelineEvent,
} from '../src/index.js';

function build(overrides: Parameters<typeof securityPipeline>[0] = {}) {
  const clock = new FixedClock(1_700_000_000_000);
  const cache = new MemoryCache({ clock });
  const events: SecurityPipelineEvent[] = [];
  const keyRing = new KeyRing({ kid: 'k1', key: secureBytes(32) });
  const csrf = new CsrfProtection({ keyRing, clock });
  const rateLimiter = new RateLimiter({
    cache,
    clock,
    rules: [...BASELINE_RATE_LIMIT_RULES],
  });

  const pipeline = securityPipeline({
    rateLimiter,
    csrf,
    resolveTenant: () => ROOT_TENANT_ID,
    onEvent: (event) => void events.push(event),
    ...overrides,
  });

  return { pipeline, clock, cache, events, csrf, rateLimiter };
}

function request(overrides: Partial<PlatformRequest> = {}): PlatformRequest {
  return {
    method: 'GET',
    path: '/api/documents',
    headers: { 'user-agent': 'Mozilla/5.0' },
    ipAddress: '198.51.100.20',
    ...overrides,
  };
}

describe('the pipeline in order', () => {
  it('applies headers even to a rejected response', async () => {
    const { pipeline } = build();
    const response: PlatformResponse = emptyResponse();
    const result = await pipeline(request({ path: '/api/../../etc/passwd' }), response);

    expect(result?.status).toBe(400);
    // The rejection carries the headers set by the first step, because that step ran first.
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(result?.headers['x-frame-options']).toBe('DENY');
  });

  it('rate limits before authentication does any work', async () => {
    const { pipeline, events } = build();
    const login = () =>
      pipeline(request({ method: 'POST', path: '/api/auth/login' }), emptyResponse());

    for (let i = 0; i < 10; i++) expect(await login()).toBeUndefined();

    const blocked = await login();
    expect(blocked?.status).toBe(429);
    expect(blocked?.body).toMatchObject({ code: 'SECURITY_RATE_LIMITED' });
    expect(events.map((event) => event.name)).toContain('security.ratelimit.exceeded');
  });

  it('sets rate-limit headers on allowed responses too', async () => {
    const { pipeline } = build();
    const response = emptyResponse();
    await pipeline(request({ method: 'POST', path: '/api/auth/login' }), response);

    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
  });

  it('enforces CSRF once a session exists, and not before', async () => {
    const { pipeline, csrf, events } = build({
      resolveSession: (req) => (req.headers['x-session'] ? { sessionId: req.headers['x-session'] } : {}),
    });

    // No session — the login form itself must still be submittable.
    expect(
      await pipeline(request({ method: 'POST', path: '/api/documents' }), emptyResponse()),
    ).toBeUndefined();

    // Session, no token.
    const rejected = await pipeline(
      request({ method: 'POST', path: '/api/documents', headers: { 'x-session': 'sess-1' } }),
      emptyResponse(),
    );
    expect(rejected?.status).toBe(403);
    expect(events.map((event) => event.name)).toContain('security.csrf.rejected');

    // Session and a matching token pair.
    const token = csrf.issue('sess-1');
    const accepted = await pipeline(
      request({
        method: 'POST',
        path: '/api/documents',
        headers: { 'x-session': 'sess-1', 'x-csrf-token': token.value },
        cookies: { '__Host-csrf': token.value },
      }),
      emptyResponse(),
    );
    expect(accepted).toBeUndefined();
  });

  it('rejects an untrusted origin before touching tokens', async () => {
    const { pipeline, events } = build({ trustedOrigins: ['https://app.munaxa.test'] });

    const rejected = await pipeline(
      request({ method: 'POST', headers: { origin: 'https://evil.test' } }),
      emptyResponse(),
    );
    expect(rejected?.status).toBe(403);
    expect(events.at(-1)?.detail).toMatchObject({ reason: 'untrusted-origin' });

    const accepted = await pipeline(
      request({ method: 'POST', headers: { origin: 'https://app.munaxa.test' } }),
      emptyResponse(),
    );
    expect(accepted).toBeUndefined();
  });

  it('records threat findings without blocking the request', async () => {
    const { pipeline, events } = build({ scanBodies: true });

    const result = await pipeline(
      request({ method: 'POST', body: { search: "' UNION SELECT password FROM users" } }),
      emptyResponse(),
    );

    expect(result).toBeUndefined();
    const threat = events.find((event) => event.name === 'security.threat.detected');
    expect(threat?.findings?.[0]?.kind).toBe('sql-injection');
  });

  it('attaches a per-response CSP nonce', async () => {
    const { pipeline } = build();
    const first = emptyResponse();
    const second = emptyResponse();
    await pipeline(request(), first);
    await pipeline(request(), second);

    const firstNonce = (first as { cspNonce?: string }).cspNonce;
    const secondNonce = (second as { cspNonce?: string }).cspNonce;
    expect(firstNonce).toBeDefined();
    expect(firstNonce).not.toBe(secondNonce);
    expect(first.headers['content-security-policy']).toContain(firstNonce as string);
  });
});

describe('rate limiting across dimensions', () => {
  it('limits per IP and per account independently', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [...BASELINE_RATE_LIMIT_RULES],
    });

    const attempt = (ipAddress: string, userId?: string) =>
      limiter.check({
        method: 'POST',
        path: '/api/auth/login',
        tenantId: ROOT_TENANT_ID,
        ipAddress,
        ...(userId === undefined ? {} : { userId }),
      });

    // Five attempts against one account exhausts the per-account rule first.
    for (let i = 0; i < 5; i++) expect((await attempt('198.51.100.1', 'ada')).allowed).toBe(true);
    expect((await attempt('198.51.100.1', 'ada')).rule).toBe('login-per-account');

    // A different account from the same address is still within the per-IP budget.
    expect((await attempt('198.51.100.1', 'grace')).allowed).toBe(true);
  });

  it('does not apply a per-user rule to an anonymous request', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [{ id: 'per-user', dimension: 'user', limit: 1, window: 60_000 }],
    });

    // No userId: the rule cannot apply, and must not silently become a global limit.
    for (let i = 0; i < 10; i++) {
      expect(
        (await limiter.check({ method: 'GET', path: '/', tenantId: ROOT_TENANT_ID, ipAddress: '1.1.1.1' }))
          .allowed,
      ).toBe(true);
    }
  });

  it('widens the window for a repeat offender', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [{ id: 'adaptive', dimension: 'ip', limit: 2, window: 60_000, adaptiveFactor: 2 }],
    });

    const hit = () =>
      limiter.check({ method: 'POST', path: '/', tenantId: ROOT_TENANT_ID, ipAddress: '198.51.100.9' });

    await hit();
    await hit();
    expect((await hit()).allowed).toBe(false);

    // A minute later the original window would have reset; the penalty window has not.
    clock.advance(61_000);
    expect((await hit()).allowed).toBe(false);
  });

  it('fails open when the store is unavailable, and says so', async () => {
    const clock = new FixedClock(0);
    const broken = {
      get: async () => undefined,
      set: async () => {},
      setIfAbsent: async () => true,
      delete: async () => false,
      has: async () => false,
      increment: async () => {
        throw new Error('redis down');
      },
      ttl: async () => undefined,
    };
    const degraded: string[] = [];
    const limiter = new RateLimiter({
      cache: broken,
      clock,
      rules: [{ id: 'per-ip', dimension: 'ip', limit: 1, window: 60_000 }],
      onDegraded: (_error, rule) => degraded.push(rule.id),
    });

    const decision = await limiter.check({
      method: 'POST',
      path: '/',
      tenantId: ROOT_TENANT_ID,
      ipAddress: '1.1.1.1',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
    expect(degraded).toEqual(['per-ip']);
  });

  it('lets an administrator clear a subject', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    const limiter = new RateLimiter({
      cache,
      clock,
      rules: [{ id: 'per-ip', dimension: 'ip', limit: 1, window: 60_000 }],
    });

    const hit = () =>
      limiter.check({ method: 'POST', path: '/', tenantId: ROOT_TENANT_ID, ipAddress: '203.0.113.5' });

    await hit();
    expect((await hit()).allowed).toBe(false);

    await limiter.reset('per-ip', ROOT_TENANT_ID, '203.0.113.5');
    expect((await hit()).allowed).toBe(true);
  });

  it('renders standard rate-limit headers', () => {
    const headers = rateLimitHeaders({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });
    expect(headers['ratelimit-limit']).toBe('10');
    expect(headers['retry-after']).toBe('30');
  });
});
