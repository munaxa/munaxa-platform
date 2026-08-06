import type { TenantId, UserId } from '@munaxa/types';

/**
 * A role definition.
 *
 * Roles are per-tenant by design, with `inherits` forming a directed acyclic graph rather than a
 * single chain — "support-lead" is usually "support" plus "reporting", not a link in a line.
 * The resolver rejects cycles at registration rather than looping at request time.
 */
export interface RoleDefinition {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description?: string;
  /** Permission strings, `resource:action`, wildcards allowed. */
  readonly permissions: readonly string[];
  readonly inherits?: readonly string[];
  /** System roles cannot be edited or deleted by tenant administrators. */
  readonly system?: boolean;
}

export interface RoleAssignment {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly roleId: string;
  readonly assignedAt: number;
  readonly assignedBy?: UserId;
  readonly expiresAt?: number;
  /** Optional scope, e.g. a workspace or course the role applies within. */
  readonly scope?: string;
}

export interface RoleRepositoryPort {
  list(tenantId: TenantId): Promise<readonly RoleDefinition[]>;
  get(tenantId: TenantId, roleId: string): Promise<RoleDefinition | undefined>;
  save(role: RoleDefinition): Promise<void>;
  remove(tenantId: TenantId, roleId: string): Promise<boolean>;
}

export interface RoleAssignmentPort {
  listForUser(tenantId: TenantId, userId: UserId): Promise<readonly RoleAssignment[]>;
  assign(assignment: RoleAssignment): Promise<void>;
  revoke(tenantId: TenantId, userId: UserId, roleId: string, scope?: string): Promise<boolean>;
}
