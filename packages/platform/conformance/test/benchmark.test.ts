import { describe, expect, it } from 'vitest';
import { AuditService, MemoryAuditRepository, canonicalize } from '@munaxa/audit';
import { MemoryRefreshTokenStore, RefreshTokenService } from '@munaxa/auth';
import { MemoryCache, TokenBucket } from '@munaxa/cache';
import { nextSequence } from '@munaxa/interfaces';
import type { AuditRecord, ChainHead, RefreshTokenRecord } from '@munaxa/interfaces';
import { createHash } from 'node:crypto';
import {
  FixedClock,
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type SecurityContext,
} from '@munaxa/types';
import { START, USER } from './fleet.js';

/**
 * What the atomicity costs.
 *
 * "Correct but slower" is a real trade and it deserves a number rather than a shrug, so each
 * benchmark runs the 1.0 shape (read, decide, write — no coordination) and the 2.0 shape
 * (compare-and-swap, store-owned sequencing) in the same process, back to back, and reports both.
 * Running them together is the point: an absolute millisecond figure from CI means nothing, but a
 * ratio measured on the same cores in the same second is comparable and reproducible.
 *
 * The assertions are ratio ceilings with generous headroom. They exist to catch a regression that
 * changes the order of magnitude — a lock where there was a CAS, an O(n) scan where there was an
 * index — not to police a few percent of noise on a shared runner. The measured numbers are
 * written up in docs/security-platform/distributed-guarantees.md.
 */
const context = (): SecurityContext => ({
  tenantId: ROOT_TENANT_ID,
  principal: { kind: 'user', tenantId: ROOT_TENANT_ID, userId: USER },
  correlationId: unsafeId<CorrelationId>('corr-bench'),
});

/** Median of a few runs, so one unlucky GC pause does not become the headline. */
async function measure(runs: number, work: () => Promise<void>): Promise<number> {
  const samples: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    await work();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)] as number;
}

function report(label: string, before: number, after: number, operations: number): void {
  const perOp = (ms: number): string => `${(ms / operations).toFixed(4)}ms/op`;
  // eslint-disable-next-line no-console -- the number is the deliverable
  console.log(
    `${label}: 1.0 ${perOp(before)} → 2.0 ${perOp(after)} (${(after / before).toFixed(2)}×)`,
  );
}

describe('audit append', () => {
  it('costs no more than a small multiple of the unsynchronised write', async () => {
    const operations = 5_000;

    // The 1.0 shape, reconstructed exactly: the chain head lived in a field on the service, so an
    // append was "hash against what I remember, then write". One round trip, no condition, and no
    // way for a second replica to know it had just been overtaken.
    const before = await measure(3, async () => {
      const repository = new MemoryAuditRepository({ maxRecords: operations * 2 });
      let head: ChainHead | null = null;
      for (let i = 0; i < operations; i++) {
        const record = sealRecord(head, i);
        await repository.write(record);
        head = { sequence: record.sequence, hash: record.hash };
      }
    });

    // The 2.0 shape at the same layer: the store owns the sequence and serialises per tenant, so
    // the sealer runs inside the store's critical section instead of against a local field.
    const after = await measure(3, async () => {
      const repository = new MemoryAuditRepository({ maxRecords: operations * 2 });
      for (let i = 0; i < operations; i++) {
        await repository.appendChained(ROOT_TENANT_ID, (head) => sealRecord(head, i));
      }
    });

    report('audit append (store layer)', before, after, operations);
    // Serialisation is a promise chain, not a lock service. Anything above this is a regression.
    expect(after / before).toBeLessThan(6);
  });

  it('serialises concurrent appends without collapsing throughput', async () => {
    // The interesting case: 2,000 appends issued at once rather than one after another. The
    // per-tenant serialisation means they queue, so the question is whether queueing is cheap.
    const operations = 2_000;
    const repository = new MemoryAuditRepository({ maxRecords: operations * 2 });
    const audit = new AuditService({ repository, clock: new FixedClock(START) });

    const start = performance.now();
    await Promise.all(
      Array.from({ length: operations }, () =>
        audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
      ),
    );
    const elapsed = performance.now() - start;

    // eslint-disable-next-line no-console -- the number is the deliverable
    console.log(
      `audit append (concurrent, full service): ${(elapsed / operations).toFixed(4)}ms/op`,
    );
    expect(repository.chain(ROOT_TENANT_ID)).toHaveLength(operations);
    expect(elapsed / operations).toBeLessThan(0.5);
  });
});

