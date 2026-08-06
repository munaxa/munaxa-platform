import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
} from 'node:crypto';
import { PlatformError } from '@munaxa/types';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { constantTimeEqualBytes, hmacSha256 } from './hashing.js';
import type { KeyRing } from './keyring.js';

/**
 * Detached signatures.
 *
 * Used by everything that hands a value to a client and needs to recognise it later without
 * storing it: CSRF tokens, device-trust cookies, JWT segments, signed URLs. The signature always
 * carries the `kid` so verification survives key rotation.
 */

export type SignatureAlgorithm = 'HS256' | 'HS512' | 'RS256' | 'ES256';

export interface Signature {
  readonly kid: string;
  readonly algorithm: SignatureAlgorithm;
  /** base64url. */
  readonly value: string;
}

export interface Signer {
  readonly algorithm: SignatureAlgorithm;
  /**
   * The key id new signatures will carry, when the signer can report it without signing.
   *
   * Optional so a custom signer need not implement it, but worth implementing: a caller that
   * needs the `kid` to build an envelope — a JWT header, say — otherwise has to produce a
   * throwaway signature to read it, which under RS256 is the most expensive thing on the path.
   */
  readonly kid?: string;
  sign(payload: string | Uint8Array): Signature;
  verify(payload: string | Uint8Array, signature: Signature): boolean;
}

/** HMAC signing over a key ring. The default for anything both signed and verified by us. */
export class HmacSigner implements Signer {
  readonly algorithm: SignatureAlgorithm = 'HS256';
  readonly #ring: KeyRing;

  constructor(ring: KeyRing) {
    this.#ring = ring;
  }

  get kid(): string {
    return this.#ring.primaryKid;
  }

  sign(payload: string | Uint8Array): Signature {
    const key = this.#ring.primary;
    return {
      kid: key.kid,
      algorithm: this.algorithm,
      value: toBase64Url(hmacSha256(Buffer.from(key.key), payload)),
    };
  }

  verify(payload: string | Uint8Array, signature: Signature): boolean {
    if (signature.algorithm !== this.algorithm) return false;
    if (!this.#ring.has(signature.kid)) return false;
    const key = this.#ring.get(signature.kid);
    const expected = hmacSha256(Buffer.from(key.key), payload);
    return constantTimeEqualBytes(expected, fromBase64Url(signature.value));
  }
}

export interface AsymmetricKeyPair {
  readonly kid: string;
  /** PEM-encoded private key. Absent on verify-only nodes. */
  readonly privateKey?: string;
  /** PEM-encoded public key. */
  readonly publicKey: string;
}

/**
 * RSA or ECDSA signing.
 *
 * Worth the cost when the verifier is not us — a partner service, an edge worker, another
 * product's gateway — because it can verify without holding anything that lets it mint tokens.
 */
export class AsymmetricSigner implements Signer {
  readonly algorithm: SignatureAlgorithm;
  readonly #keys = new Map<string, { private?: KeyObject; public: KeyObject }>();
  #primaryKid: string;

  constructor(
    algorithm: Extract<SignatureAlgorithm, 'RS256' | 'ES256'>,
    keys: readonly AsymmetricKeyPair[],
  ) {
    if (keys.length === 0) throw new TypeError('AsymmetricSigner needs at least one key pair');
    this.algorithm = algorithm;
    for (const key of keys) {
      this.#keys.set(key.kid, {
        ...(key.privateKey ? { private: createPrivateKey(key.privateKey) } : {}),
        public: createPublicKey(key.publicKey),
      });
    }
    this.#primaryKid = (keys[0] as AsymmetricKeyPair).kid;
  }

  get primaryKid(): string {
    return this.#primaryKid;
  }

  get kid(): string {
    return this.#primaryKid;
  }

  usePrimary(kid: string): this {
    if (!this.#keys.has(kid))
      throw new PlatformError(`Unknown key id ${kid}`, { code: 'CRYPTO_KEY_UNKNOWN' });
    this.#primaryKid = kid;
    return this;
  }

  sign(payload: string | Uint8Array): Signature {
    const entry = this.#keys.get(this.#primaryKid);
    if (!entry?.private) {
      throw new PlatformError(`No private key for ${this.#primaryKid}`, {
        code: 'CRYPTO_KEY_UNKNOWN',
      });
    }
    const signer = createSign(this.algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
    signer.update(typeof payload === 'string' ? utf8(payload) : Buffer.from(payload));
    const value = signer.sign(
      this.algorithm === 'ES256'
        ? { key: entry.private, dsaEncoding: 'ieee-p1363' }
        : entry.private,
    );
    return { kid: this.#primaryKid, algorithm: this.algorithm, value: toBase64Url(value) };
  }

  verify(payload: string | Uint8Array, signature: Signature): boolean {
    if (signature.algorithm !== this.algorithm) return false;
    const entry = this.#keys.get(signature.kid);
    if (!entry) return false;
    const verifier = createVerify(this.algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
    verifier.update(typeof payload === 'string' ? utf8(payload) : Buffer.from(payload));
    try {
      return verifier.verify(
        this.algorithm === 'ES256'
          ? { key: entry.public, dsaEncoding: 'ieee-p1363' }
          : entry.public,
        fromBase64Url(signature.value),
      );
    } catch {
      return false;
    }
  }
}

/**
 * Attach a signature to a value: `<value>.<kid>.<signature>`.
 *
 * The value is signed together with its own length prefix, so `("ab", "c")` and `("a", "bc")`
 * cannot produce the same signed bytes — the classic concatenation-confusion bug.
 */
export function signValue(signer: Signer, value: string, context = ''): string {
  const signature = signer.sign(canonical(value, context));
  return `${toBase64Url(value)}.${signature.kid}.${signature.value}`;
}

/**
 * Verify and return the value, or `undefined`.
 *
 * Returns a value rather than throwing because every caller of this is on a request path where
 * "not valid" is an expected outcome, not an exception.
 */
export function verifySignedValue(
  signer: Signer,
  signed: string,
  context = '',
): string | undefined {
  const parts = signed.split('.');
  if (parts.length !== 3) return undefined;
  const [encoded, kid, value] = parts as [string, string, string];
  let decoded: string;
  try {
    decoded = fromBase64Url(encoded).toString('utf8');
  } catch {
    return undefined;
  }
  const ok = signer.verify(canonical(decoded, context), {
    kid,
    algorithm: signer.algorithm,
    value,
  });
  return ok ? decoded : undefined;
}

function canonical(value: string, context: string): string {
  return `${context.length}:${context}|${value.length}:${value}`;
}
