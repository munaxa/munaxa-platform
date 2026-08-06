import type { CachePort, CacheSetOptions } from '@munaxa/interfaces';
import type { DurationMs, TenantId } from '@munaxa/types';

/**
 * Key scoping.
 *
 * Two products, or two tenants, sharing a cache and building keys by concatenation is how a
 * session lookup ends up returning another tenant's session. `namespaced()` makes the prefix
 * structural: a consumer holding a scoped cache has no way to reach outside its namespace,
 * because it never sees the full key.
 */
export class NamespacedCache implements CachePort {
  readonly #inner: CachePort;
  readonly #prefix: string;

  constructor(inner: CachePort, namespace: string) {
    if (namespace.includes(':')) {
      // Colons are the separator; allowing them in a namespace makes prefixes ambiguous and
      // therefore forgeable — "a:b" + ":c" and "a" + ":b:c" are the same key.
      throw new TypeError(`Cache namespace must not contain ':', got ${JSON.stringify(namespace)}`);
    }
    this.#inner = inner;
    this.#prefix = `${namespace}:`;
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.#inner.get<T>(this.#prefix + key);
  }

  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    return this.#inner.set(this.#prefix + key, value, options);
  }

  setIfAbsent<T>(key: string, value: T, options?: CacheSetOptions): Promise<boolean> {
    return this.#inner.setIfAbsent(this.#prefix + key, value, options);
  }

  delete(key: string): Promise<boolean> {
    return this.#inner.delete(this.#prefix + key);
  }

  has(key: string): Promise<boolean> {
    return this.#inner.has(this.#prefix + key);
  }

  increment(key: string, by?: number, options?: CacheSetOptions): Promise<number> {
    return this.#inner.increment(this.#prefix + key, by, options);
  }

  ttl(key: string): Promise<DurationMs | undefined> {
    return this.#inner.ttl(this.#prefix + key);
  }

  async clear(): Promise<void> {
    await this.#inner.clear?.(this.#prefix.slice(0, -1));
  }
}

export function namespaced(cache: CachePort, namespace: string): CachePort {
  return new NamespacedCache(cache, namespace);
}

/**
 * Scope a cache to one tenant.
 *
 * Every platform service that caches takes a cache already scoped this way, so a missing tenant
 * check inside a service cannot become a cross-tenant read.
 */
export function forTenant(cache: CachePort, tenantId: TenantId, namespace: string): CachePort {
  // Tenant identifiers may legitimately contain ':' (an OIDC issuer-derived id, for one), which
  // would make the prefix ambiguous. Percent-encoding it keeps every tenant's segment injective.
  return namespaced(namespaced(cache, namespace), tenantId.replaceAll(':', '%3A'));
}
