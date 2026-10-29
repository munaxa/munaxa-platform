import { fromBase64Url, toBase64Url, type Signer } from '@munaxa/crypto';

import type { EntitlementSnapshot } from './entitlements.js';
import type { LicensePayload, LicenseVerifier } from './license.js';
import { canonicalJson } from './license.js';
import { SubscriptionStatus } from './lifecycle.js';

/**
 * Signed revocation lists, for installations that cannot reach the central service.
 *
 * A licence cannot be withdrawn once an offline installation holds it: it is valid until it ends.
 * A revocation list is how the issuing service says "not any more" — for a licence issued in error,
 * superseded by a server replacement, or issued under a compromised key — to an installation that
 * only ever receives files.
 *
 * - **Signed like a licence, never mistaken for one.** The same keys sign it, under its own
 *   domain-separation prefix, so neither document can be replayed as the other.
 * - **Cumulative and numbered.** Each list names every licence ever revoked for its product, and
 *   carries a `sequence` that only grows. An installation persists the newest list it has verified
 *   and refuses an older one, so neither deleting the file nor presenting last year's list undoes
 *   a revocation.
 * - **It only ever narrows.** A revoked licence is treated as suspended — read-only under the
 *   default policy, never NONE: the customer still sees their records. A missing, unreadable,
 *   forged or stale list changes nothing: the licence keeps exactly the access it already had.
 *   Nothing here can widen access, and nothing here bypasses licence verification.
 *
 * Wire form: `mxr1.<base64url(canonical JSON payload)>.<kid>.<base64url(signature)>`.
 */

export const REVOCATION_LIST_FORMAT = 'mxr1';
const SIGNING_CONTEXT = 'munaxa-revocation/v1\n';

export const RevocationReason = {
  /** Issued in error, or to the wrong customer. */
  ISSUED_IN_ERROR: 'ISSUED_IN_ERROR',
  /** A reactivation for a replacement server superseded it. */
  SUPERSEDED: 'SUPERSEDED',
  /** The contract ended early (refund, breach). */
  CONTRACT_ENDED: 'CONTRACT_ENDED',
  /** The signing key it was issued under is no longer trusted. */
  KEY_COMPROMISE: 'KEY_COMPROMISE',
  /**
   * Not issued by anyone: what this installation applies when the list it persisted no longer
   * verifies and no valid list replaces it. It cannot know which licences that list revoked, so it
   * treats its own licence as revoked rather than as never revoked.
   */
  LIST_UNVERIFIABLE: 'LIST_UNVERIFIABLE',
} as const;
export type RevocationReason = (typeof RevocationReason)[keyof typeof RevocationReason];
const REASONS: ReadonlySet<string> = new Set(Object.values(RevocationReason));

export interface RevocationEntry {
  readonly licenseId: string;
  readonly revokedAt: string;
  readonly reason: RevocationReason;
}

export interface RevocationListPayload {
  readonly format: typeof REVOCATION_LIST_FORMAT;
  readonly product: string;
  /** Grows by at least one with every list issued for the product. */
  readonly sequence: number;
  readonly issuedAt: string;
  /** Every licence ever revoked for the product, ordered by licence id. */
  readonly revoked: readonly RevocationEntry[];
}

export type RevocationListParseResult =
  | { readonly ok: true; readonly payload: RevocationListPayload }
  | { readonly ok: false; readonly error: string };

const isIsoInstant = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

export function parseRevocationListPayload(input: unknown): RevocationListParseResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'not an object' };
  const r = input as Record<string, unknown>;
  if (r['format'] !== REVOCATION_LIST_FORMAT) return { ok: false, error: 'not a revocation list' };
  if (typeof r['product'] !== 'string' || r['product'].length === 0)
    return { ok: false, error: 'product' };
  const sequence = r['sequence'];
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1)
    return { ok: false, error: 'sequence' };
  if (!isIsoInstant(r['issuedAt'])) return { ok: false, error: 'issuedAt' };
  if (!Array.isArray(r['revoked'])) return { ok: false, error: 'revoked' };
  const revoked: RevocationEntry[] = [];
  const seen = new Set<string>();
  for (const item of r['revoked'] as unknown[]) {
    if (typeof item !== 'object' || item === null) return { ok: false, error: 'revoked entry' };
    const e = item as Record<string, unknown>;
    if (typeof e['licenseId'] !== 'string' || e['licenseId'].length === 0)
      return { ok: false, error: 'revoked licenseId' };
    if (!isIsoInstant(e['revokedAt'])) return { ok: false, error: 'revoked revokedAt' };
    if (typeof e['reason'] !== 'string' || !REASONS.has(e['reason']))
      return { ok: false, error: 'revoked reason' };
    if (seen.has(e['licenseId'])) return { ok: false, error: 'duplicate licenseId' };
    seen.add(e['licenseId']);
    revoked.push({
      licenseId: e['licenseId'],
      revokedAt: e['revokedAt'],
      reason: e['reason'] as RevocationReason,
    });
  }
  revoked.sort((a, b) => (a.licenseId < b.licenseId ? -1 : a.licenseId > b.licenseId ? 1 : 0));
  return {
    ok: true,
    payload: {
      format: REVOCATION_LIST_FORMAT,
      product: r['product'],
      sequence,
      issuedAt: r['issuedAt'],
      revoked,
    },
  };
}

