import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, unsafeId, type CorrelationId } from '@munaxa/types';
import type { AuditRecord } from '@munaxa/interfaces';
import { CsvExporter, canonicalize, verifyChain } from '../src/index.js';
import { auditFixture, context } from './helpers.js';

/**
 * The audit record is the platform's longest-lived artefact: it is queried by compliance tooling
 * years after it was written, and its hash chain must still verify against code shipped later.
 * That makes `canonicalize` a frozen format — a new field appended to the hashed tuple would
 * invalidate every record ever written.
 */
const V1_EVENT = {
  name: 'auth.login.succeeded',
  occurredAt: 1_700_000_000_000,
  tenantId: ROOT_TENANT_ID,
  correlationId: unsafeId<CorrelationId>('corr-1'),
  outcome: 'success',
  severity: 'info',
  actor: { id: 'u1', kind: 'user' },
  source: { ipAddress: '198.51.100.4' },
} as const;

const V1_CANONICAL =
  '[1,null,1700000000000,"auth.login.succeeded",1700000000000,"root","corr-1","success","info","u1","user",null,null,"198.51.100.4",null]';

const V1_RECORD: AuditRecord = {
  id: 'aud_1_3f2a1b4c5d6e',
  event: V1_EVENT,
  recordedAt: 1_700_000_000_000,
  sequence: 1,
  previousHash: null,
  // sha256 of V1_CANONICAL
  hash: '',
};

describe('1.0 canonical form', () => {
  it('hashes the same tuple, in the same order', () => {
    expect(canonicalize(V1_EVENT, null, 1_700_000_000_000, 1)).toBe(V1_CANONICAL);
  });

  it('verifies a record written by 1.0', async () => {
    // Recompute the fixture's hash with today's code; a format change makes this fail.
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(V1_CANONICAL).digest('hex');
    expect(verifyChain([{ ...V1_RECORD, hash }])).toEqual({ valid: true, checked: 1 });
  });

  it('still produces a hex sha-256 hash and a 1-based sequence', async () => {
    const { audit } = auditFixture();
    const record = await audit.record(context(), {
      name: 'auth.login.succeeded',
      outcome: 'success',
    });
    expect(record?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.sequence).toBe(1);
    expect(record?.id.startsWith('aud_')).toBe(true);
  });
});

describe('1.0 export shape', () => {
  it('keeps the CSV columns and their order', () => {
    expect(CsvExporter.COLUMNS).toEqual([
      'id',
      'sequence',
      'recordedAt',
      'occurredAt',
      'tenantId',
      'event',
      'outcome',
      'severity',
      'actorId',
      'actorKind',
      'targetId',
      'targetType',
      'correlationId',
      'ipAddress',
    ]);
  });

  it('keeps ISO-8601 timestamps in exports', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    const lines: string[] = [];
    await new CsvExporter((line) => void lines.push(line)).export(repository.chain(ROOT_TENANT_ID));
    expect(lines[1]).toMatch(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/);
  });
});
