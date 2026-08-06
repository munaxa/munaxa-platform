import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import {
  AuditService,
  BatchingSink,
  MemoryAuditRepository,
  NON_SUPPRESSIBLE_EVENTS,
  auditEvent,
  verifyChain,
} from '../src/index.js';
import { auditFixture, context, tenantContext } from './helpers.js';

describe('event construction', () => {
  it('fills tenant, correlation, actor and source from the context', () => {
    const event = auditEvent(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    expect(event).toMatchObject({
      name: 'auth.login.succeeded',
      tenantId: ROOT_TENANT_ID,
      correlationId: 'corr-1',
      outcome: 'success',
      actor: { id: 'u1', kind: 'user' },
      source: { ipAddress: '198.51.100.4', userAgent: 'Mozilla/5.0' },
    });
  });

  it('derives severity from the event name', () => {
    expect(auditEvent(context(), { name: 'auth.token.reuse.detected', outcome: 'failure' }).severity).toBe(
      'critical',
    );
    expect(auditEvent(context(), { name: 'auth.login.succeeded', outcome: 'success' }).severity).toBe('info');
  });
});

describe('AuditService', () => {
  it('writes a record with a sequence and a hash', async () => {
    const { audit, repository } = auditFixture();
    const record = await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    expect(record?.sequence).toBe(1);
    expect(record?.previousHash).toBeNull();
    expect(record?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(repository.size).toBe(1);
  });

  it('chains records per tenant', async () => {
    const { audit, repository } = auditFixture();
    const acme = toTenantId('acme');
    const globex = toTenantId('globex');

    await audit.record(tenantContext(acme), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.record(tenantContext(globex), { name: 'auth.login.succeeded', outcome: 'success' });
    const third = await audit.record(tenantContext(acme), { name: 'auth.logout.succeeded', outcome: 'success' });

    // Each tenant has its own sequence, so one tenant's volume never shifts another's numbering.
    expect(third?.sequence).toBe(2);
    expect(repository.chain(acme)).toHaveLength(2);
    expect(repository.chain(globex)).toHaveLength(1);
    expect(verifyChain(repository.chain(acme)).valid).toBe(true);
  });

  it('strips credentials from a payload', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), {
      name: 'auth.password.changed',
      outcome: 'success',
      payload: { password: 'hunter2', newPassword: 'hunter3', method: 'self-service' },
    });

    const record = repository.chain(ROOT_TENANT_ID)[0];
    expect(record?.event.payload).toEqual({
      password: '[redacted]',
      newPassword: '[redacted]',
      method: 'self-service',
    });
  });

  it('honours suppression, except for events that cannot be suppressed', async () => {
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({
      sinks: [repository],
      clock: new FixedClock(0),
      suppress: ['authz.permission.granted', 'auth.login.succeeded'],
    });

    expect(await audit.record(context(), { name: 'authz.permission.granted', outcome: 'success' })).toBeUndefined();
    expect(await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' })).toBeDefined();
    expect(NON_SUPPRESSIBLE_EVENTS.has('auth.login.succeeded')).toBe(true);
  });

  it('does not let a failing sink break the caller', async () => {
    const repository = new MemoryAuditRepository();
    const broken = { write: async () => { throw new Error('SIEM unreachable'); } };
    const errors: unknown[] = [];
    const audit = new AuditService({
      sinks: [broken, repository],
      clock: new FixedClock(0),
      onSinkError: (error) => errors.push(error),
    });

    await expect(
      audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
    ).resolves.toBeDefined();

    expect(errors).toHaveLength(1);
    expect(audit.failureCount).toBe(1);
    // The healthy sink still received the record.
    expect(repository.size).toBe(1);
  });

  it('continues an existing chain after a restart', async () => {
    const { audit, repository, clock } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    const restarted = new AuditService({ sinks: [repository], clock });
    restarted.resume(ROOT_TENANT_ID, await repository.latest(ROOT_TENANT_ID));
    await restarted.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    expect(verifyChain(repository.chain(ROOT_TENANT_ID))).toEqual({ valid: true, checked: 3 });
  });

  it('starts a fresh chain when a restart forgets to resume', async () => {
    const { audit, repository, clock } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    const restarted = new AuditService({ sinks: [repository], clock });
    await restarted.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    // Documented consequence: verification reports the break rather than silently accepting it.
    expect(verifyChain(repository.chain(ROOT_TENANT_ID)).valid).toBe(false);
  });
});

describe('repository', () => {
  it('filters by name, actor, time and correlation', async () => {
    const { audit, repository, clock } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    clock.advance(60_000);
    await audit.record(context(), { name: 'auth.login.failed', outcome: 'failure' });

    const byName = await repository.query({ tenantId: ROOT_TENANT_ID, names: ['auth.login.failed'] });
    expect(byName.items).toHaveLength(1);

    const byActor = await repository.query({ tenantId: ROOT_TENANT_ID, actorId: 'u1' });
    expect(byActor.items).toHaveLength(2);

    const byTime = await repository.query({ tenantId: ROOT_TENANT_ID, from: 1_700_000_030_000 });
    expect(byTime.items).toHaveLength(1);

    const byCorrelation = await repository.query({ tenantId: ROOT_TENANT_ID, correlationId: 'nope' as never });
    expect(byCorrelation.items).toHaveLength(0);
  });

  it('paginates by cursor', async () => {
    const { audit, repository } = auditFixture();
    for (let i = 0; i < 5; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }

    const first = await repository.query({ tenantId: ROOT_TENANT_ID, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe('2');

    const second = await repository.query({
      tenantId: ROOT_TENANT_ID,
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(second.items.map((record) => record.sequence)).toEqual([3, 4]);
  });

  it('bounds its own memory', async () => {
    const repository = new MemoryAuditRepository({ maxRecords: 10 });
    const audit = new AuditService({ sinks: [repository], clock: new FixedClock(0) });
    for (let i = 0; i < 50; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }
    expect(repository.size).toBe(10);
  });
});

describe('BatchingSink', () => {
  it('holds records until the batch fills, then writes them', async () => {
    const repository = new MemoryAuditRepository();
    const batching = new BatchingSink(repository, 3);
    const audit = new AuditService({ sinks: [batching], clock: new FixedClock(0) });

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    expect(repository.size).toBe(0);
    expect(batching.pending).toBe(2);

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    expect(repository.size).toBe(3);
  });

  it('flushes on demand', async () => {
    const repository = new MemoryAuditRepository();
    const batching = new BatchingSink(repository, 100);
    const audit = new AuditService({ sinks: [batching], clock: new FixedClock(0) });

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.flush();
    expect(repository.size).toBe(1);
  });
});
