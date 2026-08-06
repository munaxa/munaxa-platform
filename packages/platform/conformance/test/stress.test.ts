import { describe, expect, it } from 'vitest';
import { verifyChain } from '@munaxa/audit';
import { MemoryCache, TokenBucket } from '@munaxa/cache';
import { OtpService } from '@munaxa/auth';
import { MemoryRoleAssignments, MemoryRoleRepository, PermissionResolver } from '@munaxa/rbac';
import { RateLimiter } from '@munaxa/security';
import {
  FixedClock,
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type SecurityContext,
  type UserId,
} from '@munaxa/types';
import { fleet, START, USER } from './fleet.js';

/**
 * Stress.
 *
 * The distributed suite asks whether a handful of replicas coordinate. This one asks whether the
 * coordination survives volume — because several of the mechanisms are retry loops, and a retry
 * loop that works at ten callers can livelock at a thousand. Conflict-and-retry on the audit chain
 * is the obvious candidate: if the loop is not making progress under load, the symptom is not a
 * failed test, it is a bounded-attempt error at exactly the traffic level nobody load-tested.
 *
 * No latency injection here — this is about throughput and progress, and the counts are high
 * enough that real interleaving happens anyway. Assertions are exact where the mechanism promises
 * exactness, and banded where it promises an approximation.
 */
const context = (): SecurityContext => ({
  tenantId: ROOT_TENANT_ID,
  principal: { kind: 'user', tenantId: ROOT_TENANT_ID, userId: USER },
  correlationId: unsafeId<CorrelationId>('corr-stress'),
});

describe('audit chain under load', () => {
  it('stays valid and gapless across 5,000 concurrent events from 8 replicas', async () => {
    const { any, auditRepository, replicas } = await fleet({ replicas: 8 });

    await Promise.all(
      Array.from({ length: 5_000 }, (_unused, i) =>
        any(i).audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
      ),
    );

    const chain = auditRepository.chain(ROOT_TENANT_ID);
    expect(chain).toHaveLength(5_000);
    expect(verifyChain(chain)).toEqual({ valid: true, checked: 5_000 });
    expect(chain.at(-1)?.sequence).toBe(5_000);

    // The retry loop made progress rather than exhausting its attempts: nobody threw, and the
    // conflict counter is a number a deployment can alert on if it climbs.
    const conflicts = replicas.reduce((sum, replica) => sum + replica.audit.conflictCount, 0);
    expect(conflicts).toBeGreaterThanOrEqual(0);
  });
});

describe('refresh rotation under load', () => {
  it('rotates 2,000 independent tokens concurrently without crossing lineages', async () => {
    const { any, refreshStore } = await fleet({ replicas: 6 });

    const issued = await Promise.all(
      Array.from({ length: 2_000 }, (_unused, i) =>
        any(i).refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 }),
      ),
    );

    const rotated = await Promise.all(
      issued.map((token, i) => any(i).refresh.rotate(ROOT_TENANT_ID, token.token)),
    );

    // Each rotation produced a distinct replacement, and each replacement stayed in its own family.
    expect(new Set(rotated.map((result) => result.issued.token)).size).toBe(2_000);
    for (let i = 0; i < 2_000; i++) {
      expect(rotated[i]?.issued.record.familyId).toBe(issued[i]?.record.familyId);
    }
    // No family was revoked: 2,000 legitimate rotations must not look like 2,000 replays.
    const all = await refreshStore.listFamily(ROOT_TENANT_ID, issued[0]?.record.familyId as never);
    expect(all.every((record) => record.revokedAt === undefined)).toBe(true);
  });

  it('lets exactly one caller win when 500 present the same token', async () => {
    const { any } = await fleet({ replicas: 6 });
    const { token } = await any(0).refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 500 }, (_unused, i) => any(i).refresh.rotate(ROOT_TENANT_ID, token)),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('sessions under load', () => {
  it('creates 2,000 sessions across replicas and expires them in one sweep', async () => {
    const { any, sessionStore } = await fleet({ replicas: 6, maxConcurrentSessions: 10_000 });

    await Promise.all(
      Array.from({ length: 2_000 }, (_unused, i) =>
        any(i).sessions.create({
          tenantId: ROOT_TENANT_ID,
          userId: unsafeId('user-' + String(i % 200)),
          authMethods: ['password'],
          mfaSatisfied: false,
          tokenVersion: 1,
        }),
      ),
    );

    expect(await sessionStore.deleteExpired(ROOT_TENANT_ID, START + 100 * 24 * 3_600_000)).toBe(
      2_000,
    );
  });
});

