# PR and branch cleanup across the seven Munaxa repositories

- Date: 9 Nov 2026, observations 12:50 to 13:20 UTC
- Thread: "Clean up unmerged PRs and stale branches"
- Requested by: Tamer ("if there is any unmerged PRs do the needful like merge or close, also clean the branches if there is no need for them, should keep only the main branch if we dont need the others")
- Scope: munaxa, munaxa-platform, munaxa-identity, munaxa-control, munaxa-work, munaxa-docs, munaxa-school. No AWS, Cloudflare, secrets, rulesets, settings or tags touched. CanteenHub not touched.

## 1. Result

| Item | Result |
| --- | --- |
| Open PRs found | 1 (platform#67). No other repository had an open PR. |
| platform#67 | **Squash-merged** as `4a61f77` (head `88cba38` pinned at merge). Docs only, all checks green, `mergeable_state` clean, merging does not deploy or migrate. Eligible under the owner's standing merge rule of 30 Oct. |
| PRs closed | None needed. |
| Branches examined | 203 non-`main` branches (snapshot 13:05 UTC, after the #67 merge) |
| To delete | **196**, each with a reason in `supporting/branch-disposition.tsv` |
| Kept for an owner decision | **7** branches holding unmerged work with no PR (section 4) |
| `main` | Kept in all seven repositories |
| Branches actually deleted by this thread | **0**. The session's git proxy refuses branch deletes (same restriction recorded on 30 Oct). The owner deletes them with the prepared script (section 5). |

## 2. Method

1. All repositories fully unshallowed (the session clones were shallow, which first made 30+ merged branches look unmerged; every result below is from full history).
2. Every PR in each repository listed (all states, paginated).
3. Each branch classified, in this order:
   - **Fully merged**: tip is an ancestor of `main`.
   - **Squash-merged**: a merged PR has exactly this branch tip as its head SHA, so nothing was pushed after the merge.
   - **All changes already in main**: `git merge-tree` of `main` and the branch yields `main`'s tree unchanged.
   - **Patch-identical**: `git cherry` finds every commit already on `main`.
   - **Closed as superseded**: the PR was closed with a "superseded" comment and its head equals the branch tip. GitHub keeps those commits under `refs/pull/<n>/head`, so deleting the branch loses nothing.
   - **Contained**: every commit is inside another branch that is being kept.
   - Anything else is **unique work** and is kept.
4. Active work protected: the Config A1 thread (started 12:46 UTC) had pushed no branch at snapshot time, and the delete script is guarded (section 5) so any branch that moves after the snapshot is skipped automatically. This thread's own branch `claude/project-thread-glr7yg` is not in the delete list; it is cleaned up after this report's PR merges.

## 3. Disposition summary

| Repository | Delete | Keep (owner decision) | Kept `main` |
| --- | ---: | ---: | --- |
| munaxa | 24 | 1 | yes |
| munaxa-platform | 28 | 0 | yes |
| munaxa-identity | 12 | 1 | yes |
| munaxa-control | 7 | 0 | yes |
| munaxa-work | 10 | 1 | yes |
| munaxa-docs | 97 | 3 | yes |
| munaxa-school | 18 | 1 | yes |
| **Total** | **196** | **7** | |

Reasons across the 196: squash-merged at the exact tip 129; fully merged 33; all changes already in `main` 5; patch-identical 1 (`munaxa-docs` `claude/docs-control-plane-licensing-tf`, the stray branch noted on 30 Oct); PR closed as superseded 4 (docs #131, #134, #153, #155); contained in a kept branch 24 (16 in munaxa, 7 in identity, 1 in docs).

Every branch, with full tip SHA, last commit date, commits ahead of `main`, disposition, reason and PRs: `supporting/branch-disposition.tsv`.

## 4. Kept: unmerged work with no PR (owner decision)

These hold commits that are not on `main` and have no PR, so deleting them would lose work. They look superseded, but that is the owner's call.

| Repository | Branch | Tip | Last commit | Ahead | What it is |
| --- | --- | --- | --- | ---: | --- |
| munaxa | `claude/nonprod-provenance-investigation` | `612588c` | 2026-10-07 | 19 | ADR-0003 (dedicated nonprod account) and Identity Center provisioning records. Superseded in practice by the shared single-account plan and the 8 Nov root access decision; ADR-0003 is not on `main`. Holds the 16 stacked branches deleted above. |
| munaxa-identity | `claude/aws-nonprod-dns-decision` | `da4f531` | 2026-10-06 | 8 | 6 Oct nonprod account/DNS/network decisions plus early ECR publish, migration runner, proxy-trust code. `main` got different implementations in identity#1 and #2 (30 Oct). Holds the 7 stacked branches deleted above. |
| munaxa-work | `claude/munaxa-product-readiness-audit-8mr34d` | `b608790` | 2026-08-31 | 11 | Product Slice #9 and security foundation docs, pushed after PR #19 merged and never PR'd. |
| munaxa-docs | `claude/amazing-turing-09vlks` | `03af11c` | 2026-10-20 | 89 | Hetzner TEST environment work (Hetzner later dropped for AWS). Holds `claude/hetzner-docs-foundation`. |
| munaxa-docs | `claude/smk1-smoke-evidence` | `8cf4572` | 2026-10-24 | 10 | Smoke evidence run, marked "not for merge" in its own commit. |
| munaxa-docs | `claude/zealous-cori-v2b9l4` | `a3e3da4` | 2026-11-07 | 10 | Marketing images and reel videos, newest 7 Nov. Most likely still wanted. |
| munaxa-school | `claude/school-auth-security-review-11ssy8` | `8a5b1d4` | 2026-08-06 | 1 | `docs/AUTH-SECURITY-HANDOVER.md` for external review. |

## 5. Owner action: run the delete script

The session cannot delete branches, so two equivalent scripts are provided:

- Windows PowerShell: `supporting/delete-branches.ps1`
- bash / Git Bash: `supporting/delete-branches.sh`

They need only `git` and the owner's normal GitHub sign-in, and work from any folder (they create a temporary empty repository). Each delete carries `--force-with-lease=refs/heads/<branch>:<tip recorded on 9 Nov>`, so if anyone (for example the Config A1 thread) has pushed to a listed branch since the snapshot, git rejects that one delete with `stale info` and leaves the branch in place. The guard was tested against a local bare repository: the matching branch was deleted and the moved one was rejected. The 7 kept branches, `main` and any branch created after the snapshot are not in the scripts.

## 6. Not changed

No rulesets, repository settings, tags, environments, variables, secrets, AWS, Cloudflare or deploys. No PR was closed. No force-push.

## 7. Closing note (9 Nov 2026, 13:33 UTC)

- The owner ran `delete-branches.ps1` at about 13:25 UTC. It deleted everything listed in munaxa-identity, -control, -work, -docs and -school, but nothing in munaxa or munaxa-platform (no tip had moved and no ruleset blocks it; most likely a GitHub sign-in failure on the first two pushes). `delete-branches-remaining.ps1` then removed those 52 plus `claude/project-thread-glr7yg`. All 196 listed branches are gone, verified via the GitHub API at 13:30 UTC.
- Owner decision (13:31 UTC, decision card): delete 6 of the 7 kept branches and keep `munaxa-docs` `claude/zealous-cori-v2b9l4` (marketing images and reel videos). `delete-branches-final-6.ps1` removed them; verified at 13:33 UTC. Their tips are in `supporting/branch-disposition.tsv`.
- Final state (13:42 UTC): every repository has only `main`, except munaxa-docs (`claude/zealous-cori-v2b9l4`, kept by the owner). munaxa-platform's Config A1 branch `claude/project-thread-qdcu86` is gone since PR #69 merged. The first closing-note PR (#70) was closed by the owner with its branch deleted; this note was re-opened as a new PR because reports must be on `main`. Its branch `claude/project-thread-glr7yg` is the only other branch, to delete after it merges.
