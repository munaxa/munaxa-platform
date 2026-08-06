import { describe, expect, it } from 'vitest';
import { AuditService, MemoryAuditRepository, verifyChain } from '@munaxa/audit';
import { MemoryRefreshTokenStore, OtpService, RefreshTokenService } from '@munaxa/auth';
import { MemoryCache } from '@munaxa/cache';
import { NotificationService } from '@munaxa/notifications';
import { RateLimiter } from '@munaxa/security';
import { isChainConflict, ChainConflictError } from '@munaxa/interfaces';
import type { AuditRepositoryPort, CachePort, NotificationMessage } from '@munaxa/interfaces';
import {
  FixedClock,
  ROOT_TENANT_ID,
  unsafeId,
  type CorrelationId,
  type SecurityContext,
  type TenantId,
} from '@munaxa/types';
import { tick } from '../src/index.js';
import { START, USER, fleet } from './fleet.js';

/**
 * Failure injection.
 *
 * Everything above assumes the infrastructure works. This file assumes it does not, and asks the
 * only question that matters when it does not: does the platform fail in the direction it said it
 * would? Two directions are defensible and they are not interchangeable — a rate limiter that
 * cannot reach its cache should fail *open* and say so, and a second factor that cannot reach its
 * replay guard should fail *closed*. Getting those backwards is a denial of service in one
 * direction and an authentication bypass in the other.
 *
 * The scenarios are the ones that actually happen: the cache is gone, a call hangs, a write lands
 * halfway, a worker is killed mid-request, two nodes disagree about the time, a queue delivers the
 * same message twice, and everything retries at once.
 */
const context = (): SecurityContext => ({
  tenantId: ROOT_TENANT_ID,
  principal: { kind: 'user', tenantId: ROOT_TENANT_ID, userId: USER },
  correlationId: unsafeId<CorrelationId>('corr-chaos'),
});

/** A cache that is simply not there. Every call rejects, the way a dead connection pool does. */
function unavailableCache(message = 'ECONNREFUSED 127.0.0.1:6379'): CachePort {
  const fail = async (): Promise<never> => {
    throw new Error(message);
  };
  return {
    get: fail,
    set: fail,
    setIfAbsent: fail,
    delete: fail,
    has: fail,
    increment: fail,
    ttl: fail,
  };
}

/** A cache that never answers. Models a network black hole rather than a refused connection. */
function hangingCache(): CachePort {
  const hang = async (): Promise<never> =>
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ETIMEDOUT')), 20);
      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    });
  return {
    get: hang,
    set: hang,
    setIfAbsent: hang,
    delete: hang,
    has: hang,
    increment: hang,
    ttl: hang,
  };
}

