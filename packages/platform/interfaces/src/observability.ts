import type { CorrelationId, SecurityEvent, TenantId } from '@munaxa/types';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LOG_LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export type LogFields = Readonly<Record<string, unknown>>;

/**
 * The logging seam.
 *
 * Products that already run pino, winston or a cloud logger implement this in a few lines and
 * keep their pipeline; the platform never writes to stdout behind their back.
 */
export interface LoggerPort {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  /** Return a logger with these fields merged into every subsequent line. */
  child(bindings: LogFields): LoggerPort;
  isLevelEnabled(level: LogLevel): boolean;
}

/** Where audit records go once written. A product may fan out to several. */
export interface AuditSinkPort {
  /**
   * Accept an already-sealed record. Sinks are mirrors: a failure here is reported, never fatal.
   *
   * @atomicity none
   * @consistency eventual
   * @idempotency idempotent — a sink may receive the same record twice after a retry and must
   *   tolerate it (dedupe on `id`)
   */
  write(record: AuditRecord): Promise<void>;
  /** Best-effort flush before shutdown. */
  flush?(): Promise<void>;
}

/**
 * A written audit record.
 *
 * `hash` and `previousHash` form a per-tenant chain: recomputing the chain detects any record
 * that was altered or removed after the fact. That is tamper *evidence*, not tamper prevention —
 * an attacker with write access to the store can rewrite the whole chain, which is why exporters
 * ship records off-box.
 */
export interface AuditRecord {
  readonly id: string;
  readonly event: SecurityEvent;
  readonly recordedAt: number;
  readonly sequence: number;
  readonly hash: string;
  readonly previousHash: string | null;
}

export interface AuditQuery {
  readonly tenantId: TenantId;
  readonly from?: number;
  readonly to?: number;
  readonly names?: readonly string[];
  readonly actorId?: string;
  readonly targetId?: string;
  readonly correlationId?: CorrelationId;
  readonly limit?: number;
  readonly cursor?: string;
}

/** The tail of a tenant's chain, as the store knows it. */
export interface ChainHead {
  readonly sequence: number;
  readonly hash: string;
}

/**
 * Turns the store's view of the head into the record to persist.
 *
 * The store owns *ordering*; the platform owns *hashing*. Splitting it this way is what lets one
 * adapter serialise with `SELECT … FOR UPDATE` and another rely on a unique index and a retry,
 * without either of them needing to know how a record is canonicalised.
 */
export type AuditSealer = (previous: ChainHead | null) => AuditRecord;

export interface AuditRepositoryPort extends AuditSinkPort {
  /**
   * Append to the tenant's chain, atomically.
   *
   * The adapter must, in one transaction: read the tenant's current head, call `seal` with it,
   * and persist exactly what `seal` returns. Two concurrent appends for one tenant must produce
   * consecutive sequence numbers and a chain where each `previousHash` equals its predecessor's
   * `hash` — on any number of replicas.
   *
   * An adapter that cannot serialise may instead let both writers race and translate a unique
   * constraint violation on `(tenantId, sequence)` into `ChainConflictError`; `AuditService`
   * retries. Both strategies pass the conformance suite; see `ChainConflictError`.
   *
   * `seal` is pure and cheap (one SHA-256) and must be called inside the transaction.
   *
   * @atomicity serialised — or `compare-and-swap` with ChainConflictError
   * @consistency linearizable per tenant
   * @idempotency at-most-once — the platform retries only on ChainConflictError, never on a
   *   transport failure, because a timed-out append may have committed
   */
  appendChained(tenantId: TenantId, seal: AuditSealer): Promise<AuditRecord>;

  /**
   * @atomicity none
   * @consistency read-your-writes
   * @idempotency idempotent
   */
  query(query: AuditQuery): Promise<{ items: readonly AuditRecord[]; nextCursor?: string }>;

  /**
   * The last record written for a tenant. Diagnostic only in 2.0 — sequencing is `appendChained`'s
   * job now, and a head read outside a transaction is stale the moment it returns.
   *
   * @atomicity none
   * @consistency read-your-writes
   * @idempotency idempotent
   */
  latest(tenantId: TenantId): Promise<AuditRecord | undefined>;
}

/** Serialises audit records for an external consumer (SIEM, object storage, a compliance export). */
export interface AuditExporterPort {
  readonly name: string;
  export(records: AsyncIterable<AuditRecord> | Iterable<AuditRecord>): Promise<ExportResult>;
}

export interface ExportResult {
  readonly recordCount: number;
  readonly bytes?: number;
  readonly location?: string;
}

/** Timing and counter instrumentation, kept separate from logs so metrics stay cheap. */
export interface MetricsPort {
  increment(name: string, value?: number, tags?: Readonly<Record<string, string>>): void;
  observe(name: string, value: number, tags?: Readonly<Record<string, string>>): void;
}
