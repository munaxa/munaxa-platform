# Identity Stage A: preparation PR merges (11 Nov 2026)

**Result: Stage A COMPLETE.** All five remaining preparation PRs were squash-merged into
`munaxa/munaxa-platform` `main` in the required order. #87, #88 and #89 are closed and were not
merged. No AWS, Terraform, dispatch, secret, IAM, DNS, Cloudflare or production action took place.

Owner authorization: Tamer's message of 11 Nov 2026 11:54 UTC (merge #90, #92, #93, #95, #94
autonomously, squash, in that order, then close #87/#88/#89; repository only).

Two agents did the work: a reconciliation agent (the deployment thread) and a merge operator (this report).

## 1. Starting point

- #91 was **already merged** before this work began: squash `dd333c588d42c08e79bc1095731689dae845c061`, merged by
  `tam2om` at 11:49:32 UTC. GitHub shows `merged: true`. [V]
- The reconciliation agent confirmed at 11:55 UTC that the heads below were ready and that it **made no corrections**.
  It squashed all five locally onto `dd333c5` with no conflicts and ran the node tests: 72/72 passed.
  The probe SHA-256 is `f7a15787362d2382d88f896192d169082c44020e5c6ac22831dce9a05e466b79`. The literal operator
  email appeared 0 times in the result and in no PR body.
  It also checked these invariants:
  - cleanup revision 2 is intact (parallel branches, ALB independent of RDS, TimeoutSeconds 900, bounded RDS retries,
    alarm and SNS, no guaranteed ceiling);
  - the persistent secret is never force-deleted (the only forced delete is C-16, and it targets the bootstrap secret by exact name);
  - the probe is disabled by default (`identity_probe_source.commit` is empty), has no task role, and gets only the
    `IDENTITY_OWNER_*` secrets, never `DIRECT_DATABASE_URL`.

## 2. Merges

Branch protection requires branches to be up to date: GitHub reported #92 as `behind` after #90 merged.
So before each of #92, #93, #95 and #94, the merge operator ran GitHub's **update branch**, using the
reconciled head as the expected SHA. That added only a `Merge branch 'main'` commit, and there were no conflicts.
The operator then waited for every check on the **new** head and merged with that exact head as the lease
(`expectedHeadSha`). Before each merge, the PR was open, not a draft, based on `main`, `mergeable_state: clean`,
and had no reviews or review requests.

| Order | PR | Reconciled head | Head merged (lease) | Squash commit on `main` | Merged (UTC) |
| --- | --- | --- | --- | --- | --- |
| 1 | #90 cleanup design rev 2 | `f4c1cbded2947118f30eef8e6e8f4a1f007e0a31` | `f4c1cbded2947118f30eef8e6e8f4a1f007e0a31` (no update needed) | `24ef3572ef202d32ba379f65df945b7b60136852` | 12:03 |
| 2 | #92 probe task definition | `4c632ab9c8bbbd56389c76433d322419e0610b5f` | `45e56bd2ebc3c3a09a5f64a94396d13ba431ed95` | `7450a49ca8d1083bd015bb1997c6cb6719ba4d42` | ~12:18 |
| 3 | #93 session probe | `81805374fa15fca5c4a190132175ee841ede5851` | `8e45203477a94464b29185289eab46120410b163` | `d0c0db1ffe9f4ea10ad7d0604eb2fd74e0a50f1e` | ~12:33 |
| 4 | #95 approval package | `7522d5eea3d8d90ea7540f6c7b6a7298415c4334` | `bf665cf1364becf73d5868df8d63e0ef9631e724` | `fc4d77397f3a3322a1df11981500e7acf58822e3` | ~12:47 |
| 5 | #94 runbook + consolidation | `f9886632818d8b05938e89bbf49e7bfe50e05be9` | `caaed0a2fd29cc555c772ae791d756cd19a632ac` | `4633b87fe9c2a8994e9e4f4530b804442da16934` | ~13:02 |

GitHub returned `merged: true` for every merge call. The commit history of `main` after the run, newest first, is
`4633b87`, `fc4d773`, `d0c0db1`, `7450a49`, `24ef357`, `dd333c5`. [V]

**Final `main`: `4633b87fe9c2a8994e9e4f4530b804442da16934`.**

## 3. Checks on each merged head

Each head ran two workflows: the CI workflow (lint, accessibility, façades) and the AWS Terraform workflow
(static job; its Plan and Apply jobs exist only for manual dispatch and are **skipped** on pull requests).
All of them completed before the merge. [V]

| PR | Head | CI run: Lint/Typecheck/Test/Build, Accessibility, Façades | AWS Terraform run: Format, validate, mocked plan tests | Plan / Apply |
| --- | --- | --- | --- | --- |
| #90 | `f4c1cbd` | 43015224873: success, success (12:00:33), success | 43015224874: success | skipped |
| #92 | `45e56bd` | 43017044297: success, success (12:17:49), success | 43017044271: success | skipped |
| #93 | `8e45203` | 43019161581: success, success (12:33:20), success | 43019161573: success | skipped |
| #95 | `bf665cf` | 43021410062: success, success (12:45:41), success | 43021410068: success | skipped |
| #94 | `caaed0a` | 43023492297: success, success (13:02:15), success | 43023492251: success | skipped |

No check failed or was re-run. Skipped Plan/Apply is the expected result on a PR, because those jobs run only
when someone dispatches them. Nothing was dispatched.

## 4. Repository changes and conflicts

- The reconciliation agent made no corrections.
- The merge operator's only branch writes were the four GitHub update-branch merges listed above.
  They caused no conflicts and no force-push, and no file content was edited.

## 5. Superseded PRs

After #94 merged, each of #87, #88 and #89 got a comment saying its content was consolidated into #94
(`4633b87`), and was then closed. None was merged, and no branch history was rewritten. [V]

| PR | State | Merged | Closed at (UTC) |
| --- | --- | --- | --- |
| #87 | closed | no | 12:47:58 |
| #88 | closed | no | 13:02:52 |
| #89 | closed | no | 13:02:54 |

**Deviation:** GitHub records #87 as closed at 12:47:58 UTC. That is **before** #94 merged, and before the merge
operator's close call, which arrived after it was already closed. The merge operator did not close it at
12:47, so another session or the owner did. #87 was never merged, so the outcome is unchanged.

## 6. Scope confirmation

- No AWS call of any kind from this thread: no CLI, connector, CloudShell, Terraform plan or apply, ECS task or secret.
- No workflow dispatch, IAM, KMS, network, DNS, Cloudflare, production or GitHub settings change.
- No merge outside #90, #92, #93, #95 and #94. In particular, this thread made **no** call to `munaxa-identity`.
- The operator email is not printed in this report.

## 7. What remains (each needs its own owner authorization)

- **Stage B:** build the independent cleanup from #90 revision 2. That is a stack Terraform PR (7 creates, 1 update),
  a bootstrap boundary change (2 updates, root apply) and the email subscription, followed by gate H-20.
  Merging #90 approved only the proposal.
- **Stage C:** an enable PR pinning `identity_probe_source` to the probe commit on `main` (probe file from `d0c0db1`,
  SHA-256 `f7a15787…6b79`), and its plan and apply of exactly 1 create.
- **Stage D:** the session itself: Option A secret operations with the email from the private runtime input only,
  `up`, bootstrap, probe, shutdown and cleanup proof.
- Still open from #95 section 12: three historical commits (b9bc718, d8f061e, c1a9811) still contain the
  address. Squash merging kept them out of `main`'s history, but they remain on the source branches.
  Removing them would need an owner decision (deleting the branches or a force-push). Nothing was done.
