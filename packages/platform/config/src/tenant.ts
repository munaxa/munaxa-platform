import type { TenantConfigPort } from '@munaxa/interfaces';
import { ROOT_TENANT_ID, type TenantId } from '@munaxa/types';

/**
 * Layered configuration: platform defaults, then application overrides, then per-tenant values.
 *
 * Security settings are the reason for the layering. A session timeout, a password policy or an
 * MFA requirement is a platform default that an application may tighten and a tenant may tighten
 * further — a bank tenant on a shared deployment needs 15-minute idle timeouts without forcing
 * them on everyone. `resolve` walks the layers most-specific first.
 */
export class LayeredConfig implements TenantConfigPort {
  readonly #defaults: Map<string, unknown>;
  readonly #application: Map<string, unknown>;
  readonly #tenants = new Map<TenantId, Map<string, unknown>>();

  constructor(
    defaults: Readonly<Record<string, unknown>> = {},
    application: Readonly<Record<string, unknown>> = {},
  ) {
    this.#defaults = new Map(Object.entries(defaults));
    this.#application = new Map(Object.entries(application));
  }

  /** Synchronous resolution for the request path; `get` is the async port method. */
  resolve<T>(tenantId: TenantId, key: string): T | undefined {
    const tenant = this.#tenants.get(tenantId);
    if (tenant?.has(key)) return tenant.get(key) as T;
    if (this.#application.has(key)) return this.#application.get(key) as T;
    return this.#defaults.get(key) as T | undefined;
  }

  resolveOr<T>(tenantId: TenantId, key: string, fallback: T): T {
    return this.resolve<T>(tenantId, key) ?? fallback;
  }

  async get<T>(tenantId: TenantId, key: string): Promise<T | undefined> {
    return this.resolve<T>(tenantId, key);
  }

  async getAll(tenantId: TenantId): Promise<Readonly<Record<string, unknown>>> {
    return {
      ...Object.fromEntries(this.#defaults),
      ...Object.fromEntries(this.#application),
      ...Object.fromEntries(this.#tenants.get(tenantId) ?? []),
    };
  }

  async set<T>(tenantId: TenantId, key: string, value: T): Promise<void> {
    this.setTenantValue(tenantId, key, value);
  }

  setTenantValue<T>(tenantId: TenantId, key: string, value: T): this {
    const tenant = this.#tenants.get(tenantId) ?? new Map<string, unknown>();
    tenant.set(key, value);
    this.#tenants.set(tenantId, tenant);
    return this;
  }

  setApplicationValue<T>(key: string, value: T): this {
    this.#application.set(key, value);
    return this;
  }

  /** Which layer a value came from. Answers "why is this tenant behaving differently?" */
  originOf(tenantId: TenantId, key: string): 'tenant' | 'application' | 'default' | 'unset' {
    if (this.#tenants.get(tenantId)?.has(key)) return 'tenant';
    if (this.#application.has(key)) return 'application';
    if (this.#defaults.has(key)) return 'default';
    return 'unset';
  }

  get tenantIds(): readonly TenantId[] {
    return [...this.#tenants.keys()];
  }
}

/**
 * A tenant registry.
 *
 * Small on purpose: the platform needs to know a tenant exists, whether it is active, and how it
 * is isolated. Everything else about a tenant — its name, its plan, its billing — is product data.
 */
export interface TenantRecord {
  readonly id: TenantId;
  readonly displayName?: string;
  readonly isolationMode: 'shared' | 'dedicated';
  readonly status: 'active' | 'suspended';
  readonly createdAt?: number;
}

export class TenantRegistry {
  readonly #tenants = new Map<TenantId, TenantRecord>();

  constructor(tenants: readonly TenantRecord[] = []) {
    for (const tenant of tenants) this.#tenants.set(tenant.id, tenant);
    if (!this.#tenants.has(ROOT_TENANT_ID)) {
      // Single-tenant deployments still resolve a tenant, so every code path is uniform.
      this.#tenants.set(ROOT_TENANT_ID, {
        id: ROOT_TENANT_ID,
        isolationMode: 'dedicated',
        status: 'active',
      });
    }
  }

  add(tenant: TenantRecord): this {
    this.#tenants.set(tenant.id, tenant);
    return this;
  }

  get(tenantId: TenantId): TenantRecord | undefined {
    return this.#tenants.get(tenantId);
  }

  /** True only for a tenant that exists and is active — suspended tenants must not authenticate. */
  isActive(tenantId: TenantId): boolean {
    return this.#tenants.get(tenantId)?.status === 'active';
  }

  list(): readonly TenantRecord[] {
    return [...this.#tenants.values()];
  }
}
