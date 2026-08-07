# ADR-0021 — Verification resumes from a head the caller supplies

**Status:** accepted (Platform P3.9)
**Supersedes:** the assumption that a chain is verified by holding all of it at once

---

## The question

`verifyChain` initialised `previousHash = null` and the expected sequence to `null`, so a chain
could only be verified as a whole, beginning at the record that chains from nothing.

Munaxa Docs attempted to adopt it in P4.7 and stopped. Its verification pass has never worked that
way: it resumes from a signed checkpoint and walks in batches of 5,000, which is what "a daily job
verifies the chain" costs when the chain is millions of rows and seven years old.

## What that cost, stated precisely

Handing the verifier a continuation batch did not fail to detect a break. It **fabricated** one:
the batch's first record chains to a digest the verifier had initialised to `null`, so the answer
was `valid: false, reason: 'previous hash does not match the preceding record', checked: 0` — on
completely intact evidence.

That result pages at the highest severity a compliance alert has. A verifier that raises it nightly
is worse than no verifier, because it trains an operator to ignore the one alarm that must never be
ignored.

It also could not see a record removed from the **front** of a batch: every record present still
chains to the one before it, and there was nothing to compare the first position against.

## Decision

**One optional field, carrying a head the caller establishes:**

```ts
interface VerifyChainOptions {
  readonly formats?: CanonicalFormatRegistry | readonly CanonicalFormat[];
  readonly from?: ChainHead | null;
}
```

Absent — or `null` — means genesis, exactly as before. When supplied, the walk begins from that
head: the first record must chain to `from.hash` and occupy `nextSequence(from.sequence)`.

There is **one** verification routine. `from` decides only what it starts from, so an incremental
pass and a whole-chain pass check identically. That is the property that makes the two answers
comparable, and it is why this is a changed initialisation rather than a second code path.

## Why one field rather than two

A resume point is a position *and* a digest, and supplying one without the other verifies half the
claim. Given only a hash, a record removed from the front of the batch is invisible. Given only a
sequence, a forged leading record passes.

`ChainHead` already carries both, and it is already what `AuditSealer` receives on the append side.
Verification is the same problem from the other end and now has the same shape. Adding
`fromSequence` beside `fromHash` would have been two ways to describe one position, which is how
they come to disagree.

## Why absent and `null` mean the same thing

A caller holding an optional checkpoint writes `from: checkpoint ?? null`. If the explicit spelling
were stricter than the omitted one, a chain's first-ever verification pass would fail — on the one
run where there is legitimately nothing to resume from. Making them identical removes a trap that
would only fire on day one, which is exactly when nobody is watching for it.

## What the platform deliberately does not do

**It does not authenticate the head.** The platform cannot distinguish a head that came from a
signed checkpoint from one taken out of the first row of the batch being verified — and the latter
verifies the batch against itself, which proves nothing.

Signing the resume point is the caller's, because the key that signs it must live somewhere the
platform has no access to: not in the database holding the chain, and not in the bucket holding the
export. A platform API that appeared to authenticate it would be claiming a guarantee it cannot
provide, which is worse than declining to.

This is the same boundary `appendChained` draws. The store owns *ordering*; the platform owns
*hashing*. Here the caller owns *trust in the resume point*; the platform owns *what follows from
it*.

## Structured failures, decided at the same time

`reason` was a single unversioned prose string. A product that distinguishes "a field was altered"
from "a record was removed" — and every product with a real compliance trail does — had to either
lose the distinction or match on that message.

So a `code` was added, along with the record's own id and the pair of values belonging to each
code. Three accusations are three different responses:

| `code` | The accusation |
|---|---|
| `SEQUENCE_GAP` | A record was removed and took its link with it — the hole the hash alone cannot see |
| `LINK_MISMATCH` | A record was inserted or removed mid-chain, or the batch does not follow its head |
| `DIGEST_MISMATCH` | A field was altered |
| `UNKNOWN_FORMAT` | Sealed by a format this verifier was not given, so it has not been checked |
| `MISSING_IDENTIFIER` | The format needs an identifier the record does not carry |

The last two are **not** tamper reports, and conflating them with the first three would send
somebody looking for an intruder who was never there.

There is deliberately no `brokenSequence` beside `brokenAt`: it is the same number, and two names
for one fact is how they come to disagree. `brokenAtId` is genuinely different — a sequence says
where in the walk it happened, an id is what an auditor looks up.

## Consequences

- **Additive.** An intact chain still returns exactly `{ valid, checked }`, so a consumer that
  deep-equals against that shape keeps passing. Every `reason` string is verbatim. No digest, no
  canonical byte and no historical record changes.
- **Munaxa Docs can migrate** its verification service with no workaround. Validated from a clean
  install of the built package, against that product's three real canonical formats and its real
  batched walk.
- **Munaxa School and Munaxa Work are unaffected**, because neither consumes `@munaxa/audit` and
  neither has a hash-chained trail. If either adopts one, `from` is what its verification pass will
  need for the same reason Docs did.
- **The general lesson.** `verifyChain` was designed for the shape the platform verifies — a whole
  chain, in memory, from genesis. The append side already knew it did not own ordering, which is
  why `appendChained` hands the adapter the head. Verification is the same problem and did not get
  the same treatment. Survey a consumer for how a capability is **operated**, not only for what it
  computes.
