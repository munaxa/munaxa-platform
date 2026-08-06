import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import { KeyRing, secureBytes } from '@munaxa/crypto';
import { FixedClock, ROOT_TENANT_ID, emptyResponse } from '@munaxa/types';
import {
  /**
   * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
   * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
   * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
   * what they are for.
   */
  BASELINE_RATE_LIMIT_RULES,
  CsrfProtection,
  RateLimiter,
  RiskEngine,
  normalizeEmail,
  normalizePath,
  scanForThreats,
  securityHeaders,
  securityPipeline,
} from '../src/index.js';

/**
 * Everything here runs before the application does any work, on every request. A slow edge is
 * a slow product, and a slow edge is also the thing that gets disabled "temporarily".
 */
describe('per-request cost', () => {
  it('renders the header set in microseconds', () => {
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) securityHeaders();
    // Includes a fresh CSPRNG nonce per call, which is the dominant cost and is not optional.
    expect((performance.now() - start) / 20_000).toBeLessThan(0.1);
  });

  it('checks a rate limit in a couple of cache operations', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [...BASELINE_RATE_LIMIT_RULES],
    });

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      await limiter.check({
        method: 'GET',
        path: '/api/documents',
        tenantId: ROOT_TENANT_ID,
        ipAddress: `198.51.100.${i % 250}`,
        userId: `user-${i % 500}`,
      });
    }
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('issues and verifies CSRF tokens cheaply', () => {
    const csrf = new CsrfProtection({ keyRing: new KeyRing({ kid: 'k1', key: secureBytes(32) }) });
    const token = csrf.issue('sess-1');

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) csrf.verify(token.value, 'sess-1');
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('normalizes at well over 100k/s', () => {
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) {
      normalizeEmail('Ada.Lovelace+news@Example.COM');
      normalizePath('/a/b/../c/./d');
    }
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('scores risk without I/O', async () => {
    const engine = new RiskEngine();
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      await engine.assess({
        tenantId: ROOT_TENANT_ID,
        deviceKnown: true,
        country: 'GB',
        previousCountry: 'GB',
        userAgent: 'Mozilla/5.0',
      });
    }
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});

describe('threat scanning cost', () => {
  it('scans a realistic body without dominating the request', () => {
    const body = {
      title: 'Quarterly report',
      tags: ['finance', 'q3', 'draft'],
      author: { name: 'Ada Lovelace', email: 'ada@example.com' },
      note: 'Please review before Friday.',
    };

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) scanForThreats(body, 'body');
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('does not backtrack catastrophically on a hostile string', () => {
    // Each detector pattern is bounded; a long near-match must stay linear.
    const hostile = `${'a'.repeat(20_000)}<scrip`;
    const start = performance.now();
    for (let i = 0; i < 200; i++) scanForThreats({ q: hostile });
    expect(performance.now() - start).toBeLessThan(2_500);
  });
});

describe('whole-pipeline cost', () => {
  it('runs the full edge in well under a millisecond', async () => {
    const clock = new FixedClock(0);
    const cache = new MemoryCache({ clock });
    const pipeline = securityPipeline({
      rateLimiter: new RateLimiter({ cache, clock, rules: [...BASELINE_RATE_LIMIT_RULES] }),
      csrf: new CsrfProtection({
        keyRing: new KeyRing({ kid: 'k1', key: secureBytes(32) }),
        clock,
      }),
      resolveTenant: () => ROOT_TENANT_ID,
      scanBodies: true,
    });

    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      await pipeline(
        {
          method: 'GET',
          path: '/api/documents',
          headers: { 'user-agent': 'Mozilla/5.0' },
          ipAddress: `198.51.100.${i % 200}`,
          query: { page: '2' },
        },
        emptyResponse(),
      );
    }
    expect((performance.now() - start) / 10_000).toBeLessThan(1);
  });
});
