/**
 * @munaxa/crypto — the only package in the ecosystem that calls a cryptographic primitive.
 *
 * Everything is built on `node:crypto`. There is no third-party dependency, no native build step
 * and no algorithm choice left to the caller: `encrypt` is AES-256-GCM, passwords are scrypt with
 * calibrated parameters, and comparisons are constant-time whether or not the caller remembered.
 *
 * The rule the rest of the platform follows: if you are reaching for `node:crypto`, the thing you
 * need belongs here instead, so it is reviewed once and rotated once.
 */

export * from './encoding.js';
export * from './random.js';
export * from './hashing.js';
export * from './password.js';
export * from './keyring.js';
export * from './encryption.js';
export * from './signing.js';
