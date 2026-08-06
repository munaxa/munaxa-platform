import type { TenantId } from '@munaxa/types';

/**
 * Secret material resolution.
 *
 * Deliberately async: a process-env implementation resolves immediately, while AWS Secrets
 * Manager, Azure Key Vault, GCP Secret Manager and Vault all need a round trip. Making the
 * synchronous case the interface would have locked the ecosystem to environment variables.
 */
export interface SecretsPort {
  get(name: string): Promise<string | undefined>;
  /** Throws `CONFIG_INVALID` when absent — the right behaviour at startup. */
  require(name: string): Promise<string>;
  /** Signals the provider to drop cached values after an external rotation. */
  invalidate?(name?: string): Promise<void>;
}

export interface FeatureFlagPort {
  isEnabled(flag: string, context?: FeatureFlagContext): Promise<boolean>;
  variant<T = string>(flag: string, context?: FeatureFlagContext): Promise<T | undefined>;
}

export interface FeatureFlagContext {
  readonly tenantId?: TenantId;
  readonly userId?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface TenantConfigPort {
  get<T>(tenantId: TenantId, key: string): Promise<T | undefined>;
  getAll(tenantId: TenantId): Promise<Readonly<Record<string, unknown>>>;
  set<T>(tenantId: TenantId, key: string, value: T): Promise<void>;
}

/**
 * Randomness, as a port.
 *
 * Production always uses `node:crypto`. The seam exists so tests can make token generation
 * deterministic without monkey-patching a global — and so a deployment on a runtime with a
 * different CSPRNG has somewhere to plug it in.
 */
export interface RandomPort {
  bytes(length: number): Uint8Array;
  /** Uniform in [0, maxExclusive). Must be rejection-sampled, not modulo-biased. */
  int(maxExclusive: number): number;
  uuid(): string;
}

export interface IdGeneratorPort {
  /** Sortable, collision-resistant identifier. */
  next(prefix?: string): string;
}

/**
 * The minimum HTTP client the platform needs to talk to an identity provider.
 *
 * Small enough that `fetch`, undici, axios or a corporate-proxy-aware client all satisfy it in a
 * handful of lines, and small enough that the platform never depends on any of them.
 */
export interface HttpClientPort {
  request(request: OutboundHttpRequest): Promise<OutboundHttpResponse>;
}

export interface OutboundHttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
}

export interface OutboundHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}
