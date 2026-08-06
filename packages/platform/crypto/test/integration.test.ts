import { describe, expect, it } from 'vitest';
import {
  HmacSigner,
  KeyRing,
  PasswordHasherRegistry,
  ScryptPasswordHasher,
  decryptToString,
  encrypt,
  needsReencryption,
  reencrypt,
  secureBytes,
  signValue,
  verifySignedValue,
} from '../src/index.js';

/**
 * The flows that only exist when the pieces are combined: rotating a key without downtime, and
 * upgrading a password hash on the login path.
 */
describe('zero-downtime key rotation', () => {
  it('reads old ciphertext, writes new, and lets the old key be retired afterwards', () => {
    const ring = new KeyRing({ kid: 'k1', key: secureBytes(32) });
    const before = encrypt(ring, 'personal-data', { aad: 'tenant:acme' });

    // Phase 1 — new key becomes primary. Old ciphertext still reads.
    ring.rotate({ kid: 'k2', key: secureBytes(32) });
    expect(decryptToString(ring, before, { aad: 'tenant:acme' })).toBe('personal-data');
    expect(needsReencryption(ring, before)).toBe(true);

    // Phase 2 — the migration job rewrites each record.
    const after = reencrypt(ring, before, { aad: 'tenant:acme' });
    expect(needsReencryption(ring, after)).toBe(false);

    // Phase 3 — the old key can now go.
    ring.retire('k1');
    expect(decryptToString(ring, after, { aad: 'tenant:acme' })).toBe('personal-data');
    expect(() => decryptToString(ring, before, { aad: 'tenant:acme' })).toThrow(/Unknown key id/);
  });

  it('keeps signatures verifiable across a rotation', () => {
    const ring = new KeyRing({ kid: 'k1', key: secureBytes(32) });
    const signer = new HmacSigner(ring);
    const signedWithOldKey = signValue(signer, 'session:s1', 'trust');

    ring.rotate({ kid: 'k2', key: secureBytes(32) });

    // Issued under k1, still accepted; new signatures name k2.
    expect(verifySignedValue(signer, signedWithOldKey, 'trust')).toBe('session:s1');
    expect(signValue(signer, 'session:s2', 'trust').split('.')[1]).toBe('k2');

    ring.retire('k1');
    expect(verifySignedValue(signer, signedWithOldKey, 'trust')).toBeUndefined();
  });
});

describe('password hash upgrade on login', () => {
  it('verifies against the old scheme, then rewrites in the new one', async () => {
    const bcryptish = {
      id: 'legacy',
      hash: async () => '$2b$10$stored',
      verify: async (password: string) => password === 'hunter2!hunter2',
      needsRehash: () => true,
    };
    const registry = new PasswordHasherRegistry(new ScryptPasswordHasher({ N: 1_024 }))
      .registerLegacy('$2b$', bcryptish);

    let stored = '$2b$10$stored';

    // A login: verify, notice the hash is stale, rewrite it transparently.
    expect(await registry.verify('hunter2!hunter2', stored)).toBe(true);
    if (registry.needsRehash(stored)) stored = await registry.hash('hunter2!hunter2');

    expect(stored.startsWith('$scrypt$')).toBe(true);

    // The next login goes through the modern path and needs no further work.
    expect(await registry.verify('hunter2!hunter2', stored)).toBe(true);
    expect(registry.needsRehash(stored)).toBe(false);
  });

  it('raises the cost factor without invalidating existing hashes', async () => {
    const cheap = new ScryptPasswordHasher({ N: 1_024 });
    const stored = await cheap.hash('a long enough passphrase');

    const expensive = new ScryptPasswordHasher({ N: 4_096 });
    expect(await expensive.verify('a long enough passphrase', stored)).toBe(true);
    expect(expensive.needsRehash(stored)).toBe(true);
  });
});
