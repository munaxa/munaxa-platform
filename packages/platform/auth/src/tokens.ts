import {
  HmacSigner,
  KeyRing,
  constantTimeEqual,
  fromBase64Url,
  secureToken,
  toBase64Url,
  tokenFingerprint,
  type Signer,
} from '@munaxa/crypto';
import type { RefreshTokenRecord, RefreshTokenStorePort } from '@munaxa/interfaces';
import {
  PlatformError,
  systemClock,
  unsafeId,
  type Clock,
  type DeviceId,
  type DurationMs,
  type SessionId,
  type TenantId,
  type TokenFamilyId,
  type UserId,
} from '@munaxa/types';
import { prefixedId } from '@munaxa/crypto';

/**
 * Access tokens (JWT) and refresh tokens (opaque).
 *
 * The split is deliberate and is the core of the design:
 *
 * - **Access tokens are JWTs**: short-lived, self-contained, verified without a database round
 *   trip. They cannot be revoked, which is precisely why they are short-lived and carry `sid` —
 *   anything that must be revocable is checked against the session, not the token.
 * - **Refresh tokens are opaque and stored hashed**: long-lived, revocable, single-use. Making
 *   them a JWT would mean a long-lived credential nobody can withdraw.
 *
 * Rotation with reuse detection is what makes a stolen refresh token survivable. Each use mints
 * a replacement and marks the old one used; presenting a used token means two parties hold the
 * lineage, so the whole family is revoked and the user is forced to re-authenticate. The
 * legitimate user notices a logout; the attacker gets nothing.
 */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly tid: TenantId;
  readonly sid?: SessionId;
  readonly did?: DeviceId;
  readonly iss: string;
  readonly aud?: readonly string[];
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  /** Bumped by the account; a token minted before the bump no longer matches. */
  readonly ver: number;
  readonly amr?: readonly string[];
  readonly mfa?: boolean;
  readonly scope?: readonly string[];
  readonly roles?: readonly string[];
  readonly perms?: readonly string[];
}

export interface TokenServiceOptions {
  readonly signer: Signer;
  readonly issuer: string;
  readonly audience?: readonly string[];
  readonly accessTokenTtl?: DurationMs;
  readonly clock?: Clock;
  /** Tolerance for clock drift between issuer and verifier. */
  readonly clockSkew?: DurationMs;
}

export interface IssueAccessTokenInput {
  readonly subject: string;
  readonly tenantId: TenantId;
  readonly tokenVersion: number;
  readonly sessionId?: SessionId;
  readonly deviceId?: DeviceId;
  readonly authMethods?: readonly string[];
  readonly mfaSatisfied?: boolean;
  readonly scopes?: readonly string[];
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly ttl?: DurationMs;
}

export class TokenService {
  readonly #signer: Signer;
  readonly #issuer: string;
  readonly #audience: readonly string[] | undefined;
  readonly #ttl: DurationMs;
  readonly #clock: Clock;
  readonly #skew: DurationMs;

  constructor(options: TokenServiceOptions) {
    this.#signer = options.signer;
    this.#issuer = options.issuer;
    this.#audience = options.audience;
    this.#ttl = options.accessTokenTtl ?? 15 * 60 * 1_000;
    this.#clock = options.clock ?? systemClock;
    this.#skew = options.clockSkew ?? 30_000;
  }

  issueAccessToken(input: IssueAccessTokenInput): { token: string; claims: AccessTokenClaims } {
    const now = this.#clock.now();
    const ttl = input.ttl ?? this.#ttl;

    const claims: AccessTokenClaims = {
      sub: input.subject,
      tid: input.tenantId,
      iss: this.#issuer,
      iat: Math.floor(now / 1_000),
      exp: Math.floor((now + ttl) / 1_000),
      jti: prefixedId('jti', now),
      ver: input.tokenVersion,
      ...(this.#audience === undefined ? {} : { aud: this.#audience }),
      ...(input.sessionId === undefined ? {} : { sid: input.sessionId }),
      ...(input.deviceId === undefined ? {} : { did: input.deviceId }),
      ...(input.authMethods === undefined ? {} : { amr: input.authMethods }),
      ...(input.mfaSatisfied === undefined ? {} : { mfa: input.mfaSatisfied }),
      ...(input.scopes === undefined ? {} : { scope: input.scopes }),
      ...(input.roles === undefined ? {} : { roles: input.roles }),
      ...(input.permissions === undefined ? {} : { perms: input.permissions }),
    };

    return { token: this.#encode(claims), claims };
  }

  /**
   * Verify a token and return its claims.
   *
   * Everything is checked: the algorithm (against the signer's, not against the header's claim
   * about itself), the signature, expiry, issuer and audience. The `alg: none` and
   * algorithm-confusion families of JWT attacks all come from trusting the header, so the header
   * here is used for the key id only.
   */
  verifyAccessToken(
    token: string,
    options: { audience?: readonly string[]; tokenVersion?: number } = {},
  ): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new PlatformError('Malformed token', { code: 'AUTH_TOKEN_INVALID' });
    }
    const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];

