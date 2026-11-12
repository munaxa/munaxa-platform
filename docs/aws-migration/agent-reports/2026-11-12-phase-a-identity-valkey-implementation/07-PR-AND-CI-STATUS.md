# 07. PR and CI status

All merges were squash merges (munaxa-platform allows squash only). The owner's instruction was
"Merge when finish": each PR was merged only after CI was green on its final head and the round 3
reviewer had approved that head. The order kept the old release workflow from ever running
alongside 2.5.0 versions on main.

| Order | PR | Branch | Approved head | Merged as | CI on final head |
| --- | --- | --- | --- | --- | --- |
| 1 | [munaxa-identity#17](https://github.com/munaxa/munaxa-identity/pull/17) | `claude/phase-a-identity-cache-connection` | `cfb0e29378418dd4a753ce16facf74448c7a44a1` | `25823b1b51de11f903b74764afba0fdf2d6a92b9` | verify: success |
| 2 | [munaxa-platform#110](https://github.com/munaxa/munaxa-platform/pull/110) | `claude/phase-a-identity-valkey-terraform` | `1ee378aaf4b978e58f06ed4952f3a3cb5678a062` | `d9e7f9ded8c13d63fd752b8b79bb10d14f99b504` | Format, validate, mocked plan tests; Lint, Typecheck, Test, Build; Façades; Accessibility: success (Plan and Apply are dispatch-only, so they were skipped) |
| 3 | [munaxa-platform#111](https://github.com/munaxa/munaxa-platform/pull/111) | `claude/phase-b-release-workflow` | `e5116b0f8e6ab229de006cfdfa586d7a3319f4a2` (then main merged in as `0b1794472f9f77407a29e444d005a67efa40f94a`, see below) | `be7f12beb8a6e2b20b1bac806d87e6a599bdcf12` | all success on both heads |
| 4 | [munaxa-platform#112](https://github.com/munaxa/munaxa-platform/pull/112) | `claude/phase-b-platform-2-5-0` | `98a51ab81d087df9f11aabf7b5777a29f793ebbb` (then main merged in as `5401507ee2b7358e76a4a1b90c21e16eb0a37f47`) | `2bf78accdec843c22467f49a41627b58c7f64713` | all success |
| 5 | this report | `claude/phase-a-identity-valkey-report` | — | see the index | — |

## Updating a branch with main after approval

The repository requires a branch to be up to date before it merges, so the approved heads of #111 and
#112 had main merged into them through GitHub's "update branch". **[V]** In both cases the PR's
diff against main stayed exactly what the reviewer approved: 5 files for #111 and 28 for #112. The
round 3 reviewer said in advance that merging #110 and #111 into #112 does not change its verdict.

After #111 merged, the release list on #112's merged head gives 13 packages at 2.5.0. The 19 release
tests pass there too **[L]**.

## Merging published nothing

**[V]** `release.yml` on main is `workflow_dispatch` only. No workflow in munaxa-platform runs on a push to
main and publishes, tags or creates a release: `ci.yml` runs on pull_request and push and holds no
write permission, `aws-terraform.yml` runs on pull_request and dispatch, and `aws-session.yml` runs on
dispatch and a schedule. No workflow was dispatched in this task.

## Branches and PR split

The owner asked for separate PRs for A1, A2, B1 and B2. **A1 and A2 went out as one PR, #110.** The
Identity cache in A2 depends on A1's module inputs: `extra_security_group_ids` attaches the
cache-client group, and `single_task_store` is the rule that rules out a sidecar in production. A1
alone would also have shipped the 0/100 rule with no store rule to go with it. The two halves are
still separable in review: A1 is `infra/aws/modules/service` plus the Identity block in
`stack/services.tf`; A2 to A4 are `stack/identity-cache.tf`, `stack/variables.tf`, `stack/data.tf`
and `modules/secret-key-ephemeral`. A5 (identity#17), B1 (#111) and B2 (#112) each have their own PR.

Each PR was on its own branch. The `claude/project-thread-rcgclr` branch named in the session settings was not used.
