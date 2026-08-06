# @munaxa/session

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- `SessionManager` enforces the concurrency limit through the store transaction when available, a
  `LockPort` when not, and best effort when neither. `limitEnforcement` reports which — the
  difference between a limit and a hint. Log it at startup.
