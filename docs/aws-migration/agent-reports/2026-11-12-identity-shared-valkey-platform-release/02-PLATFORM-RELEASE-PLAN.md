# 02. Platform release plan (2.5.0) and the separate Identity adoption

12 Nov 2026. Plan and local verification only. No workflow was dispatched, no package published, no tag
created. Labels as in `01`.

## 1. Summary

- **What would be released [V `changeset status`]:** the 13 lockstep packages go from 2.4.1 to
  **2.5.0** (the `fixed` group in `.changeset/config.json`; the highest pending bump is a minor). Two
  changesets are pending: `rate-limiter-stable-counter.md` (#107) and `auth-verify-claim-shapes.md`
  (#100, merged 11 Nov). Both ship together; neither can be released alone without editing changesets.
- **No other package source changed since 2.4.1 [V]:** since `54bbf46` (the 2.4.1 release commit) the
  lockstep packages' `src` changed only in #107 and #100; `c9abccd` (#22) touched only development
  dependencies.
- **The release is not one click today [V `release.yml`]:** the workflow publishes "whatever each
  package.json declares", and `main` still declares 2.4.1. A **version PR** (`pnpm release:version`,
  which is `changeset version`) must merge first.
- **Local candidate verified [V `supporting/compatibility-run.txt`]:** built from `0c6421a` in a scratch
  copy; `release:check` passes, including `--since 54bbf46`; security 145, cache 59, auth 110, rbac 81,
  session 71 tests pass with a real Redis.
- **Identity passes its full suite on the candidate [V]:** 47 unit and 280 integration tests, lint,
  typecheck, build and Prisma validation, with the 12 packages it uses (all lockstep packages except `notifications`) replaced by the local 2.5.0 tarballs.
- **Public API compatibility [V by changeset and source]:** additive (new `onStoreFailure`,
  `canonicalRoutePath`, `isRoute`, `addressSubject`, `hitWithHistory`), with documented behaviour
  changes for consumers of the baseline rules (§3). Nothing is removed or renamed. A minor is correct
  under `VERSIONING.md`.
- **Readiness:** READY FOR A VERSION PR. Publication needs the owner's separate authorization (Phase B).

## 2. Current release mechanics (verified)

| Item | Value |
|---|---|
| Registry | GitHub Packages, `@munaxa` scope, `access: restricted` |
| Workflow | `.github/workflows/release.yml`, `workflow_dispatch` only, input `dry_run` (default `true`) |
| Ref guard | a non-dry-run fails unless `github.ref == refs/heads/main` (#100) |
| Steps | install (frozen lockfile), build, `pnpm test && pnpm validate`, `pnpm release:check`, then `pnpm -r --filter './packages/**' --filter './tooling/**' publish --no-git-checks --access restricted`, or `npm pack --dry-run` |
| Publish permission | `packages: write` with `GITHUB_TOKEN`; the workflow's own comment states this is not a server-side control (anyone who can push can publish); a protected environment with a reviewer is an owner settings change [O, already recorded] |
| Version source | each `package.json`; changesets are consumed by `pnpm release:version` |
| Changelog | `@changesets/changelog-github`, which calls the GitHub API while versioning (needs a token in the environment that runs `changeset version`) |
| Last release | 2.4.1 (`54bbf46`, 7 Aug 2026); every product lockfile resolves 2.4.1 |
| Consumers' ranges | `^2.4.1` everywhere, but every product installs with `--frozen-lockfile` in CI and Docker [V: every `pnpm install` command in the workflows and Dockerfiles of Identity, Work, Control, School and Docs carries it; the other matches are comments]; publishing 2.5.0 changes no product until its lockfile is updated |

## 3. Release content and behaviour changes

| # | Required by the task | Where | Status |
|---|---|---|---|
| 1 | Stable rate-limiter counter | `security/src/ratelimit.ts` (#107) | in 2.5.0 |
| 2 | Fail-closed authentication rules | `onStoreFailure: 'deny'` on baseline login, reset, MFA; 503 `SECURITY_RATE_LIMIT_UNAVAILABLE` (#107) | in 2.5.0 |
| 3 | Canonical route matching | `canonicalRoutePath`, `isRoute`, method checks (#107) | in 2.5.0 |
| 4 | Atomic Redis counter expiry | `cache/src/redis.ts` one-key Lua `INCRBY` + `PEXPIRE` (#107) | in 2.5.0 |
| 5 | Lockout identifier normalisation | `auth/src/login.ts` trimmed lowercased digest (#107) | in 2.5.0 |
| 6 | Token verification hardening | `TokenService.verifyAccessToken` requires a numeric `exp`, refuses a non-numeric `iat` when present, matches a string `aud` exactly; recovery codes need a confirmed factor (#100) | in 2.5.0 (not asked for, but pending and unavoidable) |

Behaviour changes a consumer must review (from the changeset, checked against the source):
- Baseline login, reset and MFA rules answer 503 while the cache is down (previously admitted).
- `mfa-verify-per-session` ignores GET/HEAD; `password-reset-per-ip` counts only POST, now also on `/password/forgot`.
- Per-address rules group IPv6 by /64.
- A malformed counter or block value is a store failure handled by `onStoreFailure`, not an unlimited pass.
- Rules with `limit <= 0`, `window <= 0`, or `cost` above capacity are refused at construction.
- Lockout key trims the identifier, so existing lockout counters for padded spellings are orphaned (they expire).
- Tokens without `exp`, with a non-numeric `iat` (checked only when present), or with a string `aud` that is not an exact audience are refused. Identity mints `aud` as an array and always sets `exp` [V `auth/src/tokens.ts` `issueAccessToken`], so Identity-issued tokens are unaffected.

## 4. Release checklist (Phase B)

Repository steps (allowed under a docs/code PR authorization; no publication):
1. **Release workflow PR (first, its own PR).** Today's dry-run step is `pnpm -r … exec npm pack
   --dry-run`, which never asks the registry and so packs every workspace package (platform 1.7.0,
   licensing 0.2.0, the 1.1.1 façades, the config packages), not what a real publish would send
   [V `release.yml`]. The real step, `pnpm -r … publish`, publishes every `./packages/**` and
   `./tooling/**` package whose version is missing from the registry, not only the 13. `@munaxa/typography`
   1.1.1 and `@munaxa/utils` 1.1.1 are in no product lockfile, so whether they are already published could
   not be checked here (no packages token) [U]. The PR narrows both the publish and the dry-run steps to
   the 13 lockstep packages with `--filter` on their names, so this release cannot publish anything else
   by accident. (A `publish --dry-run` would not work as is: the dry-run step has no `NODE_AUTH_TOKEN` and
   the restricted registry answers 401.) Releasing the façade or licensing packages later is a separate,
   reviewed change.
2. **Version PR.** Branch from `main` after step 1. Run `pnpm release:version` with a read-only GitHub
   token available to `changelog-github` (or run it in CI). Expected diff: 13 `package.json` versions to
   2.5.0, internal ranges, 13 package `CHANGELOG.md` entries, the two changesets deleted. Nothing else.
3. Confirm `pnpm install --frozen-lockfile` still passes (the lockfile records `workspace:` links, so
   it should not change) [U: confirm in the version PR].
4. CI green on each PR head, including the Redis job. Rerun only the known flaky jobs
   (`performance.test.ts` header timing, the a11y contrast matrix) if they fail, and record it.
5. `node scripts/verify-release.mjs --since 54bbf46` locally and in the version PR description.
6. Independent review of each exact head; squash-merge (Platform allows squash only).

Owner-authorized steps (separate authorization required):
7. Dispatch `release.yml` on `main` with `dry_run = true`; check that the log lists exactly the 13
   packages at 2.5.0.
8. Dispatch `release.yml` on `main` with `dry_run = false`. Versions can never be republished, so this
   is the irreversible step.
9. Verify: `npm view @munaxa/security@2.5.0 --registry https://npm.pkg.github.com` (with a
   `read:packages` token) for each of the 13; compare the published tarball `dist` to a local build of
   the merge commit.
10. No git tag is created by the workflow; if tags are wanted, that is a separate decision (not
   required by the current process).

Rollback: a published version cannot be replaced. If 2.5.0 is defective, publish 2.5.1 with the fix;
consumers stay on 2.4.1 through their lockfiles until they adopt. `npm deprecate` on 2.5.0 is available
with `packages: write` [U: GitHub Packages support for deprecate not verified].

## 5. Identity adoption (Phase C, a separate PR after publication)

**Change [R]:** in munaxa-identity, set every direct `@munaxa/*` range to `^2.5.0` (`apps/api`,
`packages/config`, `packages/testing`), refresh the lockfile so it resolves 2.5.0 from GitHub Packages,
and update the comments that describe 2.4.1 behaviour (`security/auth-edge-limits.ts`,
`platform/security.ts`, `password/password-change.ts`, `password/password-recovery.ts`). No rule,
limit, subject or failure mode changes.

**Verified before recommending it [V local run on the candidate, plus source reading]:**

| Check | Result |
|---|---|
| Compatibility with identity#16 | typecheck, lint, build, 47 unit, 280 integration tests pass on 2.5.0 |
| Rate-limiter behaviour | Identity's credential rules are non-adaptive and each runs in its own `RateLimiter`; 2.5.0's stable counter changes nothing for them; the HTTP edge suite (every spelling, shared NAT, window expiry, two instances on one Redis) passes |
| IPv6 subject handling | Identity passes `addressSubject(ip)` (its own /64 function) as `ipAddress`; Platform 2.5.0 applies its own `addressSubject` again on per-address rules. Platform's function is idempotent on Identity's output: `2001:db8:1:2::/64` splits at `::` into four groups plus `/64` and returns `2001:db8:1:2::/64`; IPv4 and mapped IPv4 are unchanged [V by reading `security/src/ratelimit.ts`]. The IPv6 /64 tests pass. Phase C adds a unit test asserting the idempotence |
| Malformed counter handling | on 2.4.1 a non-numeric counter in Identity's own rules was an unlimited pass; on 2.5.0 it is `degraded`, which Identity already turns into 503. Adoption strictly improves this |
| Redis expiry behaviour | on 2.5.0, `increment` is one Lua script when the client has `eval` (ioredis has it); an orphaned counter gets an expiry. The real-Redis tests pass |
| Store-failure behaviour | Identity's own fail-closed handling (`degraded` → 503) is unchanged; 2.5.0 rules without `onStoreFailure` still default to `allow` with `degraded`, so Identity sees the same signal. The store-down, store-hung and recovery tests pass |
| Introspection limits (identity#15) | `introspect-per-ip` 12,000/min and `introspect-per-user` 600/min unchanged; the carve-out test passes |
| General rules | Identity keeps only `api-per-user` and `api-per-ip` from the baseline (`GENERAL_RULES`), so the new 503 behaviour of the baseline credential rules never reaches Identity. On 2.5.0 `api-per-ip` groups IPv6 by /64 (300 a minute per /64 instead of per address): stricter for IPv6 clients that share a /64, accepted |
| MFA limits and challenge state | `MfaChallenges`, `MfaFailureCounter`, `Reauthentication` are Identity code on the cache port; unchanged. TOTP replay (`#claimStep`) unchanged. #100 makes `verifyRecoveryCode` refuse without a confirmed factor, which Identity's flow already requires; MFA integration tests pass |
| Lockout | the Platform digest now trims as well as Identity's own trim (#16); one counter across spellings; test passes |
| Work tenant binding and revocation | Work calls `GET /api/auth/introspect`; the endpoint, its limits and its fail-closed 503 are unchanged. Identity tokens keep `aud` as an array, so Work's and Control's verification on 2.5.0 accepts them (03) |
| Custom rules from #16 | not weakened: no rule removed, no limit raised, no subject changed, no fail-open introduced |

Adoption gates: the published 2.5.0 must be the version installed (lockfile integrity hashes from the
registry); CI on the PR runs the full suite against real PostgreSQL and Redis; independent review;
mutation spot-checks of the #16 mutants that touch the limiter (route matching, identifier trim, IPv6,
fail closed). Deployment of an Identity image with 2.5.0 is a later, separately authorized step (Phase D).

## 6. Not combined

Publication (Phase B) and adoption (Phase C) are two PRs and two authorizations. The adoption PR cannot
be opened before the packages exist, because the lockfile must resolve them from the registry.
