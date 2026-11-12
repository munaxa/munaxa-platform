# 02. Package-token hardening

## Design chosen, and why

The goal is that **no workflow needs a long-lived package credential**. Every install and image build reads `@munaxa/*` with that run's own `GITHUB_TOKEN`:
- it carries `packages: read` on the one job that needs it;
- it expires when the job ends;
- it is scoped to the packages that grant the repository access.

Alternatives considered:

| Option | Why not |
| --- | --- |
| Move the PAT into a protected environment restricted to `main` | Pull request CI would then have no credential and could not install. Making PR CI conditional or skipping install is a weakening of CI, which the task forbids |
| PAT in an environment with a required reviewer for every CI run | The owner would approve every CI run. That is impractical, and an approval of a branch workflow still hands the PAT to that branch's code |
| Keep the PAT and restrict pushers | Every Claude session pushes branches. The risk is the push access itself |

What remains for a branch pusher: they can still write a workflow requesting `packages: read`. That gives a token that:
- reads only the packages granted to that repository;
- lives only as long as the job;
- cannot be exported usefully afterwards.

The packages are builds of public source, so this is acceptable. The protection that matters is the role: it must be **Read**, never Write (reviewer M1).

## PRs (workflow files only; no application code)

| PR | Head | Changes |
| --- | --- | --- |
| [munaxa-identity#19](https://github.com/munaxa/munaxa-identity/pull/19) | `888c532` | `ci.yml`: per-run token for install and audit; job `packages: read`; workflow `contents: read`; `persist-credentials: false`. `publish-images-ecr.yml`: BuildKit `npm_token` is the per-run token. `publish-images.yml`: same; `packages: write` moved to the job; no persisted credentials. Both image workflows' history check also matches `ghs_` |
| [munaxa-work#32](https://github.com/munaxa/munaxa-work/pull/32) | `7d30ba2` | `ci.yml`: per-run token; workflow `contents: read`; 4 checkouts without persisted credentials; 6 actions pinned to SHAs. `publish-images-ecr.yml`: per-run token, job gains `packages: read`, `ghs_` check. `publish-images.yml`: per-run token, `packages: write` on the job, 4 pins, `ghs_` check |
| [munaxa-control#9](https://github.com/munaxa/munaxa-control/pull/9) | `2cb5371` | `ci.yml`: per-run token for install and for the CI image build; 2 checkouts without persisted credentials; checkout, pnpm, setup-node and buildx pinned. `publish-images.yml`: per-run token |
| [munaxa-platform#117](https://github.com/munaxa/munaxa-platform/pull/117) | `8e98cb0` | `ci.yml` only: workflow `contents: read`; 3 checkouts without persisted credentials; 10 action references pinned |

Each pin is the commit that the major tag already in use pointed to on 12 Nov, so behaviour is unchanged. The reviewer checked every pin with `git ls-remote`.

No step was removed, skipped or made conditional.

**Static check** (`supporting/workflow-token-check.py`): main fails it in 11 of 12 workflow files (`supporting/workflow-token-check-main.txt`). With all four PR branches applied, all 12 pass (`supporting/workflow-token-check-branch.txt`).

The check covers:
- `pull_request_target`;
- workflow-level permissions;
- any `PLATFORM_PACKAGES_TOKEN` reference;
- secrets in job env or `run:`;
- SHA pins;
- persisted credentials;
- `packages:` permission wherever a package token is used.

## The blocker found by testing [V]

The PR CI runs showed that the per-run token **cannot read the packages yet**:
- control#9 run 43293572031, job "Build the images": `ERR_PNPM_FETCH_403 GET https://npm.pkg.github.com/download/@munaxa/types/2.4.1/...: Forbidden - 403`. The Docker build has no cache, so it downloads every package.
- The host installs in identity#19 (run 43293534190), work#32 and control#9 passed only because `setup-node` restored the pnpm store from cache: "Cache restored from key ...", then "Lockfile is up to date". **They did not prove access.** A cache-cold run would fail in the same way.

So merging identity#19, work#32 or control#9 now would leave main's CI failing at the next cache miss. They were set to **draft**.

platform#117 does not depend on package access.

## Owner action required [O] (GitHub UI; no API exists for it)

For each `@munaxa` package in munaxa-platform, open **Package settings** and use **Manage Actions access → Add repository**. Choose the role **Read**, never Write or Admin.

| Package | Repositories |
| --- | --- |
| types, crypto | identity, work, control, docs, school |
| auth, interfaces | identity, work, control |
| audit, cache, config, conformance, logging, rbac, security, session | identity |
| config-eslint, config-typescript, licensing, platform, theme, ui | work, control, docs, school |
| icons | control, docs |
| tokens | docs, school |

The same list, with click paths, is in the project file `OWNER-ACTION-package-read-access.md`.

Then, in order:
1. Claude re-runs the three PRs' CI. The Control image build is the cache-free proof.
2. Claude takes them out of draft and merges them.
3. Owner: delete the repository secret `PLATFORM_PACKAGES_TOKEN` in munaxa-identity, munaxa-work and munaxa-control (Settings → Secrets and variables → Actions).
4. A follow-up (separately authorized) does the same for munaxa-docs and munaxa-school.
5. Owner: revoke the PAT at github.com/settings/tokens. Deleting the secrets alone is not enough: the token was exposed and never expires (reviewer M3).

**No credential was rotated, read or created by Claude.**
