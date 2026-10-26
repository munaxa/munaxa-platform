import {
  AccessMode,
  DEFAULT_ACCESS_POLICY,
  OperationKind,
  permits,
  restrict,
  type AccessPolicy,
} from './access.js';
import { effectiveStatus, isSubscriptionStatus, type SubscriptionStatus } from './lifecycle.js';

/**
 * How a product is delivered. The same product code serves both; what differs is where the
 * entitlement snapshot comes from — the central service, or a signed licence file on disk.
 */
export const DeploymentType = {
  SAAS: 'SAAS',
  ON_PREMISES: 'ON_PREMISES',
} as const;
export type DeploymentType = (typeof DeploymentType)[keyof typeof DeploymentType];

/**
 * Product, feature and limit keys are opaque to the platform.
 *
 * Every product defines its own catalogue — its own features, its own quotas, its own packages —
 * and the platform evaluates them without knowing what any of them mean. The shape is constrained
 * so a key survives a URL, a log line and a JSON field unescaped.
 */
export const KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && KEY_PATTERN.test(value);
}

/**
 * What one tenant bought for one product, resolved: plan plus overrides, as a flat record.
 *
 * A product never computes this. It receives it — from the central service in SaaS, from a verified
 * licence on premises — and evaluates against it. Nothing in it is ever taken from a browser.
 */
export interface EntitlementSnapshot {
  readonly schemaVersion: 1;
  readonly customerId: string;
  readonly tenantId: string;
  readonly product: string;
  readonly deployment: DeploymentType;
  readonly subscriptionId: string;
  readonly plan: { readonly code: string; readonly version: number };
  readonly status: SubscriptionStatus;
  readonly trialEndsAt: string | null;
  readonly expiresAt: string | null;
  readonly graceUntil: string | null;
  /** Feature keys included. A key not listed is not included. */
  readonly features: readonly string[];
  /** Limit keys and their ceilings. `null` is unlimited; a key not listed is a limit of zero. */
  readonly limits: Readonly<Record<string, number | null>>;
  /** When the snapshot was resolved, for staleness. */
  readonly resolvedAt: string;
}

export type SnapshotParseResult =
  | { readonly ok: true; readonly snapshot: EntitlementSnapshot }
  | { readonly ok: false; readonly error: string };

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isIsoOrNull = (v: unknown): v is string | null => v === null || isIso(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;

/**
 * Validate a snapshot that crossed a process boundary.
 *
 * Strict by construction: an unknown status, a malformed key or a negative limit is a refusal, not
 * a coercion, because the safe reading of a snapshot nobody can parse is "nothing is included".
 */
export function parseEntitlementSnapshot(input: unknown): SnapshotParseResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'not an object' };
  const r = input as Record<string, unknown>;
  if (r['schemaVersion'] !== 1) return { ok: false, error: 'unsupported schemaVersion' };
  for (const field of ['customerId', 'tenantId', 'subscriptionId'] as const) {
    if (!isId(r[field])) return { ok: false, error: `invalid ${field}` };
  }
  if (!isKey(r['product'])) return { ok: false, error: 'invalid product' };
  if (r['deployment'] !== DeploymentType.SAAS && r['deployment'] !== DeploymentType.ON_PREMISES) {
    return { ok: false, error: 'invalid deployment' };
  }
  const plan = r['plan'] as Record<string, unknown> | null | undefined;
  if (
    typeof plan !== 'object' ||
    plan === null ||
    !isKey(plan['code']) ||
    !Number.isInteger(plan['version'])
  ) {
    return { ok: false, error: 'invalid plan' };
  }
  if (!isSubscriptionStatus(r['status'])) return { ok: false, error: 'invalid status' };
  for (const field of ['trialEndsAt', 'expiresAt', 'graceUntil'] as const) {
    if (!isIsoOrNull(r[field])) return { ok: false, error: `invalid ${field}` };
  }
  if (!isIso(r['resolvedAt'])) return { ok: false, error: 'invalid resolvedAt' };
  const features = r['features'];
  if (!Array.isArray(features) || !features.every(isKey))
    return { ok: false, error: 'invalid features' };
  const limits = r['limits'];
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits)) {
    return { ok: false, error: 'invalid limits' };
  }
  const parsedLimits: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(limits as Record<string, unknown>)) {
    if (!isKey(key)) return { ok: false, error: 'invalid limit key' };
    if (value !== null && !(Number.isSafeInteger(value) && (value as number) >= 0)) {
      return { ok: false, error: `invalid limit ${key}` };
    }
    parsedLimits[key] = value as number | null;
  }

  return {
    ok: true,
    snapshot: {
      schemaVersion: 1,
      customerId: r['customerId'] as string,
      tenantId: r['tenantId'] as string,
      product: r['product'],
      deployment: r['deployment'],
      subscriptionId: r['subscriptionId'] as string,
      plan: { code: plan['code'], version: plan['version'] as number },
      status: r['status'],
      trialEndsAt: r['trialEndsAt'] as string | null,
      expiresAt: r['expiresAt'] as string | null,
      graceUntil: r['graceUntil'] as string | null,
      features: [...new Set(features)],
      limits: parsedLimits,
      resolvedAt: r['resolvedAt'],
    },
  };
}

