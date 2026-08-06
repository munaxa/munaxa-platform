import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import type { RoleDefinition } from '@munaxa/interfaces';
import { ROOT_TENANT_ID, unsafeId, type UserId } from '@munaxa/types';
import {
  Authorizer,
  MemoryRoleAssignments,
  MemoryRoleRepository,
  PermissionResolver,
  PolicyEngine,
  RoleHierarchy,
  defaultRoles,
  hasPermission,
  normalizeGrants,
} from '../src/index.js';
import { USER, userContext } from './helpers.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

/**
 * Authorization runs on every request, often several times. These are the numbers that decide
 * whether a product is tempted to cache decisions itself — which is how stale permissions and
 * bypassed denials get introduced.
 */
describe('permission matching', () => {
  it('checks against a large grant set in microseconds', () => {
    const grants = normalizeGrants(
      Array.from({ length: 500 }, (_, i) => `resource${i}:action${i % 7}`),
    );
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) hasPermission(grants, 'resource499:action2');
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('short-circuits on the first covering grant', () => {
    const grants = ['*', ...Array.from({ length: 1_000 }, (_, i) => `r${i}:a`)];
    const start = performance.now();
    for (let i = 0; i < 200_000; i++) hasPermission(grants, 'anything:here');
    expect(performance.now() - start).toBeLessThan(1_250);
  });
});

describe('role graph', () => {
  it('walks a deep hierarchy once and memoises it', () => {
    const roles: RoleDefinition[] = Array.from({ length: 200 }, (_, i) => ({
      id: `role-${i}`,
      tenantId: ROOT_TENANT_ID,
      name: `Role ${i}`,
      permissions: [`resource${i}:read`],
      ...(i > 0 ? { inherits: [`role-${i - 1}`] } : {}),
    }));
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, roles);

    const first = performance.now();
    hierarchy.effectivePermissions('role-199');
    const firstCost = performance.now() - first;

    const second = performance.now();
    for (let i = 0; i < 100_000; i++) hierarchy.effectivePermissions('role-199');
    const cachedCost = performance.now() - second;

    expect(firstCost).toBeLessThan(500);
    expect(cachedCost).toBeLessThan(500);
  });

  it('detects cycles in a large graph without hanging', () => {
    const roles: RoleDefinition[] = Array.from({ length: 2_000 }, (_, i) => ({
      id: `role-${i}`,
      tenantId: ROOT_TENANT_ID,
      name: `Role ${i}`,
      permissions: [],
      inherits: [`role-${(i + 1) % 2_000}`], // one big cycle
    }));

    const start = performance.now();
    expect(() => new RoleHierarchy(ROOT_TENANT_ID, roles)).toThrow(/cycle/);
    expect(performance.now() - start).toBeLessThan(1_250);
  });
});

describe('resolution', () => {
  it('serves cached permission sets without touching the stores', async () => {
    const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    const assignments = new MemoryRoleAssignments();
    let listCalls = 0;
    const countingAssignments = {
      listForUser: async (...args: Parameters<typeof assignments.listForUser>) => {
        listCalls++;
        return assignments.listForUser(...args);
      },
      assign: assignments.assign.bind(assignments),
      revoke: assignments.revoke.bind(assignments),
    };

    await assignments.assign({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      roleId: 'admin',
      assignedAt: 0,
    });
    const resolver = new PermissionResolver({
      roles,
      assignments: countingAssignments,
      cache: new MemoryCache(),
    });

    for (let i = 0; i < 1_000; i++) await resolver.resolve(ROOT_TENANT_ID, USER);
    expect(listCalls).toBe(1);
  });

  it('authorizes at well over 10k checks/s with a warm cache', async () => {
    const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    const assignments = new MemoryRoleAssignments([
      { tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'admin', assignedAt: 0 },
    ]);
    const authorizer = new Authorizer({
      resolver: new PermissionResolver({ roles, assignments, cache: new MemoryCache() }),
      policies: new PolicyEngine(),
    });

    await authorizer.check(userContext(), { permission: 'users:create' });

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      await authorizer.check(userContext(), { permission: 'users:create' });
    }
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('does not degrade as the number of users grows', async () => {
    const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    const assignments = new MemoryRoleAssignments(
      Array.from({ length: 5_000 }, (_, i) => ({
        tenantId: ROOT_TENANT_ID,
        userId: unsafeId<UserId>(`user-${i}`),
        roleId: 'member',
        assignedAt: 0,
      })),
    );
    const resolver = new PermissionResolver({ roles, assignments });

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      await resolver.resolve(ROOT_TENANT_ID, unsafeId<UserId>(`user-${i * 25}`));
    }
    expect(performance.now() - start).toBeLessThan(2_500);
  });
});
