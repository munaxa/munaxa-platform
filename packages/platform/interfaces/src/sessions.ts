import type { AuthMethod, DeviceId, SessionId, TenantId, UserId } from '@munaxa/types';

/**
 * A session as the platform stores it.
 *
 * Two expiries, not one: `idleExpiresAt` moves forward on activity, `absoluteExpiresAt` never
 * does. A stolen session that is kept warm by the attacker still dies at the absolute deadline.
 */
export interface SessionRecord {
  readonly id: SessionId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly deviceId?: DeviceId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly authMethods: readonly AuthMethod[];
  readonly mfaSatisfied: boolean;
  readonly revokedAt?: number;
  readonly revocationReason?: SessionRevocationReason;
  /** Copied from the account at creation; a bump elsewhere invalidates this session. */
  readonly tokenVersion: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export type SessionRevocationReason =
  | 'logout'
  | 'logout-all'
  | 'password-changed'
  | 'password-reset'
  | 'mfa-changed'
  | 'admin-revoked'
  | 'concurrency-limit'
  | 'risk-detected'
  | 'token-reuse'
  | 'device-untrusted'
  | 'account-disabled';

export interface SessionStorePort {
  create(session: SessionRecord): Promise<void>;
  get(tenantId: TenantId, sessionId: SessionId): Promise<SessionRecord | undefined>;
  /** Non-revoked sessions, most recently seen first. */
  listByUser(tenantId: TenantId, userId: UserId): Promise<readonly SessionRecord[]>;
  update(session: SessionRecord): Promise<void>;
  delete(tenantId: TenantId, sessionId: SessionId): Promise<boolean>;
  /** Housekeeping for stores without native expiry. Returns the number removed. */
  deleteExpired(tenantId: TenantId, now: number): Promise<number>;
}

export interface DeviceRecord {
  readonly id: DeviceId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** Stable fingerprint of the client, hashed before storage. */
  readonly fingerprint: string;
  readonly displayName?: string;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly trustedAt?: number;
  readonly trustExpiresAt?: number;
  readonly userAgent?: string;
  readonly lastIpAddress?: string;
}

export interface DeviceRegistryPort {
  find(tenantId: TenantId, userId: UserId, fingerprint: string): Promise<DeviceRecord | undefined>;
  get(tenantId: TenantId, deviceId: DeviceId): Promise<DeviceRecord | undefined>;
  list(tenantId: TenantId, userId: UserId): Promise<readonly DeviceRecord[]>;
  save(device: DeviceRecord): Promise<void>;
  remove(tenantId: TenantId, deviceId: DeviceId): Promise<boolean>;
}
