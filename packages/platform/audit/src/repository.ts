import type {
  AuditQuery,
  AuditRecord,
  AuditRepositoryPort,
  AuditSinkPort,
  LoggerPort,
} from '@munaxa/interfaces';
import { assertSameTenant, type TenantId } from '@munaxa/types';
import { logSecurityEvent } from '@munaxa/logging';

/**
 * An in-memory audit repository.
 *
 * Real deployments write to a database, an append-only object store or a SIEM. This one exists
 * for tests, for local development, and as the reference implementation that defines what the
 * query semantics are supposed to be — including the tenant assertion on every read, which is
 * the part a hand-written repository is most likely to omit.
 */
export interface MemoryAuditRepositoryOptions {
  /** Oldest records are dropped past this bound so a long-running process cannot grow forever. */
  readonly maxRecords?: number;
}

export class MemoryAuditRepository implements AuditRepositoryPort {
  readonly #records: AuditRecord[] = [];
  readonly #maxRecords: number;

  constructor(options: MemoryAuditRepositoryOptions = {}) {
    this.#maxRecords = options.maxRecords ?? 100_000;
  }

  async write(record: AuditRecord): Promise<void> {
    this.#records.push(record);
    if (this.#records.length > this.#maxRecords) this.#records.shift();
  }

  async query(query: AuditQuery): Promise<{ items: readonly AuditRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
    const after = query.cursor ? Number.parseInt(query.cursor, 10) : undefined;

    const matched = this.#records.filter((record) => {
      const event = record.event;
      if (event.tenantId !== query.tenantId) return false;
      if (after !== undefined && record.sequence <= after) return false;
      if (query.from !== undefined && event.occurredAt < query.from) return false;
      if (query.to !== undefined && event.occurredAt > query.to) return false;
      if (query.names && !query.names.includes(event.name)) return false;
      if (query.actorId && event.actor?.id !== query.actorId) return false;
      if (query.targetId && event.target?.id !== query.targetId) return false;
      if (query.correlationId && event.correlationId !== query.correlationId) return false;
      return true;
    });

    const items = matched.slice(0, limit);
    const last = items.at(-1);
    return matched.length > limit && last
      ? { items, nextCursor: String(last.sequence) }
      : { items };
  }

  async latest(tenantId: TenantId): Promise<AuditRecord | undefined> {
    for (let i = this.#records.length - 1; i >= 0; i--) {
      const record = this.#records[i] as AuditRecord;
      if (record.event.tenantId === tenantId) return record;
    }
    return undefined;
  }

  /** Every record for a tenant, in sequence order. The input to `verifyChain`. */
  chain(tenantId: TenantId): readonly AuditRecord[] {
    return this.#records
      .filter((record) => record.event.tenantId === tenantId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  /** Read one record, refusing a cross-tenant read the way a real repository must. */
  get(tenantId: TenantId, id: string): AuditRecord | undefined {
    const record = this.#records.find((entry) => entry.id === id);
    if (!record) return undefined;
    assertSameTenant(tenantId, record.event.tenantId);
    return record;
  }

  get size(): number {
    return this.#records.length;
  }
}

/** Mirrors audit records into the structured log, so `grep` works during an incident. */
export class LoggingAuditSink implements AuditSinkPort {
  readonly #logger: LoggerPort;

  constructor(logger: LoggerPort) {
    this.#logger = logger;
  }

  async write(record: AuditRecord): Promise<void> {
    logSecurityEvent(this.#logger, record.event, { auditId: record.id, sequence: record.sequence });
  }
}

/**
 * Buffers records and writes them in batches.
 *
 * A per-event round trip to a remote sink adds its latency to every authenticated request.
 * Batching trades a bounded window of loss on a hard crash for that latency — an acceptable
 * trade for a mirror sink, never for the primary repository, which is why the durable store is
 * wired directly and only the exporters are batched.
 */
export class BatchingSink implements AuditSinkPort {
  readonly #inner: AuditSinkPort;
  readonly #maxBatch: number;
  #buffer: AuditRecord[] = [];

  constructor(inner: AuditSinkPort, maxBatch = 50) {
    this.#inner = inner;
    this.#maxBatch = maxBatch;
  }

  async write(record: AuditRecord): Promise<void> {
    this.#buffer.push(record);
    if (this.#buffer.length >= this.#maxBatch) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.#buffer.length === 0) return;
    const batch = this.#buffer;
    this.#buffer = [];
    for (const record of batch) await this.#inner.write(record);
    await this.#inner.flush?.();
  }

  get pending(): number {
    return this.#buffer.length;
  }
}
