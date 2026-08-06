import { createHmac } from 'node:crypto';
import type { CachePort, MfaEnrollment, MfaEnrollmentStorePort } from '@munaxa/interfaces';
import {
  PlatformError,
  systemClock,
  type Clock,
  type DurationMs,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import {
  constantTimeEqualBytes,
  numericCode,
  recoveryCode,
  secureBytes,
  sha256Hex,
} from '@munaxa/crypto';

/**
 * Multi-factor authentication.
 *
 * TOTP (RFC 6238) is implemented here rather than taken from a dependency: it is eighty lines of
 * HMAC, the algorithm has not changed since 2011, and a second-factor implementation is exactly
 * the code you want reviewable in-tree rather than pulled from a package with four transitive
 * dependencies.
 *
 * Two properties every second factor here shares:
 *
 * - **Single use, fleet-wide.** A code that verifies is claimed through `CachePort.setIfAbsent`,
 *   so an attacker who observes one — over a shoulder, in a phishing proxy — cannot replay it
 *   inside its validity window against *any* replica. In 1.0 the claim lived in a process-local
 *   Map, which meant the replay simply had to land on a different pod.
 * - **Constant-time comparison.** Codes are short; a timing oracle on a six-digit value is a
 *   practical attack, not a theoretical one.
 */
export interface TotpOptions {
  /** Seconds per step. 30 is the near-universal choice and what every authenticator app assumes. */
  readonly period?: number;
  readonly digits?: number;
  /**
   * Steps of drift accepted either side. One step (±30s) covers ordinary phone clock skew;
   * larger windows multiply an attacker's guessing surface for no real usability gain.
   */
  readonly window?: number;
  readonly algorithm?: 'sha1' | 'sha256' | 'sha512';
}

const DEFAULT_TOTP: Required<TotpOptions> = {
  period: 30,
  digits: 6,
  window: 1,
  // SHA-1 is correct here despite its reputation: HMAC-SHA1 is unaffected by the collision
  // attacks on bare SHA-1, and every authenticator app in existence assumes it.
  algorithm: 'sha1',
};

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(secureBytes(bytes));
}

export function totpCode(secret: string, at: number, options: TotpOptions = {}): string {
  const config = { ...DEFAULT_TOTP, ...options };
  const counter = Math.floor(at / 1_000 / config.period);
  return hotp(base32Decode(secret), counter, config.digits, config.algorithm);
}

/**
 * Verify a TOTP code, returning the matched step so the caller can reject a replay.
 *
 * Returns `undefined` rather than throwing: an incorrect code is an expected outcome on a login
 * path, not an exceptional one.
 */
export function verifyTotp(
  secret: string,
  code: string,
  at: number,
  options: TotpOptions = {},
): number | undefined {
  const config = { ...DEFAULT_TOTP, ...options };
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1_000 / config.period);
  const candidate = Buffer.from(code.replaceAll(/\s/g, ''), 'utf8');

  for (let drift = -config.window; drift <= config.window; drift++) {
    const expected = Buffer.from(
      hotp(key, counter + drift, config.digits, config.algorithm),
      'utf8',
    );
    if (constantTimeEqualBytes(expected, candidate)) return counter + drift;
  }
  return undefined;
}

function hotp(key: Buffer, counter: number, digits: number, algorithm: string): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(Math.max(0, counter)));

  const digest = createHmac(algorithm, key).update(buffer).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The `otpauth://` URI an authenticator app scans. */
