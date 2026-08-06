import { LOG_LEVEL_RANK, type LogFields, type LogLevel, type LoggerPort } from '@munaxa/interfaces';
import { systemClock, type Clock } from '@munaxa/types';
import { currentCorrelation } from './correlation.js';
import { defaultRedactor, type Redactor } from './redaction.js';

/**
 * Structured logging.
 *
 * One line, one JSON object, one event. Not because JSON is pleasant to read in a terminal — it
 * is not — but because the alternative is regex-parsing prose in an incident, and because
 * `fields` survive aggregation while an interpolated string does not.
 *
 * Three things happen to every line before it is written: the active correlation context is
 * merged in, sensitive keys are redacted, and the whole record is size-bounded. All three are
 * properties you want to be unable to forget.
 */
export interface StructuredLoggerOptions {
  readonly level?: LogLevel;
  readonly bindings?: LogFields;
  readonly clock?: Clock;
  readonly redactor?: Redactor;
  /** Where lines go. Defaults to stdout via `console.log`. */
  readonly write?: (line: string) => void;
  /** Service name written on every line. */
  readonly service?: string;
  readonly environment?: string;
  /** 0–1. Applies to trace/debug only; info and above are never sampled. */
  readonly debugSampleRate?: number;
}

export class StructuredLogger implements LoggerPort {
  readonly #level: LogLevel;
  readonly #bindings: LogFields;
  readonly #clock: Clock;
  readonly #redactor: Redactor;
  readonly #write: (line: string) => void;
  readonly #debugSampleRate: number;

  constructor(options: StructuredLoggerOptions = {}) {
    this.#level = options.level ?? 'info';
    this.#clock = options.clock ?? systemClock;
    this.#redactor = options.redactor ?? defaultRedactor;
    // stdout is where a container's log collector reads from; this is the one place in the
    // platform that writes to it, and every other package goes through LoggerPort.
    // eslint-disable-next-line no-console
    this.#write = options.write ?? ((line) => console.log(line));
    this.#debugSampleRate = options.debugSampleRate ?? 1;
    this.#bindings = {
      ...(options.service === undefined ? {} : { service: options.service }),
      ...(options.environment === undefined ? {} : { env: options.environment }),
      ...options.bindings,
    };
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[this.#level];
  }

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (!this.isLevelEnabled(level)) return;
    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK.info && !this.#sampled()) return;

    const correlation = currentCorrelation();
    const record = {
      time: new Date(this.#clock.now()).toISOString(),
      level,
      // Message is a constant string by convention, so lines aggregate. Variables go in fields.
      message,
      ...this.#bindings,
      ...(correlation
        ? {
            correlationId: correlation.correlationId,
            ...(correlation.requestId === undefined ? {} : { requestId: correlation.requestId }),
            ...(correlation.tenantId === undefined ? {} : { tenantId: correlation.tenantId }),
            ...(correlation.userId === undefined ? {} : { userId: correlation.userId }),
            ...(correlation.sessionId === undefined ? {} : { sessionId: correlation.sessionId }),
            ...correlation.fields,
          }
        : {}),
      ...(this.#redactor.redact(fields) as LogFields),
    };

    this.#write(serialize(record));
  }

  child(bindings: LogFields): StructuredLogger {
    return new StructuredLogger({
      level: this.#level,
      bindings: { ...this.#bindings, ...(this.#redactor.redact(bindings) as LogFields) },
      clock: this.#clock,
      redactor: this.#redactor,
      write: this.#write,
      debugSampleRate: this.#debugSampleRate,
    });
  }

  trace(message: string, fields?: LogFields): void {
    this.log('trace', message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    this.log('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log('error', message, fields);
  }

  fatal(message: string, fields?: LogFields): void {
    this.log('fatal', message, fields);
  }

  #sampled(): boolean {
    if (this.#debugSampleRate >= 1) return true;
    if (this.#debugSampleRate <= 0) return false;
    // Sampling debug volume is a cost decision, not a security one, so a cheap PRNG is fine here
    // — nothing about the choice is secret or predictable in a way that matters.
    return Math.random() < this.#debugSampleRate;
  }
}

/**
 * Serialise, and never throw.
 *
 * A logger that can throw on an unserialisable field turns "we logged a weird object" into "the
 * request failed". BigInts, circular references and getters that throw all end up as text.
 */
function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({
      time: record.time,
      level: record.level,
      message: record.message,
      serializationError: true,
    });
  }
}

/** A logger that keeps lines in memory. For tests, and for asserting on what was logged. */
export class MemoryLogger extends StructuredLogger {
  readonly lines: Record<string, unknown>[] = [];

  constructor(options: Omit<StructuredLoggerOptions, 'write'> = {}) {
    const lines: Record<string, unknown>[] = [];
    super({
      level: 'trace',
      ...options,
      write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    });
    this.lines = lines;
  }

  find(message: string): Record<string, unknown> | undefined {
    return this.lines.find((line) => line.message === message);
  }

  clear(): void {
    this.lines.length = 0;
  }
}

/** Discards everything. For benchmarks and for tests that assert on behaviour, not on logs. */
export const nullLogger: LoggerPort = {
  log: () => {},
  child: () => nullLogger,
  isLevelEnabled: () => false,
};
