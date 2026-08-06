import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { CorrelationId, TenantId } from '@munaxa/types';

/**
 * Correlation context.
 *
 * One identifier follows a request through every log line, every audit record and every
 * outbound call. Without it, investigating an incident means guessing which of forty thousand
 * lines belong to the session in the report.
 *
 * The platform's services take context as an explicit parameter — this store exists for the
 * places that genuinely cannot thread it: a logger inside a repository, a transport-level error
 * handler, a background continuation. `AsyncLocalStorage` keeps it correct across awaits, which
 * a module-level variable does not.
 */
export interface CorrelationContext {
  readonly correlationId: CorrelationId;
  readonly requestId?: string;
  readonly tenantId?: TenantId;
  readonly userId?: string;
  readonly sessionId?: string;
  /** Extra fields merged into every log line inside this scope. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function newCorrelationId(): CorrelationId {
  return randomUUID() as CorrelationId;
}

/** Run `work` with a correlation context attached to everything it awaits. */
export function withCorrelation<T>(context: CorrelationContext, work: () => T): T {
  return storage.run(context, work);
}

export function currentCorrelation(): CorrelationContext | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): CorrelationId | undefined {
  return storage.getStore()?.correlationId;
}

/** Merge fields into the active context for the remainder of the current scope. */
export function enrichCorrelation(fields: Readonly<Record<string, unknown>>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current as { fields?: Record<string, unknown> }, {
    fields: { ...current.fields, ...fields },
  });
}

/**
 * The header a correlation id travels on between services.
 *
 * Inbound values are accepted only when they look like an identifier: a correlation id is echoed
 * into logs, and an unvalidated one is a log-injection vector (a newline turns one line into
 * two, one of which the attacker wrote).
 */
export const CORRELATION_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{8,128}$/;

export function sanitizeCorrelationId(value: string | undefined): CorrelationId | undefined {
  if (!value || !SAFE_CORRELATION.test(value)) return undefined;
  return value as CorrelationId;
}

/** Continue an inbound trace when the header is well-formed, start a new one otherwise. */
export function resolveCorrelationId(header: string | undefined): CorrelationId {
  return sanitizeCorrelationId(header) ?? newCorrelationId();
}
