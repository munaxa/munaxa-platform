import { describe, expect, it } from 'vitest';
import {
  HmacSigner,
  KeyRing,
  ScryptPasswordHasher,
  decrypt,
  decryptToString,
  dummyPasswordHash,
  encrypt,
  fromBase64Url,
  secureBytes,
  signValue,
  toBase64Url,
  verifySignedValue,
} from '../src/index.js';

const ring = (): KeyRing => new KeyRing({ kid: 'k1', key: secureBytes(32) });

describe('AES-256-GCM envelope', () => {
  it('refuses a ciphertext whose bytes were altered', () => {
    const keys = ring();
    const envelope = encrypt(keys, 'balance=100');
    const parts = envelope.split('.');
    const flipped = Buffer.from(fromBase64Url(parts[3] as string));
    flipped[0] = (flipped[0] as number) ^ 0x01;
    parts[3] = toBase64Url(flipped);

    expect(() => decryptToString(keys, parts.join('.'))).toThrow(/failed authentication/);
  });

  it('refuses a ciphertext whose tag was altered', () => {
    const keys = ring();
    const parts = encrypt(keys, 'x').split('.');
    const tag = Buffer.from(fromBase64Url(parts[4] as string));
    tag[15] = (tag[15] as number) ^ 0xff;
    parts[4] = toBase64Url(tag);

    expect(() => decrypt(keys, parts.join('.'))).toThrow(/failed authentication/);
  });

  it('binds ciphertext to its context through the AAD', () => {
    // A row copied from one tenant to another must not decrypt.
    const keys = ring();
    const envelope = encrypt(keys, 'note', { aad: 'tenant:acme|field:note' });
    expect(decryptToString(keys, envelope, { aad: 'tenant:acme|field:note' })).toBe('note');
    expect(() => decryptToString(keys, envelope, { aad: 'tenant:evil|field:note' })).toThrow();
    expect(() => decryptToString(keys, envelope)).toThrow();
  });

  it('never reuses a nonce', () => {
    const keys = ring();
    const nonces = new Set(
      Array.from({ length: 3_000 }, () => encrypt(keys, 'same-plaintext').split('.')[2]),
    );
    expect(nonces.size).toBe(3_000);
  });

  it('gives the same error whether the key is wrong or the data was tampered with', () => {
    const a = encrypt(ring(), 'secret');
    const other = new KeyRing({ kid: 'k1', key: secureBytes(32) });
    let wrongKeyMessage = '';
    try {
      decrypt(other, a);
    } catch (error) {
      wrongKeyMessage = (error as Error).message;
    }
    expect(wrongKeyMessage).toBe('Ciphertext failed authentication');
  });

  it('rejects a truncated or extended envelope', () => {
    const keys = ring();
    const envelope = encrypt(keys, 'x');
    expect(() => decrypt(keys, envelope.split('.').slice(0, 4).join('.'))).toThrow(/Malformed/);
    expect(() => decrypt(keys, `${envelope}.extra`)).toThrow(/Malformed/);
    expect(() => decrypt(keys, envelope.replace('v1', 'v2'))).toThrow(/Malformed/);
  });
});

describe('signatures', () => {
  it('rejects a tampered payload', () => {
    const signer = new HmacSigner(ring());
    const signed = signValue(signer, 'user:1', 'ctx');
    const forged = [toBase64Url('user:2'), ...signed.split('.').slice(1)].join('.');
    expect(verifySignedValue(signer, forged, 'ctx')).toBeUndefined();
  });

  it('rejects a signature made with an unknown key id', () => {
    const signer = new HmacSigner(ring());
    const signed = signValue(signer, 'user:1', 'ctx');
    const parts = signed.split('.');
    parts[1] = 'attacker-kid';
    expect(verifySignedValue(signer, parts.join('.'), 'ctx')).toBeUndefined();
  });

  it('is not confusable across value boundaries', () => {
    // Without length-prefixed canonicalisation, ("ab","c") and ("a","bc") sign the same bytes.
    const signer = new HmacSigner(ring());
    const first = signValue(signer, 'ab', 'c');
    const second = signValue(signer, 'a', 'bc');
    expect(first.split('.')[2]).not.toBe(second.split('.')[2]);
  });

  it('rejects an algorithm the signer does not use', () => {
    const signer = new HmacSigner(ring());
    const signature = signer.sign('payload');
    expect(signer.verify('payload', { ...signature, algorithm: 'RS256' })).toBe(false);
  });
});

describe('password hashing as an offline-cracking defence', () => {
  it('stores no part of the password in the encoded hash', async () => {
    const password = 'a-very-distinctive-passphrase';
    const encoded = await new ScryptPasswordHasher({ N: 1_024 }).hash(password);
    expect(encoded).not.toContain(password);
    expect(encoded).not.toContain('distinctive');
  });

  it('provides a dummy hash so the unknown-account path costs the same', async () => {
    const hasher = new ScryptPasswordHasher({ N: 1_024 });
    const dummy = await dummyPasswordHash(hasher);
    expect(dummy).toMatch(/^\$scrypt\$/);
    // Same value on every call: the platform pays the derivation cost once at startup, and each
    // failed lookup pays a verification, which is what the real path pays.
    expect(await dummyPasswordHash(hasher)).toBe(dummy);
    expect(await hasher.verify('anything', dummy)).toBe(false);
  });

  it('does not leak whether a hash is malformed through an exception', async () => {
    const hasher = new ScryptPasswordHasher({ N: 1_024 });
    for (const encoded of ['', 'x', '$scrypt$v=1$n=0,r=0,p=0$$', '$argon2id$v=19$m=1']) {
      await expect(hasher.verify('pw', encoded)).resolves.toBe(false);
    }
  });
});
