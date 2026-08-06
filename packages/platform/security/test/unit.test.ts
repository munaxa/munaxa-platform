import { describe, expect, it } from 'vitest';
import { KeyRing, secureBytes } from '@munaxa/crypto';
import { FixedClock, ROOT_TENANT_ID, isPlatformError, type PlatformRequest } from '@munaxa/types';
import {
  CsrfProtection,
  DEFAULT_CSP,
  RiskEngine,
  apiSecurityHeaders,
  bounded,
  escapeHtml,
  hasTraversal,
  inspectPath,
  isTrustedOrigin,
  normalizeEmail,
  normalizeHeaderValue,
  normalizeIdentifier,
  normalizePath,
  normalizePhone,
  normalizeText,
  renderCsp,
  safeRedirect,
  scanForThreats,
  securityHeaders,
  threatScore,
} from '../src/index.js';

describe('security headers', () => {
  it('emits a strict CSP with a per-response nonce', () => {
    const first = securityHeaders();
    const second = securityHeaders();

    const csp = first.headers['content-security-policy'] as string;
    expect(csp).toContain(`'nonce-${first.nonce}'`);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(first.nonce).not.toBe(second.nonce);
  });

  it('sets the rest of the header set', () => {
    const { headers } = securityHeaders();
    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['x-xss-protection']).toBe('0');
  });

  it('omits HSTS when max-age is zero', () => {
    expect(securityHeaders({ hstsMaxAge: 0 }).headers['strict-transport-security']).toBeUndefined();
  });

  it('only adds preload when asked', () => {
    expect(securityHeaders().headers['strict-transport-security']).not.toContain('preload');
    expect(securityHeaders({ hstsPreload: true }).headers['strict-transport-security']).toContain(
      'preload',
    );
  });

  it('supports report-only rollout', () => {
    const { headers } = securityHeaders({ cspReportOnly: true, reportUri: 'https://r.test/csp' });
    expect(headers['content-security-policy-report-only']).toContain(
      'report-uri https://r.test/csp',
    );
    expect(headers['content-security-policy']).toBeUndefined();
  });

  it('merges caller directives over the defaults', () => {
    const { headers } = securityHeaders({ csp: { 'connect-src': ["'self'", 'https://api.test'] } });
    expect(headers['content-security-policy']).toContain("connect-src 'self' https://api.test");
  });

  it('renders boolean directives without a value', () => {
    expect(renderCsp({ 'upgrade-insecure-requests': true })).toBe('upgrade-insecure-requests');
    expect(DEFAULT_CSP['upgrade-insecure-requests']).toBe(true);
  });

  it('serves no-store headers for an API', () => {
    const headers = apiSecurityHeaders();
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
  });
});

