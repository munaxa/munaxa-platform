import { createHash } from 'node:crypto';
import {
  isChainConflict,
  type AuditRecord,
  type AuditRepositoryPort,
  type AuditSinkPort,
  type AuditSealer,
  type ChainHead,
  type LoggerPort,
} from '@munaxa/interfaces';
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
}

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
  #failures = 0;
  #conflicts = 0;

  constructor(options: AuditServiceOptions) {
    this.#repository = options.repository;
    this.#sinks = options.sinks ?? [];
    this.#maxChainAttempts = options.maxChainAttempts ?? 5;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#suppress = new Set(options.suppress ?? []);
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
  async record(context: SecurityContext, input: AuditEventInput): Promise<AuditRecord | undefined> {
    return this.write(auditEvent(context, { occurredAt: this.#clock.now(), ...input }));
  }

  /** Record a pre-built event. Used by the edge, where there is no security context yet. */
  async write(event: SecurityEvent): Promise<AuditRecord | undefined> {
    if (this.#suppress.has(event.name) && !NON_SUPPRESSIBLE_EVENTS.has(event.name)) {
      return undefined;
    }

    const sanitized = this.#sanitize(event);
    const recordedAt = this.#clock.now();

    // The store decides the sequence, inside its own transaction. `seal` may be called more than
    // once — an optimistic adapter re-runs it after a conflict with the new head — so it is pure.
    const seal = (previous: ChainHead | null): AuditRecord => {
      const sequence = (previous?.sequence ?? 0) + 1;
      const previousHash = previous?.hash ?? null;
      const hash = hashOf(sanitized, previousHash, recordedAt, sequence);
      return {
        id: `aud_${sequence.toString(36)}_${hash.slice(0, 12)}`,
        event: sanitized,
        recordedAt,
        sequence,
        previousHash,
        hash,
      };
    };

    const record = await this.#appendWithRetry(event.tenantId, seal);

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
   */
  async #appendWithRetry(tenantId: TenantId, seal: AuditSealer): Promise<AuditRecord> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#repository.appendChained(tenantId, seal);
      } catch (error) {
        if (!isChainConflict(error) || attempt >= this.#maxChainAttempts) throw error;
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
 * The bytes that get hashed.
 *
 * Field order is fixed rather than taken from `Object.keys`, because a chain that depends on
 * property insertion order breaks the moment a record round-trips through a database.
 */
export function canonicalize(
  event: SecurityEvent,
  previousHash: string | null,
  recordedAt: number,
  sequence: number,
): string {
  return JSON.stringify([
    sequence,
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
}

function hashOf(
  event: SecurityEvent,
  previousHash: string | null,
  recordedAt: number,
  sequence: number,
): string {
  return createHash('sha256')
    .update(canonicalize(event, previousHash, recordedAt, sequence))
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

export interface ChainVerification {
  readonly valid: boolean;
  /** Sequence number of the first record that does not match. */
  readonly brokenAt?: number;
  readonly reason?: string;
  readonly checked: number;
}

/**
 * Recompute the chain over records in sequence order.
 *
 * What it detects: an altered record, a deleted record, a reordered record, and a record inserted
 * by anything that did not have the previous hash. What it cannot detect: a wholesale rewrite of
 * the entire chain by someone with write access to every row — which is what off-box export is for.
 */
export function verifyChain(records: readonly AuditRecord[]): ChainVerification {
  let previousHash: string | null = null;
  let expectedSequence: number | null = null;

  for (const record of records) {
    if (expectedSequence !== null && record.sequence !== expectedSequence) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: `expected sequence ${expectedSequence}, found ${record.sequence}`,
        checked: expectedSequence - 1,
      };
    }
    if (record.previousHash !== previousHash) {
      return {
        valid: false,
        brokenAt: record.sequence,
        reason: 'previous hash does not match the preceding record',
        checked: record.sequence - 1,
      };
    }
    const recomputed = hashOf(
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
        checked: record.sequence - 1,
      };
    }
    previousHash = record.hash;
    expectedSequence = record.sequence + 1;
  }

  return { valid: true, checked: records.length };
}
