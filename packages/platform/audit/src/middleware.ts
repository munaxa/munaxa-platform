import {
  ROOT_TENANT_ID,
  type PlatformMiddleware,
  type PlatformRequest,
  type SecurityEventName,
  type TenantId,
} from '@munaxa/types';
import { anonymousAuditEvent } from './events.js';
import type { AuditService } from './service.js';

/**
 * Audit at the edge.
 *
 * Two things belong here rather than in a service: requests that never reach one (a rate limit,
 * a CSRF rejection, a blocked risk decision), and access to endpoints a product declares
 * sensitive — a data export, an admin panel — where the fact of the request is itself the record.
 *
 * Deliberately narrow. Auditing every request produces a trail nobody can read; the events that
 * matter are chosen, not swept up.
 */
export interface AuditMiddlewareOptions {
  readonly audit: AuditService;
  /** Which requests to record, and as what. Return undefined to record nothing. */
  readonly classify: (request: PlatformRequest) => SecurityEventName | undefined;
  readonly resolveTenant?: (request: PlatformRequest) => TenantId;
  readonly correlationHeader?: string;
}

export function auditMiddleware(options: AuditMiddlewareOptions): PlatformMiddleware {
  const correlationHeader = options.correlationHeader ?? 'x-correlation-id';

  return async (request, response) => {
    const name = options.classify(request);
    if (!name) return undefined;

    const tenantId = options.resolveTenant?.(request) ?? ROOT_TENANT_ID;
    const correlationId = (request.headers[correlationHeader] ?? 'unknown') as never;

    await options.audit.write(
      anonymousAuditEvent(tenantId, correlationId, {
        name,
        // The status is not known until the handler has run; edge audit records the attempt, and
        // the service records the outcome. Two records, one correlation id.
        outcome: response.status >= 400 ? 'failure' : 'success',
        target: { id: request.path, type: 'endpoint' },
        source: {
          ...(request.ipAddress === undefined ? {} : { ipAddress: request.ipAddress }),
          ...(request.headers['user-agent'] === undefined
            ? {}
            : { userAgent: request.headers['user-agent'] }),
        },
        payload: { method: request.method, path: request.path },
      }),
    );

    return undefined;
  };
}

/**
 * A classifier for the endpoints every product has.
 *
 * Products extend it; the point of shipping one is that "which endpoints are security-relevant"
 * gets answered the same way in seven codebases.
 */
export function defaultClassifier(request: PlatformRequest): SecurityEventName | undefined {
  const path = request.path.toLowerCase();
  if (path.includes('/export')) return 'data.exported';
  if (request.method === 'DELETE' && path.includes('/admin')) return 'data.deleted';
  if (path.includes('/admin/settings') && request.method !== 'GET') return 'config.changed';
  return undefined;
}
