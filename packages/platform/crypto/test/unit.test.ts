import { describe, expect, it } from 'vitest';
import {
  HmacSigner,
  KeyRing,
  PasswordHasherRegistry,
  ScryptPasswordHasher,
  constantTimeEqual,
  decryptToString,
  deriveKey,
  encrypt,
  envelopeKid,
  fromBase64Url,
  fromHex,
  numericCode,
  prefixedId,
  recoveryCode,
  secureBytes,
  secureInt,
  secureToken,
  sha256Hex,
  signValue,
  sortableId,
  tokenFingerprint,
  toBase64Url,
  verifySignedValue,
} from '../src/index.js';

const testRing = (): KeyRing => new KeyRing({ kid: 'k1', key: secureBytes(32) });

describe('encoding', () => {
  it('round-trips base64url without padding or unsafe characters', () => {
    const value = 'a?b/c+d=e';
    const encoded = toBase64Url(value);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded).toString('utf8')).toBe(value);
  });

  it('rejects malformed hex rather than silently truncating', () => {
    expect(() => fromHex('abc')).toThrow(TypeError);
    expect(() => fromHex('zz')).toThrow(TypeError);
    expect(fromHex('ff00').length).toBe(2);
  });
});

describe('random', () => {
  it('produces the requested number of bytes', () => {
    expect(secureBytes(48)).toHaveLength(48);
    expect(() => secureBytes(0)).toThrow(TypeError);
  });

  it('never repeats a token across a large sample', () => {
    const tokens = new Set(Array.from({ length: 5_000 }, () => secureToken(32)));
    expect(tokens.size).toBe(5_000);
  });

  it('stays inside the requested integer range', () => {
    for (let i = 0; i < 2_000; i++) {
      const value = secureInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it('keeps leading zeros in numeric codes', () => {
    const codes = Array.from({ length: 500 }, () => numericCode(6));
    expect(codes.every((code) => code.length === 6)).toBe(true);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
  });

  it('formats recovery codes in unambiguous groups', () => {
    expect(recoveryCode()).toMatch(
      /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}){2}$/,
    );
  });

  it('generates sortable ids that order by time', () => {
    const early = sortableId(1_700_000_000_000);
    const later = sortableId(1_700_000_001_000);
    expect(early < later).toBe(true);
    expect(prefixedId('sess', 1_700_000_000_000)).toMatch(/^sess_[0-9A-Z]{26}$/);
  });
});

describe('hashing', () => {
  it('fingerprints tokens deterministically and differently per pepper', () => {
    expect(tokenFingerprint('t')).toBe(tokenFingerprint('t'));
    expect(tokenFingerprint('t', 'pepper')).not.toBe(tokenFingerprint('t'));
    expect(sha256Hex('')).toHaveLength(64);
  });

  it('compares equal and unequal values correctly', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    // Different lengths must not throw — user input arrives at arbitrary lengths.
    expect(constantTimeEqual('abc', 'abcdefghij')).toBe(false);
  });
});