function assertAsymmetric(signer: Signer): void {
  if (signer.algorithm !== 'ES256' && signer.algorithm !== 'RS256') {
    throw new TypeError(
      `Revocation lists are signed asymmetrically; ${signer.algorithm} is refused`,
    );
  }
}

/** Sign a revocation list. Called only by the issuing service, which holds the private key. */
export function issueRevocationList(payload: RevocationListPayload, signer: Signer): string {
  assertAsymmetric(signer);
  const parsed = parseRevocationListPayload(payload);
  if (!parsed.ok)
    throw new TypeError(`Refusing to sign an invalid revocation list: ${parsed.error}`);
  const encoded = toBase64Url(canonicalJson(parsed.payload));
  const signature = signer.sign(SIGNING_CONTEXT + encoded);
  return `${REVOCATION_LIST_FORMAT}.${encoded}.${signature.kid}.${signature.value}`;
}

export const RevocationListRejection = {
  MALFORMED: 'MALFORMED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  UNKNOWN_KEY: 'UNKNOWN_KEY',
  BAD_SIGNATURE: 'BAD_SIGNATURE',
  WRONG_PRODUCT: 'WRONG_PRODUCT',
  /** Older than the newest list this installation has already verified. */
  STALE: 'STALE',
  /** Issued later than the installation's clock allows: the clock has been wound back. */
  CLOCK_ROLLBACK: 'CLOCK_ROLLBACK',
} as const;
export type RevocationListRejection =
  (typeof RevocationListRejection)[keyof typeof RevocationListRejection];

export interface RevocationListVerificationOptions {
  readonly verifier: LicenseVerifier;
  readonly product: string;
  readonly now: Date;
  /** The `sequence` of the newest list this installation has verified and persisted, if any. */
  readonly lastSequence?: number | null;
  /** How far the issuing service's clock may lead this installation's. */
  readonly clockToleranceMs?: number;
  /**
   * Skip the clock check: only for re-reading a list this installation already accepted and
   * persisted. A wound-back clock must not be able to discard a revocation it has already received.
   */
  readonly persisted?: boolean;
}

export type RevocationListVerificationResult =
  | { readonly ok: true; readonly list: RevocationListPayload }
  | { readonly ok: false; readonly reason: RevocationListRejection; readonly detail?: string };

const DEFAULT_CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Verify a revocation list offline, with the installation's licence verifier (public keys only).
 *
 * The product persists an accepted list (its text and `sequence`) and keeps applying it until a
 * newer one is accepted. A rejected list is ignored — the previously persisted list stays in force.
 */
export function verifyRevocationList(
  text: string,
  options: RevocationListVerificationOptions,
): RevocationListVerificationResult {
  const { signer, kids } = options.verifier;
  assertAsymmetric(signer);
  const parts = text.trim().split('.');
  if (parts.length !== 4) return { ok: false, reason: RevocationListRejection.MALFORMED };
  const [format, encoded, kid, signature] = parts as [string, string, string, string];
  if (format !== REVOCATION_LIST_FORMAT)
    return { ok: false, reason: RevocationListRejection.UNSUPPORTED_FORMAT };
  if (encoded.length === 0 || kid.length === 0 || signature.length === 0)
    return { ok: false, reason: RevocationListRejection.MALFORMED };

  // Signature first: nothing in an unauthenticated payload is read.
  if (!kids.has(kid)) return { ok: false, reason: RevocationListRejection.UNKNOWN_KEY };
  const verified = signer.verify(SIGNING_CONTEXT + encoded, {
    kid,
    algorithm: signer.algorithm,
    value: signature,
  });
  if (!verified) return { ok: false, reason: RevocationListRejection.BAD_SIGNATURE };

  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded).toString('utf8'));
  } catch {
    return { ok: false, reason: RevocationListRejection.MALFORMED };
  }
  const parsed = parseRevocationListPayload(raw);
  if (!parsed.ok)
    return { ok: false, reason: RevocationListRejection.MALFORMED, detail: parsed.error };
  const list = parsed.payload;

  if (list.product !== options.product)
    return { ok: false, reason: RevocationListRejection.WRONG_PRODUCT };
  const last = options.lastSequence;
  if (last !== undefined && last !== null && list.sequence < last)
    return { ok: false, reason: RevocationListRejection.STALE };
  const tolerance = options.clockToleranceMs ?? DEFAULT_CLOCK_TOLERANCE_MS;
  if (options.persisted !== true && options.now.getTime() < Date.parse(list.issuedAt) - tolerance)
    return { ok: false, reason: RevocationListRejection.CLOCK_ROLLBACK };

  return { ok: true, list };
}

