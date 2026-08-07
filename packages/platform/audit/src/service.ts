import { createHash } from 'node:crypto';
import {
  isChainConflict,
  nextSequence,
  sameSequence,
  type AuditAppendOptions,
  type AuditRecord,
  type AuditRepositoryPort,
  type AuditSequence,
  type AuditSinkPort,
  type AuditSealer,
  type ChainHead,
  type LoggerPort,
} from '@munaxa/interfaces';
import type { CanonicalInput } from './canonical.js';
import {
  CANONICAL_FORMAT_V1,
  CURRENT_CANONICAL_FORMAT,
  CanonicalFormatRegistry,
  DEFAULT_CANONICAL_FORMATS,
  formatVersionOf,
  type CanonicalFormat,
} from './canonical.js';
import {
  systemClock,
  type Clock,
  type SecurityContext,
  type AnyAuditEvent,
  type SecurityEvent,
  type SecurityEventName,
  type TenantId,
} from '@munaxa/types';
import { auditEvent, NON_SUPPRESSIBLE_EVENTS, type AuditEventInput } from './events.js';

/**
 * The audit trail.
 *
 * Three properties distinguish this from "logging things twice":
 *
 * - **Hash-chained, with the chain owned by the store.** Each record's hash covers the record
 *   *and* the previous hash, and the head is allocated inside the repository's transaction rather
 *   than held in this process. That is the 2.0 change: in 1.0 the head lived in a field here, so
 *   two replicas each maintained their own and `verifyChain` reported tampering forever on any
 *   real deployment. Tamper evidence you cannot trust is worse than none, because it trains an
 *   operator to ignore the alarm.
 * - **Tamper evidence, not prevention.** Someone with write access can rebuild the chain, which is
 *   why exporters ship records off-box, where they cannot.
 * - **Non-blocking on the happy path, by policy.** A sink that fails must not fail a login — but
 *   silence is unacceptable too, so failures are reported through `onSinkError` and counted.
 * - **Closed vocabulary.** Only names from `SECURITY_EVENTS` are accepted, so one query works
 *   across every product.
 */
export interface AuditServiceOptions<TName extends string = SecurityEventName> {
  /**
   * The durable, chain-owning store. Required: without it there is no ordering authority, and a
   * hash chain without one is decoration.
   */
  readonly repository: AuditRepositoryPort<TName>;
  /** Mirrors — logs, a SIEM, an exporter. Failures here are reported, never fatal. */
  readonly sinks?: readonly AuditSinkPort<TName>[];
  /** Attempts when the repository reports a `ChainConflictError`. Default 5. */
  readonly maxChainAttempts?: number;
  readonly clock?: Clock;
  readonly logger?: LoggerPort;
  /**
   * Events to skip. `NON_SUPPRESSIBLE_EVENTS` are recorded regardless — a product may quieten
   * routine noise, not the events an incident review depends on.
   */
  readonly suppress?: readonly TName[];
  /** Called when a sink throws. Default: log at error level. */
  readonly onSinkError?: (
    error: unknown,
    record: AuditRecord<TName>,
    sink: AuditSinkPort<TName>,
  ) => void;
  /** Fields stripped from every payload before writing. Applied on top of the built-in list. */
  readonly redactPayloadKeys?: readonly string[];
  /**
   * The canonical format used to seal new records. Defaults to the current platform format.
   *
   * Set it to pin a format explicitly — worth doing in a product with long-lived evidence, so an
   * upgrade that changes the platform default becomes a deliberate decision with a migration
   * rather than a silent change of what the digests mean.
   */
  readonly canonicalFormat?: CanonicalFormat;
  /**
   * Mint the record's identifier. Defaults to the platform's `aud_${sequence}_${hash…}`.
   *
   * **Called before the record is hashed**, which is the whole point. The platform's own id is
   * derived from the digest, so it can only be computed afterwards — but a product whose digest
   * *covers* its id (see `CanonicalInput.recordId`) needs the id to exist first, or the two are
   * circular. Supplying this flips the order: the id is minted, passed to the canonical format as
   * `recordId`, and then hashed. Omitting it keeps today's behaviour exactly, hash-derived id and
   * all, so no existing digest or identifier changes.
   *
   * The generator owns uniqueness. The platform does not retry a collision: an id that repeats is
   * a broken generator, and minting a second one quietly would hide that while two records share
   * a row.
   */
  readonly generateId?: (sequence: AuditSequence, recordedAt: number) => string;
}

