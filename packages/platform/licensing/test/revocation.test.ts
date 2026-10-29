import { HmacSigner, KeyRing, toBase64Url } from '@munaxa/crypto';

import {
  REVOCATION_LIST_FORMAT,
  RevocationListRejection,
  RevocationReason,
  applyRevocation,
  canonicalJson,
  checkOperation,
  issueLicense,
  issueRevocationList,
  licenseVerifier,
  revocationOf,
  verifyLicense,
  verifyRevocationList,
  type RevocationListPayload,
} from '../src/index.js';
import { issuer, keyPair, licensePayload } from './fixtures.js';

const pair = keyPair('lic-2026-1');
const signer = issuer(pair);
const verifier = licenseVerifier('ES256', [{ kid: pair.kid, publicKey: pair.publicKey }]);
const now = new Date('2026-10-26T00:00:00Z');
const ctx = { now, tenantId: 'ten_1', product: 'product-a' };

function list(overrides: Partial<RevocationListPayload> = {}): RevocationListPayload {
  return {
    format: REVOCATION_LIST_FORMAT,
    product: 'product-a',
    sequence: 3,
    issuedAt: '2026-10-20T00:00:00.000Z',
    revoked: [
      { licenseId: 'lic_1', revokedAt: '2026-10-19T00:00:00.000Z', reason: 'SUPERSEDED' },
      { licenseId: 'lic_0', revokedAt: '2026-09-01T00:00:00.000Z', reason: 'ISSUED_IN_ERROR' },
    ],
    ...overrides,
  };
}
const verify = (text: string, extra: { lastSequence?: number | null; now?: Date } = {}) =>
  verifyRevocationList(text, { verifier, product: 'product-a', now, ...extra });

