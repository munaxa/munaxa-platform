# @munaxa/cache

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Added

- `MemoryCache.compareAndSet` — compare by encoded form, not by reference.

### Changed

- `TokenBucket` retries on a lost swap and reports `enforcement`: `compare-and-swap` or
  `best-effort`. It denies rather than admitting on a stale read under sustained contention.
