# Audit chain evolution

How the audit format changes without invalidating the evidence already written.

Audit records outlive the code that produced them. A chain written three years ago is verified by
code shipped today, and if that code cannot reproduce the digest, the chain reports tampering —
which looks exactly like the thing the chain exists to detect. Everything below follows from that
one constraint.

---

## Sequences: `number` or `bigint`

`AuditSequence` is `number | bigint`. Both are valid, and a store chooses.

A store whose sequence is a `bigserial` returns a `bigint` past 2^53, where a double can no longer
represent consecutive integers. Rounding there would make two records share a position — on the
column that proves nothing was removed from the end of the chain.

Never compare with `===` or advance with `+ 1`: `1 === 1n` is `false` and `1n + 1` is a
`TypeError`. Use the helpers:

```ts
import { sameSequence, nextSequence } from '@munaxa/interfaces';
import { compareSequences } from '@munaxa/audit';

sameSequence(head.sequence, expected);   // true across representations
nextSequence(head.sequence);             // preserves the representation
records.sort((a, b) => compareSequences(a.sequence, b.sequence));
```

A chain may switch representation mid-life. The digest depends on the *position*, not on how
JavaScript held it — `canonicalize(…, 7)` and `canonicalize(…, 7n)` produce identical bytes — so
migrating a column from `int` to `bigint` does not require re-sealing anything.

**Rendering.** `JSON.stringify` throws on a `bigint`. The platform's exporters and logging sink
render one as decimal digits and leave a `number` untouched, so existing exports are byte-identical
and a receiver never rounds the field. A product's own exporter must do the same.

---

## Canonical formats

`canonicalize` used to be a frozen function: the bytes could never change, because changing them
would invalidate every historical digest. It is now a value.

```ts
interface CanonicalFormat {
  readonly version: number;
  canonicalize(input: CanonicalInput): string;
}
```

Each record carries `formatVersion`, and `verifyChain` re-hashes each record with the format that
sealed **it**. A chain spanning a format change verifies end to end, in one pass.

**Absent `formatVersion` means format 1.** That default is not a convenience — an append-only audit
table cannot be back-filled, so the format has to be discoverable from the row rather than assumed
by the verifier. Every record Platform 2.0.0 wrote verifies unchanged, and the platform still omits
the field when sealing with format 1 so records stay byte-identical.

### Adopting a new format

1. **Register it for reading, everywhere, first.**

   ```ts
   const formats = new CanonicalFormatRegistry([CANONICAL_FORMAT_V1, FORMAT_V2]);
   verifyChain(records, { formats });
   ```

   Every process that verifies must understand version 2 *before* any process writes one.
   `verifyChain` refuses a record whose format it does not know rather than skipping it: a verifier
   that could not check a record has not established that it is intact, and reporting "valid" for a
   chain it only partly read is the false assurance this whole design avoids.

2. **Then switch writing, one service at a time.**

   ```ts
   new AuditService({ repository, canonicalFormat: FORMAT_V2 });
   ```

3. **Never re-seal history.** Old records keep their old digests and their old version. There is no
   migration step, no `UPDATE`, and no window in which the chain is unverifiable.

### When your digest covers your own record id

A chain whose identifier is minted independently — a `uuid` assigned before sealing — and hashed on
purpose needs that id passed in. Declare it:

```ts
const legacyV3: CanonicalFormat = {
  version: 903,
  requires: ['recordId'],
  covers: 'previousHash, eventId, tenant, occurredAt, actor, action, subject, outcome, payload, …',
  canonicalize: ({ recordId, previousHash, event, sequence }) =>
    [previousHash ?? '', recordId ?? '', event.tenantId, /* … */].join('|'),
};
```

`requires` is declared rather than inferred because the failure it prevents is silent: a format that
read `recordId` from a record that has none would hash `undefined`, produce a plausible digest, and
report every such record as tampered — an alarm indistinguishable from a real one. With the
declaration, `verifyChain` refuses to run the format and says which field is missing.

`externalId` is the same mechanism for an identifier that came from another system — an imported
chain's original id. It is deliberately not the same field as `recordId`: conflating them makes an
imported chain unverifiable the day local ids are reassigned.

**Platform-native formats declare neither, so they are never passed either.** That is why this was
additive: no existing digest can change by the presence of a field its format never sees.

### Using your own event vocabulary

`SecurityEvent` and `AuditRecord` take the event name as a type parameter, defaulted to the closed
`SecurityEventName`:

```ts
type DocsAction = 'DOCUMENT_DOWNLOADED' | 'WORKFLOW_APPROVED' | /* … */;
const record: AuditRecord<DocsAction> = /* … */;
```

You get the same exhaustiveness checking the platform gets for its own names, and nothing is cast.
See ADR-0020 for why the platform's own vocabulary stays closed.

### Rules for a new format

- A released version number is frozen, like a wire format. `CanonicalFormatRegistry.register`
  refuses to redefine one — silently changing what a version means turns every historical digest
  for that version into a false tamper alarm.
- Field order is fixed explicitly, never taken from `Object.keys`. A chain that depends on property
  insertion order breaks the first time a record round-trips through a database.
- `CURRENT_CANONICAL_FORMAT` changes only in a major release, after consumers have had a version in
  which they can read both.

### Pinning

A product with long-lived evidence should pin the format it writes:

```ts
new AuditService({ repository, canonicalFormat: CANONICAL_FORMAT_V1 });
```

Then a platform upgrade that moves the default becomes a deliberate decision with a migration,
rather than a silent change in what the digests mean.

---

## Appending inside the caller's transaction

```ts
await audit.record(context, { name: 'document.deleted', outcome: 'success' }, { transaction: tx });
```

The record commits with the change it describes, or not at all. Without this, an audit write that
succeeds beside a business transaction that then rolls back is evidence of something that never
happened.

**Adapters.** `options.transaction` is `unknown` — the platform must not depend on Prisma, Knex or
`pg` to express "use mine". Narrow it, and **throw if you do not recognise it**. Quietly opening
your own transaction instead is the failure mode this exists to prevent. Advertise support with
`joinsTransactions: true`; leaving it absent means false, which keeps every 2.0.0 adapter correct.

```ts
class PrismaAuditRepository implements AuditRepositoryPort {
  readonly joinsTransactions = true;

  async appendChained(tenantId, seal, options = {}) {
    const tx = options.transaction;
    if (tx !== undefined && !isPrismaTransaction(tx)) {
      throw new PlatformError('unrecognised transaction handle', { code: 'CONFIG_INVALID' });
    }
    const run = async (client) => { /* read head FOR UPDATE, seal, insert */ };
    return tx === undefined ? this.prisma.$transaction(run) : run(tx);
  }
}
```

**Costs, stated plainly.** The head read and the insert move inside the caller's transaction, so
chain contention becomes the caller's contention, and a long-running business transaction serialises
that tenant's audit writes behind it.

**Retries.** The platform does not retry a chain conflict when the append joined the caller's
transaction: the conflict has already aborted it, so a retry inside it cannot commit. The conflict
propagates and the caller retries its own unit of work, which is the only level at which a retry
means anything.

---

## What has not changed

- Format 1 bytes.
- `canonicalize(event, previousHash, recordedAt, sequence)` — still exported, still format 1.
- `verifyChain(records)` with no options — still verifies a format-1 chain.
- Every 2.0.0 adapter, which keeps compiling and keeps passing conformance.
