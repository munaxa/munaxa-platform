import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, ROOT_TENANT_ID, toTenantId, unsafeId, type UserId } from '@munaxa/types';
import { SESSION_POLICY_CEILING, clampSessionPolicy, fingerprint } from '../src/index.js';
import { USER, createInput, fixture } from './helpers.js';

describe('tenant isolation', () => {
  it('does not return a session to another tenant that guessed its id', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput({ tenantId: toTenantId('acme') }));

    await expect(manager.validate(toTenantId('globex'), session.id)).resolves.toEqual({
      valid: false,
      reason: 'not-found',
    });
  });

  it('gives the same answer for a wrong tenant and a missing session', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput({ tenantId: toTenantId('acme') }));

    const wrongTenant = await manager.validate(toTenantId('globex'), session.id);
    const missing = await manager.validate(toTenantId('globex'), 'sess_absent' as never);
    expect(wrongTenant).toEqual(missing);
  });

  it('cannot revoke another tenant’s session', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput({ tenantId: toTenantId('acme') }));

    expect(await manager.revoke(toTenantId('globex'), session.id, 'admin-revoked')).toBe(false);
    await expect(manager.validate(toTenantId('acme'), session.id)).resolves.toMatchObject({
      valid: true,
    });
  });

  it('does not list another user’s sessions', async () => {
    const { manager } = fixture();
    await manager.create(createInput());
    expect(await manager.listActive(ROOT_TENANT_ID, unsafeId<UserId>('u2'))).toEqual([]);
  });
});

describe('session fixation and lifetime', () => {
  it('issues a fresh, unguessable id per session', async () => {
    const { manager, clock } = fixture({ maxConcurrent: 100 });
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      clock.advance(1);
      ids.add((await manager.create(createInput())).id);
    }
    expect(ids.size).toBe(500);
    // Sortable prefix plus 80 bits of randomness: adjacent ids share a timestamp, not a suffix.
    const suffixes = new Set([...ids].map((id) => id.slice(-16)));
    expect(suffixes.size).toBe(500);
  });

  it('cannot be kept alive past the absolute deadline by any amount of activity', async () => {
    const { manager, clock } = fixture({ idleTimeout: 15 * MINUTE, absoluteTimeout: 60 * MINUTE });
    const session = await manager.create(createInput());

    for (let i = 0; i < 100; i++) {
      clock.advance(MINUTE);
      await manager.touch(ROOT_TENANT_ID, session.id);
    }

    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toMatchObject({
      valid: false,
      reason: 'absolute-expired',
    });
  });

  it('a revoked session stays revoked even before its deadlines', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());
    await manager.revoke(ROOT_TENANT_ID, session.id, 'risk-detected');

    clock.advance(MINUTE);
    expect(await manager.touch(ROOT_TENANT_ID, session.id)).toBeUndefined();
    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toMatchObject({
      valid: false,
      reason: 'revoked',
    });
  });

  it('invalidates every pre-existing session through the token version', async () => {
    const { manager } = fixture({ maxConcurrent: 5 });
    const sessions = [
      await manager.create(createInput({ tokenVersion: 1 })),
      await manager.create(createInput({ tokenVersion: 1 })),
    ];

    // The account's version was bumped elsewhere — a password reset, say. No session had to be
    // located and deleted for all of them to stop working.
    for (const session of sessions) {
      await expect(
        manager.validate(ROOT_TENANT_ID, session.id, { tokenVersion: 2 }),
      ).resolves.toMatchObject({ valid: false, reason: 'stale-token-version' });
    }
  });
});

describe('device trust cannot become a bypass', () => {
  it('never survives untrustAll, which is what a credential change calls', async () => {
    const { devices } = fixture();
    const client = { clientId: 'browser-1' };
    const { device } = await devices.recognize(ROOT_TENANT_ID, USER, client);
    await devices.trust(ROOT_TENANT_ID, device.id);

    expect(await devices.untrustAll(ROOT_TENANT_ID, USER)).toBe(1);
    expect((await devices.recognize(ROOT_TENANT_ID, USER, client)).trusted).toBe(false);
  });

  it('is capped by the platform ceiling however long a tenant asks for', () => {
    expect(clampSessionPolicy({ deviceTrustDuration: 3_650 * DAY }).deviceTrustDuration).toBe(
      SESSION_POLICY_CEILING.deviceTrustDuration,
    );
  });

  it('cannot be transferred between users, because trust is scoped to the account', async () => {
    const { devices } = fixture();
    const client = { clientId: 'shared-kiosk' };

    const first = await devices.recognize(ROOT_TENANT_ID, USER, client);
    await devices.trust(ROOT_TENANT_ID, first.device.id);

    // Same machine, different account: a new device record, untrusted.
    const second = await devices.recognize(ROOT_TENANT_ID, unsafeId<UserId>('u2'), client);
    expect(second.isNew).toBe(true);
    expect(second.trusted).toBe(false);
  });

  it('stores fingerprints hashed, so the device table reveals no client details', async () => {
    const { devices, registry } = fixture();
    await devices.recognize(ROOT_TENANT_ID, USER, {
      userAgent: 'Mozilla/5.0 (very-distinctive-build)',
      clientId: 'browser-1',
    });

    const stored = await registry.list(ROOT_TENANT_ID, USER);
    expect(stored[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]?.fingerprint).not.toContain('browser-1');
    expect(fingerprint({ clientId: 'browser-1', userAgent: 'Mozilla/5.0 (very-distinctive-build)' })).toBe(
      stored[0]?.fingerprint,
    );
  });
});

describe('what the user is shown', () => {
  it('never exposes a full IP address or an unbounded user agent', async () => {
    const { manager } = fixture();
    const session = await manager.create(
      createInput({ ipAddress: '198.51.100.10', userAgent: 'A'.repeat(5_000) }),
    );

    const { toPublicSession } = await import('../src/index.js');
    const view = toPublicSession(session);
    expect(JSON.stringify(view)).not.toContain('198.51.100.10');
    expect((view.userAgent as string).length).toBe(200);
  });
});
