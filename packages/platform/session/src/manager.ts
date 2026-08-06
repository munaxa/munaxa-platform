import type {
  LockPort,
  SessionRecord,
  SessionRevocationReason,
  SessionStorePort,
} from '@munaxa/interfaces';
import {
  PlatformError,
  systemClock,
  unsafeId,
  type AuthMethod,
  type Clock,
  type DeviceId,
  type DurationMs,
  type SecurityEvent,
  type SecurityEventName,
  type SessionId,
  type TenantId,
  type UserId,
} from '@munaxa/types';
import { prefixedId } from '@munaxa/crypto';
import { clampSessionPolicy, type SessionPolicy } from './policy.js';

/**
 * The session lifecycle.
 *
 * A session here is a first-class, server-side, revocable object — not a claim inside a token.
 * That distinction is the whole design: a JWT cannot be un-issued, so "sign out everywhere",
 * "revoke this device" and "lock the account" are only real if something server-side is consulted.
 * Access tokens stay short-lived and carry `sid`; the session is what actually decides.
 */
export interface SessionManagerOptions {
  readonly store: SessionStorePort;
  readonly clock?: Clock;
  /**
   * Used to serialise concurrency-limit enforcement when the store cannot do it itself.
   *
   * The limit is a security control, and a burst of parallel logins — a mobile client
   * reconnecting — is its normal input rather than an exotic case. Three modes, best first:
   *
   *  1. `store.createWithinLimit` exists → the store enforces it in a transaction. Exact.
   *  2. This lock is wired → the manager serialises per (tenant, user). Exact, one extra round
   *     trip, correct across replicas.
   *  3. Neither → best effort, and a concurrent burst can exceed the limit. `limitEnforcement`
   *     reports which mode is active so it is a decision rather than a surprise.
   */
  readonly locks?: LockPort;
  /** How long the concurrency lock is held. Short: it wraps two store calls. Default 5s. */
  readonly limitLockLease?: DurationMs;
  readonly policy?: Partial<SessionPolicy>;
  /** Resolve a tenant's policy. Falls back to the manager's policy when absent. */
  readonly policyFor?: (tenantId: TenantId) => Partial<SessionPolicy> | undefined;
  /** Emitted for every lifecycle event. Wire it to the audit service and the event bus. */
  readonly onEvent?: (event: SessionEvent) => void | Promise<void>;
}

export interface SessionEvent {
  readonly name: Extract<SecurityEventName, `session.${string}`>;
  readonly session: SessionRecord;
  readonly at: number;
  readonly reason?: SessionRevocationReason;
}

export interface CreateSessionInput {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly authMethods: readonly AuthMethod[];
  readonly mfaSatisfied: boolean;
  readonly tokenVersion: number;
  readonly deviceId?: DeviceId;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export type SessionValidation =
  | { readonly valid: true; readonly session: SessionRecord }
  | {
      readonly valid: false;
      readonly reason:
        | 'not-found'
        | 'revoked'
        | 'idle-expired'
        | 'absolute-expired'
        | 'stale-token-version'
        | 'ip-changed';
    };

export class SessionManager {
  readonly #store: SessionStorePort;
  readonly #clock: Clock;
  readonly #policy: SessionPolicy;
  readonly #policyFor: SessionManagerOptions['policyFor'];
  readonly #onEvent: SessionManagerOptions['onEvent'];
  readonly #locks: LockPort | undefined;
  readonly #limitLockLease: DurationMs;

  constructor(options: SessionManagerOptions) {
    this.#store = options.store;
    this.#clock = options.clock ?? systemClock;
    this.#policy = clampSessionPolicy(options.policy ?? {});
    this.#policyFor = options.policyFor;
    this.#onEvent = options.onEvent;
    this.#locks = options.locks;
    this.#limitLockLease = options.limitLockLease ?? 5_000;
  }

  /**
   * How the concurrency limit is enforced with this wiring. Worth logging at startup: the
   * difference between `store-transaction` and `best-effort` is the difference between a limit
   * and a hint.
   */
  get limitEnforcement(): 'store-transaction' | 'distributed-lock' | 'best-effort' {
    if (this.#store.createWithinLimit) return 'store-transaction';
    if (this.#locks) return 'distributed-lock';
    return 'best-effort';
  }

  policy(tenantId: TenantId): SessionPolicy {
    const override = this.#policyFor?.(tenantId);
    return override ? clampSessionPolicy({ ...this.#policy, ...override }) : this.#policy;
  }

  /**
   * Create a session, enforcing the concurrency limit first.
   *
   * `evict-oldest` is the default because `deny` locks a user out of their newest device when an
   * old one is still holding a slot — a support burden with no security benefit, since both
   * outcomes cap the number of live sessions.
   */
  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const now = this.#clock.now();
    const policy = this.policy(input.tenantId);
    const session = this.#build(input, policy, now);

    // Path 1 — the store enforces the limit inside its own transaction. Exact, one round trip.
    if (this.#store.createWithinLimit) {
      const outcome = await this.#store.createWithinLimit(session, {
        maxConcurrent: policy.maxConcurrent,
        onLimitReached: policy.onLimitReached,
        now,
      });

      for (const evicted of outcome.evicted) {
        await this.#emit({
          name: 'session.revoked',
          session: evicted,
          at: now,
          reason: 'concurrency-limit',
        });
      }
      if (!outcome.created) {
        await this.#emit({ name: 'session.limit.reached', session, at: now });
        throw new PlatformError(`User ${input.userId} is at the session limit`, {
          code: 'SESSION_LIMIT_REACHED',
          details: { limit: policy.maxConcurrent },
        });
      }
      if (outcome.evicted.length > 0) {
        await this.#emit({ name: 'session.limit.reached', session, at: now });
      }
      await this.#emit({ name: 'session.created', session, at: now });
      return session;
    }

