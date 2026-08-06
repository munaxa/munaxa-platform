import { createHash } from 'node:crypto';
import type { AuditRecord, AuditSinkPort, LoggerPort } from '@munaxa/interfaces';
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
 * - **Hash-chained.** Each record's hash covers the record *and* the previous hash. Removing or
 *   editing a record breaks the chain from that point on, and `verifyChain` finds where. This is
 *   tamper *evidence*: someone with write access can rebuild the chain, which is precisely why
 *   exporters ship records off-box, where they cannot.
 * - **Non-blocking on the happy path, by policy.** A sink that fails must not fail a login — but
 *   silence is unacceptable too, so failures are reported through `onSinkError` and counted.
 * - **Closed vocabulary.** Only names from `SECURITY_EVENTS` are accepted, so one query works
 *   across every product.
 */
export interface AuditServiceOptions {
  readonly sinks: readonly AuditSinkPort[];
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
  readonly #sinks: readonly AuditSinkPort[];
  readonly #clock: Clock;
  readonly #logger: LoggerPort | undefined;
  readonly #suppress: ReadonlySet<SecurityEventName>;
  readonly #onSinkError: NonNullable<AuditServiceOptions['onSinkError']>;
  readonly #stripped: ReadonlySet<string>;
  /** Per-tenant chain heads. Seeded from the repository on first use via `resume`. */
  readonly #heads = new Map<TenantId, { hash: string; sequence: number }>();
  #failures = 0;

  constructor(options: AuditServiceOptions) {
    this.#sinks = options.sinks;
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
   * Continue an existing chain after a restart.
   *
   * Without this, every process restart begins a new chain and `verifyChain` reports a break at
   * each deploy. Call it at startup with the repository's last record per active tenant.
   */
  resume(tenantId: TenantId, last: AuditRecord | undefined): void {
    if (last) this.#heads.set(tenantId, { hash: last.hash, sequence: last.sequence });
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

    const head = this.#heads.get(event.tenantId);
    const sanitized = this.#sanitize(event);
    const sequence = (head?.sequence ?? 0) + 1;
    const previousHash = head?.hash ?? null;
    const recordedAt = this.#clock.now();
    const id = `aud_${sequence.toString(36)}_${hashOf(sanitized, previousHash, recordedAt, sequence).slice(0, 12)}`;

    const record: AuditRecord = {
      id,
      event: sanitized,
      recordedAt,
      sequence,
      previousHash,
      hash: hashOf(sanitized, previousHash, recordedAt, sequence),
    };

    this.#heads.set(event.tenantId, { hash: record.hash, sequence });

    // Sinks run in parallel and independently: a broken SIEM webhook must not stop the durable
    // repository write, and neither must stop the request that produced the event.
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

  async flush(): Promise<void> {
    await Promise.all(this.#sinks.map((sink) => sink.flush?.()));
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
    const recomputed = hashOf(record.event, record.previousHash, record.recordedAt, record.sequence);
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
