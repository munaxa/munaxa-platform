import type {
  AuthMethod,
  DeviceId,
  SessionId,
  TenantId,
  TokenFamilyId,
  UserId,
} from '@munaxa/types';

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

export interface SessionLimit {
  readonly maxConcurrent: number;
  readonly onLimitReached: 'evict-oldest' | 'deny';
  /** Sessions past either deadline do not count toward the limit. */
  readonly now: number;
}

export interface SessionCreateOutcome {
  readonly created: boolean;
  /** Sessions the store revoked to make room, so the caller can emit events for them. */
  readonly evicted: readonly SessionRecord[];
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
  /**
   * @atomicity atomic
   * @consistency linearizable
   * @idempotency idempotent — the same session id twice is one session
   */
  create(session: SessionRecord): Promise<void>;

  /**
   * Create only if the user is under `maxConcurrent` live sessions, atomically.
   *
   * Optional because it needs a transaction the platform cannot write for you. Implement it and
   * the concurrency limit is exact; omit it and `SessionManager` falls back to a `LockPort`, and
   * failing that to a best-effort count that a burst of parallel logins can exceed. The manager
   * says which mode it is in at construction rather than leaving you to find out.
   *
   *     BEGIN;
   *     SELECT count(*) FROM sessions
   *      WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
   *        AND idle_expires_at > $now AND absolute_expires_at > $now
   *        FOR UPDATE;
   *     -- evict oldest or refuse, then INSERT
   *     COMMIT;
   *
   * @atomicity serialised per (tenant, user)
   * @consistency linearizable
   * @idempotency at-most-once
   */
  createWithinLimit?(session: SessionRecord, limit: SessionLimit): Promise<SessionCreateOutcome>;

  /**
   * Live sessions for a user. Cheaper than `listByUser` when only the count is needed.
   *
   * @atomicity none
   * @consistency linearizable
   * @idempotency idempotent
   */
  countActive?(tenantId: TenantId, userId: UserId, now: number): Promise<number>;
  get(tenantId: TenantId, sessionId: SessionId): Promise<SessionRecord | undefined>;
  /** Non-revoked sessions, most recently seen first. */
  listByUser(tenantId: TenantId, userId: UserId): Promise<readonly SessionRecord[]>;
  update(session: SessionRecord): Promise<void>;
  delete(tenantId: TenantId, sessionId: SessionId): Promise<boolean>;
  /** Housekeeping for stores without native expiry. Returns the number removed. */
  deleteExpired(tenantId: TenantId, now: number): Promise<number>;
}

/**
 * A refresh-token lineage, with a session's lifecycle.
 *
 * Two architectures both call their thing "a session" and they are not the same thing:
 *
 * - **Stateful.** A `sessions` row is created at sign-in and consulted on every request. The
 *   access token carries `sid`; the row decides.
 * - **Refresh-family.** There is no session row. The access token is self-contained and
 *   short-lived, and the only server-side object is the refresh lineage — one row per family, with
 *   the tokens rotating within it. "Sign out everywhere" revokes families.
 *
 * The platform used to serve only the first, so a product built the second way could not adopt
 * `SessionManager` without adding a table and rewriting its refresh flow — which is a product
 * change, not a migration, and it is why the first consumer stopped here. This record is the
 * second architecture stated in the platform's own vocabulary: the same lifecycle fields the
 * stateful record has, keyed by family instead of by session.
 *
 * The payoff is that everything defined over sessions — idle and absolute deadlines, concurrency
 * limits, revocation reasons, the conformance suite — applies unchanged to a product that has
 * never had a sessions table.
 */
