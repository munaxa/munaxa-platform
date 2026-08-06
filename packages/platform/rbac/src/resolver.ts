import type { CachePort, RoleAssignmentPort, RoleRepositoryPort } from '@munaxa/interfaces';
import {
  cacheKey as platformCacheKey,
  systemClock,
  type Clock,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import { RoleHierarchy, isAssignmentActive } from './roles.js';
import { normalizeGrants } from './permissions.js';

/**
 * Resolves a user's effective permissions.
 *
 * Two caches, on purpose:
 *
 * - The **role graph** per tenant, because it changes rarely and is expensive to walk.
 * - The **resolved permission set** per user, because a request may check several permissions and
 *   should not re-resolve for each.
 *
 * Both are invalidated explicitly. A permission cache that only expires by TTL means a revoked
 * role stays effective for the length of that TTL — which is exactly the window an attacker needs
 * after an administrator notices something is wrong. `invalidateUser` is called by every mutation
 * path in this package, and products calling `RoleAssignmentPort` directly must call it too.
 */
export interface PermissionResolverOptions {
  readonly roles: RoleRepositoryPort;
  readonly assignments: RoleAssignmentPort;
  readonly clock?: Clock;
  /**
   * Called when a grant could not be represented and was dropped.
   *
   * Today that means exactly one case: a wildcard permission on a scoped assignment, which cannot
   * be narrowed to the scope. Wire it to a log or an alert — the operator configured something
   * that does not do what it reads as, and resolution succeeding quietly is how that survives.
   */
  readonly onUnrepresentableGrant?: (detail: {
    tenantId: TenantId;
    userId: UserId;
    grants: readonly string[];
  }) => void;
  /** Optional shared cache. Without it, resolution is per-process and per-request. */
  readonly cache?: CachePort;
  /** Lifetime of a cached permission set. Keep it short; revocation is explicit, not by expiry. */
  readonly cacheTtl?: number;
}

export interface ResolvedPermissions {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly resolvedAt: number;
}

export class PermissionResolver {
  readonly #roles: RoleRepositoryPort;
  readonly #assignments: RoleAssignmentPort;
  readonly #clock: Clock;
  readonly #cache: CachePort | undefined;
  readonly #cacheTtl: number;
  readonly #onUnrepresentableGrant: PermissionResolverOptions['onUnrepresentableGrant'];
  readonly #hierarchies = new Map<TenantId, RoleHierarchy>();

  constructor(options: PermissionResolverOptions) {
    this.#roles = options.roles;
    this.#assignments = options.assignments;
    this.#clock = options.clock ?? systemClock;
    this.#cache = options.cache;
    this.#cacheTtl = options.cacheTtl ?? 60_000;
    this.#onUnrepresentableGrant = options.onUnrepresentableGrant;
  }

  async hierarchy(tenantId: TenantId): Promise<RoleHierarchy> {
    const cached = this.#hierarchies.get(tenantId);
    if (cached) return cached;

    const hierarchy = new RoleHierarchy(tenantId, await this.#roles.list(tenantId));
    this.#hierarchies.set(tenantId, hierarchy);
    return hierarchy;
  }

  async resolve(tenantId: TenantId, userId: UserId): Promise<ResolvedPermissions> {
    const key = cacheKey(tenantId, userId);
    const cached = await this.#cache?.get<ResolvedPermissions>(key);
    if (cached) return cached;

    const now = this.#clock.now();
    const hierarchy = await this.hierarchy(tenantId);
    const assignments = (await this.#assignments.listForUser(tenantId, userId)).filter(
      (assignment) => isAssignmentActive(assignment, now),
    );

    const permissions = new Set<string>();
    // Reported rather than dropped in silence: an operator who scoped a wildcard needs to know
    // the grant did not survive resolution.
    const skippedWildcards: string[] = [];
    for (const assignment of assignments) {
      for (const permission of hierarchy.effectivePermissions(assignment.roleId)) {
        // A scoped assignment narrows its role's permissions to that scope, so a course
        // administrator does not become an administrator everywhere.
        //
        // A wildcard cannot be narrowed this way. Suffixing `courses:*` with a scope produces
        // `courses:*:course-42`, where the `*` is no longer trailing and therefore matches
        // nothing — the administrator sees the role assigned and the permission listed, and every
        // check silently denies. Dropping the grant instead is the safe reading of an
        // unrepresentable request: a denial that is visible beats one that is not, and widening
        // it to the whole resource would be the opposite mistake.
        if (assignment.scope === undefined) {
          permissions.add(permission);
        } else if (permission.includes('*')) {
          skippedWildcards.push(`${permission}@${assignment.scope}`);
        } else {
          permissions.add(`${permission}:${assignment.scope}`);
        }
      }
    }

    if (skippedWildcards.length > 0) {
      this.#onUnrepresentableGrant?.({ tenantId, userId, grants: skippedWildcards });
    }

    const resolved: ResolvedPermissions = {
      userId,
      tenantId,
      roles: assignments.map((assignment) => assignment.roleId),
      permissions: normalizeGrants(permissions),
      resolvedAt: now,
    };

    await this.#cache?.set(key, resolved, { ttl: this.#cacheTtl });
    return resolved;
  }

  /** Drop a user's cached permissions. Call after any role change affecting them. */
  async invalidateUser(tenantId: TenantId, userId: UserId): Promise<void> {
    await this.#cache?.delete(cacheKey(tenantId, userId));
  }

  /**
   * Drop a tenant's role graph.
   *
   * Also drops resolved permission sets when the cache can clear a namespace; when it cannot,
   * the sets expire within `cacheTtl`, which is the reason to keep that number small.
   */
  async invalidateTenant(tenantId: TenantId): Promise<void> {
    this.#hierarchies.delete(tenantId);
    await this.#cache?.clear?.(platformCacheKey('rbac', tenantId));
  }
}

function cacheKey(tenantId: TenantId, userId: UserId): string {
  // Escaped, not interpolated: an OIDC-derived tenant id containing ':' would otherwise let one
  // tenant's key collide with another's, and a permission-cache hit across tenants is a grant.
  return platformCacheKey('rbac', tenantId, userId);
}
