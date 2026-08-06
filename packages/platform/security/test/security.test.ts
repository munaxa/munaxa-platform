import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import { KeyRing, secureBytes } from '@munaxa/crypto';
import { FixedClock, ROOT_TENANT_ID, toTenantId, type PlatformRequest } from '@munaxa/types';
import {
  CsrfProtection,
  RateLimiter,
  normalizeEmail,
  normalizeHeaderValue,
  normalizePath,
  normalizeText,
  safeRedirect,
  scanForThreats,
  securityHeaders,
} from '../src/index.js';

describe('CSP is restrictive by default', () => {
  it('permits no inline or eval execution', () => {
    const csp = securityHeaders().headers['content-security-policy'] as string;
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('cannot have its nonce guessed or reused', () => {
    const nonces = new Set(Array.from({ length: 1_000 }, () => securityHeaders().nonce));
    expect(nonces.size).toBe(1_000);
    // 16 bytes of CSPRNG output, base64url — no timestamp, no counter, nothing derivable.
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('keeps a caller-supplied directive from removing the nonce', () => {
    const { headers, nonce } = securityHeaders({ csp: { 'script-src': ["'self'", 'https://cdn.test'] } });
    expect(headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
  });
});

describe('CSRF resists a cookie-writing attacker', () => {
  const keyRing = new KeyRing({ kid: 'k1', key: secureBytes(32) });

  it('rejects a token an attacker planted in both places', () => {
    const csrf = new CsrfProtection({ keyRing });
    const planted = 'attacker-chosen-value';

    const request: PlatformRequest = {
      method: 'POST',
      path: '/api/transfer',
      headers: { 'x-csrf-token': planted },
      cookies: { '__Host-csrf': planted },
    };

    // Both copies match, which is all a plain double-submit checks. The signature is what fails.
    expect(() => csrf.check(request, 'sess-1')).toThrow(/invalid|expired/i);
  });

  it('rejects a valid token minted for a different session', () => {
    const csrf = new CsrfProtection({ keyRing });
    const attackersToken = csrf.issue('attacker-session');

    const request: PlatformRequest = {
      method: 'POST',
      path: '/api/transfer',
      headers: { 'x-csrf-token': attackersToken.value },
      cookies: { '__Host-csrf': attackersToken.value },
    };

    expect(() => csrf.check(request, 'victim-session')).toThrow();
  });

  it('rejects a token signed with a key the ring never held', () => {
    const ours = new CsrfProtection({ keyRing });
    const theirs = new CsrfProtection({ keyRing: new KeyRing({ kid: 'k1', key: secureBytes(32) }) });
    const forged = theirs.issue('sess-1');

    expect(ours.verify(forged.value, 'sess-1')).toBe(false);
  });

  it('does not accept an expired token even with matching copies', () => {
    const clock = new FixedClock(0);
    const csrf = new CsrfProtection({ keyRing, clock, ttl: 1_000 });
    const token = csrf.issue('sess-1');
    clock.advance(1_001);

    expect(csrf.verify(token.value, 'sess-1')).toBe(false);
  });
});

describe('rate limiting is per tenant and per subject', () => {
  it('does not let one tenant exhaust another’s budget', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [{ id: 'per-ip', dimension: 'ip', limit: 2, window: 60_000 }],
    });

    const hit = (tenantId: string) =>
      limiter.check({
        method: 'POST',
        path: '/',
        tenantId: toTenantId(tenantId),
        ipAddress: '198.51.100.1',
      });

    await hit('acme');
    await hit('acme');
    expect((await hit('acme')).allowed).toBe(false);
    expect((await hit('globex')).allowed).toBe(true);
  });

  it('cannot be evaded by varying the path when the rule is per IP', async () => {
    const clock = new FixedClock(0);
    const limiter = new RateLimiter({
      cache: new MemoryCache({ clock }),
      clock,
      rules: [{ id: 'per-ip', dimension: 'ip', limit: 3, window: 60_000 }],
    });

    for (let i = 0; i < 3; i++) {
      await limiter.check({
        method: 'POST',
        path: `/api/resource/${i}`,
        tenantId: ROOT_TENANT_ID,
        ipAddress: '198.51.100.1',
      });
    }

    expect(
      (
        await limiter.check({
          method: 'POST',
          path: '/api/somewhere/else',
          tenantId: ROOT_TENANT_ID,
          ipAddress: '198.51.100.1',
        })
      ).allowed,
    ).toBe(false);
  });
});

describe('normalization closes evasion routes', () => {
  it('folds homoglyph and zero-width tricks before comparison', () => {
    // Two strings that render identically must not become two different accounts.
    expect(normalizeText('ａdmin')).toBe('admin');
    expect(normalizeText('ad​min')).toBe('admin');
    expect(normalizeText('admin‮')).toBe('admin');
    expect(normalizeEmail('ADMIN@Example.COM')).toBe('admin@example.com');
  });

  it('does not fold two genuinely different addresses together', () => {
    // Stripping plus-tags or dots would collide distinct mailboxes on most providers.
    expect(normalizeEmail('a.b@example.com')).not.toBe(normalizeEmail('ab@example.com'));
    expect(normalizeEmail('ada+x@example.com')).not.toBe(normalizeEmail('ada@example.com'));
  });

  it('flattens encoded traversal', () => {
    expect(normalizePath('/files/%2e%2e/%2e%2e/etc/passwd')).toBe('/etc/passwd');
    expect(normalizePath('/files/..\\..\\windows')).toBe('/windows');
  });

  it('decodes only once, so double encoding does not become an opening', () => {
    // %25%32%65 decodes to %2e, which decodes to '.'. Decoding until stable would treat this as
    // traversal-free after flattening; one pass leaves it visible and harmless.
    expect(normalizePath('/a/%25%32%65%25%32%65/b')).toBe('/a/%2e%2e/b');
  });

  it('removes CR and LF that would split a response header', () => {
    expect(normalizeHeaderValue('en-GB\r\nX-Admin: true')).not.toContain('\r');
    expect(normalizeHeaderValue('en-GB\nX-Admin: true')).not.toContain('\n');
  });

  it('refuses redirect targets that only look relative', () => {
    const allowed = ['https://app.test'];
    for (const target of ['//evil.test', '/\\evil.test', 'https:evil.test', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(safeRedirect(target, allowed), target).toBe('/');
    }
  });
});

describe('threat scanning is bounded', () => {
  it('does not recurse without limit on a deeply nested body', () => {
    let deep: Record<string, unknown> = { value: "' OR 1=1--" };
    for (let i = 0; i < 1_000; i++) deep = { nested: deep };

    const start = performance.now();
    scanForThreats(deep, 'body');
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('truncates a huge value rather than matching against all of it', () => {
    const findings = scanForThreats({ q: `${'a'.repeat(100_000)}<script>` });
    // Beyond the scan bound, so it is not reported — the bound is the point, and it is documented.
    expect(findings).toEqual([]);
  });

  it('caps how many array entries it walks', () => {
    const findings = scanForThreats({
      items: [...Array.from({ length: 500 }, () => 'benign'), '<script>alert(1)</script>'],
    });
    expect(findings).toEqual([]);
  });
});
