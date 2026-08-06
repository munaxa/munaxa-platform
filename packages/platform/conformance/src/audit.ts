import type { AuditRecord, AuditRepositoryPort, ChainHead } from '@munaxa/interfaces';
import { isChainConflict } from '@munaxa/interfaces';
import type { SecurityEvent, TenantId } from '@munaxa/types';
import { Seeded, race, tick, type TestHarness } from './harness.js';

/**
 * `AuditRepositoryPort` conformance.
 *
 * One question, asked several ways: does `appendChained` serialise per tenant? An adapter that
 * answers no produces a chain that `verifyChain` rejects, and a rejected chain is not a warning —
 * it is the tamper alarm firing for a benign reason, which is how an operator learns to ignore it.
 *
 * Both adapter strategies pass: serialise the append (`SELECT … FOR UPDATE`, `BEGIN IMMEDIATE`),
 * or let writers race and raise `ChainConflictError` on the unique-index violation.
 */
export interface AuditConformanceOptions {
  createRepository(): AuditRepositoryPort | Promise<AuditRepositoryPort>;
  /** Records for a tenant, in sequence order. Usually a thin wrapper over `query`. */
  readChain(repository: AuditRepositoryPort, tenantId: TenantId): Promise<readonly AuditRecord[]>;
  /** Recompute and check the chain. Pass `verifyChain` from `@munaxa/audit`. */
  verifyChain(records: readonly AuditRecord[]): { valid: boolean; reason?: string };
  /** Build the record a sealer returns. Pass the platform's sealer factory. */
  seal(event: SecurityEvent, previous: ChainHead | null, recordedAt: number): AuditRecord;
  makeEvent(tenantId: TenantId, index: number): SecurityEvent;
  concurrency?: number;
}

export function runAuditConformance(harness: TestHarness, options: AuditConformanceOptions): void {
  const { describe, it, expect } = harness;
  const concurrency = options.concurrency ?? 40;
  const tenantA = 'conformance-a' as TenantId;
  const tenantB = 'conformance-b' as TenantId;

  /** Append with the same retry policy `AuditService` uses, so optimistic adapters pass. */
  const append = async (
    repository: AuditRepositoryPort,
    tenantId: TenantId,
    index: number,
  ): Promise<AuditRecord> => {
    const event = options.makeEvent(tenantId, index);
    for (let attempt = 1; ; attempt++) {
      try {
        return await repository.appendChained(tenantId, (previous) =>
          options.seal(event, previous, 1_700_000_000_000 + index),
        );
      } catch (error) {
        if (!isChainConflict(error) || attempt >= 20) throw error;
      }
    }
  };

  describe('AuditRepositoryPort conformance', () => {
    it('produces a valid chain for sequential appends', async () => {
      const repository = await options.createRepository();
      for (let i = 0; i < 10; i++) await append(repository, tenantA, i);

      const chain = await options.readChain(repository, tenantA);
      expect(chain).toHaveLength(10);
      expect(options.verifyChain(chain).valid).toBe(true);
    });

    it('numbers sequences from 1, consecutively', async () => {
      const repository = await options.createRepository();
      for (let i = 0; i < 5; i++) await append(repository, tenantA, i);

      const chain = await options.readChain(repository, tenantA);
      expect(chain.map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5]);
      expect(chain[0]?.previousHash).toBe(null);
    });

    it('produces a valid chain under concurrent appends', async () => {
      // The test 1.0 did not have. Every replica in a deployment is one of these callers.
      const repository = await options.createRepository();
      await race(concurrency, (i) => append(repository, tenantA, i));

      const chain = await options.readChain(repository, tenantA);
      const verification = options.verifyChain(chain);

      expect(chain).toHaveLength(concurrency);
      expect(verification.reason ?? 'valid').toBe('valid');
      expect(verification.valid).toBe(true);
    });

    it('allocates every sequence number exactly once under concurrency', async () => {
      const repository = await options.createRepository();
      await race(concurrency, (i) => append(repository, tenantA, i));

      const sequences = (await options.readChain(repository, tenantA)).map((r) => r.sequence);
      expect(new Set(sequences).size).toBe(concurrency);
      expect(Math.max(...sequences)).toBe(concurrency);
    });

    it('keeps tenant chains independent', async () => {
      // One tenant's volume must not shift another's numbering, and a busy tenant must not be
      // able to break a quiet one's chain.
      const repository = await options.createRepository();
      const seeded = new Seeded(7);
      const work = [
        ...Array.from({ length: 20 }, (_, i) => () => append(repository, tenantA, i)),
        ...Array.from({ length: 20 }, (_, i) => () => append(repository, tenantB, i)),
      ];
      await Promise.all(seeded.shuffle(work).map((run) => run()));

      for (const tenantId of [tenantA, tenantB]) {
        const chain = await options.readChain(repository, tenantId);
        expect(chain).toHaveLength(20);
        expect(options.verifyChain(chain).valid).toBe(true);
      }
    });

    it('holds up with jitter between the read and the write', async () => {
      // Simulates the latency a networked store actually has. An adapter that is only atomic
      // because nothing yields inside it fails here.
      const repository = await options.createRepository();
      const seeded = new Seeded(11);
      await Promise.all(
        Array.from({ length: 25 }, async (_unused, i) => {
          await seeded.delay(4);
          return append(repository, tenantA, i);
        }),
      );

      expect(options.verifyChain(await options.readChain(repository, tenantA)).valid).toBe(true);
    });

    it('survives a writer that fails mid-flight', async () => {
      // A crashed replica must not leave a gap that invalidates every later record.
      const repository = await options.createRepository();
      await append(repository, tenantA, 0);

      await repository
        .appendChained(tenantA, () => {
          throw new Error('replica died while sealing');
        })
        .catch(() => undefined);

      await tick();
      await append(repository, tenantA, 1);

      const chain = await options.readChain(repository, tenantA);
      expect(chain).toHaveLength(2);
      expect(options.verifyChain(chain).valid).toBe(true);
    });
  });
}
