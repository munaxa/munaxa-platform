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

export interface AuditRepositoryPort extends AuditSinkPort {
  query(query: AuditQuery): Promise<{ items: readonly AuditRecord[]; nextCursor?: string }>;
  /** The last record written for a tenant, used to continue the hash chain after a restart. */
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

/**
 * Fire-and-forget domain events.
 *
 * The platform publishes; products decide whether that means an in-process emitter, a queue or
 * an outbox table. Publishing must never throw into the caller's happy path — a broken bus is
 * not a reason to fail a login — so implementations swallow and log their own transport errors.
 */
export interface EventPublisherPort {
  publish(event: SecurityEvent): Promise<void>;
}

export interface EventSubscriberPort {
  subscribe(name: string | '*', handler: (event: SecurityEvent) => void | Promise<void>): () => void;
}

/** Timing and counter instrumentation, kept separate from logs so metrics stay cheap. */
export interface MetricsPort {
  increment(name: string, value?: number, tags?: Readonly<Record<string, string>>): void;
  observe(name: string, value: number, tags?: Readonly<Record<string, string>>): void;
}
