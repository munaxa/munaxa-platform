# @munaxa/interfaces

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Added

- `AuditRepositoryPort` with `appendChained(tenantId, seal)` — store-owned sequencing.
- `RefreshTokenStorePort.markRotated` and `ResetTokenStorePort.markConsumed` — compare-and-swap
  claims. Both are required.
- `SessionStorePort.createWithinLimit` / `countActive` and `CachePort.compareAndSet` — optional,
  with declared degradation when absent.
- `concurrency.ts`: `ChainConflictError`, `isChainConflict`, `UnsupportedGuaranteeError` and the
  `OperationContract` vocabulary.
- `@atomicity` / `@consistency` / `@idempotency` on every method that carries a guarantee.
