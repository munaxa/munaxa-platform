# ADR-0020 — What `@munaxa/audit` is for

**Status:** accepted (Platform P3.7)
**Supersedes:** the unstated assumption that every product migrates its audit trail to the platform

---

## The question

P-7 asked the platform to choose between:

- **Option A** — `@munaxa/audit` is a *security* audit trail. Products keep richer compliance trails.
- **Option B** — `@munaxa/audit` is a *general compliance* audit trail for every product.

## Decision

**Neither, as stated. The split is not between two kinds of trail — it is between the machinery and
the vocabulary.**

- The **machinery** — hash chaining, versioned canonical formats, historical verification,
  transaction-aware append, bigint sequences, tamper evidence — is **general**. Every product's
  compliance trail wants exactly these properties, and none of them are security-specific.
- The **vocabulary** — `SECURITY_EVENTS`, the closed 52-name union — is **security-specific and
  stays closed**. It exists so one query works across every product, and a vocabulary that admits
  `DOCUMENT_CHECKED_IN` and `GRADE_PUBLISHED` no longer answers "show me every failed login
  everywhere". Widening it would spend the property to buy nothing.

So: **Option A for the vocabulary, Option B for the framework.**

## Why the evidence forced this

All three consumers were surveyed rather than reasoning from Docs alone.

| Product | Trail today | Chain | Identifier | Shape |
| --- | --- | --- | --- | --- |
| **Munaxa Docs** | `audit_event`, 79 actions across 13 modules | v1/v2/v3, gap-free `BigInt` sequence | `uuidv7`, **covered by the digest** | document-management compliance |
| **Munaxa School** | `AuditLog` | **none at all** | `uuid`, not covered | general compliance: `before`/`after` diffs, `entityType`/`entityId`, `actorRole`, nullable tenant for platform-level events |
| **Munaxa Work** | row metadata only (`createdBy`, `updatedBy`) | none | — | greenfield |

Three facts decide it:

1. **Only a minority of any of these trails is security.** Docs' 19 identity actions sit beside 60
   document, workflow, retention and library actions. School's are `transaction.create`-shaped.
   A framework usable only for the security minority would leave each product running two trails.
2. **Docs' trail cannot be split without loss.** Its per-tenant sequence is gap-free by design —
   "a contiguous sequence is what makes a hole visible". Moving the security subset to a separate
   platform chain breaks that argument for the remainder. Partial adoption is a regression.
3. **School has no chain at all.** It is the product that most needs the machinery and has no
   history to preserve. If the framework were security-only, School would build a second chain by
   hand — which is the duplication the platform exists to prevent.

## What this means in code

`SecurityEvent` and `AuditRecord` take the event name as a type parameter, defaulted to the closed
union:

```ts
interface SecurityEvent<TPayload = …, TName extends string = SecurityEventName>
interface AuditRecord<TName extends string = SecurityEventName>
```

A product declares its own union of literals and gets the same exhaustiveness checking the platform
gets for its own. Nothing is cast, nothing is widened at a call site that did not ask for it, and
every existing usage keeps the closed union unchanged. Type safety is not weakened — it is
parameterised.

`AnyAuditEvent` is the alias for "an event under any vocabulary", used where the platform must
handle both — canonical formats, and verification.

## Consequences

- **A product may run one trail, not two.** Its own vocabulary, the platform's chain.
- **Cross-product security queries still work**, because platform events keep platform names.
- **The platform does not learn any product's domain.** No `DOCUMENT_*` name will ever appear in
  `SECURITY_EVENTS`.
- **`AuditService` still refuses unknown names** for events it constructs itself: `auditEvent()` and
  the closed vocabulary are unchanged for platform-emitted events. The generic applies to records a
  product seals with its own format.

## What was rejected

| Option | Why not |
| --- | --- |
| Open `SECURITY_EVENTS` to arbitrary strings | Destroys the cross-product query property, which is the only reason it is closed. |
| A `product:` namespace prefix inside the same union | Type-level namespacing via template literals gives far weaker checking than a product-declared union, for the same expressive power. |
| Products cast their names to `SecurityEventName` | Puts a false name in the evidence, and it is the compatibility hack this phase forbids. |
| Separate `ComplianceRecord` type alongside `AuditRecord` | Two chain implementations to keep in step, and every verifier written twice. |
