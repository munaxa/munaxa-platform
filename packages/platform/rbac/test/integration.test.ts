import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@munaxa/cache';
import {
  ROOT_TENANT_ID,
  emptyResponse,
  isPlatformError,
  unsafeId,
  type PlatformRequest,
  type UserId,
} from '@munaxa/types';
import {
  Authorizer,
  BASELINE_POLICIES,
  MemoryRoleAssignments,
  MemoryRoleRepository,
  PermissionResolver,
  PolicyEngine,
  RequirePermissions,
  authorizationMiddleware,
  defaultRoles,
  requirePermissions,
} from '../src/index.js';
import { USER, resolverFixture, userContext } from './helpers.js';

describe('authorizer', () => {
  it('allows an assigned role and denies everything else', async () => {
    const { resolver, assignments } = resolverFixture();
    await assignments.assign({ tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'member', assignedAt: 0 });
    const authorizer = new Authorizer({ resolver });

    await expect(authorizer.check(userContext(), { permission: 'profile:read' })).resolves.toMatchObject({
      allowed: true,
    });
    await expect(authorizer.check(userContext(), { permission: 'users:delete' })).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('denies an anonymous principal without consulting the resolver', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({ resolver });

    const decision = await authorizer.check(
      { ...userContext(), principal: { kind: 'anonymous', tenantId: ROOT_TENANT_ID } },
      { permission: 'profile:read' },
    );
    expect(decision).toMatchObject({ allowed: false, reason: 'no-grant' });
  });

  it('throws a typed error whose public message names nothing', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({ resolver });

    try {
      await authorizer.require(userContext(), {
        permission: 'documents:delete',
        resource: { type: 'document', id: 'doc-42' },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      const platformError = error as import('@munaxa/types').PlatformError;
      expect(platformError.code).toBe('AUTHZ_PERMISSION_DENIED');
      expect(platformError.publicMessage).toBe('You do not have access to this.');
      expect(JSON.stringify(platformError.toPublicJSON())).not.toContain('doc-42');
      // The engineer-facing message keeps the detail the log needs.
      expect(platformError.message).toContain('doc-42');
    }
  });

  it('reports every decision to the audit hook', async () => {
    const { resolver, assignments } = resolverFixture();
    await assignments.assign({ tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'member', assignedAt: 0 });

    const decisions: string[] = [];
    const authorizer = new Authorizer({
      resolver,
      onDecision: (decision, _context, input) =>
        void decisions.push(`${input.permission}:${decision.allowed ? 'allow' : 'deny'}`),
    });

    await authorizer.check(userContext(), { permission: 'profile:read' });
    await authorizer.check(userContext(), { permission: 'users:delete' });

    expect(decisions).toEqual(['profile:read:allow', 'users:delete:deny']);
  });

  it('applies the baseline policies', async () => {
    const { resolver } = resolverFixture();
    const authorizer = new Authorizer({ resolver, policies: new PolicyEngine([...BASELINE_POLICIES]) });

    // An API key with a broad scope still cannot change security policy.
    const machine = {
      ...userContext(),
      principal: {
        kind: 'api-key' as const,
        tenantId: ROOT_TENANT_ID,
        keyId: 'key-1',
        scopes: ['*'],
        permissions: ['*'],
      },
    };
    await expect(
      authorizer.check(machine, { permission: 'security:policy:update' }),
    ).resolves.toMatchObject({ allowed: false, reason: 'denied-by-policy' });

    // And a user cannot grant themselves a role, however privileged they are.
    await expect(
      authorizer.check(userContext(['*']), {
        permission: 'roles:assign',
        resource: { type: 'user', id: USER, ownerId: USER },
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'denied-by-policy' });

    // Granting someone else a role is still allowed.
    await expect(
      authorizer.check(userContext(['*']), {
        permission: 'roles:assign',
        resource: { type: 'user', id: 'u2', ownerId: 'u2' },
      }),
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe('resolver caching and revocation', () => {
  it('serves a cached permission set and drops it on revocation', async () => {
    const cache = new MemoryCache();
    const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    const assignments = new MemoryRoleAssignments();
    const resolver = new PermissionResolver({ roles, assignments, cache, cacheTtl: 60_000 });

    await assignments.assign({ tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'admin', assignedAt: 0 });
    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).roles).toEqual(['admin']);

    await assignments.revoke(ROOT_TENANT_ID, USER, 'admin');

    // Still cached — this is the window a TTL-only cache leaves open.
    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).roles).toEqual(['admin']);

    // Explicit invalidation is what closes it, and every mutation path must call it.
    await resolver.invalidateUser(ROOT_TENANT_ID, USER);
    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).roles).toEqual([]);
  });

  it('picks up a changed role graph after tenant invalidation', async () => {
    const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
    const assignments = new MemoryRoleAssignments();
    const resolver = new PermissionResolver({ roles, assignments });
    await assignments.assign({ tenantId: ROOT_TENANT_ID, userId: USER, roleId: 'viewer', assignedAt: 0 });

    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).permissions).toEqual([]);

    await roles.save({
      id: 'viewer',
      tenantId: ROOT_TENANT_ID,
      name: 'Viewer',
      permissions: ['documents:read'],
    });
    await resolver.invalidateTenant(ROOT_TENANT_ID);

    expect((await resolver.resolve(ROOT_TENANT_ID, USER)).permissions).toEqual(['documents:read']);
  });

  it('never lets one tenant’s assignment resolve in another', async () => {
    const other = unsafeId<UserId>('u1');
    const roles = new MemoryRoleRepository([
      ...defaultRoles(ROOT_TENANT_ID),
      ...defaultRoles('acme' as never),
    ]);
    const assignments = new MemoryRoleAssignments([
      { tenantId: ROOT_TENANT_ID, userId: other, roleId: 'admin', assignedAt: 0 },
    ]);
    const resolver = new PermissionResolver({ roles, assignments });

    expect((await resolver.resolve('acme' as never, other)).roles).toEqual([]);
    expect((await resolver.resolve(ROOT_TENANT_ID, other)).roles).toEqual(['admin']);
  });
});

