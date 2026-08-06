import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, ROOT_TENANT_ID, toTenantId } from '@munaxa/types';
import { SessionManager, toPublicSession } from '../src/index.js';
import { START, USER, createInput, fixture } from './helpers.js';

/**
 * The flows a product actually ships: sign in on a new device, verify a second factor, come back
 * a week later without being challenged, then change the password and have everything drop.
 */
describe('device trust across logins', () => {
  it('challenges a new device, remembers it after MFA, and forgets it on a password change', async () => {
    const { manager, devices, clock } = fixture();
    const client = { userAgent: 'Mozilla/5.0', platform: 'macOS', clientId: 'browser-1' };

    // First visit: unknown device, so the product should challenge for a second factor.
    const first = await devices.recognize(ROOT_TENANT_ID, USER, client);
    expect(first.isNew).toBe(true);
    expect(first.trusted).toBe(false);

    // The second factor succeeded, so the device may be remembered.
    await devices.trust(ROOT_TENANT_ID, first.device.id);
    const session = await manager.create(
      createInput({
        deviceId: first.device.id,
        mfaSatisfied: true,
        authMethods: ['password', 'totp'],
      }),
    );

    // A week later, the same browser is recognised and still trusted.
    clock.advance(7 * DAY);
    const returning = await devices.recognize(ROOT_TENANT_ID, USER, client);
    expect(returning.isNew).toBe(false);
    expect(returning.trusted).toBe(true);
    expect(returning.device.id).toBe(first.device.id);

    // The password changes: every session dies and every device loses its trust.
    await manager.revokeAllForUser(ROOT_TENANT_ID, USER, 'password-changed');
    await devices.untrustAll(ROOT_TENANT_ID, USER);

    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toMatchObject({
      valid: false,
    });
    expect((await devices.recognize(ROOT_TENANT_ID, USER, client)).trusted).toBe(false);
  });

  it('expires device trust on schedule', async () => {
    const { devices, clock } = fixture();
    const client = { clientId: 'browser-1' };
    const { device } = await devices.recognize(ROOT_TENANT_ID, USER, client);
    await devices.trust(ROOT_TENANT_ID, device.id, 30 * DAY);

    clock.advance(29 * DAY);
    expect((await devices.recognize(ROOT_TENANT_ID, USER, client)).trusted).toBe(true);

    clock.advance(2 * DAY);
    expect((await devices.recognize(ROOT_TENANT_ID, USER, client)).trusted).toBe(false);
  });

  it('treats a different browser on the same machine as a different device', async () => {
    const { devices } = fixture();
    const safari = await devices.recognize(ROOT_TENANT_ID, USER, {
      userAgent: 'Safari/17',
      platform: 'macOS',
    });
    const chrome = await devices.recognize(ROOT_TENANT_ID, USER, {
      userAgent: 'Chrome/120',
      platform: 'macOS',
    });

    expect(chrome.device.id).not.toBe(safari.device.id);
    expect(chrome.isNew).toBe(true);
  });
});

describe('the sessions screen', () => {
  it('lists a user’s devices and lets them revoke one', async () => {
    const { manager, clock } = fixture();

    const laptop = await manager.create(
      createInput({ userAgent: 'Chrome/120', deviceId: 'dev_laptop' as never }),
    );
    clock.advance(MINUTE);
    const phone = await manager.create(
      createInput({ userAgent: 'Safari/17', deviceId: 'dev_phone' as never }),
    );

    const listed = (await manager.listActive(ROOT_TENANT_ID, USER)).map((session) =>
      toPublicSession(session, phone.id),
    );

    expect(listed.map((view) => view.id)).toEqual([phone.id, laptop.id]);
    expect(listed[0]?.current).toBe(true);

    await manager.revoke(ROOT_TENANT_ID, laptop.id, 'admin-revoked');
    expect((await manager.listActive(ROOT_TENANT_ID, USER)).map((session) => session.id)).toEqual([
      phone.id,
    ]);
  });
});

describe('per-tenant policy', () => {
  it('applies a tighter timeout for one tenant only', async () => {
    const { store, clock } = fixture();
    const bank = toTenantId('bank');

    const manager = new SessionManager({
      store,
      clock,
      policy: { idleTimeout: 15 * MINUTE },
      policyFor: (tenantId) => (tenantId === bank ? { idleTimeout: 5 * MINUTE } : undefined),
    });

    const strict = await manager.create(createInput({ tenantId: bank }));
    const relaxed = await manager.create(createInput({ tenantId: ROOT_TENANT_ID }));

    expect(strict.idleExpiresAt).toBe(START + 5 * MINUTE);
    expect(relaxed.idleExpiresAt).toBe(START + 15 * MINUTE);

    clock.advance(6 * MINUTE);
    await expect(manager.validate(bank, strict.id)).resolves.toMatchObject({ valid: false });
    await expect(manager.validate(ROOT_TENANT_ID, relaxed.id)).resolves.toMatchObject({
      valid: true,
    });
  });
});

describe('housekeeping', () => {
  it('purges expired sessions from a store without native expiry', async () => {
    const { manager, store, clock } = fixture();
    await manager.create(createInput());
    await manager.create(createInput());
    expect(store.size).toBe(2);

    clock.advance(13 * 60 * MINUTE);
    expect(await manager.purgeExpired(ROOT_TENANT_ID)).toBe(2);
    expect(store.size).toBe(0);
  });
});

describe('events feed the audit trail', () => {
  it('emits one event per lifecycle transition, with the reason attached', async () => {
    const { manager, events, clock } = fixture({ maxConcurrent: 1 });

    const first = await manager.create(createInput());
    clock.advance(MINUTE);
    await manager.create(createInput()); // evicts the first
    await manager.revokeAllForUser(ROOT_TENANT_ID, USER, 'logout-all');

    const names = events.map((event) => event.name);
    expect(names).toContain('session.created');
    expect(names).toContain('session.revoked');
    expect(names).toContain('session.limit.reached');

    const eviction = events.find(
      (event) => event.name === 'session.revoked' && event.session.id === first.id,
    );
    expect(eviction?.reason).toBe('concurrency-limit');
  });
});
