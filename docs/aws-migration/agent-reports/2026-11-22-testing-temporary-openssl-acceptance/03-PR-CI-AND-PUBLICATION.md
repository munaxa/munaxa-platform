# 03. Pull requests, CI evidence and image publication preparation

Merges were done under the standing authorization in the brief: only when every required check and
branch protection rule passed, squash merge, no bypass, no force-push. **No image was published, no
tag was created, no workflow was dispatched.**

## 1. Pull requests opened and merged in this thread [V]

| Repository | PR | Merged as | What |
| --- | --- | --- | --- |
| munaxa-identity | [#26](https://github.com/munaxa/munaxa-identity/pull/26) | `0b94951357e52aa2644d0b7d9305b5a7f22e7e2d` | D-SSL wrapper, validator, gate verifier, 46 tests, exception file (identity-runtime, identity-migrate; ECR publish workflow only) |
| munaxa-control | [#15](https://github.com/munaxa/munaxa-control/pull/15) | `6269a9c73b6b7ae7965e2b1e8b4cea19fdfd7a22` | Same mechanism (control-api, -migrate, -portal) and the `openssl` CLI removed from the runtime images (file 01 §2.1) |
| munaxa-platform | [#159](https://github.com/munaxa/munaxa-platform/pull/159) | `de78fafc98e15e423856db7d46c6ca91b349f8ae` | `image-exception-guard` module (P-2, E-1, T-1; 13 tests), stack wiring, P-1 CI test, CI lines; 93/93 stack tests |
| munaxa-docs | [#183](https://github.com/munaxa/munaxa-docs/pull/183) | `6f4d77881bb5cd31431a36a733449f8c8eb25a80` | Same mechanism (docs-api, -web, -worker, -migrate and the `munaxa-docs-*` publish names); antivirus image excluded |

## 2. CI evidence on the PRs [V]

| PR | Run | Image jobs |
| --- | --- | --- |
| identity#26 | PR CI green; `main` push run [45033255265](https://github.com/munaxa/munaxa-identity/actions/runs/45033255265) **success** at `0b94951` | runtime and migrate: permanent gate failed on the 10 OpenSSL findings only, exception accepted, `::warning` shown |
| control#15 | first run **refused** (`openssl` CLI findings, not accepted); after the fix run [45033057187](https://github.com/munaxa/munaxa-control/actions/runs/45033057187) **success**; `main` push run [45033745489](https://github.com/munaxa/munaxa-control/actions/runs/45033745489) **success** | api, migrate, portal accepted with the 10 findings only |
| docs#183 | run [45032740193](https://github.com/munaxa/munaxa-docs/actions/runs/45032740193): container images and migration image jobs **success** through the exception; antivirus scanned by the permanent gate alone and passed. The lint job failed once in a browser screenshot step of the visual regression test ("Unable to capture screenshot", unrelated to this diff); re-run once: **success** on the single re-run; all 12 jobs green, then merged | |

## 3. Other open PRs

| PR | State after this thread |
| --- | --- |
| control#14 (operator access optional) | **merged** 22 Nov 14:42 UTC (`e9fb445`) after its branch was updated and CI passed |
| control#12, docs#181 (actions pinned to SHAs) | control#12 **merged** 14:50 UTC; docs#181 **merged** `d1d10af` after branch update and green CI (the D-SSL exception made their image jobs pass; no other change) |
| docs#178 (runbook storage credentials, docs only) | branch updated after docs#181; merged when its CI is green (documentation only) |
| identity#24, control#13, docs#182, work#35 (OpenSSL 3.5.10 bumps) | stay **draft**; they are the permanent fix after 1 Dec |
| identity#19, control#9, work#32 (package token) | untouched, wait on the owner's GitHub Packages Read grant |
| school#29 | untouched, out of scope |

## 4. Image publication preparation (not executed)

Publication is gated three times: the owner creates an `image/<full sha>` tag (Claude cannot create
tags), the `image-release` environment needs the owner's approval, and the publish workflow re-runs
the scan (permanent gate first, then the exception) before every push. Tags pushed: `<short sha>` and
`sha-<full sha>` only; ECR repositories are IMMUTABLE with scan on push (file 02).

| Product | Workflow | Images | Candidate `main` SHA (re-confirmed by Claude at Y-1) |
| --- | --- | --- | --- |
| Identity | `publish-images-ecr.yml` (not the GHCR workflow, which the exception refuses) | `identity-runtime` → `munaxa-identity/api`, `identity-migrate` → `munaxa-identity/migrate` | `0b94951357e52aa2644d0b7d9305b5a7f22e7e2d` |
| Control | `publish-images.yml` | `control-api`, `control-migrate`, `control-portal` | current `main` (includes #14 and #12); exact SHA fixed at Y-1 |
| Docs | `publish-images.yml` | `munaxa-docs-api`, `munaxa-docs-web`, `munaxa-docs-migrate` (D-SSL exception), plus `munaxa-docs-antivirus` (permanent gate only, no exception) | current `main` (includes #183, #181); exact SHA fixed at Y-1 |

Owner steps at Y-1 (per repository, Claude sends the three links with the SHA filled in):

1. Open `https://github.com/munaxa/<repo>/releases/new`.
2. "Choose a tag" → type `image/<full sha>` → "Create new tag on publish"; Target: `main`.
3. Title: the same tag. Tick **Set as a pre-release**. Click **Publish release**.
4. Open the Actions tab; the publish run shows "Waiting"; click **Review deployments** →
   tick `image-release` → **Approve and deploy**.
5. Tell Claude "published <product>". Claude then reads the digests from the run summary and ECR,
   checks the ECR scan shows only the 10 accepted findings, and opens the pin PR with each digest also
   listed in `dssl_testing_only_image_digests`.

Deadline: every publication must finish before **2026-12-01T00:00:00Z**; after that the scan step
fails closed and nothing can be pushed until the 3.5.10 images exist.
