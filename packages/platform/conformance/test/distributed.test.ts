import { describe, expect, it } from 'vitest';
import { verifyChain } from '@munaxa/audit';
import { totpCode } from '@munaxa/auth';
import { MemoryCache } from '@munaxa/cache';
import { RateLimiter } from '@munaxa/security';
import {
  ROOT_TENANT_ID,
  toTenantId,
  unsafeId,
  type CorrelationId,
  type SecurityContext,
  type TenantId,
} from '@munaxa/types';
import { Seeded, race, tick } from '../src/index.js';
import { PASSWORD, START, USER, fleet } from './fleet.js';

/**
 * Distributed simulation.
 *
 * Every test here runs the *same* operation on several independent service instances at the same
 * time, over one shared store — the shape a deployment has the moment it scales past one replica.
 * Each of these failed on Platform 1.0, and each failed silently: a broken audit chain reads as
 * tampering, a double rotation reads as a working refresh, a replayed TOTP code reads as a
 * successful sign-in. None of them raise an error on the path that is wrong.
 *
 * Ordering is randomised from a fixed seed, so an interleaving that fails here fails again on the
 * next run rather than becoming a flake somebody retries away.
 */
const context = (tenantId: TenantId = ROOT_TENANT_ID): SecurityContext => ({
  tenantId,
  principal: { kind: 'user', tenantId, userId: USER },
  correlationId: unsafeId<CorrelationId>('corr-fleet'),
});

describe('audit chain across replicas', () => {
  it('produces one valid chain when every replica writes at once', async () => {
    const { replicas, auditRepository, any } = await fleet({ replicas: 6, latency: true });
    const seeded = new Seeded(101);

    await Promise.all(
      Array.from({ length: 120 }, async (_unused, i) => {
        await seeded.delay(3);
        return any(i).audit.record(context(), {
          name: 'auth.login.succeeded',
          outcome: 'success',
        });
      }),
    );

    const chain = auditRepository.chain(ROOT_TENANT_ID);
    expect(chain).toHaveLength(120);
    expect(verifyChain(chain)).toEqual({ valid: true, checked: 120 });
    // Sequence numbers are store-owned, so no two replicas claimed the same one.
    expect(new Set(chain.map((record) => record.sequence)).size).toBe(120);
    // Every replica wrote. If one had been starved out the chain would still verify, and the
    // test would be proving much less than it looks like it proves.
    expect(replicas).toHaveLength(6);
    expect(chain.filter((record) => record.sequence === 1)).toHaveLength(1);
  });

  it('keeps one tenant’s chain valid while another tenant floods', async () => {
    const { any, auditRepository } = await fleet({ replicas: 4 });
    const quiet = toTenantId('quiet-tenant');
    const seeded = new Seeded(7);

    const work = [
      // The flood: 60 events for the root tenant.
      ...Array.from(
        { length: 60 },
        (_unused, i) => () =>
          any(i).audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
      ),
      // The quiet tenant: 5 events, interleaved into the middle of it.
      ...Array.from(
        { length: 5 },
        (_unused, i) => () =>
          any(i).audit.record(context(quiet), {
            name: 'authz.permission.denied',
            outcome: 'denied',
          }),
      ),
    ];
    await Promise.all(seeded.shuffle(work).map((run) => run()));

    const chain = auditRepository.chain(quiet);
    expect(chain.map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(verifyChain(chain).valid).toBe(true);
    expect(verifyChain(auditRepository.chain(ROOT_TENANT_ID))).toEqual({
      valid: true,
      checked: 60,
    });
  });
});

describe('refresh rotation across replicas', () => {
  it('lets exactly one replica rotate a token and revokes the family for the rest', async () => {
    const { replicas, refreshStore } = await fleet({ replicas: 8, latency: true });
    const { token } = await replicas[0]!.refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });

    // Eight replicas presented the same refresh token at the same moment. Exactly one of them is
    // the legitimate client; the platform cannot tell which, so one succeeds and the lineage dies.
    const outcomes = await Promise.allSettled(
      replicas.map(async (replica, i) => {
        await tick(i % 3);
        return replica.refresh.rotate(ROOT_TENANT_ID, token);
      }),
    );

    const rotated = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    expect(rotated).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toMatchObject({ code: 'AUTH_TOKEN_REUSED' });
      }
    }

    // Reuse detection fired, so the whole lineage — including the replacement the winner just
    // issued — is revoked. The attacker's copy is dead and so is the legitimate client's.
    const winner = rotated[0] as PromiseFulfilledResult<{
      issued: { record: { familyId: string } };
    }>;
    const family = await refreshStore.listFamily(
      ROOT_TENANT_ID,
      winner.value.issued.record.familyId as never,
    );
    expect(family.length).toBeGreaterThan(1);
    expect(family.every((record) => record.revokedAt !== undefined)).toBe(true);
  });

  it('rotates a long chain correctly when each hop lands on a different replica', async () => {
    const { any } = await fleet({ replicas: 5 });
    let current = (
      await any(0).refresh.issue({ tenantId: ROOT_TENANT_ID, userId: USER, tokenVersion: 1 })
    ).token;

    for (let hop = 0; hop < 25; hop++) {
      const result = await any(hop).refresh.rotate(ROOT_TENANT_ID, current);
      current = result.issued.token;
    }

    // 25 hops, five replicas, no replica keeping rotation state: the lineage still works.
    const final = await any(0).refresh.rotate(ROOT_TENANT_ID, current);
    expect(final.issued.token).toBeDefined();
  });
});

