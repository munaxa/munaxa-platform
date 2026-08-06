import {
  PlatformError,
  type CookieInstruction,
  type CookieOptions,
  type DurationMs,
  type PlatformRequest,
  type Principal,
  type SecurityContext,
} from '@munaxa/types';

/**
 * Cookies and bearer tokens.
 *
 * Cookie defaults here are the hardened ones and there is no way to ask for less: `httpOnly` and
 * `secure` are not parameters, and `sameSite` may be narrowed but not widened past `lax`. A
 * session cookie readable by JavaScript is one XSS away from being every user's session.
 *
 * The `__Host-` prefix is used for session cookies because browsers enforce, on their side, that
 * such a cookie is secure, path `/`, and has no `Domain` — which means a subdomain cannot set or
 * overwrite it. That closes the cookie-injection route that plain double-submit CSRF and
 * session-fixation attacks both rely on.
 */
export const SESSION_COOKIE = '__Host-mx_session';
export const REFRESH_COOKIE = '__Host-mx_refresh';

export interface SessionCookieOptions {
  readonly maxAge?: DurationMs;
  readonly sameSite?: 'strict' | 'lax';
  /** Narrow the refresh cookie to the endpoint that consumes it. */
  readonly path?: string;
}

export function sessionCookie(
  value: string,
  options: SessionCookieOptions = {},
): CookieInstruction {
  return {
    name: SESSION_COOKIE,
    value,
    options: hardenedCookie(options),
  };
}

/**
 * The refresh cookie, scoped to the refresh endpoint.
 *
 * Path scoping means the long-lived credential is not attached to every request the browser
 * makes, so an XSS on any other route cannot exfiltrate it from a response it triggered.
 */
export function refreshCookie(
  value: string,
  options: SessionCookieOptions = {},
): CookieInstruction {
  return {
    name: REFRESH_COOKIE,
    value,
    options: hardenedCookie({ sameSite: 'strict', path: '/api/auth/refresh', ...options }),
  };
}

/** Expire a cookie. Same attributes as when it was set, or the browser ignores the deletion. */
export function clearCookie(name: string, path = '/'): CookieInstruction {
  return {
    name,
    value: '',
    options: { httpOnly: true, secure: true, sameSite: 'strict', path, maxAgeSeconds: 0 },
  };
}

function hardenedCookie(options: SessionCookieOptions): CookieOptions {
  return {
    // Not configurable. Both are the difference between a cookie an attacker can read and one
    // they cannot, and there is no legitimate reason for the platform to issue a weaker one.
    httpOnly: true,
    secure: true,
    sameSite: options.sameSite ?? 'lax',
    path: options.path ?? '/',
    ...(options.maxAge === undefined ? {} : { maxAgeSeconds: Math.floor(options.maxAge / 1_000) }),
  };
}

/**
 * Extract a bearer token.
 *
 * Only the `Authorization` header is accepted. Tokens in query strings are rejected outright:
 * they end up in access logs, in `Referer` headers, in browser history and in shared URLs, and
 * supporting them "for convenience" is how they get there.
 */
export function bearerToken(request: PlatformRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;

  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : undefined;
}

/** Read a credential from either the bearer header or a cookie, header taking precedence. */
export function credentialFrom(
  request: PlatformRequest,
  cookieName = SESSION_COOKIE,
): string | undefined {
  return bearerToken(request) ?? request.cookies?.[cookieName];
}

/**
 * Require an authenticated principal, or throw.
 *
 * Anonymous is rejected here rather than deeper in the stack, so a handler that forgets to check
 * never sees an anonymous principal at all.
 */
export function requireAuth(context: SecurityContext): Principal {
  if (context.principal.kind === 'anonymous') {
    throw new PlatformError('Authentication required', { code: 'AUTH_TOKEN_INVALID' });
  }
  return context.principal;
}

/** Require that a second factor was satisfied in this session. */
export function requireMfa(context: SecurityContext): void {
  const principal = requireAuth(context);
  if (principal.kind !== 'user' || principal.mfaSatisfied !== true) {
    throw new PlatformError('Second factor required', { code: 'AUTH_MFA_REQUIRED' });
  }
}

/**
 * A method decorator for products on `experimentalDecorators`.
 *
 * As elsewhere in the platform, the decorated method takes the `SecurityContext` first: an
 * authentication check that reads from ambient state is a check a background job can pass by
 * accident.
 */
export function RequireAuth(options: { mfa?: boolean } = {}) {
  return function decorate(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (context: SecurityContext, ...args: unknown[]) => unknown;
    if (typeof original !== 'function') {
      throw new TypeError('@RequireAuth can only decorate a method');
    }

    descriptor.value = function guarded(
      this: unknown,
      context: SecurityContext,
      ...args: unknown[]
    ) {
      if (options.mfa) requireMfa(context);
      else requireAuth(context);
      return original.call(this, context, ...args);
    };
    return descriptor;
  };
}