/** Per-write options. Named for symmetry with the port; identical to `AuditAppendOptions`. */
export type AuditWriteOptions = AuditAppendOptions;

const ALWAYS_STRIPPED = [
  'password',
  'newPassword',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'otp',
  'code',
  'tokenHash',
  'passwordHash',
];

export class AuditService<TName extends string = SecurityEventName> {
  readonly #repository: AuditRepositoryPort<TName>;
  readonly #sinks: readonly AuditSinkPort<TName>[];
  readonly #maxChainAttempts: number;
  readonly #clock: Clock;
  readonly #logger: LoggerPort | undefined;
  readonly #suppress: ReadonlySet<string>;
  readonly #onSinkError: NonNullable<AuditServiceOptions<TName>['onSinkError']>;
  readonly #stripped: ReadonlySet<string>;
  readonly #format: CanonicalFormat;
  readonly #generateId: AuditServiceOptions<TName>['generateId'];
  #failures = 0;
  #conflicts = 0;

  constructor(options: AuditServiceOptions<TName>) {
    this.#repository = options.repository;
    this.#sinks = options.sinks ?? [];
    this.#maxChainAttempts = options.maxChainAttempts ?? 5;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#suppress = new Set(options.suppress ?? []);
    this.#format = options.canonicalFormat ?? CURRENT_CANONICAL_FORMAT;
    this.#generateId = options.generateId;
    this.#stripped = new Set(
      [...ALWAYS_STRIPPED, ...(options.redactPayloadKeys ?? [])].map((key) => key.toLowerCase()),
    );
    this.#onSinkError =
      options.onSinkError ??
      ((error, record) => {
        this.#logger?.log('error', 'audit.sink.failed', {
          auditId: record.id,
          event: record.event.name,
          error,
        });
      });
  }

  /** Sink write failures since start. Surface it as a metric; a rising count is an alert. */
  get failureCount(): number {
    return this.#failures;
  }

  /**
   * Chain conflicts retried since start.
   *
   * Expected to be non-zero on an optimistic adapter under load — that is the design working. A
   * number climbing toward `maxChainAttempts` per write means write contention on one tenant, and
   * the answer is a pessimistic adapter rather than more retries.
   */
  get conflictCount(): number {
    return this.#conflicts;
  }

  /** Record an event built from the ambient security context. */
  async record(
    this: AuditService<SecurityEventName>,
    context: SecurityContext,
    input: AuditEventInput,
    options: AuditWriteOptions = {},
  ): Promise<AuditRecord<SecurityEventName> | undefined> {
    return this.write(auditEvent(context, { occurredAt: this.#clock.now(), ...input }), options);
  }

  /**
   * Record a pre-built event. Used by the edge, where there is no security context yet.
   *
   * Pass `options.transaction` to append inside the caller's unit of work, so the record commits
   * with the change it describes. The repository must support it; see `AuditAppendOptions`.
   */
  async write(
    event: SecurityEvent<Readonly<Record<string, unknown>>, TName>,
    options: AuditWriteOptions = {},
  ): Promise<AuditRecord<TName> | undefined> {
    if (this.#suppress.has(event.name) && !NON_SUPPRESSIBLE_EVENTS.has(event.name)) {
      return undefined;
    }

    const sanitized = this.#sanitize(event);
    const recordedAt = this.#clock.now();
    const format = this.#format;

    // The store decides the sequence, inside its own transaction. `seal` may be called more than
    // once — an optimistic adapter re-runs it after a conflict with the new head — so it is pure.
    const seal = (previous: ChainHead | null): AuditRecord<TName> => {
      // `nextSequence` rather than `+ 1`: a store whose sequence is a `bigserial` hands back a
      // bigint, and `1n + 1` is a TypeError rather than 2.
      const sequence: AuditSequence = previous === null ? 1 : nextSequence(previous.sequence);
      const previousHash = previous?.hash ?? null;
      // When the product mints the id, it must exist before hashing — its digest may cover it.
      // When the platform mints it, it cannot exist until after, because it is derived from the
      // digest. That is the whole ordering difference, and it is why this is two branches.
      const productId = this.#generateId?.(sequence, recordedAt);
      const hash = hashOf(format, {
        event: sanitized,
        previousHash,
        recordedAt,
        sequence,
        ...(productId === undefined ? {} : { recordId: productId }),
      });
      return {
        id: productId ?? `aud_${toBase36(sequence)}_${hash.slice(0, 12)}`,
        event: sanitized,
        recordedAt,
        sequence,
        previousHash,
        hash,
        // Omitted for format 1 so records stay byte-identical to the ones Platform 2.0.0 wrote,
        // and so an adapter with no column for it is not silently dropping information.
        ...(format.version === CANONICAL_FORMAT_V1.version
          ? {}
          : { formatVersion: format.version }),
      };
    };

    const record = await this.#appendWithRetry(event.tenantId, seal, options);

    // Mirrors run in parallel and independently, after the durable write: a broken SIEM webhook
    // must not stop the repository, and neither must stop the request that produced the event.
    await Promise.all(
      this.#sinks.map(async (sink) => {
        try {
          await sink.write(record);
        } catch (error) {
          this.#failures++;
          this.#onSinkError(error, record, sink);
        }
      }),
    );

    return record;
  }

  /**
   * Retry only a `ChainConflictError`.
   *
   * Any other failure — a timeout, a dropped connection — may have committed, and re-appending
   * would duplicate a record while breaking the chain. An audit write is `at-most-once` for
   * exactly that reason, and the caller learns it failed.
   *
   * When the append joined the caller's transaction there is no retry at all: a chain conflict
   * has already aborted that transaction, so a second attempt inside it cannot commit. The
   * conflict propagates and the caller retries its own unit of work, which is the only level at
   * which a retry is meaningful.
   */
  async #appendWithRetry(
    tenantId: TenantId,
    seal: AuditSealer<TName>,
    options: AuditAppendOptions,
  ): Promise<AuditRecord<TName>> {
    const joined = options.transaction !== undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#repository.appendChained(tenantId, seal, options);
      } catch (error) {
        if (joined || !isChainConflict(error) || attempt >= this.#maxChainAttempts) throw error;
        this.#conflicts++;
        this.#logger?.log('debug', 'audit.chain.conflict', { tenantId, attempt });
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(this.#sinks.map(async (sink) => sink.flush?.()));
  }

  #sanitize(
    event: SecurityEvent<Readonly<Record<string, unknown>>, TName>,
  ): SecurityEvent<Readonly<Record<string, unknown>>, TName> {
    if (!event.payload) return event;
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.payload)) {
      payload[key] = this.#stripped.has(key.toLowerCase()) ? '[redacted]' : value;
    }
    return { ...event, payload };
  }
}

