/**
 * @munaxa/auth — every way a principal can prove who it is.
 *
 * The package owns authentication and nothing else: it decides whether a credential is good, and
 * hands back a decision. Creating the session belongs to `@munaxa/session`, deciding what the
 * principal may then do belongs to `@munaxa/rbac`, and recording that it happened belongs to
 * `@munaxa/audit`. That separation is what lets a product replace any one of them.
 *
 * What it does insist on, because these are the mistakes that recur:
 *
 * - Passwords are hashed with a memory-hard KDF and rehashed transparently as parameters rise.
 * - No response distinguishes an unknown account from a wrong password — including by timing.
 * - Refresh tokens are opaque, hashed at rest, single-use, and a replay revokes the whole family.
 * - Reset flows deliver a single-use link. No password, temporary or otherwise, is ever sent.
 * - Every second factor is single-use and compared in constant time.
 */

export * from './password-policy.js';
export * from './tokens.js';
export * from './mfa.js';
export * from './reset.js';
export * from './login.js';
export * from './machine.js';
export * from './providers.js';
export * from './http.js';
export * from './stores.js';
