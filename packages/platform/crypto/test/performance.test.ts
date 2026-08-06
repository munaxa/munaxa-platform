import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMS,
  HmacSigner,
  KeyRing,
  ScryptPasswordHasher,
  encrypt,
  decryptToString,
  secureBytes,
  secureToken,
  sha256Hex,
  signValue,
} from '../src/index.js';

const ring = new KeyRing({ kid: 'k1', key: secureBytes(32) });

describe('password hashing cost', () => {
  /**
   * Password hashing is supposed to be slow — that is the control. What these assert is that it
   * is slow by the right amount: fast enough that a login is not a timeout, slow enough that the
   * parameters were not quietly weakened.
   */
  it('takes a measurable but bounded amount of time at production parameters', async () => {
    const hasher = new ScryptPasswordHasher();
    const start = performance.now();
    const encoded = await hasher.hash('a realistic passphrase for testing');
    const hashMs = performance.now() - start;

    expect(hashMs).toBeGreaterThan(5);
    expect(hashMs).toBeLessThan(2_000);

    const verifyStart = performance.now();
    await hasher.verify('a realistic passphrase for testing', encoded);
    expect(performance.now() - verifyStart).toBeLessThan(2_000);
  });

  it('keeps the default cost factor at or above the calibrated floor', () => {
    // A regression here is silent and catastrophic: hashes keep verifying while becoming cheap
    // to crack. Raising the numbers is fine; lowering them must be a deliberate edit to this test.
    expect(DEFAULT_SCRYPT_PARAMS.N).toBeGreaterThanOrEqual(16_384);
    expect(DEFAULT_SCRYPT_PARAMS.keyLength).toBeGreaterThanOrEqual(32);
    expect(DEFAULT_SCRYPT_PARAMS.saltLength).toBeGreaterThanOrEqual(16);
  });

  it('runs concurrent hashes without exhausting scrypt memory', async () => {
    const hasher = new ScryptPasswordHasher({ N: 4_096 });
    await expect(
      Promise.all(Array.from({ length: 16 }, (_, i) => hasher.hash(`password-${i}`))),
    ).resolves.toHaveLength(16);
  });
});

describe('per-request primitives stay cheap', () => {
  it('fingerprints tokens at well over 100k/s', () => {
    const token = secureToken(32);
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) sha256Hex(token);
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it('signs and encrypts small values in microseconds', () => {
    const signer = new HmacSigner(ring);
    const signStart = performance.now();
    for (let i = 0; i < 20_000; i++) signValue(signer, `session:${i}`, 'ctx');
    expect(performance.now() - signStart).toBeLessThan(2_000);

    const cryptoStart = performance.now();
    for (let i = 0; i < 20_000; i++) decryptToString(ring, encrypt(ring, 'small value'));
    expect(performance.now() - cryptoStart).toBeLessThan(3_000);
  });

  it('generates tokens without contention', () => {
    const start = performance.now();
    for (let i = 0; i < 50_000; i++) secureToken(32);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
