import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  MemoryTransport,
  NotificationService,
  SECURITY_TEMPLATES,
  TemplateRegistry,
  type NotificationEvent,
} from '../src/index.js';

/**
 * The security notifications a product must send, exercised end to end: every template renders
 * with the variables the platform actually has at that moment, and reaches a transport.
 */
function build() {
  const clock = new FixedClock(1_700_000_000_000);
  const email = new MemoryTransport('email');
  const push = new MemoryTransport('push');
  const events: NotificationEvent[] = [];

  const notifications = new NotificationService({
    transports: [email, push],
    templates: new TemplateRegistry([...SECURITY_TEMPLATES]),
    clock,
    retryDelay: 1,
    onEvent: (event) => void events.push(event),
  });

  return { notifications, email, push, events, clock };
}

const COMMON = { productName: 'Munaxa Docs', securityUrl: 'https://app.test/security' };

describe('the security notification catalogue', () => {
  it.each([
    ['security.password-changed', 'email', { ...COMMON, changedAt: 'today' }],
    [
      'security.password-reset-requested',
      'email',
      { ...COMMON, resetUrl: 'https://app.test/reset?t=abc', expiresInMinutes: 30 },
    ],
    ['security.new-device', 'email', { ...COMMON, location: 'London, GB', signedInAt: 'today' }],
    ['security.mfa-enabled', 'email', { ...COMMON, changedAt: 'today' }],
    ['security.mfa-disabled', 'email', { ...COMMON, changedAt: 'today' }],
    ['security.account-locked', 'email', { ...COMMON, unlockAt: '10:15' }],
    ['security.email-otp', 'email', { ...COMMON, code: '123456', expiresInMinutes: 10 }],
  ] as const)('%s renders and delivers over %s', async (templateId, channel, variables) => {
    const { notifications, email } = build();

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel,
      recipient: { email: 'ada@example.com' },
      templateId,
      variables,
      priority: 'critical',
    });

    expect(result.delivered).toBe(true);
    const message = email.last();
    expect(message?.templateId).toBe(templateId);
    expect(message?.body).not.toContain('{{');
  });

  it('sends a new-device notice over push as well as email', async () => {
    const { notifications, push } = build();
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'push',
      recipient: { deviceTokens: ['token-1'] },
      templateId: 'security.new-device',
      variables: { ...COMMON, location: 'London, GB', signedInAt: 'today' },
    });

    expect(push.sent).toHaveLength(1);
  });
});

describe('a password change, end to end', () => {
  it('notifies the user and records the delivery', async () => {
    const { notifications, email, events } = build();

    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com', locale: 'en' },
      templateId: 'security.password-changed',
      variables: { ...COMMON, changedAt: '2026-08-06 09:00' },
      correlationId: 'corr-42',
      priority: 'critical',
    });

    const message = email.last();
    expect(message?.correlationId).toBe('corr-42');
    expect(message?.subject).toBe('Your Munaxa Docs password was changed');
    expect(events.filter((event) => event.type === 'sent')).toHaveLength(1);
  });

  it('reports a failure the caller can act on rather than throwing into the request', async () => {
    const failing = new MemoryTransport('email');
    failing.failures = 99;
    const events: NotificationEvent[] = [];
    const notifications = new NotificationService({
      transports: [failing],
      templates: new TemplateRegistry([...SECURITY_TEMPLATES]),
      clock: new FixedClock(0),
      maxAttempts: 2,
      retryDelay: 1,
      onEvent: (event) => void events.push(event),
    });

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      templateId: 'security.mfa-enabled',
      variables: { ...COMMON, changedAt: 'today' },
    });

    expect(result.delivered).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'failed' });
  });
});

describe('multi-tenant delivery', () => {
  it('keeps deduplication scoped per tenant', async () => {
    const { notifications, email } = build();
    const send = (tenantId: string) =>
      notifications.send({
        tenantId: tenantId as never,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'identical body',
      });

    await send('acme');
    await send('globex');
    // Same recipient and body, different tenants: both go out.
    expect(email.sent).toHaveLength(2);

    await send('acme');
    expect(email.sent).toHaveLength(2);
  });
});