export interface RefreshFamily {
  readonly id: TokenFamilyId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  /** Moves forward on each rotation. A family that stops rotating dies here. */
  readonly idleExpiresAt: number;
  /** Never moves. A stolen lineage kept warm by rotation still dies here. */
  readonly absoluteExpiresAt: number;
  readonly deviceId?: DeviceId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly authMethods: readonly AuthMethod[];
  readonly mfaSatisfied: boolean;
  readonly revokedAt?: number;
  readonly revocationReason?: SessionRevocationReason;
  /** Copied from the account at creation; a bump elsewhere invalidates the whole family. */
  readonly tokenVersion: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * The store behind a refresh-family architecture.
 *
 * Deliberately the same method set as `SessionStorePort`, including the same atomicity notes: the
 * two architectures differ in what the row *is*, not in what the platform needs from it. That
 * symmetry is what lets `sessionStoreOverFamilies` present one as the other, so a product picks
 * its persistence model and gets identical session semantics either way.
 */
export interface RefreshFamilyStorePort {
  /**
   * @atomicity atomic
   * @consistency linearizable
   * @idempotency idempotent — the same family id twice is one family
   */
  create(family: RefreshFamily): Promise<void>;

  /**
   * Create only if the user is under `maxConcurrent` live families, atomically.
   *
   * Same contract, and the same warning, as `SessionStorePort.createWithinLimit`: without it the
   * concurrency limit is enforced by a `LockPort` if one is wired, and is best-effort if not. A
   * burst of parallel sign-ins is the normal input to this control, not an exotic one.
   *
   *     BEGIN;
   *     SELECT count(*) FROM refresh_families
   *      WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
   *        AND idle_expires_at > $now AND absolute_expires_at > $now
   *        FOR UPDATE;
   *     -- evict oldest or refuse, then INSERT
   *     COMMIT;
   *
   * @atomicity serialised per (tenant, user)
   * @consistency linearizable
   * @idempotency at-most-once
   */
  createWithinLimit?(
    family: RefreshFamily,
    limit: SessionLimit,
  ): Promise<RefreshFamilyCreateOutcome>;

  /**
   * @atomicity none
   * @consistency linearizable
   * @idempotency idempotent
   */
  countActive?(tenantId: TenantId, userId: UserId, now: number): Promise<number>;
  get(tenantId: TenantId, familyId: TokenFamilyId): Promise<RefreshFamily | undefined>;
  /** Non-revoked families, most recently seen first. */
  listByUser(tenantId: TenantId, userId: UserId): Promise<readonly RefreshFamily[]>;
  update(family: RefreshFamily): Promise<void>;
  delete(tenantId: TenantId, familyId: TokenFamilyId): Promise<boolean>;
  /** Housekeeping for stores without native expiry. Returns the number removed. */
  deleteExpired(tenantId: TenantId, now: number): Promise<number>;
}

export interface RefreshFamilyCreateOutcome {
  readonly created: boolean;
  /** Families the store revoked to make room, so the caller can emit events for them. */
  readonly evicted: readonly RefreshFamily[];
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
  /**
   * Insert or replace the whole record.
   *
   * Whole-record writes lose concurrent updates to fields the writer did not intend to touch, so
   * the platform uses this only where it owns every field it is writing. Recording that a device
   * was seen goes through `touch` instead — see below for why that distinction is a security one.
   *
   * Adapters must upsert on `(tenant_id, user_id, fingerprint)`, not only on `id`: two concurrent
   * first sightings of one device would otherwise register it twice, and the user would be asked
   * to verify a "new device" they had just verified.
   *
   * @atomicity atomic
   * @consistency linearizable
   * @idempotency idempotent
   */
  save(device: DeviceRecord): Promise<void>;
  /**
   * Record that a device was seen, touching only the last-seen fields.
   *
   * This exists because the obvious implementation — read the record, set `lastSeenAt`, write it
   * back — silently resurrects trust. A password change calls `untrustAll`; if the device is
   * making a request at that moment, the untrust write and the last-seen write race, and the
   * last-seen write carries the old `trustedAt` with it. The device stays trusted, nothing errors,
   * and the user believes they have just revoked it.
   *
   * Adapters write only the named columns:
   *
   *     UPDATE devices SET last_seen_at = $at, last_ip_address = COALESCE($ip, last_ip_address)
   *      WHERE tenant_id = $tenantId AND id = $deviceId
   *
   * @atomicity atomic — a partial-record update, never a read-modify-write
   * @consistency linearizable
   * @idempotency idempotent
   */
  touch(tenantId: TenantId, deviceId: DeviceId, at: number, ipAddress?: string): Promise<void>;
  remove(tenantId: TenantId, deviceId: DeviceId): Promise<boolean>;
}
