import type {
  AccountStatus,
  ApiKeyRecord,
  ApiKeyStorePort,
  BreachRegistryPort,
  CredentialRecord,
  MfaEnrollment,
  MfaEnrollmentStorePort,
  PasswordHistoryPort,
  RefreshTokenRecord,
  RefreshTokenStorePort,
  ResetTokenRecord,
  ResetTokenStorePort,
  UserDirectoryPort,
} from '@munaxa/interfaces';
import { sha1HexUpper } from '@munaxa/crypto';
import type { TenantId, TokenFamilyId, UserId } from '@munaxa/types';

/**
 * In-memory stores.
 *
 * These are the reference implementations of every authentication port: what "tenant-scoped"
 * means on each read, what `revokeFamily` is supposed to touch, when a reset token stops
 * resolving. Products back these with their own database, and a product's implementation is
 * correct when it behaves the way these do — which is checkable, because the platform's own test
 * suites run against them.
 */
export class MemoryUserDirectory implements UserDirectoryPort {
  readonly #accounts = new Map<string, CredentialRecord>();

  constructor(accounts: readonly CredentialRecord[] = []) {
    for (const account of accounts)
      this.#accounts.set(key(account.tenantId, account.userId), account);
  }

  add(account: CredentialRecord): this {
    this.#accounts.set(key(account.tenantId, account.userId), account);
    return this;
  }

  async findByIdentifier(
    tenantId: TenantId,
    identifier: string,
  ): Promise<CredentialRecord | undefined> {
    const wanted = identifier.trim().toLowerCase();
    return [...this.#accounts.values()].find(
      (account) => account.tenantId === tenantId && account.identifier.toLowerCase() === wanted,
    );
  }

  async findById(tenantId: TenantId, userId: UserId): Promise<CredentialRecord | undefined> {
    return this.#accounts.get(key(tenantId, userId));
  }

  async updatePasswordHash(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
  ): Promise<void> {
    const account = this.#accounts.get(key(tenantId, userId));
    if (!account) return;
    this.#accounts.set(key(tenantId, userId), {
      ...account,
      passwordHash,
      passwordUpdatedAt: Date.now(),
      mustChangePassword: false,
    });
  }

  async incrementTokenVersion(tenantId: TenantId, userId: UserId): Promise<number> {
    const account = this.#accounts.get(key(tenantId, userId));
    if (!account) return 0;
    const tokenVersion = account.tokenVersion + 1;
    this.#accounts.set(key(tenantId, userId), { ...account, tokenVersion });
    return tokenVersion;
  }

  async setStatus(tenantId: TenantId, userId: UserId, status: AccountStatus): Promise<void> {
    const account = this.#accounts.get(key(tenantId, userId));
    if (account) this.#accounts.set(key(tenantId, userId), { ...account, status });
  }
}

export class MemoryPasswordHistory implements PasswordHistoryPort {
  readonly #history = new Map<string, { hash: string; at: number }[]>();

  async record(
    tenantId: TenantId,
    userId: UserId,
    passwordHash: string,
    at: number,
  ): Promise<void> {
    const entries = this.#history.get(key(tenantId, userId)) ?? [];
    entries.unshift({ hash: passwordHash, at });
    this.#history.set(key(tenantId, userId), entries);
  }

  async recent(tenantId: TenantId, userId: UserId, limit: number): Promise<readonly string[]> {
    return (this.#history.get(key(tenantId, userId)) ?? [])
      .slice(0, limit)
      .map((entry) => entry.hash);
  }

  async prune(tenantId: TenantId, userId: UserId, keep: number): Promise<void> {
    const entries = this.#history.get(key(tenantId, userId)) ?? [];
    this.#history.set(key(tenantId, userId), entries.slice(0, keep));
  }
}

/**
 * A breach registry backed by a list of known-bad passwords.
 *
 * Speaks the same k-anonymity protocol as the hosted corpus, so swapping this for the real thing
 * is a one-line wiring change and the calling code never learns which is behind it.
 */
export class StaticBreachRegistry implements BreachRegistryPort {
  readonly #suffixesByPrefix = new Map<string, string[]>();

