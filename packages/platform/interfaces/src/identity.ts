import type { AuthMethod, TenantId, UserId } from '@munaxa/types';

/**
 * What the platform needs to know about an account in order to authenticate it.
 *
 * Note what is absent: no profile, no name, no product fields. Products own their user tables;
 * they expose this projection of them. The platform never migrates or owns application data.
 */
export interface CredentialRecord {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  /** The identifier the user typed, already normalized. */
  readonly identifier: string;
  /** Encoded password hash, or null for accounts that authenticate another way entirely. */
  readonly passwordHash: string | null;
  readonly status: AccountStatus;
  /** Bumped to invalidate every token issued before the change. */
  readonly tokenVersion: number;
  readonly mfaEnrolled: boolean;
  /** When set, the account must change its password before it can do anything else. */
  readonly mustChangePassword?: boolean;
  readonly passwordUpdatedAt?: number;
  readonly roles?: readonly string[];
}

export type AccountStatus = 'active' | 'disabled' | 'locked' | 'pending-verification';

/**
 * Read-only account lookup.
 *
 * `findByIdentifier` must take the same amount of work whether or not the account exists; the
 * platform additionally performs a dummy password verification on the miss path, but a directory
 * that short-circuits on "not found" narrows that defence.
 */
export interface UserDirectoryPort {
  findByIdentifier(tenantId: TenantId, identifier: string): Promise<CredentialRecord | undefined>;
  findById(tenantId: TenantId, userId: UserId): Promise<CredentialRecord | undefined>;
  updatePasswordHash(tenantId: TenantId, userId: UserId, passwordHash: string): Promise<void>;
  /** Invalidate outstanding tokens by advancing the version. Returns the new value. */
  incrementTokenVersion(tenantId: TenantId, userId: UserId): Promise<number>;
  setStatus(tenantId: TenantId, userId: UserId, status: AccountStatus): Promise<void>;
}

/** Previous password hashes, so a "new" password cannot be one of the last N. */
export interface PasswordHistoryPort {
  record(tenantId: TenantId, userId: UserId, passwordHash: string, at: number): Promise<void>;
  /** Most recent first, at most `limit` entries. */
  recent(tenantId: TenantId, userId: UserId, limit: number): Promise<readonly string[]>;
  prune(tenantId: TenantId, userId: UserId, keep: number): Promise<void>;
}

/**
 * Breach corpus lookup.
 *
 * Takes a SHA-1 prefix and returns the matching suffixes, which is the k-anonymity protocol
 * Have I Been Pwned uses. The full hash never leaves the process, so an offline corpus and a
 * hosted range API satisfy the same interface.
 */
export interface BreachRegistryPort {
  /** `prefix` is the first 5 hex characters of the uppercase SHA-1 of the password. */
  suffixesForPrefix(prefix: string): Promise<readonly string[]>;
}

export interface MfaEnrollment {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly method: Extract<AuthMethod, 'totp' | 'email-otp' | 'sms-otp' | 'webauthn' | 'passkey'>;
  /** Encrypted at rest by the caller; the port never sees a plaintext secret. */
  readonly secret: string;
  readonly label?: string;
  readonly createdAt: number;
  readonly lastUsedAt?: number;
  readonly confirmedAt?: number;
}

export interface MfaEnrollmentStorePort {
  list(tenantId: TenantId, userId: UserId): Promise<readonly MfaEnrollment[]>;
  save(enrollment: MfaEnrollment): Promise<void>;
  remove(tenantId: TenantId, userId: UserId, method: MfaEnrollment['method']): Promise<void>;
  markUsed(
    tenantId: TenantId,
    userId: UserId,
    method: MfaEnrollment['method'],
    at: number,
  ): Promise<void>;
  /** Hashed single-use recovery codes. */
  saveRecoveryCodes(tenantId: TenantId, userId: UserId, hashes: readonly string[]): Promise<void>;
  consumeRecoveryCode(tenantId: TenantId, userId: UserId, hash: string): Promise<boolean>;
}

/**
 * An external identity source: OIDC, SAML, Firebase, Azure AD, Google, Microsoft.
 *
 * The two-method shape is what every one of them reduces to — send the user somewhere, then turn
 * what comes back into a verified identity. SAML's POST binding and OIDC's code flow both fit.
 */
export interface IdentityProviderPort {
  readonly id: string;
  readonly kind: 'oidc' | 'saml' | 'firebase' | 'azure-ad' | 'google' | 'microsoft' | 'custom';
  /** Build the URL (and any state the callback will need) to send the browser to. */
  beginAuthorization(request: AuthorizationRequest): Promise<AuthorizationRedirect>;
  /** Validate the provider's response and return the identity it asserts. */
  completeAuthorization(callback: AuthorizationCallback): Promise<ExternalIdentity>;
}

export interface AuthorizationRequest {
  readonly tenantId: TenantId;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
  readonly loginHint?: string;
  /** Opaque product state echoed back on the callback. */
  readonly state?: string;
  readonly prompt?: 'none' | 'login' | 'consent' | 'select_account';
}

export interface AuthorizationRedirect {
  readonly url: string;
  readonly state: string;
  /** PKCE verifier and nonce the callback must be able to recover. Store them server-side. */
  readonly codeVerifier?: string;
  readonly nonce?: string;
}

export interface AuthorizationCallback {
  readonly tenantId: TenantId;
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly expectedState: string;
  readonly codeVerifier?: string;
  readonly nonce?: string;
  readonly redirectUri: string;
}

export interface ExternalIdentity {
  readonly provider: string;
  /** The provider's stable subject identifier. Never an email address. */
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly groups?: readonly string[];
  readonly claims: Readonly<Record<string, unknown>>;
  /** Whether the provider asserts a second factor was used. */
  readonly mfaSatisfied?: boolean;
}
