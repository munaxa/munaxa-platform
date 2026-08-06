import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  MemoryTransport,
  NotificationService,
  SECURITY_TEMPLATES,
  TemplateRegistry,
} from '../src/index.js';

/**
 * Template ids are referenced from product code and from operational runbooks ("resend
 * security.password-changed"), and the variables each one requires are supplied by callers this
 * package does not own. Both are contracts; adding an optional variable is safe, renaming an id
 * or adding a required variable is not.
 */
const TEMPLATE_IDS_1_0 = [
  'security.password-changed',
  'security.password-reset-requested',
  'security.new-device',
  'security.mfa-enabled',
  'security.mfa-disabled',
  'security.account-locked',
  'security.email-otp',
];

const REQUIRED_1_0: Readonly<Record<string, readonly string[]>> = {
  'security.password-changed': ['productName', 'changedAt', 'securityUrl'],
  'security.password-reset-requested': ['productName', 'resetUrl', 'expiresInMinutes'],
  'security.new-device': ['productName', 'location', 'signedInAt', 'securityUrl'],
  'security.mfa-enabled': ['productName', 'changedAt'],
  'security.email-otp': ['productName', 'code', 'expiresInMinutes'],
};

describe('1.0 template catalogue', () => {
  it.each(TEMPLATE_IDS_1_0)('still ships %s', (id) => {
    expect(SECURITY_TEMPLATES.map((template) => template.id)).toContain(id);
  });

  it('requires no more variables than 1.0 did', () => {
    const registry = new TemplateRegistry([...SECURITY_TEMPLATES]);
    for (const [id, required] of Object.entries(REQUIRED_1_0)) {
      const template = registry.get(id);
      expect(template, id).toBeDefined();
      for (const name of template?.required ?? []) {
        expect(required, `${id} added a required variable: ${name}`).toContain(name);
      }
    }
  });

  it('keeps the channels each template supports', () => {
    const registry = new TemplateRegistry([...SECURITY_TEMPLATES]);
    expect(registry.get('security.password-changed')?.channels).toContain('email');
    expect(registry.get('security.new-device')?.channels).toContain('push');
  });
});

describe('1.0 message shape', () => {
  it('keeps the fields a transport reads', async () => {
    const transport = new MemoryTransport('email');
    const notifications = new NotificationService({
      transports: [transport],
      templates: new TemplateRegistry([...SECURITY_TEMPLATES]),
      clock: new FixedClock(0),
    });

    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'ada@example.com' },
      templateId: 'security.mfa-enabled',
      variables: { productName: 'Docs', changedAt: 'today' },
    });

    expect(Object.keys(transport.last() ?? {})).toEqual(
      expect.arrayContaining([
        'id',
        'tenantId',
        'channel',
        'recipient',
        'body',
        'priority',
        'subject',
        'templateId',
      ]),
    );
  });

  it('keeps the ntf_ id prefix', async () => {
    const transport = new MemoryTransport('email');
    const notifications = new NotificationService({
      transports: [transport],
      clock: new FixedClock(0),
    });
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'a@b.test' },
      body: 'x',
    });
    expect(transport.last()?.id).toMatch(/^ntf_/);
  });
});
