import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import { MemoryLogger } from '@munaxa/logging';
import {
  LoggingTransport,
  MemoryTransport,
  NotificationService,
  NullTransport,
  SECURITY_TEMPLATES,
  SecretLeakError,
  TemplateRegistry,
  TenantRoutingTransport,
} from '../src/index.js';

const templates = () => new TemplateRegistry([...SECURITY_TEMPLATES]);

function service(overrides: Partial<Parameters<typeof buildService>[0]> = {}) {
  return buildService(overrides);
}

function buildService(
  options: {
    transport?: MemoryTransport;
    maxAttempts?: number;
    dedupeWindow?: number;
    clock?: FixedClock;
  } = {},
) {
  const clock = options.clock ?? new FixedClock(1_700_000_000_000);
  const transport = options.transport ?? new MemoryTransport('email');
  const notifications = new NotificationService({
    transports: [transport],
    templates: templates(),
    clock,
    retryDelay: 1,
    ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    ...(options.dedupeWindow === undefined ? {} : { dedupeWindow: options.dedupeWindow }),
  });
  return { notifications, transport, clock };
}

describe('templates', () => {
  it('interpolates variables', async () => {
    const rendered = await templates().render('security.password-changed', {
      productName: 'Munaxa Docs',
      changedAt: '2026-08-06 09:00',
      securityUrl: 'https://app.test/security',
    });

    expect(rendered.subject).toBe('Your Munaxa Docs password was changed');
    expect(rendered.body).toContain('2026-08-06 09:00');
  });

  it('fails rather than sending a half-rendered message', async () => {
    await expect(
      templates().render('security.password-changed', { productName: 'Docs' }),
    ).rejects.toThrow(/missing variables: changedAt, securityUrl/);
  });

  it('rejects an unknown template and an unsupported channel', async () => {
    await expect(templates().render('nope', {})).rejects.toThrow(/Unknown notification template/);
    await expect(
      templates().render(
        'security.mfa-enabled',
        { productName: 'x', changedAt: 'y' },
        { channel: 'sms' },
      ),
    ).rejects.toThrow(/no sms variant/);
  });

  it('escapes interpolated values in HTML and not in text', async () => {
    const registry = new TemplateRegistry([
      {
        id: 'test',
        channels: ['email'],
        body: 'Hello {{name}}',
        html: '<p>Hello {{name}}</p>',
      },
    ]);

    const rendered = await registry.render('test', { name: '<script>alert(1)</script>' });
    expect(rendered.body).toBe('Hello <script>alert(1)</script>');
    expect(rendered.html).toBe('<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('does not evaluate anything beyond a name lookup', async () => {
    const registry = new TemplateRegistry([
      { id: 'test', channels: ['email'], body: 'X{{constructor.constructor}}Y{{__proto__}}Z' },
    ]);
    const rendered = await registry.render('test', {});
    expect(rendered.body).toBe('XYZ');
  });

  it('renders nothing for an object variable', async () => {
    const registry = new TemplateRegistry([
      { id: 'test', channels: ['email'], body: 'A{{value}}B' },
    ]);
    expect((await registry.render('test', { value: { secret: 'x' } })).body).toBe('AB');
  });

  it('falls back through locales rather than failing to notify', async () => {
    const registry = new TemplateRegistry(
      [{ id: 't', channels: ['email'], body: 'english' }],
      'en',
    );
    registry.register({ id: 't', channels: ['email'], body: 'français' }, 'fr');

    expect((await registry.render('t', {}, { locale: 'fr' })).body).toBe('français');
    expect((await registry.render('t', {}, { locale: 'fr-CA' })).body).toBe('français');
    expect((await registry.render('t', {}, { locale: 'de' })).body).toBe('english');
  });
});

describe('sending', () => {
  it('renders and delivers', async () => {
    const { notifications, transport } = service();

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      templateId: 'security.mfa-enabled',
      variables: { productName: 'Munaxa Docs', changedAt: 'today' },
    });

    expect(result.delivered).toBe(true);
    expect(transport.last()?.subject).toBe('Two-factor authentication enabled');
    expect(transport.last()?.id).toMatch(/^ntf_/);
  });

  it('sends an ad-hoc message without a template', async () => {
    const { notifications, transport } = service();
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      subject: 'Hello',
      body: 'Plain body',
    });
    expect(transport.last()?.body).toBe('Plain body');
  });

  it('retries a transient failure', async () => {
    const transport = new MemoryTransport('email');
    transport.failures = 2;
    const { notifications } = service({ transport, maxAttempts: 3 });

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      body: 'x',
    });

    expect(result.delivered).toBe(true);
    expect(transport.sent).toHaveLength(1);
  });

  it('does not retry a permanent failure', async () => {
    const transport = new MemoryTransport('email');
    transport.failures = 5;
    transport.retryable = false;
    const { notifications } = service({ transport, maxAttempts: 3 });

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'bad-address' },
      body: 'x',
    });

    expect(result.delivered).toBe(false);
    // One attempt consumed, not three: a malformed address will not become valid on a retry.
    expect(transport.failures).toBe(4);
  });

  it('falls back to the next transport for the channel', async () => {
    const primary = new MemoryTransport('email', 'primary');
    primary.failures = 10;
    const backup = new MemoryTransport('email', 'backup');
    const events: string[] = [];

    const notifications = new NotificationService({
      transports: [primary, backup],
      clock: new FixedClock(0),
      maxAttempts: 1,
      retryDelay: 1,
      onEvent: (event) => void events.push(`${event.type}:${event.transport ?? ''}`),
    });

    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      body: 'x',
    });

    expect(result.delivered).toBe(true);
    expect(backup.sent).toHaveLength(1);
    expect(events).toContain('sent:backup');
  });

  it('suppresses a duplicate inside the window', async () => {
    const { notifications, transport, clock } = service({ dedupeWindow: 60_000 });
    const send = () =>
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'the same message',
      });

    expect((await send()).delivered).toBe(true);
    expect((await send()).error).toBe('suppressed-duplicate');
    expect(transport.sent).toHaveLength(1);

    clock.advance(60_001);
    expect((await send()).delivered).toBe(true);
  });

  it('never suppresses a critical security notification', async () => {
    const { notifications, transport } = service({ dedupeWindow: 60_000 });
    const send = () =>
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'Your password was changed',
        priority: 'critical',
      });

    await send();
    await send();
    expect(transport.sent).toHaveLength(2);
  });

  it('throws when a critical notification has no transport at all', async () => {
    const notifications = new NotificationService({ transports: [], clock: new FixedClock(0) });

    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'Your password was changed',
        priority: 'critical',
      }),
    ).rejects.toThrow(/No transport registered/);
  });

  it('reports a missing transport for a routine notification without throwing', async () => {
    const notifications = new NotificationService({ transports: [], clock: new FixedClock(0) });
    const result = await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'sms',
      recipient: { phone: '+123' },
      body: 'x',
    });
    expect(result.delivered).toBe(false);
  });
});