describe('guards', () => {
  it('requirePermissions enforces all-of by default and any-of on request', () => {
    const context = userContext(['documents:read']);
    expect(() => requirePermissions(context, ['documents:read'])).not.toThrow();
    expect(() => requirePermissions(context, ['documents:read', 'documents:write'])).toThrow();
    expect(() =>
      requirePermissions(context, ['documents:read', 'documents:write'], { mode: 'any' }),
    ).not.toThrow();
  });

  it('@RequirePermissions guards a method', () => {
    class DocumentService {
      async remove(_context: ReturnType<typeof userContext>, id: string) {
        return `removed:${id}`;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(DocumentService.prototype, 'remove');
    Object.defineProperty(
      DocumentService.prototype,
      'remove',
      RequirePermissions('documents:delete')(DocumentService.prototype, 'remove', descriptor!),
    );

    const service = new DocumentService();
    expect(() => service.remove(userContext(['documents:read']), 'd1')).toThrow();
    return expect(service.remove(userContext(['documents:delete']), 'd1')).resolves.toBe('removed:d1');
  });
});

describe('authorization middleware', () => {
  const request = (path: string): PlatformRequest => ({ method: 'GET', path, headers: {} });

  it('denies an endpoint with no permission mapping', async () => {
    const { resolver } = resolverFixture();
    const middleware = authorizationMiddleware({
      authorizer: new Authorizer({ resolver }),
      resolveContext: () => userContext(['*']),
      permissionFor: (req) => (req.path === '/documents' ? 'documents:read' : undefined),
    });

    // The point of fail-closed: a route added without a mapping is denied, not public.
    expect(await middleware(request('/newly-added'), emptyResponse())).toMatchObject({ status: 403 });
    expect(await middleware(request('/documents'), emptyResponse())).toBeUndefined();
  });

  it('returns 401 when there is no security context', async () => {
    const { resolver } = resolverFixture();
    const middleware = authorizationMiddleware({
      authorizer: new Authorizer({ resolver }),
      resolveContext: () => undefined,
      permissionFor: () => 'documents:read',
    });

    expect(await middleware(request('/documents'), emptyResponse())).toMatchObject({ status: 401 });
  });
});
