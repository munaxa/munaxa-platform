import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  CORRELATION_HEADER,
  DEFAULT_REDACTED_KEYS,
  MemoryLogger,
  REDACTED,
  REQUEST_ID_HEADER,
  StructuredLogger,
  logSecurityEvent,
  newCorrelationId,
} from '../src/index.js';

/**
 * Log shape is a contract with the aggregator, not just with the reader. Dashboards, alert rules
 * and saved searches are all written against these field names; renaming `correlationId` breaks
 * every one of them silently — the queries keep running and return nothing.
 */
describe('1.0 line shape', () => {
  it('keeps the core field names and ISO-8601 timestamps', () => {
    const lines: string[] = [];
    new StructuredLogger({ clock: new FixedClock(0), write: (line) => lines.push(line) }).log(
      'info',
      'test.event',
      { extra: 1 },
    );

    const record = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(Object.keys(record)).toEqual(expect.arrayContaining(['time', 'level', 'message']));
    expect(record.time).toBe('1970-01-01T00:00:00.000Z');
    expect(record.level).toBe('info');
  });

  it('keeps the security-log field names', () => {
    const logger = new MemoryLogger();
    logSecurityEvent(logger, {
      name: 'auth.login.failed',
      occurredAt: 0,
      tenantId: ROOT_TENANT_ID,
      correlationId: newCorrelationId(),
      outcome: 'failure',
      severity: 'notice',
      actor: { id: 'u1', kind: 'user' },
      target: { id: 'session', type: 'session' },
      source: { ipAddress: '198.51.100.7' },
    });

    expect(logger.lines[0]).toMatchObject({
      kind: 'security',
      message: 'auth.login.failed',
      outcome: 'failure',
      severity: 'notice',
      actorId: 'u1',
      actorKind: 'user',
      targetId: 'session',
      targetType: 'session',
      ip: '198.51.100.7',
    });
  });

  it('keeps the correlation header names', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });

  it('keeps the redaction marker', () => {
    // Support runbooks tell people to search for this string.
    expect(REDACTED).toBe('[redacted]');
  });

  it('never removes a key from the default redaction list', () => {
    for (const key of ['password', 'token', 'authorization', 'cookie', 'apikey', 'otp']) {
      expect(DEFAULT_REDACTED_KEYS as readonly string[]).toContain(key);
    }
  });
});
