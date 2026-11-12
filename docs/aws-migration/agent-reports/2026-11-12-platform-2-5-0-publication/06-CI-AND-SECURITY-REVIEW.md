# 06. CI and independent security review

## GitHub CI [W]

| Run | Commit | Result |
| --- | --- | --- |
| [43286790685](https://github.com/munaxa/munaxa-identity/actions/runs/43286790685) (PR, `verify`) | `4aabdf7` | **success** |
| [43287805158](https://github.com/munaxa/munaxa-identity/actions/runs/43287805158) (main, `verify`) | `5a5994f` | **success** |

Steps of the `verify` job on `4aabdf7`, all passed:
- install with `--frozen-lockfile` ("Lockfile is up to date");
- format, lint, Prisma generate, typecheck, build;
- role provisioning, migrate from zero, grants, Prisma validate;
- **unit: 59/59** (2 files);
- real redis-server;
- **integration, security and conformance: 292/292** (19 files);
- catalogue drift ("285 grants, no drift");
- no key material, no secret values;
- `pnpm audit --audit-level high`, which passed and reported 1 low and 2 moderate.

The audit findings are third-party and were already present. This PR changes no third-party lockfile entry.

## Local reproduction [L]

- `identity-ci-local.sh` (report `2026-11-12-phase-c-d-preparation/supporting/tools/`) ran on a worktree of `4aabdf7`, with PostgreSQL 16, real redis-server and `CACHE_CONNECTION_TEST_REQUIRE_SERVER=1`.
- `@munaxa` was installed with `--frozen-lockfile` from the **13 published tarballs** downloaded in run 43286188504. They were served on 127.0.0.1 in a scratch copy of the lockfile, with only the tarball URLs rewritten. pnpm checked every integrity against the committed lockfile, so these are the published bytes.
- Results:
  - format, lint, Prisma generate, typecheck, build and Prisma validate all OK;
  - **unit 59/59**;
  - **integration 292/292, 19/19 files, 0 skipped**;
  - catalogue drift OK.
- A first attempt used a database named `identity_ci`. The test harness refused it on purpose ("name must contain test"), so it was rerun with `identity_test`. That was an operator error, not a product failure.

No test was skipped, removed or weakened. The new test "a token with Identity's own signature but no usable expiry, issue time or exact audience is inactive" ran and passed.

## Independent security review of the final head `4aabdf7`

This was a fresh reviewer, read-only, given the code and evidence rather than the conclusions.

**Verdict: APPROVE, on condition of a squash merge (which was done). No Critical, High or Medium findings.**

What the reviewer verified independently:
- the lockfile supply chain: hosts, integrity, sha1 in the URLs, and unchanged non-@munaxa entries, by parsing YAML;
- tarball contents: no install scripts, `.js` and `.d.ts` rebuilt byte-identical from `ee9015f`;
- the PR code and the new test, including its positive control;
- the effect of each 2.5.0 change on Identity: nothing fails open;
- that the temporary workflow did not print the token.

| Id | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| L1 | Low | The branch history has the localhost lockfile and the temporary workflow | Closed: squash-merged, so main has one commit |
| L2 | Low (pre-existing) | Anyone who can push a branch can run a workflow holding `PLATFORM_PACKAGES_TOKEN` | Owner hardening: move the secret to a protected environment limited to main (08) |
| I1 | Info | Public log of run 43286188504 holds base64 copies of the 13 `restricted` tarballs (builds of public source) | Owner option: delete that run's logs |
| I2 | Info | An unparseable previous-window counter reads as 0, so the count is low by at most one window; only an attacker with Redis write access can cause it | Noted |
| I3 | Info | IPv6 hosts sharing a /64 share the general `api-per-ip` counter (documented) | Noted |
| I4 | Info | The introspection limiter admits on a store failure (as on 2.4.1; not a credential route) | Noted |
