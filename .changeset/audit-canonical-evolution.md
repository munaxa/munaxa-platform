---
'@munaxa/types': minor
'@munaxa/interfaces': minor
'@munaxa/audit': minor
---

Generalise the audit canonical model so a product's own chain design can be expressed, without
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
