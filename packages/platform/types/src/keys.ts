/**
 * Composing cache keys without letting one segment impersonate another.
 *
 * Keys are built by joining segments with `:`. If a segment may itself contain a `:` — and tenant
 * identifiers derived from an OIDC issuer routinely do — then joining by hand is ambiguous:
 *
 *     `rbac:${tenantId}:${userId}`   tenant "a:b", user "c"  → "rbac:a:b:c"
 *     `rbac:${tenantId}:${userId}`   tenant "a", user "b:c"  → "rbac:a:b:c"
 *
 * Two different subjects, one key. For a permission cache that is a cross-tenant authorization
 * read: the second tenant is served the first tenant's resolved grants. Nothing errors, and the
 * only symptom is a user seeing permissions they were never given.
 *
 * Percent-encoding `:` and `%` inside each segment makes the encoding injective, so distinct
 * inputs always produce distinct keys.
 *
 * This lives in `@munaxa/types` rather than in `@munaxa/cache` because the packages that had the
 * collision — `auth`, `rbac`, `security` — do not all depend on the cache package, and a shared
 * escaping rule that half the platform cannot reach is not a shared rule.
 */

/**
 * Encode one key segment.
 *
 * `%` is escaped first, otherwise a literal `%3A` in the input would decode to the same key as an
 * escaped `:` and the encoding would stop being injective.
 */
export function keySegment(value: string): string {
  return value.replaceAll('%', '%25').replaceAll(':', '%3A');
}

/**
 * Join segments into a cache key, escaping each one.
 *
 * Use this for every key built from values the platform does not control. A literal prefix that
 * contains no user input (`rbac`, `rl`) is safe to pass as the first segment — it is escaped too,
 * which costs nothing and removes the need to think about it.
 */
export function cacheKey(...segments: readonly string[]): string {
  return segments.map(keySegment).join(':');
}
