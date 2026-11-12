# @munaxa/security

## 2.5.0

### Minor Changes

- [#107](https://github.com/munaxa/munaxa-platform/pull/107) [`bc1f21b`](https://github.com/munaxa/munaxa-platform/commit/bc1f21bf2b9a54b9dc185bd5ef0ba15b8c69bc28) Thanks [@tam2om](https://github.com/tam2om)! - `RateLimiter` keeps every count in the rule's own window, so the adaptive penalty no longer restarts
  the count after a refusal (previously 10 per 15 minutes admitted 28 of 30 attempts one second apart).
  The penalty is now a separate block whose length grows with each violation (one window, then
  `adaptiveFactor` times longer, at most 16 windows); refused attempts still count, and
  `Retry-After` is the time the subject would actually be admitted again.

  New `RateLimitRule.onStoreFailure: 'deny'` refuses (with `degraded`) when the counter store fails;
  the baseline login, password-reset and MFA rules use it, and `securityPipeline` answers such a
  refusal with 503 `SECURITY_RATE_LIMIT_UNAVAILABLE`. `check()` now reports `degraded` whenever any
  applicable rule's store failed. The baseline rules match a canonical route (`canonicalRoutePath`,
  `isRoute`: case, repeated and trailing slashes, query, absolute-form and percent-encoding folded),
  only their method, and the reset rule also covers `/password/forgot`.

  `SlidingWindowCounter.hitWithHistory` answers the two windows behind an estimate.
  `RedisCache.increment` writes the counter and its expiry in one script when the client offers
  `eval`, and gives an expiry to a counter found without one.

  **Behaviour changes for consumers of `BASELINE_RATE_LIMIT_RULES`** (review before upgrading): the
  login, password-reset and MFA rules now refuse with 503 while the cache is unavailable;
  `mfa-verify-per-session` no longer counts `GET`/`HEAD`; `password-reset-per-ip` counts only `POST`
  (a product completing a reset with another method must add its own rule). Per-address rules count an
  IPv6 client by its /64 (`addressSubject`). A counter or block value that is not a number is now a
  store failure (the rule's `onStoreFailure` decides) instead of an unlimited pass; an unreadable
  violation count is read as a high one, so the next block is long rather than skipped. A rule whose
  `cost` exceeds its `limit` (or, for a token bucket, its `burst`), or whose limit or window is not
  positive, is refused at
  construction.

  `LoginService` keys lockout by the trimmed, lowercased identifier, so surrounding whitespace no longer
  gives the same account a fresh lockout counter.

### Patch Changes

- Updated dependencies [bc1f21b]:
  - @munaxa/cache@2.5.0
  - @munaxa/types@2.5.0
  - @munaxa/interfaces@2.5.0
  - @munaxa/crypto@2.5.0

## 2.4.1

### Patch Changes

- @munaxa/types@2.4.1
- @munaxa/interfaces@2.4.1
- @munaxa/crypto@2.4.1
- @munaxa/cache@2.4.1

## 2.4.0

### Patch Changes

- @munaxa/types@2.4.0
- @munaxa/interfaces@2.4.0
- @munaxa/crypto@2.4.0
- @munaxa/cache@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [b1284b1]
  - @munaxa/types@2.3.0
  - @munaxa/interfaces@2.3.0
  - @munaxa/crypto@2.3.0
  - @munaxa/cache@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [387b5af]
  - @munaxa/types@2.2.0
  - @munaxa/interfaces@2.2.0
  - @munaxa/crypto@2.2.0
  - @munaxa/cache@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [0fff798]
  - @munaxa/interfaces@2.1.0
  - @munaxa/types@2.1.0
  - @munaxa/crypto@2.1.0
  - @munaxa/cache@2.1.0

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- Version aligned with the 2.0 platform release. No API change in this package.
