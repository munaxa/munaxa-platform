import { HmacSigner, KeyRing, toBase64Url } from '@munaxa/crypto';

import {
  LicenseRejection,
  armorLicense,
  canonicalJson,
  checkOperation,
  issueLicense,
  licenseVerifier,
  verifyLicense,
} from '../src/index.js';
import { issuer, keyPair, licensePayload } from './fixtures.js';

const pair = keyPair('lic-2026-1');
const signer = issuer(pair);
const verifier = licenseVerifier('ES256', [{ kid: pair.kid, publicKey: pair.publicKey }]);
const base = {
  verifier,
  product: 'product-a',
  installationId: 'inst_1',
  now: new Date('2026-10-26T00:00:00Z'),
};

describe('licence verification', () => {
  it('accepts a licence it was issued, armoured or not', () => {
    const token = issueLicense(licensePayload(), signer);
    for (const text of [token, armorLicense(token)]) {
      const result = verifyLicense(text, base);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.license.licenseId).toBe('lic_1');
        expect(result.snapshot.deployment).toBe('ON_PREMISES');
      }
    }
  });

  it('refuses a payload altered after signing', () => {
    const token = issueLicense(licensePayload(), signer);
    const [format, , kid, sig] = token.split('.');
    const forged = toBase64Url(canonicalJson({ ...licensePayload(), limits: { users: 100000 } }));
    expect(verifyLicense(`${format}.${forged}.${kid}.${sig}`, base)).toEqual({
      ok: false,
      reason: LicenseRejection.BAD_SIGNATURE,
    });
  });

  it('refuses a licence signed by a key it does not hold, even under a known kid', () => {
    const impostor = issuer(keyPair('lic-2026-1'));
    expect(verifyLicense(issueLicense(licensePayload(), impostor), base)).toMatchObject({
      ok: false,
      reason: LicenseRejection.BAD_SIGNATURE,
    });
    const unknown = issuer(keyPair('other'));
    expect(verifyLicense(issueLicense(licensePayload(), unknown), base)).toMatchObject({
      reason: LicenseRejection.UNKNOWN_KEY,
    });
  });

  it('cannot sign with a verifier built from public keys, even when handed a key pair', () => {
    const fromPair = licenseVerifier('ES256', [pair]);
    expect(() => issueLicense(licensePayload(), fromPair.signer)).toThrow();
  });

  it('refuses symmetric signing and verification outright', () => {
    const hmac = new HmacSigner(new KeyRing({ kid: 'h', key: new Uint8Array(32) }));
    expect(() => issueLicense(licensePayload(), hmac)).toThrow(/refused/);
    expect(() =>
      verifyLicense('mxl1.a.h.b', { ...base, verifier: { kids: new Set(['h']), signer: hmac } }),
    ).toThrow(/refused/);
  });

  it('refuses a licence for another product or installation', () => {
    const token = issueLicense(licensePayload(), signer);
    expect(verifyLicense(token, { ...base, product: 'product-b' })).toMatchObject({
      reason: LicenseRejection.WRONG_PRODUCT,
    });
    expect(verifyLicense(token, { ...base, installationId: 'inst_2' })).toMatchObject({
      reason: LicenseRejection.WRONG_INSTALLATION,
    });
  });

  it('accepts an unbound licence on any installation of the product', () => {
    const token = issueLicense(licensePayload({ installationId: null }), signer);
    expect(verifyLicense(token, { ...base, installationId: 'inst_9' }).ok).toBe(true);
  });

  it('detects a clock wound back past what the installation has observed, or before issue', () => {
    const token = issueLicense(licensePayload(), signer);
    expect(
      verifyLicense(token, {
        ...base,
        now: new Date('2026-12-01T00:00:00Z'),
        lastObservedAt: new Date('2027-02-01T00:00:00Z'),
      }),
    ).toMatchObject({ reason: LicenseRejection.CLOCK_ROLLBACK });
    expect(verifyLicense(token, { ...base, now: new Date('2026-09-01T00:00:00Z') })).toMatchObject({
      reason: LicenseRejection.CLOCK_ROLLBACK,
    });
    // Small corrections within tolerance are not a rollback.
    expect(
      verifyLicense(token, { ...base, lastObservedAt: new Date('2026-10-26T00:05:00Z') }).ok,
    ).toBe(true);
  });

  it('refuses a licence before its notBefore', () => {
    const token = issueLicense(licensePayload({ notBefore: '2026-11-01T00:00:00Z' }), signer);
    expect(verifyLicense(token, base)).toMatchObject({ reason: LicenseRejection.NOT_YET_VALID });
  });

  it('a valid but ended licence verifies and then degrades to read-only, never to nothing', () => {
    const token = issueLicense(licensePayload(), signer);
    const later = new Date('2027-03-01T00:00:00Z');
    const result = verifyLicense(token, { ...base, now: later });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ctx = { now: later, tenantId: 'ten_1', product: 'product-a' };
    expect(checkOperation(result.snapshot, 'READ', ctx).allowed).toBe(true);
    expect(checkOperation(result.snapshot, 'WRITE', ctx).allowed).toBe(false);
  });

  it('will not sign an invalid licence, an unending one, or extra fields', () => {
    expect(() => issueLicense(licensePayload({ status: 'SUSPENDED' }), signer)).toThrow();
    expect(() =>
      issueLicense(licensePayload({ expiresAt: null, trialEndsAt: null }), signer),
    ).toThrow();
    const smuggled = { ...licensePayload(), isAdmin: true } as ReturnType<typeof licensePayload>;
    const result = verifyLicense(issueLicense(smuggled, signer), base);
    expect(result.ok && 'isAdmin' in result.license).toBe(false);
  });

  it('refuses malformed input without throwing', () => {
    for (const text of [
      '',
      'mxl1',
      'mxl2.a.b.c',
      'mxl1...',
      '-----BEGIN MUNAXA LICENSE-----\nabc',
    ]) {
      expect(verifyLicense(text, base).ok).toBe(false);
    }
  });

  it('canonical JSON has one spelling', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"e":3,"f":2}]},"b":1}',
    );
  });
});
