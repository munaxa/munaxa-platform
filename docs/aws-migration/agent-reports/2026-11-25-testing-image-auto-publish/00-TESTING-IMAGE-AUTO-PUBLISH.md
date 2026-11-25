# Automatic Testing image publishing (Docs, Identity, Control, Work, School)

Date: 25 Nov 2026. Requested by the owner ("make it fewer for testing or auto for test", "also for
work and school"). Status: **PREPARED IN REPOSITORIES, NOT MERGED, NOT APPLIED.** It needs one owner yes.

## 1. Problem

Today one Testing image needs two owner clicks: (1) create the `image/<sha>` tag or pre-release, and
(2) approve the `image-release` environment. The same path also publishes production images, so
taking away the approval there would also take away the production gate.

## 2. Design

A **separate Testing path** next to the unchanged release path, in every product repository.

| | Release path (unchanged) | Testing path (new) |
| --- | --- | --- |
| Workflow | `publish-images.yml` / `publish-images-ecr.yml` | `publish-images-testing.yml` |
| Trigger | `image/<sha>` tag (School: dispatch from the tag) | After `CI` succeeds on a push to `main` (Docs, Identity, Control, Work), or dispatched from `main` with an optional SHA on main (all five; School only this way) |
| GitHub environment | `image-release`, owner is the required reviewer | `image-testing`, no reviewer |
| AWS trust (same publisher role) | `sub …:environment:image-release`, `ref refs/tags/image/*` | `sub …:environment:image-testing`, `ref = refs/heads/main`, `job_workflow_ref = <owner>/<repo>/.github/workflows/publish-images-testing.yml@refs/heads/main`, all `StringEquals` |
| Tags | `<short>`, `sha-<full>` | `testing-<short>`, `testing-sha-<full>` only |
| ECR lifecycle | newest 20 `sha-*` kept | newest 30 `testing-*` kept, counted separately |
| Build, verify, scan, pull-back verify | yes | identical (copied); Docs also antivirus probes + release smoke |

Why this is safe:

- **Only reviewed code can publish.** `main` accepts only reviewed PRs (Protect main). The role trust
  names the exact file on `refs/heads/main`, so a branch, tag, pull request, fork or other workflow
  cannot get credentials, even though `image-testing` has no reviewer. A dispatch runs main's copy of
  the workflow and checks that the chosen SHA is an ancestor of main.
- **Nothing deploys.** Publishing only puts an image in ECR. Testing changes only when its pinned
  digest changes (an owner-approved apply). Production pins come only from the approved release path, and the
  stack still refuses product images in production while the D-SSL exception exists.
- **Production images are protected.** Tags are immutable, and the role has no delete permission and
  is push-only to its own product's repositories. Testing builds cannot take a release tag. The lifecycle fix
  matters: the platform rule kept "the last 20 images of any tag". A lower-priority ECR rule
  still counts images that a higher rule selected (AWS ECR user guide, *Lifecycle policy evaluation
  rules*), so 20 Testing builds would have expired every rollback target. Now `testing-*` (30) and
  `sha-*` (20) are counted apart, and no `any` rule is left. A read-only check at 19:5x UTC showed every image
  in all 15 ECR repositories has a `sha-*` tag, so no existing image is affected.
- **The supply-chain hardening is unchanged.** Same pinned actions, same OIDC (no registry credential),
  same `PLATFORM_PACKAGES_TOKEN` as a BuildKit secret, same verify and scan gates. The only scan
  difference: the D-SSL Testing exception (Docs, Identity, Control) lists the new Testing workflow
  file. Its findings, images, `environment: testing` and expiry (2026-12-01T00:00:00Z) are unchanged.
  Work and School get no exception (MW-001 still waits for OpenSSL 3.5.10).
- **Cost.** At most one build per merge that changes code (Docs: CI already skips Markdown-only pushes;
  every workflow skips commits that change only `docs/**` or `*.md`). Storage is capped at 30 Testing images per
  repository.

School keeps its rule that nothing with an environment runs on a merge: its Testing workflow is
dispatch-only, and Claude dispatches it after a merge. Its deploy-gate gets an `image-testing`
target (main only, `approval: false`). Every other target still requires a reviewer.

## 3. Changes (all unmerged)

| PR | Content | Local checks |
| --- | --- | --- |
| munaxa/munaxa-platform#192 | bootstrap `iam.tf` second trust statement per product publisher, `main.tf` lifecycle split, `variables.tf` `testing_image_environment`, 2 new test runs, this report | `terraform fmt`, `validate`, `test` 25/25 pass (mock provider); mutation `refs/heads/*` fails the new test |
| munaxa/munaxa-docs#188 | `publish-images-testing.yml`; bootstrap `ecr.tf` trust statement `GitHubActionsTestingImagePublishing` + lifecycle rule; D-SSL workflow list | `test_scan_exception.py` 46/46, `terraform validate` OK |
| munaxa/munaxa-identity#30 | `publish-images-testing.yml`; D-SSL workflow list | 46/46 |
| munaxa/munaxa-control#19 | `publish-images-testing.yml`; D-SSL workflow list | 46/46 |
| munaxa/munaxa-work#60 | `publish-images-testing.yml` (MW-009 green-CI gate kept); CODEOWNERS required list | check-codeowners OK, 31/31 |
| munaxa/munaxa-school#30 | `publish-images-testing.yml` (dispatch-only, nonprod admin only); deploy-gate `image-testing`; docs | deploy-gate tests 41/41, lint OK |

actionlint was not run locally (the session refused the binary download). School CI runs it.

## 4. Owner decision and what happens after a yes

One yes covers:

1. Merging the six PRs. They publish nothing by themselves: the role refuses `image-testing` until step 2.
2. Applying the AWS half, by Claude through the AWS connector, matching the Terraform on main exactly:
   `iam:UpdateAssumeRolePolicy` on 5 publisher roles (4 shared + Docs) and `ecr:PutLifecyclePolicy` on
   15 repositories. Nothing is created or deleted. Then a read-only check compares the live policies with the code.
   The next bootstrap plan should show no change for these resources.
3. Letting GitHub create the `image-testing` environment on its first run (no settings to click).
4. The new workflow using the existing D-SSL Testing exception until it expires on 1 Dec.

After that, merging code to main publishes Testing images by itself (School: Claude dispatches).
Pinning a new digest in Testing is still a separate, owner-approved apply. Production is unchanged.

The pending Docs `a523f44` release through the old path is not affected by any of this.