  constructor(passwords: readonly string[] = COMMON_BREACHED_PASSWORDS) {
    for (const password of passwords) {
      const digest = sha1HexUpper(password);
      const prefix = digest.slice(0, 5);
      const existing = this.#suffixesByPrefix.get(prefix) ?? [];
      existing.push(`${digest.slice(5)}:1`);
      this.#suffixesByPrefix.set(prefix, existing);
    }
  }

  async suffixesForPrefix(prefix: string): Promise<readonly string[]> {
    return this.#suffixesByPrefix.get(prefix.toUpperCase()) ?? [];
  }
}

/**
 * A deliberately small sample. It is not a breach corpus and does not pretend to be — a real
 * deployment wires the hosted range API or an offline copy of it. It exists so the check is
 * exercised in tests and so a development environment refuses the obvious ones.
 */
export const COMMON_BREACHED_PASSWORDS: readonly string[] = [
  'password',
  'password123',
  'passw0rd123',
  'qwerty123456',
  'letmein12345',
  'iloveyou1234',
  'welcome12345',
  'admin1234567',
  'trustno1trustno1',
  'correct horse battery staple',
  'monkeymonkey12',
  'football1234',
  'dragon123456',
  'sunshine1234',
  'princess1234',
];

export class MemoryRefreshTokenStore implements RefreshTokenStorePort {
  readonly #records = new Map<string, RefreshTokenRecord>();