describe('CSRF', () => {
  const build = () => {
    const clock = new FixedClock(1_000);
    const csrf = new CsrfProtection({
      keyRing: new KeyRing({ kid: 'k1', key: secureBytes(32) }),
      clock,
      ttl: 60_000,
    });
    return { csrf, clock };
  };

  it('issues a token bound to the session', () => {
    const { csrf } = build();
    const token = csrf.issue('sess-1');

    expect(csrf.verify(token.value, 'sess-1')).toBe(true);
    expect(csrf.verify(token.value, 'sess-2')).toBe(false);
  });

  it('sets a cookie the front end can read, on a __Host- name', () => {
    const { csrf } = build();
    const { cookie } = csrf.issue('sess-1');

    expect(cookie.name).toBe('__Host-csrf');
    expect(cookie.options.secure).toBe(true);
    expect(cookie.options.sameSite).toBe('strict');
    expect(cookie.options.path).toBe('/');
    // Not httpOnly on purpose: the token has to be echoed back by the client.
    expect(cookie.options.httpOnly).toBe(false);
  });

  it('expires', () => {
    const { csrf, clock } = build();
    const token = csrf.issue('sess-1');
    clock.advance(60_001);
    expect(csrf.verify(token.value, 'sess-1')).toBe(false);
  });

  it('rejects a forged or absent token', () => {
    const { csrf } = build();
    expect(csrf.verify(undefined, 'sess-1')).toBe(false);
    expect(csrf.verify('garbage', 'sess-1')).toBe(false);
    expect(csrf.verify('a.b.c', 'sess-1')).toBe(false);
  });

  it('checks both copies on a state-changing request', () => {
    const { csrf } = build();
    const token = csrf.issue('sess-1');

    const request = (
      headers: Record<string, string>,
      cookies: Record<string, string>,
    ): PlatformRequest => ({
      method: 'POST',
      path: '/api/documents',
      headers,
      cookies,
    });

    expect(() =>
      csrf.check(
        request({ 'x-csrf-token': token.value }, { '__Host-csrf': token.value }),
        'sess-1',
      ),
    ).not.toThrow();

    // Header present, cookie absent.
    expect(() => csrf.check(request({ 'x-csrf-token': token.value }, {}), 'sess-1')).toThrow();
    // Mismatched copies.
    expect(() =>
      csrf.check(request({ 'x-csrf-token': token.value }, { '__Host-csrf': 'other' }), 'sess-1'),
    ).toThrow();
  });

  it('skips safe methods', () => {
    const { csrf } = build();
    expect(csrf.isSafeMethod('get')).toBe(true);
    expect(csrf.isSafeMethod('POST')).toBe(false);
    expect(() => csrf.check({ method: 'GET', path: '/', headers: {} }, 'sess-1')).not.toThrow();
  });

  it('raises a typed error', () => {
    const { csrf } = build();
    try {
      csrf.check({ method: 'POST', path: '/', headers: {} }, 'sess-1');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      expect((error as { code: string }).code).toBe('SECURITY_CSRF_INVALID');
    }
  });

  it('checks the request origin', () => {
    const trusted = ['https://app.munaxa.test'];
    const request = (headers: Record<string, string>): PlatformRequest => ({
      method: 'POST',
      path: '/',
      headers,
    });

    expect(isTrustedOrigin(request({ origin: 'https://app.munaxa.test' }), trusted)).toBe(true);
    expect(isTrustedOrigin(request({ origin: 'https://evil.test' }), trusted)).toBe(false);
    expect(isTrustedOrigin(request({ referer: 'https://app.munaxa.test/page' }), trusted)).toBe(
      true,
    );
    expect(isTrustedOrigin(request({}), trusted)).toBe(false);
  });
});

describe('normalization', () => {
  it('folds compatibility characters and strips invisibles', () => {
    expect(normalizeText('Ａdmin')).toBe('Admin');
    expect(normalizeText('ad\u200bmin')).toBe('admin');
    expect(normalizeText('  spaced  ')).toBe('spaced');
    expect(normalizeText('bad\u0000value')).toBe('badvalue');
  });

  it('normalizes emails for lookup without inventing aliases', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    // Plus-tags and dots are preserved: treating them as equal collides distinct mailboxes.
    expect(normalizeEmail('ada+news@example.com')).toBe('ada+news@example.com');
    expect(normalizeEmail('a.b@example.com')).toBe('a.b@example.com');
  });

  it('normalizes identifiers and phone numbers', () => {
    expect(normalizeIdentifier('  Ada   Lovelace ')).toBe('ada lovelace');
    expect(normalizePhone('+44 (0)20 7946 0958')).toBe('+4402079460958');
  });

  it('strips CR and LF from header values', () => {
    expect(normalizeHeaderValue('value\r\nSet-Cookie: admin=1')).toBe('valueSet-Cookie: admin=1');
    expect(normalizeHeaderValue('x'.repeat(5_000)).length).toBe(1_024);
  });

  it('flattens paths and detects traversal', () => {
    expect(normalizePath('/a/b/../c')).toBe('/a/c');
    expect(normalizePath('/a//b/./c/')).toBe('/a/b/c');
    expect(normalizePath('/%2e%2e/etc/passwd')).toBe('/etc/passwd');
    expect(hasTraversal('/a/../b')).toBe(true);
    expect(hasTraversal('/a/b')).toBe(false);
    expect(hasTraversal('/%2e%2e/b')).toBe(true);
  });

  it('bounds and escapes', () => {
    expect(bounded('abcdef', 3)).toBe('abc');
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });

  it('refuses an off-origin redirect', () => {
    const allowed = ['https://app.munaxa.test'];
    expect(safeRedirect('/dashboard', allowed)).toBe('/dashboard');
    expect(safeRedirect('https://app.munaxa.test/x', allowed)).toBe('https://app.munaxa.test/x');
    expect(safeRedirect('https://evil.test', allowed)).toBe('/');
    expect(safeRedirect('//evil.test', allowed)).toBe('/');
    expect(safeRedirect('javascript:alert(1)', allowed)).toBe('/');
    expect(safeRedirect('/\\evil.test', allowed)).toBe('/');
    expect(safeRedirect('', allowed)).toBe('/');
  });
});

