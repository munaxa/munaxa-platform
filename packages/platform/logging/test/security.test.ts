import { describe, expect, it } from 'vitest';
import { ROOT_TENANT_ID } from '@munaxa/types';
import {
  MemoryLogger,
  logSecurityEvent,
  newCorrelationId,
  requestFields,
  sanitizeCorrelationId,
  withCorrelation,
} from '../src/index.js';

describe('credentials never reach a log line', () => {
  it('redacts a whole request body containing a password', () => {
    const logger = new MemoryLogger();
    logger.log('info', 'login.attempt', {
      body: { email: 'ada@example.com', password: 'hunter2hunter2', rememberMe: true },
      headers: {
        authorization: 'Bearer eyJhbGciOi.secret.value',
        cookie: 'sid=abcdef; csrf=ghijkl',
        'user-agent': 'Mozilla/5.0',
      },
    });

    const rendered = JSON.stringify(logger.lines[0]);
    expect(rendered).not.toContain('hunter2hunter2');
    expect(rendered).not.toContain('eyJhbGciOi');
    expect(rendered).not.toContain('sid=abcdef');
    expect(rendered).toContain('Mozilla/5.0');
  });

  it('redacts credentials passed through child bindings', () => {
    const logger = new MemoryLogger();
    logger.child({ apiKey: 'mxa_live_secret' }).log('info', 'bound');
    expect(JSON.stringify(logger.lines[0])).not.toContain('mxa_live_secret');
  });

  it('redacts tokens nested inside an event payload', () => {
    const logger = new MemoryLogger();
    logSecurityEvent(logger, {
      name: 'auth.token.refreshed',
      occurredAt: 0,
      tenantId: ROOT_TENANT_ID,
      correlationId: newCorrelationId(),
      outcome: 'success',
      severity: 'info',
      payload: { refreshToken: 'rt_leaked_value', familyId: 'fam_1' },
    });

    const rendered = JSON.stringify(logger.lines[0]);
    expect(rendered).not.toContain('rt_leaked_value');
    expect(rendered).toContain('fam_1');
  });
});

describe('log injection', () => {
  it('cannot forge a second log line through a message or a field', () => {
    const logger = new MemoryLogger();
    logger.log('info', 'user.input', {
      note: 'benign"}\n{"level":"error","message":"forged breach alert',
    });

    // JSON serialisation escapes the newline and the quote, so the forged object stays a value.
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]?.message).toBe('user.input');
  });

  it('refuses an inbound correlation id carrying control characters', () => {
    expect(sanitizeCorrelationId('abc\ndef-injected-line')).toBeUndefined();
    expect(sanitizeCorrelationId('abc\r\nSet-Cookie: x')).toBeUndefined();
    expect(sanitizeCorrelationId('a'.repeat(200))).toBeUndefined();
  });

  it('bounds a hostile field so one line cannot fill a log budget', () => {
    const logger = new MemoryLogger();
    logger.log('info', 'user.input', { note: 'x'.repeat(1_000_000) });
    expect(JSON.stringify(logger.lines[0]).length).toBeLessThan(5_000);
  });
});

describe('personal data is reduced, not spilled', () => {
  it('masks the identifier on the login path', () => {
    const fields = requestFields({
      method: 'POST',
      path: '/login',
      identifier: 'ada.lovelace@analytical-engine.example',
    });
    expect(fields.identifier).toBe('a***@analytical-engine.example');
  });

  it('truncates a user agent used as a fingerprint', () => {
    const fields = requestFields({ method: 'GET', path: '/', userAgent: 'A'.repeat(2_000) });
    expect((fields.userAgent as string).length).toBe(256);
  });
});

describe('correlation context does not leak across scopes', () => {
  it('is undefined outside the scope that established it', () => {
    const logger = new MemoryLogger();
    withCorrelation({ correlationId: newCorrelationId(), userId: 'u-secret' }, () => {
      logger.log('info', 'inside');
    });
    logger.log('info', 'after');

    expect(logger.find('after')?.userId).toBeUndefined();
  });
});
