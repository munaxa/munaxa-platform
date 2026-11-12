# Secure GitHub Actions and publish Identity images: executive report

12 November 2026, 19:40 to 21:15 UTC. Owner authorization 19:40 UTC. **Updated 21:15 UTC: images published and verified.**

Tags: **[V]** verified on GitHub or in code, **[I]** inferred from run evidence, **[L]** local check, **[O]** owner action.

## Result: IMAGES PUBLISHED AND VERIFIED. Token hardening merged in platform; three PRs wait on one owner setting

| # | Completion criterion | Status |
| --- | --- | --- |
| 1 | Four-repository package-token audit | **Done** (01) |
| 2 | Hardening PRs merged, or owner-setting blockers documented | **platform#117 merged** (`015a133`). identity#19, work#32 and control#9 are approved but **draft**: they need the package Read grant **[O]** (02) |
| 3 | Image publisher prerequisites verified | **PASS**: GitHub side [V][I]; AWS side live, read-only at 20:43 UTC [V] (03) |
| 4 | Exactly two Identity images published from `5a5994f` | **Done**: [run 43305145232](https://github.com/munaxa/munaxa-identity/actions/runs/43305145232), attempt 1, approved in `image-release` by tam2om. api `sha256:848d33c086ae72f6b478bc605b97e64628dcae00477e751a170847b7ea565c97`, migrate `sha256:df44505d9ec562020c659b47c58289ef88d7533aa7e9ed23d74f237a0d6c3ada` (04) |
| 5 | Digests and provenance verified | **PASS**: the tags resolve to the run's digests, the revision is `5a5994f`, linux/amd64, non-root, no credential found. **Finding:** the ECR scan reports 1 CRITICAL (CVE-2026-4738, `zlib` from the `node:22-alpine` base) in both images, a gate before deployment (05) |
| 6 | MFA requirement intact | **Yes [V]**. The image build needs no MFA key, and none was touched (06) |
| 7 | Testing plan ready for separate authorization | **Done** (06), with a correction to the earlier plan expectation |
| 8 | Independent security review | **Done**: APPROVE all four PRs. The one Low finding in the PRs was fixed (07) |
| 9 | Report committed and indexed | this folder |

## Findings

- **Reviewer finding L2 confirmed [V].**
  - `PLATFORM_PACKAGES_TOKEN` is a repository secret, a non-expiring classic PAT.
  - Any branch pushed to identity, work or control (and docs and school) can run a workflow that reads it.
  - Workflow edits cannot stop this, because the branch author writes the workflow.
- **Fix:** no workflow needs the PAT. CI and image builds use each run's own `GITHUB_TOKEN` with `packages: read` on the one job that installs. Also:
  - read-only default permissions;
  - `persist-credentials: false` on every checkout;
  - every action pinned to a commit SHA.
- **A blocker was found by testing, not assumed [V].**
  - The per-run token gets `403` from GitHub Packages: control#9 image build, `@munaxa/types`.
  - The green host installs were served from the pnpm cache and prove nothing.
  - The owner must add each consuming repository with role **Read** under each package's "Manage Actions access". There is no API for this.
- **Out of scope but serious:** munaxa-docs and munaxa-school still use the PAT (reviewer H1). The PAT must not be revoked until they are changed (09, F-1).
- **Correction to the 12 Nov plan expectation [V].** Pinning the new Identity image adds 3 task-definition replacements but **no IAM change**: the execution policies are scoped to the secret ARN, not to keys. The full expected at-rest delta is 1 create, 1 update and 3 replacements (06 §3).

## Owner actions [O]

Done: the connector sign-in, the tag (created on the release page, because this session may not push tags) and the `image-release` approval.

1. Decide on the zlib CRITICAL before any Testing deployment (09).
2. Approve the `image-release` environment for future image runs, as before.
3. Grant Read on the `@munaxa` packages (the list is in 02).
4. After the merges and the publication: delete the repository secret in identity, work and control.
5. Later: revoke the PAT (after F-1).

## Not done (prohibited or not reached), confirmed

None of the following happened:
- a Terraform plan against a backend, an apply or a destroy;
- an AWS resource change other than the authorized push of the two images. Every AWS call by Claude was read-only;
- an IAM change, or an AWS secret read, created, changed or rotated;
- an MFA key generated or accessed;
- an ECS change, task run, migration, session start or deployment;
- a DNS or Cloudflare change;
- a production change;
- any image other than the two authorized ones, or a second publication run;
- an `image/*` tag created by Claude (the owner created it);
- a change to Work, Control, School or Docs application code;
- a GitHub secret or credential rotated, read or created;
- an environment approval by Claude.
