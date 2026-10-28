import { SubscriptionStatus } from './lifecycle.js';

/**
 * What a tenant may do, as a consequence of its subscription.
 *
 * This is a ceiling, never a grant. A product reaches an operation only when the caller's own
 * permissions allow it *and* the access mode allows it; a valid subscription never bypasses a
 * role check or tenant isolation.
 *
 * The modes are ordered: each permits strictly less than the one before it.
 */
export const AccessMode = {
  /** Everything the plan includes. */
  FULL: 'FULL',
  /** Reads and edits, but nothing that grows a metered quantity: no new seat, byte or record. */
  NO_GROWTH: 'NO_GROWTH',
  /** Sign in and read. */
  READ_ONLY: 'READ_ONLY',
  /** Only the permitted data export. The customer's records are theirs. */
  EXPORT_ONLY: 'EXPORT_ONLY',
  NONE: 'NONE',
} as const;
export type AccessMode = (typeof AccessMode)[keyof typeof AccessMode];

const RANK: Readonly<Record<AccessMode, number>> = {
  FULL: 4,
  NO_GROWTH: 3,
  READ_ONLY: 2,
  EXPORT_ONLY: 1,
  NONE: 0,
};

/** The more restrictive of two modes. */
export function restrict(a: AccessMode, b: AccessMode): AccessMode {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * The kinds of operation licensing has an opinion about.
 *
 * Health checks, readiness probes and recovery operations are deliberately absent: licensing never
 * gates them, because an installation that cannot report its own health cannot be repaired.
 */
export const OperationKind = {
  READ: 'READ',
  /** A change that does not grow a metered quantity. */
  WRITE: 'WRITE',
  /** A change that does: a new user, an upload, a new record counted against a limit. */
  GROWTH: 'GROWTH',
  EXPORT: 'EXPORT',
} as const;
export type OperationKind = (typeof OperationKind)[keyof typeof OperationKind];

const MINIMUM_MODE: Readonly<Record<OperationKind, AccessMode>> = {
  GROWTH: AccessMode.FULL,
  WRITE: AccessMode.NO_GROWTH,
  READ: AccessMode.READ_ONLY,
  EXPORT: AccessMode.EXPORT_ONLY,
};

export function permits(mode: AccessMode, operation: OperationKind): boolean {
  return RANK[mode] >= RANK[MINIMUM_MODE[operation]];
}

/**
 * The default ceiling for each status.
 *
 * PAST_DUE keeps full access: an overdue invoice is a conversation, not an outage. GRACE_PERIOD
 * stops growth, so the customer keeps working but the bill does not grow while it is unpaid.
 * EXPIRED and SUSPENDED are read-only — a suspension stops every change at once and still lets
 * the customer see their own records — and CANCELLED is export-only. Never NONE, because
 * withholding a customer's own records is not a collections strategy. NONE, or a stricter
 * suspension, is reached only through a product's own policy.
 */
export const DEFAULT_ACCESS_POLICY: Readonly<Record<SubscriptionStatus, AccessMode>> = {
  [SubscriptionStatus.TRIAL]: AccessMode.FULL,
  [SubscriptionStatus.ACTIVE]: AccessMode.FULL,
  [SubscriptionStatus.PAST_DUE]: AccessMode.FULL,
  [SubscriptionStatus.GRACE_PERIOD]: AccessMode.NO_GROWTH,
  [SubscriptionStatus.EXPIRED]: AccessMode.READ_ONLY,
  [SubscriptionStatus.SUSPENDED]: AccessMode.READ_ONLY,
  [SubscriptionStatus.CANCELLED]: AccessMode.EXPORT_ONLY,
};

export type AccessPolicy = Readonly<Record<SubscriptionStatus, AccessMode>>;

/**
 * A product's own policy, layered over the default. A product may only tighten: an override that
 * would grant more than the default is ignored, so no product can configure its way into giving a
 * suspended tenant write access.
 */
export function accessPolicy(overrides: Partial<AccessPolicy> = {}): AccessPolicy {
  const out = { ...DEFAULT_ACCESS_POLICY };
  for (const status of Object.keys(overrides) as SubscriptionStatus[]) {
    const mode = overrides[status];
    if (mode !== undefined) out[status] = restrict(DEFAULT_ACCESS_POLICY[status], mode);
  }
  return out;
}
