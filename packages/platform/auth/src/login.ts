import type { CachePort, CredentialRecord, UserDirectoryPort } from '@munaxa/interfaces';
import {
  cacheKey,
  PlatformError,
  systemClock,
  type AuthMethod,
  type Clock,
  type CorrelationId,
  type DeviceId,
  type DurationMs,
  type SecurityEventName,
  type SessionId,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import { dummyPasswordHash, sha256Hex, type PasswordHasher } from '@munaxa/crypto';
import type { PasswordPolicyService } from './password-policy.js';

/**
 * The login orchestration.
 *
 * The order of operations is the security design, and it is worth reading as a sequence:
 *
 *  1. Look the account up. Whether it exists or not, the same work happens — including a real
 *     password verification against a dummy hash, so response time does not answer "does this
 *     address have an account?"
 *  2. Check the lockout counter *before* verifying, so a locked account costs an attacker a cache
 *     read rather than a scrypt derivation.
 *  3. Verify the password in constant time relative to its contents.
 *  4. Only then distinguish outcomes — disabled account, MFA required, password change required.
 *     Every failure before this point returns one indistinguishable error.
 *
 * The service does not create sessions or mint tokens itself. It returns a decision, and the
 * product's composition root wires that to `SessionManager` and `TokenService`. That keeps the
 * platform out of the business of knowing what a product does after a successful login.
 */
export interface LoginServiceOptions {
  readonly directory: UserDirectoryPort;
  readonly hasher: PasswordHasher;
  readonly policy?: PasswordPolicyService;
  readonly clock?: Clock;
  /** Backing for the lockout counters. Without it, lockout is disabled and that is logged. */
  readonly cache?: CachePort;
  readonly maxAttempts?: number;
  readonly lockoutDuration?: DurationMs;
  /** Counting window for failed attempts. */
  readonly attemptWindow?: DurationMs;
  /** Decide whether this attempt needs a second factor even when MFA is not enrolled. */
  readonly requireMfa?: (
    account: CredentialRecord,
    context: LoginContext,
  ) => boolean | Promise<boolean>;
  /** Advisory risk hook. Returning 'deny' refuses the attempt; 'challenge' forces a second factor. */
  readonly assessRisk?: (
    account: CredentialRecord | undefined,
    context: LoginContext,
  ) => Promise<'allow' | 'challenge' | 'deny'> | 'allow' | 'challenge' | 'deny';
  readonly onEvent?: (event: LoginEvent) => void | Promise<void>;
}

export interface LoginContext {
  readonly tenantId: TenantId;
  readonly correlationId?: CorrelationId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceId?: DeviceId;
  readonly deviceTrusted?: boolean;
  readonly country?: string;
}

export interface LoginEvent {
  readonly name: Extract<SecurityEventName, `auth.${string}`>;
  readonly tenantId: TenantId;
  readonly userId?: UserId;
  readonly identifier?: string;
  readonly context: LoginContext;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export type LoginOutcome =
  | {
      readonly status: 'authenticated';
      readonly account: CredentialRecord;
      readonly authMethods: readonly AuthMethod[];
      readonly rehashed?: string;
    }
  | {
      readonly status: 'mfa-required';
      readonly account: CredentialRecord;
      readonly reason: 'enrolled' | 'policy' | 'risk';
    }
  | { readonly status: 'password-change-required'; readonly account: CredentialRecord };

export class LoginService {
  readonly #directory: UserDirectoryPort;
  readonly #hasher: PasswordHasher;
  readonly #policy: PasswordPolicyService | undefined;
  readonly #clock: Clock;
  readonly #cache: CachePort | undefined;
  readonly #maxAttempts: number;
  readonly #lockoutDuration: DurationMs;
  readonly #attemptWindow: DurationMs;
  readonly #requireMfa: LoginServiceOptions['requireMfa'];
  readonly #assessRisk: LoginServiceOptions['assessRisk'];
  readonly #onEvent: LoginServiceOptions['onEvent'];

  constructor(options: LoginServiceOptions) {
    this.#directory = options.directory;
    this.#hasher = options.hasher;
    this.#policy = options.policy;
    this.#clock = options.clock ?? systemClock;
    this.#cache = options.cache;
    this.#maxAttempts = options.maxAttempts ?? 10;
    this.#lockoutDuration = options.lockoutDuration ?? 15 * 60 * 1_000;
    this.#attemptWindow = options.attemptWindow ?? 15 * 60 * 1_000;
    this.#requireMfa = options.requireMfa;
    this.#assessRisk = options.assessRisk;
    this.#onEvent = options.onEvent;
  }

  async authenticate(
    identifier: string,
    password: string,
    context: LoginContext,
  ): Promise<LoginOutcome> {
    const account = await this.#directory.findByIdentifier(context.tenantId, identifier);

    if (await this.#isLockedOut(context.tenantId, identifier)) {
      await this.#emit({
        name: 'auth.login.blocked',
        tenantId: context.tenantId,
        identifier,
        context,
        detail: { reason: 'locked-out' },
      });
      throw new PlatformError('Account temporarily locked', {
        code: 'AUTH_ACCOUNT_LOCKED',
        retryable: true,
        retryAfterSeconds: Math.ceil(this.#lockoutDuration / 1_000),
      });
    }

    const risk = await this.#assessRisk?.(account, context);
    if (risk === 'deny') {
      await this.#emit({
        name: 'auth.login.blocked',
        tenantId: context.tenantId,
        identifier,
        context,
        detail: { reason: 'risk' },
      });
      throw new PlatformError('Attempt refused by the risk engine', {
        code: 'SECURITY_RISK_BLOCKED',
      });
    }

    // The unknown-account path performs a real verification against a hash of a value nobody
    // knows, so it costs the same as a wrong password rather than returning immediately.
    const encoded = account?.passwordHash ?? (await dummyPasswordHash(this.#hasher));
    const verified = await this.#hasher.verify(password, encoded);

    if (!account || !verified || account.passwordHash === null) {
      await this.#recordFailure(context.tenantId, identifier);
      await this.#emit({
        name: 'auth.login.failed',
        tenantId: context.tenantId,
        ...(account === undefined ? {} : { userId: account.userId }),
        identifier,
        context,
      });
      // One error for "no such account", "wrong password" and "this account has no password".
      throw new PlatformError('Invalid credentials', { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    if (account.status === 'disabled') {
      await this.#emit({
        name: 'auth.login.blocked',
        tenantId: context.tenantId,
        userId: account.userId,
        context,
        detail: { reason: 'disabled' },
      });
      throw new PlatformError('Account disabled', { code: 'AUTH_ACCOUNT_DISABLED' });
    }
    if (account.status === 'locked') {
      throw new PlatformError('Account locked', { code: 'AUTH_ACCOUNT_LOCKED' });
    }

    await this.#clearFailures(context.tenantId, identifier);

    // The password was correct, so the parameters it was hashed with can be upgraded silently.
    const rehashed = this.#hasher.needsRehash(encoded)
      ? await this.#hasher.hash(password)
      : undefined;
    if (rehashed)
      await this.#directory.updatePasswordHash(context.tenantId, account.userId, rehashed);

    if (account.mustChangePassword) {
      return { status: 'password-change-required', account };
    }

    if (account.mfaEnrolled) {
      await this.#emit({
        name: 'auth.mfa.challenged',
        tenantId: context.tenantId,
        userId: account.userId,
        context,
      });
      return { status: 'mfa-required', account, reason: 'enrolled' };
    }
    if (await this.#requireMfa?.(account, context)) {
      return { status: 'mfa-required', account, reason: 'policy' };
    }
    if (risk === 'challenge') {
      return { status: 'mfa-required', account, reason: 'risk' };
    }

    await this.#emit({
      name: 'auth.login.succeeded',
      tenantId: context.tenantId,
      userId: account.userId,
      context,
    });

    return {
      status: 'authenticated',
      account,
      authMethods: ['password'],
      ...(rehashed === undefined ? {} : { rehashed }),
    };
  }

  /**
   * Change a password for an already-authenticated user.
   *
   * Requires the current password even though the caller is authenticated: the person at the
   * keyboard may be someone who found an unlocked laptop, and this is the check that stops them
   * taking the account over permanently.
   */
  async changePassword(
    tenantId: TenantId,
    userId: UserId,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.#directory.findById(tenantId, userId);
    if (!account?.passwordHash) {
      throw new PlatformError('Account cannot change password', {
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }
    if (!(await this.#hasher.verify(currentPassword, account.passwordHash))) {
      throw new PlatformError('Current password is incorrect', {
        code: 'AUTH_INVALID_CREDENTIALS',
      });
    }

    await this.#policy?.assertValid(newPassword, {
      tenantId,
      userId,
      userInfo: [account.identifier],
    });

    await this.#directory.updatePasswordHash(
      tenantId,
      userId,
      await this.#hasher.hash(newPassword),
    );
    await this.#directory.incrementTokenVersion(tenantId, userId);
  }

  /** Failed attempts recorded for an identifier in the current window. */
  async failureCount(tenantId: TenantId, identifier: string): Promise<number> {
    return (await this.#cache?.get<number>(failureKey(tenantId, identifier))) ?? 0;
  }

  async #isLockedOut(tenantId: TenantId, identifier: string): Promise<boolean> {
    if (!this.#cache) return false;
    return (await this.#cache.has(lockKey(tenantId, identifier))) === true;
  }

  async #recordFailure(tenantId: TenantId, identifier: string): Promise<void> {
    if (!this.#cache) return;
    const failures = await this.#cache.increment(failureKey(tenantId, identifier), 1, {
      ttl: this.#attemptWindow,
    });
    if (failures < this.#maxAttempts) return;

    await this.#cache.set(lockKey(tenantId, identifier), this.#clock.now(), {
      ttl: this.#lockoutDuration,
    });

    // `increment` is atomic, so across the whole fleet exactly one caller sees the threshold
    // crossed. Emitting on `>=` instead would raise "account locked" once per attempt while the
    // attack continued — the alert that trains an operator to mute the alert.
    if (failures === this.#maxAttempts) {
      await this.#emit({
        name: 'auth.account.locked',
        tenantId,
        identifier,
        context: { tenantId },
        detail: { failures },
      });
    }
  }

  async #clearFailures(tenantId: TenantId, identifier: string): Promise<void> {
    await this.#cache?.delete(failureKey(tenantId, identifier));
    await this.#cache?.delete(lockKey(tenantId, identifier));
  }

  async #emit(event: LoginEvent): Promise<void> {
    await this.#onEvent?.(event);
  }
}

/**
 * Keys are hashed at the call site by the caller's identifier, which may be an email address.
 * Lockout state is keyed by identifier rather than by user id on purpose: an attacker guessing at
 * an address that does not exist must be rate-limited too, or the lockout becomes an oracle.
 */
/**
 * Identifiers are hashed rather than embedded.
 *
 * The raw value is an email address, and a Redis keyspace is dumped, logged and shoulder-surfed
 * far more casually than a database table. Hashing keeps the key stable and the address private;
 * the tenant segment is escaped so it cannot run into the digest.
 */
function subjectDigest(identifier: string): string {
  return sha256Hex(identifier.toLowerCase()).slice(0, 32);
}

function failureKey(tenantId: TenantId, identifier: string): string {
  return cacheKey('auth', 'failures', tenantId, subjectDigest(identifier));
}

function lockKey(tenantId: TenantId, identifier: string): string {
  return cacheKey('auth', 'lock', tenantId, subjectDigest(identifier));
}

/** Bind an authenticated outcome to a session id once the product has created one. */
export interface AuthenticatedSession {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly sessionId: SessionId;
  readonly authMethods: readonly AuthMethod[];
  readonly mfaSatisfied: boolean;
  readonly tokenVersion: number;
}