describe('revocation lists', () => {
  it('accepts a list it was issued, with the entries in one canonical order', () => {
    const result = verify(issueRevocationList(list(), signer));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.list.sequence).toBe(3);
      expect(result.list.revoked.map((e) => e.licenseId)).toEqual(['lic_0', 'lic_1']);
    }
  });

  it('suspends a revoked licence: read-only, never no access', () => {
    const licence = verifyLicense(issueLicense(licensePayload(), signer), {
      verifier,
      product: 'product-a',
      installationId: 'inst_1',
      now,
    });
    expect(licence.ok).toBe(true);
    if (!licence.ok) return;
    const accepted = verify(issueRevocationList(list(), signer));
    if (!accepted.ok) throw new Error('list refused');

    const entry = revocationOf(licence.license, accepted.list);
    expect(entry).toMatchObject({ licenseId: 'lic_1', reason: RevocationReason.SUPERSEDED });
    const revoked = applyRevocation(licence.snapshot, entry);
    expect(revoked.status).toBe('SUSPENDED');
    expect(checkOperation(revoked, 'READ', ctx).allowed).toBe(true);
    expect(checkOperation(revoked, 'EXPORT', ctx).allowed).toBe(true);
    expect(checkOperation(revoked, 'WRITE', ctx).allowed).toBe(false);
    expect(checkOperation(revoked, 'GROWTH', ctx).allowed).toBe(false);
  });

  it('leaves a licence the list does not name exactly as it was', () => {
    const accepted = verify(issueRevocationList(list({ revoked: [] }), signer));
    if (!accepted.ok) throw new Error('list refused');
    const licence = licensePayload();
    expect(revocationOf(licence, accepted.list)).toBeNull();
    expect(revocationOf(licence, null)).toBeNull();
    const snapshot = { ...licence, resolvedAt: licence.issuedAt } as never;
    expect(applyRevocation(snapshot, null)).toBe(snapshot);
  });

  it('never widens: a cancelled licence stays cancelled when revoked', () => {
    const cancelled = { ...licensePayload({ status: 'CANCELLED' }), resolvedAt: now.toISOString() };
    const entry = {
      licenseId: 'lic_1',
      revokedAt: now.toISOString(),
      reason: 'CONTRACT_ENDED',
    } as const;
    expect(applyRevocation(cancelled as never, entry).status).toBe('CANCELLED');
  });

  it('ignores a list for another product, even one naming the same licence id', () => {
    const other = issueRevocationList(list({ product: 'product-b' }), signer);
    expect(verify(other)).toMatchObject({
      ok: false,
      reason: RevocationListRejection.WRONG_PRODUCT,
    });
    const parsed = { ...list({ product: 'product-b' }) };
    expect(revocationOf(licensePayload(), parsed)).toBeNull();
  });

  it('refuses an older list than the newest one already verified, so a revocation sticks', () => {
    const older = issueRevocationList(list({ sequence: 2, revoked: [] }), signer);
    expect(verify(older, { lastSequence: 3 })).toMatchObject({
      ok: false,
      reason: RevocationListRejection.STALE,
    });
    // Re-reading the same list is not stale.
    expect(verify(issueRevocationList(list(), signer), { lastSequence: 3 }).ok).toBe(true);
  });

  it('refuses a list issued after the local clock: the clock has been wound back', () => {
    const later = issueRevocationList(list({ issuedAt: '2026-11-01T00:00:00.000Z' }), signer);
    expect(verify(later)).toMatchObject({
      ok: false,
      reason: RevocationListRejection.CLOCK_ROLLBACK,
    });
  });

  it('refuses a list altered after signing — removing an entry included', () => {
    const [format, , kid, sig] = issueRevocationList(list(), signer).split('.');
    const forged = toBase64Url(canonicalJson({ ...list(), revoked: [] }));
    expect(verify([format, forged, kid, sig].join('.'))).toMatchObject({
      ok: false,
      reason: RevocationListRejection.BAD_SIGNATURE,
    });
  });

  it('refuses a list signed by an unknown key', () => {
    const stranger = issuer(keyPair('lic-2026-1'));
    expect(verify(issueRevocationList(list(), stranger))).toMatchObject({
      ok: false,
      reason: RevocationListRejection.BAD_SIGNATURE,
    });
    const otherKid = issuer(keyPair('other'));
    expect(verify(issueRevocationList(list(), otherKid))).toMatchObject({
      ok: false,
      reason: RevocationListRejection.UNKNOWN_KEY,
    });
  });

  it('cannot be replayed as a licence, nor a licence as a list', () => {
    const asList = issueRevocationList(list(), signer);
    const replayedAsLicence = asList.replace(/^mxr1\./, 'mxl1.');
    expect(
      verifyLicense(replayedAsLicence, {
        verifier,
        product: 'product-a',
        installationId: 'inst_1',
        now,
      }).ok,
    ).toBe(false);
    const licence = issueLicense(licensePayload(), signer);
    expect(verify(licence.replace(/^mxl1\./, 'mxr1.'))).toMatchObject({
      ok: false,
      reason: RevocationListRejection.BAD_SIGNATURE,
    });
  });

  it('refuses symmetric signing and verification outright', () => {
    const hmac = new HmacSigner(new KeyRing({ kid: 'h', key: new Uint8Array(32) }));
    expect(() => issueRevocationList(list(), hmac)).toThrow(/asymmetrically/);
    expect(() =>
      verifyRevocationList('mxr1.a.b.c', {
        verifier: { kids: new Set(['h']), signer: hmac },
        product: 'product-a',
        now,
      }),
    ).toThrow(/asymmetrically/);
  });

  it('refuses to sign or accept a malformed list', () => {
    expect(() => issueRevocationList(list({ sequence: 0 }), signer)).toThrow(/sequence/);
    expect(() =>
      issueRevocationList(
        list({
          revoked: [
            { licenseId: 'a', revokedAt: now.toISOString(), reason: 'SUPERSEDED' },
            { licenseId: 'a', revokedAt: now.toISOString(), reason: 'SUPERSEDED' },
          ],
        }),
        signer,
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      issueRevocationList(
        list({
          revoked: [{ licenseId: 'a', revokedAt: now.toISOString(), reason: 'BORED' as never }],
        }),
        signer,
      ),
    ).toThrow(/reason/);
    for (const text of ['', 'mxr1.x', 'mxr2.a.b.c', 'mxr1..k.s']) {
      expect(verify(text).ok).toBe(false);
    }
  });
});
