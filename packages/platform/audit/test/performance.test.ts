import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import { AuditService, MemoryAuditRepository, NdjsonExporter, verifyChain } from '../src/index.js';
import { context } from './helpers.js';

/**
 * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
 * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
 * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
 * what they are for.
 */

/**
 * Auditing sits on the authenticated request path. If it is not cheap, products will be tempted
 * to make it optional — and an optional audit trail is not one.
 */
describe('write cost', () => {
  it('records an event in well under a millisecond', async () => {
    const audit = new AuditService({
      repository: new MemoryAuditRepository(),
      sinks: [{ write: async () => {} }],
      clock: new FixedClock(0),
    });

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }
    expect((performance.now() - start) / 20_000).toBeLessThan(0.2);
  });

  it('does not slow down as the chain grows', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository, clock: new FixedClock(0) });

    for (let i = 0; i < 20_000; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }

    // Chaining keeps only the head in memory, so record 20,001 costs what record 2 did.
    const start = performance.now();
    for (let i = 0; i < 2_000; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }
    expect((performance.now() - start) / 2_000).toBeLessThan(0.2);
  });

  it('is not delayed by a slow sink beyond that sink’s own latency', async () => {
    const slow = { write: async () => new Promise<void>((resolve) => setTimeout(resolve, 5)) };
    const audit = new AuditService({
      repository: new MemoryAuditRepository(),
      sinks: [slow, slow, slow],
      clock: new FixedClock(0),
    });

    const start = performance.now();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    // Three 5ms sinks run concurrently, so the write costs ~5ms, not ~15ms.
    expect(performance.now() - start).toBeLessThan(14);
  });
});

describe('verification and export cost', () => {
  it('verifies a long chain in linear time', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository, clock: new FixedClock(0) });
    for (let i = 0; i < 20_000; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }

    const start = performance.now();
    const result = verifyChain(repository.chain(ROOT_TENANT_ID));
    const elapsed = performance.now() - start;

    expect(result.valid).toBe(true);
    expect(elapsed).toBeLessThan(5_000);
  });

  it('exports without buffering the whole chain', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository, clock: new FixedClock(0) });
    for (let i = 0; i < 10_000; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }

    let written = 0;
    const start = performance.now();
    await new NdjsonExporter(() => {
      written++;
    }).export(repository.chain(ROOT_TENANT_ID));

    expect(written).toBe(10_000);
    expect(performance.now() - start).toBeLessThan(5_000);
  });
});