describe('the cache is unavailable', () => {
  it('rate limiting fails open and says it is degraded', async () => {
    // Deliberate: a limiter that fails closed turns a Redis blip into a full outage. The
    // `degraded` flag is what stops that from being a silent decision — it is meant to be alerted
    // on, because a permanently degraded limiter is a permanently absent one.
    const degradations: string[] = [];
    const limiter = new RateLimiter({
      cache: unavailableCache(),
      rules: [{ id: 'api', dimension: 'ip', limit: 1, window: 60_000 }],
      onDegraded: (error) => degradations.push((error as Error).message),
    });

    const decision = await limiter.check({
      method: 'GET',
      path: '/api/things',
      tenantId: ROOT_TENANT_ID,
      ipAddress: '198.51.100.4',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
    expect(degradations).toHaveLength(1);
  });

  it('rate limiting fails open on a timeout too, not just a refusal', async () => {
    const limiter = new RateLimiter({
      cache: hangingCache(),
      rules: [{ id: 'api', dimension: 'ip', limit: 1, window: 60_000 }],
    });

    const decision = await limiter.check({
      method: 'GET',
      path: '/api/things',
      tenantId: ROOT_TENANT_ID,
      ipAddress: '198.51.100.4',
    });
    expect(decision.degraded).toBe(true);
  });

  it('MFA replay protection fails closed rather than accepting the code', async () => {
    // The opposite direction, on purpose. If the replay guard is unreachable the platform cannot
    // tell a first use from a replay, and "allow it, we could not check" is the whole attack.
    const { MfaService, MemoryMfaEnrollmentStore, totpCode } = await import('@munaxa/auth');
    const clock = new FixedClock(START);
    const store = new MemoryMfaEnrollmentStore();
    const healthy = new MfaService({ store, clock });
    const { secret } = await healthy.beginTotpEnrollment(ROOT_TENANT_ID, USER, {
      issuer: 'Munaxa',
      account: 'ada@example.com',
    });
    await healthy.confirmTotpEnrollment(ROOT_TENANT_ID, USER, totpCode(secret, clock.now()));

    const broken = new MfaService({ store, clock, replayGuard: unavailableCache() });
    await expect(
      broken.verifyTotpCode(ROOT_TENANT_ID, USER, totpCode(secret, clock.now())),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('one-time codes fail closed when their store is gone', async () => {
    const otp = new OtpService({ clock: new FixedClock(START), cache: unavailableCache() });
    await expect(otp.issue(ROOT_TENANT_ID, USER)).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('a write lands halfway', () => {
  it('an audit sealer that throws leaves no gap in the chain', async () => {
    // A replica killed between claiming a sequence number and writing the record. The next writer
    // must get that number, not the one after it — a gap makes every later record fail
    // verification, which reads as tampering.
    const repository = new MemoryAuditRepository();
    const audit = new AuditService({ repository, clock: new FixedClock(START) });

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
    await repository
      .appendChained(ROOT_TENANT_ID, () => {
        throw new Error('pod terminated mid-seal');
      })
      .catch(() => undefined);
    await audit.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    const chain = repository.chain(ROOT_TENANT_ID);
    expect(chain.map((record) => record.sequence)).toEqual([1, 2]);
    expect(verifyChain(chain).valid).toBe(true);
  });

  it('a rotation that fails after claiming does not hand out a usable token', async () => {
    // markRotated succeeded, then the process died before the replacement was saved. The old
    // token is spent and the new one was never issued: the client must re-authenticate, which is
    // the safe outcome. What must not happen is the old token still working.
    const store = new MemoryRefreshTokenStore();
    const clock = new FixedClock(START);
    const service = new RefreshTokenService({ store, clock, pepper: 'chaos' });
    const { token, record } = await service.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });

    // Simulate the crash: the claim lands, the issue never does.
    expect(await store.markRotated(ROOT_TENANT_ID, record.id, clock.now(), 'never-issued')).toBe(
      true,
    );

    await expect(service.rotate(ROOT_TENANT_ID, token)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REUSED',
    });
  });

  it('a notification that fails to send releases its claim so a retry can run', async () => {
    const cache = new MemoryCache({ clock: new FixedClock(START) });
    const attempts: NotificationMessage[] = [];
    let failing = true;
    const service = new NotificationService({
      dedupeStore: cache,
      maxAttempts: 1,
      transports: [
        {
          name: 'flaky',
          channel: 'email',
          send: async (message) => {
            attempts.push(message);
            return failing
              ? { delivered: false, error: 'provider 503', retryable: true }
              : { delivered: true };
          },
        },
      ],
    });

    const input = {
      tenantId: ROOT_TENANT_ID,
      channel: 'email' as const,
      recipient: { email: 'ada@example.com' },
      subject: 'Sign-in from a new device',
      body: 'If this was not you, change your password.',
    };

    expect((await service.send(input)).delivered).toBe(false);
    failing = false;
    // Not suppressed as a duplicate: the first attempt gave its claim back when it failed.
    expect((await service.send(input)).delivered).toBe(true);
    expect(attempts).toHaveLength(2);
  });
});

describe('a queue delivers the same message twice', () => {
  it('suppresses the duplicate across replicas, not just within one', async () => {
    const cache = new MemoryCache({ clock: new FixedClock(START) });
    const sent: string[] = [];
    const replicas = Array.from(
      { length: 5 },
      (_unused, i) =>
        new NotificationService({
          dedupeStore: cache,
          transports: [
            {
              name: `transport-${String(i)}`,
              channel: 'email',
              send: async (message) => {
                sent.push(message.body);
                return { delivered: true };
              },
            },
          ],
        }),
    );
    expect(replicas[0]?.distributed).toBe(true);

    const input = {
      tenantId: ROOT_TENANT_ID,
      channel: 'email' as const,
      recipient: { email: 'ada@example.com' },
      subject: 'Weekly digest',
      body: 'Three documents changed.',
    };
    await Promise.all(replicas.map((replica) => replica.send(input)));

    expect(sent).toHaveLength(1);
  });

  it('never suppresses a critical security notice, however it is redelivered', async () => {
    // The one case where duplicate delivery is the lesser evil. Three password-change emails are
    // a nuisance; one missing password-change email is an unnoticed takeover.
    const cache = new MemoryCache({ clock: new FixedClock(START) });
    const sent: string[] = [];
    const service = new NotificationService({
      dedupeStore: cache,
      transports: [
        {
          name: 'email',
          channel: 'email',
          send: async (message) => {
            sent.push(message.body);
            return { delivered: true };
          },
        },
      ],
    });

    const input = {
      tenantId: ROOT_TENANT_ID,
      channel: 'email' as const,
      recipient: { email: 'ada@example.com' },
      priority: 'critical' as const,
      subject: 'Your password was changed',
      body: 'If this was not you, contact support.',
    };
    await Promise.all([service.send(input), service.send(input), service.send(input)]);

    expect(sent).toHaveLength(3);
  });
});

describe('the nodes disagree about the time', () => {
  it('a skewed replica cannot rewrite the chain’s ordering', async () => {
    // Clocks drift. `recordedAt` comes from whichever replica happened to write, so a chain must
    // stay verifiable even when timestamps go backwards — verification is over the hash chain,
    // and the sequence is store-owned, so neither depends on a synchronised clock.
    const repository = new MemoryAuditRepository();
    const ahead = new AuditService({ repository, clock: new FixedClock(START + 90_000) });
    const behind = new AuditService({ repository, clock: new FixedClock(START - 90_000) });

    await Promise.all([
      ahead.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
      behind.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' }),
      ahead.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
    ]);

    const chain = repository.chain(ROOT_TENANT_ID);
    expect(chain.map((record) => record.sequence)).toEqual([1, 2, 3]);
    expect(verifyChain(chain).valid).toBe(true);
  });

  it('a skewed replica cannot resurrect a used one-time code', async () => {
    // The consumption marker is a store key, not a comparison against the local clock, so a node
    // whose clock is a minute behind still sees the code as spent.
    const cache = new MemoryCache({ clock: new FixedClock(START) });
    const issuer = new OtpService({ clock: new FixedClock(START), cache });
    const skewed = new OtpService({ clock: new FixedClock(START - 60_000), cache });

    const { challenge, code } = await issuer.issue(ROOT_TENANT_ID, USER);
    expect(await issuer.verify(challenge.id, code)).toBe(true);
    expect(await skewed.verify(challenge.id, code)).toBe(false);
  });
});

describe('everything retries at once', () => {
  it('the audit chain bounds its retries instead of spinning forever', async () => {
    // An adapter that conflicts every time — the pathological end of optimistic concurrency. The
    // service must give up and raise, not livelock a request thread.
    const alwaysConflicts: AuditRepositoryPort = {
      write: async () => undefined,
      appendChained: async (tenantId: TenantId) => {
        throw new ChainConflictError(tenantId, 1);
      },
      query: async () => ({ items: [] }),
      latest: async () => undefined,
    };
    const audit = new AuditService({
      repository: alwaysConflicts,
      clock: new FixedClock(START),
      maxChainAttempts: 3,
    });

    const failure = await audit
      .record(context(), { name: 'auth.login.succeeded', outcome: 'success' })
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(isChainConflict(failure)).toBe(true);
    expect(audit.conflictCount).toBe(2); // three attempts, two of them retries
  });

  it('a retry storm on one refresh token still produces exactly one winner', async () => {
    const { any } = await fleet({ replicas: 4, latency: true });
    const { token } = await any(0).refresh.issue({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      tokenVersion: 1,
    });

    // A client with an aggressive retry policy and no jitter: the same token, two hundred times.
    const outcomes = await Promise.allSettled(
      Array.from({ length: 200 }, async (_unused, i) => {
        await tick(i % 5);
        return any(i).refresh.rotate(ROOT_TENANT_ID, token);
      }),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('a worker restarts mid-flight', () => {
  it('a replacement instance continues the chain with nothing handed over', async () => {
    // The 1.0 shape of this test needed `resume()`; forgetting it produced a chain that failed
    // verification, and nothing in the code path could tell you that had happened.
    const repository = new MemoryAuditRepository();
    const clock = new FixedClock(START);

    let generation = new AuditService({ repository, clock });
    for (let restart = 0; restart < 5; restart++) {
      await generation.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });
      generation = new AuditService({ repository, clock }); // the pod was replaced
    }
    await generation.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    const chain = repository.chain(ROOT_TENANT_ID);
    expect(chain).toHaveLength(6);
    expect(verifyChain(chain)).toEqual({ valid: true, checked: 6 });
  });

  it('a session survives the instance that created it going away', async () => {
    const { any } = await fleet({ replicas: 3 });
    const session = await any(0).sessions.create({
      tenantId: ROOT_TENANT_ID,
      userId: USER,
      authMethods: ['password'],
      mfaSatisfied: false,
      tokenVersion: 1,
    });

    // Replica 0 is gone; replica 2 has never seen this session id before.
    const validation = await any(2).sessions.validate(ROOT_TENANT_ID, session.id, {
      tokenVersion: 1,
    });
    expect(validation.valid).toBe(true);
  });
});

describe('the store is partitioned and then heals', () => {
  it('audit writes fail while partitioned and resume a valid chain afterwards', async () => {
    const repository = new MemoryAuditRepository();
    let partitioned = false;
    const flaky: AuditRepositoryPort = {
      write: (record) => repository.write(record),
      appendChained: async (tenantId, seal) => {
        if (partitioned) throw new Error('no route to host');
        return repository.appendChained(tenantId, seal);
      },
      query: (query) => repository.query(query),
      latest: (tenantId) => repository.latest(tenantId),
    };
    const audit = new AuditService({ repository: flaky, clock: new FixedClock(START) });

    await audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' });

    partitioned = true;
    // A partition is not a conflict, so it is not retried — it surfaces to the caller, which is
    // what lets a request fail rather than silently proceed unaudited.
    await expect(
      audit.record(context(), { name: 'auth.login.succeeded', outcome: 'success' }),
    ).rejects.toThrow(/no route to host/);

    partitioned = false;
    await audit.record(context(), { name: 'auth.logout.succeeded', outcome: 'success' });

    const chain = repository.chain(ROOT_TENANT_ID);
    expect(chain.map((record) => record.sequence)).toEqual([1, 2]);
    expect(verifyChain(chain).valid).toBe(true);
  });
});
