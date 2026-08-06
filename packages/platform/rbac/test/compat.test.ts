import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID } from '@munaxa/types';
import { BASELINE_POLICIES, RoleHierarchy, defaultRoles, grantCovers, hasPermission } from '../src/index.js';

/**
 * Permission strings and role ids are written into databases, into product code, and into
 * customers' own automation. They are the least changeable thing this package publishes: renaming
 * `admin` or changing what `documents:*` covers silently alters who can do what in production.
 */
const ROLE_IDS_1_0 = ['viewer', 'member', 'auditor', 'admin', 'owner'];

const MATCHES_1_0: readonly [string, string, boolean][] = [
  ['documents:*', 'documents:read', true],
  ['documents:*', 'documents:read:own', true],
  ['*', 'anything', true],
  ['documents:read', 'documents:read:own', false],
  ['documents:read:own', 'documents:read', false],
  ['documents', 'documents:read', false],
];

describe('1.0 role catalogue', () => {
  it.each(ROLE_IDS_1_0)('still ships the %s role', (id) => {
    expect(defaultRoles(ROOT_TENANT_ID).map((role) => role.id)).toContain(id);
  });

  it('keeps system roles marked as system, so they cannot be deleted', () => {
    for (const role of defaultRoles(ROOT_TENANT_ID)) {
      expect(role.system, role.id).toBe(true);
    }
  });

  it('keeps the inheritance shape', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID));
    expect(hierarchy.ancestors('admin')).toContain('member');
    expect(hierarchy.ancestors('owner')).toContain('admin');
    expect(hierarchy.ancestors('member')).toContain('viewer');
  });

  it('keeps admin able to manage users and owner able to manage the tenant', () => {
    const hierarchy = new RoleHierarchy(ROOT_TENANT_ID, defaultRoles(ROOT_TENANT_ID));
    expect(hasPermission(hierarchy.effectivePermissions('admin'), 'users:create')).toBe(true);
    expect(hasPermission(hierarchy.effectivePermissions('admin'), 'tenant:delete')).toBe(false);
    expect(hasPermission(hierarchy.effectivePermissions('owner'), 'tenant:delete')).toBe(true);
  });
});

describe('1.0 matching semantics', () => {
  it.each(MATCHES_1_0)('%s covers %s → %s', (grant, required, expected) => {
    expect(grantCovers(grant, required)).toBe(expected);
  });
});

describe('1.0 baseline policies', () => {
  it('still ships both denials, with their ids intact', () => {
    expect(BASELINE_POLICIES.map((policy) => policy.id)).toEqual([
      'deny-machine-security-policy-changes',
      'deny-self-role-escalation',
    ]);
    for (const policy of BASELINE_POLICIES) {
      expect(policy.effect, policy.id).toBe('deny');
    }
  });
});
