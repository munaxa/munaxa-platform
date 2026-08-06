import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID, severityFor, type SecurityEvent } from '@munaxa/types';
import {
  MemoryLogger,
  MemoryMetrics,
  logSecurityEvent,
  newCorrelationId,
  requestFields,
  resolveCorrelationId,
  timed,
  withCorrelation,
} from '../src/index.js';

/**
 * A request, end to end: the transport resolves a correlation id, everything downstream inherits
 * it, a security event is emitted, and the whole trace is greppable by one identifier.
 */
describe('a request trace', () => {
  it('ties every line to one correlation id', async () => {
    const logger = new MemoryLogger();
    const metrics = new MemoryMetrics();
    const correlationId = resolveCorrelationId('req-inbound-0001-from-edge');

    await withCorrelation({ correlationId, tenantId: ROOT_TENANT_ID, userId: 'u1' }, async () => {
      logger.log('info', 'request.received', requestFields({ method: 'POST', path: '/login' }));

      await timed(logger, 'auth.login', async () => 'ok', { metrics, slowThresholdMs: 0 });

      logSecurityEvent(logger, {
        name: 'auth.login.succeeded',
        occurredAt: 0,
        tenantId: ROOT_TENANT_ID,
        correlationId,
        outcome: 'success',
        severity: 'info',
        actor: { id: 'u1', kind: 'user' },
      });
    });

    expect(logger.lines).toHaveLength(3);
    for (const line of logger.lines) {
      expect(line.correlationId).toBe('req-inbound-0001-from-edge');
      expect(line.userId).toBe('u1');
    }
    expect(logger.lines.map((line) => line.kind)).toEqual(['request', 'performance', 'security']);
  });

  it('keeps concurrent requests from borrowing each other’s context', async () => {
    const logger = new MemoryLogger();

    await Promise.all(
      ['a', 'b', 'c'].map((name) =>
        withCorrelation({ correlationId: newCorrelationId(), userId: name }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          logger.log('info', 'done', { name });
        }),
      ),
    );

    for (const line of logger.lines) {
      expect(line.userId).toBe(line.name);
    }
    expect(new Set(logger.lines.map((line) => line.correlationId)).size).toBe(3);
  });
});

describe('security events reach the log at the right level', () => {
  const event = (
    name: SecurityEvent['name'],
    outcome: SecurityEvent['outcome'],
  ): SecurityEvent => ({
    name,
    occurredAt: 0,
    tenantId: ROOT_TENANT_ID,
    correlationId: newCorrelationId(),
    outcome,
    severity: severityFor(name),
  });

  it.each([
    ['auth.login.succeeded', 'info'],
    ['auth.login.failed', 'info'],
    ['auth.token.reuse.detected', 'error'],
    ['security.ratelimit.exceeded', 'warn'],
    ['security.threat.detected', 'error'],
  ] as const)('%s logs at %s', (name, level) => {
    const logger = new MemoryLogger();
    logSecurityEvent(logger, event(name, 'failure'));
    expect(logger.lines[0]?.level).toBe(level);
  });

  it('is never dropped by debug sampling', () => {
    const logger = new MemoryLogger({ debugSampleRate: 0 });
    logSecurityEvent(logger, event('auth.login.failed', 'failure'));
    expect(logger.lines).toHaveLength(1);
  });
});