describe('transports', () => {
  it('logs instead of sending', async () => {
    const logger = new MemoryLogger();
    const notifications = new NotificationService({
      transports: [new LoggingTransport(logger)],
      clock: new FixedClock(0),
    });

    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      body: 'Reset link: https://app.test/reset?token=abc',
    });

    expect(logger.find('notification.logged')).toBeDefined();
  });

  it('discards on a null transport', async () => {
    const notifications = new NotificationService({
      transports: [new NullTransport('push')],
      clock: new FixedClock(0),
    });
    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'push',
        recipient: { deviceTokens: ['t'] },
        body: 'x',
      }),
    ).resolves.toMatchObject({ delivered: true });
  });

  it('routes by tenant with a fallback', async () => {
    const dedicated = new MemoryTransport('email', 'dedicated');
    const shared = new MemoryTransport('email', 'shared');
    const routing = new TenantRoutingTransport('email', new Map([['acme', dedicated]]), shared);
    const notifications = new NotificationService({
      transports: [routing],
      clock: new FixedClock(0),
    });

    await notifications.send({
      tenantId: 'acme' as never,
      channel: 'email',
      recipient: { email: 'a@acme.test' },
      body: 'x',
    });
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'b@other.test' },
      body: 'x',
    });

    expect(dedicated.sent).toHaveLength(1);
    expect(shared.sent).toHaveLength(1);
  });
});

describe('the secret guard', () => {
  it.each([
    'password',
    'newPassword',
    'temporaryPassword',
    'refreshToken',
    'apiKey',
    'totpSecret',
    'recoveryCodes',
  ])('refuses to send a payload containing %s', async (field) => {
    const { notifications } = service();

    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'x',
        variables: { [field]: 'value' },
      }),
    ).rejects.toThrow(SecretLeakError);
  });

  it('allows a one-time code, which is the message rather than a stored credential', async () => {
    const { notifications, transport } = service();
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      templateId: 'security.email-otp',
      variables: { productName: 'Docs', code: '123456', expiresInMinutes: 10 },
    });
    expect(transport.last()?.body).toContain('123456');
  });
});
