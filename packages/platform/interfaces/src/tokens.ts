import type { DeviceId, SessionId, TenantId, TokenFamilyId, UserId } from '@munaxa/types';

/**
 * A refresh token as stored.
 *
 * The token itself is never here — only `tokenHash`. A database dump therefore yields nothing
 * an attacker can present. `familyId` links every token descended from one login so that a
 * single detected replay can revoke the entire lineage.
 */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly familyId: TokenFamilyId;
  readonly tokenHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly sessionId?: SessionId;
  readonly deviceId?: DeviceId;
  /** Set when this token was exchanged; presenting it again is a replay. */
  readonly rotatedAt?: number;
  /** The token this one was rotated into, for forensics. */
  readonly replacedBy?: string;
  readonly revokedAt?: number;
  readonly revocationReason?: string;
  readonly tokenVersion: number;
}

export interface RefreshTokenStorePort {
  save(record: RefreshTokenRecord): Promise<void>;
  findByHash(tenantId: TenantId, tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  update(record: RefreshTokenRecord): Promise<void>;
  listFamily(tenantId: TenantId, familyId: TokenFamilyId): Promise<readonly RefreshTokenRecord[]>;
  /** Revoke every live token in a family. Returns how many were revoked. */
  revokeFamily(
    tenantId: TenantId,
    familyId: TokenFamilyId,
    at: number,
    reason: string,
  ): Promise<number>;
  revokeForUser(tenantId: TenantId, userId: UserId, at: number, reason: string): Promise<number>;
  deleteExpired(tenantId: TenantId, now: number): Promise<number>;
}

/**
 * A password-reset ticket.
 *
 * Single use, hashed at rest, short-lived, and bound to the account's password at issue time —
 * `passwordHashFingerprint` means a token stops working the moment the password changes by any
 * other route, which closes the "request two resets, use the older one" replay.
 */
export interface ResetTokenRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly tokenHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly consumedAt?: number;
  readonly revokedAt?: number;
  readonly passwordHashFingerprint: string;
  readonly requestIp?: string;
}

export interface ResetTokenStorePort {
  save(record: ResetTokenRecord): Promise<void>;
  findByHash(tenantId: TenantId, tokenHash: string): Promise<ResetTokenRecord | undefined>;
  update(record: ResetTokenRecord): Promise<void>;
  revokeForUser(tenantId: TenantId, userId: UserId, at: number): Promise<number>;
}

/** An API key or service-account credential. The secret is stored only as a hash. */
export interface ApiKeyRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly secretHash: string;
  readonly scopes: readonly string[];
  readonly createdAt: number;
  readonly createdBy?: UserId;
  readonly expiresAt?: number;
  readonly lastUsedAt?: number;
  readonly revokedAt?: number;
  /** When the key acts for a user rather than for the tenant itself. */
  readonly onBehalfOf?: UserId;
  /** CIDR allow-list; empty means unrestricted. */
  readonly allowedCidrs?: readonly string[];
}

export interface ApiKeyStorePort {
  save(record: ApiKeyRecord): Promise<void>;
  findById(tenantId: TenantId, keyId: string): Promise<ApiKeyRecord | undefined>;
  list(tenantId: TenantId): Promise<readonly ApiKeyRecord[]>;
  update(record: ApiKeyRecord): Promise<void>;
}

/**
 * Signing material for JWTs and other detached signatures.
 *
 * `kid` selection lives here so key rotation is a store concern, not a caller concern: the
 * signer asks for "the current key", verifiers ask for "the key with this id", and a rotation is
 * two overlapping keys rather than a deployment.
 */
export interface SigningKeyPort {
  current(): Promise<SigningKey>;
  byId(kid: string): Promise<SigningKey | undefined>;
  /** Every key a verifier should accept, including recently retired ones. */
  verificationKeys(): Promise<readonly SigningKey[]>;
}

export interface SigningKey {
  readonly kid: string;
  readonly algorithm: 'HS256' | 'HS512' | 'RS256' | 'ES256';
  /** Symmetric secret, or PEM private key for asymmetric algorithms. */
  readonly privateKey: string;
  /** PEM public key. Absent for symmetric algorithms. */
  readonly publicKey?: string;
  readonly notBefore?: number;
  readonly notAfter?: number;
}
