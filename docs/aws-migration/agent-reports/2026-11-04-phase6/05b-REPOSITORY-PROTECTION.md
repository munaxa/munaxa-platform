# 05b Repository protection and CI (Phase 6, Agent 6)

Date: 4 Nov 2026 (UTC). Read-only. No setting was changed and no GitHub write was made.

The ruleset, branch-protection and environment APIs were not called. This phase allows only `gh api` search
and the `mcp__github__*` read tools, and none of those reads rulesets or environments. Ruleset facts below are
therefore cited from Phase 5's direct reads (`phase5/01-GITHUB-OIDC-CI-READINESS.md` §7 and
`phase5/06-INDEPENDENT-REVIEW.md`; marked "[V-gh, Phase 5]") and corroborated here with merge, tag and run
metadata.

Labels: [V-repo], [V-gh], [E], [U], [O].

## 1. Findings

### B-1 Every repository is public [V-gh]

`gh api -X GET search/repositories -f q='org:munaxa'` returns seven repositories. All are `visibility: public`,
`private: false`, with default branch `main`:

munaxa-platform, munaxa-docs, munaxa-work, munaxa-school, munaxa-identity, munaxa-control and munaxa (the
umbrella repository).

Consequences:

- Workflow logs, step summaries and artifacts can be read by anyone.
- The AWS account id and role ARNs are already in the source:
  - `munaxa-platform/.github/workflows/aws-terraform.yml` line 53;
  - `munaxa-docs/.github/workflows/publish-images.yml` line 58;
  - `munaxa-school/.github/workflows/publish-images-ecr.yml` line 39.
- [E] Do not make the repositories private without a paid plan. On GitHub Free, private repositories lose
  rulesets, branch protection and environment required reviewers. Those are the controls the whole gate model
  rests on. I took this from GitHub plan documentation, not checked here.

### B-2 Platform `main` requires a PR with zero approvals [V-gh, Phase 5] [V-gh]

- Ruleset 20906222 "Protect main" is active with no bypass actors. It requires:
  - a PR with `required_approving_review_count: 0` and dismiss-stale;
  - linear history, no deletion and no force push;
  - three strict checks: "Lint · Typecheck · Test · Build", "Accessibility · ...", "Façades match the platform
    surface".
- Corroboration from this phase:
  - #38 (the IAM bootstrap change: deployers, boundaries, session role) and #39 have **0 reviews**
    (`pull_request_read get_reviews` returns `[]`).
  - #35 to #39 were all authored and merged by `tam2om`.
- Agents push and open PRs as `tam2om`, the owner's own account. GitHub does not let an author approve their
  own PR. So raising the approval count to 1 today would block every agent PR, unless the owner bypasses, and
  the agent holds the same identity and could bypass too.
- The real control has to separate identities (see section 2).

### B-3 The AWS Terraform check is not required, and cannot be yet [V-gh] [V-repo]

- "Format, validate, mocked plan tests" (`aws-terraform.yml` job `static`) ran on #38 and succeeded (check run
  126555027755). It is not one of the ruleset's three required contexts.
- It cannot simply be added. The `pull_request` trigger has a `paths:` filter (`aws-terraform.yml` lines
  24-29). A required check that never starts stays pending, which `ci.yml` lines 2-24 explain at length.
- So `infra/aws/**`, `scripts/terraform/**` and both AWS workflows can merge with a broken mocked plan.
- That matters because `check-plan-intent.sh` and the expected-changes files are the G3 guard rails.
- The patch removes the path filter. The check then always runs (about 50 s; run 41824313154 job took 48 s)
  and can be required.

### B-4 Product repositories have no ruleset [V-gh, Phase 5] [V-repo] [V-gh]

- Phase 5 read `rules/branches/main = []` and `branches/main.protected = false` for identity, control, work
  and school, and `rulesets = []` in each.
- Corroboration:
  - every first-parent commit since 1 Oct in those four repositories is a PR merge;
  - but `munaxa-control` b72d322 ("Start main", 26 Oct) is a direct commit;
  - `munaxa` (umbrella) 960fb56 ("Add robots.txt", 13 Oct, committer GitHub) is a direct web-UI commit to
    main.
