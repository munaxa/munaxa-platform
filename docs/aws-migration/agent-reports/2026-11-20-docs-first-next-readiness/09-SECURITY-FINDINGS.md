# 09. Security findings

| Id | Severity | Finding | Evidence | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| SF-1 | High | Control images `a24c568` (api, migrate, portal) carry 7 HIGH CVEs: CVE-2026-109518 (apt), CVE-2026-53613, CVE-2026-53615, CVE-2026-78410 (util-linux), CVE-2026-76844, CVE-2026-85091 (zlib), CVE-2026-84243 (glibc); also 2 MEDIUM and 3 LOW | ECR basic scan [V] | control#10: new base digest plus `apt-get upgrade` in the OS stages; then release (A-5C) and pin in C-1 | CODE COMPLETE — NOT DEPLOYED |
| SF-2 | Critical (not on the Docs path) | Work api `b490b25` has CVE-2026-4738 (zlib) | ECR scan [V] | rebuild from main (W-2) | NOT STARTED |
| SF-3 | High (CI) | GHSA-7589-6fvf-x4pw, `effect` <= 3.22.0 through Prisma; `pnpm audit` fails | CI logs docs#179, control#10 [V] | override `effect: ^3.22.1` (docs#179, control#10); identity, work, school pending | partly fixed |
| SF-4 | Medium | Control bundles had no custody procedure; filling them by hand would risk values in shell history or arguments | metadata and repo [V] | `control-testing-secrets.sh` (PR #143) | CODE COMPLETE — NOT DEPLOYED |
| SF-5 | Low | Docs script: two runs at once could interleave writes (19 Nov review finding 4) | review [D] | `flock` lock on `/tmp/docs-testing-secrets.lock`, `O_NOFOLLOW`, mode 0600; test added | fixed in PR #143 |
| SF-6 | Low | `provision-delete` would delete any secret with the right name | review | refuses unless tag `Purpose=docs-provision-one-run` (set at create); test added | fixed in PR #143 |
| SF-7 | Low | Docs base image by tag only (supply chain, reproducibility) | Dockerfile [V] | digest pin (docs#179) | CODE COMPLETE |
| SF-8 | Info | Shell tracing (`bash -x`) could print the container credentials URI | review | test proves no token reaches output under `-x` | verified [T] |
| SF-9 | Info | ACM certificate not renewable while unused | ACM [V] | use it in a session before April 2027 | open (S-3) |

## Properties verified in the secret scripts (PR #143) [T]

- No value appears in argv or the environment of any CLI call. The fake CLI records every call and fails the test on a leak.
- Values never reach output. Each test asserts that no generated value appears in stdout or stderr.
- Writes use `ClientRequestToken` (idempotent). A write that was stored but returned an error resumes without a second version.
- A wrong account stops the script before any Secrets Manager call.
- `status` performs no `get-secret-value`.
- Fill order is enforced (the owner URL before the app URL); out-of-order state is refused.

Totals: 23 Docs tests and 8 Control tests pass. shellcheck and pyflakes are clean.
