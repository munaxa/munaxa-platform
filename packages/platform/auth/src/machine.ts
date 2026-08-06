import type { ApiKeyRecord, ApiKeyStorePort } from '@munaxa/interfaces';
import {
  PlatformError,
  systemClock,
  type ApiKeyPrincipal,
  type Clock,
  type DurationMs,
  type ServicePrincipal,
  type TenantId,
  type UserId,
  type ClientId,
} from '@munaxa/types';
import { prefixedId, secureToken, tokenFingerprint } from '@munaxa/crypto';

/**
 * Machine authentication: API keys and service accounts.
 *
 * The key format is `mxa_<env>_<id>_<secret>`, and every part of it is deliberate:
 *
 * - The `mxa_` prefix makes a leaked key recognisable in a commit, a log or a paste — which is
 *   what lets automated secret scanning find it and what lets a human know what they are looking
 *   at.
 * - The embedded id means verification is a single indexed lookup rather than a scan over every
 *   key's hash, which is what makes revocation and per-key rate limits practical at scale.
 * - The secret is hashed at rest with the same fingerprint function refresh tokens use, so a
 *   database dump yields nothing presentable.
 *
 * Keys are scoped, optionally CIDR-restricted, and optionally expiring. The platform's own guard
 * denies machine principals the ability to change security policy — see `BASELINE_POLICIES` in
 * `@munaxa/rbac` — so a leaked key cannot be used to weaken the system that would catch it.
 */
export interface ApiKeyServiceOptions {
  readonly store: ApiKeyStorePort;
  readonly clock?: Clock;
  readonly pepper?: string;
  /** Written into the key so a staging key is visibly not a production key. */
  readonly environment?: string;
  readonly defaultTtl?: DurationMs;
}

export interface CreateApiKeyInput {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly createdBy?: UserId;
  readonly onBehalfOf?: UserId;
  readonly ttl?: DurationMs;
  readonly allowedCidrs?: readonly string[];
}

export interface CreatedApiKey {
  /** Returned exactly once. Not recoverable — a lost key is rotated, never retrieved. */
  readonly key: string;
  readonly record: ApiKeyRecord;
}

export class ApiKeyService {
  readonly #store: ApiKeyStorePort;
  readonly #clock: Clock;
  readonly #pepper: string | undefined;
  readonly #environment: string;
  readonly #defaultTtl: DurationMs | undefined;

  constructor(options: ApiKeyServiceOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? systemClock;
    this.#pepper = options.pepper;
    this.#environment = options.environment ?? 'live';
    this.#defaultTtl = options.defaultTtl;
  }

  async create(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const now = this.#clock.now();
    const id = prefixedId('key', now);
    const secret = secureToken(32);
    const ttl = input.ttl ?? this.#defaultTtl;

    const record: ApiKeyRecord = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      secretHash: tokenFingerprint(secret, this.#pepper),
      scopes: input.scopes,
      createdAt: now,
      ...(input.createdBy === undefined ? {} : { createdBy: input.createdBy }),
      ...(input.onBehalfOf === undefined ? {} : { onBehalfOf: input.onBehalfOf }),
      ...(ttl === undefined ? {} : { expiresAt: now + ttl }),
      ...(input.allowedCidrs === undefined ? {} : { allowedCidrs: input.allowedCidrs }),
    };

    await this.#store.save(record);
    return { key: `mxa_${this.#environment}_${id}_${secret}`, record };
  }

