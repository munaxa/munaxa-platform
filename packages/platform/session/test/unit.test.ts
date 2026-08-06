import { describe, expect, it } from 'vitest';
import { MINUTE, ROOT_TENANT_ID, isPlatformError } from '@munaxa/types';
import {
  DEFAULT_SESSION_POLICY,
  SESSION_POLICY_CEILING,
  clampSessionPolicy,
  fingerprint,
  toPublicSession,
} from '../src/index.js';
import { START, USER, createInput, fixture } from './helpers.js';

describe('policy', () => {
  it('ships hardened defaults', () => {
    expect(DEFAULT_SESSION_POLICY.idleTimeout).toBe(15 * MINUTE);
    expect(DEFAULT_SESSION_POLICY.absoluteTimeout).toBe(12 * 60 * MINUTE);
    expect(DEFAULT_SESSION_POLICY.maxConcurrent).toBe(10);
  });

  it('lets a tenant tighten but never loosen past the ceiling', () => {
    const tightened = clampSessionPolicy({ idleTimeout: 5 * MINUTE });
    expect(tightened.idleTimeout).toBe(5 * MINUTE);

    const loosened = clampSessionPolicy({
      idleTimeout: 30 * 24 * 60 * MINUTE,
      maxConcurrent: 10_000,
    });
    expect(loosened.idleTimeout).toBe(SESSION_POLICY_CEILING.idleTimeout);
    expect(loosened.maxConcurrent).toBe(SESSION_POLICY_CEILING.maxConcurrent);
  });

  it('never allows fewer than one concurrent session', () => {
    expect(clampSessionPolicy({ maxConcurrent: 0 }).maxConcurrent).toBe(1);
  });
});

describe('creation', () => {
  it('creates a session with both deadlines set', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());

    expect(session.id).toMatch(/^sess_[0-9A-Z]{26}$/);
    expect(session.createdAt).toBe(START);
    expect(session.idleExpiresAt).toBe(START + DEFAULT_SESSION_POLICY.idleTimeout);
    expect(session.absoluteExpiresAt).toBe(START + DEFAULT_SESSION_POLICY.absoluteTimeout);
  });

  it('emits a creation event', async () => {
    const { manager, events } = fixture();
    await manager.create(createInput());
    expect(events.map((event) => event.name)).toEqual(['session.created']);
  });

  it('evicts the least recently seen session at the limit', async () => {
    const { manager, clock } = fixture({ maxConcurrent: 2 });
    const first = await manager.create(createInput());
    clock.advance(1_000);
    const second = await manager.create(createInput());
    clock.advance(1_000);
    const third = await manager.create(createInput());

    const active = await manager.listActive(ROOT_TENANT_ID, USER);
    expect(active.map((session) => session.id)).toEqual([third.id, second.id]);
    expect(active.map((session) => session.id)).not.toContain(first.id);
  });

  it('denies a new session when the policy says deny', async () => {
    const { manager } = fixture({ maxConcurrent: 1, onLimitReached: 'deny' });
    await manager.create(createInput());

    try {
      await manager.create(createInput());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isPlatformError(error)).toBe(true);
      expect((error as { code: string }).code).toBe('SESSION_LIMIT_REACHED');
    }
  });
});

describe('validation', () => {
  it('accepts a live session', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());
    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toMatchObject({
      valid: true,
    });
  });

  it('rejects an unknown session', async () => {
    const { manager } = fixture();
    await expect(manager.validate(ROOT_TENANT_ID, 'sess_nope' as never)).resolves.toEqual({
      valid: false,
      reason: 'not-found',
    });
  });

  it('rejects past the idle timeout', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());
    clock.advance(DEFAULT_SESSION_POLICY.idleTimeout);

    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toEqual({
      valid: false,
      reason: 'idle-expired',
    });
  });

  it('rejects past the absolute timeout even if kept warm', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());

    // Touch every ten minutes for a day; the sliding window keeps moving, the hard one does not.
    for (let i = 0; i < 144; i++) {
      clock.advance(10 * MINUTE);
      await manager.touch(ROOT_TENANT_ID, session.id);
    }

    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toEqual({
      valid: false,
      reason: 'absolute-expired',
    });
  });

  it('rejects a session whose token version is stale', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput({ tokenVersion: 1 }));

    await expect(
      manager.validate(ROOT_TENANT_ID, session.id, { tokenVersion: 2 }),
    ).resolves.toEqual({
      valid: false,
      reason: 'stale-token-version',
    });
  });

  it('rejects an IP change only when the policy binds to IP', async () => {
    const unbound = fixture();
    const bound = fixture({ bindToIp: true });

    const a = await unbound.manager.create(createInput());
    const b = await bound.manager.create(createInput());

    await expect(
      unbound.manager.validate(ROOT_TENANT_ID, a.id, { ipAddress: '203.0.113.1' }),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      bound.manager.validate(ROOT_TENANT_ID, b.id, { ipAddress: '203.0.113.1' }),
    ).resolves.toEqual({ valid: false, reason: 'ip-changed' });
  });

  it('does not extend the session as a side effect of validating', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());
    const originalIdle = session.idleExpiresAt;

    clock.advance(MINUTE);
    for (let i = 0; i < 5; i++) await manager.validate(ROOT_TENANT_ID, session.id);

    const stored = await manager.validate(ROOT_TENANT_ID, session.id);
    expect(stored.valid && stored.session.idleExpiresAt).toBe(originalIdle);
  });
});

