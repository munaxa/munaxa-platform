import type { LogFields, LoggerPort, MetricsPort } from '@munaxa/interfaces';
import { severityFor, type SecurityEvent, type SecurityEventName } from '@munaxa/types';
import { maskEmail } from './redaction.js';

/**
 * The three log genres the platform emits, kept apart on purpose.
 *
 * - **Application** — what the code did. Debuggable, high volume, sampled.
 * - **Security** — what a principal did that a reviewer would care about. Never sampled, always
 *   at notice or above, and shaped identically to an audit event so the two correlate.
 * - **Performance** — how long something took. Emitted as a metric and, over a threshold, as a
 *   log line so a slow path leaves a trace even when metrics are not being watched.
 */

const SEVERITY_TO_LEVEL = {
  info: 'info',
  notice: 'info',
  warning: 'warn',
  critical: 'error',
} as const;

/**
 * Log a security event.
 *
 * This is the log-side twin of `AuditService.record`. Both are called for anything that matters:
 * the audit trail is the durable, queryable, tamper-evident record, and the log line is what the
 * on-call engineer greps at 2am without opening a database.
 */
export function logSecurityEvent(
  logger: LoggerPort,
  event: SecurityEvent,
  fields: LogFields = {},
): void {
  const severity = event.severity ?? severityFor(event.name);
  logger.log(SEVERITY_TO_LEVEL[severity], event.name, {
    kind: 'security',
    outcome: event.outcome,
    severity,
    tenantId: event.tenantId,
    correlationId: event.correlationId,
    ...(event.actor ? { actorId: event.actor.id, actorKind: event.actor.kind } : {}),
    ...(event.target ? { targetId: event.target.id, targetType: event.target.type } : {}),
    ...(event.source?.ipAddress === undefined ? {} : { ip: event.source.ipAddress }),
    ...(event.payload ?? {}),
    ...fields,
  });
}

/** A security log line without a full event envelope, for the edge, where there is no tenant yet. */
export function logSecurityNotice(
  logger: LoggerPort,
  name: SecurityEventName,
  fields: LogFields = {},
): void {
  logger.log(SEVERITY_TO_LEVEL[severityFor(name)], name, { kind: 'security', ...fields });
}

export interface TimingOptions {
  /** Emit a log line when the operation takes longer than this. Default 1000ms. */
  readonly slowThresholdMs?: number;
  readonly metrics?: MetricsPort;
  readonly fields?: LogFields;
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Time an operation, record the duration, and log it when it was slow or when it failed.
 *
 * The failure path matters as much as the timing: an operation that throws still records its
 * duration and its outcome, so a p99 is not quietly computed over successes only.
 */
export async function timed<T>(
  logger: LoggerPort,
  operation: string,
  work: () => Promise<T>,
  options: TimingOptions = {},
): Promise<T> {
  const threshold = options.slowThresholdMs ?? 1_000;
  const start = performance.now();
  let outcome: 'success' | 'failure' = 'success';

  try {
    return await work();
  } catch (error) {
    outcome = 'failure';
    throw error;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    options.metrics?.observe(`${operation}.duration`, durationMs, {
      outcome,
      ...options.tags,
    });

    if (durationMs >= threshold || outcome === 'failure') {
      logger.log(outcome === 'failure' ? 'warn' : 'info', 'operation.completed', {
        kind: 'performance',
        operation,
        durationMs,
        outcome,
        slow: durationMs >= threshold,
        ...options.fields,
      });
    }
  }
}

/** In-memory metrics. Useful in tests and as a fallback when no metrics backend is wired. */
export class MemoryMetrics implements MetricsPort {
  readonly counters = new Map<string, number>();
  readonly observations = new Map<string, number[]>();

  increment(name: string, value = 1, tags?: Readonly<Record<string, string>>): void {
    const key = keyOf(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observe(name: string, value: number, tags?: Readonly<Record<string, string>>): void {
    const key = keyOf(name, tags);
    const values = this.observations.get(key) ?? [];
    values.push(value);
    this.observations.set(key, values);
  }

  percentile(
    name: string,
    percentile: number,
    tags?: Readonly<Record<string, string>>,
  ): number | undefined {
    const values = [...(this.observations.get(keyOf(name, tags)) ?? [])].sort((a, b) => a - b);
    if (values.length === 0) return undefined;
    const index = Math.min(values.length - 1, Math.floor((percentile / 100) * values.length));
    return values[index];
  }
}

function keyOf(name: string, tags?: Readonly<Record<string, string>>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const rendered = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
  return `${name}{${rendered}}`;
}

/**
 * Fields describing a request, with the parts that are personal data reduced.
 *
 * Used by transport adapters so every product logs requests the same way, and so nobody has to
 * decide per-service whether a full email address belongs in a log.
 */
export function requestFields(input: {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
  identifier?: string;
}): LogFields {
  return {
    kind: 'request',
    method: input.method,
    path: input.path,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.ipAddress === undefined ? {} : { ip: input.ipAddress }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent.slice(0, 256) }),
    ...(input.identifier === undefined ? {} : { identifier: maskEmail(input.identifier) }),
  };
}
