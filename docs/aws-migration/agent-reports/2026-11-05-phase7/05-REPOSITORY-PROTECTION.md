# 05 Repository protection (Phase 7, Agent 5, owner decision D-5)

> **Lead note (Phase 7 consolidation).** The ruleset and environment JSON referred to below is published in [`supporting/rulesets/`](supporting/rulesets/). The two `ci.yml` patches were merged by the lead as code-only PRs: [munaxa-work#29](https://github.com/munaxa/munaxa-work/pull/29) (`b490b25`, together with the Work GHCR dispatch-only change) and [munaxa-school#24](https://github.com/munaxa/munaxa-school/pull/24) (`9671bcb`). PR #43, which removes the `paths:` filter from `aws-terraform.yml`, was merged as `6b8997a`. No GitHub setting, ruleset or environment was changed by any agent. The admin-bypass setting for environments (`can_admins_bypass`) is set in the UI (step O-4), because the API field was not confirmed. The lead's attempt to request tam2om as reviewer on #43 failed with "Review cannot be requested from pull request author" [V-gh]. This is direct evidence of the shared-identity problem.


Date: 5 Nov 2026 (UTC). Read-only.

Agents changed nothing in GitHub: no setting, ruleset, environment, push, PR, comment or review. The only
repository change in this area is code in PR munaxa/munaxa-platform#43 (head e78aa92). It removes the
`paths:` filter from `aws-terraform.yml`. Everything else here is a proposal for the owner to apply.

Labels:

- [V-repo] the repository at `origin/main`, fetched 5 Nov.
- [V-gh] a GitHub API read in this phase, through `mcp__github__*` read tools.
- [V-doc] public GitHub documentation, fetched with WebFetch in this phase.
- [E] inference. [U] unverified. [O] owner action.

## 1. What could and could not be read

| Item | Tool | Result |
| --- | --- | --- |
| Rulesets, classic branch protection, environments, deployment branch policies, org members, org plan | none available | **Not read.** The `mcp__github__*` toolset has no ruleset or environment reader. The brief limits `gh` to `search/` endpoints, so `gh api repos/.../rulesets` and `.../environments` were not called. Phase 5 read rulesets directly (`phase5/01-GITHUB-OIDC-CI-READINESS.md` §7). Those facts are cited as [V-gh, Phase 5]. |
| `main` protected flag | `list_branches` | Read for all seven repositories (table below) |
| Tags | `list_tags` | Read for all six code repositories |
| PR #43 metadata and check runs | `pull_request_read get`, `get_check_runs` | Read |
| Exact check names | `get_check_runs` on the latest merged PR in each product repository | Read. They match the workflow job names. |
| School `image-release` and `production` environment state | `get_job_logs` on School CI job 124110933651 (30 Oct). Its `deploy-gate.mjs report-environment` step reads the environments API with the run's token. | Read, but only as of 30 Oct |
| Docs publish runs | `actions_list list_workflow_runs` | Read |
| Platform plan run 41977870108 jobs | `actions_list list_workflow_jobs` | Read |
| GitHub documentation | `curl` to docs.github.com, then WebFetch | `curl`: `CONNECT tunnel failed, response 403` (agent proxy `connect_rejected`). WebFetch worked, and the [V-doc] claims come from it. |
| Integration id of the check runs | `get_check_run` | The response has no `app` field. 15368 (GitHub Actions) is therefore [E]. |

## 2. Actual state per repository

| Repo | `main` protected (5 Nov) [V-gh] | Main ruleset | Tag ruleset | `image/*` tags [V-gh] | What can publish an image [V-repo] | Environments used [V-repo] / known state |
| --- | --- | --- | --- | --- | --- | --- |
| munaxa-identity (main 4001ed8) | **false** | none [V-gh, Phase 5] | none [V-gh, Phase 5] | none | `publish-images-ecr.yml`: push of an `image/**` tag, then job `publish` in `image-release`. `publish-images.yml` (GHCR): push of an `image/**` tag **or** `workflow_dispatch`, with **no environment** and `packages: write`. | `image-release`: state [U] |
| munaxa-control (a24c568) | **false** | none [Phase 5] | none [Phase 5] | none | `publish-images.yml` (ECR): push of an `image/**` tag, then `image-release` | `image-release` [U] |
| munaxa-work (f812dfe) | **false** | none [Phase 5] | none [Phase 5] | none | `publish-images-ecr.yml`: push of an `image/**` tag, then `image-release`. `publish-images.yml` (GHCR): tag push or dispatch, with no environment, tag-pinned actions and `PLATFORM_PACKAGES_TOKEN`. | `image-release` [U] |
| munaxa-school (54cf3eb) | **false** | none [Phase 5] | none [Phase 5] | none | `publish-images-ecr.yml`: **dispatch only**, from an `image/<sha>` tag. `production-gate` (`deploy-gate.mjs`) runs first, then `image-release`. `deploy.yml` also pushes GHCR images on dispatch, in `staging` or `production`, behind the same gate. | On 30 Oct [V-gh]: **`image-release` did not exist**. `production` required `tam2om`. `staging` had no reviewer, allowed admin bypass and allowed any branch. |
| munaxa-platform (7cd448d) | **true** | 20906222 "Protect main": 0 approvals, 3 strict checks, linear history, no deletion or force push, no bypass [Phase 5] | none [Phase 5] | none | No images. `release.yml` publishes npm packages on dispatch, with `packages: write` and no environment. | `aws-nonprod`, `aws-prod`: reviewer [U]. Plan job 127080867999 waited 50 s between creation and start, which is consistent with an approval [E]. `aws-nonprod-session`: no reviewer by design [U]. |
| munaxa-docs (b8c7e25) | **true** | 20906159: 0 approvals, 7 checks [Phase 5] | 25664662 on `refs/tags/image/*`, create, update and delete restricted, admin role bypass [Phase 5] | **7** (`image/8cb4c14...` to `image/f8a8bea...`) | `publish-images.yml`: push of an `image/**` tag, then `image-release` (3 jobs) | `image-release` reviewer [U]. Run 39929830650 took 7 h from created to updated, which suggests it waited for an approval [E]. |
| munaxa (umbrella, 9a48a95) | **false** | [U] | [U] | not read | none (Cloudflare site deploy on push to main, environment `production`) | out of this decision's scope |

Other facts:

- **Collaborators.** In all seven repositories the only collaborator is `tam2om`, with role admin [V-gh, Phase 6 B-9].
- **Agent identity.** `get_me` returns `tam2om` (id 44133590) [V-gh]. PR #43 is authored by `tam2om`. Its body
  carries `claude-projects-attribution: {"github_login":"tam2om"}` [V-gh].
- **What that means.** The session's GitHub access is the owner's account, connected through the Claude
  GitHub App (claude.ai/connect-github), acting as that user [V-gh, plus the environment documentation].
- **Lead evidence.** Requesting a review from `tam2om` on #43 failed with "Review cannot be requested from
  pull request author" [V-gh].
- **PR #43 checks.** "Format, validate, mocked plan tests" passed (check run 127095996086), as did
  "Lint · Typecheck · Test · Build" and "Façades match the platform surface". "Accessibility · ..." was still
  in progress when read, and `mergeable_state` was `blocked` [V-gh].

## 3. Workflow facts that the configuration must respect [V-repo]

**Required check names**

| Repo | Names, which equal the PR check names [V-gh] |
| --- | --- |
| Identity | `verify`. CI runs on every PR, with no path filter. |
| Control | `Format · Lint · Typecheck · Test · Build`, `Build the images`. No path filter. |
| Work | `Standards · Architecture · Localization`, `Lint · Typecheck · Test · Build`, `Mobile`, `Product isolation`. **`paths-ignore` on `pull_request`** (`ci.yml` lines 6-8). |
| School | `Detect changed areas`, `Lint · Typecheck · Test · Build (JS/TS)`, `Analyze · Test (Flutter)`, `Security scans`. **`paths-ignore` on `pull_request`** (`ci.yml` lines 9-12). |
| Platform | `Lint · Typecheck · Test · Build`, `Accessibility · contrast and keyboard, every story, four brands, light and dark`, `Façades match the platform surface`, `Format, validate, mocked plan tests` |

Notes on these checks:

- **School Flutter.** `Analyze · Test (Flutter)` is skipped by an `if:` when mobile is unchanged. GitHub
  reports a job skipped by a conditional as "Success". Skips caused by a path filter stay "Pending" and block
  [V-doc, troubleshooting required status checks]. So it is safe to require, and I included it. Phase 6 left
  it out; drop it if you prefer.
- **Platform `ci.yml`.** Its only `paths-ignore` is on `push: main`. Required checks apply only to PRs, so this
  has no effect on them. Leave it.
- **`aws-terraform.yml` on main.** It still has `paths:` (lines 24-29). **PR #43 removes it** (verified in the
  diff 7cd448d..e78aa92). The `static` job then runs on every PR to main (`if: github.event_name ==
  'pull_request'`). Its context is published on every PR, so it can be required after #43 merges.