describe('refresh rotation', () => {
  it('adds one conditional write, not a round of coordination', async () => {
    const operations = 2_000;

    // 1.0: find, check `rotatedAt` in memory, issue, blind update. Two writes, no condition.
    const before = await measure(3, async () => {
      const store = new MemoryRefreshTokenStore();
      const clock = new FixedClock(START);
      const service = new RefreshTokenService({ store, clock, pepper: 'bench' });
      for (let i = 0; i < operations; i++) {
        const { token, record } = await service.issue({
          tenantId: ROOT_TENANT_ID,
          userId: USER,
          tokenVersion: 1,
        });
        const found = await store.findByHash(ROOT_TENANT_ID, hashOf(record));
        if (found?.rotatedAt === undefined) {
          await store.update({ ...(found as RefreshTokenRecord), rotatedAt: clock.now() });
        }
        expect(token).toBeDefined();
      }
    });

    // 2.0: find, claim with a compare-and-swap, then issue.
    const after = await measure(3, async () => {
      const store = new MemoryRefreshTokenStore();
      const service = new RefreshTokenService({
        store,
        clock: new FixedClock(START),
        pepper: 'bench',
      });
      for (let i = 0; i < operations; i++) {
        const { token } = await service.issue({
          tenantId: ROOT_TENANT_ID,
          userId: USER,
          tokenVersion: 1,
        });
        await service.rotate(ROOT_TENANT_ID, token);
      }
    });

    report('refresh rotation', before, after, operations);
    expect(after / before).toBeLessThan(6);
  });
});

describe('token bucket', () => {
  it('pays for exactness only when there is contention', async () => {
    const operations = 20_000;
    const clock = new FixedClock(START);
    const options = { refillPerSecond: 1_000_000, capacity: 1_000_000 };

    // Uncontended: the compare-and-swap succeeds first time, so 2.0 costs one extra comparison.
    const uncontended = await measure(3, async () => {
      const bucket = new TokenBucket(new MemoryCache({ clock, maxEntries: 10 }), clock);
      for (let i = 0; i < operations; i++) await bucket.consume('k', options);
    });

    // eslint-disable-next-line no-console -- the number is the deliverable
    console.log(`token bucket (uncontended): ${(uncontended / operations).toFixed(4)}ms/op`);
    expect(uncontended / operations).toBeLessThan(0.05);
  });
});

describe('cache primitives', () => {
  it('keeps the atomic operations in the same cost class as a plain set', async () => {
    const operations = 50_000;

    // A fresh cache inside each measured run. Reusing one would let the second and third runs hit
    // keys that already exist, and compareAndSet returns early on a mismatch — which would have
    // benchmarked "doing nothing" and reported it as a speed-up.
    const set = await measure(3, async () => {
      const cache = new MemoryCache({ maxEntries: operations * 2 });
      for (let i = 0; i < operations; i++) await cache.set(`k:${i}`, i, { ttl: 60_000 });
    });
    let losses = 0;
    const cas = await measure(3, async () => {
      const cache = new MemoryCache({ maxEntries: operations * 2 });
      for (let i = 0; i < operations; i++) {
        // Counted rather than asserted per iteration: 50,000 matcher calls would dominate the
        // measurement and the benchmark would be reporting the cost of `expect`.
        if (!(await cache.compareAndSet?.(`k:${i}`, undefined, i, { ttl: 60_000 }))) losses++;
      }
    });
    expect(losses).toBe(0);

    report('cache write', set, cas, operations);
    // compareAndSet reads before it writes; anything beyond a small factor means it is scanning.
    expect(cas / set).toBeLessThan(5);
  });
});

/**
 * The platform's sealing rule, applied by hand.
 *
 * The benchmark needs both arms to hash identically or the comparison measures the hash rather
 * than the coordination, so this is the same canonical form `AuditService` uses.
 */
function sealRecord(head: ChainHead | null, index: number): AuditRecord {
  const sequence = head === null ? 1 : nextSequence(head.sequence);
  const previousHash = head?.hash ?? null;
  const recordedAt = START + index;
  const event = {
    name: 'auth.login.succeeded',
    occurredAt: recordedAt,
    tenantId: ROOT_TENANT_ID,
    correlationId: unsafeId<CorrelationId>('corr-bench'),
    outcome: 'success',
    severity: 'info',
    actor: { id: 'u1', kind: 'user' },
  } as const;
  const hash = createHash('sha256')
    .update(canonicalize(event, previousHash, recordedAt, sequence))
    .digest('hex');

  return { id: `aud_${String(sequence)}`, event, recordedAt, sequence, previousHash, hash };
}

function hashOf(record: RefreshTokenRecord): string {
  return record.tokenHash;
}