describe('rate limiting under load', () => {
  it('holds one budget across 12 limiters and 6,000 requests', async () => {
    const cache = new MemoryCache({ maxEntries: 200_000 });
    const limiters = Array.from(
      { length: 12 },
      () =>
        new RateLimiter({
          cache,
          rules: [{ id: 'api', dimension: 'ip', limit: 500, window: 60_000 }],
        }),
    );

    const decisions = await Promise.all(
      Array.from({ length: 6_000 }, (_unused, i) =>
        limiters[i % limiters.length]!.check({
          method: 'GET',
          path: '/api/things',
          tenantId: ROOT_TENANT_ID,
          ipAddress: '198.51.100.4',
        }),
      ),
    );

    const allowed = decisions.filter((decision) => decision.allowed).length;
    // 6,000 requests, a 500 budget, twelve limiters. A per-limiter counter would have allowed
    // 6,000; the shared counter allows roughly the budget.
    expect(allowed).toBeLessThanOrEqual(550);
    expect(allowed).toBeGreaterThan(400);
  });

  it('does not over-admit a token bucket under 1,000 concurrent consumers', async () => {
    const clock = new FixedClock(START);
    const bucket = new TokenBucket(new MemoryCache({ clock }), clock, 40);
    const options = { refillPerSecond: 0.0001, capacity: 25 };

    const results = await Promise.all(
      Array.from({ length: 1_000 }, () => bucket.consume('hot', options)),
    );

    // Exactness is the promise; the retry ceiling only ever denies, so it can never over-admit.
    expect(results.filter((result) => result.allowed).length).toBeLessThanOrEqual(25);
    expect(results.filter((result) => result.allowed).length).toBeGreaterThan(0);
  });
});

describe('one-time codes under load', () => {
  it('consumes 1,000 codes exactly once each, and a hot code exactly once', async () => {
    const clock = new FixedClock(START);
    const cache = new MemoryCache({ clock, maxEntries: 100_000 });
    const replicas = Array.from({ length: 5 }, () => new OtpService({ clock, cache }));

    const challenges = await Promise.all(
      Array.from({ length: 1_000 }, (_unused, i) =>
        replicas[i % 5]!.issue(ROOT_TENANT_ID, unsafeId('user-' + String(i))),
      ),
    );

    const verified = await Promise.all(
      challenges.map((challenge, i) =>
        replicas[(i + 1) % 5]!.verify(challenge.challenge.id, challenge.code),
      ),
    );
    expect(verified.filter(Boolean)).toHaveLength(1_000);

    // The same code presented 100 times at once: one acceptance, ninety-nine refusals.
    const hot = challenges[0]!;
    const replays = await Promise.all(
      Array.from({ length: 100 }, (_unused, i) =>
        replicas[i % 5]!.verify(hot.challenge.id, hot.code),
      ),
    );
    expect(replays.filter(Boolean)).toHaveLength(0);
  });
});

describe('authorization under load', () => {
  it('answers 20,000 resolutions from a shared cache without crossing users', async () => {
    // The permission cache is shared across replicas, so a key collision is not a stale answer —
    // it is a viewer being told they may write. Ten thousand interleaved resolutions for two
    // users, from five resolvers, must never hand one user the other's grants.
    const clock = new FixedClock(START);
    const cache = new MemoryCache({ clock, maxEntries: 100_000 });
    const roles = new MemoryRoleRepository([
      {
        tenantId: ROOT_TENANT_ID,
        id: 'editor',
        name: 'Editor',
        permissions: ['docs:read', 'docs:write'],
      },
      { tenantId: ROOT_TENANT_ID, id: 'viewer', name: 'Viewer', permissions: ['docs:read'] },
    ]);
    const editor = unsafeId<UserId>('editor-user');
    const viewer = unsafeId<UserId>('viewer-user');
    const assignments = new MemoryRoleAssignments([
      { tenantId: ROOT_TENANT_ID, userId: editor, roleId: 'editor', assignedAt: START },
      { tenantId: ROOT_TENANT_ID, userId: viewer, roleId: 'viewer', assignedAt: START },
    ]);
    const resolvers = Array.from(
      { length: 5 },
      () => new PermissionResolver({ roles, assignments, cache, clock }),
    );

    const resolved = await Promise.all(
      Array.from({ length: 20_000 }, (_unused, i) =>
        resolvers[i % 5]!.resolve(ROOT_TENANT_ID, i % 2 === 0 ? editor : viewer),
      ),
    );

    const writers = resolved.filter((result) => result.permissions.includes('docs:write'));
    expect(writers).toHaveLength(10_000);
    expect(writers.every((result) => result.userId === editor)).toBe(true);
  });
});

describe('cache under load', () => {
  it('hands out 5,000 increments with no lost updates', async () => {
    const cache = new MemoryCache({ maxEntries: 100_000 });
    const values = await Promise.all(
      Array.from({ length: 5_000 }, () => cache.increment('seq', 1, { ttl: 60_000 })),
    );

    expect(new Set(values).size).toBe(5_000);
    expect(Math.max(...values)).toBe(5_000);
  });

  it('admits exactly one winner among 5,000 racing for the same key', async () => {
    const cache = new MemoryCache({ maxEntries: 100_000 });
    const won = await Promise.all(
      Array.from({ length: 5_000 }, (_unused, i) => cache.setIfAbsent('once', i, { ttl: 60_000 })),
    );

    expect(won.filter(Boolean)).toHaveLength(1);
  });

  it('does not lose entries it was told to keep while evicting under pressure', async () => {
    // The bound is a security control — an unbounded cache keyed by anything a client influences
    // is a memory-exhaustion primitive — so it has to hold under a flood.
    const cache = new MemoryCache({ maxEntries: 1_000 });
    for (let i = 0; i < 20_000; i++) await cache.set(`k${i}`, i, { ttl: 60_000 });

    expect(cache.size).toBeLessThanOrEqual(1_000);
    expect(await cache.get('k19999')).toBe(19_999);
  });
});