    // Path 2 — serialise per (tenant, user) with a distributed lock. Path 3 — no lock, best
    // effort, and `limitEnforcement` already told the operator which one they are running.
    const handle = this.#locks
      ? await this.#locks.acquire(
          `session-limit:${input.tenantId}:${input.userId}`,
          this.#limitLockLease,
          { waitFor: this.#limitLockLease, retryInterval: 25 },
        )
      : null;

    try {
      await this.#enforceLimit(input, policy, now);
      await this.#store.create(session);
    } finally {
      if (handle) await this.#locks?.release(handle);
    }

    await this.#emit({ name: 'session.created', session, at: now });
    return session;
  }

  /** The read-decide-revoke half of limit enforcement, run under a lock when one is wired. */
  async #enforceLimit(
    input: CreateSessionInput,
    policy: SessionPolicy,
    now: number,
  ): Promise<void> {
    const live = await this.listActive(input.tenantId, input.userId);
    if (live.length < policy.maxConcurrent) return;

    if (policy.onLimitReached === 'deny') {
      await this.#emit({
        name: 'session.limit.reached',
        session: live[0] as SessionRecord,
        at: now,
      });
      throw new PlatformError(`User ${input.userId} already has ${live.length} active sessions`, {
        code: 'SESSION_LIMIT_REACHED',
        details: { limit: policy.maxConcurrent },
      });
    }

    const excess = live.length - policy.maxConcurrent + 1;
    const oldest = [...live].sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, excess);
    for (const session of oldest) {
      await this.revoke(input.tenantId, session.id, 'concurrency-limit');
    }
    await this.#emit({
      name: 'session.limit.reached',
      session: oldest[0] as SessionRecord,
      at: now,
    });
  }

  #build(input: CreateSessionInput, policy: SessionPolicy, now: number): SessionRecord {
    return {
      id: unsafeId<SessionId>(prefixedId('sess', now)),
      tenantId: input.tenantId,
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: now + policy.idleTimeout,
      absoluteExpiresAt: now + policy.absoluteTimeout,
      authMethods: input.authMethods,
      mfaSatisfied: input.mfaSatisfied,
      tokenVersion: input.tokenVersion,
      ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
      ...(input.attributes === undefined ? {} : { attributes: input.attributes }),
    };
  }

  /**
   * Validate a session without extending it.
   *
   * Reads must not be side-effecting: a background poll should not keep a session alive forever.
   * `touch` is the explicit call that slides the idle window, and transports decide which
   * requests count as activity.
   */
  async validate(
    tenantId: TenantId,
    sessionId: SessionId,
    options: { tokenVersion?: number; ipAddress?: string } = {},
  ): Promise<SessionValidation> {
    const session = await this.#store.get(tenantId, sessionId);
    if (!session) return { valid: false, reason: 'not-found' };
    if (session.tenantId !== tenantId) return { valid: false, reason: 'not-found' };
    if (session.revokedAt !== undefined) return { valid: false, reason: 'revoked' };

    const now = this.#clock.now();
    if (now >= session.absoluteExpiresAt) {
      await this.#expire(session, now);
      return { valid: false, reason: 'absolute-expired' };
    }
    if (now >= session.idleExpiresAt) {
      await this.#expire(session, now);
      return { valid: false, reason: 'idle-expired' };
    }

    // A password change or an admin action bumps the account's token version; every session
    // created before that becomes invalid without needing to be found and deleted individually.
    if (options.tokenVersion !== undefined && options.tokenVersion !== session.tokenVersion) {
      return { valid: false, reason: 'stale-token-version' };
    }

    const policy = this.policy(tenantId);
    if (
      policy.bindToIp &&
      options.ipAddress &&
      session.ipAddress &&
      options.ipAddress !== session.ipAddress
    ) {
      return { valid: false, reason: 'ip-changed' };
    }

    return { valid: true, session };
  }

  /** Slide the idle window. The absolute deadline never moves. */
  async touch(
    tenantId: TenantId,
    sessionId: SessionId,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<SessionRecord | undefined> {
    const validation = await this.validate(tenantId, sessionId);
    if (!validation.valid) return undefined;

    const now = this.#clock.now();
    const policy = this.policy(tenantId);
    const updated: SessionRecord = {
      ...validation.session,
      lastSeenAt: now,
      idleExpiresAt: Math.min(now + policy.idleTimeout, validation.session.absoluteExpiresAt),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent }),
    };

    await this.#store.update(updated);
    return updated;
  }

  /** Active sessions for a user, most recently seen first. What "your devices" renders from. */
  async listActive(tenantId: TenantId, userId: UserId): Promise<readonly SessionRecord[]> {
    const now = this.#clock.now();
    const sessions = await this.#store.listByUser(tenantId, userId);
    return sessions
      .filter(
        (session) =>
          session.revokedAt === undefined &&
          now < session.idleExpiresAt &&
          now < session.absoluteExpiresAt,
      )
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async revoke(
    tenantId: TenantId,
    sessionId: SessionId,
    reason: SessionRevocationReason,
  ): Promise<boolean> {
    const session = await this.#store.get(tenantId, sessionId);
    if (!session || session.revokedAt !== undefined) return false;

    const now = this.#clock.now();
    const revoked: SessionRecord = { ...session, revokedAt: now, revocationReason: reason };
    await this.#store.update(revoked);
    await this.#emit({ name: 'session.revoked', session: revoked, at: now, reason });
    return true;
  }

  /**
   * Revoke every session for a user, optionally keeping one.
   *
   * `except` is what makes "sign out my other devices" work without logging out the person who
   * asked. A password change calls this without `except` — the session that changed the password
   * goes too, because a password change is also how a victim evicts an attacker.
   */
  async revokeAllForUser(
    tenantId: TenantId,
    userId: UserId,
    reason: SessionRevocationReason,
    except?: SessionId,
  ): Promise<number> {
    const sessions = await this.listActive(tenantId, userId);
    let revoked = 0;
    for (const session of sessions) {
      if (session.id === except) continue;
      if (await this.revoke(tenantId, session.id, reason)) revoked++;
    }
    return revoked;
  }

  /** Revoke every session bound to a device — "this laptop was stolen". */
  async revokeDevice(
    tenantId: TenantId,
    userId: UserId,
    deviceId: DeviceId,
    reason: SessionRevocationReason = 'device-untrusted',
  ): Promise<number> {
    const sessions = await this.listActive(tenantId, userId);
    let revoked = 0;
    for (const session of sessions) {
      if (session.deviceId !== deviceId) continue;
      if (await this.revoke(tenantId, session.id, reason)) revoked++;
    }
    return revoked;
  }

  /**
   * True when the session is fresh enough for a sensitive action.
   *
   * Changing a password, adding a second factor or creating an API key should not be possible
   * from a session that authenticated eight hours ago and has been idling in a browser tab since.
   */
  isFreshEnoughForSensitiveAction(session: SessionRecord, tenantId: TenantId): boolean {
    const policy = this.policy(tenantId);
    if (policy.sensitiveActionMaxAge <= 0) return true;
    return this.#clock.now() - session.createdAt <= policy.sensitiveActionMaxAge;
  }

  /** Housekeeping for stores without native expiry. */
  async purgeExpired(tenantId: TenantId): Promise<number> {
    return this.#store.deleteExpired(tenantId, this.#clock.now());
  }

  async #expire(session: SessionRecord, now: number): Promise<void> {
    await this.#emit({ name: 'session.expired', session, at: now });
  }

  async #emit(event: SessionEvent): Promise<void> {
    await this.#onEvent?.(event);
  }
}

