import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { PlatformError } from '@munaxa/types';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { secureBytes } from './random.js';
import type { KeyRing } from './keyring.js';

/**
 * Authenticated encryption with AES-256-GCM.
 *
 * Two properties are non-negotiable and both are enforced by construction here:
 *
 * - **Authenticated.** GCM's tag is verified before any plaintext is returned, so a modified
 *   ciphertext fails loudly instead of decrypting to attacker-chosen bytes.
 * - **Nonce-unique.** A 96-bit nonce is generated per encryption and never derived from the
 *   plaintext or a counter the caller controls. Nonce reuse under GCM is catastrophic — it leaks
 *   the XOR of two plaintexts and the authentication key — so the API gives callers no way to
 *   supply one.
 *
 * The envelope is `v1.<kid>.<nonce>.<ciphertext>.<tag>`, all base64url. The `kid` is what makes
 * key rotation possible: old ciphertexts keep naming the key that can read them.
 */

const VERSION = 'v1';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptOptions {
  /**
   * Additional authenticated data — bound to the ciphertext but not encrypted. Pass the tenant
   * id and the field name so a ciphertext moved to another row or another tenant fails to
   * decrypt instead of quietly working.
   */
  readonly aad?: string;
}

export function encrypt(ring: KeyRing, plaintext: string | Uint8Array, options: EncryptOptions = {}): string {
  const key = ring.primary;
  const nonce = secureBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key.key), nonce);
  if (options.aad) cipher.setAAD(utf8(options.aad));
  const input = typeof plaintext === 'string' ? utf8(plaintext) : Buffer.from(plaintext);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, key.kid, toBase64Url(nonce), toBase64Url(ciphertext), toBase64Url(tag)].join('.');
}

export function decrypt(ring: KeyRing, envelope: string, options: EncryptOptions = {}): Buffer {
  const parts = envelope.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new PlatformError('Malformed ciphertext envelope', {
      code: 'CRYPTO_VERIFICATION_FAILED',
    });
  }
  const [, kid, nonce, ciphertext, tag] = parts as [string, string, string, string, string];
  const key = ring.get(kid);
  const tagBytes = fromBase64Url(tag);
  if (tagBytes.length !== TAG_BYTES) {
    throw new PlatformError('Malformed authentication tag', { code: 'CRYPTO_VERIFICATION_FAILED' });
  }

  const decipher = createDecipheriv('aes-256-gcm', keyBytes(key.key), fromBase64Url(nonce));
  decipher.setAuthTag(tagBytes);
  if (options.aad) decipher.setAAD(utf8(options.aad));

  try {
    return Buffer.concat([decipher.update(fromBase64Url(ciphertext)), decipher.final()]);
  } catch (cause) {
    // Node throws a generic error on tag mismatch. Never distinguish "wrong key" from "tampered"
    // to a caller: both mean the same thing operationally and the difference is an oracle.
    throw new PlatformError('Ciphertext failed authentication', {
      code: 'CRYPTO_VERIFICATION_FAILED',
      cause,
    });
  }
}

export function decryptToString(ring: KeyRing, envelope: string, options: EncryptOptions = {}): string {
  return decrypt(ring, envelope, options).toString('utf8');
}

/** The `kid` an envelope was produced with, without decrypting it. Used to plan re-encryption. */
export function envelopeKid(envelope: string): string | undefined {
  const parts = envelope.split('.');
  return parts.length === 5 && parts[0] === VERSION ? parts[1] : undefined;
}

/** True when this ciphertext was produced by a key that is no longer primary. */
export function needsReencryption(ring: KeyRing, envelope: string): boolean {
  const kid = envelopeKid(envelope);
  return kid === undefined || kid !== ring.primaryKid;
}

/** Decrypt under whatever key wrote it, re-encrypt under the primary. The rotation work-horse. */
export function reencrypt(ring: KeyRing, envelope: string, options: EncryptOptions = {}): string {
  return encrypt(ring, decrypt(ring, envelope, options), options);
}

/**
 * Derive a purpose-bound subkey from a master key.
 *
 * One environment secret can safely back several independent uses — cookie signing, field
 * encryption, CSRF tokens — as long as each gets its own derived key. Reusing one key across
 * purposes means a weakness in any one of them is a weakness in all.
 */
export function deriveKey(master: Uint8Array | string, purpose: string, length = 32): Buffer {
  const ikm = typeof master === 'string' ? utf8(master) : Buffer.from(master);
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), utf8(`munaxa:${purpose}`), length));
}

function keyBytes(key: Uint8Array): Buffer {
  if (key.length !== 32) {
    throw new PlatformError(`AES-256-GCM needs a 32-byte key, got ${key.length}`, {
      code: 'CONFIG_INVALID',
    });
  }
  return Buffer.from(key);
}