    let header: { kid?: string; alg?: string };
    let claims: AccessTokenClaims;
    try {
      header = JSON.parse(fromBase64Url(encodedHeader).toString('utf8')) as {
        kid?: string;
        alg?: string;
      };
      claims = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as AccessTokenClaims;
    } catch {
      throw new PlatformError('Malformed token', { code: 'AUTH_TOKEN_INVALID' });
    }

    const verified = this.#signer.verify(`${encodedHeader}.${encodedPayload}`, {
      kid: header.kid ?? '',
      // The signer's own algorithm, never the header's. A token claiming `alg: none` fails here.
      algorithm: this.#signer.algorithm,
      value: signature,
    });
    if (!verified) {
      throw new PlatformError('Token signature is not valid', { code: 'AUTH_TOKEN_INVALID' });
    }

    const now = this.#clock.now();
    if (claims.exp * 1_000 + this.#skew < now) {
      throw new PlatformError('Token expired', { code: 'AUTH_TOKEN_EXPIRED' });
    }
    if (claims.iat * 1_000 - this.#skew > now) {
      throw new PlatformError('Token issued in the future', { code: 'AUTH_TOKEN_INVALID' });
    }
    if (claims.iss !== this.#issuer) {
      throw new PlatformError('Token issuer mismatch', { code: 'AUTH_TOKEN_INVALID' });
    }

    const expectedAudience = options.audience ?? this.#audience;
    if (expectedAudience?.length) {
      const actual = claims.aud ?? [];
      if (!expectedAudience.some((entry) => actual.includes(entry))) {
        throw new PlatformError('Token audience mismatch', { code: 'AUTH_TOKEN_INVALID' });
      }
    }

    if (options.tokenVersion !== undefined && claims.ver !== options.tokenVersion) {
      throw new PlatformError('Token version is stale', { code: 'AUTH_TOKEN_INVALID' });
    }

    return claims;
  }

  /** Read the claims without verifying. For logging a rejected token, never for a decision. */
  decodeUnsafe(token: string): AccessTokenClaims | undefined {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    try {
      return JSON.parse(fromBase64Url(payload).toString('utf8')) as AccessTokenClaims;
    } catch {
      return undefined;
    }
  }

  #encode(claims: AccessTokenClaims): string {
    const signed = this.#signer.sign('');
    const header = toBase64Url(
      JSON.stringify({ alg: this.#signer.algorithm, typ: 'JWT', kid: signed.kid }),
    );
    const payload = toBase64Url(JSON.stringify(claims));
    const signature = this.#signer.sign(`${header}.${payload}`);
    return `${header}.${payload}.${signature.value}`;
  }
}

export interface RefreshTokenServiceOptions {
  readonly store: RefreshTokenStorePort;
  readonly clock?: Clock;
  readonly ttl?: DurationMs;
  /** Server-side pepper, so a stolen database cannot be used to look tokens up. */
  readonly pepper?: string;
  readonly onReuseDetected?: (record: RefreshTokenRecord) => void | Promise<void>;
}

export interface IssueRefreshInput {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly tokenVersion: number;
  readonly sessionId?: SessionId;
  readonly deviceId?: DeviceId;
  readonly familyId?: TokenFamilyId;
}

export interface IssuedRefreshToken {
  /** The only time the plaintext exists. It is never stored and never logged. */
  readonly token: string;
  readonly record: RefreshTokenRecord;
}

export interface RotationResult {
  readonly issued: IssuedRefreshToken;
  readonly previous: RefreshTokenRecord;
}

export class RefreshTokenService {
  readonly #store: RefreshTokenStorePort;
  readonly #clock: Clock;
  readonly #ttl: DurationMs;
  readonly #pepper: string | undefined;
  readonly #onReuseDetected: RefreshTokenServiceOptions['onReuseDetected'];

  constructor(options: RefreshTokenServiceOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? systemClock;
    this.#ttl = options.ttl ?? 30 * 24 * 60 * 60 * 1_000;
    this.#pepper = options.pepper;
    this.#onReuseDetected = options.onReuseDetected;
  }

  async issue(input: IssueRefreshInput): Promise<IssuedRefreshToken> {
    const now = this.#clock.now();
    // 256 bits of CSPRNG output. Opaque: it carries no claims, so nothing can be read from it and
    // nothing about it can be trusted without the store.
    const token = secureToken(32);

    const record: RefreshTokenRecord = {
      id: prefixedId('rt', now),
      tenantId: input.tenantId,
      userId: input.userId,
      familyId: input.familyId ?? unsafeId<TokenFamilyId>(prefixedId('fam', now)),
      tokenHash: this.#hash(token),
      issuedAt: now,
      expiresAt: now + this.#ttl,
      tokenVersion: input.tokenVersion,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    };

    await this.#store.save(record);
    return { token, record };
  }

