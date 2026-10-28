import { AsymmetricSigner, fromBase64Url, toBase64Url, type Signer } from '@munaxa/crypto';

import {
  DeploymentType,
  isKey,
  parseEntitlementSnapshot,
  type EntitlementSnapshot,
} from './entitlements.js';
import { SubscriptionStatus } from './lifecycle.js';

/**
 * Signed licence documents for installations that cannot reach the central service.
 *
 * The private key lives only where licences are issued. An installation holds the public key and
 * nothing else, so it can check a licence and could not produce one it would accept. That is why
 * verification refuses every symmetric algorithm: a verifier holding an HMAC key holds a minting
 * key.
 *
 * Wire form: `mxl1.<base64url(canonical JSON payload)>.<kid>.<base64url(signature)>`, optionally
 * armoured between `-----BEGIN MUNAXA LICENSE-----` lines so it survives being pasted into email.
 * The signature covers a domain-separation prefix and the encoded payload, so no other signed value
 * in the ecosystem can be replayed as a licence.
 */

export const LICENSE_FORMAT = 'mxl1';
const SIGNING_CONTEXT = 'munaxa-license/v1\n';
const ARMOR_BEGIN = '-----BEGIN MUNAXA LICENSE-----';
const ARMOR_END = '-----END MUNAXA LICENSE-----';

/** What a licence asserts. An entitlement snapshot, bound to a licence id and an installation. */
export interface LicensePayload extends Omit<EntitlementSnapshot, 'resolvedAt' | 'deployment'> {
  readonly deployment: typeof DeploymentType.ON_PREMISES;
  readonly licenseId: string;
  /**
   * The installation this licence is for. `null` is an unbound licence, accepted by any
   * installation of the product — issued only for first activation, and bound on renewal.
   */
  readonly installationId: string | null;
  readonly issuedAt: string;
  /** Not valid before this instant. */
  readonly notBefore: string;
  /** The licence this one renews or rebinds, so a chain of renewals is traceable. */
  readonly supersedes: string | null;
}

/** Deterministic JSON: keys sorted at every level, so the signed bytes have exactly one spelling. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

function assertAsymmetric(signer: Signer): void {
  if (signer.algorithm !== 'ES256' && signer.algorithm !== 'RS256') {
    throw new TypeError(`Licences are signed asymmetrically; ${signer.algorithm} is refused`);
  }
}

/**
 * Sign a licence. Called only by the issuing service, which holds the private key; an
 * installation's verify-only signer throws here because it has no private half.
 */
export function issueLicense(payload: LicensePayload, signer: Signer): string {
  assertAsymmetric(signer);
  const parsed = parseLicensePayload(payload);
  if (!parsed.ok) throw new TypeError(`Refusing to sign an invalid licence: ${parsed.error}`);
  // The parsed payload, not the argument: a field the schema does not know is never signed.
  const encoded = toBase64Url(canonicalJson(parsed.payload));
  const signature = signer.sign(SIGNING_CONTEXT + encoded);
  return `${LICENSE_FORMAT}.${encoded}.${signature.kid}.${signature.value}`;
}

/** Wrap a licence for a file or an email body. */
export function armorLicense(token: string): string {
  const lines = token.match(/.{1,64}/g) ?? [];
  return [ARMOR_BEGIN, ...lines, ARMOR_END, ''].join('\n');
}

function unarmor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(ARMOR_BEGIN)) return trimmed;
  const end = trimmed.indexOf(ARMOR_END);
  if (end < 0) return '';
  return trimmed.slice(ARMOR_BEGIN.length, end).replace(/\s+/g, '');
}

export type LicensePayloadParseResult =
  | { readonly ok: true; readonly payload: LicensePayload }
  | { readonly ok: false; readonly error: string };

