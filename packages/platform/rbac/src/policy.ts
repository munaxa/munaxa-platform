import type { Principal, SecurityContext } from '@munaxa/types';
import { hasPermission } from './permissions.js';

/**
 * Policies: the attribute-based layer on top of roles.
 *
 * Roles answer "may this kind of user do this kind of thing". Policies answer the questions roles
 * cannot: *this* document, during business hours, from a managed device, not the requester's own
 * record. Both are needed — a system with only roles ends up with a role per document.
 *
 * Evaluation is **deny-overrides**: any matching deny wins, regardless of order or specificity.
 * Anything else eventually produces a rule that grants what another rule was written to forbid.
 */
export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRequest {
  readonly context: SecurityContext;
  /** The concrete permission being checked, e.g. `documents:update`. */
  readonly permission: string;
  readonly resource?: PolicyResource;
  /** Request-time attributes: time of day, device trust, risk score. */
  readonly environment?: Readonly<Record<string, unknown>>;
}

export interface PolicyResource {
  readonly type: string;
  readonly id: string;
  readonly ownerId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface Policy {
  readonly id: string;
  readonly effect: PolicyEffect;
  readonly description?: string;
  /** Permissions this policy applies to. Wildcards allowed. */
  readonly permissions: readonly string[];
  /** Resource types this policy applies to. Omit for all. */
  readonly resourceTypes?: readonly string[];
  /** Every condition must hold for the policy to apply. */
  readonly condition?: (request: PolicyRequest) => boolean;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: 'allowed-by-role' | 'allowed-by-policy' | 'denied-by-policy' | 'no-grant';
  /** The policy that decided, when one did. */
  readonly policyId?: string;
}

export class PolicyEngine {
  readonly #policies: Policy[] = [];

  constructor(policies: readonly Policy[] = []) {
    this.#policies.push(...policies);
  }

  add(policy: Policy): this {
    this.#policies.push(policy);
    return this;
  }

  get policies(): readonly Policy[] {
    return [...this.#policies];
  }

  /**
   * Decide, given the permissions already resolved for the principal.
   *
   * Order of evaluation: deny policies first (they cannot be overridden), then the role grant,
   * then allow policies (which can grant something roles alone do not).
   */
  evaluate(request: PolicyRequest, grants: readonly string[]): PolicyDecision {
    const applicable = this.#policies.filter((policy) => this.#applies(policy, request));

    const denial = applicable.find((policy) => policy.effect === 'deny');
    if (denial) return { allowed: false, reason: 'denied-by-policy', policyId: denial.id };

    if (hasPermission(grants, request.permission)) {
      return { allowed: true, reason: 'allowed-by-role' };
    }

    const allowance = applicable.find((policy) => policy.effect === 'allow');
    if (allowance) return { allowed: true, reason: 'allowed-by-policy', policyId: allowance.id };

    return { allowed: false, reason: 'no-grant' };
  }

  #applies(policy: Policy, request: PolicyRequest): boolean {
    if (!policy.permissions.some((permission) => matches(permission, request.permission))) {
      return false;
    }
    if (
      policy.resourceTypes &&
      (request.resource === undefined || !policy.resourceTypes.includes(request.resource.type))
    ) {
      return false;
    }
    try {
      return policy.condition ? policy.condition(request) : true;
    } catch {
      // A condition that throws must not accidentally allow. Treat it as not applying, which
      // means an allow policy stops granting and a deny policy stops denying — the safe reading
      // for allow, and for deny it falls through to the role check, which is deny-by-default.
      return false;
    }
  }
}

function matches(pattern: string, permission: string): boolean {
  if (pattern === permission || pattern === '*') return true;
  if (pattern.endsWith(':*')) return permission.startsWith(pattern.slice(0, -1));
  return false;
}

/** Common conditions, so products stop writing subtly different versions of the same predicate. */
export const conditions = {
  /** The principal is acting on their own record. */
  isOwner(request: PolicyRequest): boolean {
    const principal = request.context.principal;
    if (principal.kind !== 'user' || !request.resource?.ownerId) return false;
    return principal.userId === request.resource.ownerId;
  },

  /** A second factor was satisfied in this session. */
  mfaSatisfied(request: PolicyRequest): boolean {
    const principal = request.context.principal;
    return principal.kind === 'user' && principal.mfaSatisfied === true;
  },

  /** The request's risk score is at or below `max`. */
  riskAtMost(max: number) {
    return (request: PolicyRequest): boolean => {
      const score = request.environment?.riskScore;
      return typeof score === 'number' && score <= max;
    };
  },

  /** The principal is a machine, not a person — useful for denying interactive-only actions. */
  isMachine(request: PolicyRequest): boolean {
    return isMachinePrincipal(request.context.principal);
  },

  /** Resource attribute equality. */
  resourceAttribute(key: string, expected: unknown) {
    return (request: PolicyRequest): boolean => request.resource?.attributes?.[key] === expected;
  },
} as const;

export function isMachinePrincipal(principal: Principal): boolean {
  return principal.kind === 'service' || principal.kind === 'api-key' || principal.kind === 'system';
}

/**
 * Policies every product should have.
 *
 * Both are denials, and both encode a rule that is easy to state and easy to forget: an API key
 * must not be able to change authentication settings, and nobody edits their own roles.
 */
export const BASELINE_POLICIES: readonly Policy[] = [
  {
    id: 'deny-machine-security-policy-changes',
    effect: 'deny',
    description: 'Machine principals may not change security policy or MFA settings.',
    permissions: ['security:policy:update', 'users:mfa:update', 'roles:*'],
    condition: conditions.isMachine,
  },
  {
    id: 'deny-self-role-escalation',
    effect: 'deny',
    description: 'A user may not modify their own role assignments.',
    permissions: ['roles:assign', 'roles:revoke'],
    resourceTypes: ['user'],
    condition: conditions.isOwner,
  },
];
