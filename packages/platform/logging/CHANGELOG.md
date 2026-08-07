# @munaxa/logging

## 2.4.0

### Patch Changes

- @munaxa/types@2.4.0
- @munaxa/interfaces@2.4.0

## 2.3.0

### Minor Changes

- b1284b1: Complete the audit append pipeline so a product can append under its own vocabulary and its own
  record identity. Additive: every existing signature keeps its default, and no digest or identifier
  changes.

  **P-8 — generic append.** P-7 made `AuditRecord<TName>` generic and widened `verifyChain`, which let
  a product _verify_ its chain but not _append_ to one: `AuditSealer`, `AuditRepositoryPort`,
  `AuditSinkPort`, `AuditExporterPort` and `AuditService` all stayed pinned to `SecurityEventName`. The
  parameter now reaches all of them, defaulted, so existing consumers compile unchanged.
  `MemoryAuditRepository`, `LoggingAuditSink` and `BatchingSink` are generic too. `record()` keeps the
  platform vocabulary via a `this: AuditService<SecurityEventName>` parameter rather than a cast — it
  builds events from `SECURITY_EVENTS`, so that is what it is for.

  **P-9 — configurable record identity.** `AuditServiceOptions.generateId?: (sequence, recordedAt)`.
  The ordering is the substance: the platform's own id is derived from the digest and can only be
  computed after hashing, but a product whose digest _covers_ its id needs it to exist first, or the
  two are circular. Supplying a generator flips the order — the id is minted, passed to the canonical
  format as `recordId`, then hashed. Omitting it keeps `aud_${sequence}_${hash…}` exactly.

  `severityFor` and `logSecurityEvent` accept any vocabulary; an unknown name has no declared default
  and falls back to `info`, which is the honest answer for an event the platform has never heard of.

### Patch Changes

- Updated dependencies [b1284b1]
  - @munaxa/types@2.3.0
  - @munaxa/interfaces@2.3.0

## 2.2.0

### Patch Changes

- Updated dependencies [387b5af]
  - @munaxa/types@2.2.0
  - @munaxa/interfaces@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [0fff798]
  - @munaxa/interfaces@2.1.0
  - @munaxa/types@2.1.0

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- Version aligned with the 2.0 platform release. No API change in this package.