export function parseLicensePayload(input: unknown): LicensePayloadParseResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'not an object' };
  const r = input as Record<string, unknown>;
  if (r['deployment'] !== DeploymentType.ON_PREMISES)
    return { ok: false, error: 'not an on-premises licence' };
  // The snapshot validator is the one source of truth for the shared fields.
  const asSnapshot = parseEntitlementSnapshot({ ...r, resolvedAt: r['issuedAt'] });
  if (!asSnapshot.ok) return asSnapshot;
  const id = (v: unknown): boolean => typeof v === 'string' && v.length > 0 && v.length <= 128;
  if (!id(r['licenseId'])) return { ok: false, error: 'invalid licenseId' };
  if (r['installationId'] !== null && !id(r['installationId']))
    return { ok: false, error: 'invalid installationId' };
  if (r['supersedes'] !== null && !id(r['supersedes']))
    return { ok: false, error: 'invalid supersedes' };
  if (typeof r['notBefore'] !== 'string' || Number.isNaN(Date.parse(r['notBefore']))) {
    return { ok: false, error: 'invalid notBefore' };
  }
  // A licence asserts an issued state; lifecycle decisions after issue reach an offline
  // installation only as a new licence.
  if (r['status'] !== SubscriptionStatus.ACTIVE && r['status'] !== SubscriptionStatus.TRIAL) {
    return { ok: false, error: 'a licence is issued ACTIVE or TRIAL' };
  }
  if (r['expiresAt'] === null && r['trialEndsAt'] === null) {
    return { ok: false, error: 'a licence must end' };
  }
  const shared = asSnapshot.snapshot;
  return {
    ok: true,
    payload: {
      schemaVersion: 1,
      customerId: shared.customerId,
      tenantId: shared.tenantId,
      product: shared.product,
      subscriptionId: shared.subscriptionId,
      plan: shared.plan,
      status: shared.status,
      trialEndsAt: shared.trialEndsAt,
      expiresAt: shared.expiresAt,
      graceUntil: shared.graceUntil,
      features: shared.features,
      limits: shared.limits,
      deployment: DeploymentType.ON_PREMISES,
      licenseId: r['licenseId'] as string,
      installationId: r['installationId'] as string | null,
      issuedAt: r['issuedAt'] as string,
      notBefore: r['notBefore'],
      supersedes: r['supersedes'] as string | null,
    },
  };
}

export const LicenseRejection = {
  MALFORMED: 'MALFORMED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  UNKNOWN_KEY: 'UNKNOWN_KEY',
  BAD_SIGNATURE: 'BAD_SIGNATURE',
  WRONG_PRODUCT: 'WRONG_PRODUCT',
  WRONG_INSTALLATION: 'WRONG_INSTALLATION',
  NOT_YET_VALID: 'NOT_YET_VALID',
  /** The local clock is earlier than a time this installation has already observed. */
  CLOCK_ROLLBACK: 'CLOCK_ROLLBACK',
} as const;
export type LicenseRejection = (typeof LicenseRejection)[keyof typeof LicenseRejection];

/** Public keys only, and the ids they answer to. Build with {@link licenseVerifier}. */
export interface LicenseVerifier {
  readonly kids: ReadonlySet<string>;
  readonly signer: Signer;
}

export interface LicenseVerificationOptions {
  readonly verifier: LicenseVerifier;
  readonly product: string;
  /** This installation's identifier. */
  readonly installationId: string;
  readonly now: Date;
  /**
   * The latest instant this installation has ever recorded — persisted by the product on every
   * successful check. A clock set back past it means somebody is trying to un-expire a licence.
   */
  readonly lastObservedAt?: Date | null;
  /** How far back the clock may move (NTP correction, a VM resumed) before it counts. */
  readonly clockToleranceMs?: number;
}

export type LicenseVerificationResult =
  | {
      readonly ok: true;
      readonly license: LicensePayload;
      /** The licence as a snapshot, for the same evaluation SaaS uses. */
      readonly snapshot: EntitlementSnapshot;
    }
  | { readonly ok: false; readonly reason: LicenseRejection; readonly detail?: string };

/**
 * A verify-only verifier from public keys. Only the public half is ever passed on, so a
 * misconfigured installation that was handed a key pair still cannot sign.
 *
 * Several keys are accepted so a rotation can ship the next public key before the issuing service
 * starts signing with it.
 */
export function licenseVerifier(
  algorithm: 'ES256' | 'RS256',
  keys: readonly { readonly kid: string; readonly publicKey: string }[],
): LicenseVerifier {
  return {
    kids: new Set(keys.map((k) => k.kid)),
    signer: new AsymmetricSigner(
      algorithm,
      keys.map(({ kid, publicKey }) => ({ kid, publicKey })),
    ),
  };
}

const DEFAULT_CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Verify a licence offline.
 *
 * A valid licence whose term has ended is still `ok`: its snapshot's effective status is EXPIRED
 * and the product degrades to read-only through the ordinary evaluation. Rejection is reserved for
 * a licence that cannot be trusted at all — forged, for someone else, or presented under a clock
 * that has been wound back.
 */
