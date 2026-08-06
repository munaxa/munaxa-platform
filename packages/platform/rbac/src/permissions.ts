/**
 * Permission strings.
 *
 * The grammar is `resource:action`, optionally scoped: `documents:read`, `documents:*`,
 * `courses:grade:own`. Wildcards are allowed in a *grant*, never in a *check* — asking "does this
 * user have `documents:*`?" is a question with no correct answer, and allowing it is how a check
 * accidentally passes for a user who was granted `documents:read`.
 *
 * Matching is exact on each segment, with `*` in a grant matching one segment and a trailing `*`
 * matching the remainder. `admin:*` grants `admin:users:delete`; `documents:*` does not grant
 * `courses:read`.
 */

export type Permission = string;

const SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Whole-string validators.
 *
 * Splitting a permission into segments and testing each one allocates an array per call, and
 * `hasPermission` validates on every check — on a request that checks a dozen permissions that
 * is a dozen throwaway arrays. These match the same grammar in one pass; the segment-by-segment
 * path below survives only to produce a precise message when one of these fails.
 */
const VALID_CHECK = /^[a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)*$/;
const VALID_GRANT = /^(?:\*|[a-z0-9][a-z0-9_-]*)(?::(?:\*|[a-z0-9][a-z0-9_-]*))*$/;

export class InvalidPermissionError extends Error {
  constructor(value: string, reason: string) {
    super(`Invalid permission ${JSON.stringify(value)}: ${reason}`);
    this.name = 'InvalidPermissionError';
  }
}

/** Validate a *grant*, which may contain wildcards. */
export function assertValidGrant(permission: string): void {
  if (permission.length === 0 || permission.length > 200) {
    throw new InvalidPermissionError(permission, 'must be 1–200 characters');
  }
  if (VALID_GRANT.test(permission)) return;
  throw new InvalidPermissionError(permission, describeFailure(permission));
}

/** Validate a *check*, which must be concrete. */
export function assertValidCheck(permission: string): void {
  if (VALID_CHECK.test(permission) && permission.length <= 200) return;
  if (permission.includes('*')) {
    throw new InvalidPermissionError(permission, 'a permission check must not contain a wildcard');
  }
  assertValidGrant(permission);
  throw new InvalidPermissionError(permission, describeFailure(permission));
}

/** Only reached on the failure path, where an allocation to build a good message is worth it. */
function describeFailure(permission: string): string {
  for (const segment of permission.split(':')) {
    if (segment !== '*' && !SEGMENT.test(segment)) {
      return `segment ${JSON.stringify(segment)} is malformed`;
    }
  }
  return 'expected resource:action';
}

/**
 * Does `grant` cover `required`?
 *
 * Both are split once; the loop is over segments, so the cost is proportional to the depth of the
 * permission (two or three), not to the length of the string.
 */
export function grantCovers(grant: string, required: string): boolean {
  if (grant === required) return true;

  // A grant with no wildcard covers only itself, and equality has already been ruled out. Taking
  // this exit first matters: it is the overwhelmingly common case, and it means a check against a
  // large grant set does no string splitting at all.
  if (!grant.includes('*')) return false;

  const grantSegments = grant.split(':');
  const requiredSegments = required.split(':');

  for (let i = 0; i < grantSegments.length; i++) {
    const grantSegment = grantSegments[i] as string;

    // A trailing wildcard covers everything remaining, including deeper scopes.
    if (grantSegment === '*' && i === grantSegments.length - 1) return true;

    const requiredSegment = requiredSegments[i];
    if (requiredSegment === undefined) return false;
    if (grantSegment !== '*' && grantSegment !== requiredSegment) return false;
  }

  // Equal depth and every segment matched. A shorter grant does not implicitly cover a deeper
  // permission: `documents:read` must not grant `documents:read:all`.
  return grantSegments.length === requiredSegments.length;
}

/** True when any grant covers the required permission. */
export function hasPermission(grants: Iterable<string>, required: string): boolean {
  assertValidCheck(required);
  for (const grant of grants) {
    if (grantCovers(grant, required)) return true;
  }
  return false;
}

export function hasAllPermissions(grants: Iterable<string>, required: readonly string[]): boolean {
  const list = Array.isArray(grants) ? (grants as readonly string[]) : [...grants];
  return required.every((permission) => hasPermission(list, permission));
}

export function hasAnyPermission(grants: Iterable<string>, required: readonly string[]): boolean {
  const list = Array.isArray(grants) ? (grants as readonly string[]) : [...grants];
  return required.some((permission) => hasPermission(list, permission));
}

/**
 * Remove grants that are already covered by a broader one.
 *
 * Keeps resolved permission sets small — they are cached, serialised into tokens and compared on
 * every request — and makes a role's effective grants readable in an admin UI.
 */
export function normalizeGrants(grants: Iterable<string>): readonly string[] {
  const unique = [...new Set(grants)];
  return unique
    .filter((grant) => !unique.some((other) => other !== grant && grantCovers(other, grant)))
    .sort();
}

/** The wildcard that grants everything. Deliberately hard to type by accident. */
export const SUPER_ADMIN_PERMISSION = '*';
