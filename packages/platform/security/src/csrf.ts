import {
  HmacSigner,
  constantTimeEqual,
  secureToken,
  signValue,
  verifySignedValue,
  type KeyRing,
} from '@munaxa/crypto';
import {
  PlatformError,
  systemClock,
  type Clock,
  type CookieOptions,
  type DurationMs,
  type PlatformRequest,
} from '@munaxa/types';

/**
 * CSRF protection: signed double-submit, bound to the session.
 *
 * The plain double-submit pattern — a random value in a cookie, the same value in a header —
 * fails against an attacker who can set a cookie on the target domain (a subdomain XSS, a MITM on
 * plain HTTP, an overly broad cookie from a sibling app). Signing the token, and binding it to
 * the session id, closes that: an attacker who can write a cookie still cannot produce a token
 * that carries our signature over *this* session.
 *
 * SameSite cookies are the other half and are set by the cookie helpers. Neither replaces the
 * other: SameSite=Lax leaves top-level GET navigations unprotected, and support is a browser
 * property rather than a server-side guarantee.
 */
export interface CsrfOptions {
  readonly keyRing: KeyRing;
  readonly clock?: Clock;
  /** How long a token stays valid. */
  readonly ttl?: DurationMs;
  readonly cookieName?: string;
  readonly headerName?: string;
  /** Methods that do not require a token. */
  readonly safeMethods?: readonly string[];
}

export interface CsrfToken {
  /** Goes in the cookie, readable by the front end. */
  readonly value: string;
  readonly expiresAt: number;
  readonly cookie: { name: string; value: string; options: CookieOptions };
}

const DEFAULT_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];

export class CsrfProtection {
  readonly #signer: HmacSigner;
  readonly #clock: Clock;
  readonly #ttl: DurationMs;
  readonly cookieName: string;
  readonly headerName: string;
  readonly #safeMethods: ReadonlySet<string>;

  constructor(options: CsrfOptions) {
    this.#signer = new HmacSigner(options.keyRing);
    this.#clock = options.clock ?? systemClock;
    this.#ttl = options.ttl ?? 8 * 60 * 60 * 1_000;
    this.cookieName = options.cookieName ?? '__Host-csrf';
    this.headerName = options.headerName ?? 'x-csrf-token';
    this.#safeMethods = new Set(
      (options.safeMethods ?? DEFAULT_SAFE_METHODS).map((method) => method.toUpperCase()),
    );
  }

  /**
   * Issue a token for a session.
   *
   * The cookie is deliberately **not** httpOnly — the front end has to read it to echo it back —
   * which is exactly why the token is signed and session-bound rather than merely random.
   */
  issue(sessionId: string): CsrfToken {
    const expiresAt = this.#clock.now() + this.#ttl;
    const payload = `${sessionId}|${expiresAt}|${secureToken(16)}`;
    const value = signValue(this.#signer, payload, 'csrf');

    return {
      value,
      expiresAt,
      cookie: {
        name: this.cookieName,
        value,
        options: {
          httpOnly: false,
          secure: true,
          sameSite: 'strict',
          path: '/',
          maxAgeSeconds: Math.floor(this.#ttl / 1_000),
        },
      },
    };
  }

  /** Verify a token against the session it was issued for. */
  verify(token: string | undefined, sessionId: string): boolean {
    if (!token) return false;

    const payload = verifySignedValue(this.#signer, token, 'csrf');
    if (!payload) return false;

    const [boundSession, expiresAt] = payload.split('|');
    if (boundSession === undefined || expiresAt === undefined) return false;
    if (!constantTimeEqual(boundSession, sessionId)) return false;
    return this.#clock.now() < Number(expiresAt);
  }

  isSafeMethod(method: string): boolean {
    return this.#safeMethods.has(method.toUpperCase());
  }

  /**
   * Check a request.
   *
   * Both copies must be present, must match each other, and must verify. Requiring the cookie to
   * equal the header is what makes a stolen-but-not-replayable token useless on its own.
   */
  check(request: PlatformRequest, sessionId: string): void {
    if (this.isSafeMethod(request.method)) return;

    const header = request.headers[this.headerName];
    const cookie = request.cookies?.[this.cookieName];

    if (!header || !cookie || !constantTimeEqual(header, cookie)) {
      throw new PlatformError('CSRF token missing or mismatched', {
        code: 'SECURITY_CSRF_INVALID',
      });
    }
    if (!this.verify(header, sessionId)) {
      throw new PlatformError('CSRF token invalid or expired', { code: 'SECURITY_CSRF_INVALID' });
    }
  }
}

/**
 * Origin checking, the cheap complement to a token.
 *
 * A state-changing request whose `Origin` is not one we trust is rejected before any token work.
 * Absent `Origin` is treated as untrusted rather than allowed — modern browsers send it on every
 * cross-origin state-changing request, and the ones that do not are not the ones being defended.
 */
export function isTrustedOrigin(
  request: PlatformRequest,
  trustedOrigins: readonly string[],
): boolean {
  const origin = request.headers.origin ?? refererOrigin(request.headers.referer);
  if (!origin) return false;
  return trustedOrigins.includes(origin);
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
