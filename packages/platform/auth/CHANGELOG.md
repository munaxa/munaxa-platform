# @munaxa/auth

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
