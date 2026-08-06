import type { RoleAssignment, RoleDefinition } from '@munaxa/interfaces';
import { PlatformError, type TenantId } from '@munaxa/types';
import { assertValidGrant, normalizeGrants } from './permissions.js';

/**
 * The role graph for one tenant.
 *
 * Inheritance is a DAG, not a chain: `support-lead` inherits `support` and `reporting`. Cycles
 * are rejected when the graph is built rather than detected when a request happens to traverse
 * one — an infinite loop inside an authorization check is an outage, and it would arrive at the
 * worst possible moment.
 */
export class RoleHierarchy {
  readonly tenantId: TenantId;
  readonly #roles = new Map<string, RoleDefinition>();
  /** Memoised effective permissions per role. Cleared whenever the graph changes. */
  #effective = new Map<string, readonly string[]>();

  constructor(tenantId: TenantId, roles: readonly RoleDefinition[] = []) {
    this.tenantId = tenantId;
    for (const role of roles) this.#insert(role);
    this.#assertAcyclic();
  }

  add(role: RoleDefinition): this {
    this.#insert(role);
    this.#assertAcyclic();
    this.#effective = new Map();
    return this;
  }

  remove(roleId: string): boolean {
    const removed = this.#roles.delete(roleId);
    if (removed) this.#effective = new Map();
    return removed;
  }

  get(roleId: string): RoleDefinition | undefined {
    return this.#roles.get(roleId);
  }

  get roles(): readonly RoleDefinition[] {
    return [...this.#roles.values()];
  }

  /**
   * Every permission a role confers, including inherited ones.
   *
   * An unknown parent is skipped rather than throwing: role graphs are edited by administrators
   * through a UI, and a dangling reference must degrade to fewer permissions, never to a broken
   * authorization check that fails open or takes the service down.
   */
  effectivePermissions(roleId: string): readonly string[] {
    const cached = this.#effective.get(roleId);
    if (cached) return cached;

    const collected = new Set<string>();
    const visited = new Set<string>();

    const walk = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const role = this.#roles.get(id);
      if (!role) return;
      for (const permission of role.permissions) collected.add(permission);
      for (const parent of role.inherits ?? []) walk(parent);
    };

    walk(roleId);
    const normalized = normalizeGrants(collected);
    this.#effective.set(roleId, normalized);
    return normalized;
  }

  /** The transitive closure of a role's ancestors, for rendering "inherits from" in a UI. */
  ancestors(roleId: string): readonly string[] {
    const found = new Set<string>();
    const walk = (id: string): void => {
      for (const parent of this.#roles.get(id)?.inherits ?? []) {
        if (found.has(parent)) continue;
        found.add(parent);
        walk(parent);
      }
    };
    walk(roleId);
    return [...found];
  }

  #insert(role: RoleDefinition): void {
    if (role.tenantId !== this.tenantId) {
      throw new PlatformError(
        `Role ${role.id} belongs to tenant ${role.tenantId}, not ${this.tenantId}`,
        { code: 'TENANT_MISMATCH' },
      );
    }
    for (const permission of role.permissions) assertValidGrant(permission);
    this.#roles.set(role.id, role);
  }

  #assertAcyclic(): void {
    const state = new Map<string, 'visiting' | 'done'>();

    const visit = (id: string, path: readonly string[]): void => {
      const current = state.get(id);
      if (current === 'done') return;
      if (current === 'visiting') {
        throw new PlatformError(`Role inheritance cycle: ${[...path, id].join(' → ')}`, {
          code: 'CONFIG_INVALID',
          details: { cycle: [...path, id] },
        });
      }
      state.set(id, 'visiting');
      for (const parent of this.#roles.get(id)?.inherits ?? []) visit(parent, [...path, id]);
      state.set(id, 'done');
    };

    for (const id of this.#roles.keys()) visit(id, []);
  }
}

/**
 * The roles every product starts with.
 *
 * Shipping them means "admin" means the same thing in Docs and in School, and that an
 * administrator moving between products does not have to learn a new vocabulary. Products add
 * their own; they do not redefine these.
 */
export function defaultRoles(tenantId: TenantId): readonly RoleDefinition[] {
  return [
    {
      id: 'viewer',
      tenantId,
      name: 'Viewer',
      description: 'Read-only access to the resources they are granted.',
      permissions: [],
      system: true,
    },
    {
      id: 'member',
      tenantId,
      name: 'Member',
      description: 'Ordinary authenticated use of the product.',
      permissions: ['profile:read', 'profile:update', 'session:read', 'session:revoke'],
      inherits: ['viewer'],
      system: true,
    },
    {
      id: 'auditor',
      tenantId,
      name: 'Auditor',
      description: 'Reads the audit trail. Grants no access to the data being audited.',
      permissions: ['audit:read', 'audit:export'],
      inherits: ['viewer'],
      system: true,
    },
    {
      id: 'admin',
      tenantId,
      name: 'Administrator',
      description: 'Administers the tenant: users, roles and security policy.',
      permissions: [
        'users:*',
        'roles:*',
        'sessions:*',
        'security:policy:read',
        'security:policy:update',
        'audit:read',
      ],
      inherits: ['member'],
      system: true,
    },
    {
      id: 'owner',
      tenantId,
      name: 'Owner',
      description: 'Everything an administrator can do, plus tenant configuration and deletion.',
      permissions: ['tenant:*'],
      inherits: ['admin', 'auditor'],
      system: true,
    },
  ];
}

/** True when the assignment is currently in force. */
export function isAssignmentActive(assignment: RoleAssignment, now: number): boolean {
  return assignment.expiresAt === undefined || assignment.expiresAt > now;
}
