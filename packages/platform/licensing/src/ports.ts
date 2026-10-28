import type { EntitlementSnapshot } from './entitlements.js';

/**
 * Where a product gets its snapshot from. Bound by the product: an HTTP client to the central
 * service in SaaS, a licence file reader on premises.
 *
 * Returns `null` when no snapshot could be obtained. It must not throw on an outage — the caller
 * decides what an outage means through `resolveSnapshot`, and a thrown error tends to be caught
 * somewhere that decides permissively.
 */
export interface EntitlementSource {
  fetch(tenantId: string, product: string): Promise<EntitlementSnapshot | null>;
}

/**
 * A metered quantity a product reports to the central service. Reporting is informational: the
 * product enforces its own limits against its own counts, and a lost report never changes access.
 */
export interface UsageReport {
  readonly tenantId: string;
  readonly product: string;
  /** A limit key from the product's catalogue. */
  readonly metric: string;
  readonly value: number;
  readonly measuredAt: string;
  readonly installationId?: string;
}

export interface UsageReporter {
  report(reports: readonly UsageReport[]): Promise<void>;
}
