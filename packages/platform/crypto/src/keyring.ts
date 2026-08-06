import { PlatformError } from '@munaxa/types';
import { sha256Hex } from './hashing.js';

/**
 * A key ring: one primary key for new operations, plus retired keys kept only for verification
 * and decryption.
 *
 * Rotation is the reason this type exists. Replacing a key in place breaks every value ever
 * produced with the old one; a ring makes rotation a two-phase, zero-downtime operation:
 *
 *   1. `rotate(newKey)` — new material is written under the new `kid`, old material still reads.
 *   2. after the longest lifetime of anything encrypted with it, `retire(oldKid)`.
 *
 * Every ciphertext and every signature carries its `kid`, so step 2 is safe the moment nothing
 * references the old key.
 */

export interface KeyMaterial {
  readonly kid: string;
  /** Raw key bytes. 32 bytes for AES-256-GCM and for HMAC-SHA256. */
  readonly key: Uint8Array;
  readonly createdAt?: number;
  readonly notAfter?: number;
}

export class KeyRing {
  #primaryKid: string;
  readonly #keys = new Map<string, KeyMaterial>();

  constructor(primary: KeyMaterial, retired: readonly KeyMaterial[] = []) {
    this.#keys.set(primary.kid, primary);
    for (const key of retired) this.#keys.set(key.kid, key);
    this.#primaryKid = primary.kid;
  }

  get primary(): KeyMaterial {
    return this.#keys.get(this.#primaryKid) as KeyMaterial;
  }

  get primaryKid(): string {
    return this.#primaryKid;
  }

  /** Every kid a verifier or decryptor should still accept. */
  get kids(): readonly string[] {
    return [...this.#keys.keys()];
  }

  get(kid: string): KeyMaterial {
    const key = this.#keys.get(kid);
    if (!key) {
      throw new PlatformError(`Unknown key id ${kid}`, {
        code: 'CRYPTO_KEY_UNKNOWN',
        details: { kid },
      });
    }
    return key;
  }

  has(kid: string): boolean {
    return this.#keys.has(kid);
  }

  /** Promote a new key to primary, keeping the previous one available for reads. */
  rotate(next: KeyMaterial): this {
    if (this.#keys.has(next.kid) && next.kid !== this.#primaryKid) {
      throw new Error(`Key id ${next.kid} is already in the ring; rotation needs a fresh id`);
    }
    this.#keys.set(next.kid, next);
    this.#primaryKid = next.kid;
    return this;
  }

  /** Drop a retired key. Refuses to remove the primary — that would be an outage, not a rotation. */
  retire(kid: string): boolean {
    if (kid === this.#primaryKid) {
      throw new Error(`Refusing to retire the primary key ${kid}; rotate to a new key first`);
    }
    return this.#keys.delete(kid);
  }

  /**
   * A stable, non-secret identifier derived from key material — useful when a product must
   * generate a `kid` for a key it was handed without one. It is a truncated hash of the key, so
   * it reveals nothing usable while still changing when the key does.
   */
  static deriveKid(key: Uint8Array, prefix = 'k'): string {
    return `${prefix}_${sha256Hex(key).slice(0, 16)}`;
  }
}
