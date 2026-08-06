import { describe, expect, it } from 'vitest';
import {
  HmacSigner,
  KeyRing,
  ScryptPasswordHasher,
  decryptToString,
  encrypt,
  envelopeKid,
  signValue,
  verifySignedValue,
} from '../src/index.js';

/**
 * Fixtures produced by @munaxa/crypto 1.0.0.
 *
 * These are the formats that end up *at rest*: in password columns, in encrypted fields, in
 * device-trust cookies. Anything that stops reading them is not a refactor — it is a migration,
 * and it locks users out or makes data unreadable. The key is a constant here for exactly one
 * reason: so this file can prove the wire format, not a secret.
 */
const FIXTURE_KEY = Buffer.alloc(32, 7);
const FIXTURE_RING = new KeyRing({ kid: 'k_test', key: FIXTURE_KEY });

const V1_ENVELOPE = 'v1.k_test.Giqf_G1zb3uzLVMu.DBexrg7O9BztgD9Ng4BF.n__zQA0473VmeFCYmPRluA';
const V1_ENVELOPE_AAD = 'tenant:root|field:note';
const V1_PASSWORD = 'correct horse battery staple';
const V1_PASSWORD_HASH =
  '$scrypt$v=1$n=16384,r=8,p=1$P_5VyacLVWhpxJk3KSEaCA$Mab9cQtWi0o7fv4EQ1nbP67TqfwlhKYAp-1qKW4aGf4';
const V1_SIGNED = 'ZGV2aWNlOmFiYw.k_test.WjHkxztuOy9u1hrKz1RxG7bP8f2NmJ8h2n4vaB_mlGA';

describe('1.0 formats still read', () => {
  it('decrypts a 1.0 envelope', () => {
    expect(decryptToString(FIXTURE_RING, V1_ENVELOPE, { aad: V1_ENVELOPE_AAD })).toBe(
      'platform-secret',
    );
  });

  it('verifies a 1.0 password hash', async () => {
    const hasher = new ScryptPasswordHasher();
    await expect(hasher.verify(V1_PASSWORD, V1_PASSWORD_HASH)).resolves.toBe(true);
    await expect(hasher.verify('wrong', V1_PASSWORD_HASH)).resolves.toBe(false);
  });

  it('does not force a rehash of a hash written at current parameters', () => {
    expect(new ScryptPasswordHasher().needsRehash(V1_PASSWORD_HASH)).toBe(false);
  });

  it('verifies a 1.0 signed value', () => {
    const signer = new HmacSigner(FIXTURE_RING);
    expect(verifySignedValue(signer, V1_SIGNED, 'device-trust')).toBe('device:abc');
  });
});

describe('formats emitted today match the 1.0 shape', () => {
  it('emits the same envelope structure', () => {
    const envelope = encrypt(FIXTURE_RING, 'x');
    const parts = envelope.split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(envelopeKid(envelope)).toBe('k_test');
  });

  it('emits the same password hash structure', async () => {
    const encoded = await new ScryptPasswordHasher().hash('x');
    expect(encoded.split('$').slice(0, 4)).toEqual(['', 'scrypt', 'v=1', 'n=16384,r=8,p=1']);
  });

  it('emits the same signed-value structure', () => {
    const signed = signValue(new HmacSigner(FIXTURE_RING), 'v', 'ctx');
    expect(signed.split('.')).toHaveLength(3);
    expect(signed.split('.')[1]).toBe('k_test');
  });
});