export function totpUri(
  secret: string,
  options: { issuer: string; account: string } & TotpOptions,
): string {
  const config = { ...DEFAULT_TOTP, ...options };
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);
  const params = new URLSearchParams({
    secret,
    issuer: options.issuer,
    algorithm: config.algorithm.toUpperCase(),
    digits: String(config.digits),
    period: String(config.period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replaceAll(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of cleaned) {
    const index = BASE32.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Email and SMS one-time codes.
 *
 * Weaker than TOTP — the code travels over a channel we do not control — and treated as such:
 * short expiry, a hard attempt cap, and single use. The cap matters most: a six-digit code with
 * unlimited attempts is a four-second brute force.
 */
export interface OtpChallenge {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** Hashed. The plaintext exists only long enough to be delivered. */
  readonly codeHash: string;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly consumedAt?: number;
}

export interface OtpServiceOptions {
  readonly clock?: Clock;
  readonly ttl?: DurationMs;
  readonly digits?: number;
  readonly maxAttempts?: number;
  /**
   * Where challenges live. Supply one and a code issued by any replica verifies on any other —
   * which is the only configuration that works behind a load balancer.
   *
   * Omit it and challenges are held in this process: correct on one node, and on more than one a
   * user is simply told their correct code is wrong whenever they land on a different pod. The
   * constructor records which mode it is in on `distributed`.
   */
  readonly cache?: CachePort;
}

export class OtpService {
  readonly #clock: Clock;
  readonly #ttl: DurationMs;
  readonly #digits: number;
  readonly #maxAttempts: number;
  readonly #cache: CachePort | undefined;
  /** Fallback storage. Used only when no cache is wired; see `distributed`. */
  readonly #local = new Map<string, OtpChallenge>();

  constructor(options: OtpServiceOptions = {}) {
    this.#clock = options.clock ?? systemClock;
    this.#ttl = options.ttl ?? 10 * 60 * 1_000;
    this.#digits = options.digits ?? 6;
    this.#maxAttempts = options.maxAttempts ?? 5;
    this.#cache = options.cache;
  }

  /** False when challenges are process-local, i.e. this service works on one replica only. */
  get distributed(): boolean {
    return this.#cache !== undefined;
  }

  /** Create a challenge. The plaintext code is returned once, for delivery, and never stored. */
  async issue(
    tenantId: TenantId,
    userId: UserId,
  ): Promise<{ challenge: OtpChallenge; code: string }> {
    const code = numericCode(this.#digits);
    const now = this.#clock.now();
    const challenge: OtpChallenge = {
      id: `otp_${sha256Hex(`${tenantId}:${userId}:${now}`).slice(0, 16)}`,
      tenantId,
      userId,
      codeHash: sha256Hex(code),
      expiresAt: now + this.#ttl,
      attempts: 0,
      maxAttempts: this.#maxAttempts,
    };
    await this.#save(challenge);
    return { challenge, code };
  }

  /**
   * Verify a code, at most once.
   *
   * The attempt counter is an atomic `increment` and consumption is a `setIfAbsent`, so neither
   * the guessing budget nor the single-use property depends on which replica the request lands
   * on. A correct code that loses the consumption race — the same code submitted twice in
   * parallel — is rejected, which is the safe direction.
   */
  async verify(challengeId: string, code: string): Promise<boolean> {
    const challenge = await this.get(challengeId);
    if (!challenge) return false;
    if (challenge.consumedAt !== undefined) return false;
    if (this.#clock.now() >= challenge.expiresAt) return false;

    const attempts = await this.#recordAttempt(challenge);
    if (attempts > challenge.maxAttempts) return false;

    const matched = constantTimeEqualBytes(
      Buffer.from(challenge.codeHash, 'hex'),
      Buffer.from(sha256Hex(code.trim()), 'hex'),
    );
    if (!matched) return false;

    return this.#consume(challenge);
  }

  async get(challengeId: string): Promise<OtpChallenge | undefined> {
    if (!this.#cache) return this.#local.get(challengeId);
    return this.#cache.get<OtpChallenge>(`otp:challenge:${challengeId}`);
  }

  /** Housekeeping for the process-local mode. A cache expires challenges itself. */
  purgeExpired(): number {
    const now = this.#clock.now();
    let removed = 0;
    for (const [id, challenge] of this.#local) {
      if (now >= challenge.expiresAt) {
        this.#local.delete(id);
        removed++;
      }
    }
    return removed;
  }

  async #save(challenge: OtpChallenge): Promise<void> {
    if (!this.#cache) {
      this.#local.set(challenge.id, challenge);
      return;
    }
    await this.#cache.set(`otp:challenge:${challenge.id}`, challenge, { ttl: this.#ttl });
  }

  async #recordAttempt(challenge: OtpChallenge): Promise<number> {
    if (!this.#cache) {
      const attempts = challenge.attempts + 1;
      this.#local.set(challenge.id, { ...challenge, attempts });
      return attempts;
    }
    return this.#cache.increment(`otp:attempts:${challenge.id}`, 1, { ttl: this.#ttl });
  }

  async #consume(challenge: OtpChallenge): Promise<boolean> {
    const consumedAt = this.#clock.now();
    if (!this.#cache) {
      const current = this.#local.get(challenge.id);
      if (current?.consumedAt !== undefined) return false;
      this.#local.set(challenge.id, { ...challenge, consumedAt });
      return true;
    }
    // Exactly one caller across the fleet wins this, which is what single-use means.
    const won = await this.#cache.setIfAbsent(`otp:consumed:${challenge.id}`, consumedAt, {
      ttl: this.#ttl,
    });
    if (won) {
      await this.#cache.set(
        `otp:challenge:${challenge.id}`,
        { ...challenge, consumedAt },
        { ttl: this.#ttl },
      );
    }
    return won;
  }
}

export interface MfaServiceOptions {
  readonly store: MfaEnrollmentStorePort;
  readonly clock?: Clock;
  readonly totp?: TotpOptions;
  /**
   * Where a consumed TOTP step is claimed.
   *
   * Wire it and a code accepted on one replica is refused on every other, for the life of its
   * window. Omit it and the claim is process-local: a shoulder-surfed code replays successfully
   * against a different pod, and the used-step map grows one entry per user forever. The service
   * reports which mode it is in on `distributed`.
   */
  readonly replayGuard?: CachePort;
  /** Encrypt a secret before it is stored, and decrypt on read. Wire it to `@munaxa/crypto`. */
  readonly protectSecret?: { seal(value: string): string; open(value: string): string };
  readonly recoveryCodeCount?: number;
}

export interface EnrollmentStart {
  readonly secret: string;
  readonly uri: string;
}

export class MfaService {
  readonly #store: MfaEnrollmentStorePort;
  readonly #clock: Clock;
  readonly #totp: TotpOptions;
  readonly #protect: MfaServiceOptions['protectSecret'];
  readonly #recoveryCodeCount: number;
  readonly #replayGuard: CachePort | undefined;
  /** Fallback claim store. Single-replica only; bounded by eviction rather than by design. */
  readonly #usedSteps = new Map<string, number>();

  constructor(options: MfaServiceOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? systemClock;
    this.#totp = options.totp ?? {};
    this.#protect = options.protectSecret;
    this.#recoveryCodeCount = options.recoveryCodeCount ?? 10;
    this.#replayGuard = options.replayGuard;
  }

  /** False when replay protection is process-local, i.e. it holds on one replica only. */
  get distributed(): boolean {
    return this.#replayGuard !== undefined;
  }

  /**
   * Begin TOTP enrollment.
   *
   * The enrollment is stored unconfirmed. It does not count as a second factor until the user
   * proves they can produce a code — otherwise a mis-scanned QR locks them out of their account
   * the next time they sign in.
   */
  async beginTotpEnrollment(
    tenantId: TenantId,
    userId: UserId,
    options: { issuer: string; account: string },
  ): Promise<EnrollmentStart> {
    const secret = generateTotpSecret();
    await this.#store.save({
      tenantId,
      userId,
      method: 'totp',
      secret: this.#protect ? this.#protect.seal(secret) : secret,
      createdAt: this.#clock.now(),
    });
    return { secret, uri: totpUri(secret, { ...options, ...this.#totp }) };
  }

  async confirmTotpEnrollment(
    tenantId: TenantId,
    userId: UserId,
    code: string,
  ): Promise<readonly string[]> {
    const enrollment = await this.#find(tenantId, userId, 'totp');
    if (!enrollment) {
      throw new PlatformError('No TOTP enrollment in progress', { code: 'AUTH_MFA_INVALID' });
    }

    const step = verifyTotp(this.#secretOf(enrollment), code, this.#clock.now(), this.#totp);
    if (step === undefined) {
      throw new PlatformError('Enrollment code is not valid', { code: 'AUTH_MFA_INVALID' });
    }

    await this.#store.save({ ...enrollment, confirmedAt: this.#clock.now() });

    // Recovery codes are generated once, shown once, and stored only as hashes.
    const codes = Array.from({ length: this.#recoveryCodeCount }, () => recoveryCode());
    await this.#store.saveRecoveryCodes(
      tenantId,
      userId,
      codes.map((value) => sha256Hex(value)),
    );
    return codes;
  }

  async isEnrolled(tenantId: TenantId, userId: UserId): Promise<boolean> {
    const enrollments = await this.#store.list(tenantId, userId);
    return enrollments.some((enrollment) => enrollment.confirmedAt !== undefined);
  }

  /** Verify a TOTP code for a confirmed enrollment, rejecting a step already used. */
  async verifyTotpCode(tenantId: TenantId, userId: UserId, code: string): Promise<boolean> {
    const enrollment = await this.#find(tenantId, userId, 'totp');
    if (!enrollment?.confirmedAt) return false;

    const step = verifyTotp(this.#secretOf(enrollment), code, this.#clock.now(), this.#totp);
    if (step === undefined) return false;

    if (!(await this.#claimStep(tenantId, userId, step))) return false;

    await this.#store.markUsed(tenantId, userId, 'totp', this.#clock.now());
    return true;
  }

  /** Consume a recovery code. Single use, by construction — the store removes it. */
  async verifyRecoveryCode(tenantId: TenantId, userId: UserId, code: string): Promise<boolean> {
    return this.#store.consumeRecoveryCode(tenantId, userId, sha256Hex(code.trim().toUpperCase()));
  }

  /**
   * Claim a TOTP step, once, fleet-wide.
   *
   * The TTL covers the drift window either side of the step, which is exactly how long the code
   * remains verifiable — holding the claim longer wastes space, and holding it shorter reopens
   * the replay at the tail of the window.
   */
  async #claimStep(tenantId: TenantId, userId: UserId, step: number): Promise<boolean> {
    const period = (this.#totp.period ?? 30) * 1_000;
    const window = this.#totp.window ?? 1;
    const ttl = period * (2 * window + 2);

    if (this.#replayGuard) {
      return this.#replayGuard.setIfAbsent(`mfa:totp:${tenantId}:${userId}:${step}`, 1, { ttl });
    }

    const key = `${tenantId}:${userId}`;
    if (this.#usedSteps.get(key) === step) return false;
    this.#usedSteps.set(key, step);
    return true;
  }

  async remove(tenantId: TenantId, userId: UserId, method: MfaEnrollment['method']): Promise<void> {
    await this.#store.remove(tenantId, userId, method);
    this.#usedSteps.delete(`${tenantId}:${userId}`);
  }

  async #find(
    tenantId: TenantId,
    userId: UserId,
    method: MfaEnrollment['method'],
  ): Promise<MfaEnrollment | undefined> {
    const enrollments = await this.#store.list(tenantId, userId);
    return enrollments.find((enrollment) => enrollment.method === method);
  }

  #secretOf(enrollment: MfaEnrollment): string {
    return this.#protect ? this.#protect.open(enrollment.secret) : enrollment.secret;
  }
}
