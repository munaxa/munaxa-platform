import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import {
  InvalidPermissionError,
  PolicyEngine,
  RoleHierarchy,
  assertValidCheck,
  conditions,
  defaultRoles,
  grantCovers,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  normalizeGrants,
} from '../src/index.js';
import { USER, resolverFixture, userContext } from './helpers.js';

describe('permission matching', () => {
  it.each([
    ['documents:read', 'documents:read', true],
    ['documents:*', 'documents:read', true],
    ['documents:*', 'documents:read:own', true],
    ['*', 'anything:at:all', true],
    ['documents:read', 'documents:write', false],
    ['documents:*', 'courses:read', false],
    ['documents:read', 'documents:read:own', false],
    ['documents:read:own', 'documents:read', false],
    ['documents', 'documents:read', false],
  ])('%s covers %s → %s', (grant, required, expected) => {
    expect(grantCovers(grant, required)).toBe(expected);
  });

  it('checks against a set of grants', () => {
    const grants = ['documents:read', 'courses:*'];
    expect(hasPermission(grants, 'courses:grade')).toBe(true);
    expect(hasPermission(grants, 'documents:write')).toBe(false);
    expect(hasAllPermissions(grants, ['documents:read', 'courses:grade'])).toBe(true);
    expect(hasAllPermissions(grants, ['documents:read', 'users:delete'])).toBe(false);
    expect(hasAnyPermission(grants, ['users:delete', 'courses:grade'])).toBe(true);
  });

  it('refuses a wildcard in a check', () => {
    // Asking "does the user have documents:*" has no correct answer, and answering it is how a
    // check accidentally passes for someone granted only documents:read.
    expect(() => assertValidCheck('documents:*')).toThrow(InvalidPermissionError);
    expect(() => hasPermission(['documents:read'], 'documents:*')).toThrow(InvalidPermissionError);
  });

  it.each(['', 'Documents:Read', 'documents read', 'documents::read', 'a'.repeat(201)])(
    'rejects the malformed grant %j',
    (grant) => {
      expect(() => assertValidCheck(grant)).toThrow(InvalidPermissionError);
    },
  );

  it('collapses grants covered by a broader one', () => {
    expect(normalizeGrants(['documents:*', 'documents:read', 'courses:read'])).toEqual([
      'courses:read',
      'documents:*',
    ]);
    expect(normalizeGrants(['a:b', 'a:b'])).toEqual(['a:b']);
  });
});

describe('role hierarchy', () => {
  it('collects permissions through inheritance', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID));
    const admin = hierarchy.effectivePermissions('admin');

    expect(hasPermission(admin, 'users:delete')).toBe(true);
    expect(hasPermission(admin, 'profile:read')).toBe(true); // inherited from member
    expect(hasPermission(admin, 'tenant:delete')).toBe(false); // owner only
  });

  it('supports multiple inheritance', () => {
    const owner = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID)).effectivePermissions(
      'owner',
    );
    expect(hasPermission(owner, 'tenant:delete')).toBe(true);
    expect(hasPermission(owner, 'users:create')).toBe(true); // via admin
    expect(hasPermission(owner, 'audit:export')).toBe(true); // via auditor
  });

  it('rejects a cycle when the graph is built', () => {
    expect(
      () =>
        new RoleHierarchy(ROOT_TENANT_ID, [
          { id: 'a', tenantId: ROOT_TENANT_ID, name: 'A', permissions: [], inherits: ['b'] },
          { id: 'b', tenantId: ROOT_TENANT_ID, name: 'B', permissions: [], inherits: ['a'] },
        ]),
    ).toThrow(/cycle/);
  });

  it('rejects a self-inheriting role', () => {
    expect(
      () =>
        new RoleHierarchy(ROOT_TENANT_ID, [
          { id: 'a', tenantId: ROOT_TENANT_ID, name: 'A', permissions: [], inherits: ['a'] },
        ]),
    ).toThrow(/cycle/);
  });

  it('refuses a role belonging to another tenant', () => {
    expect(
      () =>
        new RoleHierarchy(ROOT_TENANT_ID, [
          { id: 'a', tenantId: toTenantId('other'), name: 'A', permissions: [] },
        ]),
    ).toThrow(/not root/);
  });

  it('degrades to fewer permissions when a parent is missing', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, [
      { id: 'a', tenantId: ROOT_TENANT_ID, name: 'A', permissions: ['x:read'], inherits: ['gone'] },
    ]);
    expect(hierarchy.effectivePermissions('a')).toEqual(['x:read']);
  });

  it('reports ancestors for display', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID));
    expect([...hierarchy.ancestors('owner')].sort()).toEqual(['admin', 'auditor', 'member', 'viewer']);
  });

  it('recomputes after a role changes', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID));
    expect(hasPermission(hierarchy.effectivePermissions('member'), 'reports:read')).toBe(false);

    hierarchy.add({
      id: 'member',
      tenantId: ROOT_TENANT_ID,
      name: 'Member',
      permissions: ['profile:read', 'reports:read'],
      inherits: ['viewer'],
    });
    expect(hasPermission(hierarchy.effectivePermissions('member'), 'reports:read')).toBe(true);
  });
});

