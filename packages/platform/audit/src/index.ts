/**
 * @munaxa/audit — a hash-chained record of who did what, to what, and whether it worked.
 *
 * The distinction from logging is worth stating plainly, because products routinely conflate the
 * two: logs are for engineers and may be sampled, truncated and rotated away; the audit trail is
 * for reviewers, regulators and incident responders, is never sampled, and is expected to still
 * be there — and still be verifiable — a year later.
 */

export * from './canonical.js';
export * from './events.js';
export * from './service.js';
export * from './repository.js';
export * from './exporters.js';
export * from './decorators.js';
export * from './middleware.js';
