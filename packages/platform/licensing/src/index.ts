/**
 * @munaxa/licensing — the shared subscription and licensing contract.
 *
 * Pure rules and wire formats. No key, no table, no HTTP client and no product vocabulary: the
 * central service owns the records and the private key, each product owns its catalogue and its
 * enforcement, and this package is the part they must agree on.
 */
export * from './lifecycle.js';
export * from './access.js';
export * from './entitlements.js';
export * from './availability.js';
export * from './license.js';
export * from './audit.js';
export * from './ports.js';
