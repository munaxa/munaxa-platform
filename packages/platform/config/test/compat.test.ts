import { describe, expect, it } from 'vitest';
import { PLATFORM_SCHEMA, TENANT_OVERRIDABLE, parseConfig } from '../src/index.js';

/**
 * Environment variable names are an operational contract: they live in Helm charts, Terraform,
 * CI secrets and runbooks that this repository does not own. Renaming one does not break a build
 * — it breaks a deployment, at the worst possible moment, with the service falling back to a
 * default nobody chose. Additions are free; the assertions below are subset checks.
 */
const ENV_NAMES_1_0 = [
  'MUNAXA_SIGNING_SECRET',
  'MUNAXA_ENCRYPTION_KEY',
  'MUNAXA_ENV',
  'MUNAXA_PASSWORD_MIN_LENGTH',
  'MUNAXA_PASSWORD_HISTORY',
  'MUNAXA_SESSION_IDLE_TIMEOUT',
  'MUNAXA_SESSION_ABSOLUTE_TIMEOUT',
  'MUNAXA_SESSION_MAX_CONCURRENT',
  'MUNAXA_ACCESS_TOKEN_TTL',
  'MUNAXA_REFRESH_TOKEN_TTL',
  'MUNAXA_LOGIN_MAX_ATTEMPTS',
  'MUNAXA_LOGIN_LOCKOUT',
  'MUNAXA_LOG_LEVEL',
  'MUNAXA_AUDIT_ENABLED',
];

const DEFAULTS_1_0: Readonly<Record<string, unknown>> = {
  MUNAXA_PASSWORD_MIN_LENGTH: 12,
  MUNAXA_PASSWORD_HISTORY: 5,
  MUNAXA_SESSION_IDLE_TIMEOUT: 900_000,
  MUNAXA_SESSION_ABSOLUTE_TIMEOUT: 43_200_000,
  MUNAXA_SESSION_MAX_CONCURRENT: 10,
  MUNAXA_ACCESS_TOKEN_TTL: 900_000,
  MUNAXA_REFRESH_TOKEN_TTL: 2_592_000_000,
  MUNAXA_LOGIN_MAX_ATTEMPTS: 10,
  MUNAXA_LOGIN_LOCKOUT: 900_000,
  MUNAXA_AUDIT_ENABLED: true,
};

describe('1.0 environment contract', () => {
  it.each(ENV_NAMES_1_0)('%s still exists', (name) => {
    expect(Object.keys(PLATFORM_SCHEMA)).toContain(name);
  });

  it('keeps 1.0 defaults, so an unchanged deployment behaves identically', () => {
    const config = parseConfig(PLATFORM_SCHEMA, {
      MUNAXA_SIGNING_SECRET: 's'.repeat(48),
      MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43),
    }) as Record<string, unknown>;

    for (const [name, value] of Object.entries(DEFAULTS_1_0)) {
      expect(config[name], name).toBe(value);
    }
  });

  it('still accepts duration values written in unit syntax', () => {
    const config = parseConfig(PLATFORM_SCHEMA, {
      MUNAXA_SIGNING_SECRET: 's'.repeat(48),
      MUNAXA_ENCRYPTION_KEY: 'e'.repeat(43),
      MUNAXA_SESSION_IDLE_TIMEOUT: '30m',
      MUNAXA_REFRESH_TOKEN_TTL: '30d',
    });
    expect(config.MUNAXA_SESSION_IDLE_TIMEOUT).toBe(1_800_000);
    expect(config.MUNAXA_REFRESH_TOKEN_TTL).toBe(2_592_000_000);
  });

  it('keeps the tenant-overridable key names stable', () => {
    for (const key of ['password.minLength', 'session.idleTimeout', 'mfa.required']) {
      expect(TENANT_OVERRIDABLE).toContain(key);
    }
  });
});
