# GitHub release controls: owner verification checklist (8 Nov 2026)

**Status: NOT VERIFIED.** GitHub environments, environment protection rules, Actions variables,
secrets and rulesets are not readable from Claude's sessions (no API for them here; earlier phases
got 403). Only the owner can check them. **Change nothing while checking:** no settings, secrets,
variables, rulesets or tags; do not push tags or run image workflows.

## 1. What Claude verified from GitHub (8 Nov 2026, 06:33 UTC)

| Check | identity | control | work |
|---|---|---|---|
| `image/*` tags (any tag) | 0 tags | 0 tags | 0 tags |
| `main` head | `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (5 Nov) | `a24c5681f0ca98f446098444c79bc36cd4d9bc0c` (30 Oct) | `b490b25792c4d35e5b489790508b2ae6489080cc` (5 Nov) |
| Newest workflow run | CI 41992700652, 5 Nov 08:12, success (on `5277d71`) | OIDC probe 41168353163, 31 Oct; CI 41122329528, 30 Oct, success (on `a24c568`) | CI 41983857218, 5 Nov, success (PR head `3ec54b5`) |
| ECR publish runs ever | none | none | none |

Unchanged since the 7 Nov report: the release SHAs above are still the candidates.

## 2. Checks for the owner, in each of munaxa-identity, munaxa-control, munaxa-work

| # | Where | Check | Expected | identity | control | work |
|---|---|---|---|---|---|---|
| G-1 | Settings → Environments | Environment named exactly `image-release` exists | Present | ☐ | ☐ | ☐ |
| G-2 | `image-release` → Deployment protection rules | "Required reviewers" ticked; who is listed | At least one reviewer | ☐ | ☐ | ☐ |
| G-3 | Same | "Prevent self-review" ticked or not | Report as is (see §3) | ☐ | ☐ | ☐ |
| G-4 | Same | "Allow administrators to bypass configured protection rules" | **Off** | ☐ | ☐ | ☐ |
| G-5 | `image-release` → Deployment branches and tags | Setting and rules | "Selected branches and tags", one **tag** rule `image/*`, no branch rule | ☐ | ☐ | ☐ |
| G-6 | `image-release` → Environment secrets and variables | Anything defined | Nothing (a value here overrides the repository one) | ☐ | ☐ | ☐ |
| G-7 | Settings → Secrets and variables → Actions → Variables | `AWS_IMAGE_PUBLISHER_ROLE_ARN` value (an ARN, not a secret) | identity `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`; control `…/munaxa-control-image-publisher`; work `…/munaxa-work-image-publisher` | ☐ | ☐ | ☐ |
| G-8 | Same page → Secrets | `PLATFORM_PACKAGES_TOKEN` listed and its "Updated" date. **Never open, copy or paste the value** | Listed (identity, work; control optional, falls back to `GITHUB_TOKEN`) | ☐ | ☐ | ☐ |
| G-9 | Token owner's GitHub → Settings → Developer settings → Personal access tokens | Expiry and `read:packages` for the munaxa organization (metadata only) | Not expired; `read:packages` | ☐ | ☐ | ☐ |
| G-10 | Settings → Rules → Rulesets | Tag ruleset on `refs/tags/image/*`: Active; restrict creations, updates, deletions; bypass list | Active; only the owner (or nobody) creates `image/*` tags | ☐ | ☐ | ☐ |
| G-11 | Settings → Rules → Rulesets | `main` branch ruleset requiring PRs and CI | Present | ☐ | ☐ | ☐ |

Screenshots of these pages are fine to share: none shows a secret value.

## 3. Token validity and self-review

- **Identity:** a green CI run proves `PLATFORM_PACKAGES_TOKEN` works (no fallback). Latest proof: CI 41992700652 on 5 Nov. A fresher proof needs a new CI run (for example the next identity PR); never dispatch a publish to test it.
- **Work:** CI falls back to `GITHUB_TOKEN`, so CI cannot prove the token. Rely on G-8 and G-9.
- **Control:** falls back to `GITHUB_TOKEN`; the token is needed only if the platform packages are not granted to the control repository.
- **Self-review (unchanged from 7 Nov §6.3):** with "Prevent self-review" off, the person who pushes the tag can approve the publish, so one person controls both steps. Prefer a second authorized reviewer. Otherwise allowing self-review needs the owner's explicit acceptance of this risk, recorded in the thread and limited to non-production Testing. With it on and the owner as the only reviewer, the publish waits forever (safe, but blocks publication).

## 4. How to report back

Reply in the thread with one line per row, for example `identity G-1 yes, G-2 tam2om, G-3 on, …`,
or screenshots. Claude records the results in the next report and updates conditions C-1 to C-5 and
C-8.