/** The entry revoking `license`, or `null` when the list does not name it. */
export function revocationOf(
  license: Pick<LicensePayload, 'licenseId' | 'product'>,
  list: RevocationListPayload | null,
): RevocationEntry | null {
  if (list === null || list.product !== license.product) return null;
  return list.revoked.find((entry) => entry.licenseId === license.licenseId) ?? null;
}

/**
 * The snapshot a licence asserts, with a revocation applied: a revoked licence is suspended. Only
 * ever narrows — a status already more restrictive than SUSPENDED (CANCELLED) is kept.
 */
export function applyRevocation(
  snapshot: EntitlementSnapshot,
  revocation: RevocationEntry | null,
): EntitlementSnapshot {
  if (revocation === null) return snapshot;
  if (snapshot.status === SubscriptionStatus.CANCELLED) return snapshot;
  return { ...snapshot, status: SubscriptionStatus.SUSPENDED };
}

/** What {@link resolveRevocationList} decided. */
export interface RevocationListResolution {
  /** The list in force: the newest one verified, offered or persisted. `null` when there is none. */
  readonly list: RevocationListPayload | null;
  /** Text to persist in place of what is stored, or `null` to keep what is stored. */
  readonly persist: string | null;
  /** Why the offered list was not taken, when one was offered and refused. */
  readonly rejected: RevocationListRejection | null;
  /** The persisted list no longer verified (its key was withdrawn, or the stored text altered). */
  readonly persistedInvalid: boolean;
  /**
   * The persisted list no longer verifies and no valid list replaced it: what it revoked is
   * unknown, so every licence is treated as revoked ({@link revocationInForce}) until a valid list
   * is installed. Failing closed is what keeps an unverifiable list from widening access.
   */
  readonly failClosed: boolean;
}

/**
 * The one decision a product makes on every licence check: which revocation list is in force.
 *
 * `offered` is the list file as the installation holds it now (or `null`); `persisted` is the text
 * the product stored the last time a list was accepted (or `null`). The persisted list is re-read
 * without the clock check, so winding the clock back cannot discard it. The offered list is taken
 * only when it verifies and is at least as new as the persisted one, and is persisted only when it
 * is newer — so deleting the file, offering last year's list, or offering a forged one leaves the
 * persisted list in force. Nothing here can make the list in force smaller than it was.
 *
 * Keep a retired licence key in the product's public keys for as long as lists it signed are
 * persisted: a persisted list that no longer verifies cannot be read, so the installation fails
 * closed (`failClosed`) — every licence suspended — until a valid list is installed.
 */
export function resolveRevocationList(
  offered: string | null,
  persisted: string | null,
  options: Omit<RevocationListVerificationOptions, 'lastSequence' | 'persisted'>,
): RevocationListResolution {
  let current: RevocationListPayload | null = null;
  let persistedInvalid = false;
  if (persisted !== null) {
    const again = verifyRevocationList(persisted, { ...options, persisted: true });
    if (again.ok) current = again.list;
    else persistedInvalid = true;
  }
  const unreadable = persistedInvalid && current === null;
  if (offered === null || offered.trim().length === 0) {
    return {
      list: current,
      persist: null,
      rejected: null,
      persistedInvalid,
      failClosed: unreadable,
    };
  }
  const verified = verifyRevocationList(offered, {
    ...options,
    lastSequence: current?.sequence ?? null,
  });
  if (!verified.ok) {
    return {
      list: current,
      persist: null,
      rejected: verified.reason,
      persistedInvalid,
      failClosed: unreadable,
    };
  }
  const newer = current === null || verified.list.sequence > current.sequence;
  return {
    list: newer ? verified.list : current,
    persist: newer ? offered.trim() : null,
    rejected: null,
    persistedInvalid,
    failClosed: false,
  };
}

/**
 * The revocation in force for `license` under a resolution: the list's entry for it, or — when the
 * installation has failed closed — a revocation of every licence. Pass the result to
 * {@link applyRevocation}.
 */
export function revocationInForce(
  license: Pick<LicensePayload, 'licenseId' | 'product'>,
  resolution: RevocationListResolution,
  now: Date,
): RevocationEntry | null {
  if (resolution.failClosed) {
    return {
      licenseId: license.licenseId,
      revokedAt: now.toISOString(),
      reason: RevocationReason.LIST_UNVERIFIABLE,
    };
  }
  return revocationOf(license, resolution.list);
}
