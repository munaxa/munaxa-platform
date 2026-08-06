import type { EventOutcome, SecurityContext, SecurityEventName } from '@munaxa/types';
import type { AuditService } from './service.js';

/**
 * Declarative auditing.
 *
 * The wrapper records the event whichever way the call goes: success, failure, or a thrown
 * `PlatformError` that the caller turns into a 403. Recording only on success is the mistake this
 * exists to prevent — the failures are the interesting half of an audit trail.
 */
export interface AuditedOptions {
  readonly event: SecurityEventName;
  /** Derive the target from the call's arguments. Keep it cheap and side-effect free. */
  readonly target?: (args: readonly unknown[]) => { id: string; type: string } | undefined;
  /** Derive an already-safe payload. Never return raw arguments. */
  readonly payload?: (args: readonly unknown[], result: unknown) => Record<string, unknown>;
  /** Record on failure too. Default true. */
  readonly auditFailures?: boolean;
}

/**
 * Wrap a function so every call is audited.
 *
 * The wrapped function must take a `SecurityContext` as its first argument — that is where the
 * tenant, principal and correlation id come from, and requiring it is what stops an audit record
 * from being attributed to nobody.
 */
export function withAudit<TArgs extends readonly unknown[], TResult>(
  audit: AuditService,
  options: AuditedOptions,
  fn: (context: SecurityContext, ...args: TArgs) => Promise<TResult>,
): (context: SecurityContext, ...args: TArgs) => Promise<TResult> {
  const auditFailures = options.auditFailures ?? true;

  return async (context: SecurityContext, ...args: TArgs): Promise<TResult> => {
    try {
      const result = await fn(context, ...args);
      await record(audit, context, options, args, result, 'success');
      return result;
    } catch (error) {
      if (auditFailures) {
        // A failure to audit must not replace the original error — that would hide the incident
        // behind an infrastructure problem.
        await record(audit, context, options, args, undefined, outcomeFor(error)).catch(() => {});
      }
      throw error;
    }
  };
}

async function record(
  audit: AuditService,
  context: SecurityContext,
  options: AuditedOptions,
  args: readonly unknown[],
  result: unknown,
  outcome: EventOutcome,
): Promise<void> {
  const target = options.target?.(args);
  const payload = options.payload?.(args, result);
  await audit.record(context, {
    name: options.event,
    outcome,
    ...(target === undefined ? {} : { target }),
    ...(payload === undefined ? {} : { payload }),
  });
}

function outcomeFor(error: unknown): EventOutcome {
  const code = (error as { code?: string } | undefined)?.code;
  return typeof code === 'string' && code.startsWith('AUTHZ_') ? 'denied' : 'failure';
}

/**
 * A method decorator for products that compile with `experimentalDecorators` — which is every
 * NestJS product in the ecosystem.
 *
 *   @Audited(auditService, { event: 'data.exported' })
 *   async exportGrades(context: SecurityContext, courseId: string) { … }
 *
 * The same rule applies: the first parameter must be the `SecurityContext`. Products on standard
 * TC39 decorators, or on no decorators at all, use `withAudit` and lose nothing but the syntax.
 */
export function Audited(audit: AuditService, options: AuditedOptions) {
  return function decorate(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (
      context: SecurityContext,
      ...args: unknown[]
    ) => Promise<unknown>;

    if (typeof original !== 'function') {
      throw new TypeError('@Audited can only decorate a method');
    }

    descriptor.value = function audited(
      this: unknown,
      context: SecurityContext,
      ...args: unknown[]
    ): Promise<unknown> {
      const bound = (ctx: SecurityContext, ...rest: unknown[]): Promise<unknown> =>
        original.call(this, ctx, ...rest);
      return withAudit(audit, options, bound)(context, ...args);
    };

    return descriptor;
  };
}
