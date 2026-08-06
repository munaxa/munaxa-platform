import { describe, expect, it } from 'vitest';
import type { RefreshFamily, RefreshFamilyStorePort } from '@munaxa/interfaces';
import {
  FixedClock,
  unsafeId,
  type SessionId,
  type TenantId,
  type TokenFamilyId,
  type UserId,
} from '@munaxa/types';
import {
  MemoryRefreshFamilyStore,
  SessionManager,
  sessionStoreOverFamilies,
  toFamily,
  toSession,
} from '../src/index.js';

/**
 * P-5: a product whose only server-side auth object is a refresh-token lineage must get the same
 * session guarantees as one with a `sessions` table — without adding that table.
 */

const TENANT = 'acme' as TenantId;
const USER = unsafeId<UserId>('u1');
const NOW = 1_700_000_000_000;

function family(overrides: Partial<RefreshFamily> = {}): RefreshFamily {
  return {
    id: unsafeId<TokenFamilyId>('fam-1'),
    tenantId: TENANT,
    userId: USER,
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: NOW + 900_000,
    absoluteExpiresAt: NOW + 43_200_000,
    authMethods: ['password'],
    mfaSatisfied: false,
    tokenVersion: 1,
    ...overrides,
  };
}

function manager(store: RefreshFamilyStorePort): SessionManager {
  return new SessionManager({
    store: sessionStoreOverFamilies(store),
    clock: new FixedClock(NOW),
    policy: { maxConcurrent: 2, onLimitReached: 'evict-oldest' },
  });
}

describe('the mapping', () => {
  it('changes the identifier brand and nothing else', () => {
    // If this ever loses or defaults a field, a product adopting the family path silently gets
    // different lifecycle behaviour from one on the stateful path.
    const original = family();
    const roundTripped = toFamily(toSession(original));
    expect(roundTripped).toEqual(original);
    expect(toSession(original).id).toBe(original.id);
  });
});

describe('SessionManager over a refresh-family store', () => {
  it('creates, validates and revokes without a sessions table', async () => {
    const store = new MemoryRefreshFamilyStore();
    const sessions = manager(store);

    const created = await sessions.create({
      tenantId: TENANT,
      userId: USER,
      authMethods: ['password'],
      mfaSatisfied: true,
      tokenVersion: 1,
    });

    expect((await sessions.validate(TENANT, created.id)).valid).toBe(true);
    // The row the product already had is the row the platform wrote to.
    expect(store.size).toBe(1);

    await sessions.revoke(TENANT, created.id, 'logout');
    const after = await sessions.validate(TENANT, created.id);
    expect(after.valid).toBe(false);
    expect(after.valid === false && after.reason).toBe('revoked');
  });

  it('reports store-transaction enforcement, not best-effort', async () => {
    // The requirement the first consumer stopped on: a limit that is really a limit. The family
    // store implements `createWithinLimit`, so the manager is exact rather than hopeful.
    expect(manager(new MemoryRefreshFamilyStore()).limitEnforcement).toBe('store-transaction');
  });

  it('reports the true mode when the store cannot enforce', async () => {
    // A family store without `createWithinLimit` must not be dressed up as one that has it.
    const store = new MemoryRefreshFamilyStore();
    const partial: RefreshFamilyStorePort = {
      create: store.create.bind(store),
      get: store.get.bind(store),
      listByUser: store.listByUser.bind(store),
      update: store.update.bind(store),
      delete: store.delete.bind(store),
      deleteExpired: store.deleteExpired.bind(store),
    };
    // `in` rather than reading the property: the point is that the capability is absent, and the
    // adapter must not define it as `undefined` either — `SessionManager` tests truthiness.
    expect('createWithinLimit' in sessionStoreOverFamilies(partial)).toBe(false);
    expect(manager(partial).limitEnforcement).toBe('best-effort');
  });

  it('enforces the concurrency limit under a parallel burst', async () => {
    // A mobile client reconnecting is the normal input to this control. Sequential tests cannot
    // fail here; this one can.
    const store = new MemoryRefreshFamilyStore();
    const sessions = manager(store);

    await Promise.all(
      Array.from({ length: 12 }, async () =>
        sessions.create({
          tenantId: TENANT,
          userId: USER,
          authMethods: ['password'],
          mfaSatisfied: true,
          tokenVersion: 1,
        }),
      ),
    );

    const live = (await store.listByUser(TENANT, USER)).filter(
      (record) => record.revokedAt === undefined,
    );
    expect(live).toHaveLength(2);
  });
});

describe('identifier format', () => {
  it('mints the platform id by default', async () => {
    const created = await manager(new MemoryRefreshFamilyStore()).create({
      tenantId: TENANT,
      userId: USER,
      authMethods: ['password'],
      mfaSatisfied: true,
      tokenVersion: 1,
    });
    expect(created.id).toMatch(/^sess_/);
  });

  it('uses the product generator when the store constrains the format', async () => {
    // A `uuid` column will not accept `sess_…`. Without this the product would have to migrate the
    // column type and every foreign key pointing at it in exchange for an identifier format.
    const store = new MemoryRefreshFamilyStore();
    let n = 0;
    const sessions = new SessionManager({
      store: sessionStoreOverFamilies(store),
      clock: new FixedClock(NOW),
      generateId: () => unsafeId<SessionId>(`00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`),
    });

    const created = await sessions.create({
      tenantId: TENANT,
      userId: USER,
      authMethods: ['password'],
      mfaSatisfied: true,
      tokenVersion: 1,
    });

    expect(created.id).toBe('00000000-0000-7000-8000-000000000001');
    // …and the record round-trips under that id, so the store really is keyed by it.
    expect((await sessions.validate(TENANT, created.id)).valid).toBe(true);
  });
});

describe('MemoryRefreshFamilyStore', () => {
  it('denies rather than evicting when told to', async () => {
    const store = new MemoryRefreshFamilyStore();
    const limit = { maxConcurrent: 1, onLimitReached: 'deny', now: NOW } as const;

    expect((await store.createWithinLimit(family({ id: 'a' as TokenFamilyId }), limit)).created).toBe(
      true,
    );
    const second = await store.createWithinLimit(family({ id: 'b' as TokenFamilyId }), limit);
    expect(second.created).toBe(false);
    expect(second.evicted).toEqual([]);
    expect(store.size).toBe(1);
  });

  it('does not count an expired or revoked family toward the limit', async () => {
    const store = new MemoryRefreshFamilyStore();
    await store.create(family({ id: 'expired' as TokenFamilyId, idleExpiresAt: NOW - 1 }));
    await store.create(family({ id: 'revoked' as TokenFamilyId, revokedAt: NOW - 1 }));

    expect(await store.countActive(TENANT, USER, NOW)).toBe(0);
    const outcome = await store.createWithinLimit(family({ id: 'fresh' as TokenFamilyId }), {
      maxConcurrent: 1,
      onLimitReached: 'deny',
      now: NOW,
    });
    expect(outcome.created).toBe(true);
  });

  it('does not return a family to another tenant', async () => {
    const store = new MemoryRefreshFamilyStore();
    await store.create(family());
    expect(await store.get('other' as TenantId, unsafeId<TokenFamilyId>('fam-1'))).toBeUndefined();
    expect(await store.delete('other' as TenantId, unsafeId<TokenFamilyId>('fam-1'))).toBe(false);
  });
});
