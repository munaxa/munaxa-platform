import {
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type Principal,
  type SecurityContext,
  type UserId,
} from '@munaxa/types';
import {
  MemoryRoleAssignments,
  MemoryRoleRepository,
  PermissionResolver,
  defaultRoles,
} from '../src/index.js';

export const USER = unsafeId<UserId>('u1');

export function userContext(
  permissions?: readonly string[],
  overrides: Partial<Principal> = {},
): SecurityContext {
  const principal = {
    kind: 'user',
    tenantId: ROOT_TENANT_ID,
    userId: USER,
    ...(permissions === undefined ? {} : { permissions }),
    ...overrides,
  } as Principal;

  return {
    tenantId: ROOT_TENANT_ID,
    principal,
    correlationId: unsafeId<CorrelationId>('corr-1'),
  };
}

export function resolverFixture(): {
  resolver: PermissionResolver;
  roles: MemoryRoleRepository;
  assignments: MemoryRoleAssignments;
} {
  const roles = new MemoryRoleRepository(defaultRoles(ROOT_TENANT_ID));
  const assignments = new MemoryRoleAssignments();
  const resolver = new PermissionResolver({ roles, assignments, clock: { now: () => 1_000 } });
  return { resolver, roles, assignments };
}
