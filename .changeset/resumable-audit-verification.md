---
'@munaxa/audit': minor
---

Audit verification can resume from a trusted head, and reports failures structurally.

`verifyChain` always started at genesis: it initialised `previousHash` and the expected sequence to
`null`, so a chain could only be verified as a whole. A trail that has been running for years is
not verified that way — it is verified in batches, resuming from a signed checkpoint — and handing
the verifier a continuation batch produced a `LINK_MISMATCH` on completely intact evidence. Not a
missed break: a fabricated one, nightly, at the highest severity a compliance alert has.

`VerifyChainOptions.from?: ChainHead | null` supplies the head the walk continues from. Absent, or
`null`, means genesis exactly as before. One field rather than two because a resume point is a
position *and* a digest — given only a hash, a record removed from the front of the batch is
invisible; given only a sequence, a forged leading record passes. `ChainHead` already carries both
and is already what `AuditSealer` receives on the append side.

There is one verification routine; `from` decides only what it starts from, so an incremental pass
and a whole-chain pass check identically.

Failures now carry a `code` — `SEQUENCE_GAP`, `LINK_MISMATCH`, `DIGEST_MISMATCH`, `UNKNOWN_FORMAT`,
`MISSING_IDENTIFIER` — the broken record's `brokenAtId` alongside its `brokenAt` position, and the
pair belonging to that code: `expectedHash`/`actualHash`, `expectedPreviousHash`/
`actualPreviousHash`, `expectedSequence`. Products distinguishing "a field was altered" from "a
record was removed" no longer have to match on an unversioned prose string.

Additive. An intact chain still returns exactly `{ valid, checked }`, every `reason` string is
verbatim, and no digest, canonical byte or historical record changes.

The platform does not authenticate the head — it cannot tell a signed checkpoint from the first row
of the batch being verified, and taking it from the batch would verify the batch against itself.
Signing the resume point stays the caller's, because the key must live where the platform cannot
reach. See ADR-0021.
