---
'@munaxa/interfaces': minor
'@munaxa/audit': minor
'@munaxa/config': minor
'@munaxa/session': minor
'@munaxa/conformance': minor
---

Close the three Platform gaps the first consumer migration found. All additive; a 2.0.0 consumer
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
deployment. `nestConfig` renders the nested shape an application already reads. `defineConfig`
carries schema-level refinements for rules spanning fields, reported alongside field problems in one
message. `extendConfig` merges product fields into the platform schema and refuses to let a product
redefine a platform field.

**Session (P-5).** `RefreshFamily` and `RefreshFamilyStorePort` make a refresh-token lineage a
first-class session substrate, and `sessionStoreOverFamilies` presents one as a `SessionStorePort` —
so a product whose only server-side auth object is a refresh family gets full session semantics,
including an exact concurrency limit, without adding a sessions table. Optional capabilities are
forwarded only when present, so `limitEnforcement` reports the true mode. The session conformance
suite now runs against both architectures.
