# 11. Next phase recommendation

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

## Where things stand

- Repository preparation for Identity on Platform 2.5.0 in Testing is **complete**.
- Nothing past the preparation boundary has happened: no publication, no image, no AWS change.
- Four steps remain, in this order. Each one unlocks the next; steps 1, 3 and 4 need the owner.

| # | Step | Who | Why it is needed |
| --- | --- | --- | --- |
| 1 | **Publish Platform 2.5.0**: dispatch `release.yml` from `main`, first with `dry_run = true`, then `false`. It publishes the 13 lockstep packages to GitHub Packages; it creates no tag and no release **[V]** (`contents: read`) **[O]** | Owner authorizes; Claude dispatches and verifies | identity#18 cannot pass CI or merge before it |
| 2 | **Finish identity#18**: regenerate the lockfile (01, corrected procedure), compare content digests, green CI, independent review, mark ready, merge | Claude (repository only, standing merge rule), after step 1 | The adoption itself |
| 3 | **Build the Identity image** from the merge commit (munaxa-identity `publish-images-ecr.yml`, ECR push) **[O]** | Owner authorizes; Claude dispatches | Testing runs an image, not source |
| 4 | **Testing** per runbook 03 §2: read-only pre-checks (R), MFA key bundle version (C), one at-rest apply of the config PR that pins the image and includes the docs-migrate delta (D), then the session `up`, observation, verification and `down` (E) **[O]** | Owner authorizes each AWS stage; Claude executes (owner direction of 11 Nov) | The first real check of 0/100, Valkey sidecar and 2.5.0 behaviour |

**Decisions that are not needed until Phase E (production)** **[O]**:
- the production cache token (06): **B** recommended, A' as the fallback;
- one cache node or two (07).

## Recommended next Claude prompt

Use this only if the owner says yes to step 1. It authorizes publication and nothing after it:

> **Munaxa: Platform 2.5.0 publication and Identity 2.5.0 adoption (identity#18)**
>
> I authorize exactly these operational actions, once each:
> 1. Dispatch `release.yml` in munaxa-platform from `main` with `dry_run = true`, and check that it
>    lists exactly the 13 lockstep packages at 2.5.0.
> 2. If it does, dispatch it once more from `main` with `dry_run = false`, to publish those 13 packages
>    to GitHub Packages and nothing else. `@munaxa/licensing` stays at 0.2.0. No tag and no GitHub release.
>
> After publication, without asking me again:
> - verify that the 13 published tarballs match the candidate's content digests (report 01). If any
>   differ, stop and report;
> - finish identity#18 with the corrected lockfile procedure (report 01). Then require green CI and an
>   independent security review of the final head. Then mark it ready and squash-merge it;
> - upgrade nothing else.
>
> Still prohibited: building or publishing Docker images; any Terraform plan or apply against AWS;
> AWS changes; reading or changing secrets; deploys; migrations; DNS or Cloudflare changes. Image build
> and the Testing session (runbook 03) need my separate authorization.
>
> Report in `docs/aws-migration/agent-reports/2026-11-<dd>-platform-2-5-0-publication/` on
> munaxa-platform main, with an index line in `agent-reports/README.md`.

**[R]** After that prompt succeeds, the next one is the image build (step 3), and then the Testing
session (step 4). After the image build come stages R, C, D and E of runbook 03 §2, each with its own
authorization.
