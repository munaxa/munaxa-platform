import {
  PlatformError,
  principalSubject,
  type PlatformMiddleware,
  type PlatformRequest,
  type SecurityContext,
} from '@munaxa/types';
import { hasAllPermissions, hasAnyPermission } from './permissions.js';
import {
  PolicyEngine,
  type PolicyDecision,
  type PolicyRequest,
  type PolicyResource,
} from './policy.js';
import type { PermissionResolver } from './resolver.js';

/**
 * The authorization check itself.
 *
 * Deny by default: a principal with no resolved permissions is denied, an anonymous principal is
 * denied, and an error while resolving is a denial rather than a pass. Every denial is recorded —
 * `authz.permission.denied` is one of the highest-signal events in the trail, because a legitimate
 * user rarely triggers it and an attacker probing an API triggers it constantly.
 */
export interface AuthorizerOptions {
  readonly resolver: PermissionResolver;
  readonly policies?: PolicyEngine;
  /**
   * Called for every decision. Wire it to `AuditService.record` to get
   * `authz.permission.denied` in the trail; the hook is a callback rather than an
   * `AuditService` so this package stays free of a dependency on `@munaxa/audit`.
   */
  readonly onDecision?: (
    decision: PolicyDecision,
    context: SecurityContext,
    input: AuthorizeInput,
  ) => void | Promise<void>;
}

export interface AuthorizeInput {
  readonly permission: string;
  readonly resource?: PolicyResource;
  readonly environment?: Readonly<Record<string, unknown>>;
}

export class Authorizer {
  readonly #resolver: PermissionResolver;
  readonly #policies: PolicyEngine;
  readonly #onDecision: AuthorizerOptions['onDecision'];

  constructor(options: AuthorizerOptions) {
    this.#resolver = options.resolver;
    this.#policies = options.policies ?? new PolicyEngine();
    this.#onDecision = options.onDecision;
  }

  /** Resolve, evaluate, and return the decision without throwing. */
  async check(context: SecurityContext, input: AuthorizeInput): Promise<PolicyDecision> {
    const principal = context.principal;

    if (principal.kind === 'anonymous') {
      return this.#report({ allowed: false, reason: 'no-grant' }, context, input);
    }

    // A principal may arrive with permissions already attached — from a verified token, or an
    // API key's scopes. Those are used directly; anything else is resolved from role assignments.
    const grants =
      principal.permissions ??
      (principal.kind === 'user'
        ? (await this.#resolver.resolve(context.tenantId, principal.userId)).permissions
        : []);

    const request: PolicyRequest = {
      context,
      permission: input.permission,
      ...(input.resource === undefined ? {} : { resource: input.resource }),
      ...(input.environment === undefined ? {} : { environment: input.environment }),
    };

    return this.#report(this.#policies.evaluate(request, grants), context, input);
  }

  async #report(
    decision: PolicyDecision,
    context: SecurityContext,
    input: AuthorizeInput,
  ): Promise<PolicyDecision> {
    await this.#onDecision?.(decision, context, input);
    return decision;
  }

  /** Throw `AUTHZ_PERMISSION_DENIED` unless the check passes. The form most call sites want. */
  async require(context: SecurityContext, input: AuthorizeInput): Promise<void> {
    const decision = await this.check(context, input);
    if (decision.allowed) return;

    throw new PlatformError(
      `${principalSubject(context.principal)} lacks ${input.permission}${
        input.resource ? ` on ${input.resource.type}:${input.resource.id}` : ''
      }`,
      {
        // Always the same code, whatever denied. `AUTHZ_POLICY_DENIED` exists for internal
        // reporting, but returning it here would tell a caller that a *policy* rejected them —
        // which is the difference between "you lack a role" and "a rule targets this resource",
        // and enough to map an API by probing. The reason survives in `details`, for the log.
        code: 'AUTHZ_PERMISSION_DENIED',
        details: {
          permission: input.permission,
          reason: decision.reason,
          ...(decision.policyId === undefined ? {} : { policyId: decision.policyId }),
        },
      },
    );
  }
}

/** Guard against a set of permissions the caller already resolved. Synchronous, for hot paths. */
export function requirePermissions(
  context: SecurityContext,
  required: readonly string[],
  options: { mode?: 'all' | 'any' } = {},
): void {
  const grants = context.principal.permissions ?? [];
  const satisfied =
    options.mode === 'any'
      ? hasAnyPermission(grants, required)
      : hasAllPermissions(grants, required);

  if (!satisfied) {
    throw new PlatformError(`Missing ${options.mode === 'any' ? 'any of' : 'all of'} ${required.join(', ')}`, {
      code: 'AUTHZ_PERMISSION_DENIED',
      details: { required, mode: options.mode ?? 'all' },
    });
  }
}

/**
 * A method decorator for products on `experimentalDecorators` (every NestJS product here).
 *
 * The decorated method must take a `SecurityContext` first — the same rule `@Audited` follows,
 * and for the same reason: an authorization decision needs a principal, and taking it from an
 * ambient global is how a background job ends up running as the last user who logged in.
 */
export function RequirePermissions(...required: readonly string[]) {
  return function decorate(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (context: SecurityContext, ...args: unknown[]) => unknown;
    if (typeof original !== 'function') {
      throw new TypeError('@RequirePermissions can only decorate a method');
    }

    descriptor.value = function guarded(this: unknown, context: SecurityContext, ...args: unknown[]) {
      requirePermissions(context, required);
      return original.call(this, context, ...args);
    };
    return descriptor;
  };
}

/**
 * Authorization middleware.
 *
 * Maps a request to the permission it needs and enforces it before the handler runs. Returning a
 * 403 here rather than in each handler means an endpoint added without a permission mapping is
 * denied, not silently public — provided `fallbackDeny` is left on, which is why it defaults to
 * true and why turning it off requires saying so.
 */
export interface AuthorizationMiddlewareOptions {
  readonly authorizer: Authorizer;
  readonly resolveContext: (request: PlatformRequest) => SecurityContext | undefined;
  /** The permission an endpoint requires, or undefined for a public one. */
  readonly permissionFor: (request: PlatformRequest) => string | undefined;
  /** Deny requests whose endpoint has no mapping. Default true. */
  readonly fallbackDeny?: boolean;
}

export function authorizationMiddleware(
  options: AuthorizationMiddlewareOptions,
): PlatformMiddleware {
  const fallbackDeny = options.fallbackDeny ?? true;

  return async (request, response) => {
    const permission = options.permissionFor(request);
    if (permission === undefined) {
      if (!fallbackDeny) return undefined;
      return { ...response, status: 403, body: { code: 'AUTHZ_PERMISSION_DENIED' } };
    }

    const context = options.resolveContext(request);
    if (!context) {
      return { ...response, status: 401, body: { code: 'AUTH_TOKEN_INVALID' } };
    }

    const decision = await options.authorizer.check(context, { permission });
    if (decision.allowed) return undefined;

    return { ...response, status: 403, body: { code: 'AUTHZ_PERMISSION_DENIED' } };
  };
}
