# 02. Open pull requests and CI (state at the end of the sprint, 21 Nov 2026)

All open PRs in the six repositories were inspected. **None is mergeable today.** Each one is
blocked by D-SSL (its required image scan), by the missing GitHub Packages grant, or by both.
No PR was superseded, so none was closed.

| PR | What | State | Blocker | Next |
| --- | --- | --- | --- | --- |
| identity#24 | OpenSSL `3.5.10-r0` pin (new this sprint) | draft | Alpine has no 3.5.10 yet; build fails by design | Re-run CI after Alpine ships; merge on 0 HIGH |
| control#13 | OpenSSL `3.5.10-r0` pin; removes the `openssl` CLI from the image (new) | draft | same | same |
| docs#182 | OpenSSL `3.5.10-r0` pin, Alpine stage and scratch runtime-fs (new) | draft | same | same |
| work#35 | OpenSSL `3.5.10-r0` pin, api and admin images (new) | draft | same | same |
| school (no PR yet) | the same pin; the patch is ready | not opened | School branch in use by the SC-07 work (file 04) | open after SC-07 |
| control#12 | Actions SHA pinning, no persisted token, least privilege | ready | required image scan fails on D-SSL only | merge after control#13 |
| docs#181 | same hardening, with D-SSL in the required check | ready | same | merge after docs#182 |
| docs#178 | Runbook: the S3 adapter signs with the ECS task role | ready | same | merge after docs#182 |
| identity#19, control#9, work#32 | Read `@munaxa` packages with the per-run `GITHUB_TOKEN`, retiring `PLATFORM_PACKAGES_TOKEN` | draft; rebased onto main this sprint | **owner Packages grant missing** (see below) | after the grant: re-run, merge |

## Package-token drafts: diagnosis [TESTED]

The three branches were rebased onto `main`; the merges kept the SHA-pinned `ci.yml`. CI was then run on each:

| Repo | Run | Result |
| --- | --- | --- |
| identity | 44907747319 | image build `ERR_PNPM_FETCH_403` on `@munaxa/logging` |
| control | 44907779299 | `ERR_PNPM_FETCH_403` on `@munaxa/types` |
| work | 44907801571 | image job failed the same way |

The `verify` jobs passed only because the pnpm store came from cache. A cold install would fail
the same way. **Conclusion: the grant has not been given.** Each `@munaxa` package must give the
consuming repository "Actions: Read" access. The 20 packages are:

- audit, auth, cache, config, conformance, crypto, interfaces, logging, rbac, security
- session, types, config-eslint, config-typescript, icons, licensing, platform, theme, ui, tokens

The consuming repositories are identity, control and work. Docs and School also consume some of
these packages, so they would need the grant before their own drafts.

This is **not on the deployment critical path**. The release workflows still work with
`PLATFORM_PACKAGES_TOKEN`, which stays in place until the grant exists. The owner steps are item 1 in file 05.

## Merged this sprint

To munaxa-platform `main`, through this report's PR:
- **W-3**: the Work custody script with 30 offline tests (file 04).
- **The RDS restart-stop enablement package**, off by default (file 06).

Nothing else was mergeable.
