/**
 * @munaxa/session — sessions as first-class, revocable, device-bound objects.
 *
 * The design decision worth stating: the platform does not treat a signed token as a session.
 * A token cannot be un-issued, so anything a product promises a user — "sign out everywhere",
 * "revoke this device", "we locked your account" — has to be backed by server-side state that is
 * actually consulted. That is what lives here.
 *
 * Two persistence models are supported and neither is privileged: a `sessions` table via
 * `SessionStorePort`, or a refresh-token lineage via `RefreshFamilyStorePort` and
 * `sessionStoreOverFamilies`. A product picks the one it already has; the session semantics are
 * identical either way, and the conformance suite proves it against both.
 */

export * from './policy.js';
export * from './manager.js';
export * from './devices.js';
export * from './stores.js';
export * from './families.js';
