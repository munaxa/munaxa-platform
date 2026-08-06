import type { SessionRecord, SessionStorePort } from '@munaxa/interfaces';
import type { SessionId, TenantId, UserId } from '@munaxa/types';
import { race, tick, type TestHarness } from './harness.js';

/**
 * `SessionStorePort` conformance.
 *
 * Two things: tenant scoping on every read (a session id that appears in a cookie, a log and a
 * support ticket must not be redeemable by another tenant that guesses it), and — for adapters
 * that implement it — that `createWithinLimit` really is atomic.
 *
 * The limit tests are skipped when the adapter does not implement `createWithinLimit`. That is
 * not a free pass: `SessionManager.limitEnforcement` will report `distributed-lock` or
 * `best-effort`, and the product has to know which.
 */
export interface SessionConformanceOptions {
  createStore(): SessionStorePort | Promise<SessionStorePort>;
  makeSession(overrides?: Partial<SessionRecord>): SessionRecord;
  concurrency?: number;
}

export function runSessionConformance(
  harness: TestHarness,
  options: SessionConformanceOptions,
): void {
  const { describe, it, expect } = harness;
  const concurrency = options.concurrency ?? 25;

  describe('SessionStorePort conformance', () => {
    it('round-trips a session', async () => {
      const store = await options.createStore();
      const session = options.makeSession();
      await store.create(session);

      expect((await store.get(session.tenantId, session.id))?.id).toBe(session.id);
    });

    it('does not return a session to another tenant', async () => {
      const store = await options.createStore();
      const session = options.makeSession();
      await store.create(session);

      // Indistinguishable from a miss, on purpose: an id-guessing attacker learns nothing.
      expect(await store.get('other-tenant' as TenantId, session.id)).toBeUndefined();
    });

    it('does not list another user’s sessions', async () => {
      const store = await options.createStore();
      await store.create(options.makeSession());
      expect(
        await store.listByUser(options.makeSession().tenantId, 'someone-else' as UserId),
      ).toHaveLength(0);
    });

    it('refuses to delete another tenant’s session', async () => {
      const store = await options.createStore();
      const session = options.makeSession();
      await store.create(session);

      expect(await store.delete('other-tenant' as TenantId, session.id)).toBe(false);
      expect(await store.get(session.tenantId, session.id)).toBeDefined();
    });

    it('removes sessions past either deadline', async () => {
      const store = await options.createStore();
      const now = 1_700_000_000_000;
      await store.create(
        options.makeSession({ id: 'idle' as SessionId, idleExpiresAt: now - 1 }),
      );
      await store.create(
        options.makeSession({ id: 'absolute' as SessionId, absoluteExpiresAt: now - 1 }),
      );
      await store.create(options.makeSession({ id: 'live' as SessionId }));

      const tenantId = options.makeSession().tenantId;
      expect(await store.deleteExpired(tenantId, now)).toBe(2);
      expect(await store.get(tenantId, 'live' as SessionId)).toBeDefined();
    });

    it('createWithinLimit, when implemented, never exceeds the limit under concurrency', async () => {
      const store = await options.createStore();
      if (!store.createWithinLimit) return; // reported by SessionManager.limitEnforcement instead

      const now = 1_700_000_000_000;
      const { fulfilled } = await race(concurrency, async (i) => {
        await tick(i % 3);
        return store.createWithinLimit?.(options.makeSession({ id: `sess-${i}` as SessionId }), {
          maxConcurrent: 3,
          onLimitReached: 'evict-oldest',
          now,
        });
      });

      const created = fulfilled.filter((outcome) => outcome?.created).length;
      expect(created).toBeGreaterThan(0);

      const tenantId = options.makeSession().tenantId;
      const live = (await store.listByUser(tenantId, options.makeSession().userId)).filter(
        (session) =>
          session.revokedAt === undefined &&
          now < session.idleExpiresAt &&
          now < session.absoluteExpiresAt,
      );
      expect(live.length).toBeLessThanOrEqual(3);
    });

    it('createWithinLimit refuses rather than evicting when told to deny', async () => {
      const store = await options.createStore();
      if (!store.createWithinLimit) return;

      const now = 1_700_000_000_000;
      const limit = { maxConcurrent: 1, onLimitReached: 'deny' as const, now };
      await store.createWithinLimit(options.makeSession({ id: 'first' as SessionId }), limit);
      const second = await store.createWithinLimit(
        options.makeSession({ id: 'second' as SessionId }),
        limit,
      );

      expect(second.created).toBe(false);
      expect(second.evicted).toHaveLength(0);
    });
  });
}
