/**
 * @munaxa/logging — structured logs with a correlation id attached to every line.
 *
 * The package exists to make three things impossible to get wrong: forgetting the correlation id,
 * logging a credential, and letting a logging failure break a request. Everything else — where
 * lines go, what level they are, how they are shipped — belongs to the product, through
 * `LoggerPort`.
 */

export * from './redaction.js';
export * from './correlation.js';
export * from './logger.js';
export * from './instrumentation.js';
