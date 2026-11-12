# Supporting evidence

- `platform-2.5.0-candidate-SHA256SUMS.txt`: SHA-256 of the 13 tarballs packed locally from
  platform#112's tree (`98a51ab`) and installed into Identity for B3. Not published anywhere; a real
  publish rebuilds from main, so registry checksums will differ.
- `identity-on-2.5.0-integration-first-run.txt`: per-test result list of Identity's integration suite
  at identity#17 `ac8eb41` on the 2.5.0 candidate (289/290). The one failure is the Retry-After bound
  described in [03](../03-IDENTITY-COMPATIBILITY-TESTS.md), corrected in `b3d2594`; the final head
  `cfb0e29` passed 291/291 in this session and in the round-3 review.
