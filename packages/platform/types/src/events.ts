import type { CorrelationId, TenantId } from './ids.js';

/**
 * The canonical security-event vocabulary.
 *
 * Every package emits from this list and nothing else. A shared, closed vocabulary is what makes
 * a single dashboard, a single alert rule and a single SIEM pipeline work across seven products —
 * the alternative is `login_ok` in one service and `user.signed_in` in the next.
 *
 * Names are `<domain>.<subject>.<past-tense-verb>`. Adding a name is a minor version; changing
 * or removing one is a breaking change. See docs/security-platform/extension-guide.md.
 */
export const SECURITY_EVENTS = [
  // Authentication
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.login.blocked',
  'auth.logout.succeeded',
  'auth.account.locked',
  'auth.account.unlocked',
  'auth.password.changed',
  'auth.password.reset.requested',
  'auth.password.reset.completed',
  'auth.password.policy.rejected',
  'auth.mfa.enrolled',
  'auth.mfa.removed',
  'auth.mfa.challenged',
  'auth.mfa.succeeded',
  'auth.mfa.failed',
  'auth.token.issued',
  'auth.token.refreshed',
  'auth.token.revoked',
  'auth.token.reuse.detected',
  'auth.apikey.created',
  'auth.apikey.revoked',
  'auth.apikey.used',
  'auth.provider.linked',
  'auth.provider.unlinked',
  'auth.impersonation.started',
  'auth.impersonation.ended',

  // Authorization
  'authz.permission.granted',
  'authz.permission.denied',
  'authz.policy.denied',
  'authz.role.assigned',
  'authz.role.revoked',
  'authz.role.changed',

  // Sessions
  'session.created',
  'session.refreshed',
  'session.expired',
  'session.revoked',
  'session.limit.reached',
  'session.device.trusted',
  'session.device.untrusted',
  'session.device.registered',

  // Security controls
  'security.ratelimit.exceeded',
  'security.csrf.rejected',
  'security.risk.evaluated',
  'security.risk.blocked',
  'security.threat.detected',
  'security.policy.changed',
  'security.headers.violation.reported',

  // Data and configuration
  'data.exported',
  'data.deleted',
  'config.changed',
  'secret.rotated',
  'crypto.key.rotated',
] as const;

export type SecurityEventName = (typeof SECURITY_EVENTS)[number];

export type EventOutcome = 'success' | 'failure' | 'denied' | 'error';

/** Ordered lowest to highest; comparisons use `SEVERITY_RANK`. */
export type EventSeverity = 'info' | 'notice' | 'warning' | 'critical';

export const SEVERITY_RANK: Readonly<Record<EventSeverity, number>> = {
  info: 10,
  notice: 20,
  warning: 30,
  critical: 40,
};

/**
 * The envelope every emitted security event shares.
 *
 * `actor` is who did it, `target` is what it was done to; both are optional because some events
 * (a rate limit on an unauthenticated endpoint) have neither.
 */
export interface SecurityEvent<
  TPayload = Readonly<Record<string, unknown>>,
  TName extends string = SecurityEventName,
> {
  readonly name: TName;
  readonly occurredAt: number;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly outcome: EventOutcome;
  readonly severity: EventSeverity;
  readonly actor?: EventActor;
  readonly target?: EventTarget;
  readonly source?: EventSource;
  /** Event-specific, already redacted. Never contains credentials, tokens or their hashes. */
  readonly payload?: TPayload;
}

/**
 * An event under any vocabulary — the platform's closed one, or a product's own.
 *
 * The closed union is the right default and stays the default: it is what makes one query work
 * across every product, and widening it to `string` everywhere would trade that for nothing. But a
 * product's compliance trail is not a subset of the platform's security vocabulary — a document
 * checked in, a grade published, a payroll run approved are evidence in their own right, and there
 * is no version of `SECURITY_EVENTS` that should contain them.
 *
 * So the name is a type parameter rather than a fixed union. A product declares its own union of
 * literals and gets the same exhaustiveness checking the platform gets for its own; nothing is
 * cast, nothing is widened at a call site that did not ask for it, and code written against the
 * default keeps the closed union exactly as before.
 */
export type AnyAuditEvent<TPayload = Readonly<Record<string, unknown>>> = SecurityEvent<
  TPayload,
  string
>;

export interface EventActor {
  readonly id: string;
  readonly kind: string;
  readonly displayName?: string;
  /**
   * The principal this actor was acting for — delegation, or support impersonation.
   *
   * In the platform because two of the three consumers surveyed already carry it independently
   * (`on_behalf_of_id` in Munaxa Docs, `onBehalfOf` in Munaxa School), and because it is a
   * security fact rather than a domain one: "who really did this" is the question an incident
   * asks, and an answer only one product records is an answer the shared trail cannot give.
   *
   * Ignored by canonical format 1, which hashes only `actor.id` and `actor.kind` — so no existing
   * digest changes. A format that needs it covered says so by being a new version.
   */
  readonly onBehalfOf?: string;
}

export interface EventTarget {
  readonly id: string;
  readonly type: string;
  readonly displayName?: string;
}

export interface EventSource {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly country?: string;
  readonly component?: string;
}

/** The default severity for each event, overridable per emission. */
export const DEFAULT_SEVERITY: Readonly<Partial<Record<SecurityEventName, EventSeverity>>> = {
  'auth.login.failed': 'notice',
  'auth.login.blocked': 'warning',
  'auth.account.locked': 'warning',
  'auth.token.reuse.detected': 'critical',
  'auth.mfa.failed': 'warning',
  'authz.permission.denied': 'notice',
  'authz.policy.denied': 'notice',
  'authz.role.changed': 'warning',
  'security.ratelimit.exceeded': 'warning',
  'security.csrf.rejected': 'warning',
  'security.risk.blocked': 'critical',
  'security.threat.detected': 'critical',
  'security.policy.changed': 'warning',
  'session.limit.reached': 'notice',
  'crypto.key.rotated': 'notice',
  'secret.rotated': 'notice',
  'data.deleted': 'warning',
  'data.exported': 'warning',
};

export function severityFor(name: SecurityEventName): EventSeverity {
  return DEFAULT_SEVERITY[name] ?? 'info';
}

export function isSecurityEventName(value: unknown): value is SecurityEventName {
  return typeof value === 'string' && (SECURITY_EVENTS as readonly string[]).includes(value);
}
