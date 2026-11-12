# 01. GitHub Actions package-token audit

Repositories: munaxa-platform, munaxa-identity, munaxa-work, munaxa-control (all **public**).

Mains audited:
- platform `aaf00e4`
- identity `5a5994f`
- work `eabcc47`
- control `1f58c90`

Tags: **[V]** verified in the repository or on GitHub, **[L]** local check, **[U]** not readable from this session, **[O]** owner action.

## What this session can and cannot read

| Readable [V] | Not readable [U] (the proxy refuses) |
| --- | --- |
| workflow files, rulesets, workflow runs, job logs, run approvals, deployments, tags, branches | repository and environment secrets, environment protection rules, Actions variables, collaborators, org package settings, default workflow token permissions |

So **the existence of `PLATFORM_PACKAGES_TOKEN` and the settings of `image-release` cannot be read directly.** They are inferred from run evidence: identity runs that used the secret succeeded, and run 42466697538 was approved in `image-release` by tam2om.

## The reviewer finding (L2): confirmed

GitHub hands a **repository** secret to any workflow run triggered by a `push` or a same-repository `pull_request`. The workflow file comes from the pushed ref, so its author decides what runs.

So anyone who can push a branch can add a step that prints `${{ secrets.PLATFORM_PACKAGES_TOKEN }}`, for example base64-encoded to defeat log masking, and read it from the public log.

This is not hypothetical. On 12 Nov, a temporary workflow on the identity#18 branch (run 43286188504) ran with this secret. It used it correctly, but nothing prevented otherwise.

**Workflow edits on `main` cannot close this,** because the attacker supplies the workflow. Only these do:
- (a) no workflow needs the long-lived token; or
- (b) the token lives in an environment secret, behind a deployment-branch policy or a required reviewer.

Fork pull requests do not get secrets (no `pull_request_target` anywhere [V]). So the exposure is to people and agents with push access, which includes every Claude session.

The token is a classic PAT with no expiry (owner-confirmed 8 Nov, report `2026-11-08-first-testing-release-preparation` §12). A classic `read:packages` PAT reads **every** package its owner can read, not only `@munaxa/*`.

## Per-repository findings (main, before the PRs)

`supporting/workflow-token-check-main.txt` is the static check (`supporting/workflow-token-check.py`) on main.

### munaxa-identity

| Workflow | Trigger | Token use | Findings |
| --- | --- | --- | --- |
| `ci.yml` job `verify` | push main, every `pull_request` | `NODE_AUTH_TOKEN: secrets.PLATFORM_PACKAGES_TOKEN` at step level on Install and Audit | no `permissions:` (repository default token); checkout persists credentials; PAT on every PR run |
| `publish-images-ecr.yml` job `publish` | push `image/**` tag | PAT as BuildKit secret `npm_token` | environment `image-release`, OIDC, pinned, `persist-credentials: false` [V]; the PAT itself is a repository secret, so the environment does not protect it |
| `publish-images.yml` (GHCR) | `workflow_dispatch` | PAT as BuildKit secret | workflow-level `packages: write`; checkout persists credentials |

### munaxa-work

| Workflow | Trigger | Token use | Findings |
| --- | --- | --- | --- |
| `ci.yml` job `node` | push main, PR to main | `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN` on Install | no workflow `permissions:`; 4 checkouts persist credentials; 6 actions on mutable tags (`checkout@v6`, `pnpm/action-setup@v6`, `setup-node@v6`, `setup-java@v4`, `flutter-action@v2`) |
| `publish-images-ecr.yml` | `image/**` tag | PAT as BuildKit secret | `image-release`, OIDC, pinned; the job has no `packages:` permission (works only because of the PAT) |
| `publish-images.yml` (GHCR) | dispatch | PAT as BuildKit secret | workflow-level `packages: write`; 4 actions on mutable tags |

### munaxa-control

| Workflow | Trigger | Token use | Findings |
| --- | --- | --- | --- |
| `ci.yml` jobs `verify`, `image` | push main, PR to main | `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN` on Install and as BuildKit secret | permissions already minimal [V]; checkouts persist credentials; mutable tags |
| `publish-images.yml` (ECR) | `image/**` tag | `PAT \|\| GITHUB_TOKEN` as BuildKit secret | `image-release`, OIDC, pinned |

### munaxa-platform

| Workflow | Token use | Findings |
| --- | --- | --- |
| `ci.yml` | none (builds its own packages) | no `permissions:`; checkouts persist credentials; 4 actions on mutable tags |
| `release.yml` | `GITHUB_TOKEN`, `packages: write` only in the main-guarded publish job | correct [V]. Residual risk, noted on 12 Nov: a branch workflow can request `packages: write` and publish. See 09 |
| `aws-terraform.yml`, `aws-session.yml` | OIDC only, protected environments | correct [V] |

## Checks across the four repositories

| Check | Result |
| --- | --- |
| `pull_request_target` or `workflow_run` | none [V] |
| Secret in job-level `env` | none [V] |
| Secret interpolated into a `run:` script | none [V] |
| Secret as a Docker build argument | none; BuildKit secrets only, and the Dockerfile ids match [V] |
| Token printed in logs | no step echoes it [V]. Masking does not stop an attacker's own step |
| Write permissions | `id-token: write` only in `image-release` jobs. `packages: write` only in dispatch-only GHCR jobs and the platform publish job. `contents: write` nowhere [V] |
| Rulesets | identity, work, control: `main` protected (PR and required checks, no bypass); `image/*` tags creation, update and deletion restricted, admin bypass. platform: `main` protected [V] |

## Outside the four repositories (found by the independent review and confirmed [V])

Two more repositories still use the token. Both were outside this task's scope, and neither was changed: their workflows are not application code, but they were not part of the authorization.

- **munaxa-docs** (main `9d06698`):
  - `ci.yml`: 7 jobs on pull requests and pushes;
  - `publish-images.yml`.
- **munaxa-school** (main `4c2b4a4`): `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN` in `ci.yml`, `deploy.yml`, `deploy-cloudflare.yml`, `seed-environment.yml` and `publish-images-ecr.yml`.

The token must not be revoked until both stop using it (09).