- Work merges with merge commits (#28 = f812dfe). Identity, Control and School squash.
- School's `ci.yml` line 4 comment says "Branch protection (required status checks) gates merges". That is
  not true while no ruleset exists [V-gh, Phase 5].
- Work, School and the umbrella `ci.yml` use `paths-ignore` (work lines 4-8, school lines 7-12, munaxa lines
  4-8). Required checks would wedge Markdown-only PRs there, exactly as platform and docs found. Remove
  `paths-ignore` before requiring checks.
- Identity and Control CI also run on `push: main`. Work and School are PR-only.

### B-5 Release tags are protected only in docs [V-gh, Phase 5] [V-gh]

- Docs has tag ruleset 25664662 on `refs/tags/image/*`, which restricts creation, update and deletion. Its
  bypass is the repository admin role (id 5).
- Identity, Control, Work and School have none. `list_tags` returns `[]` for all four and for platform, so
  nothing has been published yet.
- The ECR publisher roles trust only `...:environment:image-release` together with `refs/tags/image/*`
  (`munaxa-platform/infra/aws/bootstrap/iam.tf` lines 539-548).
- So in the four product repositories the human gates for a publish are:
  - who can push an `image/*` tag: any writer;
  - the `image-release` reviewer: [U], not readable.
- Mitigations:
  - every ECR workflow checks that the tag names a commit on `main` (identity lines 52-54 and 73-74; work
    74-75; control 71-72; school 97-98);
  - the stack uses only digests set by tfvars PR. The impact of a rogue tag is a pushed but unused image
    [E, Phase 5].
- The ancestry check accepts **any** commit ever on main, including one whose workflow file is older and
  weaker. The tag ruleset is what closes that.

### B-6 `image/**` tags also fire the ungated GHCR workflows (Work, Identity) [V-repo]

- `munaxa-work/.github/workflows/publish-images.yml`:
  - triggers on `push: tags: image/**` and on dispatch with a free `commit` input;
  - has no `environment` and no main-ancestry check;
  - runs **tag-pinned** actions (`@v6`, `@v3`; lines 50, 63, 66, 76);
  - holds `PLATFORM_PACKAGES_TOKEN` (line 89) and `packages: write`.
- Identity's equivalent is SHA-pinned but is otherwise the same.
- A release tag pushed for ECR therefore also runs this job. A moved upstream action tag would see the
  package token.
- The patches make both workflows dispatch-only.

### B-7 Terraform output in public logs [V-gh] [V-repo]

- **Plans are clean.** Both workflows send `terraform plan` stdout to `/dev/null` (`aws-terraform.yml` line
  176; `aws-session.yml` lines 148-149) and print only addresses and actions.
- **The plan log of run 41887322394** (job 126775175310; scan in `evidence/run-41887322394-log-scan.txt`)
  shows:
  - The account id (workflow env).
  - The CI and deployer role ARNs, from unmasked `vars` in step env headers and the configure-aws-credentials
    `with:` block.
  - The CI role's unique id `AROATKYDRMQALXF6TDPZ4`. This is new information, but of low value.
  - Session credentials: masked.
  - Not present:
    - IP addresses, CIDRs, VPC, subnet or security-group ids;
    - the RDS endpoint and the ALB name;
    - secret ARNs or suffixes, secret values, KMS key ids, emails.
  - Verdict: **no secret value and nothing beyond what the source already shows, except the AROA id**.
- **Applies are not clean.**
  - `aws-terraform.yml` line 315 and `aws-session.yml` line 175 run `terraform apply ... tfplan` with stdout
    going to the log.
  - Terraform prints `Creation complete ... [id=...]` for every resource: ARNs, `vpc-`, `subnet-` and `sg-`
    ids, and secret ARNs with their random suffix.
  - It then prints every root output (`infra/aws/stack/outputs.tf`):
    - `alb_dns_name`, `certificate_validation_records`, `database_endpoint`;
    - `secret_bundles`, `file_buckets`, `control_licence_key_arn`;
    - `cluster_name`, `run_task_network`.
  - No output is a secret value. The outputs have no `sensitive` attribute, and none is needed [V-repo].
  - But the first G3 apply (Phase 6 step 6.7) would publish a full resource map. **Patch:** send apply
    stdout to `/dev/null` and write a one-line summary. Errors still reach stderr. The owner reads outputs
    with `terraform output` in CloudShell.
  - [O] Apply this before step 6.7, or accept the exposure explicitly.
- **Session deployer key id [E].** `aws-session.yml` lines 98-101 write `DEPLOYER_AWS_ACCESS_KEY_ID` into
  `GITHUB_ENV`. Only the secret key and token are masked (lines 94-95).
  - GitHub echoes `GITHUB_ENV` variables in later steps' `env:` headers, so the `ASIA...` key id would be
    printed. A key id alone grants nothing, and the session expires within an hour.
  - Optional fix: add `echo "::add-mask::$(jq -r .AccessKeyId <<<"$creds")"`.
  - Not yet observed: no session has run against an existing stack, and the nightly runs were skipped (B-8).
- **Lock file.** `infra/aws/stack/.terraform.lock.hcl` has one `h1:` hash. The run's init said it "made some
  changes to the provider dependency selections". Run `terraform providers lock -platform=linux_amd64
  -platform=darwin_arm64` and commit the result, so CI verifies against recorded hashes [R].

### B-8 Session backstop: skipped and late [V-gh] [E]

- `aws-session.yml` runs on schedule (5 runs in total). The last three were:

  | Run | Started (UTC) | Conclusion |
  | --- | --- | --- |
  | 41362021669 | 1 Nov 23:25 | skipped |
  | 41563819348 | 3 Nov 02:04 | skipped |
  | 41747107325 | 4 Nov 00:28 | skipped |

  The cron is `0 20 * * *`, so these are **3.5 to 6 hours late**.
- Skipped is expected while the stack does not exist and `vars.AWS_CI_ROLE_ARN` is empty.
- But the job-level `if: ... && vars.AWS_CI_ROLE_ARN != ''` (line 50) is evaluated before the job enters
  `aws-nonprod-session`.
  - [E] Environment-scoped variables are not visible in `jobs.<id>.if`; only repository and organisation
    variables are.
  - Phase 5 plan step 6.2 says to set the role ARNs as **environment** variables on `aws-nonprod-session`.
    If only that is done, the session job (including the 20:00 backstop) will **always be skipped**.
  - [O] Keep `AWS_CI_ROLE_ARN` as a repository variable as well, or change the condition. Verify with the
    first `up` dispatch.
- The lateness also means the "20:00 backstop" is really "some time that night". That matters for cost only
  (Agent 5's area).

### B-9 Other repository observations [V-repo]

- **Collaborators [V-gh]:** `list_repository_collaborators` (affiliation all) returns exactly one entry,
  `tam2om` with role `admin`, in all seven repositories. So "any writer" in B-4 and B-5 means the owner's
  account and anything holding its token, which today includes the agents. That is why step 0 in section 2
  matters more than the count of approvals. [U] Organisation owners and members outside the collaborator list
  (the org members API was not read).

- **CODEOWNERS:** none in any of the seven repositories.
- **Umbrella `munaxa`:**
  - `deploy-cloudflare.yml` deploys the public website on every push to `main`, using environment
    `production` with `CLOUDFLARE_API_TOKEN` (lines 4-6, 42, 80).
  - `main` takes direct commits (960fb56), so it is probably unprotected [E].
  - [U] Whether `production` there has a reviewer.
- **School:** `deploy-cloudflare.yml` uses `production` with a typed confirmation.
- **Docs:** `terraform-eu-prod.yml` is dispatch-only, with `permissions: {}` at the top and environment
  `production` on the AWS jobs. Its roles are hard-coded and the eu-prod root is retired.
- **Platform `release.yml`:** dispatch-only, `packages: write`, default `dry_run: true`. It publishes the
  `@munaxa/*` npm packages the products build with. [R] Give it an environment with a reviewer: it is a
  supply-chain root for every product build.

## 2. Minimum viable protection model (before any image publication or production deployment)

### Principle

These settings mean something only if the agents stop acting as the owner. Steps 0 and 1 below set that up.

### 0. Identity separation [O] (prerequisite for every approval rule)

Create a dedicated identity for agent work, either:

- a machine user `munaxa-bot` with the Write role (not Maintain or Admin) on the six repositories; or
- a GitHub App with contents, pull-requests and actions write permissions.

Then:

- Agents author and push as that identity.
- `tam2om` stays the only admin and the only required reviewer.
- Neither identity is a bypass actor, except the admin role used for break-glass and for creating tags.
- Until this exists, "1 required approval" cannot be satisfied without a bypass. The interim choice is
  between:
  - keeping 0 approvals with the checks below; or
  - 1 approval with the admin role as a "pull requests only" bypass actor. That makes each merge an explicit,
    logged bypass, but an agent holding the owner's token can perform it too.

### 1. Branch ruleset "Protect main" (Settings → Rules → Rulesets → New branch ruleset)

The same settings go in every repository:

- Enforcement status: Active.
- Bypass list: empty (or Repository admin, "For pull requests only", as break-glass during step 0).
- Target branches: Include default branch.
- Rules:
  - Restrict deletions: on.
  - Require linear history: on, except munaxa-work, which merges with merge commits. For Work, either switch it
    to squash merges or leave this off.
  - Require a pull request before merging: on.
    - Required approvals: **1** (after step 0).
    - Dismiss stale pull request approvals when new commits are pushed: on.
    - Require review from Code Owners: on, with `.github/CODEOWNERS` = `* @tam2om` (add the file in the same
      change).
    - Require approval of the most recent reviewable push: on.
    - Require conversation resolution before merging: on.
    - Allowed merge methods: Squash (and Merge for Work).
  - Require status checks to pass: on; "Require branches to be up to date before merging": on.
  - Block force pushes: on.

Required status checks, by exact check name:

| Repository | Required checks | Before enabling |
| --- | --- | --- |
| munaxa-platform (edit ruleset 20906222) | `Lint · Typecheck · Test · Build`, `Accessibility · contrast and keyboard, every story, four brands, light and dark`, `Façades match the platform surface`, **`Format, validate, mocked plan tests`** | Merge the patch that removes the `paths:` filter from `aws-terraform.yml`; raise approvals to 1 |
| munaxa-docs (edit ruleset 20906159) | the seven contexts already required | Raise approvals to 1 |
| munaxa-identity (new) | `verify` | none (CI runs on every PR, no path filter) |
| munaxa-control (new) | `Format · Lint · Typecheck · Test · Build`, `Build the images` | none |
| munaxa-work (new) | `Standards · Architecture · Localization`, `Lint · Typecheck · Test · Build`, `Mobile`, `Product isolation` | Remove `paths-ignore` from `ci.yml` lines 6-8 |
| munaxa-school (new) | `Detect changed areas`, `Lint · Typecheck · Test · Build (JS/TS)`, `Security scans` (do not require `Analyze · Test (Flutter)`: it is skipped by design when mobile is unchanged) | Remove `paths-ignore` from `ci.yml` lines 9-12 |
| munaxa umbrella (new) | `Lint · Typecheck · Test · Build`, `Product isolation`, `Security scans` | Remove `paths-ignore` from `ci.yml` lines 6-8 |

### 2. Tag ruleset "Protect image tags" (Settings → Rules → Rulesets → New tag ruleset)

Create it in identity, control, work and school. Docs already has 25664662; check it matches.

- Enforcement: Active.
- Target tags: Include by pattern `image/*`.
- Bypass list: Repository admin, "Always". Only the owner creates release tags.
- Rules: Restrict creations, Restrict updates and Restrict deletions all on. Block force pushes on.

In munaxa-platform, add the same ruleset with pattern `*`. It has no tags today, and nothing should create one
except the owner.

### 3. Environments (Settings → Environments)

**`image-release`** in identity, control, work, school and docs:

- Required reviewers: `tam2om`.
- Prevent self-review: on (effective after step 0).
- Allow administrators to bypass configured protection rules: **off**. School's `production-gate` refuses to
  run otherwise.
- Deployment branches and tags: Selected branches and tags, with one rule: tag `image/*`. No branch rule.
- Environment secrets and variables: none. Keep `AWS_IMAGE_PUBLISHER_ROLE_ARN` a repository variable.

**`aws-nonprod`** and **`aws-prod`** in munaxa-platform:

- Required reviewers: `tam2om`. Prevent self-review: on. Admin bypass: off.
- Deployment branches: Selected, branch `main` only.

**`aws-nonprod-session`** in munaxa-platform:

- No reviewer. The nightly backstop must run unattended.
- Deployment branches: Selected, branch `main` only.
- Its safety rests on step 1 with one approval. While 0 approvals stand, any workflow merged to main that names
  this environment gets the session deployer with no approval (Phase 5 H-3).

**`production`** in munaxa (umbrella), school and docs: required reviewer `tam2om`, admin bypass off, branch
`main` only.

### 4. Repository settings

In all seven repositories:

- Settings → Actions → General:
  - "Require approval for all external contributors" for fork pull requests;
  - Workflow permissions: "Read repository contents and packages permissions";
  - "Allow GitHub Actions to create and approve pull requests": off.
- Settings → Code security: secret scanning and push protection on (free for public repositories).

### Order

Do these before any `image/*` tag is pushed (G5), and before the first `aws-terraform.yml` apply (G3 step
6.7):

1. Merge the `aws-terraform.yml` and `aws-session.yml` patch. Applies then stop printing stdout, and the
   Terraform check can be required.
2. Set up items 2 and 3.
3. Set up item 1. Its approval count is the only step that waits on step 0.

## 3. Patches (evidence/patches/, not applied)

- `platform-a6-readiness-and-logs.patch` includes:
  - `aws-terraform.yml`: no PR `paths:` filter; apply stdout to `/dev/null` plus a summary line.
  - `aws-session.yml`: apply stdout to `/dev/null` plus a summary line.
  - Both files parse as YAML. The other files in this patch are covered in 05.
- `work-ghcr-no-release-tag.patch` and `identity-ghcr-no-release-tag-and-runbook.patch`: the GHCR workflows
  become dispatch-only.
- Not drafted, suggested: mask the AccessKeyId in `aws-session.yml` (one line); remove `paths-ignore` in Work,
  School and umbrella `ci.yml`; add `.github/CODEOWNERS` in each repository.

## 4. Not verified

- [U] The current rulesets. This phase re-read none, and relies on Phase 5's reads plus merge, tag and commit
  metadata.
- [U] Environment protection rules, reviewers, admin bypass and variables, in any repository.
- [U] Whether `vars` in `jobs.<id>.if` sees environment variables (B-8). This is from GitHub documentation,
  not tested.
