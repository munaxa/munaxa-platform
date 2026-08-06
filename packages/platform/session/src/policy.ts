import { DAY, HOUR, MINUTE, type DurationMs } from '@munaxa/types';

/**
 * Session policy.
 *
 * The defaults are the ones a security review asks for and are safe to ship unchanged. Every one
 * of them can be tightened per tenant; none can be loosened past the platform ceiling, which is
 * what `clampSessionPolicy` enforces — a tenant administrator with a slider must not be able to
 * configure a thirty-day idle timeout.
 */
export interface SessionPolicy {
  /** Sliding window: a session dies this long after the last request. */
  readonly idleTimeout: DurationMs;
  /** Hard ceiling from creation, regardless of activity. */
  readonly absoluteTimeout: DurationMs;
  /** Maximum simultaneous sessions per user. */
  readonly maxConcurrent: number;
  /** What to do when the limit is reached. */
  readonly onLimitReached: 'evict-oldest' | 'deny';
  /** How long a device stays trusted after a successful second factor. */
  readonly deviceTrustDuration: DurationMs;
  /** Re-authenticate before sensitive operations if the session is older than this. 0 disables. */
  readonly sensitiveActionMaxAge: DurationMs;
  /** Bind the session to the IP it was created from. Off by default — mobile networks rotate. */
  readonly bindToIp: boolean;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleTimeout: 15 * MINUTE,
  absoluteTimeout: 12 * HOUR,
  maxConcurrent: 10,
  onLimitReached: 'evict-oldest',
  deviceTrustDuration: 30 * DAY,
  sensitiveActionMaxAge: 15 * MINUTE,
  bindToIp: false,
};

/** The platform ceiling. A tenant may go below these numbers, never above. */
export const SESSION_POLICY_CEILING = {
  idleTimeout: 8 * HOUR,
  absoluteTimeout: 30 * DAY,
  maxConcurrent: 100,
  deviceTrustDuration: 90 * DAY,
} as const;

export function clampSessionPolicy(policy: Partial<SessionPolicy>): SessionPolicy {
  const merged = { ...DEFAULT_SESSION_POLICY, ...policy };
  return {
    ...merged,
    idleTimeout: Math.min(merged.idleTimeout, SESSION_POLICY_CEILING.idleTimeout),
    absoluteTimeout: Math.min(merged.absoluteTimeout, SESSION_POLICY_CEILING.absoluteTimeout),
    maxConcurrent: Math.min(Math.max(1, merged.maxConcurrent), SESSION_POLICY_CEILING.maxConcurrent),
    deviceTrustDuration: Math.min(
      merged.deviceTrustDuration,
      SESSION_POLICY_CEILING.deviceTrustDuration,
    ),
  };
}
