import {
  severityFor,
  type CorrelationId,
  type EventActor,
  type EventOutcome,
  type EventSeverity,
  type EventSource,
  type EventTarget,
  type Principal,
  type SecurityContext,
  type SecurityEvent,
  type SecurityEventName,
  type TenantId,
  principalSubject,
} from '@munaxa/types';

/**
 * Building a well-formed audit event.
 *
 * The builder exists because an audit record with a missing tenant, a missing actor or an
 * invented event name is worse than no record: it looks like coverage while being unqueryable.
 * `auditEvent` takes the context the caller already has and fills in everything derivable.
 */
export interface AuditEventInput {
  readonly name: SecurityEventName;
  readonly outcome: EventOutcome;
  readonly severity?: EventSeverity;
  readonly target?: EventTarget;
  readonly actor?: EventActor;
  readonly source?: EventSource;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly occurredAt?: number;
}

export function auditEvent(context: SecurityContext, input: AuditEventInput): SecurityEvent {
  return {
    name: input.name,
    occurredAt: input.occurredAt ?? Date.now(),
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    outcome: input.outcome,
    severity: input.severity ?? severityFor(input.name),
    actor: input.actor ?? actorOf(context.principal),
    ...(input.target === undefined ? {} : { target: input.target }),
    source: input.source ?? sourceOf(context),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  };
}

export function actorOf(principal: Principal): EventActor {
  return { id: principalSubject(principal), kind: principal.kind };
}

export function sourceOf(context: SecurityContext): EventSource {
  return {
    ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent }),
    ...(context.country === undefined ? {} : { country: context.country }),
  };
}

/**
 * Build an event without a full security context.
 *
 * The edge does not always have one — a rate limit fires before authentication, a CSRF rejection
 * before a session is resolved. Those events still belong in the trail.
 */
export function anonymousAuditEvent(
  tenantId: TenantId,
  correlationId: CorrelationId,
  input: AuditEventInput,
): SecurityEvent {
  return {
    name: input.name,
    occurredAt: input.occurredAt ?? Date.now(),
    tenantId,
    correlationId,
    outcome: input.outcome,
    severity: input.severity ?? severityFor(input.name),
    actor: input.actor ?? { id: 'anonymous', kind: 'anonymous' },
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  };
}

/**
 * Events that must be recorded even when audit sampling or filtering is configured.
 *
 * These are the ones a regulator, an incident responder or a customer's security team asks for
 * by name. A product can quieten the rest; it cannot quieten these.
 */
export const NON_SUPPRESSIBLE_EVENTS: ReadonlySet<SecurityEventName> = new Set([
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.account.locked',
  'auth.password.changed',
  'auth.password.reset.completed',
  'auth.mfa.enrolled',
  'auth.mfa.removed',
  'auth.token.reuse.detected',
  'auth.impersonation.started',
  'auth.impersonation.ended',
  'authz.role.assigned',
  'authz.role.revoked',
  'authz.role.changed',
  'security.policy.changed',
  'security.risk.blocked',
  'security.threat.detected',
  'data.exported',
  'data.deleted',
  'config.changed',
  'secret.rotated',
  'crypto.key.rotated',
]);
