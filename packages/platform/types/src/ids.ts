/**
 * Branded identifiers.
 *
 * Every identifier in the platform is a string at runtime and a distinct type at compile time.
 * The brand costs nothing in the emitted JavaScript and makes the single most common
 * multi-tenant defect — passing a `userId` where a `tenantId` was expected — a type error
 * rather than a data leak.
 */

declare const brand: unique symbol;

/** A nominal string type. `Branded<'UserId'>` is not assignable to `Branded<'TenantId'>`. */
export type Branded<TBrand extends string> = string & { readonly [brand]: TBrand };

export type TenantId = Branded<'TenantId'>;
export type UserId = Branded<'UserId'>;
export type SessionId = Branded<'SessionId'>;
export type DeviceId = Branded<'DeviceId'>;
export type CorrelationId = Branded<'CorrelationId'>;
export type RequestId = Branded<'RequestId'>;
export type RoleId = Branded<'RoleId'>;
export type TokenFamilyId = Branded<'TokenFamilyId'>;
export type ClientId = Branded<'ClientId'>;
export type AuditEventId = Branded<'AuditEventId'>;

/**
 * The tenant every single-tenant deployment implicitly runs as.
 *
 * Products that have not adopted multi-tenancy pass this and behave exactly as before; the
 * platform never has to special-case "no tenant", so tenant scoping is uniform everywhere.
 */
export const ROOT_TENANT_ID = 'root' as TenantId;

const ID_PATTERN = /^[A-Za-z0-9._:@-]{1,190}$/;

/** True when `value` is shaped like a platform identifier. */
export function isIdentifierLike(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function assertId(value: string, kind: string): void {
  if (!ID_PATTERN.test(value)) {
    // The rejected value is truncated before it reaches the message: identifiers arrive from the
    // network, and an error string is a log line, a stack trace and sometimes a response body.
    const shown: string = value.length > 64 ? `${value.slice(0, 64)}…` : value;
    throw new TypeError(
      `Invalid ${kind}: expected 1–190 characters matching [A-Za-z0-9._:@-], received ${JSON.stringify(shown)}`,
    );
  }
}

/** Narrow a validated string to a branded identifier. Throws on malformed input. */
export function toTenantId(value: string): TenantId {
  assertId(value, 'TenantId');
  return value as TenantId;
}

export function toUserId(value: string): UserId {
  assertId(value, 'UserId');
  return value as UserId;
}

export function toSessionId(value: string): SessionId {
  assertId(value, 'SessionId');
  return value as SessionId;
}

export function toDeviceId(value: string): DeviceId {
  assertId(value, 'DeviceId');
  return value as DeviceId;
}

export function toCorrelationId(value: string): CorrelationId {
  assertId(value, 'CorrelationId');
  return value as CorrelationId;
}

export function toRoleId(value: string): RoleId {
  assertId(value, 'RoleId');
  return value as RoleId;
}

export function toClientId(value: string): ClientId {
  assertId(value, 'ClientId');
  return value as ClientId;
}

/**
 * Unchecked brand, for values that are already known-good — a primary key read back from the
 * database, or a constant in a test. Prefer the checked constructors at trust boundaries.
 */
export function unsafeId<T extends Branded<string>>(value: string): T {
  return value as T;
}
