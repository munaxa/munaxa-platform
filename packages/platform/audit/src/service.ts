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
export interface AuditServiceOptions {
  /**
   * The durable, chain-owning store. Required: without it there is no ordering authority, and a
   * hash chain without one is decoration.
   */
  readonly repository: AuditRepositoryPort;
  /** Mirrors — logs, a SIEM, an exporter. Failures here are reported, never fatal. */
  readonly sinks?: readonly AuditSinkPort[];
  /** Attempts when the repository reports a `ChainConflictError`. Default 5. */
  readonly maxChainAttempts?: number;
  readonly clock?: Clock;
  readonly logger?: LoggerPort;
  /**
   * Events to skip. `NON_SUPPRESSIBLE_EVENTS` are recorded regardless — a product may quieten
   * routine noise, not the events an incident review depends on.
   */
  readonly suppress?: readonly SecurityEventName[];
  /** Called when a sink throws. Default: log at error level. */
  readonly onSinkError?: (error: unknown, record: AuditRecord, sink: AuditSinkPort) => void;
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

export class AuditService {
  readonly #repository: AuditRepositoryPort;
  readonly #sinks: readonly AuditSinkPort[];
  readonly #maxChainAttempts: number;
  readonly #clock: Clock;
  readonly #logger: LoggerPort | undefined;
  readonly #suppress: ReadonlySet<SecurityEventName>;
  readonly #onSinkError: NonNullable<AuditServiceOptions['onSinkError']>;
  readonly #stripped: ReadonlySet<string>;
  readonly #format: CanonicalFormat;
  #failures = 0;
  #conflicts = 0;

  constructor(options: AuditServiceOptions) {
    this.#repository = options.repository;
    this.#sinks = options.sinks ?? [];
    this.#maxChainAttempts = options.maxChainAttempts ?? 5;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#suppress = new Set(options.suppress ?? []);
    this.#format = options.canonicalFormat ?? CURRENT_CANONICAL_FORMAT;
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
    context: SecurityContext,
    input: AuditEventInput,
    options: AuditWriteOptions = {},
  ): Promise<AuditRecord | undefined> {
    return this.write(auditEvent(context, { occurredAt: this.#clock.now(), ...input }), options);
  }

  /**
   * Record a pre-built event. Used by the edge, where there is no security context yet.
   *
   * Pass `options.transaction` to append inside the caller's unit of work, so the record commits
   * with the change it describes. The repository must support it; see `AuditAppendOptions`.
   */
  async write(
    event: SecurityEvent,
    options: AuditWriteOptions = {},
  ): Promise<AuditRecord | undefined> {
    if (this.#suppress.has(event.name) && !NON_SUPPRESSIBLE_EVENTS.has(event.name)) {
      return undefined;
    }

    const sanitized = this.#sanitize(event);
    const recordedAt = this.#clock.now();
    const format = this.#format;

    // The store decides the sequence, inside its own transaction. `seal` may be called more than
    // once — an optimistic adapter re-runs it after a conflict with the new head — so it is pure.
    const seal = (previous: ChainHead | null): AuditRecord => {
      // `nextSequence` rather than `+ 1`: a store whose sequence is a `bigserial` hands back a
      // bigint, and `1n + 1` is a TypeError rather than 2.
      const sequence: AuditSequence = previous === null ? 1 : nextSequence(previous.sequence);
      const previousHash = previous?.hash ?? null;
      const hash = hashOf(format, sanitized, previousHash, recordedAt, sequence);
      return {
        id: `aud_${toBase36(sequence)}_${hash.slice(0, 12)}`,
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
    seal: AuditSealer,
    options: AuditAppendOptions,
  ): Promise<AuditRecord> {
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

  #sanitize(event: SecurityEvent): SecurityEvent {
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
  event: SecurityEvent,
  previousHash: string | null,
  recordedAt: number,
  sequence: AuditSequence,
): string {
  return CANONICAL_FORMAT_V1.canonicalize({ event, previousHash, recordedAt, sequence });
}

function hashOf(
  format: CanonicalFormat,
  event: SecurityEvent,
  previousHash: string | null,
  recordedAt: number,
  sequence: AuditSequence,
): string {
  return createHash('sha256')
    .update(format.canonicalize({ event, previousHash, recordedAt, sequence }))
    .digest('hex');
}

function toBase36(sequence: AuditSequence): string {
  return sequence.toString(36);
}

export interface ChainVerification {
  readonly valid: boolean;
  /** Sequence of the first record that does not match, in whatever representation it uses. */
  readonly brokenAt?: AuditSequence;
  readonly reason?: string;
  /** How many records verified before the failure — or all of them, when `valid`. */
  readonly checked: number;
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
 */
export function verifyChain(
  records: readonly AuditRecord[],
  options: VerifyChainOptions = {},
): ChainVerification {
  const formats =
    options.formats === undefined
      ? DEFAULT_CANONICAL_FORMATS
      : options.formats instanceof CanonicalFormatRegistry
        ? options.formats
        : new CanonicalFormatRegistry(options.formats);

  let previousHash: string | null = null;
  let expected: AuditSequence | null = null;
  let checked = 0;

  for (const record of records) {
    if (expected !== null && !sameSequence(record.sequence, expected)) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: `expected sequence ${expected}, found ${record.sequence}`,
        checked,
      };
    }
    if (record.previousHash !== previousHash) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: 'previous hash does not match the preceding record',
        checked,
      };
    }
    const version = formatVersionOf(record);
    const format = formats.get(version);
    if (format === undefined) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: `unknown canonical format version ${version}`,
        checked,
      };
    }
    const recomputed = hashOf(
      format,
      record.event,
      record.previousHash,
      record.recordedAt,
      record.sequence,
    );
    if (recomputed !== record.hash) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: 'record contents do not match its hash',
        checked,
      };
    }
    previousHash = record.hash;
    expected = nextSequence(record.sequence);
    checked++;
  }

  return { valid: true, checked };
}