/**
 * The bytes that get hashed, in format 1.
 *
 * Kept as a free function with its original signature because it is part of the 2.0.0 surface and
 * consumers hash records with it directly. New code should reach for a `CanonicalFormat` instead,
 * which is versioned; this is format 1 and will stay format 1.
 */
export function canonicalize(
  event: AnyAuditEvent,
  previousHash: string | null,
  recordedAt: number,
  sequence: AuditSequence,
): string {
  return CANONICAL_FORMAT_V1.canonicalize({ event, previousHash, recordedAt, sequence });
}

function hashOf(format: CanonicalFormat, input: CanonicalInput): string {
  return createHash('sha256').update(format.canonicalize(input)).digest('hex');
}

/**
 * The identifiers a format may read, taken from the record it is verifying.
 *
 * A format that does not declare them never sees them, so a platform-native digest cannot change
 * by their presence — which is the whole basis on which this was made additive.
 */
function identifiersFor(
  format: CanonicalFormat,
  record: AuditRecord<string>,
): Pick<CanonicalInput, 'recordId' | 'externalId'> {
  const requires = format.requires ?? [];
  return {
    ...(requires.includes('recordId') ? { recordId: record.id } : {}),
    ...(requires.includes('externalId') && record.externalId !== undefined
      ? { externalId: record.externalId }
      : {}),
  };
}

function toBase36(sequence: AuditSequence): string {
  return sequence.toString(36);
}

/**
 * How a chain can fail, as a token rather than a sentence.
 *
 * Each of these is a *different accusation*, and they call for different responses:
 *
 * - `SEQUENCE_GAP` — a record was removed, and the chain of the survivors is intact because the
 *   removal took the link with it. This is the case the hash alone cannot see, and the reason a
 *   sequence exists at all.
 * - `LINK_MISMATCH` — a record was inserted or removed mid-chain, or the walk was handed a batch
 *   that does not continue from where it was told it would.
 * - `DIGEST_MISMATCH` — a field was altered.
 * - `UNKNOWN_FORMAT` — the record was sealed by a canonical format this verifier was not given, so
 *   it has not been checked. Not a tamper report: an unverifiable record is not a broken one.
 * - `MISSING_IDENTIFIER` — the format needs an identifier the record does not carry, so it was
 *   refused rather than run against `undefined`.
 *
 * Added because collapsing them into one prose string forced products to either lose the
 * distinction or match on an unversioned message. `reason` keeps its exact wording for every
 * existing caller; this is what new code should branch on.
 */
