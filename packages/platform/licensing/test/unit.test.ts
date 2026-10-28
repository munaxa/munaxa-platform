import {
  AccessMode,
  DenialReason,
  LifecycleEvent,
  OperationKind,
  SnapshotSource,
  SubscriptionStatus,
  accessPolicy,
  allowedEvents,
  checkFeature,
  checkOperation,
  checkQuota,
  decodeActivationRequest,
  effectiveStatus,
  encodeActivationRequest,
  parseEntitlementSnapshot,
  permits,
  resolveSnapshot,
  transition,
} from '../src/index.js';
import { snapshot } from './fixtures.js';

const ctx = (now: string) => ({ now: new Date(now), tenantId: 'ten_1', product: 'product-a' });

describe('lifecycle transitions', () => {
  it('converts a trial and renews an expired subscription', () => {
    expect(transition('TRIAL', 'ACTIVATE')).toEqual({
      ok: true,
      to: 'ACTIVE',
      suspendedFrom: null,
    });
    expect(transition('EXPIRED', 'RENEW')).toMatchObject({ ok: true, to: 'ACTIVE' });
  });

  it('treats cancellation as terminal', () => {
    for (const event of Object.values(LifecycleEvent)) {
      expect(transition('CANCELLED', event).ok).toBe(false);
    }
  });

  it('does not let an expired subscription be activated without a renewal', () => {
    expect(transition('EXPIRED', 'ACTIVATE')).toMatchObject({
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
    });
  });

  it('reactivates a suspension to the state it interrupted, not to ACTIVE', () => {
    const suspended = transition('TRIAL', 'SUSPEND');
    expect(suspended).toEqual({ ok: true, to: 'SUSPENDED', suspendedFrom: 'TRIAL' });
    expect(transition('SUSPENDED', 'REACTIVATE', 'TRIAL')).toMatchObject({ ok: true, to: 'TRIAL' });
    expect(transition('SUSPENDED', 'REACTIVATE', null)).toMatchObject({ ok: true, to: 'ACTIVE' });
    expect(transition('ACTIVE', 'REACTIVATE').ok).toBe(false);
  });

  it('a suspended subscription can only be reactivated or cancelled', () => {
    expect([...allowedEvents('SUSPENDED')].sort()).toEqual(['CANCEL', 'REACTIVATE']);
    expect(transition('SUSPENDED', 'RENEW').ok).toBe(false);
  });

  it('every state has a defined set of events', () => {
    for (const status of Object.values(SubscriptionStatus)) {
      for (const event of allowedEvents(status)) expect(transition(status, event).ok).toBe(true);
    }
  });
});

describe('effective status', () => {
  const term = {
    trialEndsAt: null,
    expiresAt: '2027-01-01T00:00:00Z',
    graceUntil: '2027-01-15T00:00:00Z',
  };

  it('moves an ended term into grace and then to expired without anybody writing it down', () => {
    expect(effectiveStatus({ ...term, status: 'ACTIVE' }, new Date('2026-12-31T23:59:59Z'))).toBe(
      'ACTIVE',
    );
    expect(effectiveStatus({ ...term, status: 'ACTIVE' }, new Date('2027-01-01T00:00:00Z'))).toBe(
      'GRACE_PERIOD',
    );
    expect(effectiveStatus({ ...term, status: 'PAST_DUE' }, new Date('2027-01-15T00:00:00Z'))).toBe(
      'EXPIRED',
    );
    expect(
      effectiveStatus({ ...term, status: 'GRACE_PERIOD' }, new Date('2027-01-20T00:00:00Z')),
    ).toBe('EXPIRED');
  });

  it('expires a trial at its end', () => {
    const trial = {
      status: 'TRIAL' as const,
      trialEndsAt: '2026-11-01T00:00:00Z',
      expiresAt: null,
      graceUntil: null,
    };
    expect(effectiveStatus(trial, new Date('2026-11-01T00:00:00Z'))).toBe('EXPIRED');
  });

  it('never infers suspension or cancellation from dates, nor undoes them', () => {
    expect(effectiveStatus({ ...term, status: 'SUSPENDED' }, new Date('2026-01-01Z'))).toBe(
      'SUSPENDED',
    );
    expect(effectiveStatus({ ...term, status: 'CANCELLED' }, new Date('2026-01-01Z'))).toBe(
      'CANCELLED',
    );
  });

  it('an ended term with no grace window expires immediately', () => {
    expect(
      effectiveStatus({ ...term, graceUntil: null, status: 'ACTIVE' }, new Date('2027-01-02Z')),
    ).toBe('EXPIRED');
  });
});

