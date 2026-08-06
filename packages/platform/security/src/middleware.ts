import {
  composeMiddleware,
  type PlatformMiddleware,
  type PlatformRequest,
  type SecurityEventName,
  type TenantId,
} from '@munaxa/types';
import { apiSecurityHeaders, securityHeaders, type SecurityHeadersOptions } from './headers.js';
import { isTrustedOrigin, type CsrfProtection } from './csrf.js';
import { rateLimitHeaders, targetFor, type RateLimiter } from './ratelimit.js';
import { inspectPath, scanForThreats, type ThreatFinding } from './threats.js';

/**
 * The secure edge, assembled.
 *
 * Order is the security property, and it is fixed here rather than left to each product's
 * framework registration:
 *
 *   1. **Headers** — applied first so they are present even on a response produced by a later
 *      rejection. A 429 without `X-Content-Type-Options` is still a response a browser renders.
 *   2. **Path inspection** — cheapest possible rejection, before anything parses a body.
 *   3. **Rate limiting** — before authentication, because the login endpoint is what gets
 *      attacked and authentication is expensive by design.
 *   4. **Origin and CSRF** — before the handler, after the session is resolvable.
 *   5. **Threat scanning** — last, and advisory: it records rather than blocks.
 */
export interface SecurityPipelineOptions {
  readonly headers?: SecurityHeadersOptions;
  /** Serve API headers (no-store, `default-src 'none'`) instead of page headers. */
  readonly apiOnly?: boolean;
  readonly rateLimiter?: RateLimiter;
  readonly csrf?: CsrfProtection;
  /** Origins allowed to make state-changing requests. Empty disables the origin check. */
  readonly trustedOrigins?: readonly string[];
  readonly resolveTenant?: (request: PlatformRequest) => TenantId;
  readonly resolveSession?: (request: PlatformRequest) => { sessionId?: string; userId?: string };
  /** Scan bodies for threat patterns. Findings are reported, never blocked. */
  readonly scanBodies?: boolean;
  readonly onEvent?: (event: SecurityPipelineEvent) => void | Promise<void>;
}

export interface SecurityPipelineEvent {
  readonly name: SecurityEventName;
  readonly request: PlatformRequest;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly findings?: readonly ThreatFinding[];
}

export function securityPipeline(options: SecurityPipelineOptions = {}): PlatformMiddleware {
  const steps: PlatformMiddleware[] = [headersStep(options)];

  steps.push(pathStep(options));
  if (options.rateLimiter) steps.push(rateLimitStep(options.rateLimiter, options));
  if (options.trustedOrigins?.length) steps.push(originStep(options.trustedOrigins, options));
  if (options.csrf) steps.push(csrfStep(options.csrf, options));
  if (options.scanBodies) steps.push(threatScanStep(options));

  return composeMiddleware(...steps);
}

function headersStep(options: SecurityPipelineOptions): PlatformMiddleware {
  return (_request, response) => {
    if (options.apiOnly) {
      Object.assign(response.headers, apiSecurityHeaders());
      return;
    }
    const { headers, nonce } = securityHeaders(options.headers);
    Object.assign(response.headers, headers);
    // The handler needs the nonce to put on inline scripts; it travels on the response object
    // rather than in a global, so concurrent requests cannot pick up each other's.
    (response as { cspNonce?: string }).cspNonce = nonce;
  };
}

function pathStep(options: SecurityPipelineOptions): PlatformMiddleware {
  return async (request, response) => {
    const finding = inspectPath(request.path);
    if (!finding) return undefined;

    await options.onEvent?.({ name: 'security.threat.detected', request, findings: [finding] });
    return { ...response, status: 400, body: { code: 'SECURITY_THREAT_DETECTED' } };
  };
}

function rateLimitStep(limiter: RateLimiter, options: SecurityPipelineOptions): PlatformMiddleware {
  return async (request, response) => {
    const tenantId = options.resolveTenant?.(request) ?? ('root' as TenantId);
    const session = options.resolveSession?.(request) ?? {};
    const decision = await limiter.check(targetFor(request, { tenantId, ...session }));

    Object.assign(response.headers, rateLimitHeaders(decision));
    if (decision.allowed) return undefined;

    await options.onEvent?.({
      name: 'security.ratelimit.exceeded',
      request,
      detail: { rule: decision.rule, retryAfterSeconds: decision.retryAfterSeconds },
    });

    return {
      ...response,
      status: 429,
      body: { code: 'SECURITY_RATE_LIMITED', retryAfterSeconds: decision.retryAfterSeconds },
    };
  };
}

function originStep(
  trustedOrigins: readonly string[],
  options: SecurityPipelineOptions,
): PlatformMiddleware {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  return async (request, response) => {
    if (safeMethods.has(request.method.toUpperCase())) return undefined;
    if (isTrustedOrigin(request, trustedOrigins)) return undefined;

    await options.onEvent?.({
      name: 'security.csrf.rejected',
      request,
      detail: { reason: 'untrusted-origin', origin: request.headers.origin },
    });
    return { ...response, status: 403, body: { code: 'SECURITY_CSRF_INVALID' } };
  };
}

function csrfStep(csrf: CsrfProtection, options: SecurityPipelineOptions): PlatformMiddleware {
  return async (request, response) => {
    if (csrf.isSafeMethod(request.method)) return undefined;

    const sessionId = options.resolveSession?.(request)?.sessionId;
    // No session means no cookie to ride on, so there is nothing for CSRF to forge. Rejecting
    // here would break the login form itself, which is submitted before a session exists.
    if (!sessionId) return undefined;

    try {
      csrf.check(request, sessionId);
      return undefined;
    } catch {
      await options.onEvent?.({
        name: 'security.csrf.rejected',
        request,
        detail: { reason: 'token' },
      });
      return { ...response, status: 403, body: { code: 'SECURITY_CSRF_INVALID' } };
    }
  };
}

function threatScanStep(options: SecurityPipelineOptions): PlatformMiddleware {
  return async (request) => {
    const findings = [
      ...scanForThreats(request.query ?? {}, 'query'),
      ...scanForThreats(request.body ?? {}, 'body'),
    ];
    if (findings.length === 0) return undefined;

    // Recorded, not blocked. See the note at the top of threats.ts: pattern matching is a
    // tripwire, and treating it as a control encourages products to rely on it.
    await options.onEvent?.({ name: 'security.threat.detected', request, findings });
    return undefined;
  };
}