describe('permission resolver', () => {
  it('resolves assigned roles into permissions', async () => {
    const { resolver, assignments } = resolverFixture();
    await assignments.assign({ tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'admin', assignedAt: 0 });

    const resolved = await resolver.resolve(ROOT_TENANT_ID, USER);
    expect(resolved.roles).toEqual(['admin']);
    expect(hasPermission(resolved.permissions, 'users:create')).toBe(true);
  });

  it('resolves nothing for a user with no assignments', async () => {
    const { resolver } = resolverFixture();
    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).permissions).toEqual([]);
  });

  it('ignores an expired assignment', async () => {
    const { resolver, assignments } = resolverFixture();
    await assignments.assign({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      roleId: 'admin',
      assignedAt: 0,
      expiresAt: 500, // the fixture clock is at 1000
    });

    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).permissions).toEqual([]);
  });

  it('narrows a scoped assignment to its scope', async () => {
    const { resolver, roles, assignments } = resolverFixture();
    await roles.save({
      id: 'course-admin',
      tenantId: ROOT_TENANT_ID,
      name: 'Course administrator',
      permissions: ['courses:grade'],
    });
    await assignments.assign({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      roleId: 'course-admin',
      assignedAt: 0,
      scope: 'course-42',
    });

    const resolved = await resolver.resolve(ROOT_TENANT_ID, USER);
    expect(resolved.permissions).toEqual(['courses:grade:course-42']);
    expect(hasPermission(resolved.permissions, 'courses:grade:course-42')).toBe(true);
    expect(hasPermission(resolved.permissions, 'courses:grade:course-7')).toBe(false);
  });
});

describe('policy engine', () => {
  const engine = new PolicyEngine([
    {
      id: 'deny-out-of-hours-exports',
      effect: 'deny',
      permissions: ['data:export'],
      condition: (request) => request.environment?.afterHours === true,
    },
    {
      id: 'allow-own-profile',
      effect: 'allow',
      permissions: ['profile:update'],
      resourceTypes: ['user'],
      condition: conditions.isOwner,
    },
  ]);

  it('allows what a role grants', () => {
    expect(engine.evaluate({ context: userContext(), permission: 'documents:read' }, ['documents:*'])).toEqual({
      allowed: true,
      reason: 'allowed-by-role',
    });
  });

  it('denies what no grant covers', () => {
    expect(engine.evaluate({ context: userContext(), permission: 'documents:read' }, []).reason).toBe(
      'no-grant',
    );
  });

  it('lets a policy grant what roles do not', () => {
    const decision = engine.evaluate(
      {
        context: userContext(),
        permission: 'profile:update',
        resource: { type: 'user', id: USER, ownerId: USER },
      },
      [],
    );
    expect(decision).toEqual({ allowed: true, reason: 'allowed-by-policy', policyId: 'allow-own-profile' });
  });

  it('lets a deny override a role grant', () => {
    const decision = engine.evaluate(
      { context: userContext(), permission: 'data:export', environment: { afterHours: true } },
      ['data:*'],
    );
    expect(decision).toEqual({
      allowed: false,
      reason: 'denied-by-policy',
      policyId: 'deny-out-of-hours-exports',
    });
  });

  it('treats a throwing condition as not applying', () => {
    const brittle = new PolicyEngine([
      {
        id: 'brittle',
        effect: 'allow',
        permissions: ['x:read'],
        condition: () => {
          throw new Error('bad predicate');
        },
      },
    ]);
    expect(brittle.evaluate({ context: userContext(), permission: 'x:read' }, []).allowed).toBe(false);
  });

  it('ships conditions that mean the same thing everywhere', () => {
    const request = {
      context: userContext(undefined, { mfaSatisfied: true } as never),
      permission: 'x:read',
      resource: { type: 'user', id: USER, ownerId: USER },
      environment: { riskScore: 20 },
    };

    expect(conditions.isOwner(request)).toBe(true);
    expect(conditions.mfaSatisfied(request)).toBe(true);
    expect(conditions.riskAtMost(30)(request)).toBe(true);
    expect(conditions.riskAtMost(10)(request)).toBe(false);
    expect(conditions.isMachine(request)).toBe(false);
  });
});
