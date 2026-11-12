# @munaxa/auth

## 2.5.0

### Patch Changes

- [#100](https://github.com/munaxa/munaxa-platform/pull/100) [`116650c`](https://github.com/munaxa/munaxa-platform/commit/116650c5eb2df840550b748b5886d12d5a6d4997) Thanks [@tam2om](https://github.com/tam2om)! - `TokenService.verifyAccessToken` now rejects a signed token whose `exp` is missing or not a finite
  number (previously such a token never expired, because the comparison was against `NaN`), rejects a
  non-numeric `iat`, and reads a string `aud` as a one-element list, so it is matched exactly rather
  than as a substring. Tokens minted by `TokenService.issueAccessToken` are unaffected.

  `MfaService.verifyRecoveryCode` now returns `false` unless the account has a confirmed factor, so
  recovery codes left in a store after `remove()` (the store port cannot delete them) or during an
  unconfirmed replacement enrollment no longer pass as a second factor.

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

- Updated dependencies []:
  - @munaxa/types@2.5.0
  - @munaxa/interfaces@2.5.0
  - @munaxa/crypto@2.5.0

## 2.4.1

### Patch Changes

- @munaxa/types@2.4.1
- @munaxa/interfaces@2.4.1
- @munaxa/crypto@2.4.1

## 2.4.0

### Patch Changes

- @munaxa/types@2.4.0
- @munaxa/interfaces@2.4.0
- @munaxa/crypto@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [b1284b1]
  - @munaxa/types@2.3.0
  - @munaxa/interfaces@2.3.0
  - @munaxa/crypto@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [387b5af]
  - @munaxa/types@2.2.0
  - @munaxa/interfaces@2.2.0
  - @munaxa/crypto@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [0fff798]
  - @munaxa/interfaces@2.1.0
  - @munaxa/types@2.1.0
  - @munaxa/crypto@2.1.0

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- `OtpService.issue`, `.verify` and `.get` are asynchronous; pass `cache` to share challenge state
  across replicas.
- `MfaService` takes `replayGuard: CachePort`. Without it, TOTP replay protection is per-process —
  a stolen code is worth one sign-in per pod. `distributed` reports which mode is active.
- `RefreshTokenService.rotate` claims the token with `markRotated` before issuing the replacement.
- `PasswordResetService.complete` claims with `markConsumed` before changing anything.
- `LoginService` emits `auth.account.locked` once, on the attempt that crosses the threshold.

### Added

- `MemoryResetTokenStore.markConsumed`, `MemoryRefreshTokenStore.markRotated`.
