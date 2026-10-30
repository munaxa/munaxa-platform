# 04 · munaxa-docs: phase 2

Author: the lead orchestrator.

## Verified facts [V]

- `main` at `406eaee` (#166). Open PR at 20:05 UTC: only #167.
- **#167 head fault, rechecked:** GitHub's PR head was `6f0ea798…` (one commit, `mergeable_state: clean`,
  last updated 14:25 UTC). The branch `claude/project-thread-rs73yv` was at `a53852d` (`6f0ea79` plus
  "pin every action by commit SHA"). GitHub never processed the synchronize for `a53852d`, so the
  PR's checks covered only `6f0ea79`. Merging #167 as GitHub saw it would have dropped the SHA pins.
- **Resolution:** pushed the same two commits, unchanged, to `claude/project-thread-0f18qv` and opened
  [docs#168](https://github.com/munaxa/munaxa-docs/pull/168). GitHub ran the full pull_request suite on
  its real head. #167: **closed without merge** (superseded by #168, comment posted; branch kept).
- **Licensing in the image:** Control licensing is on main (#162 to #166). The published release
  digests (`f8a8bea`, 25 Oct) predate it [C]. `publish-images.yml` on main installs `@munaxa/*` with
  `GITHUB_TOKEN` only, which gets `ERR_PNPM_FETCH_403` for platform packages. So **no current or
  publishable image includes licensing** until #168 merges and a new `image/<sha>` release is cut at G5.
- **F-3:** `infra/sql/cluster/01-roles.sql` hashes to `a6cf9e96…`, equal to the hash in the platform
  copy's header.
- **Docs in the shared architecture:** see [DOCS-REPLACEMENT-AND-RETIREMENT.md](DOCS-REPLACEMENT-AND-RETIREMENT.md)
  §2. Services, database provisioning (`docs-db-admin`, `docs-provision`), storage (a new empty
  bucket) and task roles are all represented in platform `stack/docs.tf`. Docs images are still
  unset in `nonprod.tfvars`.
- **No test-data migration** is planned or built (DOCS-REPLACEMENT §1).
- The old Docs Production stack's OIDC trust uses the same immutable subject form as the shared
  bootstrap, and it works: `terraform-eu-prod.yml` run 40456924209 succeeded on 27 Oct (supports P11).

## Changes made

[docs#168](https://github.com/munaxa/munaxa-docs/pull/168), head `53c44b5`:

1. `6f0ea79`: `publish-images.yml` installs with `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN` (from #167).
2. `a53852d`: every action pinned by commit SHA (R-07b, from #167).
3. `53c44b5` (new): CI step "The cluster roles match the copy in munaxa-platform",
   `sha256sum --check --strict infra/sql/cluster/01-roles.sql.sha256`, plus the hash file (F-3).

## Merged / not merged

- docs#168: **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green)
- docs#167: **closed without merge** (superseded by #168, comment posted; branch kept)

## Tests executed

- `sha256sum --check --strict infra/sql/cluster/01-roles.sql.sha256` locally: OK.
- Prettier on `ci.yml` locally: clean.
- docs#168 CI on `53c44b5`: all 11 checks success on `53c44b5` (run 41120856489: lint/typecheck/test/build incl. the new F-3 step, integration on PostgreSQL, five end-to-end shards, container images, release smoke, product isolation, production Terraform workflow check)

## Outstanding blockers

- F-2: a new Docs release image (G5, owner approval in `image-release`) after #168.
- Docs `mxc_` credential from Control on Testing; the Resend domain (mail), or mail accepted as out of scope.
- The `docs-api` and `docs-operator` bundles (G4).

## Decisions still required

None new. Retirement (G9) stays closed until the conditions in DOCS-REPLACEMENT §5 are met.

## Actions explicitly not performed

No image tag, no publish, no `terraform-eu-prod.yml` dispatch, no change to the old Docs stack, its
secrets or DNS. No data copied.