**OIDC trust (`infra/aws/bootstrap`)**

- **Image publisher.** `sub = repo:...:environment:image-release` and `ref` like `refs/tags/image/*`
  (`iam.tf` 548-573).
- **CI and session CI roles.** `sub = ...:environment:<env>` and `ref = refs/heads/main` (`iam.tf` 495-519,
  `iam_session.tf` 18-40).

So AWS accepts:

- an ECR publish only from a job in `image-release` on an `image/*` tag;
- a session or deployer session only from a job on `main` in the named environment.

**Who controls the run**

- **The tag pusher's version runs.** A tag push runs the workflow file **at the tagged commit**. The "commit is
  on main" check is code inside that same workflow, so whoever writes the tagged commit controls it.
- **The real gates.** So the controls that matter are:
  - who may create `image/*` tags (the tag ruleset);
  - who approves `image-release` (the environment reviewer).
- **Branch-pushed workflows are similar.** A workflow changed on a branch runs on `pull_request` with
  repository-level secrets. It cannot pass an environment whose deployment policy excludes that ref. That is
  why each environment's branch and tag policy matters.

## 4. The identity problem, stated plainly

Today every agent, and the owner, acts as `tam2om`. Consequences:

1. **No approval is possible on agent PRs.** A required approval of 1 cannot be met, because GitHub does not
   let the author approve their own PR. The only way to merge would be a bypass, and the agent holds the same
   identity and could perform that bypass. A "1 approval plus admin bypass" setup would therefore look like
   review without being review.