describe('threat detection', () => {
  it.each([
    ['sql-injection', "1' OR '1'='1"],
    ['sql-injection', 'x UNION SELECT password FROM users'],
    ['xss', '<script>alert(1)</script>'],
    ['xss', '<img src=x onerror=alert(1)>'],
    ['path-traversal', '../../etc/passwd'],
    ['command-injection', '; cat /etc/passwd'],
    ['template-injection', '{{constructor.constructor("return process")()}}'],
    ['header-injection', 'x\r\nSet-Cookie: admin=1'],
  ])('flags %s', (kind, payload) => {
    const findings = scanForThreats({ field: payload });
    expect(findings.map((finding) => finding.kind)).toContain(kind);
  });

  it.each([
    'Select a plan to continue',
    'I love the union of maths and art',
    'Ada Lovelace <ada@example.com>',
    'C:\\Users\\ada\\notes.txt',
    'price > 100 and price < 200',
  ])('does not flag the benign string %j', (payload) => {
    expect(scanForThreats({ field: payload })).toEqual([]);
  });

  it('skips fields that legitimately contain anything', () => {
    expect(scanForThreats({ password: "' OR 1=1--" })).toEqual([]);
    expect(scanForThreats({ content: '<script>example</script>' })).toEqual([]);
  });

  it('reports the location and a bounded excerpt', () => {
    const findings = scanForThreats({ user: { note: `${'<script>'}${'x'.repeat(500)}` } }, 'body');
    expect(findings[0]?.location).toBe('body.user.note');
    expect(findings[0]?.excerpt.length ?? 0).toBeLessThanOrEqual(120);
  });

  it('scores by highest confidence', () => {
    expect(threatScore([])).toBe(0);
    expect(threatScore(scanForThreats({ q: 'x\r\nSet-Cookie: a=1' }))).toBe(90);
  });

  it('inspects a path directly', () => {
    expect(inspectPath('/api/files/../../etc/passwd')?.kind).toBe('path-traversal');
    expect(inspectPath('/api/files/report.pdf')).toBeUndefined();
  });
});

describe('risk engine', () => {
  const engine = new RiskEngine();

  it('allows a familiar, trusted device', async () => {
    const assessment = await engine.assess({
      tenantId: ROOT_TENANT_ID,
      deviceKnown: true,
      deviceTrusted: true,
      country: 'GB',
      previousCountry: 'GB',
      userAgent: 'Mozilla/5.0',
    });
    expect(assessment.decision).toBe('allow');
    expect(assessment.score).toBe(0);
  });

  it('challenges a brand-new device', async () => {
    const assessment = await engine.assess({ tenantId: ROOT_TENANT_ID, userAgent: 'Mozilla/5.0' });
    expect(assessment.score).toBeGreaterThanOrEqual(35);
    expect(assessment.decision).toBe('challenge');
    expect(assessment.reasons).toContain('new-device');
  });

  it('denies the shape of credential stuffing', async () => {
    const assessment = await engine.assess({
      tenantId: ROOT_TENANT_ID,
      distinctAccountsFromIp: 25,
      recentFailures: 8,
      userAgent: 'python-requests/2.31',
    });
    expect(assessment.decision).toBe('deny');
    expect(assessment.reasons).toContain('distinct-accounts-from-ip');
  });

  it('flags impossible travel', async () => {
    const assessment = await engine.assess({
      tenantId: ROOT_TENANT_ID,
      deviceKnown: true,
      country: 'JP',
      previousCountry: 'GB',
      minutesSincePreviousLogin: 20,
      userAgent: 'Mozilla/5.0',
    });
    expect(assessment.reasons).toContain('impossible-travel');
    expect(assessment.decision).not.toBe('allow');
  });

  it('does not fail a login because a signal threw', async () => {
    const brittle = new RiskEngine({
      signals: [
        {
          name: 'brittle',
          weight: 100,
          evaluate: () => {
            throw new Error('geoip lookup failed');
          },
        },
      ],
    });
    const assessment = await brittle.assess({ tenantId: ROOT_TENANT_ID });
    expect(assessment.score).toBe(0);
    expect(assessment.decision).toBe('allow');
  });

  it('clamps a misbehaving signal instead of letting it dominate', async () => {
    const engineWithLiar = new RiskEngine({
      signals: [{ name: 'liar', weight: 100, evaluate: () => 10_000 }],
    });
    expect((await engineWithLiar.assess({ tenantId: ROOT_TENANT_ID })).score).toBe(100);
  });
});
