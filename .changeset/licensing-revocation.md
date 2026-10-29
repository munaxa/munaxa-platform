---
'@munaxa/licensing': minor
---

Signed revocation lists for offline licences (`mxr1`): `issueRevocationList`,
`verifyRevocationList` (refuses an older list than the last one verified, a list for another product,
and one issued after the local clock), `revocationOf` and `applyRevocation` (a revoked licence is
suspended; nothing widens access). Signed with the licence keys under their own domain-separation
prefix, so neither document can be replayed as the other.
