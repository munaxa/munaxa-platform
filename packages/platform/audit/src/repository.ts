import type {
  AuditAppendOptions,
  AuditQuery,
  AuditSequence,
  AuditRecord,
  AuditRepositoryPort,
  AuditSealer,
  AuditSinkPort,
  ChainHead,
  LoggerPort,
} from '@munaxa/interfaces';
import { assertSameTenant, PlatformError, type TenantId } from '@munaxa/types';
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
  /**
   * One promise chain per tenant — this process's equivalent of `SELECT … FOR UPDATE`.
   *
   * Node is single-threaded but not single-*task*: `await` inside an append is a yield point, and
   * without this two interleaved appends would read the same head. A real adapter serialises in
   * the database; this serialises in the event loop, and the conformance suite cannot tell the
   * difference, which is the point.
   */
  readonly #appendLocks = new Map<TenantId, Promise<unknown>>();

  constructor(options: MemoryAuditRepositoryOptions = {}) {
    this.#maxRecords = options.maxRecords ?? 100_000;
  }

  async write(record: AuditRecord): Promise<void> {
    this.#records.push(record);
    if (this.#records.length > this.#maxRecords) this.#records.shift();
  }

  /**
   * There is no transaction to join: this store commits by pushing onto an array, so nothing it
   * could do would make a record roll back with the caller's work. Saying so is the honest
   * answer — an in-memory store that accepted a transaction handle and ignored it would let a
   * product's tests pass on a guarantee its production adapter is the only thing that provides.
   */
  readonly joinsTransactions = false;

  async appendChained(
    tenantId: TenantId,
    seal: AuditSealer,
    options: AuditAppendOptions = {},
  ): Promise<AuditRecord> {
    if (options.transaction !== undefined) {
      throw new PlatformError(
        'MemoryAuditRepository cannot join an external transaction; use a database-backed adapter',
        { code: 'CONFIG_INVALID' },
      );
    }
    const previous = this.#appendLocks.get(tenantId) ?? Promise.resolve();
    const next = previous.then(
      () => this.#append(tenantId, seal),
      () => this.#append(tenantId, seal),
    );
    // Keep the chain going even when an append throws, and never leak a rejected promise.
    this.#appendLocks.set(
      tenantId,
      next.catch(() => undefined),
    );
    return next;
  }

  #append(tenantId: TenantId, seal: AuditSealer): AuditRecord {
    const head = this.#headOf(tenantId);
    const record = seal(head);
    this.#records.push(record);
    if (this.#records.length > this.#maxRecords) this.#records.shift();
    return record;
  }

  #headOf(tenantId: TenantId): ChainHead | null {
    for (let i = this.#records.length - 1; i >= 0; i--) {
      const record = this.#records[i];
      if (record?.event.tenantId === tenantId) {
        return { sequence: record.sequence, hash: record.hash };
      }
    }
    return null;
  }

  async query(query: AuditQuery): Promise<{ items: readonly AuditRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
    // The cursor is the last sequence seen, as decimal digits. Parsed as a bigint rather than a
    // number so a cursor past 2^53 addresses the record it names instead of one nearby.
    const after = query.cursor ? BigInt(query.cursor) : undefined;

    const matched = this.#records.filter((record) => {
      const event = record.event;
      if (event.tenantId !== query.tenantId) return false;
      if (after !== undefined && BigInt(record.sequence) <= after) return false;
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
      const record = this.#records[i];
      if (record?.event.tenantId === tenantId) return record;
    }
    return undefined;
  }

  /** Every record for a tenant, in sequence order. The input to `verifyChain`. */
  chain(tenantId: TenantId): readonly AuditRecord[] {
    return this.#records
      .filter((record) => record.event.tenantId === tenantId)
      .sort((a, b) => compareSequences(a.sequence, b.sequence));
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

/**
 * Order two chain positions, whichever representation each uses.
 *
 * Subtraction is not an option: `bigint - bigint` is a bigint, which `Array.sort` cannot use, and
 * mixing the two throws. Comparison operators are the one place the two representations do agree.
 */
export function compareSequences(a: AuditSequence, b: AuditSequence): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Mirrors audit records into the structured log, so `grep` works during an incident. */
export class LoggingAuditSink implements AuditSinkPort {
  readonly #logger: LoggerPort;

  constructor(logger: LoggerPort) {
    this.#logger = logger;
  }

  async write(record: AuditRecord): Promise<void> {
    logSecurityEvent(this.#logger, record.event, {
      auditId: record.id,
      // A bigint has no JSON representation and throws inside `JSON.stringify`, which would turn a
      // mirror-sink write into a thrown error on the request path. Number sequences keep their
      // existing shape, so no log consumer's parser changes.
      sequence: typeof record.sequence === 'bigint' ? record.sequence.toString() : record.sequence,
    });
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
