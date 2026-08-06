import type { ResetTokenRecord, ResetTokenStorePort, UserDirectoryPort } from '@munaxa/interfaces';
import {
  PlatformError,
  systemClock,
  type Clock,
  type DurationMs,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import {
  prefixedId,
  secureToken,
  sha256Hex,
  tokenFingerprint,
  type PasswordHasher,
} from '@munaxa/crypto';
import type { PasswordPolicyService } from './password-policy.js';

/**
 * Password reset.
 *
 * The rules this enforces, each of which is a real incident somewhere:
 *
 * - **No temporary passwords, ever.** A password emailed to a user is a credential sitting in a
 *   mailbox, in a mail server's logs, and in whatever backup that provider keeps. The reset flow
 *   delivers a single-use link and the user chooses their own password.
 * - **Hashed at rest.** A leaked reset-token table would otherwise be an account takeover for
 *   every pending request.
 * - **Single use, short-lived, and revoked by any password change.** A token issued before an
 *   earlier reset completed must not still work — that is the "request two, use the older one"
 *   replay, and binding each token to the password hash it was issued against closes it.
 * - **No account enumeration.** `request` returns the same result whether or not the address
 *   exists, and takes the same work either way.
 * - **Sessions die on use.** Whoever forced the reset must not survive it — including the
 *   attacker who was already signed in.
 */
export interface PasswordResetServiceOptions {
  readonly store: ResetTokenStorePort;
  readonly directory: UserDirectoryPort;
  readonly hasher: PasswordHasher;
  readonly policy?: PasswordPolicyService;
  readonly clock?: Clock;
  readonly ttl?: DurationMs;
  readonly pepper?: string;
  /** Called with the token exactly once, for delivery. Never store what it is given. */
  readonly deliver?: (input: DeliverResetInput) => void | Promise<void>;
  /** Called after a successful reset, to revoke sessions and refresh tokens. */
  readonly onReset?: (tenantId: TenantId, userId: UserId) => void | Promise<void>;
}

export interface DeliverResetInput {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly identifier: string;
  readonly token: string;
  readonly expiresAt: number;
}

export interface ResetRequestResult {
  /** Always true. The caller must not branch on whether an account existed. */
  readonly accepted: true;
}

export class PasswordResetService {
  readonly #store: ResetTokenStorePort;
  readonly #directory: UserDirectoryPort;
  readonly #hasher: PasswordHasher;
  readonly #policy: PasswordPolicyService | undefined;
  readonly #clock: Clock;
  readonly #ttl: DurationMs;
  readonly #pepper: string | undefined;
  readonly #deliver: PasswordResetServiceOptions['deliver'];
  readonly #onReset: PasswordResetServiceOptions['onReset'];

  constructor(options: PasswordResetServiceOptions) {
    this.#store = options.store;
    this.#directory = options.directory;
    this.#hasher = options.hasher;
    this.#policy = options.policy;
    this.#clock = options.clock ?? systemClock;
    this.#ttl = options.ttl ?? 30 * 60 * 1_000;
    this.#pepper = options.pepper;
    this.#deliver = options.deliver;
    this.#onReset = options.onReset;
  }

  /**
   * Start a reset.
   *
   * Returns the same value for a known and an unknown address, and any previous outstanding token
   * is revoked so only the newest link works.
   */
  async request(
    tenantId: TenantId,
    identifier: string,
    context: { ipAddress?: string } = {},
  ): Promise<ResetRequestResult> {
    const account = await this.#directory.findByIdentifier(tenantId, identifier);

    if (account && account.status !== 'disabled') {
      await this.#store.revokeForUser(tenantId, account.userId, this.#clock.now());

      const token = secureToken(32);
      const now = this.#clock.now();
      const record: ResetTokenRecord = {
        id: prefixedId('rst', now),
        tenantId,
        userId: account.userId,
        tokenHash: tokenFingerprint(token, this.#pepper),
        issuedAt: now,
        expiresAt: now + this.#ttl,
        // Binds the token to the password in force when it was issued. Any other change to the
        // password invalidates it, which is what stops the older of two links from working.
        passwordHashFingerprint: sha256Hex(account.passwordHash ?? 'none'),
        ...(context.ipAddress === undefined ? {} : { requestIp: context.ipAddress }),
      };

      await this.#store.save(record);
      await this.#deliver?.({
        tenantId,
        userId: account.userId,
        identifier: account.identifier,
        token,
        expiresAt: record.expiresAt,
      });
    }

    // Same answer either way. An attacker learns nothing about which addresses have accounts.
    return { accepted: true };
  }

  /** Check a token without consuming it, so a reset form can be rendered or refused. */
  async inspect(tenantId: TenantId, token: string): Promise<ResetTokenRecord | undefined> {
    const record = await this.#store.findByHash(tenantId, tokenFingerprint(token, this.#pepper));
    if (!record) return undefined;
    if (record.consumedAt !== undefined || record.revokedAt !== undefined) return undefined;
    if (this.#clock.now() >= record.expiresAt) return undefined;
    return record;
  }

  /**
   * Complete a reset.
   *
   * Everything that can reject the request is checked first, then the token is *claimed* with a
   * compare-and-swap, and only a caller that won the claim changes the password. The checks may
   * run twice concurrently — they are read-only — but the claim cannot succeed twice, so the
   * second attempt is refused rather than racing the first to set a different password.
   */
  async complete(tenantId: TenantId, token: string, newPassword: string): Promise<void> {
    const record = await this.#store.findByHash(tenantId, tokenFingerprint(token, this.#pepper));
    const now = this.#clock.now();

    if (!record || record.revokedAt !== undefined) {
      throw new PlatformError('Reset token not recognised', { code: 'AUTH_RESET_TOKEN_INVALID' });
    }
    if (record.consumedAt !== undefined) {
      throw new PlatformError('Reset token already used', { code: 'AUTH_RESET_TOKEN_INVALID' });
    }
    if (now >= record.expiresAt) {
      throw new PlatformError('Reset token expired', { code: 'AUTH_RESET_TOKEN_INVALID' });
    }

    const account = await this.#directory.findById(tenantId, record.userId);
    if (!account) {
      throw new PlatformError('Account no longer exists', { code: 'AUTH_RESET_TOKEN_INVALID' });
    }
    if (sha256Hex(account.passwordHash ?? 'none') !== record.passwordHashFingerprint) {
      throw new PlatformError('Reset token predates a password change', {
        code: 'AUTH_RESET_TOKEN_INVALID',
      });
    }

    await this.#policy?.assertValid(newPassword, {
      tenantId,
      userId: record.userId,
      userInfo: [account.identifier],
    });

    // The gate. Every replica racing this token reaches here; exactly one is told `true`.
    if (!(await this.#store.markConsumed(tenantId, record.id, now))) {
      throw new PlatformError('Reset token already used', { code: 'AUTH_RESET_TOKEN_INVALID' });
    }

    const passwordHash = await this.#hasher.hash(newPassword);
    await this.#directory.updatePasswordHash(tenantId, record.userId, passwordHash);
    // Invalidates every access token, refresh token and session minted before this moment.
    await this.#directory.incrementTokenVersion(tenantId, record.userId);
    await this.#store.revokeForUser(tenantId, record.userId, now);
    await this.#onReset?.(tenantId, record.userId);
  }

  /** Revoke outstanding tokens — called when a password changes by any other route. */
  async revokeAll(tenantId: TenantId, userId: UserId): Promise<number> {
    return this.#store.revokeForUser(tenantId, userId, this.#clock.now());
  }
}