export function verifyLicense(
  text: string,
  options: LicenseVerificationOptions,
): LicenseVerificationResult {
  const { signer, kids } = options.verifier;
  assertAsymmetric(signer);
  const token = unarmor(text);
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, reason: LicenseRejection.MALFORMED };
  const [format, encoded, kid, signature] = parts as [string, string, string, string];
  if (format !== LICENSE_FORMAT) return { ok: false, reason: LicenseRejection.UNSUPPORTED_FORMAT };
  if (encoded.length === 0 || kid.length === 0 || signature.length === 0) {
    return { ok: false, reason: LicenseRejection.MALFORMED };
  }

  // Signature first: nothing in an unauthenticated payload is read, not even to report it.
  if (!kids.has(kid)) return { ok: false, reason: LicenseRejection.UNKNOWN_KEY };
  const verified = signer.verify(SIGNING_CONTEXT + encoded, {
    kid,
    algorithm: signer.algorithm,
    value: signature,
  });
  if (!verified) return { ok: false, reason: LicenseRejection.BAD_SIGNATURE };

  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded).toString('utf8'));
  } catch {
    return { ok: false, reason: LicenseRejection.MALFORMED };
  }
  const parsed = parseLicensePayload(raw);
  if (!parsed.ok) return { ok: false, reason: LicenseRejection.MALFORMED, detail: parsed.error };
  const license = parsed.payload;

  if (license.product !== options.product)
    return { ok: false, reason: LicenseRejection.WRONG_PRODUCT };
  if (license.installationId !== null && license.installationId !== options.installationId) {
    return { ok: false, reason: LicenseRejection.WRONG_INSTALLATION };
  }
  const now = options.now.getTime();
  const tolerance = options.clockToleranceMs ?? DEFAULT_CLOCK_TOLERANCE_MS;
  const observed = options.lastObservedAt?.getTime();
  if (observed !== undefined && now < observed - tolerance) {
    return { ok: false, reason: LicenseRejection.CLOCK_ROLLBACK };
  }
  // A clock earlier than the licence's own issue time is also a rolled-back clock, and catches the
  // first boot after a rollback, before anything has been observed.
  if (now < Date.parse(license.issuedAt) - tolerance)
    return { ok: false, reason: LicenseRejection.CLOCK_ROLLBACK };
  if (now < Date.parse(license.notBefore))
    return { ok: false, reason: LicenseRejection.NOT_YET_VALID };

  return { ok: true, license, snapshot: snapshotOfLicense(license) };
}

/** The entitlement snapshot a licence asserts, resolved at its issue time. */
export function snapshotOfLicense(license: LicensePayload): EntitlementSnapshot {
  return {
    schemaVersion: 1,
    customerId: license.customerId,
    tenantId: license.tenantId,
    product: license.product,
    deployment: license.deployment,
    subscriptionId: license.subscriptionId,
    plan: license.plan,
    status: license.status,
    trialEndsAt: license.trialEndsAt,
    expiresAt: license.expiresAt,
    graceUntil: license.graceUntil,
    features: license.features,
    limits: license.limits,
    resolvedAt: license.issuedAt,
  };
}

/**
 * An offline activation request: what an installation without internet access shows its
 * administrator to send to Munaxa, and what the issuing service turns into a bound licence.
 *
 * It carries no secret. Its integrity is not needed — the response is a signed licence for exactly
 * the installation id in the request, so a tampered request yields a licence for a different
 * installation, which this installation then refuses.
 */
export interface ActivationRequest {
  readonly format: 'mxa1';
  readonly product: string;
  readonly installationId: string;
  /** The licence being activated, renewed or moved. */
  readonly licenseId: string;
  readonly requestedAt: string;
  /** Why: first activation, renewal, or a replaced server. */
  readonly reason: 'ACTIVATION' | 'RENEWAL' | 'SERVER_REPLACEMENT';
}

export function encodeActivationRequest(request: ActivationRequest): string {
  return toBase64Url(canonicalJson(request));
}

export function decodeActivationRequest(code: string): ActivationRequest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(code.trim()).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;
  if (
    r['format'] !== 'mxa1' ||
    !isKey(r['product']) ||
    !id(r['installationId']) ||
    !id(r['licenseId'])
  ) {
    return null;
  }
  if (typeof r['requestedAt'] !== 'string' || Number.isNaN(Date.parse(r['requestedAt'])))
    return null;
  if (
    r['reason'] !== 'ACTIVATION' &&
    r['reason'] !== 'RENEWAL' &&
    r['reason'] !== 'SERVER_REPLACEMENT'
  )
    return null;
  return {
    format: 'mxa1',
    product: r['product'],
    installationId: r['installationId'],
    licenseId: r['licenseId'],
    requestedAt: r['requestedAt'],
    reason: r['reason'],
  };
}