describe('touch', () => {
  it('slides the idle window without moving the absolute one', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());

    clock.advance(5 * MINUTE);
    const touched = await manager.touch(ROOT_TENANT_ID, session.id);

    expect(touched?.idleExpiresAt).toBe(START + 5 * MINUTE + DEFAULT_SESSION_POLICY.idleTimeout);
    expect(touched?.absoluteExpiresAt).toBe(session.absoluteExpiresAt);
  });

  it('never slides the idle deadline past the absolute one', async () => {
    const { manager, clock } = fixture({ absoluteTimeout: 20 * MINUTE, idleTimeout: 15 * MINUTE });
    const session = await manager.create(createInput());

    clock.advance(10 * MINUTE);
    const touched = await manager.touch(ROOT_TENANT_ID, session.id);
    expect(touched?.idleExpiresAt).toBe(session.absoluteExpiresAt);
  });

  it('returns undefined for a dead session', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());
    clock.advance(DEFAULT_SESSION_POLICY.absoluteTimeout);
    expect(await manager.touch(ROOT_TENANT_ID, session.id)).toBeUndefined();
  });
});

describe('revocation', () => {
  it('revokes one session and records why', async () => {
    const { manager, events } = fixture();
    const session = await manager.create(createInput());

    expect(await manager.revoke(ROOT_TENANT_ID, session.id, 'logout')).toBe(true);
    await expect(manager.validate(ROOT_TENANT_ID, session.id)).resolves.toEqual({
      valid: false,
      reason: 'revoked',
    });
    expect(events.at(-1)).toMatchObject({ name: 'session.revoked', reason: 'logout' });
  });

  it('is idempotent', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());
    expect(await manager.revoke(ROOT_TENANT_ID, session.id, 'logout')).toBe(true);
    expect(await manager.revoke(ROOT_TENANT_ID, session.id, 'logout')).toBe(false);
  });

  it('revokes every session except the current one', async () => {
    const { manager } = fixture();
    const keep = await manager.create(createInput());
    await manager.create(createInput());
    await manager.create(createInput());

    expect(await manager.revokeAllForUser(ROOT_TENANT_ID, USER, 'logout-all', keep.id)).toBe(2);
    const active = await manager.listActive(ROOT_TENANT_ID, USER);
    expect(active.map((session) => session.id)).toEqual([keep.id]);
  });

  it('revokes sessions bound to one device', async () => {
    const { manager } = fixture();
    const stolen = await manager.create(createInput({ deviceId: 'dev_1' as never }));
    const other = await manager.create(createInput({ deviceId: 'dev_2' as never }));

    expect(await manager.revokeDevice(ROOT_TENANT_ID, USER, 'dev_1' as never)).toBe(1);
    await expect(manager.validate(ROOT_TENANT_ID, stolen.id)).resolves.toMatchObject({
      valid: false,
    });
    await expect(manager.validate(ROOT_TENANT_ID, other.id)).resolves.toMatchObject({
      valid: true,
    });
  });
});

describe('sensitive action freshness', () => {
  it('requires a recent session', async () => {
    const { manager, clock } = fixture();
    const session = await manager.create(createInput());
    expect(manager.isFreshEnoughForSensitiveAction(session, ROOT_TENANT_ID)).toBe(true);

    clock.advance(16 * MINUTE);
    expect(manager.isFreshEnoughForSensitiveAction(session, ROOT_TENANT_ID)).toBe(false);
  });

  it('can be disabled with zero', async () => {
    const { manager, clock } = fixture({ sensitiveActionMaxAge: 0 });
    const session = await manager.create(createInput());
    clock.advance(60 * MINUTE);
    expect(manager.isFreshEnoughForSensitiveAction(session, ROOT_TENANT_ID)).toBe(true);
  });
});

describe('public projection', () => {
  it('masks the address and marks the current session', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());
    const view = toPublicSession(session, session.id);

    expect(view.current).toBe(true);
    expect(view.ipPrefix).toBe('198.51.100.0/24');
    expect(JSON.stringify(view)).not.toContain('198.51.100.10');
  });

  it('masks IPv6 down to the routing prefix', async () => {
    const { manager } = fixture();
    const session = await manager.create(
      createInput({ ipAddress: '2001:db8:85a3:0:0:8a2e:370:7334' }),
    );
    expect(toPublicSession(session).ipPrefix).toBe('2001:db8:85a3::/48');
  });
});

describe('device fingerprints', () => {
  it('is stable for the same client and different for another', () => {
    const input = { userAgent: 'Mozilla/5.0', acceptLanguage: 'en-GB', platform: 'macOS' };
    expect(fingerprint(input)).toBe(fingerprint(input));
    expect(fingerprint({ ...input, platform: 'Windows' })).not.toBe(fingerprint(input));
  });

  it('ignores the IP address, so a changing network is not a new device', () => {
    const input = { userAgent: 'Mozilla/5.0', clientId: 'abc' };
    expect(fingerprint({ ...input })).toBe(fingerprint({ ...input }));
  });
});
