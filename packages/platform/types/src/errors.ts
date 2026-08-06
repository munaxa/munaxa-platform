/**
 * The platform error taxonomy.
 *
 * Two rules make these errors safe to surface:
 *
 * 1. `code` is stable and machine-readable; `message` is for engineers and may change.
 * 2. `publicMessage` is the only text that may reach an end user. It never distinguishes
 *    "no such account" from "wrong password", never names an internal system, and never echoes
 *    attacker-supplied input.
 */

export const ERROR_CODES = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_ACCOUNT_DISABLED',
  'AUTH_MFA_REQUIRED',
  'AUTH_MFA_INVALID',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_REUSED',
  'AUTH_PASSWORD_POLICY',
  'AUTH_PASSWORD_BREACHED',
  'AUTH_PASSWORD_REUSED',
  'AUTH_RESET_TOKEN_INVALID',
  'AUTH_PROVIDER_ERROR',
  'AUTHZ_PERMISSION_DENIED',
  'AUTHZ_ROLE_UNKNOWN',
  'AUTHZ_POLICY_DENIED',
  'SESSION_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_LIMIT_REACHED',
  'SECURITY_RATE_LIMITED',
  'SECURITY_CSRF_INVALID',
  'SECURITY_RISK_BLOCKED',
  'SECURITY_THREAT_DETECTED',
  'CONFIG_INVALID',
  'CRYPTO_KEY_UNKNOWN',
  'CRYPTO_VERIFICATION_FAILED',
  'TENANT_MISMATCH',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface PlatformErrorOptions {
  readonly code: ErrorCode;
  /** Text safe to return to an unauthenticated caller. Defaults to a generic per-code string. */
  readonly publicMessage?: string;
  /** Suggested HTTP status. Transport adapters may override. */
  readonly status?: number;
  /** Structured, non-sensitive context for logs. Never rendered to users. */
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
  /** True when retrying the same call later could succeed (rate limits, lockouts). */
  readonly retryable?: boolean;
  /** Seconds after which a retry may be attempted. */
  readonly retryAfterSeconds?: number;
}

const DEFAULT_STATUS: Readonly<Record<ErrorCode, number>> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_ACCOUNT_DISABLED: 403,
  AUTH_MFA_REQUIRED: 401,
  AUTH_MFA_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_REUSED: 401,
  AUTH_PASSWORD_POLICY: 422,
  AUTH_PASSWORD_BREACHED: 422,
  AUTH_PASSWORD_REUSED: 422,
  AUTH_RESET_TOKEN_INVALID: 400,
  AUTH_PROVIDER_ERROR: 502,
  AUTHZ_PERMISSION_DENIED: 403,
  AUTHZ_ROLE_UNKNOWN: 403,
  AUTHZ_POLICY_DENIED: 403,
  SESSION_NOT_FOUND: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  SESSION_LIMIT_REACHED: 429,
  SECURITY_RATE_LIMITED: 429,
  SECURITY_CSRF_INVALID: 403,
  SECURITY_RISK_BLOCKED: 403,
  SECURITY_THREAT_DETECTED: 400,
  CONFIG_INVALID: 500,
  CRYPTO_KEY_UNKNOWN: 500,
  CRYPTO_VERIFICATION_FAILED: 400,
  TENANT_MISMATCH: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

/**
 * Deliberately vague. An authentication failure tells the caller nothing about which half of the
 * credential was wrong, and an authorization failure names no permission — both are enumeration
 * oracles when they are specific.
 */
const DEFAULT_PUBLIC_MESSAGE: Readonly<Record<ErrorCode, string>> = {
  AUTH_INVALID_CREDENTIALS: 'Incorrect email or password.',
  AUTH_ACCOUNT_LOCKED: 'This account is temporarily locked. Try again later.',
  AUTH_ACCOUNT_DISABLED: 'This account is not available.',
  AUTH_MFA_REQUIRED: 'Additional verification is required.',
  AUTH_MFA_INVALID: 'That verification code is not valid.',
  AUTH_TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_TOKEN_INVALID: 'Your session is no longer valid. Please sign in again.',
  AUTH_TOKEN_REUSED: 'Your session is no longer valid. Please sign in again.',
  AUTH_PASSWORD_POLICY: 'That password does not meet the password policy.',
  AUTH_PASSWORD_BREACHED: 'That password has appeared in a known data breach. Choose another.',
  AUTH_PASSWORD_REUSED: 'That password was used recently. Choose a different one.',
  AUTH_RESET_TOKEN_INVALID: 'This reset link is no longer valid. Request a new one.',
  AUTH_PROVIDER_ERROR: 'The identity provider could not be reached.',
  AUTHZ_PERMISSION_DENIED: 'You do not have access to this.',
  AUTHZ_ROLE_UNKNOWN: 'You do not have access to this.',
  AUTHZ_POLICY_DENIED: 'You do not have access to this.',
  SESSION_NOT_FOUND: 'Your session has ended. Please sign in again.',
  SESSION_EXPIRED: 'Your session has ended. Please sign in again.',
  SESSION_REVOKED: 'Your session has ended. Please sign in again.',
  SESSION_LIMIT_REACHED: 'You have too many active sessions. Sign out of another device.',
  SECURITY_RATE_LIMITED: 'Too many requests. Try again shortly.',
  SECURITY_CSRF_INVALID: 'This request could not be verified. Reload the page and try again.',
  SECURITY_RISK_BLOCKED: 'This request could not be completed.',
  SECURITY_THREAT_DETECTED: 'This request could not be completed.',
  CONFIG_INVALID: 'The service is misconfigured.',
  CRYPTO_KEY_UNKNOWN: 'The service is misconfigured.',
  CRYPTO_VERIFICATION_FAILED: 'This request could not be verified.',
  TENANT_MISMATCH: 'You do not have access to this.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'That change conflicts with the current state.',
  INTERNAL: 'Something went wrong.',
};

export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, options: PlatformErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PlatformError';
    this.code = options.code;
    this.publicMessage = options.publicMessage ?? DEFAULT_PUBLIC_MESSAGE[options.code];
    this.status = options.status ?? DEFAULT_STATUS[options.code];
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** The representation that may cross the network. `details` and `message` stay behind. */
  toPublicJSON(): { code: ErrorCode; message: string; retryAfterSeconds?: number } {
    return {
      code: this.code,
      message: this.publicMessage,
      ...(this.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: this.retryAfterSeconds }),
    };
  }
}

export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError;
}

/** Convenience constructor: `platformError('AUTH_TOKEN_EXPIRED', 'refresh token past exp')`. */
export function platformError(
  code: ErrorCode,
  message?: string,
  options: Omit<PlatformErrorOptions, 'code'> = {},
): PlatformError {
  return new PlatformError(message ?? code, { code, ...options });
}
