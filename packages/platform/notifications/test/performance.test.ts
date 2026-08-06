import { describe, expect, it } from 'vitest';
import { FixedClock, ROOT_TENANT_ID } from '@munaxa/types';
import {
  /**
   * Budgets carry roughly 2.5x headroom over an idle machine. `turbo run test` runs every package
   * concurrently on the same cores, and a budget tuned on an idle laptop fails on a busy CI runner —
   * which teaches everyone to ignore the suite. These catch order-of-magnitude regressions, which is
   * what they are for.
   */
  MemoryTransport,
  NotificationService,
  SECURITY_TEMPLATES,
  TemplateRegistry,
} from '../src/index.js';

describe('rendering cost', () => {
  it('renders a template in microseconds', async () => {
    const registry = new TemplateRegistry([...SECURITY_TEMPLATES]);
    const variables = {
      productName: 'Docs',
      changedAt: 'today',
      securityUrl: 'https://app.test/s',
    };

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) await registry.render('security.password-changed', variables);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('does not degrade with a large template catalogue', async () => {
    const registry = new TemplateRegistry(
      Array.from({ length: 2_000 }, (_, i) => ({
        id: `template-${i}`,
        channels: ['email' as const],
        body: 'Hello {{name}}',
      })),
    );

    const start = performance.now();
    for (let i = 0; i < 20_000; i++) await registry.render('template-1999', { name: 'Ada' });
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it('bounds interpolation work on a large body', async () => {
    const registry = new TemplateRegistry([
      { id: 'big', channels: ['email'], body: `${'text '.repeat(20_000)}{{name}}` },
    ]);

    const start = performance.now();
    for (let i = 0; i < 200; i++) await registry.render('big', { name: 'Ada' });
    expect(performance.now() - start).toBeLessThan(2_500);
  });
});

describe('send cost', () => {
  it('sends without measurable platform overhead', async () => {
    const transport = new MemoryTransport('email');
    const notifications = new NotificationService({
      transports: [transport],
      templates: new TemplateRegistry([...SECURITY_TEMPLATES]),
      clock: new FixedClock(0),
      dedupeWindow: 0,
    });

    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      await notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: `user-${i}@example.com` },
        templateId: 'security.mfa-enabled',
        variables: { productName: 'Docs', changedAt: 'today' },
      });
    }
    expect(performance.now() - start).toBeLessThan(7_500);
  });

  it('keeps the deduplication table bounded under sustained sending', async () => {
    const clock = new FixedClock(0);
    const notifications = new NotificationService({
      transports: [new MemoryTransport('email')],
      clock,
      dedupeWindow: 1_000,
    });

    for (let i = 0; i < 20_000; i++) {
      clock.advance(1);
      await notifications.send({
        tenantId: ROOT_TENANT_ID,
        channel: 'email',
        recipient: { email: `user-${i}@example.com` },
        body: 'x',
      });
    }

    // The table prunes itself rather than growing with every message ever sent.
    const start = performance.now();
    await notifications.send({
      tenantId: ROOT_TENANT_ID,
      channel: 'email',
      recipient: { email: 'final@example.com' },
      body: 'x',
    });
    expect(performance.now() - start).toBeLessThan(50);
  });
});