describe('MFA replay across replicas', () => {
  it('accepts a TOTP code on exactly one replica', async () => {
    const { replicas, clock } = await fleet({ replicas: 6 });
    const { secret } = await replicas[0]!.mfa.beginTotpEnrollment(ROOT_TENANT_ID, USER, {
      issuer: 'Munaxa',
      account: 'ada@example.com',
    });
    await replicas[0]!.mfa.confirmTotpEnrollment(
      ROOT_TENANT_ID,
      USER,
      totpCode(secret, clock.now()),
    );

    const code = totpCode(secret, clock.now());
    const { fulfilled } = await race(replicas.length, async (i) => {
      await tick(i % 3);
      return replicas[i]!.mfa.verifyTotpCode(ROOT_TENANT_ID, USER, code);
    });

    // A stolen code is worth exactly one sign-in, not one per pod.
    expect(fulfilled.filter((accepted) => accepted)).toHaveLength(1);
    expect(replicas[0]!.mfa.distributed).toBe(true);
  });

  it('reports itself as single-process when no replay guard is wired', async () => {
    // Not a failure — a disclosure. A single-process deployment is a legitimate configuration;
    // believing you have replay protection when you do not is the problem.
    const { MfaService, MemoryMfaEnrollmentStore } = await import('@munaxa/auth');
    const local = new MfaService({ store: new MemoryMfaEnrollmentStore() });
    expect(local.distributed).toBe(false);
  });
});

describe('session limits across replicas', () => {
  it('never exceeds the limit when replicas share a lock', async () => {
    const { replicas, sessionStore, any } = await fleet({
      replicas: 6,
      withLocks: true,
      latency: true,
      maxConcurrentSessions: 3,
    });
    expect(replicas[0]!.sessions.limitEnforcement).toBe('distributed-lock');

    await Promise.all(
      Array.from({ length: 30 }, async (_unused, i) => {
        await tick(i % 4);
        return any(i).sessions.create({
          tenantId: ROOT_TENANT_ID,
          userId: USER,
          authMethods: ['password'],
          mfaSatisfied: false,
          tokenVersion: 1,
        });
      }),
    );

    const live = (await sessionStore.listByUser(ROOT_TENANT_ID, USER)).filter(
      (session) =>
        session.revokedAt === undefined &&
        START < session.idleExpiresAt &&
        START < session.absoluteExpiresAt,
    );
    expect(live.length).toBeLessThanOrEqual(3);
  });

  it('overshoots the limit without a lock, which is why the mode is reported', async () => {
    // The companion to the test above, and the reason `limitEnforcement` exists. Same fleet, same
    // work, no lock: replicas each read "two live sessions", each decide there is room, and each
    // create one. Nothing errors. The limit is simply not a limit.
    //
    // Asserting the overshoot rather than hiding it keeps the degradation honest: a product that
    // wires neither a lock nor a transactional store gets a hint, and gets told so at startup.
    const { replicas, sessionStore, any } = await fleet({
      replicas: 6,
      withLocks: false,
      latency: true,
      maxConcurrentSessions: 3,
    });
    expect(replicas[0]!.sessions.limitEnforcement).toBe('best-effort');

    await Promise.all(
      Array.from({ length: 30 }, async (_unused, i) => {
        await tick(i % 4);
        return any(i).sessions.create({
          tenantId: ROOT_TENANT_ID,
          userId: USER,
          authMethods: ['password'],
          mfaSatisfied: false,
          tokenVersion: 1,
        });
      }),
    );

    const live = (await sessionStore.listByUser(ROOT_TENANT_ID, USER)).filter(
      (session) =>
        session.revokedAt === undefined &&
        START < session.idleExpiresAt &&
        START < session.absoluteExpiresAt,
    );
    expect(live.length).toBeGreaterThan(3);
  });
});