export const DenialReason = {
  /** No snapshot could be obtained at all. */
  NO_SUBSCRIPTION: 'NO_SUBSCRIPTION',
  /** The snapshot is for a different tenant or product than the one asking. */
  SUBJECT_MISMATCH: 'SUBJECT_MISMATCH',
  /** The status's access mode does not permit this kind of operation. */
  SUBSCRIPTION_RESTRICTED: 'SUBSCRIPTION_RESTRICTED',
  FEATURE_NOT_INCLUDED: 'FEATURE_NOT_INCLUDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
} as const;
export type DenialReason = (typeof DenialReason)[keyof typeof DenialReason];

export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly reason: DenialReason | null;
  readonly status: SubscriptionStatus | null;
  readonly mode: AccessMode;
  /** For quota decisions: the ceiling and the usage after the request. */
  readonly limit?: number | null;
  readonly wouldUse?: number;
}

export interface EvaluationContext {
  readonly now: Date;
  /** The tenant and product the request is for, from the server's own context — never the client. */
  readonly tenantId: string;
  readonly product: string;
  readonly policy?: AccessPolicy;
  /**
   * A further ceiling imposed by where the snapshot came from — see `resolveSnapshot`. A stale
   * snapshot cannot grant what a fresh one would.
   */
  readonly cap?: AccessMode;
}

/** The ceiling a snapshot imposes right now. */
export function accessModeOf(
  snapshot: EntitlementSnapshot | null,
  context: EvaluationContext,
): {
  readonly mode: AccessMode;
  readonly status: SubscriptionStatus | null;
  readonly mismatch: boolean;
} {
  const cap = context.cap ?? AccessMode.FULL;
  if (snapshot === null)
    return { mode: restrict(AccessMode.NONE, cap), status: null, mismatch: false };
  if (snapshot.tenantId !== context.tenantId || snapshot.product !== context.product) {
    return { mode: AccessMode.NONE, status: null, mismatch: true };
  }
  const status = effectiveStatus(snapshot, context.now);
  const policy = context.policy ?? DEFAULT_ACCESS_POLICY;
  return { mode: restrict(policy[status], cap), status, mismatch: false };
}

function deny(
  reason: DenialReason,
  status: SubscriptionStatus | null,
  mode: AccessMode,
): EntitlementDecision {
  return { allowed: false, reason, status, mode };
}

/** May this tenant perform an operation of this kind at all? */
export function checkOperation(
  snapshot: EntitlementSnapshot | null,
  operation: OperationKind,
  context: EvaluationContext,
): EntitlementDecision {
  const { mode, status, mismatch } = accessModeOf(snapshot, context);
  if (mismatch) return deny(DenialReason.SUBJECT_MISMATCH, null, mode);
  if (!permits(mode, operation)) {
    return deny(
      snapshot === null ? DenialReason.NO_SUBSCRIPTION : DenialReason.SUBSCRIPTION_RESTRICTED,
      status,
      mode,
    );
  }
  return { allowed: true, reason: null, status, mode };
}

/**
 * Is a feature included, and may it be used now?
 *
 * `operation` is what using the feature does — a premium report is a READ, a workflow designer a
 * WRITE. An included feature on an expired subscription is still refused for writes.
 */
export function checkFeature(
  snapshot: EntitlementSnapshot | null,
  feature: string,
  operation: OperationKind,
  context: EvaluationContext,
): EntitlementDecision {
  const base = checkOperation(snapshot, operation, context);
  if (!base.allowed || snapshot === null) return base;
  if (!snapshot.features.includes(feature))
    return deny(DenialReason.FEATURE_NOT_INCLUDED, base.status, base.mode);
  return base;
}

/**
 * Is there headroom for `requested` more of a metered quantity?
 *
 * This is the *decision*. It is not the enforcement: two concurrent requests can each see headroom
 * for one. A product enforces atomically — a conditional update, a row lock or a constraint in the
 * same transaction that commits the growth — and uses this to compute the ceiling it enforces.
 * See {@link limitOf}.
 */
export function checkQuota(
  snapshot: EntitlementSnapshot | null,
  limitKey: string,
  usage: { readonly used: number; readonly requested: number },
  context: EvaluationContext,
): EntitlementDecision {
  const base = checkOperation(
    snapshot,
    usage.requested > 0 ? OperationKind.GROWTH : OperationKind.WRITE,
    context,
  );
  if (!base.allowed || snapshot === null) return base;
  const limit = limitOf(snapshot, limitKey);
  const wouldUse = usage.used + usage.requested;
  if (limit !== null && wouldUse > limit) {
    return { ...deny(DenialReason.QUOTA_EXCEEDED, base.status, base.mode), limit, wouldUse };
  }
  return { ...base, limit, wouldUse };
}

/** The ceiling for a limit key: `null` unlimited, and 0 when the plan does not mention it. */
export function limitOf(snapshot: EntitlementSnapshot, limitKey: string): number | null {
  return Object.hasOwn(snapshot.limits, limitKey) ? (snapshot.limits[limitKey] ?? null) : 0;
}
