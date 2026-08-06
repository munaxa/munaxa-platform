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
/**
 * A chain position.
 *
 * `number` was the original type and remains valid — every existing record and every existing
 * adapter keeps working. `bigint` is accepted because a product whose audit table has run for
 * years on a `bigserial` cannot represent its sequence in a double once it passes 2^53, and
 * silently losing precision on the column that proves nothing was removed from the end of the
 * chain is not a trade worth making.
 *
 * Compare with `sameSequence` and advance with `nextSequence` rather than `===` and `+ 1`, which
 * are wrong across the two representations: `1 === 1n` is false.
 */
export type AuditSequence = number | bigint;

export interface AuditRecord {
  readonly id: string;
  readonly event: SecurityEvent;
  readonly recordedAt: number;
  readonly sequence: AuditSequence;
  readonly hash: string;
  readonly previousHash: string | null;
  /**
   * Which canonical format produced `hash`.
   *
   * Absent means format 1 — the only format that existed before this field, so every record
   * written by Platform 2.0.0 verifies unchanged without being rewritten. That is the whole point:
   * an audit table that refuses `UPDATE` cannot be back-filled, so the format has to be
   * discoverable from the row rather than assumed by the verifier.
   */
  readonly formatVersion?: number;
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
  readonly sequence: AuditSequence;
  readonly hash: string;
}

/** True when two sequences denote the same position, whichever representation each uses. */
export function sameSequence(a: AuditSequence, b: AuditSequence): boolean {
  return typeof a === typeof b ? a === b : BigInt(a) === BigInt(b);
}

/** The position after `sequence`, preserving its representation. */
export function nextSequence(sequence: AuditSequence): AuditSequence {
  return typeof sequence === 'bigint' ? sequence + 1n : sequence + 1;
}

/**
 * Turns the store's view of the head into the record to persist.
 *
 * The store owns *ordering*; the platform owns *hashing*. Splitting it this way is what lets one
 * adapter serialise with `SELECT … FOR UPDATE` and another rely on a unique index and a retry,
 * without either of them needing to know how a record is canonicalised.
 */
export type AuditSealer = (previous: ChainHead | null) => AuditRecord;

/** How an append should relate to the caller's own unit of work. */
export interface AuditAppendOptions {
  /**
   * A transaction handle owned by the caller, to append inside.
   *
   * Deliberately `unknown`: the platform must not depend on Prisma, Knex, `pg` or any other client
   * to express "use mine". The adapter narrows it, and an adapter that receives a handle it does
   * not recognise must throw rather than quietly opening its own transaction — an append that
   * silently escapes the caller's transaction produces an audit record for a business change that
   * was then rolled back, which is evidence of something that never happened.
   *
   * Adapters that cannot join an external transaction must throw when this is set, and advertise
   * that by leaving `joinsTransactions` false. Callers can then decide between recording after
   * commit and refusing to proceed, rather than finding out from a corrupted trail.
   */
  readonly transaction?: unknown;
}

export interface AuditRepositoryPort extends AuditSinkPort {
  /**
   * Whether `appendChained` honours `options.transaction`.
   *
   * Absent means false — the assumption that keeps a 2.0.0 adapter correct, since none of them
   * accepted a transaction.
   */
  readonly joinsTransactions?: boolean;

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
   * When `options.transaction` is supplied the append must join that transaction instead of
   * opening its own, so the record commits with the change it describes or not at all. Note what
   * this costs: the head read and the insert are now inside the caller's transaction, so chain
   * contention becomes the caller's contention, and a long-running business transaction serialises
   * that tenant's audit writes behind it.
   *
   * @atomicity serialised — or `compare-and-swap` with ChainConflictError
   * @consistency linearizable per tenant
   * @idempotency at-most-once — the platform retries only on ChainConflictError, never on a
   *   transport failure, because a timed-out append may have committed. An append that joined the
   *   caller's transaction must not be retried by the platform at all: the conflict aborts that
   *   transaction, and retrying inside an aborted transaction cannot succeed.
   */
  appendChained(
    tenantId: TenantId,
    seal: AuditSealer,
    options?: AuditAppendOptions,
  ): Promise<AuditRecord>;

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
