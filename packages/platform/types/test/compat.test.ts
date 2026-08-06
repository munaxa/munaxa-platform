import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ROOT_TENANT_ID, SECURITY_EVENTS, parseDuration } from '../src/index.js';

/**
 * The compatibility floor for `@munaxa/types`.
 *
 * Everything asserted here is consumed by name across the ecosystem: event names end up in SIEM
 * rules and dashboards, error codes end up in client-side error handling, and `ROOT_TENANT_ID`
 * ends up in the rows of every single-tenant deployment. Removing or renaming any of them is a
 * major version, and this file is where that decision gets made deliberately instead of by
 * accident. Additions are free — the assertions are subset checks.
 */

const EVENTS_1_0 = [
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.logout.succeeded',
  'auth.password.changed',
  'auth.password.reset.requested',
  'auth.password.reset.completed',
  'auth.mfa.enrolled',
  'auth.mfa.failed',
  'auth.token.refreshed',
  'auth.token.reuse.detected',
  'authz.permission.denied',
  'session.created',
  'session.revoked',
  'security.ratelimit.exceeded',
  'security.policy.changed',
] as const;

const CODES_1_0 = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_MFA_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_REUSED',
  'AUTHZ_PERMISSION_DENIED',
  'SESSION_EXPIRED',
  'SECURITY_RATE_LIMITED',
] as const;

describe('1.0 surface', () => {
  it('still publishes every 1.0 security event name', () => {
    for (const name of EVENTS_1_0) {
      expect(SECURITY_EVENTS, name).toContain(name);
    }
  });

  it('still publishes every 1.0 error code', () => {
    for (const code of CODES_1_0) {
      expect(ERROR_CODES, code).toContain(code);
    }
  });

  it('keeps the implicit single-tenant identifier stable', () => {
    // Changing this string orphans every row written by a single-tenant deployment.
    expect(ROOT_TENANT_ID).toBe('root');
  });

  it('keeps duration syntax stable', () => {
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration(900_000)).toBe(900_000);
  });

  it('has no duplicate event names', () => {
    expect(new Set(SECURITY_EVENTS).size).toBe(SECURITY_EVENTS.length);
  });
});
