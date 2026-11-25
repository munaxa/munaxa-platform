# Automatic Testing image publishing (Docs, Identity, Control, Work, School)

Date: 25 Nov 2026. Requested by the owner ("make it fewer for testing or auto for test", "also for
work and school"). Status: **APPROVED by the owner (decision card, 25 Nov 20:17 UTC), AWS APPLIED and VERIFIED (20:19 to 20:21 UTC), PRs merged** (see section 5).

## 1. Problem

Today one Testing image needs two owner clicks: (1) create the `image/<sha>` tag or pre-release, and
(2) approve the `image-release` environment. The same path also publishes production images, so
taking away the approval there would also take away the production gate.

## 2. Design

A **separate Testing path** next to the unchanged release path, in every product repository.

| | Release path (unchanged) | Testing path (new) |
| --- | --- | --- |
| Workflow | `publish-images.yml` / `publish-images-ecr.yml` | `publish-images-testing.yml` |
| Trigger | `image/<sha>` tag (School: dispatch from the tag) | After `CI` succeeds on a push to `main` (Docs, Identity, Control, Work); on the push to `main` itself for School, whose CI runs on pull requests only; or dispatched from `main` with an optional SHA on main (all five) |
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
  `sha-*` (20) are counted apart, and no `any` rule is left. A read-only check (25 Nov, about 19:50 UTC) showed every image
  in all 15 ECR repositories has a `sha-*` tag, so no existing image is affected.
- **The supply-chain hardening is unchanged.** Same pinned actions, same OIDC (no registry credential),
  same `PLATFORM_PACKAGES_TOKEN` as a BuildKit secret, same verify and scan gates. The only scan
  difference: the D-SSL Testing exception (Docs, Identity, Control) lists the new Testing workflow
  file. Its findings, images, `environment: testing` and expiry (2026-12-01T00:00:00Z) are unchanged.
  Work and School get no exception (MW-001 still waits for OpenSSL 3.5.10).
- **Cost.** At most one build per merge that changes code (Docs: CI already skips Markdown-only pushes;
  every workflow skips commits that change only `docs/**` or `*.md`). Storage is capped at 30 Testing images per
  repository.

School publishes on merge like the others (owner, 25 Nov 20:10 UTC: "School should be same as all
apps"). Its deploy-gate gets an `image-testing` target (main only, `approval: false`, `onMerge:
true`). The lint accepts a `push` trigger only when it is limited to the branch `main` and the gate
and every gated job name `image-testing`. Every other target is still dispatch-only behind a reviewer.

## 3. Changes (all unmerged)

| PR | Content | Local checks |
| --- | --- | --- |
| munaxa/munaxa-platform#192 | bootstrap `iam.tf` second trust statement per product publisher, `main.tf` lifecycle split, `variables.tf` `testing_image_environment`, 2 new test runs, this report | `terraform fmt`, `validate`, `test` 25/25 pass (mock provider); mutation `refs/heads/*` fails the new test |
| munaxa/munaxa-docs#188 | `publish-images-testing.yml`; bootstrap `ecr.tf` trust statement `GitHubActionsTestingImagePublishing` + lifecycle rule; D-SSL workflow list | `test_scan_exception.py` 46/46, `terraform validate` OK |
| munaxa/munaxa-identity#30 | `publish-images-testing.yml`; D-SSL workflow list | 46/46 |
| munaxa/munaxa-control#19 | `publish-images-testing.yml`; D-SSL workflow list | 46/46 |
| munaxa/munaxa-work#60 | `publish-images-testing.yml` (MW-009 green-CI gate kept); CODEOWNERS required list | check-codeowners OK, 31/31 |
| munaxa/munaxa-school#30 | `publish-images-testing.yml` (push to main + dispatch, nonprod admin only); deploy-gate `image-testing` with merge allowance; docs | deploy-gate tests 43/43, lint OK |

actionlint was not run locally (the session refused the binary download). School CI runs it.

CI on the PRs: the `Images` job of Work and School is red because of the known OpenSSL 3.5.9-r1
HIGH findings, which are also red on their `main` (not these PRs; commented on each). For the same reason,
Work and School Testing publishing will refuse images until Alpine ships OpenSSL 3.5.10. Docs,
Identity and Control can publish under the D-SSL Testing exception until 1 Dec.

## 4. Owner decision and what happens after a yes

One yes covers:

1. Merging the six PRs. They publish nothing by themselves: the role refuses `image-testing` until step 2.
2. Applying the AWS half, by Claude through the AWS connector, matching the Terraform on main exactly:
   `iam:UpdateAssumeRolePolicy` on 5 publisher roles (4 shared + Docs) and `ecr:PutLifecyclePolicy` on
   15 repositories. Nothing is created or deleted. Then a read-only check compares the live policies with the code.
   The next bootstrap plan should show no change for these resources.
3. Letting GitHub create the `image-testing` environment on its first run (no settings to click).
4. The new workflow using the existing D-SSL Testing exception until it expires on 1 Dec.

After that, merging code to main publishes Testing images by itself in all five repositories.
Pinning a new digest in Testing is still a separate, owner-approved apply. Production is unchanged.

The pending Docs `a523f44` release through the old path is not affected by any of this.

## 5. Execution (25 Nov 2026, after the owner's yes at 20:17:54 UTC)

AWS, through the AWS connector (root, management account 229251310592, eu-central-1). Each change
was built from the live document, keeping the existing statement byte for byte and appending the new one:

| Change | Resources | Result |
| --- | --- | --- |
| `iam:UpdateAssumeRolePolicy`: second statement (`image-testing`, `refs/heads/main`, `<repo>/.github/workflows/publish-images-testing.yml@refs/heads/main`, all `StringEquals`; Docs also `repository_id` and `repository_owner_id`, Sid `GitHubActionsTestingImagePublishing`) | `munaxa-control-image-publisher`, `munaxa-identity-image-publisher`, `munaxa-school-image-publisher`, `munaxa-work-image-publisher`, `munaxa-docs-eu-prod-image-publisher` | 5/5 succeeded |
| `ecr:PutLifecyclePolicy`: untagged 7 days; `testing-*` newest 30; `sha-*` newest 20 | 11 shared repositories + 4 `munaxa-docs/*` | 15/15 succeeded |

Read-back verification: every role has exactly two statements. The first one is unchanged
(`image-release`, `refs/tags/image/*`, and for Docs `publish-images.yml@refs/tags/image/*`). The
second one is as listed above and has no `StringLike` key. All 15 lifecycle policies read back as
`[1 untagged 7d] [2 testing-* 30] [3 sha-* 20]`. A lifecycle **preview** on all 15 repositories
completed with **0 images to expire**. Nothing was created or deleted, and no permission policy or
boundary changed.

The Terraform in munaxa-platform `infra/aws/bootstrap` and munaxa-docs `infra/terraform/bootstrap`
on main describes exactly this. The next bootstrap plan should show no change for these resources
(Terraform compares IAM and lifecycle JSON by meaning). If it shows one, the difference is formatting only.

GitHub: munaxa-work#60 merged as `19eb921`. Docs, Identity, Control and School merged after their
branches were updated with main (required checks are strict). Merge commits are in the PRs. The
`image-testing` environment is created by GitHub on each repository's first Testing run.

### 5.1 First automatic runs (25 Nov 2026)

| App | Run | Result | Testing tag in ECR (read-only check 21:00 UTC) |
| --- | --- | --- | --- |
| Identity | [45695321588](https://github.com/munaxa/munaxa-identity/actions/runs/45695321588) (after CI on `76e2209`) | Published | `testing-76e2209` in `munaxa-identity/api`, `/migrate` |
| Control | [45696119449](https://github.com/munaxa/munaxa-control/actions/runs/45696119449) (after CI on `3213275`) | Published | `testing-3213275` in `munaxa-control/api`, `/migrate`, `/portal` |
| Docs | [45698365396](https://github.com/munaxa/munaxa-docs/actions/runs/45698365396) (after CI on `3fc1187`) | Published; ECR confirmation passed, release smoke was still running at the time of writing | `testing-3fc1187` in `munaxa-docs/api`, `/web`, `/migrate`, `/antivirus` |
| Work | [45696327954](https://github.com/munaxa/munaxa-work/actions/runs/45696327954) | Skipped, as designed: CI on main is red (OpenSSL 3.5.9-r1 HIGH, no Testing exception for Work) | none yet |
| School | [45694635783](https://github.com/munaxa/munaxa-school/actions/runs/45694635783) (push of `27d08b1`) | **Failed at role assumption**, see 5.2 | none yet |

### 5.2 School: wrong role ARN in a repository variable (fixed in code)

CloudTrail showed 37 `AssumeRoleWithWebIdentity` AccessDenied events (20:27 to 20:28 UTC) with the
correct subject (`repo:munaxa@311481412/munaxa-school@1318345275:environment:image-testing`), after
the trust was updated at 20:18:38 UTC. The cause was the School repository variable
`AWS_IMAGE_PUBLISHER_ROLE_ARN`. It names `arn:aws:iam::229251310592:role/munaxa-school-image-publisher`,
but the role's real ARN carries the IAM path `munaxa-shared/bootstrap/`.

Fix: munaxa-school#31 (merged as `06c34e2`). The Testing workflow names the full ARN
`arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-school-image-publisher`. The AWS
trust did not change. The School **release** workflow still reads the wrong variable and will fail
the same way until the variable is corrected (a GitHub setting).

Until OpenSSL 3.5.10 ships, Work and School still cannot publish: Work is skipped because main CI
is red, and School will now get past the role but fail the pre-push scan. Neither has a D-SSL
exception, and this change did not widen D-SSL. They publish automatically on the first green
merge after the base image is fixed.

### 5.3 What is still owner-gated

Production images (the `image/<sha>` tag plus `image-release` approval) are unchanged. Moving a
Testing service onto a new `testing-*` image is still a Terraform pin change and apply, which needs
the owner's yes as before.
