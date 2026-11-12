# 07. Independent security review

A separate, read-only reviewer received the four PR diffs and the full workflow files, but not this report's conclusions. It used only local git and `git ls-remote`, and changed nothing on GitHub.

## Verdict on identity#19, work#32, control#9, platform#117: **APPROVE**, nothing to change in the PRs

The reviewer verified each of these:
- No long-lived credential remains in the four PRs:
  - no `pull_request_target` or `workflow_run`;
  - no secret in job env or in `run:`;
  - `NODE_AUTH_TOKEN` appears only at step level;
  - images receive the token only as a BuildKit secret, never as a build argument.
- Permissions are minimal, and none is missing. `packages: read` is on every installing job. Work's ECR job needs its new `packages: read` because the PAT had been supplying that access. Platform CI installs nothing from the registry.
- `persist-credentials: false` breaks nothing. Later steps use only local git. The ECR `source` jobs' `git fetch origin main` works anonymously because the repositories are public, and was already used that way.
- Every SHA pin equals the commit its floating major tag pointed to (checked with `git ls-remote`).
- CI is not weakened.
- The BuildKit secret ids match the Dockerfiles:
  - identity `npm_token`: `apps/api/Dockerfile:47,97`;
  - work `npm_token`: api and admin Dockerfiles;
  - control `node_auth_token`: `Dockerfile:48,63`, `required=true`.

## Findings and resolutions

| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| H1 | High (outside these PRs) | munaxa-docs still uses `PLATFORM_PACKAGES_TOKEN` (ci.yml, 7 jobs, and publish-images.yml). Any docs branch can read the PAT. This session also found the same in munaxa-school (5 workflows) | **Open, out of scope.** Not authorized here. Recorded as the first follow-up (09). The PAT must not be revoked before docs and school stop using it |
| M1 | Medium | The package "Manage Actions access" grant must be **Read**. Write would let a branch pusher publish a poisoned `@munaxa/*` version | Owner instruction says Read only, never Write or Admin (02, owner file) |
| M2 | Medium | Builds fail until the grant exists (fails closed, an availability issue only) | **Confirmed by CI** (control#9 403). The three PRs are draft until the grant is made |
| M3 | Medium | Deleting the secret is not enough. The PAT never expires and was exposed, so it must be revoked | Owner step 5 in 02, after docs and school are migrated |
| L1 | Low | The image-history leak check matched `ghp_` and `github_pat_` but not `ghs_`, the prefix of the per-run token | **Fixed**: identity `888c532`, work `7d30ba2` (both image workflows in each). Control's publish workflow has no such grep (it checks only npmrc), unchanged |
| L2 | Low | GHCR dispatch jobs now mount a `packages: write` per-run token inside the build of a dispatched commit (before, only the login step held it) | Accepted. Dispatch already requires write access, and such a user can run any workflow. GHCR is retired with Render |
| L3 | Low | Identity docs `docs/runbooks/secrets.md:17`, `configuration-contract.md:22` and `repository-creation.md:51` still describe the repository secret | Open, documentation follow-up after the grant (09) |

**Residual risk accepted [R].** A branch pusher still gets a per-repository, job-lifetime `GITHUB_TOKEN`, and may request write scopes. That is acceptable while these protections stay in place:
- the `main` and `image/*` rulesets;
- the `image-release` required reviewer;
- the publisher role's OIDC trust, which requires that environment and an `image/*` tag.