export type ChainBreakCode =
  'SEQUENCE_GAP' | 'LINK_MISMATCH' | 'DIGEST_MISMATCH' | 'UNKNOWN_FORMAT' | 'MISSING_IDENTIFIER';

export interface ChainVerification {
  readonly valid: boolean;
  /**
   * Sequence of the first record that does not match, in whatever representation it uses.
   *
   * This is the broken record's *position*. There is deliberately no second `brokenSequence`
   * field carrying the same number under another name: two names for one fact is how they come
   * to disagree.
   */
  readonly brokenAt?: AuditSequence;
  readonly reason?: string;
  /** How many records verified before the failure — or all of them, when `valid`. */
  readonly checked: number;

  /**
   * The failure, as a token to branch on. Present on every failure, absent when `valid`.
   *
   * Every field below is likewise absent on success, so `verifyChain(records)` on an intact chain
   * still returns exactly `{ valid: true, checked }` — the shape consumers deep-equal against.
   */
  readonly code?: ChainBreakCode;
  /**
   * The broken record's own identifier.
   *
   * A sequence says where in the walk it happened; an id is what an auditor looks up, what an
   * alert quotes and what an evidence bundle names. Both, because they answer different questions.
   */
  readonly brokenAtId?: string;
  /** `DIGEST_MISMATCH` only: the digest the record's own contents produce. */
  readonly expectedHash?: string;
  /** `DIGEST_MISMATCH` only: the digest stored on the record. */
  readonly actualHash?: string;
  /** `LINK_MISMATCH` only: the digest the preceding record — or `from` — established. */
  readonly expectedPreviousHash?: string | null;
  /** `LINK_MISMATCH` only: the digest the record claims to follow. */
  readonly actualPreviousHash?: string | null;
  /** `SEQUENCE_GAP` only: the position the record should have occupied. */
  readonly expectedSequence?: AuditSequence;
}

export interface VerifyChainOptions {
  /**
   * The formats this verification will accept. Defaults to format 1 only.
   *
   * A record sealed by a format that is not here fails verification rather than being skipped: a
   * verifier that cannot check a record has not established that it is intact, and reporting
   * "valid" for a chain it only partly read is exactly the false assurance the chain exists to
   * avoid.
   */
  readonly formats?: CanonicalFormatRegistry | readonly CanonicalFormat[];

  /**
   * The head this walk continues from. Absent — or `null` — means genesis, exactly as before.
   *
   * ## Why a whole-chain verifier was not enough
   *
   * A chain that has been running for years is not verified by loading it into memory. It is
   * verified in batches, resuming from where the last pass stopped, and the resume point is
   * *authenticated* — a signed checkpoint held outside the store, so that "start from sequence
   * 84,213 with digest 9c2f…" is a claim an attacker with database access cannot forge.
   *
   * Without this, such a walk had nowhere to put its resume point, and handing the verifier a
   * continuation batch produced `LINK_MISMATCH` on completely intact evidence — a *fabricated*
   * break rather than a missed one, raised nightly at the highest severity a compliance alert has.
   * That is worse than no verifier: it trains an operator to ignore the one alarm that must never
   * be ignored.
   *
   * ## Why one field and not two
   *
   * A resume point is a position *and* a digest, and supplying one without the other verifies half
   * the claim. Given only a hash, a record removed from the front of the batch is invisible —
   * every record present still chains to the one before it. Given only a sequence, a forged
   * leading record passes. `ChainHead` already carries both, and it is already what `AuditSealer`
   * receives on the append side; verification is the same problem from the other end and now has
   * the same shape.
   *
   * ## What it does not do
   *
   * It does not authenticate itself. The platform cannot know whether a head came from a signed
   * checkpoint or from the first row of the batch being verified — and taking it from the batch
   * would verify the batch against itself, which proves nothing. Signing the resume point is the
   * caller's, because the key that signs it must live somewhere the platform has no access to.
   */
  readonly from?: ChainHead | null;
}

