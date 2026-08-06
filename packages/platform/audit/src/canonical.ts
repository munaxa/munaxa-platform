import type { AuditSequence } from '@munaxa/interfaces';
import { PlatformError, type AnyAuditEvent } from '@munaxa/types';

/**
 * Everything a canonical format is allowed to see.
 *
 * `hash` is not here and never will be: it is this function's output, and a format able to read it
 * could hash its own result.
 *
 * `recordId` is here, optionally, and that is a correction. The platform's own record id *is*
 * derived from the digest (`aud_${sequence}_${hash…}`), so format 1 cannot read it and does not
 * want to — but that is a fact about the platform's id scheme, not about audit chains. A product
 * whose id is an independently minted UUID, assigned before sealing and covered by the digest on
 * purpose, was previously unable to express its own historical format at all: the bytes it had to
 * reproduce contained a value the platform never passed in. Its history was therefore
 * unverifiable through `verifyChain`, which is precisely what versioned formats exist to prevent.
 *
 * The field is optional, and every platform-native format ignores it. Nothing about an existing
 * digest changes by its presence.
 */
export interface CanonicalInput {
  readonly event: AnyAuditEvent;
  readonly previousHash: string | null;
  readonly recordedAt: number;
  readonly sequence: AuditSequence;
  /**
   * The record's own identifier, when the store assigns one independently of the digest.
   *
   * Absent when the id is derived from the hash — the platform's own case — because there is
   * nothing meaningful to pass before the hash exists. A format that declares `recordId` in
   * `requires` will be given it, and `verifyChain` refuses to run that format without it rather
   * than hashing `undefined` into the material and reporting a false mismatch.
   */
  readonly recordId?: string;
  /**
   * An identifier the record carries from a system outside this one — an imported chain's original
   * id, a correlation to a regulator's case reference.
   *
   * Distinct from `recordId` on purpose: one says "what this store calls this row", the other says
   * "what somebody else called it". Conflating them makes an imported chain unverifiable the day
   * the local ids are reassigned.
   */
  readonly externalId?: string;
}

/** Which optional inputs a format reads. Anything not listed is ignored and may be absent. */
export type CanonicalField = 'recordId' | 'externalId';

/**
 * A byte-exact rendering of a record, and the number that identifies it.
 *
 * Audit evidence outlives the code that produced it. A product that has been writing records for
 * three years has three years of digests that were computed by whatever `canonicalize` looked like
 * at the time — so the moment the platform wants to add a field to the hashed bytes, it has a
 * choice between never changing the format again and invalidating every historical digest. Neither
 * is acceptable, so the format is a value: each record records which one sealed it, and
 * verification dispatches on that rather than assuming the current one.
 *
 * `version` must be unique and must never be reused for different bytes. Treat a released version
 * as frozen in the same way a wire format is frozen.
 */
export interface CanonicalFormat {
  readonly version: number;
  /**
   * Optional inputs this format hashes. Default: none.
   *
   * Declared rather than inferred because the failure it prevents is silent. A format that reads
   * `recordId` from a record that has none would hash `undefined`, produce a plausible digest, and
   * report every such record as tampered — an alarm indistinguishable from a real one. Declaring
   * the requirement lets `verifyChain` say "this format needs a record id and this record has
   * none" instead.
   */
  readonly requires?: readonly CanonicalField[];
  /**
   * Human-readable note on what this format covers and what it deliberately leaves out.
   *
   * Carried into an evidence bundle's manifest, so a bundle never claims to attest a field the
   * digest did not cover.
   */
  readonly covers?: string;
  canonicalize(input: CanonicalInput): string;
}

/**
 * Format 1 — the format every Platform 2.0.0 record was written with. Frozen.
 *
 * Field order is fixed rather than taken from `Object.keys`, because a chain that depends on
 * property insertion order breaks the moment a record round-trips through a database.
 *
 * The sequence is emitted as a bare decimal literal rather than through `JSON.stringify`, which
 * throws on a `bigint`. For every value a `number` can hold, `String(n)` and `JSON.stringify(n)`
 * produce identical digits — so a chain that switches representation mid-life keeps verifying, and
 * a sequence past 2^53 is rendered exactly instead of being rounded into a neighbour's position.
 */
export const CANONICAL_FORMAT_V1: CanonicalFormat = Object.freeze({
  version: 1,
  covers:
    'sequence, previousHash, recordedAt, and the event name, time, tenant, correlation, outcome, ' +
    'severity, actor id/kind, target id/type, source ip and payload. Ignores record identifiers.',
  canonicalize({ event, previousHash, recordedAt, sequence }: CanonicalInput): string {
    const rest = JSON.stringify([
      previousHash,
      recordedAt,
      event.name,
      event.occurredAt,
      event.tenantId,
      event.correlationId,
      event.outcome,
      event.severity,
      event.actor?.id ?? null,
      event.actor?.kind ?? null,
      event.target?.id ?? null,
      event.target?.type ?? null,
      event.source?.ipAddress ?? null,
      event.payload === undefined ? null : stableStringify(event.payload),
    ]);
    // `rest` starts with '['; splicing the sequence in ahead of it reproduces the 2.0.0 bytes
    // exactly, for any sequence representation.
    return `[${sequence.toString()},${rest.slice(1)}`;
  },
});

/**
 * The format used to seal new records unless a service is configured otherwise.
 *
 * Changing this constant is a breaking change for anyone who verifies a chain with an older
 * platform build, so a new format arrives as an opt-in registration first and becomes the default
 * only in a major release, once consumers have had a version in which they can read both.
 */
export const CURRENT_CANONICAL_FORMAT = CANONICAL_FORMAT_V1;

/**
 * A set of formats a verifier is willing to accept.
 *
 * A registry rather than a global mutable map: two chains in one process — a product's own and one
 * being imported from an acquired system — may legitimately disagree about what version 2 means,
 * and a process-wide singleton makes that unrepresentable.
 */
export class CanonicalFormatRegistry {
  readonly #formats = new Map<number, CanonicalFormat>();

  constructor(formats: readonly CanonicalFormat[] = [CANONICAL_FORMAT_V1]) {
    for (const format of formats) this.register(format);
  }

  /**
   * Add a format. Registering a different implementation under an existing version is refused —
   * silently changing what a version means turns every historical digest for that version into a
   * false tamper alarm.
   */
  register(format: CanonicalFormat): this {
    const existing = this.#formats.get(format.version);
    if (existing !== undefined && existing !== format) {
      throw new PlatformError(`canonical format version ${format.version} is already registered`, {
        code: 'CONFIG_INVALID',
      });
    }
    this.#formats.set(format.version, format);
    return this;
  }

  get(version: number): CanonicalFormat | undefined {
    return this.#formats.get(version);
  }

  has(version: number): boolean {
    return this.#formats.has(version);
  }

  get versions(): readonly number[] {
    return [...this.#formats.keys()].sort((a, b) => a - b);
  }
}

/** The registry used when a caller does not supply one. Contains format 1 only. */
export const DEFAULT_CANONICAL_FORMATS = new CanonicalFormatRegistry();

/**
 * Which format sealed a record.
 *
 * Absent means 1: the field did not exist when format 1 was the only format, and an append-only
 * audit table cannot be back-filled, so the default has to be the historical one.
 */
export function formatVersionOf(record: { readonly formatVersion?: number }): number {
  return record.formatVersion ?? CANONICAL_FORMAT_V1.version;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}
