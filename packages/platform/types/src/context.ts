import type { CorrelationId, DeviceId, RequestId, SessionId, TenantId } from './ids.js';
import type { Principal } from './principal.js';

/**
 * Everything the platform needs to know about the call in flight.
 *
 * A `SecurityContext` is threaded explicitly through every service rather than pulled from
 * ambient state. `@munaxa/logging` offers an AsyncLocalStorage-backed carrier for transports
 * that cannot thread it, but the services themselves never reach for a global.
 */
export interface SecurityContext {
  readonly tenantId: TenantId;
  readonly principal: Principal;
  readonly correlationId: CorrelationId;
  readonly requestId?: RequestId;
  readonly sessionId?: SessionId;
  readonly deviceId?: DeviceId;
  /** Client address as the edge resolved it. Never read straight from `X-Forwarded-For`. */
  readonly ipAddress?: string;
  readonly userAgent?: string;
  /** ISO 3166-1 alpha-2, when the edge provides it. Used by the risk engine. */
  readonly country?: string;
  /** Free-form transport metadata; never trusted for authorization decisions. */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Tenant-scoped settings resolved once per request and passed down. */
export interface TenantContext {
  readonly tenantId: TenantId;
  readonly displayName?: string;
  readonly isolationMode: 'shared' | 'dedicated';
  readonly settings: Readonly<Record<string, unknown>>;
}

export function withPrincipal(context: SecurityContext, principal: Principal): SecurityContext {
  return { ...context, principal };
}

/**
 * Guard against cross-tenant reads. Every repository the platform ships calls this before it
 * returns a record, so a tenant confusion bug fails closed instead of leaking a row.
 */
export function assertSameTenant(expected: TenantId, actual: TenantId): void {
  if (expected !== actual) {
    throw new TenantMismatchError(expected, actual);
  }
}

export class TenantMismatchError extends Error {
  constructor(
    readonly expected: TenantId,
    readonly actual: TenantId,
  ) {
    super(`Tenant mismatch: context is ${expected}, record is ${actual}`);
    this.name = 'TenantMismatchError';
  }
}
