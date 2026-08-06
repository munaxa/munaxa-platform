/**
 * @munaxa/interfaces — the seams.
 *
 * Every capability the platform needs from the outside world is declared here as an interface
 * with no implementation and no dependency beyond `@munaxa/types`. That is what makes the
 * platform deployment and cloud agnostic: `@munaxa/auth` knows there is a session store, and
 * knows nothing about Postgres, Prisma, Redis, DynamoDB or D1.
 *
 * Adding a method to a port is a breaking change for every implementer. Add a new optional
 * method, or a new port, instead. See docs/security-platform/extension-guide.md.
 */

export * from './cache.js';
export * from './observability.js';
export * from './identity.js';
export * from './sessions.js';
export * from './tokens.js';
export * from './authorization.js';
export * from './delivery.js';
export * from './platform.js';
export * from './registry.js';
export * from './ports.js';
