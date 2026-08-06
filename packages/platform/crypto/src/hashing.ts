import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { toHex, utf8 } from './encoding.js';

/**
 * Hashing and comparison.
 *
 * The distinction that matters: SHA-256 here is for *lookups and integrity* — hashing a
 * high-entropy token so the database holds nothing presentable — never for passwords, which go
 * through the memory-hard KDF in `password.ts`. A fast hash on a low-entropy secret is a
 * dictionary attack waiting for a database dump.
 */

export function sha256(input: string | Uint8Array): Buffer {
  return createHash('sha256').update(typeof input === 'string' ? utf8(input) : input).digest();
}

export function sha256Hex(input: string | Uint8Array): string {
  return toHex(sha256(input));
}

export function sha512Hex(input: string | Uint8Array): string {
  return createHash('sha512').update(typeof input === 'string' ? utf8(input) : input).digest('hex');
}

/** SHA-1, provided for exactly one reason: the k-anonymity breach-corpus protocol requires it. */
export function sha1HexUpper(input: string): string {
  return createHash('sha1').update(utf8(input)).digest('hex').toUpperCase();
}

export function hmacSha256(key: string | Uint8Array, message: string | Uint8Array): Buffer {
  return createHmac('sha256', key).update(typeof message === 'string' ? utf8(message) : message).digest();
}

export function hmacSha256Hex(key: string | Uint8Array, message: string | Uint8Array): string {
  return toHex(hmacSha256(key, message));
}

/**
 * Constant-time string comparison.
 *
 * `a === b` on a secret leaks its prefix through timing. This compares fixed-length digests of
 * both inputs, so it is constant-time in the *contents* and also does not leak the length —
 * `timingSafeEqual` throws on a length mismatch, which is itself an oracle if you feed it raw
 * user input.
 */
export function constantTimeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const left = sha256(a);
  const right = sha256(b);
  return timingSafeEqual(left, right);
}

/** Compare two buffers of equal length in constant time. Returns false on a length mismatch. */
export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * The canonical way to store a bearer token.
 *
 * Keyed with a server-side pepper when one is supplied, so a stolen database alone does not let
 * an attacker precompute lookups against tokens observed elsewhere.
 */
export function tokenFingerprint(token: string, pepper?: string): string {
  return pepper ? hmacSha256Hex(pepper, token) : sha256Hex(token);
}
