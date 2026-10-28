import { AccessMode } from './access.js';
import type { EntitlementSnapshot } from './entitlements.js';

/**
 * What happens when the source of truth cannot be reached.
 *
 * A licensing outage must never become unrestricted access, and it should not become a customer
 * outage either. So a product keeps the last snapshot it verified and degrades by age: inside the
 * freshness window nothing changes, past it growth stops, past the read-only horizon only export
 * remains. With no snapshot ever obtained, nothing premium is granted at all.
 */
export interface AvailabilityPolicy {
  /** How long a cached snapshot is as good as a fresh one. */
  readonly freshForMs: number;
  /** How long past `resolvedAt` a cached snapshot still permits non-growth writes. */
  readonly noGrowthForMs: number;
  /** How long past `resolvedAt` it still permits reads. After this, export only. */
  readonly readOnlyForMs: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * SaaS default: the central service is expected to be reachable, so the windows are short. An
 * hour of unchanged access covers an ordinary incident; a day of no-growth covers a bad one.
 */
export const SAAS_AVAILABILITY_POLICY: AvailabilityPolicy = {
  freshForMs: HOUR,
  noGrowthForMs: 24 * HOUR,
  readOnlyForMs: 7 * 24 * HOUR,
};

export const SnapshotSource = {
  /** Fetched from the source of truth on this call. */
  LIVE: 'LIVE',
  /** The last verified snapshot, inside its freshness window. */
  CACHED: 'CACHED',
  /** The last verified snapshot, past its freshness window and therefore capped. */
  STALE: 'STALE',
  /** Nothing has ever been obtained. */
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type SnapshotSource = (typeof SnapshotSource)[keyof typeof SnapshotSource];

export interface ResolvedSnapshot {
  readonly snapshot: EntitlementSnapshot | null;
  readonly source: SnapshotSource;
  /** The ceiling the source imposes, passed to evaluation as `cap`. */
  readonly cap: AccessMode;
}

/**
 * Choose between a live snapshot and a cached one, and say how far to trust it.
 *
 * `live` is `null` when the fetch failed. A live snapshot always wins, even when it grants less
 * than the cached one: the source of truth narrowing access is the point of asking it.
 */
export function resolveSnapshot(
  live: EntitlementSnapshot | null,
  cached: EntitlementSnapshot | null,
  now: Date,
  policy: AvailabilityPolicy = SAAS_AVAILABILITY_POLICY,
): ResolvedSnapshot {
  if (live !== null) return { snapshot: live, source: SnapshotSource.LIVE, cap: AccessMode.FULL };
  if (cached === null) {
    return { snapshot: null, source: SnapshotSource.UNAVAILABLE, cap: AccessMode.NONE };
  }
  // A resolvedAt in the future is a clock fault somewhere; treat it as just resolved, not as
  // "fresh forever".
  const age = Math.max(0, now.getTime() - Date.parse(cached.resolvedAt));
  if (age <= policy.freshForMs)
    return { snapshot: cached, source: SnapshotSource.CACHED, cap: AccessMode.FULL };
  const cap =
    age <= policy.noGrowthForMs
      ? AccessMode.NO_GROWTH
      : age <= policy.readOnlyForMs
        ? AccessMode.READ_ONLY
        : AccessMode.EXPORT_ONLY;
  return { snapshot: cached, source: SnapshotSource.STALE, cap };
}
