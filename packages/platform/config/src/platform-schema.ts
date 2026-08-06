import { boolean, duration, integer, list, oneOf, secret, string, url } from './schema.js';

/**
 * The environment schema the security platform itself reads.
 *
 * Products extend it with their own fields; they do not redefine these. Every default here is the
 * secure one, so an application that sets nothing beyond the two required secrets still gets
 * 12-character passwords, breach checking, 15-minute idle sessions, rotation-and-reuse detection
 * on refresh tokens and HSTS.
 */
export const PLATFORM_SCHEMA = {
  /** Signing key for access tokens and cookies. 32+ chars; rotate through the key ring, not here. */
  MUNAXA_SIGNING_SECRET: secret({
    description: 'Primary signing secret for JWTs, cookies and CSRF tokens',
  }),
  /** Encryption key for data at rest (MFA secrets, stored provider tokens). */
  MUNAXA_ENCRYPTION_KEY: secret({
    description: 'Base64url-encoded 32-byte key for AES-256-GCM field encryption',
  }),
  MUNAXA_KEY_ID: string({ default: 'k1', description: 'Key id written into new envelopes' }),

  MUNAXA_ENV: oneOf(['development', 'test', 'staging', 'production'], { default: 'production' }),
  MUNAXA_TENANCY: oneOf(['single', 'multi'], { default: 'single' }),

  // Passwords
  MUNAXA_PASSWORD_MIN_LENGTH: integer({ default: 12, min: 12 }),
  MUNAXA_PASSWORD_HISTORY: integer({ default: 5, min: 0, max: 50 }),
  MUNAXA_PASSWORD_BREACH_CHECK: boolean({ default: true }),
  MUNAXA_PASSWORD_MAX_AGE: duration({ default: 0, description: '0 disables forced rotation' }),

  // Sessions
  MUNAXA_SESSION_IDLE_TIMEOUT: duration({ default: 900_000 }),
  MUNAXA_SESSION_ABSOLUTE_TIMEOUT: duration({ default: 43_200_000 }),
  MUNAXA_SESSION_MAX_CONCURRENT: integer({ default: 10, min: 1 }),

  // Tokens
  MUNAXA_ACCESS_TOKEN_TTL: duration({ default: 900_000 }),
  MUNAXA_REFRESH_TOKEN_TTL: duration({ default: 2_592_000_000 }),
  MUNAXA_TOKEN_ISSUER: string({ default: 'munaxa' }),
  MUNAXA_TOKEN_AUDIENCE: list({ default: [] }),

  // Login protection
  MUNAXA_LOGIN_MAX_ATTEMPTS: integer({ default: 10, min: 1 }),
  MUNAXA_LOGIN_LOCKOUT: duration({ default: 900_000 }),
  MUNAXA_MFA_REQUIRED: boolean({ default: false }),

  // Edge
  MUNAXA_HSTS_MAX_AGE: duration({ default: 31_536_000_000 }),
  MUNAXA_CSP_REPORT_URI: url({ default: '', protocols: ['https:'] }),
  MUNAXA_TRUSTED_ORIGINS: list({ default: [] }),

  // Infrastructure
  MUNAXA_REDIS_URL: string({ default: '', description: 'Empty selects the in-process cache' }),
  MUNAXA_LOG_LEVEL: oneOf(['trace', 'debug', 'info', 'warn', 'error', 'fatal'], { default: 'info' }),
  MUNAXA_AUDIT_ENABLED: boolean({ default: true }),
} as const;

/**
 * Settings a tenant or an administrator may override, and the key each is stored under in
 * `LayeredConfig`. Anything not on this list is deployment-wide by design — a tenant cannot turn
 * off audit logging or weaken the platform's cryptography.
 */
export const TENANT_OVERRIDABLE = [
  'password.minLength',
  'password.historyCount',
  'password.maxAge',
  'password.requireBreachCheck',
  'session.idleTimeout',
  'session.absoluteTimeout',
  'session.maxConcurrent',
  'mfa.required',
  'login.maxAttempts',
  'login.lockoutDuration',
] as const;

export type TenantOverridableKey = (typeof TENANT_OVERRIDABLE)[number];

export function isTenantOverridable(key: string): key is TenantOverridableKey {
  return (TENANT_OVERRIDABLE as readonly string[]).includes(key);
}
