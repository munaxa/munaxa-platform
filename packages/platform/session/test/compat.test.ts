import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@munaxa/interfaces';
import { HOUR, MINUTE, ROOT_TENANT_ID, unsafeId, type SessionId, type UserId } from '@munaxa/types';
import { DEFAULT_SESSION_POLICY, toPublicSession } from '../src/index.js';
import { START, createInput, fixture } from './helpers.js';

/**
 * Sessions written by one version are read by the next, in the middle of a rolling deploy. The
 * record shape and the default timings are therefore a compatibility surface: a renamed field
 * logs everyone out, and a shortened default does the same more slowly.
 */
const V1_SESSION: SessionRecord = {
  id: unsafeId<SessionId>('sess_01HQXYZABCDEFGHJKMNPQRSTV'),
  tenantId: ROOT_TENANT_ID,
  userId: unsafeId<UserId>('u1'),
  createdAt: START,
  lastSeenAt: START,
  idleExpiresAt: START + 15 * MINUTE,
  absoluteExpiresAt: START + 12 * HOUR,
  authMethods: ['password'],
  mfaSatisfied: false,
  tokenVersion: 1,
  ipAddress: '198.51.100.10',
  userAgent: 'Mozilla/5.0',
};

describe('1.0 record shape', () => {
  it('still validates a session written by 1.0', async () => {
    const { manager, store } = fixture();
    await store.create(V1_SESSION);

    await expect(manager.validate(ROOT_TENANT_ID, V1_SESSION.id)).resolves.toMatchObject({
      valid: true,
    });
  });

  it('still touches a 1.0 session, preserving its absolute deadline', async () => {
    const { manager, store, clock } = fixture();
    await store.create(V1_SESSION);

    clock.advance(MINUTE);
    const touched = await manager.touch(ROOT_TENANT_ID, V1_SESSION.id);
    expect(touched?.absoluteExpiresAt).toBe(V1_SESSION.absoluteExpiresAt);
    expect(touched?.idleExpiresAt).toBe(START + MINUTE + 15 * MINUTE);
  });

  it('still revokes a 1.0 session', async () => {
    const { manager, store } = fixture();
    await store.create(V1_SESSION);
    expect(await manager.revoke(ROOT_TENANT_ID, V1_SESSION.id, 'logout')).toBe(true);
  });

  it('emits new sessions in the same shape', async () => {
    const { manager } = fixture();
    const session = await manager.create(createInput());
    expect(Object.keys(session)).toEqual(expect.arrayContaining(Object.keys(V1_SESSION)));
  });
});

describe('1.0 defaults', () => {
  it('keeps the timings a deployment relies on', () => {
    expect(DEFAULT_SESSION_POLICY.idleTimeout).toBe(900_000);
    expect(DEFAULT_SESSION_POLICY.absoluteTimeout).toBe(43_200_000);
    expect(DEFAULT_SESSION_POLICY.maxConcurrent).toBe(10);
    expect(DEFAULT_SESSION_POLICY.onLimitReached).toBe('evict-oldest');
  });
});

describe('1.0 public projection', () => {
  it('keeps the field names a sessions screen renders', () => {
    const view = toPublicSession(V1_SESSION, V1_SESSION.id);
    expect(Object.keys(view)).toEqual(
      expect.arrayContaining([
        'id',
        'createdAt',
        'lastSeenAt',
        'current',
        'ipPrefix',
        'userAgent',
        'authMethods',
        'mfaSatisfied',
      ]),
    );
  });
});
