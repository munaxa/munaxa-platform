---
'@munaxa/types': minor
'@munaxa/interfaces': minor
'@munaxa/logging': minor
'@munaxa/audit': minor
---

Complete the audit append pipeline so a product can append under its own vocabulary and its own
record identity. Additive: every existing signature keeps its default, and no digest or identifier
changes.

**P-8 — generic append.** P-7 made `AuditRecord<TName>` generic and widened `verifyChain`, which let
a product *verify* its chain but not *append* to one: `AuditSealer`, `AuditRepositoryPort`,
`AuditSinkPort`, `AuditExporterPort` and `AuditService` all stayed pinned to `SecurityEventName`. The
parameter now reaches all of them, defaulted, so existing consumers compile unchanged.
`MemoryAuditRepository`, `LoggingAuditSink` and `BatchingSink` are generic too. `record()` keeps the
platform vocabulary via a `this: AuditService<SecurityEventName>` parameter rather than a cast — it
builds events from `SECURITY_EVENTS`, so that is what it is for.

**P-9 — configurable record identity.** `AuditServiceOptions.generateId?: (sequence, recordedAt)`.
The ordering is the substance: the platform's own id is derived from the digest and can only be
computed after hashing, but a product whose digest *covers* its id needs it to exist first, or the
two are circular. Supplying a generator flips the order — the id is minted, passed to the canonical
format as `recordId`, then hashed. Omitting it keeps `aud_${sequence}_${hash…}` exactly.

`severityFor` and `logSecurityEvent` accept any vocabulary; an unknown name has no declared default
and falls back to `info`, which is the honest answer for an event the platform has never heard of.
