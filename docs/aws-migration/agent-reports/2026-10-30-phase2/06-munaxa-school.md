# 06 · munaxa-school: phase 2

Author: the lead orchestrator. Inspection only. No School code change was needed.

## Verified facts [V]

- `main` at `54cf3eb` (#23). No open PRs at 20:05 UTC.
- **First platform-owner bootstrap.** School seeds through `prisma/seed.ts`, then
  `apps/api/scripts/seed-platform-owner.ts`, which reads `PLATFORM_OWNER_EMAIL` and
  `PLATFORM_OWNER_PASSWORD`. It falls back to `owner@munaxa.com` / `ChangeMe123!` when they are unset
  (lines 29 and 30), and it rejects weak passwords (line 52). `seed-environment.yml` runs on a CI runner,
  which cannot reach the private RDS.
- platform#27 adds the `school-bootstrap` run-only task:
  - It uses the School `migrate` image. That image is built from the build stage (`apps/api/Dockerfile`
    line 69, `WORKDIR /repo/apps/api`), and `tsx` is a dependency of `apps/api`.
  - It runs `../../prisma/seed.ts`, then `scripts/seed-platform-owner.ts`, as `school_owner`.
  - `PLATFORM_OWNER_*` come from the one-run secret `munaxa-<env>/school-bootstrap`. ECS refuses to start
    the task when a `secrets` entry cannot be read, so **the development default password can never apply.**
  - The owner deletes the secret after the run. The README says to generate a password of 24 or more
    characters.

  The paths in the task match the repository.
- Storage: the S3 task role, SSE-S3 default, and the SSE header not signed into presigned uploads are on
  main [C: #21, #23].

## Changes made / merged

None in munaxa-school. The bootstrap task is platform#27: **merged** as `329a8b9` (head `811acf9` pinned).

## Tests executed

Path checks (`ls prisma/seed.ts apps/api/scripts/seed-platform-owner.ts`; `tsx` in `apps/api/package.json`;
the Dockerfile `migrate` stage). No container was built or run.

## Outstanding blockers

- G2 to G7. The first `school-bootstrap` run is the seeds' first run from this exact image, so read its
  log before going on (README).
- TD-7 (Firebase on Testing). R-15 / S9 (mobile Content-Length) is outside Testing.

## Actions explicitly not performed

No seed, no migration, no workflow dispatch, no Render, Cloudflare or demo Worker change.
