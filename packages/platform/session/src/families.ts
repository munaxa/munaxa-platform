import type {
  RefreshFamily,
  RefreshFamilyCreateOutcome,
  RefreshFamilyStorePort,
  SessionCreateOutcome,
  SessionLimit,
  SessionRecord,
  SessionStorePort,
} from '@munaxa/interfaces';
import {
  assertSameTenant,
  unsafeId,
  type SessionId,
  type TenantId,
  type TokenFamilyId,
  type UserId,
} from '@munaxa/types';

/**
 * Refresh families as a session substrate.
 *
 * A product whose only server-side auth object is a refresh-token lineage — no `sessions` table,
 * a self-contained short-lived access token — could not previously adopt `SessionManager`: the
 * manager needs a `SessionStorePort`, and building one meant adding a table and rewiring the
 * refresh flow. That is a product change wearing a migration's clothes, and it is where the first
 * consumer stopped.
 *
 * `sessionStoreOverFamilies` closes it. The two records carry the same lifecycle fields, so the
 * mapping is a rename of the identifier and nothing else — no field is invented, defaulted or
 * dropped. What the product gets is every session guarantee the platform states, over the rows it
 * already has: idle and absolute deadlines, revocation reasons, listing, and — when the family
 * store implements `createWithinLimit` — a concurrency limit that actually holds across replicas.
 *
 * What it does not do is make a limit exact when the store cannot: `createWithinLimit` is
 * forwarded when present and absent when not, so `SessionManager.limitEnforcement` reports the
 * true mode rather than a flattering one.
 */
export function sessionStoreOverFamilies(store: RefreshFamilyStorePort): SessionStorePort {
  const base: SessionStorePort = {
    async create(session) {
      await store.create(toFamily(session));
    },
    async get(tenantId, sessionId) {
      const family = await store.get(tenantId, asFamilyId(sessionId));
      return family === undefined ? undefined : toSession(family);
    },
    async listByUser(tenantId, userId) {
      return (await store.listByUser(tenantId, userId)).map(toSession);
    },
    async update(session) {
      await store.update(toFamily(session));
    },
    async delete(tenantId, sessionId) {
      return store.delete(tenantId, asFamilyId(sessionId));
    },
    async deleteExpired(tenantId, now) {
      return store.deleteExpired(tenantId, now);
    },
  };

  // Optional capabilities are forwarded only when the underlying store has them. Defining them
  // unconditionally would make `SessionManager` report `store-transaction` enforcement for a store
  // that cannot provide it — a limit that is a hint, described as a limit.
  return {
    ...base,
    ...(store.createWithinLimit === undefined
      ? {}
      : {
          createWithinLimit: async (
            session: SessionRecord,
            limit: SessionLimit,
          ): Promise<SessionCreateOutcome> => {
            const outcome = await store.createWithinLimit!(toFamily(session), limit);
            return { created: outcome.created, evicted: outcome.evicted.map(toSession) };
          },
        }),
    ...(store.countActive === undefined
      ? {}
      : {
          countActive: (tenantId: TenantId, userId: UserId, now: number): Promise<number> =>
            store.countActive!(tenantId, userId, now),
        }),
  };
}

/**
 * The identifier rename, in both directions.
 *
 * `SessionId` and `TokenFamilyId` are both branded strings over the same underlying value, so this
 * is a re-brand rather than a conversion: the id the product stores is the id the platform sees,
 * which keeps a family id in a log or a support ticket meaning the same thing on both sides.
 */
function asFamilyId(sessionId: SessionId): TokenFamilyId {
  return unsafeId<TokenFamilyId>(sessionId);
}

export function toSession(family: RefreshFamily): SessionRecord {
  return { ...family, id: unsafeId<SessionId>(family.id) };
}

export function toFamily(session: SessionRecord): RefreshFamily {
  return { ...session, id: asFamilyId(session.id) };
}

/**
 * An in-memory refresh-family store, with a genuinely atomic `createWithinLimit`.
 *
 * "Atomic" in one process means the count, the eviction and the insert happen with no `await`
 * between them — a yield point there is exactly the gap two parallel sign-ins slip through, and
 * the resulting overshoot is invisible to any sequential test. A database adapter gets the same
 * property from a transaction; this gets it from not yielding.
 */
export class MemoryRefreshFamilyStore implements RefreshFamilyStorePort {
  readonly #families = new Map<TokenFamilyId, RefreshFamily>();

  async create(family: RefreshFamily): Promise<void> {
    this.#families.set(family.id, family);
  }

  async createWithinLimit(
    family: RefreshFamily,
    limit: SessionLimit,
  ): Promise<RefreshFamilyCreateOutcome> {
    // Everything from here to the insert is synchronous, on purpose. See the class comment.
    const live = this.#liveFor(family.tenantId, family.userId, limit.now).sort(
      (a, b) => a.lastSeenAt - b.lastSeenAt,
    );

    if (live.length < limit.maxConcurrent) {
      this.#families.set(family.id, family);
      return { created: true, evicted: [] };
    }

    if (limit.onLimitReached === 'deny') return { created: false, evicted: [] };

    // Evict enough to leave room for exactly one more, oldest first.
    const evicted: RefreshFamily[] = [];
    for (const victim of live.slice(0, live.length - limit.maxConcurrent + 1)) {
      const revoked: RefreshFamily = {
        ...victim,
        revokedAt: limit.now,
        revocationReason: 'concurrency-limit',
      };
      this.#families.set(victim.id, revoked);
      evicted.push(revoked);
    }
    this.#families.set(family.id, family);
    return { created: true, evicted };
  }

  async countActive(tenantId: TenantId, userId: UserId, now: number): Promise<number> {
    return this.#liveFor(tenantId, userId, now).length;
  }

  async get(tenantId: TenantId, familyId: TokenFamilyId): Promise<RefreshFamily | undefined> {
    const family = this.#families.get(familyId);
    if (!family) return undefined;
    // Undefined rather than a throw: a mismatched tenant must be indistinguishable from a missing
    // family to a caller that guessed an id.
    return family.tenantId === tenantId ? family : undefined;
  }

  async listByUser(tenantId: TenantId, userId: UserId): Promise<readonly RefreshFamily[]> {
    return [...this.#families.values()].filter(
      (family) => family.tenantId === tenantId && family.userId === userId,
    );
  }

  async update(family: RefreshFamily): Promise<void> {
    const existing = this.#families.get(family.id);
    if (existing) assertSameTenant(existing.tenantId, family.tenantId);
    this.#families.set(family.id, family);
  }

  async delete(tenantId: TenantId, familyId: TokenFamilyId): Promise<boolean> {
    const family = this.#families.get(familyId);
    if (!family || family.tenantId !== tenantId) return false;
    return this.#families.delete(familyId);
  }

  async deleteExpired(tenantId: TenantId, now: number): Promise<number> {
    let removed = 0;
    for (const [id, family] of this.#families) {
      if (family.tenantId !== tenantId) continue;
      if (now >= family.absoluteExpiresAt || now >= family.idleExpiresAt) {
        this.#families.delete(id);
        removed++;
      }
    }
    return removed;
  }

  #liveFor(tenantId: TenantId, userId: UserId, now: number): RefreshFamily[] {
    return [...this.#families.values()].filter(
      (family) =>
        family.tenantId === tenantId &&
        family.userId === userId &&
        family.revokedAt === undefined &&
        now < family.idleExpiresAt &&
        now < family.absoluteExpiresAt,
    );
  }

  get size(): number {
    return this.#families.size;
  }
}