  async save(record: RefreshTokenRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async findByHash(tenantId: TenantId, tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    return [...this.#records.values()].find(
      (record) => record.tenantId === tenantId && record.tokenHash === tokenHash,
    );
  }

  async update(record: RefreshTokenRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  /**
   * The compare-and-swap rotation claims run through.
   *
   * Synchronous between the read and the write on purpose: there is no `await` inside, so no
   * other task can interleave. A SQL adapter gets the same property from
   * `UPDATE … WHERE rotated_at IS NULL` and checking the affected row count.
   */
  async markRotated(
    tenantId: TenantId,
    id: string,
    at: number,
    replacedBy: string,
  ): Promise<boolean> {
    const record = this.#records.get(id);
    if (!record || record.tenantId !== tenantId) return false;
    if (record.rotatedAt !== undefined) return false;
    this.#records.set(id, { ...record, rotatedAt: at, replacedBy });
    return true;
  }

  async listFamily(
    tenantId: TenantId,
    familyId: TokenFamilyId,
  ): Promise<readonly RefreshTokenRecord[]> {
    return [...this.#records.values()].filter(
      (record) => record.tenantId === tenantId && record.familyId === familyId,
    );
  }

  async revokeFamily(
    tenantId: TenantId,
    familyId: TokenFamilyId,
    at: number,
    reason: string,
  ): Promise<number> {
    let revoked = 0;
    for (const record of this.#records.values()) {
      if (record.tenantId !== tenantId || record.familyId !== familyId) continue;
      if (record.revokedAt !== undefined) continue;
      this.#records.set(record.id, { ...record, revokedAt: at, revocationReason: reason });
      revoked++;
    }
    return revoked;
  }

  async revokeForUser(
    tenantId: TenantId,
    userId: UserId,
    at: number,
    reason: string,
  ): Promise<number> {
    let revoked = 0;
    for (const record of this.#records.values()) {
      if (record.tenantId !== tenantId || record.userId !== userId) continue;
      if (record.revokedAt !== undefined) continue;
      this.#records.set(record.id, { ...record, revokedAt: at, revocationReason: reason });
      revoked++;
    }
    return revoked;
  }

  async deleteExpired(tenantId: TenantId, now: number): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.#records) {
      if (record.tenantId === tenantId && now >= record.expiresAt) {
        this.#records.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#records.size;
  }
}

export class MemoryResetTokenStore implements ResetTokenStorePort {
  readonly #records = new Map<string, ResetTokenRecord>();

  async save(record: ResetTokenRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async findByHash(tenantId: TenantId, tokenHash: string): Promise<ResetTokenRecord | undefined> {
    return [...this.#records.values()].find(
      (record) => record.tenantId === tenantId && record.tokenHash === tokenHash,
    );
  }

  async update(record: ResetTokenRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async markConsumed(tenantId: TenantId, id: string, at: number): Promise<boolean> {
    // No await between the read and the write: on one thread that is the whole compare-and-swap.
    // A networked adapter has to get the same effect from one conditional statement.
    const record = this.#records.get(id);
    if (!record || record.tenantId !== tenantId) return false;
    if (record.consumedAt !== undefined || record.revokedAt !== undefined) return false;
    this.#records.set(id, { ...record, consumedAt: at });
    return true;
  }

  async revokeForUser(tenantId: TenantId, userId: UserId, at: number): Promise<number> {
    let revoked = 0;
    for (const record of this.#records.values()) {
      if (record.tenantId !== tenantId || record.userId !== userId) continue;
      if (record.revokedAt !== undefined || record.consumedAt !== undefined) continue;
      this.#records.set(record.id, { ...record, revokedAt: at });
      revoked++;
    }
    return revoked;
  }
}

export class MemoryApiKeyStore implements ApiKeyStorePort {
  readonly #records = new Map<string, ApiKeyRecord>();

  async save(record: ApiKeyRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async findById(_tenantId: TenantId, keyId: string): Promise<ApiKeyRecord | undefined> {
    // Looked up by id alone, then the tenant is checked by the caller: an API key names no tenant
    // until it resolves, and returning undefined for a wrong tenant would be an oracle for
    // whether the key id exists elsewhere.
    return this.#records.get(keyId);
  }

  async list(tenantId: TenantId): Promise<readonly ApiKeyRecord[]> {
    return [...this.#records.values()].filter((record) => record.tenantId === tenantId);
  }

  async update(record: ApiKeyRecord): Promise<void> {
    this.#records.set(record.id, record);
  }
}

export class MemoryMfaEnrollmentStore implements MfaEnrollmentStorePort {
  readonly #enrollments = new Map<string, MfaEnrollment[]>();
  readonly #recoveryCodes = new Map<string, Set<string>>();

  async list(tenantId: TenantId, userId: UserId): Promise<readonly MfaEnrollment[]> {
    return this.#enrollments.get(key(tenantId, userId)) ?? [];
  }

  async save(enrollment: MfaEnrollment): Promise<void> {
    const bucket = key(enrollment.tenantId, enrollment.userId);
    const existing = (this.#enrollments.get(bucket) ?? []).filter(
      (candidate) => candidate.method !== enrollment.method,
    );
    existing.push(enrollment);
    this.#enrollments.set(bucket, existing);
  }

  async remove(tenantId: TenantId, userId: UserId, method: MfaEnrollment['method']): Promise<void> {
    const bucket = key(tenantId, userId);
    this.#enrollments.set(
      bucket,
      (this.#enrollments.get(bucket) ?? []).filter((enrollment) => enrollment.method !== method),
    );
  }

  async markUsed(
    tenantId: TenantId,
    userId: UserId,
    method: MfaEnrollment['method'],
    at: number,
  ): Promise<void> {
    const bucket = key(tenantId, userId);
    this.#enrollments.set(
      bucket,
      (this.#enrollments.get(bucket) ?? []).map((enrollment) =>
        enrollment.method === method ? { ...enrollment, lastUsedAt: at } : enrollment,
      ),
    );
  }

  async saveRecoveryCodes(
    tenantId: TenantId,
    userId: UserId,
    hashes: readonly string[],
  ): Promise<void> {
    this.#recoveryCodes.set(key(tenantId, userId), new Set(hashes));
  }

  /** Consuming removes the code, which is what makes recovery codes single-use by construction. */
  async consumeRecoveryCode(tenantId: TenantId, userId: UserId, hash: string): Promise<boolean> {
    const codes = this.#recoveryCodes.get(key(tenantId, userId));
    if (!codes?.has(hash)) return false;
    codes.delete(hash);
    return true;
  }

  remaining(tenantId: TenantId, userId: UserId): number {
    return this.#recoveryCodes.get(key(tenantId, userId))?.size ?? 0;
  }
}

function key(tenantId: TenantId, userId: UserId): string {
  return `${tenantId} ${userId}`;
}
