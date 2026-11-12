# 04. Published package integrity

## How the published bytes were obtained

This session has no `read:packages` token: `npm.pkg.github.com` answers 401.

The 13 published tarballs were fetched by Identity Actions [run 43286188504](https://github.com/munaxa/munaxa-identity/actions/runs/43286188504):
- It ran `npm pack @munaxa/<name>@2.5.0` against GitHub Packages, with `packages: read`.
- It printed each tarball to the log as base64, with its SHA-256.

The session read that log, decoded the 43 evidence files, and checked every SHA-256. There were 0 mismatches.

## Checks

**1. Content digests: 13/13 [I].**
- The downloaded tarballs were digested locally with the reviewed `content-digest.mjs`. This is a SHA-256 over the sorted files, with `package.json` keys sorted.
- The result is identical to `2026-11-12-phase-c-d-preparation/supporting/platform-2.5.0-candidate-CONTENT-DIGESTS.txt` for all 13: audit, auth, cache, config, conformance, crypto, interfaces, logging, notifications, rbac, security, session and types.
- The workflow's own computation in the runner agrees (`supporting/published-2.5.0-CONTENT-DIGESTS.txt`).

**2. Registry integrity equals the bytes: 13/13 [I].** For each tarball, `sha512-` plus the base64 SHA-512 of the downloaded bytes equals the registry's `dist.integrity` (`supporting/registry-metadata-2.5.0.txt`, `supporting/published-2.5.0-SHA512SUMS.txt`).

**3. Byte identity with the local candidate: 7/12 [I], as expected.**
- 7 of Identity's 12 have the same `sha512` as the candidate lockfile (`identity-18-lockfile-candidate-sha512.txt`): audit, config, crypto, interfaces, logging, session and types.
- The other 5 differ only in tarball bytes. pnpm rewrites `dependencies` key order concurrently, so packing is not byte-reproducible. This was documented in the earlier report's C2.
- Their content digests are identical (check 1).

**4. Contents (independent reviewer) [I].**
- Every tarball holds only `package.json`, `README.md` and `dist/**`.
- None has install scripts or `bin`. Dependencies are only `@munaxa/*@^2.5.0`, the same set as 2.4.1.
- The reviewer rebuilt auth, cache, security and types with `tsc` from `ee9015f`. The `.js` and `.d.ts` output is byte-identical to the published tarballs.

No package differs unexpectedly.
