import { secureToken } from '@munaxa/crypto';
import type { DurationMs } from '@munaxa/types';

/**
 * Security headers, with a Content-Security-Policy that is actually restrictive.
 *
 * The default policy has no `unsafe-inline` and no `unsafe-eval`. Inline scripts are permitted
 * only by nonce, which is why `nonce` is generated per response and must be threaded into the
 * markup — a CSP with `unsafe-inline` is a CSP that stops XSS from being exploited only by
 * attackers who have not read it.
 *
 * `strict-dynamic` is included so a nonced bootstrap script can load its own chunks without every
 * bundle hash ending up in the header; browsers that do not support it fall back to the host
 * allow-list, which is why both are present.
 */
export interface CspDirectives {
  readonly [directive: string]: readonly string[] | true;
}

export interface SecurityHeadersOptions {
  /** Additional or overriding CSP directives merged over the defaults. */
  readonly csp?: CspDirectives;
  /** Send `Content-Security-Policy-Report-Only` instead. For rolling a policy out safely. */
  readonly cspReportOnly?: boolean;
  readonly reportUri?: string;
  /** HSTS max-age. Zero omits the header — correct for a service not served over TLS. */
  readonly hstsMaxAge?: DurationMs;
  readonly hstsIncludeSubdomains?: boolean;
  readonly hstsPreload?: boolean;
  readonly frameOptions?: 'DENY' | 'SAMEORIGIN';
  readonly referrerPolicy?: string;
  /** Cross-Origin-Embedder-Policy. `require-corp` breaks third-party embeds; opt in knowingly. */
  readonly coep?: 'require-corp' | 'credentialless' | 'unsafe-none';
  readonly coop?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';
  readonly corp?: 'same-origin' | 'same-site' | 'cross-origin';
  readonly permissionsPolicy?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Deny by default, then open what the product needs.
 *
 * `object-src 'none'` and `base-uri 'none'` are not optional decoration: plugin objects and a
 * rewritten `<base>` are two of the reliable ways to turn a partial injection into full script
 * execution under an otherwise strict policy.
 */
export const DEFAULT_CSP: CspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'strict-dynamic'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': true,
};

/**
 * Off by default, everywhere.
 *
 * A product that needs the camera enables it for itself; the point of the header is that a
 * compromised third-party script in the page cannot reach any of these.
 */
export const DEFAULT_PERMISSIONS_POLICY: Readonly<Record<string, readonly string[]>> = {
  accelerometer: [],
  'ambient-light-sensor': [],
  autoplay: [],
  battery: [],
  camera: [],
  'display-capture': [],
  'document-domain': [],
  'encrypted-media': [],
  fullscreen: ['self'],
  geolocation: [],
  gyroscope: [],
  magnetometer: [],
  microphone: [],
  midi: [],
  payment: [],
  'picture-in-picture': [],
  'publickey-credentials-get': ['self'],
  'screen-wake-lock': [],
  usb: [],
  'xr-spatial-tracking': [],
};

export interface RenderedHeaders {
  readonly headers: Readonly<Record<string, string>>;
  /** The per-response nonce. Must appear on every inline `<script>` the page emits. */
  readonly nonce: string;
}

/** Generate a fresh nonce. One per response, never reused, never derived from anything. */
export function cspNonce(): string {
  return secureToken(16);
}

export function securityHeaders(options: SecurityHeadersOptions = {}): RenderedHeaders {
  const nonce = cspNonce();
  const headers: Record<string, string> = {};

  const directives: Record<string, readonly string[] | true> = { ...DEFAULT_CSP, ...options.csp };
  const scriptSrc = directives['script-src'];
  if (Array.isArray(scriptSrc)) {
    directives['script-src'] = [`'nonce-${nonce}'`, ...(scriptSrc as readonly string[])];
  }
  if (options.reportUri) {
    directives['report-uri'] = [options.reportUri];
    directives['report-to'] = ['csp-endpoint'];
  }

  headers[
    options.cspReportOnly ? 'content-security-policy-report-only' : 'content-security-policy'
  ] = renderCsp(directives);

  const hstsMaxAge = options.hstsMaxAge ?? 31_536_000_000;
  if (hstsMaxAge > 0) {
    const parts = [`max-age=${Math.floor(hstsMaxAge / 1_000)}`];
    if (options.hstsIncludeSubdomains !== false) parts.push('includeSubDomains');
    // Preload is opt-in: it is effectively irreversible for the domain and every subdomain.
    if (options.hstsPreload) parts.push('preload');
    headers['strict-transport-security'] = parts.join('; ');
  }

  headers['x-content-type-options'] = 'nosniff';
  headers['x-frame-options'] = options.frameOptions ?? 'DENY';
  headers['referrer-policy'] = options.referrerPolicy ?? 'strict-origin-when-cross-origin';
  headers['cross-origin-opener-policy'] = options.coop ?? 'same-origin';
  headers['cross-origin-resource-policy'] = options.corp ?? 'same-origin';
  if (options.coep && options.coep !== 'unsafe-none') {
    headers['cross-origin-embedder-policy'] = options.coep;
  }
  headers['permissions-policy'] = renderPermissionsPolicy(
    options.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY,
  );
  // Legacy, and actively harmful: the XSS auditor it enables has its own bypass techniques.
  headers['x-xss-protection'] = '0';

  return { headers, nonce };
}

export function renderCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .map(([directive, value]) => (value === true ? directive : `${directive} ${value.join(' ')}`))
    .join('; ');
}

export function renderPermissionsPolicy(
  policy: Readonly<Record<string, readonly string[]>>,
): string {
  return Object.entries(policy)
    .map(([feature, origins]) => {
      if (origins.length === 0) return `${feature}=()`;
      const rendered = origins.map((origin) => (origin === 'self' ? 'self' : `"${origin}"`));
      return `${feature}=(${rendered.join(' ')})`;
    })
    .join(', ');
}

/**
 * Headers for a JSON API rather than a page.
 *
 * An API serves no markup, so the CSP can be maximally restrictive, and caching must be off:
 * an authenticated JSON response sitting in a shared cache is a data leak with no attacker
 * involved at all.
 */
export function apiSecurityHeaders(): Readonly<Record<string, string>> {
  return {
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    pragma: 'no-cache',
  };
}
