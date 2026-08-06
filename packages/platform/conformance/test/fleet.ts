import { MemoryAuditRepository } from '@munaxa/audit';
import {
  MemoryMfaEnrollmentStore,
  MemoryRefreshTokenStore,
  MemoryResetTokenStore,
  MemoryUserDirectory,
  MfaService,
  PasswordResetService,
  RefreshTokenService,
} from '@munaxa/auth';
import { CacheLock, MemoryCache } from '@munaxa/cache';
import { ScryptPasswordHasher } from '@munaxa/crypto';
import { MemorySessionStore, SessionManager } from '@munaxa/session';
import { AuditService } from '@munaxa/audit';
import { FixedClock, ROOT_TENANT_ID, unsafeId, type UserId } from '@munaxa/types';
import type {
  AuditRepositoryPort,
  CredentialRecord,
  RefreshTokenStorePort,
  ResetTokenStorePort,
  SessionStorePort,
} from '@munaxa/interfaces';
import { withLatency } from './latency.js';

/**
 * A simulated deployment: several *independent* service instances over one shared set of stores.
 *
 * This is the whole point of Platform 2.0. Every service in 1.0 was correct when there was one of
 * it, and several of them are what a deployment actually runs — one per pod, per worker, per
 * isolate. A `Fleet` builds N of each service with nothing shared between them except the stores,
 * which is exactly the topology a Kubernetes Deployment, an ECS service or a set of Cloud Run
 * instances has. Any state a service keeps in a private field is, in this shape, state the other
 * replicas cannot see — and every test here is a question about whether that matters.
 *
 * The stores are the platform's memory adapters. They are single-process, but they are also the
 * reference implementations of the atomic operations, so a bug that shows up here is a bug in the
 * *service*, not in the storage. A product runs the same shapes against Postgres or Redis by
 * swapping what `Fleet` is given.
 */
export const USER = unsafeId<UserId>('u1');
export const START = 1_700_000_000_000;
export const PASSWORD = 'a-perfectly-fine-passphrase';

/** Cheap KDF parameters: these tests exercise coordination, not the hash's calibration. */
export const hasher = new ScryptPasswordHasher({ N: 1_024 });

export interface FleetOptions {
  /** Number of independent replicas. Each gets its own service objects. */
  readonly replicas?: number;
  /** Give the session manager a lock so it can enforce limits without store support. */
  readonly withLocks?: boolean;
  readonly maxConcurrentSessions?: number;
  /**
   * Put network latency in front of every store. Off by default because it slows every test that
   * does not need it; on for the tests that ask whether coordination actually happens, where an
   * instantly-resolving store would hide the race being tested — a `Map` settles its promises in
   * the same microtask, so read-decide-write over it is atomic by accident.
   */
  readonly latency?: boolean;
}

export interface Replica {
  readonly index: number;
  readonly audit: AuditService;
  readonly refresh: RefreshTokenService;
  readonly mfa: MfaService;
  readonly sessions: SessionManager;
  readonly reset: PasswordResetService;
}

export interface Fleet {
  readonly clock: FixedClock;
  readonly cache: MemoryCache;
  readonly replicas: readonly Replica[];
  readonly auditRepository: MemoryAuditRepository;
  readonly refreshStore: MemoryRefreshTokenStore;
  readonly sessionStore: MemorySessionStore;
  readonly resetStore: MemoryResetTokenStore;
  readonly mfaStore: MemoryMfaEnrollmentStore;
  readonly directory: MemoryUserDirectory;
  readonly delivered: { token: string }[];
  /** Round-robin, so a caller can spread work across the fleet the way a load balancer would. */
  any: (this: void, index: number) => Replica;
}

export async function fleet(options: FleetOptions = {}): Promise<Fleet> {
  const count = options.replicas ?? 4;
  const clock = new FixedClock(START);

  // Shared infrastructure. Everything below this line is per-replica.
  const cache = new MemoryCache({ clock, maxEntries: 500_000 });
  const auditRepository = new MemoryAuditRepository({ maxRecords: 1_000_000 });
  const refreshStore = new MemoryRefreshTokenStore();
  const sessionStore = new MemorySessionStore();
  const resetStore = new MemoryResetTokenStore();
  const mfaStore = new MemoryMfaEnrollmentStore();
  const directory = new MemoryUserDirectory([await credential()]);
  const delivered: { token: string }[] = [];

  // What each replica actually talks to. The concrete stores stay on the fleet for assertions.
  const slow = options.latency === true;
  const auditPort: AuditRepositoryPort = slow
    ? withLatency(auditRepository, 3, 11)
    : auditRepository;
  const refreshPort: RefreshTokenStorePort = slow ? withLatency(refreshStore, 3, 23) : refreshStore;
  const resetPort: ResetTokenStorePort = slow ? withLatency(resetStore, 3, 31) : resetStore;
  const sessionPort: SessionStorePort = slow ? withLatency(sessionStore, 4, 43) : sessionStore;

  const replicas: Replica[] = Array.from({ length: count }, (_unused, index) => ({
    index,
    audit: new AuditService({ repository: auditPort, clock }),
    refresh: new RefreshTokenService({ store: refreshPort, clock, pepper: 'fleet-pepper' }),
    // The replay guard is the shared cache: without it each replica remembers used TOTP steps
    // privately, which is a second factor that can be replayed once per replica.
    mfa: new MfaService({ store: mfaStore, clock, replayGuard: cache }),
    sessions: new SessionManager({
      store: sessionPort,
      clock,
      policy: { maxConcurrent: options.maxConcurrentSessions ?? 3 },
      ...(options.withLocks === true ? { locks: new CacheLock(cache, clock) } : {}),
    }),
    reset: new PasswordResetService({
      store: resetPort,
      directory,
      hasher,
      clock,
      pepper: 'fleet-pepper',
      deliver: (input) => void delivered.push({ token: input.token }),
    }),
  }));

  return {
    clock,
    cache,
    replicas,
    auditRepository,
    refreshStore,
    sessionStore,
    resetStore,
    mfaStore,
    directory,
    delivered,
    any: (index) => replicas[index % replicas.length] as Replica,
  };
}

export async function credential(
  overrides: Partial<CredentialRecord> = {},
): Promise<CredentialRecord> {
  return {
    userId: USER,
    tenantId: ROOT_TENANT_ID,
    identifier: 'ada@example.com',
    passwordHash: await hasher.hash(PASSWORD),
    status: 'active',
    tokenVersion: 1,
    mfaEnrolled: false,
    ...overrides,
  };
}
