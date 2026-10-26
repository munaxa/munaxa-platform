import { parseEntitlementSnapshot, type EntitlementSnapshot } from './entitlements.js';
import type { UsageReport } from './ports.js';

/**
 * The central subscription service's product-facing wire format: the paths a product calls and
 * how it must read the answers. No HTTP client — each product sends through its own outbound
 * boundary (an allow-list, a proxy, a timeout) — but one reading of what comes back, so that "is
 * this an outage or a cancellation?" has the same answer in every product.
 */

/** `GET` with `Authorization: Bearer <service credential>`. */
export function entitlementsPath(product: string, tenantId: string): string {
  return `/api/v1/products/${encodeURIComponent(product)}/tenants/${encodeURIComponent(tenantId)}/entitlements`;
}

/** `POST` a {@link UsageBatch} with `Authorization: Bearer <service credential>`. */
export function usagePath(product: string): string {
  return `/api/v1/products/${encodeURIComponent(product)}/usage`;
}

/**
 * The body of a {@link usagePath} request: one product's reports, the product being the path's.
 * Idempotent on (tenant, metric, measuredAt), so a retried batch is counted once.
 */
export interface UsageBatch {
  readonly reports: readonly Omit<UsageReport, 'product'>[];
}

/** The most points the service accepts in one batch. */
export const USAGE_BATCH_MAX = 500;

/** What the service answered about one tenant. */
export type EntitlementAnswer =
  /** The service answered with a snapshot for exactly the tenant and product asked about. */
  | { readonly kind: 'SNAPSHOT'; readonly snapshot: EntitlementSnapshot }
  /**
   * The service answered, and the answer is that there is nothing: no subscription for this tenant
   * in this product, reachable with this credential. Not an outage — a cached snapshot must not
   * outlive it.
   */
  | { readonly kind: 'NONE'; readonly reason: string }
  /** Nothing was learned. The last verified snapshot is used, degraded by age. */
  | { readonly kind: 'UNAVAILABLE'; readonly reason: string };

/** The transport could not complete the request: timeout, refused connection, blocked host. */
export function unreachable(kind: string): EntitlementAnswer {
  return { kind: 'UNAVAILABLE', reason: `CONTROL_PLANE_${kind.toUpperCase()}` };
}

/**
 * Read a completed response to {@link entitlementsPath}.
 *
 * `404` is an answer. Every other non-`200` is an outage, including `401` and `403`: a revoked or
 * mistyped credential is an operator's fault to fix, not evidence that the customer stopped
 * paying, and reading it as "nothing" would lock every tenant out at once. A body that does not
 * parse, or a snapshot about some other tenant or product, is an outage too: the safe reading of an
 * answer nobody can trust is that nothing was learned, not that nothing is included.
 */
export function readEntitlementResponse(
  response: { readonly status: number; readonly body: string },
  expected: { readonly product: string; readonly tenantId: string },
): EntitlementAnswer {
  if (response.status === 404) return { kind: 'NONE', reason: 'CONTROL_PLANE_NO_SUBSCRIPTION' };
  if (response.status !== 200) {
    return { kind: 'UNAVAILABLE', reason: `CONTROL_PLANE_HTTP_${String(response.status)}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    return { kind: 'UNAVAILABLE', reason: 'CONTROL_PLANE_UNPARSEABLE' };
  }
  const parsed = parseEntitlementSnapshot(json);
  if (!parsed.ok) return { kind: 'UNAVAILABLE', reason: 'CONTROL_PLANE_INVALID_SNAPSHOT' };
  if (
    parsed.snapshot.tenantId !== expected.tenantId ||
    parsed.snapshot.product !== expected.product
  ) {
    return { kind: 'UNAVAILABLE', reason: 'CONTROL_PLANE_SUBJECT_MISMATCH' };
  }
  return { kind: 'SNAPSHOT', snapshot: parsed.snapshot };
}
