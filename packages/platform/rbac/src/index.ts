/**
 * @munaxa/rbac — deny-by-default authorization with a resolver you can reason about.
 *
 * Roles answer the coarse question and policies answer the fine one; the two are combined with
 * deny-overrides, so a denial written once cannot be undone by a grant added later. Nothing here
 * knows what a document, a course or an invoice is — products supply the resource, the platform
 * supplies the decision.
 */

export * from './permissions.js';
export * from './roles.js';
export * from './resolver.js';
export * from './policy.js';
export * from './guards.js';
export * from './stores.js';