describe('access modes', () => {
  it('orders operations by what they need', () => {
    expect(permits('NO_GROWTH', 'WRITE')).toBe(true);
    expect(permits('NO_GROWTH', 'GROWTH')).toBe(false);
    expect(permits('READ_ONLY', 'WRITE')).toBe(false);
    expect(permits('EXPORT_ONLY', 'EXPORT')).toBe(true);
    expect(permits('EXPORT_ONLY', 'READ')).toBe(false);
    expect(permits('NONE', 'EXPORT')).toBe(false);
  });

  it('a product policy can tighten the default but never loosen it', () => {
    const policy = accessPolicy({ PAST_DUE: 'NO_GROWTH', SUSPENDED: 'FULL', CANCELLED: 'NONE' });
    expect(policy.PAST_DUE).toBe('NO_GROWTH');
    expect(policy.SUSPENDED).toBe('READ_ONLY');
    expect(policy.CANCELLED).toBe('NONE');
  });
});

describe('entitlement evaluation', () => {
  const now = '2026-10-26T00:00:00Z';

  it('allows an included feature and refuses one that is not', () => {
    expect(checkFeature(snapshot(), 'reports.advanced', 'READ', ctx(now)).allowed).toBe(true);
    expect(checkFeature(snapshot(), 'sso', 'READ', ctx(now))).toMatchObject({
      allowed: false,
      reason: DenialReason.FEATURE_NOT_INCLUDED,
    });
  });

  it('refuses a snapshot for another tenant or product even when it would allow', () => {
    expect(checkOperation(snapshot({ tenantId: 'ten_2' }), 'READ', ctx(now))).toMatchObject({
      allowed: false,
      reason: DenialReason.SUBJECT_MISMATCH,
      mode: AccessMode.NONE,
    });
    expect(checkOperation(snapshot({ product: 'product-b' }), 'READ', ctx(now)).allowed).toBe(
      false,
    );
  });

  it('an expired subscription keeps reads and loses writes, including to included features', () => {
    const later = ctx('2027-02-01T00:00:00Z');
    expect(checkOperation(snapshot(), 'READ', later).allowed).toBe(true);
    expect(checkFeature(snapshot(), 'reports.advanced', 'WRITE', later)).toMatchObject({
      allowed: false,
      reason: DenialReason.SUBSCRIPTION_RESTRICTED,
      status: 'EXPIRED',
    });
  });

  it('grace allows edits and refuses growth', () => {
    const grace = ctx('2027-01-05T00:00:00Z');
    expect(checkOperation(snapshot(), 'WRITE', grace).allowed).toBe(true);
    expect(checkQuota(snapshot(), 'users', { used: 1, requested: 1 }, grace)).toMatchObject({
      allowed: false,
      reason: DenialReason.SUBSCRIPTION_RESTRICTED,
    });
  });

  it('enforces quotas at the limit, treats null as unlimited and an unlisted key as zero', () => {
    expect(checkQuota(snapshot(), 'users', { used: 9, requested: 1 }, ctx(now))).toMatchObject({
      allowed: true,
      limit: 10,
      wouldUse: 10,
    });
    expect(checkQuota(snapshot(), 'users', { used: 10, requested: 1 }, ctx(now))).toMatchObject({
      allowed: false,
      reason: DenialReason.QUOTA_EXCEEDED,
    });
    expect(checkQuota(snapshot(), 'unlimited', { used: 1e9, requested: 1 }, ctx(now)).allowed).toBe(
      true,
    );
    expect(checkQuota(snapshot(), 'not-in-plan', { used: 0, requested: 1 }, ctx(now)).allowed).toBe(
      false,
    );
  });

  it('no snapshot grants nothing', () => {
    expect(checkOperation(null, 'READ', ctx(now))).toMatchObject({
      allowed: false,
      reason: DenialReason.NO_SUBSCRIPTION,
    });
  });
});

