/**
 * @munaxa/notifications — delivery without the product knowing which transport ran.
 *
 * The platform's interest here is narrow: the security notifications a user needs in order to
 * notice an account takeover must arrive, and no notification may ever carry a credential. Both
 * are enforced rather than documented — critical messages bypass deduplication and fail loudly
 * when no transport exists, and a payload containing a password-shaped field is refused.
 */

export * from './templates.js';
export * from './service.js';
export * from './transports.js';
