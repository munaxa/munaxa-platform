import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { secureBytes } from './random.js';

const scryptAsync = promisify(scrypt) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * scrypt is the platform default because it is memory-hard and it is in Node's standard library:
 * no native build step, no optional dependency that silently falls back to something weaker, and
 * no version of this package that behaves differently on a machine where `node-gyp` failed.
 * Argon2id is better where it is available, which is why `PasswordHasher` is an interface and
 * `registerHasher` exists — a product that already ships argon2 keeps it and gets everything else.
 *
 * Hashes are stored in a self-describing PHC-style string:
 *
 *   $scrypt$v=1$n=16384,r=8,p=1$<salt-b64url>$<hash-b64url>
 *
 * Every parameter needed to verify is inside the string, so raising the cost factor does not
 * invalidate existing hashes — `needsRehash` reports which ones are behind, and they are upgraded
 * transparently on the next successful login.
 */

export interface ScryptParams {
  /** CPU/memory cost. Must be a power of two. */
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: number;
  readonly saltLength: number;
}

/**
 * ~16 MiB per hash (128 · N · r bytes) and roughly 50–100 ms on current server hardware. High
 * enough to make offline cracking expensive, low enough that a login burst does not exhaust
 * memory — the two failure modes are symmetric and both are outages.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 32,
  saltLength: 16,
};

export interface PasswordHasher {
  /** The identifier that appears after the first `$` in the encoded hash. */
  readonly id: string;
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
  /** True when `encoded` was produced with parameters weaker than the current policy. */
  needsRehash(encoded: string): boolean;
}

function maxmemFor(params: ScryptParams): number {
  // Node's default maxmem (32 MiB) is below what N=16384,r=8 needs once p > 1; compute it.
  return Math.max(32 * 1024 * 1024, 256 * params.N * params.r);
}

export class ScryptPasswordHasher implements PasswordHasher {
  readonly id = 'scrypt';
  readonly #params: ScryptParams;

  constructor(params: Partial<ScryptParams> = {}) {
    const merged = { ...DEFAULT_SCRYPT_PARAMS, ...params };
    if ((merged.N & (merged.N - 1)) !== 0) {
      throw new TypeError(`scrypt N must be a power of two, got ${merged.N}`);
    }
    this.#params = merged;
  }

  async hash(password: string): Promise<string> {
    const params = this.#params;
    const salt = secureBytes(params.saltLength);
    const derived = await scryptAsync(normalize(password), salt, params.keyLength, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: maxmemFor(params),
    });
    return `$scrypt$v=1$n=${params.N},r=${params.r},p=${params.p}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parseScrypt(encoded);
    if (!parsed) return false;
    const derived = await scryptAsync(normalize(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: maxmemFor({ ...DEFAULT_SCRYPT_PARAMS, N: parsed.N, r: parsed.r, p: parsed.p }),
    });
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  }

  needsRehash(encoded: string): boolean {
    const parsed = parseScrypt(encoded);
    if (!parsed) return true;
    const params = this.#params;
    return (
      parsed.N < params.N ||
      parsed.r < params.r ||
      parsed.p < params.p ||
      parsed.hash.length < params.keyLength
    );
  }
}

interface ParsedScrypt {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const SCRYPT_PATTERN = /^\$scrypt\$v=1\$n=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function parseScrypt(encoded: string): ParsedScrypt | null {
  const match = SCRYPT_PATTERN.exec(encoded);
  if (!match) return null;
  const [, n, r, p, salt, hash] = match;
  return {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    salt: fromBase64Url(salt as string),
    hash: fromBase64Url(hash as string),
  };
}

/**
 * Unicode normalization before hashing.
 *
 * "é" typed on macOS and "é" typed on Windows are different byte sequences for the same
 * password. Without NFKC a user can set a password on one device and be unable to log in from
 * another — a support ticket that looks exactly like an attack.
 */
function normalize(password: string): Buffer {
  return utf8(password.normalize('NFKC'));
}

/**
 * Dispatches to the hasher that produced each hash.
 *
 * This is what makes migration possible without a forced reset: register the product's existing
 * bcrypt or argon2 verifier, keep serving those users, and let every successful login rewrite
 * the hash in the current scheme. After a season the legacy hasher can be unregistered.
 */
export class PasswordHasherRegistry implements PasswordHasher {
  readonly id = 'registry';
  readonly #primary: PasswordHasher;
  readonly #legacy = new Map<string, PasswordHasher>();

  constructor(primary: PasswordHasher = new ScryptPasswordHasher()) {
    this.#primary = primary;
  }

  /**
   * @param prefix the encoded-hash prefix this verifier owns, e.g. `$2b$` for bcrypt or
   *   `$argon2id$` for argon2.
   */
  registerLegacy(prefix: string, hasher: PasswordHasher): this {
    this.#legacy.set(prefix, hasher);
    return this;
  }

  hash(password: string): Promise<string> {
    return this.#primary.hash(password);
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const legacy = this.#findLegacy(encoded);
    return legacy ? legacy.verify(password, encoded) : this.#primary.verify(password, encoded);
  }

  /** Any hash not produced by the primary hasher needs rehashing, by definition. */
  needsRehash(encoded: string): boolean {
    return this.#findLegacy(encoded) ? true : this.#primary.needsRehash(encoded);
  }

  #findLegacy(encoded: string): PasswordHasher | undefined {
    for (const [prefix, hasher] of this.#legacy) {
      if (encoded.startsWith(prefix)) return hasher;
    }
    return undefined;
  }
}

/**
 * A hash of a value nobody knows, used to spend the same time on the "no such account" path as
 * on a real verification. Without it, response time answers "does this address have an account?"
 */
let dummyHashPromise: Promise<string> | undefined;

export function dummyPasswordHash(hasher: PasswordHasher = defaultPasswordHasher): Promise<string> {
  dummyHashPromise ??= hasher.hash(toBase64Url(secureBytes(32)));
  return dummyHashPromise;
}

export const defaultPasswordHasher: PasswordHasher = new ScryptPasswordHasher();
