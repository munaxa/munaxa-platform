import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { toBase64Url, toHex } from './encoding.js';

/**
 * Secure randomness.
 *
 * Every value here comes from the OS CSPRNG. `Math.random()` appears nowhere in the platform,
 * and the lint config rejects it in these packages — the difference matters precisely in the
 * places where the value is a token, a salt or a code someone can guess.
 */

/** Raw bytes from the CSPRNG. */
export function secureBytes(length: number): Buffer {
  if (!Number.isInteger(length) || length < 1) {
    throw new TypeError(`secureBytes: length must be a positive integer, got ${length}`);
  }
  return randomBytes(length);
}

/**
 * An opaque token, base64url-encoded.
 *
 * 32 bytes (256 bits) is the platform default for refresh tokens, reset tokens and API key
 * secrets. It is well past any birthday-bound concern and short enough to fit in a cookie.
 */
export function secureToken(bytes = 32): string {
  return toBase64Url(secureBytes(bytes));
}

export function secureHex(bytes = 16): string {
  return toHex(secureBytes(bytes));
}

export function uuid(): string {
  return randomUUID();
}

/** Uniform in [0, maxExclusive). Rejection-sampled by Node — no modulo bias. */
export function secureInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new TypeError(`secureInt: maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  return randomInt(maxExclusive);
}

const DIGITS = '0123456789';
/** Ambiguity removed: no O/0, I/1, or letters people mistype when reading aloud. */
const UNAMBIGUOUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A numeric one-time code. Leading zeros are preserved — it is a string, not a number. */
export function numericCode(digits = 6): string {
  let out = '';
  for (let i = 0; i < digits; i++) out += DIGITS[secureInt(10)];
  return out;
}

/**
 * A recovery code, in `XXXX-XXXX-XXXX` groups.
 *
 * People read these off paper and type them into a phone, so the alphabet excludes characters
 * that look alike; 15 characters of a 32-symbol alphabet is 75 bits of entropy.
 */
export function recoveryCode(groups = 3, groupSize = 5): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = '';
    for (let i = 0; i < groupSize; i++) part += UNAMBIGUOUS[secureInt(UNAMBIGUOUS.length)];
    parts.push(part);
  }
  return parts.join('-');
}

/**
 * A sortable, collision-resistant identifier: 48 bits of timestamp then 80 bits of randomness,
 * Crockford-free base32 in the same alphabet as ULID so it stays lexicographically ordered.
 */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function sortableId(now: number = Date.now()): string {
  let timePart = '';
  let remaining = now;
  for (let i = 0; i < 10; i++) {
    timePart = ULID_ALPHABET[remaining % 32] + timePart;
    remaining = Math.floor(remaining / 32);
  }
  let randomPart = '';
  for (let i = 0; i < 16; i++) randomPart += ULID_ALPHABET[secureInt(32)];
  return timePart + randomPart;
}

/** A prefixed identifier: `sess_01J2…`. The prefix makes leaked strings self-describing in logs. */
export function prefixedId(prefix: string, now?: number): string {
  return `${prefix}_${sortableId(now)}`;
}
