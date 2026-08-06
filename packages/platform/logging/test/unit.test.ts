import { describe, expect, it } from 'vitest';
import { FixedClock } from '@munaxa/types';
import {
  MemoryLogger,
  MemoryMetrics,
  Redactor,
  StructuredLogger,
  mask,
  maskEmail,
  newCorrelationId,
  nullLogger,
  requestFields,
  resolveCorrelationId,
  sanitizeCorrelationId,
  timed,
  withCorrelation,
  currentCorrelationId,
} from '../src/index.js';

describe('StructuredLogger', () => {
  it('writes one JSON object per line', () => {
    const lines: string[] = [];
    const logger = new StructuredLogger({
      clock: new FixedClock(1_700_000_000_000),
      write: (line) => lines.push(line),
      service: 'docs-api',
    });

    logger.log('info', 'user.updated', { userId: 'u1' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({
      time: '2023-11-14T22:13:20.000Z',
      level: 'info',
      message: 'user.updated',
      service: 'docs-api',
      userId: 'u1',
    });
  });

  it('respects the configured level', () => {
    const logger = new MemoryLogger({ level: 'warn' });
    logger.log('info', 'ignored');
    logger.log('warn', 'kept');
    expect(logger.lines.map((line) => line.message)).toEqual(['kept']);
    expect(logger.isLevelEnabled('debug')).toBe(false);
    expect(logger.isLevelEnabled('error')).toBe(true);
  });

  it('merges child bindings into every line', () => {
    const logger = new MemoryLogger();
    const child = logger.child({ component: 'auth' }).child({ tenantId: 'acme' });
    child.log('info', 'ping');

    expect(logger.lines[0]).toMatchObject({ component: 'auth', tenantId: 'acme' });
  });

  it('never throws on an unserialisable field', () => {
    const logger = new MemoryLogger();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => logger.log('info', 'weird', { cyclic, big: 1n })).not.toThrow();
    expect(logger.lines[0]?.message).toBe('weird');
  });

  it('drops sampled debug lines but never info and above', () => {
    const logger = new MemoryLogger({ debugSampleRate: 0 });
    logger.log('debug', 'sampled-out');
    logger.log('info', 'always');
    expect(logger.lines.map((line) => line.message)).toEqual(['always']);
  });

  it('nullLogger discards everything', () => {
    expect(() => nullLogger.log('error', 'x')).not.toThrow();
    expect(nullLogger.child({}).isLevelEnabled('fatal')).toBe(false);
  });
});

describe('redaction', () => {
  const redactor = new Redactor();

  it.each([
    'password',
    'newPassword',
    'refresh_token',
    'Authorization',
    'x-api-key',
    'clientSecret',
    'totp',
    'recoveryCode',
  ])('redacts %s however it is spelled', (key) => {
    expect(redactor.redact({ [key]: 'sensitive' })).toEqual({ [key]: '[redacted]' });
  });

  it('redacts nested values', () => {
    expect(redactor.redact({ user: { name: 'ada', password: 'p' } })).toEqual({
      user: { name: 'ada', password: '[redacted]' },
    });
  });

  it('leaves non-sensitive fields alone', () => {
    expect(redactor.redact({ userId: 'u1', count: 3, ok: true })).toEqual({
      userId: 'u1',
      count: 3,
      ok: true,
    });
  });

  it('handles cycles, depth and long values', () => {
    const cyclic: Record<string, unknown> = { name: 'x' };
    cyclic.self = cyclic;
    expect(redactor.redact(cyclic)).toEqual({ name: 'x', self: '[circular]' });

    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redactor.redact(deep))).toContain('[depth]');

    const long = redactor.redact({ note: 'x'.repeat(5_000) }) as { note: string };
    expect(long.note.length).toBeLessThan(2_100);
  });

  it('caps array length', () => {
    const result = redactor.redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(51);
    expect(result[50]).toBe('…and 50 more');
  });

  it('renders errors as structured objects', () => {
    const result = redactor.redact({ error: new Error('boom') }) as { error: { message: string } };
    expect(result.error.message).toBe('boom');
  });

  it('supports product-specific keys', () => {
    const custom = new Redactor().add('studentNumber');
    expect(custom.redact({ studentNumber: '123' })).toEqual({ studentNumber: '[redacted]' });
  });

  it('masks without fully hiding', () => {
    expect(mask('abcdefghij')).toBe('******ghij');
    expect(mask('ab')).toBe('[redacted]');
    expect(maskEmail('ada@example.com')).toBe('a***@example.com');
    expect(maskEmail('not-an-email')).toBe('[redacted]');
  });
});

describe('correlation', () => {
  it('is available across awaits inside the scope', async () => {
    const correlationId = newCorrelationId();
    await withCorrelation({ correlationId }, async () => {
      await Promise.resolve();
      expect(currentCorrelationId()).toBe(correlationId);
    });
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('attaches context fields to every line inside the scope', () => {
    const logger = new MemoryLogger();
    const correlationId = newCorrelationId();

    withCorrelation({ correlationId, userId: 'u1' }, () => {
      logger.log('info', 'inside');
    });
    logger.log('info', 'outside');

    expect(logger.find('inside')).toMatchObject({ correlationId, userId: 'u1' });
    expect(logger.find('outside')?.correlationId).toBeUndefined();
  });

  it('accepts a well-formed inbound id and rejects the rest', () => {
    expect(sanitizeCorrelationId('req-01HQXY-abc123')).toBe('req-01HQXY-abc123');
    expect(sanitizeCorrelationId('short')).toBeUndefined();
    expect(sanitizeCorrelationId('has spaces and is long enough')).toBeUndefined();
    expect(sanitizeCorrelationId(undefined)).toBeUndefined();
  });

  it('mints a new id when the inbound header is unusable', () => {
    expect(resolveCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId('bad\nvalue')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('instrumentation', () => {
  it('records duration and logs only when slow', async () => {
    const logger = new MemoryLogger();
    const metrics = new MemoryMetrics();

    await timed(logger, 'db.query', async () => 'fast', { metrics, slowThresholdMs: 10_000 });
    expect(logger.lines).toHaveLength(0);
    expect(
      metrics.percentile('db.query.duration', 50, { outcome: 'success' }),
    ).toBeGreaterThanOrEqual(0);

    await timed(logger, 'db.query', async () => 'slow', { metrics, slowThresholdMs: 0 });
    expect(logger.lines[0]).toMatchObject({ kind: 'performance', operation: 'db.query' });
  });

  it('records a failed operation and rethrows', async () => {
    const logger = new MemoryLogger();
    const metrics = new MemoryMetrics();

    await expect(
      timed(
        logger,
        'provider.call',
        async () => {
          throw new Error('upstream down');
        },
        { metrics },
      ),
    ).rejects.toThrow('upstream down');

    expect(logger.lines[0]).toMatchObject({ outcome: 'failure', kind: 'performance' });
    expect(metrics.percentile('provider.call.duration', 50, { outcome: 'failure' })).toBeDefined();
  });

  it('masks the identifier in request fields', () => {
    expect(
      requestFields({ method: 'POST', path: '/login', identifier: 'ada@example.com' }),
    ).toMatchObject({
      identifier: 'a***@example.com',
    });
  });
});
