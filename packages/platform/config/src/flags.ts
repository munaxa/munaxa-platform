import { createHash } from 'node:crypto';
import type { FeatureFlagContext, FeatureFlagPort } from '@munaxa/interfaces';
import type { TenantId } from '@munaxa/types';

/**
 * Feature flags with deterministic rollouts.
 *
 * The property that makes percentage rollouts usable: the same subject always lands on the same
 * side of the split. A flag that re-rolls per request gives a user a feature on one page load and
 * takes it away on the next, and makes a bug report impossible to reproduce. Bucketing hashes
 * `flag:subject`, so two different flags at 10% do not select the same 10% of users.
 */
export interface FlagRule {
  /** Off unless something below turns it on. */
  readonly enabled?: boolean;
  /** Tenants the flag is force-enabled for, whatever the rollout says. */
  readonly tenants?: readonly TenantId[];
  /** Users the flag is force-enabled for — the internal-testers list. */
  readonly users?: readonly string[];
  /** 0–100. Applied to `userId`, or to `tenantId` when there is no user. */
  readonly rolloutPercentage?: number;
  /** Returned by `variant()` when the flag is on. */
  readonly variant?: unknown;
  /** Attribute equality that must all hold for the flag to apply. */
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export class FeatureFlags implements FeatureFlagPort {
  readonly #rules = new Map<string, FlagRule>();

  constructor(rules: Readonly<Record<string, FlagRule | boolean>> = {}) {
    for (const [flag, rule] of Object.entries(rules)) {
      this.#rules.set(flag, typeof rule === 'boolean' ? { enabled: rule } : rule);
    }
  }

  set(flag: string, rule: FlagRule | boolean): this {
    this.#rules.set(flag, typeof rule === 'boolean' ? { enabled: rule } : rule);
    return this;
  }

  async isEnabled(flag: string, context: FeatureFlagContext = {}): Promise<boolean> {
    return this.evaluate(flag, context);
  }

  async variant<T = string>(
    flag: string,
    context: FeatureFlagContext = {},
  ): Promise<T | undefined> {
    const rule = this.#rules.get(flag);
    if (!rule || !this.evaluate(flag, context)) return undefined;
    return rule.variant as T | undefined;
  }

  /** Synchronous evaluation, for call sites that are not async. */
  evaluate(flag: string, context: FeatureFlagContext = {}): boolean {
    const rule = this.#rules.get(flag);
    // An unknown flag is off. A typo must never turn something on.
    if (!rule) return false;

    if (rule.attributes) {
      for (const [key, expected] of Object.entries(rule.attributes)) {
        if (context.attributes?.[key] !== expected) return false;
      }
    }

    if (rule.tenants?.length && context.tenantId && rule.tenants.includes(context.tenantId)) {
      return true;
    }
    if (rule.users?.length && context.userId && rule.users.includes(context.userId)) {
      return true;
    }

    if (rule.rolloutPercentage !== undefined) {
      const subject = context.userId ?? context.tenantId;
      if (subject === undefined) return rule.enabled ?? false;
      return bucketOf(flag, subject) < clampPercentage(rule.rolloutPercentage);
    }

    return rule.enabled ?? false;
  }

  snapshot(): Readonly<Record<string, FlagRule>> {
    return Object.fromEntries(this.#rules);
  }
}

/** Stable bucket in [0, 100) for a (flag, subject) pair. */
export function bucketOf(flag: string, subject: string): number {
  const digest = createHash('sha256').update(`${flag}:${subject}`).digest();
  // 32 bits of the digest, scaled — plenty of resolution for a percentage and cheap to compute.
  const value = digest.readUInt32BE(0) / 0xff_ff_ff_ff;
  return value * 100;
}

function clampPercentage(percentage: number): number {
  return Math.min(100, Math.max(0, percentage));
}