2. **The tag ruleset does not stop agents.** Its admin-role bypass is `tam2om`, so agents could create tags
   too.
3. **The environment reviewer is the owner's real gate, but only while two things hold:**
   - agents do not approve pending deployments with the owner's token. Whether the Claude GitHub App's token
     can call `POST .../actions/runs/{id}/pending_deployments` is [U]. That depends on the app's
     deployments/actions permissions, which were not read.
   - agents follow the process rule "never push `image/*` tags, never approve deployments".
4. **`prevent_self_review` must stay off.** With it on, the person who triggered the run cannot approve it. The
   owner pushes the tags, so he would be locked out of approving his own release. With one human in the
   project, it adds nothing in either phase: after the split, the bot cannot create tags anyway.

That gives two phases.

- **Phase A (now):** structure and checks.
  - Main rulesets require PRs and checks with **0 approvals**.
  - Tag rulesets are in place.
  - `image-release` requires `tam2om`, with no admin bypass and tags `image/*` only.
  - This is honest. It enforces tests, history and tag hygiene, and the release approval is the owner's own
    click. It does **not** claim independent code review.
- **Phase B (after a separate agent identity exists):**
  - Approvals go to 1, with approval of the latest push required.
  - The bot has the Write role, so it cannot create tags, cannot bypass, and cannot approve environments.

