import { describe, expect, it } from 'vitest';
import {
  ROOT_TENANT_ID,
  emptyResponse,
  platformError,
  type PlatformRequest,
  type SecurityContext,
} from '@munaxa/types';
import { MemoryLogger } from '@munaxa/logging';
import {
  Audited,
  AuditService,
  CsvExporter,
  LoggingAuditSink,
  MemoryAuditRepository,
  NdjsonExporter,
  WebhookExporter,
  auditMiddleware,
  defaultClassifier,
  verifyChain,
  withAudit,
} from '../src/index.js';
import { auditFixture, context } from './helpers.js';

describe('withAudit', () => {
  it('records success and returns the value', async () => {
    const { audit, repository } = auditFixture();
    const exportGrades = withAudit(
      audit,
      {
        event: 'data.exported',
        target: (args) => ({ id: args[0] as string, type: 'course' }),
        payload: (_args, result) => ({ rows: (result as unknown[]).length }),
      },
      async (_ctx, _courseId: string) => [1, 2, 3],
    );

    await expect(exportGrades(context(), 'course-1')).resolves.toEqual([1, 2, 3]);

    const record = repository.chain(ROOT_TENANT_ID)[0];
    expect(record?.event.name).toBe('data.exported');
    expect(record?.event.outcome).toBe('success');
    expect(record?.event.target).toEqual({ id: 'course-1', type: 'course' });
    expect(record?.event.payload).toEqual({ rows: 3 });
  });

  it('records a denial and rethrows', async () => {
    const { audit, repository } = auditFixture();
    const guarded = withAudit(audit, { event: 'data.exported' }, async () => {
      throw platformError('AUTHZ_PERMISSION_DENIED');
    });

    await expect(guarded(context())).rejects.toThrow();
    expect(repository.chain(ROOT_TENANT_ID)[0]?.event.outcome).toBe('denied');
  });

  it('records a failure without swallowing the original error', async () => {
    const { audit, repository } = auditFixture();
    const failing = withAudit(audit, { event: 'data.deleted' }, async () => {
      throw new Error('database down');
    });

    await expect(failing(context())).rejects.toThrow('database down');
    expect(repository.chain(ROOT_TENANT_ID)[0]?.event.outcome).toBe('failure');
  });

  it('does not replace the caller’s error when auditing itself fails', async () => {
    const audit = new AuditService({
      sinks: [{ write: async () => { throw new Error('sink down'); } }],
      clock: { now: () => 0 },
    });
    const failing = withAudit(audit, { event: 'data.deleted' }, async () => {
      throw new Error('the real problem');
    });

    await expect(failing(context())).rejects.toThrow('the real problem');
  });
});

describe('@Audited', () => {
  it('wraps a method and keeps `this` bound', async () => {
    const { audit, repository } = auditFixture();

    class GradeService {
      readonly prefix = 'course';

      async exportCourse(_ctx: SecurityContext, id: string) {
        return `${this.prefix}:${id}`;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(GradeService.prototype, 'exportCourse');
    Object.defineProperty(
      GradeService.prototype,
      'exportCourse',
      Audited(audit, { event: 'data.exported' })(GradeService.prototype, 'exportCourse', descriptor!),
    );

    const service = new GradeService();
    await expect(service.exportCourse(context(), '42')).resolves.toBe('course:42');
    expect(repository.chain(ROOT_TENANT_ID)).toHaveLength(1);
  });
});

describe('edge middleware', () => {
  const request = (overrides: Partial<PlatformRequest> = {}): PlatformRequest => ({
    method: 'GET',
    path: '/api/reports/export',
    headers: { 'x-correlation-id': 'corr-9', 'user-agent': 'curl/8' },
    ipAddress: '203.0.113.9',
    ...overrides,
  });

  it('records classified requests only', async () => {
    const { audit, repository } = auditFixture();
    const middleware = auditMiddleware({ audit, classify: defaultClassifier });

    await middleware(request(), emptyResponse());
    await middleware(request({ path: '/api/health' }), emptyResponse());

    const records = repository.chain(ROOT_TENANT_ID);
    expect(records).toHaveLength(1);
    expect(records[0]?.event).toMatchObject({
      name: 'data.exported',
      correlationId: 'corr-9',
      target: { id: '/api/reports/export', type: 'endpoint' },
      source: { ipAddress: '203.0.113.9' },
    });
  });

  it('marks a failed response as a failure', async () => {
    const { audit, repository } = auditFixture();
    const middleware = auditMiddleware({ audit, classify: defaultClassifier });
    await middleware(request(), { ...emptyResponse(), status: 403 });

    expect(repository.chain(ROOT_TENANT_ID)[0]?.event.outcome).toBe('failure');
  });
});

describe('exporters', () => {
  it('writes NDJSON, one record per line', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    const lines: string[] = [];
    const result = await new NdjsonExporter((line) => void lines.push(line)).export(
      repository.chain(ROOT_TENANT_ID),
    );

    expect(result.recordCount).toBe(2);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toMatchObject({ event: 'auth.login.succeeded' });
  });

  it('posts batches to a collector and fails loudly on rejection', async () => {
    const { audit, repository } = auditFixture();
    for (let i = 0; i < 3; i++) {
      await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    }

    const posted: string[] = [];
    const ok = new WebhookExporter(
      {
        request: async (outbound) => {
          posted.push(outbound.body ?? '');
          return { status: 202, headers: {}, body: '' };
        },
      },
      { url: 'https://siem.test/ingest', batchSize: 2 },
    );

    const result = await ok.export(repository.chain(ROOT_TENANT_ID));
    expect(result.recordCount).toBe(3);
    expect(posted).toHaveLength(2);

    const rejecting = new WebhookExporter(
      { request: async () => ({ status: 500, headers: {}, body: 'nope' }) },
      { url: 'https://siem.test/ingest' },
    );
    await expect(rejecting.export(repository.chain(ROOT_TENANT_ID))).rejects.toThrow(/status 500/);
  });

  it('writes CSV with a header row', async () => {
    const { audit, repository } = auditFixture();
    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    const lines: string[] = [];
    await new CsvExporter((line) => void lines.push(line)).export(repository.chain(ROOT_TENANT_ID));

    expect(lines[0]).toContain('id,sequence,recordedAt');
    expect(lines[1]).toContain('"auth.login.succeeded"');
  });
});

describe('the trail as a whole', () => {
  it('mirrors to logs, stays verifiable, and exports intact', async () => {
    const logger = new MemoryLogger();
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({
      sinks: [repository, new LoggingAuditSink(logger)],
      clock: { now: () => 1_700_000_000_000 },
    });

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await audit.record(context(), { name: 'authz.permission.denied', outcome: 'denied' });
    await audit.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    expect(logger.lines.map((line) => line.message)).toEqual([
      'auth.login.succeeded',
      'authz.permission.denied',
      'auth.logout.succeeded',
    ]);
    expect(verifyChain(repository.chain(ROOT_TENANT_ID)).valid).toBe(true);

    const exported: string[] = [];
    await new NdjsonExporter((line) => void exported.push(line)).export(repository.chain(ROOT_TENANT_ID));
    expect(exported).toHaveLength(3);
  });
});
