/**
 * The vocabulary every port uses to state what it guarantees under concurrency.
 *
 * Platform 2.0 exists because the 1.0 ports said what a method *did* and never what it guaranteed
 * when two replicas called it at the same moment. An application implementing `SessionStorePort`
 * had no way to know that `create` needed to be atomic with respect to a count, so it wrote the
 * obvious insert and the concurrency limit quietly stopped working.
 *
 * Every port method in this package now carries an `@atomicity`, `@consistency` and `@idempotency`
 * note. These types give those notes a shape an adapter author can check themselves against, and
 * `@munaxa/conformance` turns them into tests.
 */

import type { AuditSequence } from './observability.js';

/**
 * What an operation promises when two callers race.
 *
 * - `none` — read-only, or a write where a lost update is acceptable. Caching and metrics.
 * - `atomic` — the operation is indivisible: it either happens completely or not at all, and
 *   concurrent callers never observe a half-state. A single `INSERT`, a Redis `INCR`.
 * - `compare-and-swap` — the operation succeeds only if the record is still in the state the
 *   caller expects, and reports which way it went. `UPDATE … WHERE rotated_at IS NULL` plus a
 *   check of the affected row count.
 * - `serialised` — the store orders concurrent calls for the same key and runs them one at a
 *   time. `SELECT … FOR UPDATE`, `BEGIN IMMEDIATE`, or a lock held for the duration.
 */
export type AtomicityGuarantee = 'none' | 'atomic' | 'compare-and-swap' | 'serialised';

/**
 * What a reader may observe after a write completes.
 *
 * - `eventual` — a read may return a stale value for a bounded but unspecified time. Correct for
 *   caches; never correct for a revocation check.
 * - `read-your-writes` — the writer sees its own write immediately; other replicas may lag.
 * - `linearizable` — every replica observes writes in one order, immediately. What a security
 *   decision needs.
 */
export type ConsistencyGuarantee = 'eventual' | 'read-your-writes' | 'linearizable';

/**
 * Whether repeating a call is safe.
 *
 * This is not academic: every distributed system retries, and a retry after a timeout cannot know
 * whether the first attempt landed. An operation that is `at-most-once` must never be retried
 * blindly, and the platform does not retry those.
 */
export type IdempotencyGuarantee = 'idempotent' | 'at-most-once' | 'at-least-once';

/** The full contract a port method states. */
export interface OperationContract {
  readonly atomicity: AtomicityGuarantee;
  readonly consistency: ConsistencyGuarantee;
  readonly idempotency: IdempotencyGuarantee;
  /** True when the platform may retry this call itself after a transport failure. */
  readonly retryable: boolean;
}

/**
 * Raised by a store when an optimistic append lost its race.
 *
 * An adapter has two legitimate strategies for the audit chain, and this error is what makes the
 * second one work:
 *
 *  1. **Pessimistic** — serialise appends per tenant (`SELECT … FOR UPDATE`, `BEGIN IMMEDIATE`,
 *     a lock). The sealer sees the true head and never conflicts.
 *  2. **Optimistic** — let both writers try, and rely on a unique index on
 *     `(tenant_id, sequence)`. The loser's insert violates the constraint; the adapter translates
 *     that into this error, and `AuditService` retries with the new head.
 *
 * Postgres and MySQL suit the first; D1, SQLite under WAL and most document stores suit the
 * second. Either passes the conformance suite.
 */
export class ChainConflictError extends Error {
  constructor(
    readonly tenantId: string,
    readonly attemptedSequence: AuditSequence,
    options?: { cause?: unknown },
  ) {
    super(
      `Audit chain conflict at sequence ${attemptedSequence} for tenant ${tenantId}: another writer appended first`,
      options,
    );
    this.name = 'ChainConflictError';
  }
}

export function isChainConflict(error: unknown): error is ChainConflictError {
  return error instanceof ChainConflictError;
}

/**
 * Raised when a store cannot honour a guarantee the platform depends on.
 *
 * Better than silently degrading: an adapter that cannot serialise a session count should say so
 * at wiring time, so the product wires a `LockPort` instead of discovering the gap in production.
 */
export class UnsupportedGuaranteeError extends Error {
  constructor(
    readonly port: string,
    readonly operation: string,
    readonly required: AtomicityGuarantee,
  ) {
    super(
      `${port}.${operation} requires ${required} atomicity, which this adapter does not provide. ` +
        'Supply an adapter that does, or wire a LockPort so the platform can serialise it.',
    );
    this.name = 'UnsupportedGuaranteeError';
  }
}