describe('snapshot parsing', () => {
  it('round-trips a valid snapshot', () => {
    const parsed = parseEntitlementSnapshot(JSON.parse(JSON.stringify(snapshot())));
    expect(parsed).toEqual({ ok: true, snapshot: snapshot() });
  });

  it.each([
    ['an unknown status', { status: 'LIFETIME' }],
    ['a negative limit', { limits: { users: -1 } }],
    ['a fractional limit', { limits: { users: 1.5 } }],
    ['a malformed feature key', { features: ['Reports Advanced'] }],
    ['a wrong schema version', { schemaVersion: 2 }],
  ])('refuses %s', (_label, patch) => {
    expect(parseEntitlementSnapshot({ ...snapshot(), ...patch }).ok).toBe(false);
  });
});

describe('outage policy', () => {
  const resolved = snapshot({ resolvedAt: '2026-10-26T00:00:00Z' });
  const at = (iso: string) => new Date(iso);

  it('prefers a live snapshot even when it grants less', () => {
    const live = snapshot({ status: 'SUSPENDED' });
    expect(resolveSnapshot(live, resolved, at('2026-10-26T00:10:00Z'))).toMatchObject({
      snapshot: live,
      source: SnapshotSource.LIVE,
    });
  });

  it('degrades a cached snapshot by age and never grants more', () => {
    expect(resolveSnapshot(null, resolved, at('2026-10-26T00:30:00Z')).cap).toBe('FULL');
    expect(resolveSnapshot(null, resolved, at('2026-10-26T12:00:00Z'))).toMatchObject({
      source: 'STALE',
      cap: 'NO_GROWTH',
    });
    expect(resolveSnapshot(null, resolved, at('2026-10-29T00:00:00Z')).cap).toBe('READ_ONLY');
    expect(resolveSnapshot(null, resolved, at('2026-11-10T00:00:00Z')).cap).toBe('EXPORT_ONLY');
  });

  it('with nothing ever obtained, nothing is granted', () => {
    const r = resolveSnapshot(null, null, at('2026-10-26Z'));
    expect(r.source).toBe('UNAVAILABLE');
    expect(
      checkOperation(r.snapshot, OperationKind.READ, { ...ctx('2026-10-26Z'), cap: r.cap }).allowed,
    ).toBe(false);
  });

  it('the cap is applied in evaluation', () => {
    const r = resolveSnapshot(null, resolved, at('2026-10-26T12:00:00Z'));
    const c = { ...ctx('2026-10-26T12:00:00Z'), cap: r.cap };
    expect(checkOperation(r.snapshot, 'WRITE', c).allowed).toBe(true);
    expect(checkQuota(r.snapshot, 'users', { used: 0, requested: 1 }, c).allowed).toBe(false);
  });
});

describe('activation requests', () => {
  it('round-trips and refuses garbage', () => {
    const request = {
      format: 'mxa1' as const,
      product: 'product-a',
      installationId: 'inst_2',
      licenseId: 'lic_1',
      requestedAt: '2026-10-26T00:00:00.000Z',
      reason: 'SERVER_REPLACEMENT' as const,
    };
    expect(decodeActivationRequest(encodeActivationRequest(request))).toEqual(request);
    expect(decodeActivationRequest('not-base64-json')).toBeNull();
    expect(
      decodeActivationRequest(encodeActivationRequest({ ...request, reason: 'X' as 'RENEWAL' })),
    ).toBeNull();
  });
});
