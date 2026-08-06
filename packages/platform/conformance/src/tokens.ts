import type { RefreshTokenRecord, RefreshTokenStorePort } from '@munaxa/interfaces';
import type { TenantId, TokenFamilyId, UserId } from '@munaxa/types';
import { race, tick, type TestHarness } from './harness.js';

/**
 * `RefreshTokenStorePort` conformance.
 *
 * `markRotated` is the whole point. Refresh rotation is the platform's answer to a stolen token,
 * and that answer only works if claiming a token to rotate it is a compare-and-swap: exactly one
 * caller may be told `true`. An adapter that returns `true` twice has not made rotation slower,
 * it has made reuse detection stop working — silently, and only under the concurrency an attacker
 * is naturally creating.
 */
export interface RefreshTokenConformanceOptions {
  createStore(): RefreshTokenStorePort | Promise<RefreshTokenStorePort>;
  makeRecord(overrides?: Partial<RefreshTokenRecord>): RefreshTokenRecord;
  concurrency?: number;
}

export function runRefreshTokenConformance(
  harness: TestHarness,
  options: RefreshTokenConformanceOptions,
): void {
  const { describe, it, expect } = harness;
  const concurrency = options.concurrency ?? 50;

  describe('RefreshTokenStorePort conformance', () => {
    it('finds a saved record by hash, scoped to its tenant', async () => {
      const store = await options.createStore();
      const record = options.makeRecord();
      await store.save(record);

      expect((await store.findByHash(record.tenantId, record.tokenHash))?.id).toBe(record.id);
      expect(await store.findByHash('other-tenant' as TenantId, record.tokenHash)).toBeUndefined();
    });

    it('markRotated has exactly one winner under concurrency', async () => {
      const store = await options.createStore();
      const record = options.makeRecord();
      await store.save(record);

      const { fulfilled } = await race(concurrency, async (i) => {
        await tick(i % 3);
        return store.markRotated(record.tenantId, record.id, 1_000 + i, `replacement-${i}`);
      });

      expect(fulfilled.filter((won) => won === true)).toHaveLength(1);
    });

    it('markRotated records the winner’s replacement, not a loser’s', async () => {
      const store = await options.createStore();
      const record = options.makeRecord();
      await store.save(record);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_unused, i) =>
          store
            .markRotated(record.tenantId, record.id, 1_000, `replacement-${i}`)
            .then((won) => (won ? `replacement-${i}` : null)),
        ),
      );
      const winner = results.find((value) => value !== null);

      const stored = await store.findByHash(record.tenantId, record.tokenHash);
      expect(stored?.replacedBy).toBe(winner);
      expect(stored?.rotatedAt).toBeDefined();
    });

    it('markRotated refuses a record from another tenant', async () => {
      const store = await options.createStore();
      const record = options.makeRecord();
      await store.save(record);

      expect(await store.markRotated('other-tenant' as TenantId, record.id, 1_000, 'x')).toBe(false);
    });

    it('markRotated returns false for an unknown record', async () => {
      const store = await options.createStore();
      expect(await store.markRotated('t' as TenantId, 'no-such-id', 1_000, 'x')).toBe(false);
    });

    it('revokeFamily revokes every live token once and is idempotent', async () => {
      const store = await options.createStore();
      const familyId = 'fam-conformance' as TokenFamilyId;
      const records = [
        options.makeRecord({ id: 'a', tokenHash: 'hash-a', familyId }),
        options.makeRecord({ id: 'b', tokenHash: 'hash-b', familyId }),
        options.makeRecord({ id: 'c', tokenHash: 'hash-c', familyId }),
      ];
      for (const record of records) await store.save(record);

      const tenantId = records[0]?.tenantId as TenantId;
      expect(await store.revokeFamily(tenantId, familyId, 2_000, 'token-reuse')).toBe(3);
      expect(await store.revokeFamily(tenantId, familyId, 2_000, 'token-reuse')).toBe(0);
      expect((await store.findByHash(tenantId, 'hash-a'))?.revokedAt).toBeDefined();
    });

    it('revokeFamily under concurrency revokes each token exactly once in total', async () => {
      const store = await options.createStore();
      const familyId = 'fam-race' as TokenFamilyId;
      for (let i = 0; i < 5; i++) {
        await store.save(options.makeRecord({ id: `r${i}`, tokenHash: `hash-${i}`, familyId }));
      }
      const tenantId = options.makeRecord().tenantId;

      const { fulfilled } = await race(10, () =>
        store.revokeFamily(tenantId, familyId, 2_000, 'token-reuse'),
      );

      // However the calls interleave, five tokens were revoked between them — never ten.
      expect(fulfilled.reduce((sum, count) => sum + count, 0)).toBe(5);
    });

    it('revokeForUser leaves other users alone', async () => {
      const store = await options.createStore();
      const mine = options.makeRecord({ id: 'mine', tokenHash: 'h-mine' });
      const theirs = options.makeRecord({
        id: 'theirs',
        tokenHash: 'h-theirs',
        userId: 'other-user' as UserId,
      });
      await store.save(mine);
      await store.save(theirs);

      expect(await store.revokeForUser(mine.tenantId, mine.userId, 3_000, 'password-changed')).toBe(1);
      expect((await store.findByHash(theirs.tenantId, 'h-theirs'))?.revokedAt).toBeUndefined();
    });
  });
}