  /**
   * Exchange a refresh token for a new one.
   *
   * The reuse path is the important one. A token that has already been rotated means the lineage
   * is held by two parties — the legitimate client and whoever copied it — and there is no way to
   * tell which one is presenting it. Revoking the entire family is the only safe answer: it ends
   * the attacker's access, and it surfaces to the user as an unexpected sign-out, which is a
   * signal rather than a silent compromise.
   */
  async rotate(
    tenantId: TenantId,
    token: string,
    context: { deviceId?: DeviceId; tokenVersion?: number } = {},
  ): Promise<RotationResult> {
    const record = await this.#store.findByHash(tenantId, this.#hash(token));
    if (!record) {
      throw new PlatformError('Refresh token not recognised', { code: 'AUTH_TOKEN_INVALID' });
    }

    if (record.rotatedAt !== undefined) {
      await this.#store.revokeFamily(tenantId, record.familyId, this.#clock.now(), 'token-reuse');
      await this.#onReuseDetected?.(record);
      throw new PlatformError('Refresh token replay detected; family revoked', {
        code: 'AUTH_TOKEN_REUSED',
        details: { familyId: record.familyId },
      });
    }

    if (record.revokedAt !== undefined) {
      throw new PlatformError('Refresh token revoked', { code: 'AUTH_TOKEN_INVALID' });
    }

    const now = this.#clock.now();
    if (now >= record.expiresAt) {
      throw new PlatformError('Refresh token expired', { code: 'AUTH_TOKEN_EXPIRED' });
    }

    if (context.tokenVersion !== undefined && context.tokenVersion !== record.tokenVersion) {
      throw new PlatformError('Refresh token predates a credential change', {
        code: 'AUTH_TOKEN_INVALID',
      });
    }

    // Device binding: a token issued to one device must not be redeemable from another.
    if (
      record.deviceId !== undefined &&
      context.deviceId !== undefined &&
      record.deviceId !== context.deviceId
    ) {
      await this.#store.revokeFamily(tenantId, record.familyId, now, 'device-mismatch');
      throw new PlatformError('Refresh token presented from a different device', {
        code: 'AUTH_TOKEN_INVALID',
      });
    }

    const issued = await this.issue({
      tenantId,
      userId: record.userId,
      tokenVersion: record.tokenVersion,
      familyId: record.familyId,
      ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
      ...(record.deviceId === undefined ? {} : { deviceId: record.deviceId }),
    });

    const previous: RefreshTokenRecord = {
      ...record,
      rotatedAt: now,
      replacedBy: issued.record.id,
    };
    await this.#store.update(previous);

    return { issued, previous };
  }

  async revoke(tenantId: TenantId, token: string, reason: string): Promise<boolean> {
    const record = await this.#store.findByHash(tenantId, this.#hash(token));
    if (!record || record.revokedAt !== undefined) return false;
    await this.#store.update({ ...record, revokedAt: this.#clock.now(), revocationReason: reason });
    return true;
  }

  async revokeFamily(tenantId: TenantId, familyId: TokenFamilyId, reason: string): Promise<number> {
    return this.#store.revokeFamily(tenantId, familyId, this.#clock.now(), reason);
  }

  async revokeAllForUser(tenantId: TenantId, userId: UserId, reason: string): Promise<number> {
    return this.#store.revokeForUser(tenantId, userId, this.#clock.now(), reason);
  }

  /** Verify without rotating. For an introspection endpoint, not for the refresh path. */
  async inspect(tenantId: TenantId, token: string): Promise<RefreshTokenRecord | undefined> {
    return this.#store.findByHash(tenantId, this.#hash(token));
  }

  #hash(token: string): string {
    return tokenFingerprint(token, this.#pepper);
  }
}

/**
 * A signer built from a shared secret.
 *
 * Convenience for the common case, and the place the key-ring construction is done once so
 * products do not each invent their own.
 */
export function hmacSignerFromSecret(secret: string, kid = 'k1'): Signer {
  const key = new Uint8Array(32);
  const bytes = Buffer.from(secret, 'utf8');
  // HMAC accepts any key length; deriving a fixed 32 bytes keeps behaviour identical whatever
  // length of secret a deployment supplies.
  for (let i = 0; i < bytes.length; i++)
    key[i % 32] = ((key[i % 32] as number) ^ (bytes[i] as number)) & 0xff;
  return new HmacSigner(new KeyRing({ kid, key }));
}

/** Constant-time comparison of two opaque tokens. */
export function tokensEqual(a: string, b: string): boolean {
  return constantTimeEqual(a, b);
}
