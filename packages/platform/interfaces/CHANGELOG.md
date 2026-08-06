# @munaxa/interfaces

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

## 2.2.0

### Minor Changes

- 387b5af: Generalise the audit canonical model so a product's own chain design can be expressed, without
  changing a single existing digest.

  **P-6 — canonical input.** `CanonicalInput` gains optional `recordId` and `externalId`. The
  platform's own record id is derived from its digest, so format 1 cannot read it and does not want
  to — but that is a fact about the platform's id scheme, not about audit chains. A product whose id
  is minted independently and covered by the digest on purpose could not express its historical
  format at all: the bytes it had to reproduce contained a value the platform never passed in, so its
  history was unverifiable through `verifyChain`. Every platform-native format declares neither field
  and is therefore never passed either, which is what makes this additive.

  `CanonicalFormat` gains `requires` and `covers`. `requires` is declared rather than inferred
  because the failure it prevents is silent: a format reading `recordId` from a record without one
  would hash `undefined` and report a tamper indistinguishable from a real one. `verifyChain` now
  refuses to run such a format and names the missing field.

  **P-7 — event vocabulary.** `SecurityEvent` and `AuditRecord` take the event name as a type
  parameter, defaulted to the closed `SecurityEventName`. A product declares its own union of
  literals and gets the same exhaustiveness checking the platform gets for its own; existing usage is
  unchanged. The platform's vocabulary stays closed so cross-product security queries keep working.
  See ADR-0020: the machinery is general, the vocabulary is security-specific.

  `EventActor` gains optional `onBehalfOf`, present independently in two of three surveyed consumers
  and ignored by format 1.

### Patch Changes

- Updated dependencies [387b5af]
  - @munaxa/types@2.2.0

## 2.1.0

### Minor Changes

- 0fff798: Close the three Platform gaps the first consumer migration found. All additive; a 2.0.0 consumer
  upgrades without changing anything.

  **Audit (P-1).** `AuditSequence` is now `number | bigint`, so a store sequencing with a `bigserial`
  keeps precision past 2^53 on the column that proves nothing was removed from the chain. Canonical
  serialisation is pluggable and versioned: each record carries the format that sealed it and
  `verifyChain` dispatches per record, so a chain spanning a format change verifies end to end and
  history is never re-sealed. Absent `formatVersion` means format 1, whose bytes are unchanged.
  `appendChained` accepts the caller's transaction, so an audit record commits with the change it
  describes; stores that cannot join one advertise `joinsTransactions: false` and throw rather than
  silently opening their own.

  **Configuration (P-4).** Fields accept environment aliases and `remapSchema` adds them to a schema
  the product does not own, so `PLATFORM_SCHEMA` is adoptable without renaming a variable in every
  deployment. An alias may carry a `decode` — with `fromSeconds` and `fromMilliseconds` for the common
  case — because a name is not always the whole difference: `JWT_ACCESS_TTL_SECONDS=900` cannot feed a
  duration field otherwise. It transforms string to string before the field parses, so the platform's
  validation still runs, and it belongs to the source rather than the field, so the canonical name
  keeps platform semantics. `pickSchema` takes the subset of a schema a product actually consumes, so
  adoption is incremental rather than all-or-nothing — `PLATFORM_SCHEMA` carries required secrets, and
  a product not yet wiring field encryption should not have to invent one. `nestConfig` renders the nested shape an application already reads. `defineConfig`
  carries schema-level refinements for rules spanning fields, reported alongside field problems in one
  message. `extendConfig` merges product fields into the platform schema and refuses to let a product
  redefine a platform field.

  **Session (P-5).** `RefreshFamily` and `RefreshFamilyStorePort` make a refresh-token lineage a
  first-class session substrate, and `sessionStoreOverFamilies` presents one as a `SessionStorePort` —
  so a product whose only server-side auth object is a refresh family gets full session semantics,
  including an exact concurrency limit, without adding a sessions table. Optional capabilities are
  forwarded only when present, so `limitEnforcement` reports the true mode. `SessionManager` accepts a
  `generateId`, so a product whose store keys sessions by UUID does not have to migrate the column type
  and every foreign key pointing at it in exchange for the platform's `sess_…` identifier format. The session conformance
  suite now runs against both architectures.

### Patch Changes

- @munaxa/types@2.1.0

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