/** Shape a session for a "your active sessions" screen. Nothing sensitive survives. */
export function toPublicSession(session: SessionRecord, currentSessionId?: SessionId) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    current: session.id === currentSessionId,
    ...(session.deviceId === undefined ? {} : { deviceId: session.deviceId }),
    // The full address is personal data and is not needed to recognise a session; the network
    // prefix is enough for "this was you, at home".
    ...(session.ipAddress === undefined ? {} : { ipPrefix: maskIp(session.ipAddress) }),
    ...(session.userAgent === undefined ? {} : { userAgent: session.userAgent.slice(0, 200) }),
    authMethods: session.authMethods,
    mfaSatisfied: session.mfaSatisfied,
  };
}

function maskIp(ipAddress: string): string {
  if (ipAddress.includes(':')) {
    // IPv6: keep the routing prefix, drop the interface identifier.
    return `${ipAddress.split(':').slice(0, 3).join(':')}::/48`;
  }
  const octets = ipAddress.split('.');
  return octets.length === 4 ? `${octets.slice(0, 3).join('.')}.0/24` : 'unknown';
}

/** Build the session event's audit-shaped payload without importing the audit package. */
export function sessionEventPayload(event: SessionEvent): SecurityEvent['payload'] {
  return {
    sessionId: event.session.id,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    authMethods: event.session.authMethods,
    mfaSatisfied: event.session.mfaSatisfied,
  };
}
