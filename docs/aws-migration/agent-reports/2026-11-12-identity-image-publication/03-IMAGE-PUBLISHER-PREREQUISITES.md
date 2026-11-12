# 03. Identity image publisher prerequisites (Phase B)

Source commit: `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`, munaxa-identity.

Tags: **[V]** verified, **[I]** inferred from run evidence, **[U]** not verifiable from this session, **[BLOCKED]** check could not run.

## Result: PASS (update 20:43 UTC)

The first attempts were blocked, as described below. At 20:43 UTC the owner signed in to the connector again. The read-only check then **passed** (section "AWS settings, live"), and the tag and run followed (04).

## First attempts: AWS side BLOCKED

The AWS checks did not run. The AWS MCP connector (root of account 229251310592, approved for read-only checks) answered "needs you to sign in again" at about 19:44, 19:53 and 20:00 UTC.

**So the tag was not created and the workflow was not run**, as the authorization requires.

## Workflow at `5a5994f` [V]

| Requirement | Evidence |
| --- | --- |
| Exists on the approved main commit | `.github/workflows/publish-images-ecr.yml` at `5a5994f`. `5a5994f` is `origin/main` and on main (`git merge-base --is-ancestor`) |
| Triggered by the expected tag | `on: push: tags: ['image/**']`. Job `source` refuses a name that is not `image/<40 hex>`, and refuses a tag whose commit is not the one it names (`GITHUB_SHA` must equal it). It fetches main and refuses a commit not on main |
| Protected environment | job `publish`: `environment: image-release` |
| OIDC, no static AWS credentials | `id-token: write`; `aws-actions/configure-aws-credentials` (pinned `e125382…`) with `role-to-assume: vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` and `allowed-account-ids: 229251310592`; no AWS secret anywhere |
| Exactly two images | matrix: `munaxa-identity/api` target `runtime`, `munaxa-identity/migrate` target `migrate` |
| Correct Dockerfile and context | `file: apps/api/Dockerfile`, `context: .`. Both stages exist in that Dockerfile (`FROM build AS migrate`, `FROM node:22-alpine AS runtime`) |
| Immutable tags, no `latest` | tags `<short sha>` and `sha-<full sha>`; `provenance: false` (single-platform manifest, so the digest names the image) |
| Digest recorded | `steps.build.outputs.digest`, pulled by digest and written to the step summary |
| Exact source commit | checkout `ref: needs.source.outputs.sha`; label `org.opencontainers.image.revision=<sha>` |
| No unrelated publication | only the two matrix entries. The GHCR workflow `publish-images.yml` is dispatch-only and does not listen to tags |
| In-run checks | not root (`id -un`); no `ghp_`, `github_pat_` or `_authToken=` in image history; no npmrc with a token in the image; no vitest, eslint, turbo or Nest CLI in the runtime image |
| Package credential | `PLATFORM_PACKAGES_TOKEN` as the BuildKit secret `npm_token`, mounted only in two `RUN` steps that write and then delete `/root/.npmrc` (Dockerfile) |

Note: a tag push runs the workflow file **of the tagged commit**. So identity#19 does not change this run, whether or not it is merged first. This run will use `PLATFORM_PACKAGES_TOKEN`. **The repository secret must not be deleted before this publication.**

## GitHub settings

| Prerequisite | Result | How |
| --- | --- | --- |
| `image-release` environment exists | **[I] yes** | Run 42466697538 (8 Nov, Identity `5277d71`) ran its `publish` jobs in `image-release`. The deployments API lists four `image-release` deployments for that tag |
| Required reviewer on `image-release` | **[I] yes, tam2om** | `GET /actions/runs/42466697538/approvals`: `state: approved`, user `tam2om`, environments `image-release`. The protection-rules API is refused by the session proxy [U]. The owner confirmed it on 8 Nov (report `2026-11-08-first-testing-release-preparation` §12) |
| Deployment tag or branch policy of the environment | **[U]** | not readable. The tag ruleset below and the role trust compensate |
| `AWS_IMAGE_PUBLISHER_ROLE_ARN` set | **[I] yes, with the IAM path** | The variables API is refused [U]. The 8 Nov run assumed the role after the owner corrected the variable to include `/munaxa-shared/bootstrap/` (report 2026-11-08 §13) |
| `PLATFORM_PACKAGES_TOKEN` present | **[I] yes** | identity CI on main `5a5994f` (run 43287805158) installed from GitHub Packages with it |
| `image/*` tag ruleset | **[V]** "Protect image tags", active: creation, update, deletion and non-fast-forward restricted; bypass is the repository **admin** role only. This session's identity can bypass it (`current_user_can_bypass: always`) |
| Existing `image/*` tags | **[V]** only `image/5277d7190b3dda496443c4bd7d80c78bd4d9174e`; the `5a5994f` tag does not exist |

