# Platform 2.5.0 publication and Identity adoption: executive report

12 November 2026, 18:55 to about 19:30 UTC.

Tags: **[V]** verified on GitHub or in the registry, **[W]** actual workflow result, **[L]** local test result,
**[I]** package integrity evidence, **[O]** owner decision required.

## Result: COMPLETE

Every completion criterion of the owner's 12 Nov 18:55 UTC authorization is met.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Platform 2.5.0 dry run passes | **Done** [W] | [run 43285216277](https://github.com/munaxa/munaxa-platform/actions/runs/43285216277), 02 |
| 2 | Exactly 13 approved packages published | **Done** [W][V] | [run 43285585963](https://github.com/munaxa/munaxa-platform/actions/runs/43285585963), 03 |
| 3 | Published contents match the reviewed candidate | **Done** [I] | 13/13 content digests, 04 |
| 4 | Identity #18 has a clean registry-based lockfile | **Done** [V] | 0 `127.0.0.1`, 12 entries only, 05 |
| 5 | Identity CI green | **Done** [W] | PR head run 43286790685, main run 43287805158 on the merge commit, 06 |
| 6 | Independent security review approves the final head | **Done** | APPROVE `4aabdf7`, no Critical/High/Medium, 06 |
| 7 | Identity #18 merged | **Done** [V] | squash `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`, 07 |
| 8 | Report committed and indexed | **Done** | this folder and the index line |

## What happened, in order

1. **Pre-release checks passed [V][L].**
   - Platform main `ee9015f` contains #111, #112, #114 and #115.
   - `release.yml` is byte-identical to #111. It runs on `workflow_dispatch` only. The dry-run job has `contents: read` only. The publish job has `packages: write` and both main-only guards.
   - Exactly 13 packages are at 2.5.0, with 2.5.0 changelogs. `@munaxa/licensing` is at 0.2.0.
2. **Dry run passed [W]**, run 43285216277. Build, tests and `release:check` passed. 13 packages were packed at 2.5.0. The publish job was skipped and nothing was published.
3. **Publication [W][V]**, run 43285585963, 19:00 to 19:01 UTC.
   - The log shows exactly 13 `+ @munaxa/<name>@2.5.0` lines.
   - The registry lists each of the 13 at 2.5.0, with `latest` set to 2.5.0.
   - `@munaxa/licensing` is still `0.1.0, 0.2.0`.
   - No tag and no GitHub Release exist on munaxa-platform. No image was built.
4. **Integrity [I].** The 13 tarballs were downloaded from GitHub Packages. Their content digests are identical to the reviewed candidate, and each one's bytes match the registry's `dist.integrity`.
5. **Identity #18 [V][W][L].**
   - The lockfile was regenerated with the reviewed procedure. Only the 12 `@munaxa` entries changed.
   - CI is green, and a local run against the published bytes also passed: 59/59 config tests and 292/292 integration tests, none skipped.
   - The independent review approved the head. The PR was marked ready and squash-merged as `5a5994f`.

## One deviation, disclosed

This session has no `read:packages` token for `npm.pkg.github.com`: the registry answers 401, and artifact downloads are blocked. So the registry-dependent steps ran in GitHub Actions, in a **temporary workflow on the #18 branch**. It used `packages: read`, the same `PLATFORM_PACKAGES_TOKEN` Identity CI uses, and no write permission. It printed the lockfile diff and the 13 tarballs (base64, each with a SHA-256) to its log.

That workflow was deleted in the final commit. The squash merge keeps it out of main. The reviewer confirmed the token was never printed. Details are in 05 and 06.

## Not done (not authorized)

Nothing in AWS, Terraform, IAM, secrets, ECR, ECS, DNS or Cloudflare was touched. No Docker image, tag or release was made, and nothing was deployed or migrated. Work, Control, School and Docs were not changed.

## Owner decisions [O]

- **Next authorization (recommended, 08):** build and publish the Identity API and migration images from `5a5994f`.
- **Optional:** delete the logs of temporary run 43286188504, which hold copies of the 13 restricted tarballs (reviewer I1). They are builds of public source, so nothing secret is in them.
- **Recommended hardening (reviewer L2, pre-existing):** anyone who can push a branch can run a workflow with `PLATFORM_PACKAGES_TOKEN`. Move it into a protected environment limited to main.
