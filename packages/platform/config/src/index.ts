/**
 * @munaxa/config — configuration that fails at startup instead of at 3am.
 *
 * Three things live here: a schema DSL that turns `process.env` into a typed object (and lists
 * every problem at once when it cannot), the secret providers behind `SecretsPort`, and the
 * layered defaults/application/tenant resolution that lets one deployment serve tenants with
 * different security postures.
 */

export * from './schema.js';
export * from './secrets.js';
export * from './flags.js';
export * from './tenant.js';
export * from './platform-schema.js';
