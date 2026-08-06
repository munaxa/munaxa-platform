# @munaxa/audit

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

- Updated dependencies [0fff798]
  - @munaxa/interfaces@2.1.0
  - @munaxa/types@2.1.0
  - @munaxa/logging@2.1.0

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- `AuditService` now requires `repository: AuditRepositoryPort`. The chain head lives in the
  store, so two replicas can no longer seal against the same head and produce a chain that
  `verifyChain` reports as tampering.
- `sinks` is optional and now means "also mirror to these". The repository is the chain.
- Conflicts from optimistic adapters are retried up to `maxChainAttempts` (default 5) and counted
  on `conflictCount`.
- A failed chain append fails the caller. A failed sink still does not.

### Removed

- `AuditService.resume()`. There is nothing to resume, and forgetting it used to produce a broken
  chain that nothing in the code path could tell you about.

### Unchanged

- The canonical form. A chain written by 1.0 verifies under 2.0 and vice versa.