  /**
   * Verify a presented key and return the principal it authenticates.
   *
   * Every failure — malformed, unknown, revoked, expired, wrong address — raises the same error.
   * A caller probing with guessed keys learns only that the key did not work.
   */
  async verify(
    key: string,
    context: { tenantId?: TenantId; ipAddress?: string } = {},
  ): Promise<ApiKeyPrincipal> {
    const parsed = parseApiKey(key);
    if (!parsed) throw invalidKey();

    const record = await this.#store.findById(context.tenantId ?? parsed.tenantHint, parsed.id);
    if (!record) throw invalidKey();
    if (record.secretHash !== tokenFingerprint(parsed.secret, this.#pepper)) throw invalidKey();
    if (record.revokedAt !== undefined) throw invalidKey();
    if (record.expiresAt !== undefined && this.#clock.now() >= record.expiresAt) throw invalidKey();
    if (context.tenantId !== undefined && record.tenantId !== context.tenantId) throw invalidKey();

    if (record.allowedCidrs?.length && !isAllowedAddress(context.ipAddress, record.allowedCidrs)) {
      throw invalidKey();
    }

    // Last-used is recorded so an unused key can be found and retired, which is most of what key
    // hygiene amounts to in practice.
    await this.#store.update({ ...record, lastUsedAt: this.#clock.now() });

    return {
      kind: 'api-key',
      tenantId: record.tenantId,
      keyId: record.id,
      scopes: record.scopes,
      permissions: record.scopes,
      ...(record.onBehalfOf === undefined ? {} : { onBehalfOf: record.onBehalfOf }),
    };
  }

  async revoke(tenantId: TenantId, keyId: string): Promise<boolean> {
    const record = await this.#store.findById(tenantId, keyId);
    if (!record || record.revokedAt !== undefined) return false;
    await this.#store.update({ ...record, revokedAt: this.#clock.now() });
    return true;
  }

  /** Keys never include their secret, so this is safe to render in an admin UI. */
  async list(tenantId: TenantId): Promise<readonly Omit<ApiKeyRecord, 'secretHash'>[]> {
    const records = await this.#store.list(tenantId);
    return records.map(({ secretHash: _secretHash, ...rest }) => rest);
  }
}

interface ParsedApiKey {
  readonly environment: string;
  readonly id: string;
  readonly secret: string;
  readonly tenantHint: TenantId;
}

export function parseApiKey(key: string): ParsedApiKey | undefined {
  // `mxa_<env>_key_<id>_<secret>`, split into exactly five parts. The secret is base64url and may
  // itself contain underscores, so only the first four separators are structural and everything
  // after them is the secret — splitting naively truncates one key in four.
  const parts = key.split('_');
  if (parts.length < 5 || parts[0] !== 'mxa' || parts[2] !== 'key') return undefined;
  const [, environment, , id] = parts as [string, string, string, string];
  const secret = parts.slice(4).join('_');
  if (id.length < 8 || secret.length < 20) return undefined;
  return {
    environment,
    id: `key_${id}`,
    secret,
    // The key names no tenant; callers that know it pass it, and the store resolves the rest.
    tenantHint: 'root' as TenantId,
  };
}

function invalidKey(): PlatformError {
  return new PlatformError('API key is not valid', { code: 'AUTH_INVALID_CREDENTIALS' });
}

/**
 * CIDR matching for IPv4, with an exact match fallback for IPv6.
 *
 * Deliberately narrow: full IPv6 prefix arithmetic belongs in a library, and getting it subtly
 * wrong here would silently widen an allow-list. An unparseable entry never matches.
 */
export function isAllowedAddress(address: string | undefined, cidrs: readonly string[]): boolean {
  if (!address) return false;

  for (const cidr of cidrs) {
    if (cidr === address) return true;
    const [network, bits] = cidr.split('/');
    if (!network || !bits || network.includes(':')) continue;

    const prefix = Number(bits);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;

    const networkValue = ipv4ToNumber(network);
    const addressValue = ipv4ToNumber(address);
    if (networkValue === undefined || addressValue === undefined) continue;

    const mask = prefix === 0 ? 0 : (0xff_ff_ff_ff << (32 - prefix)) >>> 0;
    if ((networkValue & mask) === (addressValue & mask)) return true;
  }
  return false;
}

function ipv4ToNumber(address: string): number | undefined {
  const octets = address.split('.');
  if (octets.length !== 4) return undefined;

  let value = 0;
  for (const octet of octets) {
    const parsed = Number(octet);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) return undefined;
    value = (value << 8) | parsed;
  }
  return value >>> 0;
}

/**
 * Machine-to-machine access through the client-credentials grant.
 *
 * The same store backs it: a service account is an API key with a client id, and treating them as
 * one thing means one revocation path, one audit trail and one place scopes are checked.
 */
export interface ClientCredentialsInput {
  readonly clientId: ClientId;
  readonly clientSecret: string;
  readonly tenantId: TenantId;
  readonly requestedScopes?: readonly string[];
}

export class ServiceAccountService {
  readonly #keys: ApiKeyService;

  constructor(keys: ApiKeyService) {
    this.#keys = keys;
  }

  /**
   * Exchange client credentials for a principal.
   *
   * Requested scopes are intersected with the granted ones, never unioned: a client asking for
   * more than it holds gets what it holds, and asking for a scope it does not have is not an
   * error worth distinguishing from having fewer permissions.
   */
  async authenticate(input: ClientCredentialsInput): Promise<ServicePrincipal> {
    const principal = await this.#keys.verify(input.clientSecret, { tenantId: input.tenantId });

    const granted = input.requestedScopes
      ? principal.scopes.filter((scope) => input.requestedScopes?.includes(scope))
      : principal.scopes;

    return {
      kind: 'service',
      tenantId: principal.tenantId,
      clientId: input.clientId,
      scopes: granted,
      permissions: granted,
    };
  }
}
