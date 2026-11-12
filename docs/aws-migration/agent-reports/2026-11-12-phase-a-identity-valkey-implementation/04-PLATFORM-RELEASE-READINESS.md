# 04. Platform release readiness

## Merging publishes nothing

**[V]** `.github/workflows/release.yml` is triggered by `workflow_dispatch` only, on main before and after
#111 (a test asserts there is no push, pull_request, release, schedule, workflow_run or tag trigger).
No other workflow in munaxa-platform publishes packages or creates tags or releases. Merging #111 and
#112 changes files on main only.

## B1 hardening (platform#111)

| Requirement | Implementation |
| --- | --- |
| Main only | job `publish` guard (first step) refuses unless the event is a dispatch on `refs/heads/main`; the Publish step's `if` repeats it |
| release:check | runs in both jobs before the package list |
| Exactly the 13 | `scripts/release-packages.mjs` fails closed unless changeset `fixed[0]`, `LOCKSTEP` and the workspace agree on 13 public packages at one version; Pack and Publish refuse a list that is not exactly 13 filters |
| Dry run separate | job `dry-run` with `contents: read` only, no registry token, never publishes (tested) |
| Nothing published | nothing was dispatched |

Recorded Lows: none open. Info: `npm pack --dry-run` does not rewrite `workspace:^` as `pnpm publish`
does; the 13 depend only on each other, so nothing unpublished is referenced.

**[R]** Owner settings (not changed): hold the publish token as an environment secret on an environment
limited to main with a reviewer, and reduce each package's Actions access to Read. Until then anyone
who can push to the repository can publish with a modified workflow on a branch.

## B2 version PR (platform#112)

- 13 packages at 2.5.0: types, interfaces, crypto, config, cache, logging, audit, rbac, session,
  security, notifications, auth, conformance. `@munaxa/licensing` stays 0.2.0 (its `workspace:^` on
  crypto still matches).
- Included: #107 (`bc1f21b`, rate-limit store failures, stable counters, canonical routes) and #100
  (`116650c`, auth and MFA hardening).
- Minor bump is correct per the project's extension guide (new exports). Behaviour to review before
  upgrading is listed in the changelog (rules refused at construction, baseline rule changes).
  Info: the changeset does not mention that a 429 now wins over a 503 and that violation memory went
  from 16 to 32 windows.
- `release:check` pass, `verify-release --since 54bbf46` pass ("13 packages at 2.5.0") **[L]**.
- All package tests pass on the candidate **[L]**: security 145, cache 59, auth 110, rbac 81, session 71,
  config 98, platform 621 and the rest; redis-server test 4/4.

## Publication sequence (owner-authorized, not done)

1. **[O]** Dispatch `release.yml` on main with `dry_run = true`; check the 13 names and 2.5.0.
2. **[O]** Dispatch with `dry_run = false`. A version is published once and can never be republished.
3. Identity adoption PR (lockfile to 2.5.0), then image rebuild **[O]**.
