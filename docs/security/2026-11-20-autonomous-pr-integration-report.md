# Autonomous PR integration, 20 Nov 2026

Owner authorization: 20 Nov 2026, 23:03 UTC ("Munaxa: Autonomous PR Integration and Merge Execution").
This was standing authorization to merge eligible repository PRs. It covers repository merges only.
The technical detail behind each change is in
[`2026-11-20-security-remediation-and-testing-readiness.md`](2026-11-20-security-remediation-and-testing-readiness.md)
and [`2026-11-20-cross-repository-vulnerability-remediation.md`](2026-11-20-cross-repository-vulnerability-remediation.md).

## 1. Executive summary

- **Merged:** all six product and platform security PRs, by squash, each on a head whose required
  checks were green on that exact SHA.
- **This PR (#147)** carries this report. It is merged last, after its own checks pass.
- **Main CI:** every main branch that runs CI on push finished green after the merges. School runs CI
  on pull requests only, so its merge was checked on the PR head.
- **Not done:** no image was published, nothing was deployed, applied or migrated, and no secret was
  touched.

## 2. PRs inspected (live state at 23:00 to 23:25 UTC)

**The seven PRs:** identity#21, control#11, work#33, school#26, docs#180, platform#146 and
platform#147.

**What was checked for each:** head SHA, base (main), mergeable state, draft flag, required checks
from the repository ruleset, reviews, and that its diff holds only the intended security change.
- No PR had a review comment or unresolved thread.
- No ruleset requires an approving review (`required_approving_review_count` 0).
- School has no ruleset at all.

**Other open PRs:**
- control#10 and docs#179 are superseded: their commits are inside control#11 and docs#180.
- identity#19, work#32 and control#9 are package-token drafts from 12 Nov. They are unrelated and were
  left alone.
- No newer PR supersedes any of the seven.

**Side effects of a merge.** Every workflow triggered by a push to main was read. They are only CI:

- identity, control, work, docs and platform run `ci.yml`; School has no push trigger.
- Image publishing runs only on an `image/**` tag or a manual dispatch.
- platform `aws-terraform.yml` runs on pull requests and dispatch only.

So no merge could publish, deploy or apply anything.

## 3. PRs merged

| Order | PR | Final head (checks green on it) | Merge commit | Main CI after merge |
| --- | --- | --- | --- | --- |
| 1 | [identity#21](https://github.com/munaxa/munaxa-identity/pull/21) | `c29ccaa` (run 44833377176) | `7615589` | success (2/2) |
| 2 | [control#11](https://github.com/munaxa/munaxa-control/pull/11) | `d491fc3` (run 44832974072) | `7b607e0` | success (2/2) |
| 3 | [work#33](https://github.com/munaxa/munaxa-work/pull/33) | `a35cc5c` (run 44833371774) | `a93c642` | success (5/5) |
| 4 | [school#26](https://github.com/munaxa/munaxa-school/pull/26) | `cc48717` (run 44833366558) | `0011680` | no CI on push (PR-only workflow); PR head green |
| 5 | [docs#180](https://github.com/munaxa/munaxa-docs/pull/180) | `6dad33f` (runs 44832946855, 44832951843) | `f1fca8f` | success (12/12) |
| 6 | [platform#146](https://github.com/munaxa/munaxa-platform/pull/146) | `f8b3b25` | `9e3721e` | success (3/3) |
| 7 | platform#147 (this report) | after its checks pass | recorded in the project thread | — |

**Method.** Squash, the method this project has always used. Each merge was pinned to the expected
head SHA, so a later push would have made it fail.

**Branches.** None were deleted. The repositories do not auto-delete merged branches, and the
claude/* branches are cleaned up by the owner's script (report 2026-11-09).

**Draft PR.** docs#180 was marked ready for review first: implementation complete, all checks green.

**Content checked on main after the merges:**
- Identity and Control: `libssl3=3.5.9-r1`.
- Work and School: `zlib=1.4-r0`.
- Docs: `FROM runtime AS worker` and no Debian stage.
- Platform: 10 withdrawn digests.
- `next@15.5.29` in the four Next.js lockfiles.

## 4. PRs not merged

| PR | Reason |
| --- | --- |
| [control#10](https://github.com/munaxa/munaxa-control/pull/10) | Superseded by #11, which contains both of its commits. Merging it now would re-add the Debian base. Left open: closing it is an owner action (O-2). |
| [docs#179](https://github.com/munaxa/munaxa-docs/pull/179) | Superseded by #180, which contains all of its commits. Left open (O-2). |
| identity#19, work#32, control#9 | Not part of this sequence: package-token drafts that need a package Read grant (12 Nov). |

## 5. CI before and after

| Repository | Before (head, result) | After merge (main) |
| --- | --- | --- |
| Identity | `b2bb8f7` green; `c29ccaa` green | `7615589` green |
| Control | `d5c5fe3` green; `d491fc3` green | `7b607e0` green |
| Work | `62b72c5` green; `a35cc5c` green | `a93c642` green |
| School | `f6844bf` green; `cc48717` green | no push CI |
| Docs | `9921b90` red: Docker Hub 429 in 8 jobs, twice | `6dad33f` green in both runs (one visual-test screenshot error passed on its single re-run); `f1fca8f` green |
| Platform | `f8b3b25` green; #147 `359058c` one timing-test failure, passed on re-run | `9e3721e` green |

**Infrastructure failures, not code.** Two failures came from the CI environment, not from the
changes:

- a browser screenshot protocol error, while the same job passed in the parallel run on the same
  commit;
- a microsecond timing assertion on a docs-only commit.

Each was re-run once and passed. The Docker Hub 429 was fixed in code (mirror.gcr.io), not retried
around.

## 6. Security findings and remaining risks

**Fixed on main** (all **BUILD VERIFIED — REGISTRY SCAN PENDING**; none is REGISTRY VERIFIED,
because nothing was published):

- zlib CVE-2026-4738;
- OpenSSL 3.5.9-r0 (4 HIGH);
- npm and pnpm tooling findings;
- Control's Debian findings;
- the Docs Debian glibc CRITICAL and HIGH findings, now on all four Docs Node images including the
  worker;
- Next.js 15.5.28;
- the effect advisory: **FIXED AND VERIFIED** (`pnpm audit`).

**Remaining:**

- **The current Identity Testing pin `9a8c6ebd` / `5f3bdcce`.** It very likely carries the OpenSSL
  HIGH findings. Republishing from `7615589` and re-pinning (D-I1) would fix it.
- **The 10 withdrawn digests** stay in ECR. They are refused by Terraform from `9e3721e`.
- **MEDIUM and LOW findings without a fix** (busybox and others), as listed in the readiness report,
  section 8.

## 7. Dependency and integration issues

- **#147 against main after #146 merged.** `docs/aws-migration/agent-reports/README.md` conflicted:
  two new index rows in the same place. It was resolved by merging main into the report branch and
  keeping both rows (`ec2062c`). There was no force-push and no rewrite.
- **No other PR depended on another.** The product PRs touch separate repositories.
- **School main has no ruleset and no push CI.** Recommendation O-8 (owner setting).

## 8. Owner-only actions still required

| Id | Action | Exact instruction |
| --- | --- | --- |
| O-2 | Close control#10 and docs#179 as superseded | on each PR: "Close pull request" (they are fully contained in #11 and #180) |
| O-3 | Reconnect the AWS connector | claude.ai → Settings → Connectors → AWS MCP → sign in. The RDS rotation checks (Stage E P-1) wait on it |
| D-I1 | Republish Identity before Stage E (recommended yes) | push tag `image/7615589…` (full 40-hex SHA of identity main) and approve the `image-release` environment; then Claude prepares the pin PR |
| O-5 | Publish Control, Work, School and Docs | per product, after D-I1: `image/<sha>` tag (School: Actions → Publish images to ECR → Run workflow on main) and approve `image-release` |
| O-8 | School ruleset on `main` | Settings → Rules → Rulesets → New branch ruleset: require a PR and the checks "Lint · Typecheck · Test · Build (JS/TS)" and "Images (api, migrate, admin)" |
| A-1 | Identity Stage E | after P-1 passes and D-I1 is decided, in the 13:00 to 18:30 Amman window |

## 9. Operations not performed

Confirmed for this task:

- no Terraform apply, live plan, import or state change;
- no AWS resource created, changed or deleted, and no AWS write call;
- no ECR or GHCR publication, and no release workflow run or image tag pushed;
- no deployment or service start;
- no RDS start, stop or modification;
- no Secrets Manager read or write, no rotation, no label change;
- no Stage E and no C-1/C-2;
- no live migration;
- no Cloudflare, DNS or email change;
- no GitHub permission, branch-protection, ruleset or secret change.

The only AWS interaction was one read-only call, which the connector refused (signed out) before it
reached AWS.

## 10. Recommended next execution task

**"Identity republish and Stage E preparation."**

1. After O-3: verify the RDS rotation (P-1).
2. On the owner's D-I1 yes, publish Identity from `7615589`, and check that the Grype and ECR scans of
   the exact digests are both clean.
3. Open the pin PR. It updates `nonprod.tfvars`, `nonprod.stage-e-tasks.json` and the E-1 fixtures,
   and withdraws `9a8c6ebd` and `5f3bdcce`. Run the offline tests.
4. Prepare the nonprod plan for the owner. Stage E then follows in the agreed window.
