/**
 * Subscription lifecycle.
 *
 * Three ways a subscription stops granting full access, and they are deliberately different:
 *
 * - **Expiry** is the term running out. Nobody decided anything; it is renewable, and the customer
 *   keeps read access to their own records.
 * - **Cancellation** is a decision to end the relationship. It is terminal: a cancelled
 *   subscription is never revived, a new one is created instead, so the history of what was bought
 *   stays readable.
 * - **Suspension** is an immediate administrative act — abuse, a security incident, a legal
 *   instruction. It is reversible, and reactivation returns to the state the subscription was in.
 *
 * Collapsing any two of these loses the one fact an auditor asks about first: whether access ended
 * because time passed or because somebody acted.
 */

export const SubscriptionStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  GRACE_PERIOD: 'GRACE_PERIOD',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] =
  Object.values(SubscriptionStatus);

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export const LifecycleEvent = {
  /** A trial converts, or an overdue account is settled. */
  ACTIVATE: 'ACTIVATE',
  /** A new term is bought. Also the way out of EXPIRED. */
  RENEW: 'RENEW',
  /** An invoice is overdue; access is unchanged. */
  MARK_PAST_DUE: 'MARK_PAST_DUE',
  /** The term or the payment window ended and the grace window began. */
  ENTER_GRACE: 'ENTER_GRACE',
  /** The term, the trial or the grace window ran out. */
  EXPIRE: 'EXPIRE',
  /** Immediate administrative suspension. */
  SUSPEND: 'SUSPEND',
  /** Lift a suspension, returning to the state it interrupted. */
  REACTIVATE: 'REACTIVATE',
  /** End the relationship. Terminal. */
  CANCEL: 'CANCEL',
} as const;
export type LifecycleEvent = (typeof LifecycleEvent)[keyof typeof LifecycleEvent];

const S = SubscriptionStatus;
const E = LifecycleEvent;

/**
 * The transition table. A pair that is absent is refused — there is no implicit "stay where you
 * are", because a renewal recorded against a cancelled subscription is a billing error somebody
 * should be told about, not a no-op.
 *
 * REACTIVATE is not in the table: its target is the state recorded at suspension, so it is
 * resolved by {@link transition} from `suspendedFrom`.
 */
const TRANSITIONS: Readonly<
  Record<SubscriptionStatus, Partial<Record<LifecycleEvent, SubscriptionStatus>>>
> = {
  [S.TRIAL]: {
    [E.ACTIVATE]: S.ACTIVE,
    [E.EXPIRE]: S.EXPIRED,
    [E.SUSPEND]: S.SUSPENDED,
    [E.CANCEL]: S.CANCELLED,
  },
  [S.ACTIVE]: {
    [E.RENEW]: S.ACTIVE,
    [E.MARK_PAST_DUE]: S.PAST_DUE,
    [E.ENTER_GRACE]: S.GRACE_PERIOD,
    [E.EXPIRE]: S.EXPIRED,
    [E.SUSPEND]: S.SUSPENDED,
    [E.CANCEL]: S.CANCELLED,
  },
  [S.PAST_DUE]: {
    [E.ACTIVATE]: S.ACTIVE,
    [E.RENEW]: S.ACTIVE,
    [E.ENTER_GRACE]: S.GRACE_PERIOD,
    [E.EXPIRE]: S.EXPIRED,
    [E.SUSPEND]: S.SUSPENDED,
    [E.CANCEL]: S.CANCELLED,
  },
  [S.GRACE_PERIOD]: {
    [E.ACTIVATE]: S.ACTIVE,
    [E.RENEW]: S.ACTIVE,
    [E.EXPIRE]: S.EXPIRED,
    [E.SUSPEND]: S.SUSPENDED,
    [E.CANCEL]: S.CANCELLED,
  },
  [S.EXPIRED]: { [E.RENEW]: S.ACTIVE, [E.SUSPEND]: S.SUSPENDED, [E.CANCEL]: S.CANCELLED },
  [S.SUSPENDED]: { [E.CANCEL]: S.CANCELLED },
  [S.CANCELLED]: {},
};

export type TransitionResult =
  | {
      readonly ok: true;
      readonly to: SubscriptionStatus;
      readonly suspendedFrom: SubscriptionStatus | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'TRANSITION_NOT_ALLOWED';
      readonly from: SubscriptionStatus;
      readonly event: LifecycleEvent;
    };

/**
 * Apply a lifecycle event.
 *
 * `suspendedFrom` is the state a SUSPENDED subscription was in when it was suspended. It is
 * returned on SUSPEND so the caller can persist it, and read on REACTIVATE so the subscription goes
 * back to where it was rather than to ACTIVE — reactivating a trial must not convert it.
 */
export function transition(
  from: SubscriptionStatus,
  event: LifecycleEvent,
  suspendedFrom: SubscriptionStatus | null = null,
): TransitionResult {
  if (event === E.REACTIVATE) {
    if (from !== S.SUSPENDED) return { ok: false, reason: 'TRANSITION_NOT_ALLOWED', from, event };
    const to =
      suspendedFrom !== null && suspendedFrom !== S.SUSPENDED && suspendedFrom !== S.CANCELLED
        ? suspendedFrom
        : S.ACTIVE;
    return { ok: true, to, suspendedFrom: null };
  }
  const to = TRANSITIONS[from][event];
  if (to === undefined) return { ok: false, reason: 'TRANSITION_NOT_ALLOWED', from, event };
  return { ok: true, to, suspendedFrom: event === E.SUSPEND ? from : null };
}

/** The events a subscription in `from` accepts — what an administration screen may offer. */
export function allowedEvents(from: SubscriptionStatus): readonly LifecycleEvent[] {
  const events = Object.keys(TRANSITIONS[from]) as LifecycleEvent[];
  return from === S.SUSPENDED ? [...events, E.REACTIVATE] : events;
}

/** The dates that move a subscription without anybody acting. ISO-8601 strings or `null`. */
export interface SubscriptionTerm {
  readonly status: SubscriptionStatus;
  readonly trialEndsAt: string | null;
  readonly expiresAt: string | null;
  readonly graceUntil: string | null;
}

/**
 * The status a subscription is in *now*, given its recorded status and its dates.
 *
 * A stored status is only as current as the last job that updated it. Enforcement reads this
 * instead, so a missed scheduler run can delay a notification but never extend access: a term that
 * ended at midnight has ended at midnight whether or not anything has written that down yet.
 *
 * Only time-driven moves are derived. SUSPENDED and CANCELLED are decisions and are never inferred.
 */
export function effectiveStatus(term: SubscriptionTerm, now: Date): SubscriptionStatus {
  const t = now.getTime();
  const passed = (iso: string | null): boolean => iso !== null && t >= Date.parse(iso);

  switch (term.status) {
    case S.SUSPENDED:
    case S.CANCELLED:
    case S.EXPIRED:
      return term.status;
    case S.TRIAL:
      return passed(term.trialEndsAt) ? S.EXPIRED : S.TRIAL;
    case S.ACTIVE:
    case S.PAST_DUE:
      if (!passed(term.expiresAt)) return term.status;
      return term.graceUntil !== null && !passed(term.graceUntil) ? S.GRACE_PERIOD : S.EXPIRED;
    case S.GRACE_PERIOD:
      return passed(term.graceUntil) || term.graceUntil === null ? S.EXPIRED : S.GRACE_PERIOD;
  }
}