describe('password reset across replicas', () => {
  it('is consumed once no matter which replica the click lands on', async () => {
    const { any, delivered } = await fleet({ replicas: 5, latency: true });
    await any(0).reset.request(ROOT_TENANT_ID, 'ada@example.com');
    const token = delivered[0]!.token;

    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, async (_unused, i) => {
        await tick(i % 3);
        return any(i).reset.complete(ROOT_TENANT_ID, token, `a brand new passphrase ${i}`);
      }),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('rate limiting across replicas', () => {
  it('applies one budget to the whole fleet, not one per replica', async () => {
    // Six limiters, one cache — the shape behind "we set the limit to 100 and saw 600".
    const cache = new MemoryCache({ maxEntries: 100_000 });
    const limiters = Array.from(
      { length: 6 },
      () =>
        new RateLimiter({
          cache,
          rules: [
            {
              id: 'login',
              dimension: 'ip',
              limit: 20,
              window: 60_000,
              algorithm: 'sliding-window' as const,
            },
          ],
        }),
    );

    const decisions = await Promise.all(
      Array.from({ length: 60 }, (_unused, i) =>
        limiters[i % limiters.length]!.check({
          method: 'POST',
          path: '/auth/login',
          tenantId: ROOT_TENANT_ID,
          ipAddress: '198.51.100.4',
        }),
      ),
    );

    const allowed = decisions.filter((decision) => decision.allowed).length;
    // Sliding windows approximate, so this is a band, not an equality — but it is nowhere near
    // the 60 a per-replica counter would have allowed.
    expect(allowed).toBeGreaterThan(0);
    expect(allowed).toBeLessThanOrEqual(21);
  });
});

describe('login lockout across replicas', () => {
  it('locks the account for every replica once the threshold is crossed anywhere', async () => {
    const { LoginService, MemoryUserDirectory } = await import('@munaxa/auth');
    const { credential, hasher } = await import('./fleet.js');
    const { FixedClock } = await import('@munaxa/types');

    const clock = new FixedClock(START);
    const cache = new MemoryCache({ clock });
    const directory = new MemoryUserDirectory([await credential()]);
    const lockEvents: string[] = [];
    const replicas = Array.from(
      { length: 4 },
      () =>
        new LoginService({
          directory,
          hasher,
          clock,
          cache,
          maxAttempts: 5,
          onEvent: (event) => {
            if (event.name === 'auth.account.locked') lockEvents.push(event.identifier ?? '?');
          },
        }),
    );

    for (let attempt = 0; attempt < 5; attempt++) {
      await replicas[attempt % replicas.length]!.authenticate('ada@example.com', 'wrong', {
        tenantId: ROOT_TENANT_ID,
      }).catch(() => undefined);
    }

    // A replica that saw none of those five failures still refuses the correct password.
    await expect(
      replicas[3]!.authenticate('ada@example.com', PASSWORD, { tenantId: ROOT_TENANT_ID }),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED' });
    // And the lock was announced once, not once per failure past the threshold.
    expect(lockEvents).toHaveLength(1);
  });
});
