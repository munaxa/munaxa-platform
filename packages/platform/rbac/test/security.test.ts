import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import {
  Authorizer,
  BASELINE_POLICIES,
  MemoryRoleRepository,
  PolicyEngine,
  RoleHierarchy,
  defaultRoles,
  grantCovers,
  hasPermission,
} from '../src/index.js';
import { USER, resolverFixture, userContext } from './helpers.js';

describe('deny by default', () => {
  it('denies when nothing grants', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({ resolver });
    for (const permission of ['users:delete', 'tenant:delete', 'audit:read', 'documents:read']) {
      await expect(authorizer.check(userContext(), { permission })).resolves.toMatchObject({
        allowed: false,
      });
    }
  });

  it('denies a principal carrying an empty permission list', () => {
    expect(hasPermission([], 'anything:at:all')).toBe(false);
  });

  it('cannot be tricked by a permission that looks like a prefix', () => {
    // `documents-admin:*` must not cover `documents:read`, and vice versa.
    expect(grantCovers('documents-admin:*', 'documents:read')).toBe(false);
    expect(grantCovers('documents:*', 'documents-admin:read')).toBe(false);
    expect(grantCovers('doc:*', 'documents:read')).toBe(false);
  });

  it('does not let a deeper grant imply a shallower one', () => {
    // Being a grader on one course must not make you a grader everywhere.
    expect(grantCovers('courses:grade:course-1', 'courses:grade')).toBe(false);
  });
});

describe('privilege escalation', () => {
  it('stops a user from assigning themselves a role', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({
      resolver,
      policies: new PolicyEngine([...BASELINE_POLICIES]),
    });

    const decision = await authorizer.check(userContext(['roles:*']), {
      permission: 'roles:assign',
      resource: { type: 'user', id: USER, ownerId: USER },
    });
    expect(decision.allowed).toBe(false);
  });

  it('stops a machine principal from changing security policy even with a wildcard scope', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({
      resolver,
      policies: new PolicyEngine([...BASELINE_POLICIES]),
    });

    for (const kind of ['service', 'api-key', 'system'] as const) {
      const principal =
        kind === 'service'
          ? { kind, tenantId: ROOT_TENANT_ID, clientId: 'c1' as never, scopes: ['*'], permissions: ['*'] }
          : kind === 'api-key'
            ? { kind, tenantId: ROOT_TENANT_ID, keyId: 'k1', scopes: ['*'], permissions: ['*'] }
            : { kind, tenantId: ROOT_TENANT_ID, component: 'job', permissions: ['*'] };

      const decision = await authorizer.check(
        { ...userContext(), principal },
        { permission: 'security:policy:update' },
      );
      expect(decision.allowed, kind).toBe(false);
    }
  });

  it('refuses to delete a system role out from under the platform’s own guards', async () => {
    const repository = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    expect(await repository.remove(ROOT_TENANT_ID, 'admin')).toBe(false);
    expect(await repository.get(ROOT_TENANT_ID, 'admin')).toBeDefined();
  });

  it('does not let a wildcard grant bypass an explicit deny', () => {
    const engine = new PolicyEngine([
      { id: 'deny-exports', effect: 'deny', permissions: ['data:export'] },
    ]);
    expect(engine.evaluate({ context: userContext(), permission: 'data:export' }, ['*']).allowed).toBe(
      false,
    );
  });

  it('applies deny-overrides regardless of policy order', () => {
    const allowFirst = new PolicyEngine([
      { id: 'allow', effect: 'allow', permissions: ['x:read'] },
      { id: 'deny', effect: 'deny', permissions: ['x:read'] },
    ]);
    const denyFirst = new PolicyEngine([
      { id: 'deny', effect: 'deny', permissions: ['x:read'] },
      { id: 'allow', effect: 'allow', permissions: ['x:read'] },
    ]);

    const request = { context: userContext(), permission: 'x:read' };
    expect(allowFirst.evaluate(request, ['x:*']).allowed).toBe(false);
    expect(denyFirst.evaluate(request, ['x:*']).allowed).toBe(false);
  });
});

describe('tenant isolation', () => {
  it('refuses to build a hierarchy mixing tenants', () => {
    expect(
      () =>
        new RoleHierarchy(ROOT_TENANT_ID, [
          ...defaultRoles(ROOT_TENANT_ID),
          { id: 'x', tenantId: toTenantId('acme'), name: 'X', permissions: ['*'] },
        ]),
    ).toThrow(/TENANT|not root/i);
  });

  it('does not resolve a role defined in another tenant', async () => {
    const { resolver, assignments } = resolverFixture();
    await assignments.assign({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      roleId: 'admin-from-acme',
      assignedAt: 0,
    });

    // The assignment names a role this tenant does not define: it contributes nothing.
    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).permissions).toEqual([]);
  });
});

describe('denials leak nothing', () => {
  it('produces an identical public response for every denial reason', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({
      resolver,
      policies: new PolicyEngine([{ id: 'deny-all', effect: 'deny', permissions: ['secret:read'] }]),
    });

    const messages = new Set<string>();
    for (const permission of ['secret:read', 'nonexistent:action']) {
      try {
        await authorizer.require(userContext(), { permission });
      } catch (error) {
        messages.add(JSON.stringify((error as { toPublicJSON(): unknown }).toPublicJSON()));
      }
    }

    // Whether a resource exists, and whether a policy or a missing role denied, are both
    // information an attacker can use to map an API. The public answer is the same either way.
    expect(messages.size).toBe(1);
  });
});
