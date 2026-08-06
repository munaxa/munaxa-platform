# @munaxa/notifications

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- Deduplication claims through a shared `dedupeStore: CachePort` **before** delivery instead of
  remembering after it: remembering afterwards means both replicas have already sent. A failed
  delivery releases the claim. `distributed` reports whether the claim is shared.
- Critical-priority messages are still never deduplicated.