## AWS settings, live (20:43 UTC, root connector, read-only): **PASS** [V]

| Prerequisite | Live value |
| --- | --- |
| Caller | `arn:aws:iam::229251310592:root` (the approved development access) |
| Role | `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`, max session 3600 s, last used 2026-11-08 09:35 UTC |
| Trust | one statement, `sts:AssumeRoleWithWebIdentity`, from `oidc-provider/token.actions.githubusercontent.com`. Conditions:<br>• `aud = sts.amazonaws.com`;<br>• `sub = repo:munaxa@311481412/munaxa-identity@1354378376:environment:image-release`, GitHub's immutable-id subject format, naming this repository and this environment only;<br>• `ref` StringLike `refs/tags/image/*` |
| OIDC provider | `token.actions.githubusercontent.com`, client id `sts.amazonaws.com` only |
| Permissions | inline `push-own-images` only, no attached policy:<br>• `ecr:GetAuthorizationToken` on `*`;<br>• on the two Identity repository ARNs only: the 9 push and read actions listed below |
| ECR repositories | both exist (created 31 Oct): `IMMUTABLE`, scan on push, AES256, no repository policy. Lifecycle: untagged images expire after 7 days, keep the last 20 tagged |
| Existing images | api and migrate each hold only `5277d71` (`sha256:71d01fdf…`, `sha256:d175ef37…`). There was no `5a5994f` image before the run |

## AWS settings, expected from code (for comparison)

Expected from `munaxa-platform/infra/aws/bootstrap/iam.tf` (`publisher_trust`, `publisher`); not verified live this time.

| Prerequisite | Expected |
| --- | --- |
| Role | `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`, max session 3600 s |
| Trust | `sts:AssumeRoleWithWebIdentity` from the GitHub OIDC provider with three conditions: `aud = sts.amazonaws.com`; `sub = repo:munaxa/munaxa-identity:environment:image-release`; `ref` like `refs/tags/image/*` |
| Permissions | one inline policy, `push-own-images`: `ecr:GetAuthorizationToken` on `*`, and on the two Identity repositories only: BatchCheckLayerAvailability, InitiateLayerUpload, UploadLayerPart, CompleteLayerUpload, PutImage, BatchGetImage, DescribeImages, DescribeImageScanFindings, GetDownloadUrlForLayer. No delete, no tag mutation, no other repository |
| ECR repositories | `munaxa-identity/api` and `munaxa-identity/migrate` exist, `IMMUTABLE`, with lifecycle |
| Last live check | 8 Nov, report `2026-11-08-first-testing-release-preparation`: "publisher trust and policy, ECR IMMUTABLE with lifecycle" **VERIFIED** then. Images `sha256:71d01fdf…` and `sha256:d175ef37…` were pushed at `5277d71` |

The prepared read-only check, one script with no writes, reads:
- `sts:GetCallerIdentity`;
- `iam:GetRole`, `ListRolePolicies`, `GetRolePolicy` and `ListAttachedRolePolicies` for the role;
- the OIDC provider;
- `ecr:DescribeRepositories`, `DescribeImages`, `GetLifecyclePolicy` and `GetRepositoryPolicy` for both repositories.

Pass criteria:
- the table above holds;
- no attached managed policy;
- no tag `5a5994f` or `sha-5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` exists yet.

## What unblocked Phase C (historical)

1. The owner signs in to the AWS MCP connector again (claude.ai, Settings, Connectors).
2. Claude runs the read-only check above.
3. If it passes, the tag is created and the run starts. In fact this session's tag push was refused (HTTP 403, push scope), so the owner created the tag on the release page (04).
4. The owner approves `image-release` in GitHub when it asks. Claude does not approve it: that would be self-approval of an environment protection.