## 5. Proposed configuration (files in `supporting/rulesets/`)

### 5.1 Main rulesets (Identity, Control, Work, School): new

The files are `identity-main.phaseA.json`, `control-main.phaseA.json`, `work-main.phaseA.json` and
`school-main.phaseA.json`, with a `.phaseB.json` of each.

Common content:

- target `branch`, enforcement `active`, include `~DEFAULT_BRANCH`;
- rules:
  - `deletion` and `non_fast_forward`;
  - `required_linear_history`, except in **Work**, which merges with merge commits (#28 = f812dfe);
  - `pull_request`: dismiss stale reviews on;
  - `required_status_checks`: strict (up to date), each context with `integration_id` 15368 [E].

What changes between the phases:

| Setting | Phase A | Phase B |
| --- | --- | --- |
| Required approvals | 0 | 1 |
| Approval of the most recent push required | off | on |
| Bypass list | empty | Repository admin role (id 5), mode `pull_request` |

About the Phase B bypass:

- It is break-glass for the owner's own PRs. A merge through it is logged as a bypass.
- It is safe only once agents no longer hold the owner's token.
- Remove it if you want no bypass at all. Then the owner's own PRs need a second approver, and the only other
  account would be the bot. The bot approving owner PRs would also misrepresent review.

**Prerequisite for Work and School:** merge the two patches first. Otherwise a Markdown-only PR can never merge
(the checks stay pending).

- `/tmp/claude-0/phase7/a5/patches/work-ci-no-paths-ignore.patch`
- `/tmp/claude-0/phase7/a5/patches/school-ci-no-paths-ignore.patch`

Both pass `git apply --check` on `origin/main`, and the result parses as YAML [L]. Nothing else in either
repository references `paths-ignore`. Identity and Control need no change.

### 5.2 Platform main ruleset 20906222: update

The files are `platform-main-20906222.phaseA.json` and `platform-main-20906222.phaseB.json`. The update adds
`Format, validate, mocked plan tests` to the three existing checks, and keeps linear history, deletion and
non-fast-forward.

- Apply it only **after #43 is merged**. Until then, PRs that do not touch `infra/aws/**` would never get the
  check.
- PUT replaces the whole ruleset. Read it first (step O-3 in §6) and confirm nothing else is in it.

### 5.3 Tag rulesets

**Product repositories.** Files `identity-tags-image.json`, `control-tags-image.json`, `work-tags-image.json`
and `school-tags-image.json`:

- target `tag`, include `refs/tags/image/*` and `refs/tags/image/**/*`;
- rules `creation`, `update` (no fetch-and-merge), `deletion` and `non_fast_forward`;
- bypass: Repository admin role (5), `always`, the same as Docs 25664662.

Why two patterns: in rulesets `*` does not match `/`, and `qa/**/*` is the documented multi-level form
[V-doc]. The workflows trigger on `image/**`, so the second pattern closes nested names like `image/a/b`.

**Platform.** Optional: `platform-tags-all.json` (`~ALL`) protects every tag, because none exist and none are
expected.

**Who bypasses.** Only the admin role, meaning the owner. The bot in Phase B is not a bypass actor.

### 5.4 Environments

**`image-release`** in Identity, Control, Work and School. Also check that Docs matches.

- `env-image-release.json`:
  - reviewers: User 44133590 (`tam2om`);
  - `prevent_self_review` false (reason in §4 point 4);
  - `wait_timer` 0;
  - `custom_branch_policies` true.
- `env-image-release.branch-policy.json`: `{"name":"image/*","type":"tag"}`. This is a single rule, and the
  School gate requires exactly `tag:image/*` (`scripts/deploy-gate.mjs` line 65). Here too `*` does not match
  `/` [V-doc].
- **Allow administrators to bypass: off.** Set this in the UI. The REST page I read does not list
  `can_admins_bypass` as an input [V-doc]. The environment GET does return it, and School's gate reads it.
- No environment secrets. Keep `AWS_IMAGE_PUBLISHER_ROLE_ARN` a repository variable, as the workflows read it.

**Platform:**

- `env-platform-aws-nonprod.json` and `env-platform-aws-prod.json`: reviewer `tam2om`, branch policy `main`
  only (`env-platform.branch-policy-main.json`), admin bypass off.
- `env-platform-aws-nonprod-session.json`: **no reviewer**, so the backstop runs unattended. Branch `main`
  only.
- Do not apply these blind. They replace the current reviewers and policy, which were not read. GET each one
  first (§6 step O-3) and apply only what differs.

### 5.5 Requirements traceability

| D-5 requirement | Met by | Phase |
| --- | --- | --- |
| (1) Main rulesets for Identity, Control, Work, School | 5.1 | A, with approvals in B |
| (2) Protected `image/*` tags in those four | 5.3 | A (effective against agents only in B) |
| (3) Required reviewer for `image-release` | 5.4 | A |
| (4) Required AWS Terraform check in Platform | 5.2, after #43 | A |
| (5) No path filter on required checks | #43 (`aws-terraform.yml`), plus the Work and School patches. Platform `ci.yml` push filter: no effect. | A |
| (6) Preserve CI and deployment workflows | No workflow change beyond the path filters. The dispatch jobs, the session cron and the School gate are untouched. The School gate will now **pass** for `image-release`, where on 30 Oct it reported "does not exist". | A |
| (7) No unreviewed image publication | ECR: AWS trust needs `image-release` and an `image/*` tag, and the environment needs the owner's approval. **Gap:** the GHCR workflows in Identity and Work publish on dispatch with no environment, and any writer can do the same from a branch workflow using `packages: write`. Platform `release.yml` (npm) is the same. | A for ECR. GHCR and npm remain open (§7). |
| (8) No unreviewed change reaches the session deployer | Session trust needs `main` and `aws-nonprod-session`, and the environment allows `main` only. But `main` takes 0-approval merges, and the backstop runs whatever is on `main`. **Met only in Phase B.** | B |

## 6. Owner actions, in order

Run the `gh` commands in your own terminal, signed in as `tam2om`, from
`supporting/rulesets/` (copy the folder). Never run them in an agent session. `R` stands for each
of munaxa-identity, munaxa-control, munaxa-work and munaxa-school.

**O-1. Merge the prerequisite PRs.**

- Merge #43.
- Have the lead open PRs with the Work and School `ci.yml` patches, and merge them.

**O-2. Tag rulesets** (any time; nothing exists to break).

- UI: in each repository, Settings > Rules > Rulesets > New ruleset > New tag ruleset.
  - Name "Protect image tags". Enforcement: Active.
  - Bypass list: Add bypass > Repository admin, Always allow.
  - Target tags: Add target > Include by pattern `image/*`, then add `image/**/*`.
  - Rules: tick Restrict creations, Restrict updates, Restrict deletions and Block force pushes.
  - Create.
- CLI: `gh api -X POST repos/munaxa/R/rulesets --input <short>-tags-image.json`

**O-3. Read before changing** (records the current state).

```
gh api repos/munaxa/munaxa-platform/rulesets/20906222
gh api repos/munaxa/munaxa-docs/rulesets/25664662
for e in aws-nonprod aws-prod aws-nonprod-session; do gh api repos/munaxa/munaxa-platform/environments/$e; done
for r in munaxa-identity munaxa-control munaxa-work munaxa-school munaxa-docs; do gh api repos/munaxa/$r/environments/image-release; done
gh api repos/munaxa/munaxa-identity/commits/main/check-runs --jq '.check_runs[] | {name, app: .app.id}'
```

The last command confirms the integration id 15368. If it differs, edit the JSON files, or delete the
`integration_id` lines.

**O-4. `image-release` environment** (each `R`).

- UI: Settings > Environments > New environment "image-release".
  - Required reviewers: tick, and add `tam2om`. Leave "Prevent self-review" unticked.
  - Untick "Allow administrators to bypass configured protection rules".
  - Deployment branches and tags: Selected branches and tags > Add deployment branch or tag rule > Ref type
    Tag, pattern `image/*`.
  - Save.
- CLI:

```
gh api -X PUT repos/munaxa/R/environments/image-release --input env-image-release.json
gh api -X POST repos/munaxa/R/environments/image-release/deployment-branch-policies --input env-image-release.branch-policy.json
```

  Then untick admin bypass in the UI, and confirm with:

```
gh api repos/munaxa/R/environments/image-release --jq '{can_admins_bypass, protection_rules, deployment_branch_policy}'
```

**O-5. Main rulesets, Phase A** (each `R`, after O-1 for Work and School).

- UI: Settings > Rules > Rulesets > New branch ruleset.
  - Name "Protect main". Active. Bypass list empty.
  - Target: Include default branch.
  - Tick:
    - Restrict deletions;
    - Require linear history (not for Work);
    - Require a pull request before merging, with required approvals 0 and "Dismiss stale pull request
      approvals" ticked;
    - Require status checks to pass, with "Require branches to be up to date" ticked. Add the checks from §3.
      Choose source "GitHub Actions" for each.
    - Block force pushes.
- CLI: `gh api -X POST repos/munaxa/R/rulesets --input <short>-main.phaseA.json`

**O-6. Platform.** After #43 is merged and O-3 is read:

```
gh api -X PUT repos/munaxa/munaxa-platform/rulesets/20906222 --input platform-main-20906222.phaseA.json
```

- UI: Settings > Rules > Rulesets > Protect main > Require status checks > Add checks >
  "Format, validate, mocked plan tests" > Save.
- Check each platform environment against §5.4 in Settings > Environments.

**O-7. Phase B,** only after §8 is in place.

- `gh api -X PUT repos/munaxa/R/rulesets/<id> --input <short>-main.phaseB.json` for each repository.
- The same for Platform (`platform-main-20906222.phaseB.json`).
- Docs 20906159: raise approvals to 1 the same way.
- UI equivalent: set required approvals to 1, tick "Require approval of the most recent reviewable push", and
  optionally add Repository admin "For pull requests only" to the bypass list.

## 7. What remains after this

- **GHCR and npm publication are unreviewed.**
  - The Identity and Work GHCR workflows run on `image/**` tag push and on dispatch, with no environment.
    Phase 6 patches make them dispatch-only, but dispatch is still unreviewed. They are not merged:
    `origin/main` still has the tag trigger.
  - Any writer's branch workflow can also request `packages: write`.
  - These images are not what AWS runs, because the stack pins ECR digests. Close the gap fully by disabling
    the two GHCR workflows in Actions (owner, UI), or by giving them an environment with a reviewer.
  - Platform `release.yml` (npm) needs an environment with a reviewer (Phase 6 recommendation).
- **Branch workflows can read repository-level secrets.** Any writer's branch workflow can read
  repository-level secrets, for example `PLATFORM_PACKAGES_TOKEN`. Move deploy-grade secrets into
  environments.
- **Phase A is not independent review.** Until Phase B, every PR merges with zero reviews, and the session
  deployer runs whatever reaches `main`.
- **[U]** The current environments in every repository, and the umbrella repository's rulesets, until O-3 is
  run.

## 8. Bot identity recommendation

### How agents reach GitHub today

- The cloud session uses the GitHub account connected at claude.ai/connect-github, through the Claude GitHub
  App, acting as that user [V-gh: PR authorship, `get_me`, attribution marker].
- The Claude GitHub App does not author as itself here. It acts **on behalf of `tam2om`**. Using it as it is
  therefore does not solve the problem.
- Whether a Claude cloud session can push with an app installation identity (as `claude[bot]`) is [U]. I found
  no setting for it.

### The options

| | Machine user `munaxa-bot` | Org-owned GitHub App |
| --- | --- | --- |
| Terms | Allowed. "A machine account is an Account set up by an individual human who accepts the Terms on behalf of the Account" and is "used exclusively for performing automated tasks". "You may maintain no more than one free machine account in addition to your free Personal Account." The owner "is ultimately responsible for the machine's actions." [V-doc ToS] | Allowed, and the documented approach for organisation automation [V-doc] |
| Cost | Free account. On a paid org plan it is a member and **uses a seat**. The org plan is [U], so it may be free on GitHub Free [E]. | "GitHub Apps are not tied to a user account and do not consume a seat." [V-doc] |
| Permissions | Repository role **Write** (not Maintain or Admin) on the six repositories. The Claude App's own permissions further limit what it can do [E]. | Fine-grained: Contents RW, Pull requests RW, Workflows RW (to edit `.github/workflows`), Actions R, Checks R, Metadata R. No Administration, no Deployments write, no Environments. |
| Credential | **None in the session.** The owner signs the bot into GitHub (with 2FA) and connects it at claude.ai/connect-github for the claude.ai account the agents use. The Claude App holds the OAuth token, as it does today for `tam2om`. [E: this depends on whether one claude.ai account can use a different GitHub account than the owner's. If not, the bot needs its own claude.ai seat.] | A private key, from which 1-hour installation tokens are minted ("The installation access token will expire after 1 hour", and tokens can be scoped down to fewer repositories and permissions [V-doc]). Whatever mints them must hold the private key, which is long-lived. Putting it in the agent environment's secrets puts a long-lived credential within the agent's reach. The session's git push goes through the Claude proxy credential, so wiring an app token into git and `gh` is [U]. |
| Authorship | PRs and commits by `munaxa-bot`. `tam2om` can be requested as reviewer and can approve. | PRs by `<app>[bot]`. `tam2om` can approve. |
| Audit | A separate actor in the audit log, PR history and Actions `triggering_actor` | The same, with app attribution |
| Ruleset effect | Write role: cannot create `image/*` tags, cannot bypass, is not an environment reviewer | Not a bypass actor; the same effect |

### Recommendation [E]

**Use a machine user, `munaxa-bot`, connected through the existing Claude GitHub App.** It is the only option
that fits how this agent environment authenticates, and it puts no credential in a session (CLAUDE.md: never
copy credentials into a session).

Then:

- `tam2om` remains the only admin and the only human reviewer.
- The bot authors PRs and may merge them once `tam2om` has approved.
- Keep a GitHub App for later GitHub Actions automation. In Actions, `actions/create-github-app-token` with
  the key held as an environment secret works without personal credentials.
- The existing automation does not need personal credentials today. The workflows use `GITHUB_TOKEN`, OIDC,
  and `PLATFORM_PACKAGES_TOKEN`; the owner of that last token is [U].

**Owner steps** (agents create nothing):

1. Create the account with its own email and 2FA.
2. Invite it to the org as a member with no base permission.
3. Grant Write on the six repositories.
4. Connect it at claude.ai/connect-github for the agents' claude.ai account.
5. Confirm with one test PR that the author is `munaxa-bot`.
6. Then run O-7.

## 9. Effect on the standing merge rule ("Claude merges eligible PRs without asking")

- **Phase A: no change.** Claude can merge once the required checks pass. The checks are now enforced, so a red
  or missing check blocks the merge. Strict checks mean the branch must be up to date first.
- **Phase B: Claude can no longer self-merge.**
  - Each PR needs `tam2om`'s approval of its latest push. After that the bot may merge it.
  - Any new push dismisses the approval, so the owner approves again.
  - This means one owner review per PR, which is the point of D-5.
  - The only way around it is to add the bot to a bypass list, which would remove the control.
  - If the owner pushes a commit to a bot PR, "most recent push" approval then needs someone other than the
    owner. Use the admin "pull requests only" bypass, which is logged, or have the bot push the fix.