/**
 * Recompute the chain over records in sequence order.
 *
 * What it detects: an altered record, a deleted record, a reordered record, and a record inserted
 * by anything that did not have the previous hash. What it cannot detect: a wholesale rewrite of
 * the entire chain by someone with write access to every row — which is what off-box export is for.
 *
 * Each record is re-hashed with the format that sealed *it*, read from `formatVersion`, so a chain
 * that spans a format change keeps verifying end to end. That is the property that makes changing
 * the format possible at all: without it, adopting a new format would either invalidate every
 * historical digest or require rewriting an append-only table.
 *
 * Pass `options.from` to continue a walk from a head established elsewhere — a signed checkpoint,
 * or the last record of the previous batch. There is one verification routine and `from` only
 * decides what it starts from, so an incremental pass and a whole-chain pass check identically.
 */
export function verifyChain(
  records: readonly AuditRecord<string>[],
  options: VerifyChainOptions = {},
): ChainVerification {
  const formats =
    options.formats === undefined
      ? DEFAULT_CANONICAL_FORMATS
      : options.formats instanceof CanonicalFormatRegistry
        ? options.formats
        : new CanonicalFormatRegistry(options.formats);

  // Genesis when absent or explicitly `null`. The two spell the same thing on purpose: a caller
  // holding an optional checkpoint writes `from: checkpoint ?? null` and gets genesis when it has
  // none, rather than discovering that the explicit form is subtly stricter than the omitted one.
  const from = options.from ?? null;
  let previousHash: string | null = from === null ? null : from.hash;
  // Null means "accept whatever position the first record carries", which is what a genesis walk
  // has always done — a chain may legitimately begin at 1, at 0, or wherever a product's store
  // starts counting. A resume point is different: it names the position, so the record after it is
  // known, and a record removed from the front of the batch becomes visible.
  let expected: AuditSequence | null = from === null ? null : nextSequence(from.sequence);
  let checked = 0;

  for (const record of records) {
    if (expected !== null && !sameSequence(record.sequence, expected)) {
      return {
        valid: false,
        ...where(record),
        code: 'SEQUENCE_GAP',
        reason: `expected sequence ${expected}, found ${record.sequence}`,
        expectedSequence: expected,
        checked,
      };
    }
    if (record.previousHash !== previousHash) {
      return {
        valid: false,
        ...where(record),
        code: 'LINK_MISMATCH',
        reason: 'previous hash does not match the preceding record',
        expectedPreviousHash: previousHash,
        actualPreviousHash: record.previousHash,
        checked,
      };
    }
    const version = formatVersionOf(record);
    const format = formats.get(version);
    if (format === undefined) {
      return {
        valid: false,
        ...where(record),
        code: 'UNKNOWN_FORMAT',
        reason: `unknown canonical format version ${version}`,
        checked,
      };
    }

    const identifiers = identifiersFor(format, record);
    // A format that needs an identifier and cannot be given one must not be run: hashing
    // `undefined` into the material yields a plausible digest and a tamper report indistinguishable
    // from a real one. Refusing is the honest answer.
    const missing = (format.requires ?? []).filter((field) => identifiers[field] === undefined);
    if (missing.length > 0) {
      return {
        valid: false,
        ...where(record),
        code: 'MISSING_IDENTIFIER',
        reason: `canonical format ${version} requires ${missing.join(', ')}, which this record does not carry`,
        checked,
      };
    }

    const recomputed = hashOf(format, {
      event: record.event,
      previousHash: record.previousHash,
      recordedAt: record.recordedAt,
      sequence: record.sequence,
      ...identifiers,
    });
    if (recomputed !== record.hash) {
      return {
        valid: false,
        ...where(record),
        code: 'DIGEST_MISMATCH',
        reason: 'record contents do not match its hash',
        // `expected` is what the record's own contents produce; `actual` is what it claims. A
        // report that named them the other way round would read as though the store were right and
        // the contents wrong, which is backwards — the contents are the evidence.
        expectedHash: recomputed,
        actualHash: record.hash,
        checked,
      };
    }
    previousHash = record.hash;
    expected = nextSequence(record.sequence);
    checked++;
  }

  // Deliberately the same two fields it has always been. Consumers deep-equal against this shape,
  // and a success carrying `code: undefined` would break every one of them.
  return { valid: true, checked };
}

/** Where a failure happened, in both the terms a walk uses and the terms an auditor does. */
function where(record: AuditRecord<string>): {
  readonly brokenAt: AuditSequence;
  readonly brokenAtId: string;
} {
  return { brokenAt: record.sequence, brokenAtId: record.id };
}
