import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, TenantMismatchError, toTenantId } from '@munaxa/types';
import type { AuditRecord } from '@munaxa/interfaces';
import { CsvExporter, NdjsonExporter, verifyChain } from '../src/index.js';
import { auditFixture, context, tenantContext } from './helpers.js';

async function chainOf(count: number): Promise<AuditRecord[]> {
  const { audit, repository } = auditFixture();
  for (let i = 0; i < count; i++) {
    await audit.record(context(), {
      name: 'auth.login.succeeded',
      outcome: 'success',
      payload: { attempt: i },
    });
  }
  return [...repository.chain(ROOT_TENANT_ID)];
}

describe('tamper evidence', () => {
  it('detects an edited record', async () => {
    const records = await chainOf(5);
    const target = records[2] as AuditRecord;
    records[2] = { ...target, event: { ...target.event, outcome: 'failure' } };

    const result = verifyChain(records);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toMatch(/do not match its hash/);
  });

  it('detects a deleted record', async () => {
    const records = await chainOf(5);
    records.splice(2, 1);

    const result = verifyChain(records);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(4);
  });

  it('detects a reordered record', async () => {
    const records = await chainOf(4);
    [records[1], records[2]] = [records[2] as AuditRecord, records[1] as AuditRecord];
    expect(verifyChain(records).valid).toBe(false);
  });

  it('detects an inserted record forged without the chain', async () => {
    const records = await chainOf(3);
    const forged: AuditRecord = {
      ...(records[1] as AuditRecord),
      id: 'aud_forged',
      event: { ...(records[1] as AuditRecord).event, name: 'authz.role.assigned' },
    };
    records.splice(2, 0, forged);

    expect(verifyChain(records).valid).toBe(false);
  });

  it('detects a record whose timestamp was moved', async () => {
    const records = await chainOf(3);
    const target = records[1] as AuditRecord;
    records[1] = { ...target, recordedAt: target.recordedAt - 86_400_000 };
    expect(verifyChain(records).valid).toBe(false);
  });

  it('is stable under re-serialisation, so a database round trip does not break it', async () => {
    const records = await chainOf(4);
    const roundTripped = JSON.parse(JSON.stringify(records)) as AuditRecord[];
    expect(verifyChain(roundTripped).valid).toBe(true);
  });

  it('is stable under payload key reordering', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), {
      name: 'config.changed',
      outcome: 'success',
      payload: { a: 1, b: 2, c: 3 },
    });

    const records = [...repository.chain(ROOT_TENANT_ID)];
    const target = records[0] as AuditRecord;
    // A store that returns object keys in a different order must not look like tampering.
    records[0] = {
      ...target,
      event: { ...target.event, payload: { c: 3, b: 2, a: 1 } },
    };
    expect(verifyChain(records).valid).toBe(true);
  });
});

describe('tenant isolation', () => {
  it('never returns another tenant’s records from a query', async () => {
    const { audit, repository } = auditFixture();
    const acme = toTenantId('acme');
    const globex = toTenantId('globex');

    await audit.record(tenantContext(acme), { name: 'data.exported', outcome: 'success' });
    await audit.record(tenantContext(globex), { name: 'data.exported', outcome: 'success' });

    const result = await repository.query({ tenantId: acme });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.event.tenantId).toBe(acme);
  });

  it('refuses a cross-tenant read by id', async () => {
    const { audit, repository } = auditFixture();
    const acme = toTenantId('acme');
    const record = await audit.record(tenantContext(acme), {
      name: 'data.exported',
      outcome: 'success',
    });

    expect(() => repository.get(toTenantId('globex'), record!.id)).toThrow(TenantMismatchError);
    expect(repository.get(acme, record!.id)).toBeDefined();
  });
});

describe('payload hygiene', () => {
  it('never persists a credential handed to it by mistake', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), {
      name: 'auth.token.refreshed',
      outcome: 'success',
      payload: {
        refreshToken: 'rt_live_secret',
        tokenHash: 'abc123',
        apiKey: 'mxa_live_key',
        familyId: 'fam_1',
      },
    });

    const serialized = JSON.stringify(repository.chain(ROOT_TENANT_ID));
    expect(serialized).not.toContain('rt_live_secret');
    expect(serialized).not.toContain('mxa_live_key');
    expect(serialized).not.toContain('abc123');
    expect(serialized).toContain('fam_1');
  });
});

describe('exports are safe to open', () => {
  it('neutralises spreadsheet formula injection in CSV', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(
      {
        ...context(),
        principal: {
          kind: 'user',
          tenantId: ROOT_TENANT_ID,
          userId: '=cmd|calc' as never,
        },
      },
      { name: 'data.exported', outcome: 'success' },
    );

    const lines: string[] = [];
    await new CsvExporter((line) => void lines.push(line)).export(repository.chain(ROOT_TENANT_ID));

    // The cell is quoted and prefixed, so Excel treats it as text rather than a formula.
    expect(lines[1]).toContain(`"'=cmd|calc"`);
    expect(lines[1]).not.toContain(',=cmd');
  });

  it('escapes embedded quotes rather than breaking the row', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(
      {
        ...context(),
        principal: { kind: 'user', tenantId: ROOT_TENANT_ID, userId: 'a"b,c' as never },
      },
      { name: 'data.exported', outcome: 'success' },
    );

    const lines: string[] = [];
    await new CsvExporter((line) => void lines.push(line)).export(repository.chain(ROOT_TENANT_ID));
    expect(lines[1]).toContain('"a""b,c"');
    expect(lines[1]?.trimEnd().split('\n')).toHaveLength(1);
  });

  it('emits NDJSON that cannot be split by a payload containing a newline', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), {
      name: 'config.changed',
      outcome: 'success',
      payload: { note: 'line one\n{"event":"forged"}' },
    });

    const lines: string[] = [];
    await new NdjsonExporter((line) => void lines.push(line)).export(
      repository.chain(ROOT_TENANT_ID),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.split('\n').filter(Boolean)).toHaveLength(1);
  });
});
