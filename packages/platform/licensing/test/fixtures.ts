import { generateKeyPairSync } from 'node:crypto';

import { AsymmetricSigner } from '@munaxa/crypto';

import type { EntitlementSnapshot, LicensePayload } from '../src/index.js';

export function keyPair(kid = 'lic-2026-1'): {
  kid: string;
  privateKey: string;
  publicKey: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    kid,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function issuer(pair = keyPair()): AsymmetricSigner {
  return new AsymmetricSigner('ES256', [pair]);
}

export function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    schemaVersion: 1,
    customerId: 'cus_1',
    tenantId: 'ten_1',
    product: 'product-a',
    deployment: 'SAAS',
    subscriptionId: 'sub_1',
    plan: { code: 'standard', version: 1 },
    status: 'ACTIVE',
    trialEndsAt: null,
    expiresAt: '2027-01-01T00:00:00.000Z',
    graceUntil: '2027-01-15T00:00:00.000Z',
    features: ['reports.advanced'],
    limits: { users: 10, 'storage.bytes': 1000, unlimited: null },
    resolvedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export function licensePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    schemaVersion: 1,
    customerId: 'cus_1',
    tenantId: 'ten_1',
    product: 'product-a',
    deployment: 'ON_PREMISES',
    subscriptionId: 'sub_1',
    plan: { code: 'standard', version: 1 },
    status: 'ACTIVE',
    trialEndsAt: null,
    expiresAt: '2027-01-01T00:00:00.000Z',
    graceUntil: '2027-01-15T00:00:00.000Z',
    features: ['reports.advanced'],
    limits: { users: 10 },
    licenseId: 'lic_1',
    installationId: 'inst_1',
    issuedAt: '2026-10-01T00:00:00.000Z',
    notBefore: '2026-10-01T00:00:00.000Z',
    supersedes: null,
    ...overrides,
  };
}