describe('password hashing', () => {
  const hasher = new ScryptPasswordHasher({ N: 1_024 });

  it('verifies the right password and rejects the wrong one', async () => {
    const encoded = await hasher.hash('correct horse battery staple');
    expect(encoded).toMatch(/^\$scrypt\$v=1\$n=1024,r=8,p=1\$/);
    await expect(hasher.verify('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(hasher.verify('Correct horse battery staple', encoded)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);
    expect(a).not.toBe(b);
  });

  it('treats Unicode-equivalent passwords as equal', async () => {
    const composed = 'passwörd';
    const decomposed = 'passwörd';
    const encoded = await hasher.hash(composed);
    await expect(hasher.verify(decomposed, encoded)).resolves.toBe(true);
  });

  it('reports hashes below the current cost as needing a rehash', async () => {
    const weak = await new ScryptPasswordHasher({ N: 1_024 }).hash('pw');
    expect(new ScryptPasswordHasher({ N: 16_384 }).needsRehash(weak)).toBe(true);
    expect(hasher.needsRehash(weak)).toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    await expect(hasher.verify('pw', 'not-a-hash')).resolves.toBe(false);
    await expect(hasher.verify('pw', '$2b$12$abcdefg')).resolves.toBe(false);
  });

  it('rejects a non-power-of-two cost factor at construction', () => {
    expect(() => new ScryptPasswordHasher({ N: 1_000 })).toThrow(TypeError);
  });
});

describe('PasswordHasherRegistry', () => {
  it('verifies legacy hashes and flags them for rehashing', async () => {
    const legacy = {
      id: 'fake-bcrypt',
      hash: async () => '$2b$12$legacy',
      verify: async (password: string) => password === 'legacy-pw',
      needsRehash: () => true,
    };
    const registry = new PasswordHasherRegistry(
      new ScryptPasswordHasher({ N: 1_024 }),
    ).registerLegacy('$2b$', legacy);

    await expect(registry.verify('legacy-pw', '$2b$12$legacy')).resolves.toBe(true);
    expect(registry.needsRehash('$2b$12$legacy')).toBe(true);

    const modern = await registry.hash('legacy-pw');
    expect(modern.startsWith('$scrypt$')).toBe(true);
    expect(registry.needsRehash(modern)).toBe(false);
  });
});

describe('key ring', () => {
  it('keeps retired keys readable and refuses to retire the primary', () => {
    const ring = new KeyRing({ kid: 'k1', key: secureBytes(32) });
    ring.rotate({ kid: 'k2', key: secureBytes(32) });

    expect(ring.primaryKid).toBe('k2');
    expect(ring.kids).toEqual(['k1', 'k2']);
    expect(() => ring.retire('k2')).toThrow(/Refusing to retire the primary/);
    expect(ring.retire('k1')).toBe(true);
  });

  it('throws a typed error for an unknown key id', () => {
    expect(() => testRing().get('nope')).toThrow(/Unknown key id/);
  });

  it('derives a stable kid from key material', () => {
    const key = secureBytes(32);
    expect(KeyRing.deriveKid(key)).toBe(KeyRing.deriveKid(key));
    expect(KeyRing.deriveKid(key)).not.toBe(KeyRing.deriveKid(secureBytes(32)));
  });
});

describe('encryption', () => {
  it('round-trips a value', () => {
    const ring = testRing();
    const envelope = encrypt(ring, 'sensitive');
    expect(envelope).not.toContain('sensitive');
    expect(decryptToString(ring, envelope)).toBe('sensitive');
    expect(envelopeKid(envelope)).toBe('k1');
  });

  it('produces a different ciphertext each time', () => {
    const ring = testRing();
    expect(encrypt(ring, 'x')).not.toBe(encrypt(ring, 'x'));
  });

  it('derives independent subkeys per purpose', () => {
    const master = secureBytes(32);
    expect(deriveKey(master, 'cookies')).not.toEqual(deriveKey(master, 'csrf'));
    expect(deriveKey(master, 'cookies')).toEqual(deriveKey(master, 'cookies'));
    expect(deriveKey(master, 'cookies', 64)).toHaveLength(64);
  });

  it('rejects a key of the wrong size', () => {
    const ring = new KeyRing({ kid: 'short', key: secureBytes(16) });
    expect(() => encrypt(ring, 'x')).toThrow(/32-byte key/);
  });
});

describe('signing', () => {
  it('round-trips a signed value', () => {
    const signer = new HmacSigner(testRing());
    const signed = signValue(signer, 'device:abc', 'device-trust');
    expect(verifySignedValue(signer, signed, 'device-trust')).toBe('device:abc');
  });

  it('rejects a value signed for a different context', () => {
    const signer = new HmacSigner(testRing());
    const signed = signValue(signer, 'device:abc', 'device-trust');
    expect(verifySignedValue(signer, signed, 'csrf')).toBeUndefined();
  });

  it('returns undefined on malformed input rather than throwing', () => {
    const signer = new HmacSigner(testRing());
    expect(verifySignedValue(signer, 'garbage')).toBeUndefined();
    expect(verifySignedValue(signer, 'a.b.c')).toBeUndefined();
  });
});
