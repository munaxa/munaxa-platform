import { describe, expect, it } from 'vitest';
import { KeyRing } from '@munaxa/crypto';
import { FixedClock } from '@munaxa/types';
import {
  BASELINE_RATE_LIMIT_RULES,
  CsrfProtection,
  DEFAULT_CSP,
  DEFAULT_PERMISSIONS_POLICY,
  normalizeEmail,
  normalizePath,
  securityHeaders,
} from '../src/index.js';

/**
 * Two things here are contracts with the outside world rather than internal choices: the header
 * names and values a browser enforces, and the CSRF token format a deployed front end already
 * holds in a cookie. Changing the second mid-deploy makes every in-flight form submission fail.
 */
describe('1.0 header contract', () => {
  it('keeps the header names', () => {
    const { headers } = securityHeaders();
    for (const name of [
      'content-security-policy',
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'cross-origin-opener-policy',
      'cross-origin-resource-policy',
      'permissions-policy',
    ]) {
      expect(headers[name], name).toBeDefined();
    }
  });

  it('keeps the default CSP directives that products build markup against', () => {
    for (const directive of ['default-src', 'script-src', 'object-src', 'base-uri', 'frame-ancestors']) {
      expect(DEFAULT_CSP[directive], directive).toBeDefined();
    }
    expect(DEFAULT_CSP['object-src']).toEqual(["'none'"]);
  });

  it('keeps every capability in the permissions policy denied by default', () => {
    for (const [feature, origins] of Object.entries(DEFAULT_PERMISSIONS_POLICY)) {
      if (feature === 'fullscreen' || feature === 'publickey-credentials-get') continue;
      expect(origins, feature).toEqual([]);
    }
  });
});

describe('1.0 CSRF token format', () => {
  const keyRing = new KeyRing({ kid: 'k_test', key: Buffer.alloc(32, 7) });

  it('keeps the three-part signed shape', () => {
    const csrf = new CsrfProtection({ keyRing, clock: new FixedClock(1_000) });
    expect(csrf.issue('sess-1').value.split('.')).toHaveLength(3);
  });

  it('verifies a token issued by 1.0 with the same key', () => {
    const clock = new FixedClock(1_000);
    const issuing = new CsrfProtection({ keyRing, clock, ttl: 60_000 });
    const token = issuing.issue('sess-1');

    // A different instance — a different process, mid-deploy — must accept it.
    const verifying = new CsrfProtection({ keyRing, clock, ttl: 60_000 });
    expect(verifying.verify(token.value, 'sess-1')).toBe(true);
  });

  it('keeps the cookie and header names', () => {
    const csrf = new CsrfProtection({ keyRing });
    expect(csrf.cookieName).toBe('__Host-csrf');
    expect(csrf.headerName).toBe('x-csrf-token');
  });
});

describe('1.0 rate-limit rules', () => {
  it('keeps the rule ids operators alert on', () => {
    expect(BASELINE_RATE_LIMIT_RULES.map((rule) => rule.id)).toEqual([
      'login-per-ip',
      'login-per-account',
      'password-reset-per-ip',
      'mfa-verify-per-session',
      'api-per-user',
      'api-per-ip',
    ]);
  });

  it('does not loosen the authentication limits', () => {
    const byId = new Map(BASELINE_RATE_LIMIT_RULES.map((rule) => [rule.id, rule]));
    expect(byId.get('login-per-ip')?.limit).toBeLessThanOrEqual(10);
    expect(byId.get('login-per-account')?.limit).toBeLessThanOrEqual(5);
    expect(byId.get('password-reset-per-ip')?.limit).toBeLessThanOrEqual(5);
  });
});

describe('1.0 normalization behaviour', () => {
  it('keeps email normalization non-lossy', () => {
    // A change here silently merges or splits accounts on the next login.
    expect(normalizeEmail('Ada+news@Example.com')).toBe('ada+news@example.com');
    expect(normalizeEmail('a.b@example.com')).toBe('a.b@example.com');
  });

  it('keeps path flattening stable', () => {
    expect(normalizePath('/a/b/../c')).toBe('/a/c');
    expect(normalizePath('//a//b//')).toBe('/a/b');
  });
});
