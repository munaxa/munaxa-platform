# 01: GitHub OIDC and CI readiness (Phase 5, Agent 1)

Read-only investigation, 4 Nov 2026, 10:06 to 10:20 UTC. Nothing pushed, dispatched, commented or changed.
No AWS credential or AWS tool used. Evidence: `phase5/evidence/01/`.

Labels: [V] verified (how), [E] estimated, [R] recommended, [U] unverified/inaccessible, [O] owner action.

Baseline [V]: munaxa-platform `origin/main` = `00667f31493b1e8ba4380ddc3f49efce3abffc11` (#36, 09:55:56 UTC).
File hashes: `evidence/01/file-hashes-platform-00667f3.txt` (aws-session.yml `566d3381…`, aws-terraform.yml
`365a729d…`, iam.tf `3005e159…`). Products at identity `b97b3ab`, control `a24c568`, work `da84612`,
school `54cf3eb`, docs `b8c7e25`.

## 1. Key findings

1. **B3 still unverified.** No platform workflow has run a job since the owner's 08:59 UTC report. The
   environments and variables APIs return 403; no deployment record exists for any `aws-*` environment.
   The first non-skipped scheduled `aws-session.yml` run is still the check. [V that no run exists; U on config]
2. **The next scheduled `down` run fails closed, before any apply**, if the variables are set: the plan
   against the empty nonprod state contains creates of `aws_vpc`, `aws_db_instance`, `aws_kms_key`,
   `aws_s3_bucket` and the rest, which the "unexpected" filter rejects (exit 1). The apply and the RDS stop
   steps are skipped. Its only writes to AWS are the Terraform lock object (one put and one delete, which
   leave a noncurrent version and a delete marker in the versioned state bucket). It creates no state object
   and no resource. [V by code trace; E for the runtime]
3. A code-only guard is **recommended for noise, not needed for safety** (§4.4). Without it, a red run
   every night until G3.
4. **The munaxa-shared CI, deployer and publisher roles have never been assumed.** There are 0
   `aws-terraform.yml` dispatch runs, 0 non-skipped session runs, 0 ECR publish runs in the four products,
   and the phase 3 probe used audience `munaxa-oidc-subject-probe` with no STS call. [V]
5. **New: identity, work and school `main` are unprotected, like control (C8).** `GET branches/main` returns
   `protected=false` and `rules/branches/main` returns `[]` for identity, control, work and school. Only
   platform and docs have a "Protect main" ruleset. Earlier reports assumed the other repositories were
   protected. None of the four products has a tag ruleset on `image/*`; docs does. [V]
6. **All six repositories are public** [V `repos/{r}` visibility]. `aws-session.yml` and `aws-terraform.yml`
   run raw `terraform plan`, whose stdout (every non-sensitive attribute) goes to public job logs. The
   step summary is limited to addresses, but the log is not. [R] review before the first real plan.
7. There are no open PRs in any of the six repositories (10:10 UTC). [V]

## 2. GitHub environments and variables (task 2)

### 2.1 Direct API attempts, one call each (`evidence/01/api-status.txt`, `env-403-sample.txt`)

| Endpoint (all six repos unless noted) | HTTP |
| --- | --- |
| `repos/{r}/environments` | **403** "Access to this GitHub API path is not permitted through this proxy." |
| `repos/{r}/actions/variables` | **403** |
| `repos/{r}/branches/main/protection` (classic) | **403** |
| `repos/munaxa/munaxa-platform/environments/aws-nonprod`, `…/deployment-branch-policies`, `…/actions/variables/AWS_CI_ROLE_ARN` | **403** |
| `repos/{identity,control,work,school}/environments/image-release` | **403** |
| `orgs/munaxa/rulesets` | **403** |
| `repos/{r}/tags/protection` (deprecated API) | 404 |
| `repos/{r}/rulesets`, `rules/branches/main`, `deployments`, `branches/main` | 200 |
| GraphQL | not attempted (known blocked, per brief) |

### 2.2 Indirect evidence

| Item | Evidence | Status |
| --- | --- | --- |
| `aws-nonprod`, `aws-nonprod-session`, `aws-prod` exist in platform | `deployments?environment=<e>` = 0 for each (`deployments-by-env.txt`). No job has ever run in them, so no record could exist. Total platform deployments: 0 | **[U]** |
| Their protection (reviewer `tam2om`, `main` only) | No pending or waiting run exists to observe | **[U]** |
| `image-release` in identity, control, work, school | 0 deployments each; 0 runs of each ECR publish workflow | **[U]** |
| `image-release` in docs | 12 deployments; latest Docs publish run `40225272398` (25 Oct, tag `image/f8a8bea…`, success) | [V] exists and is used; protection [U] |
| Repo variables `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN` (platform) | Every scheduled run up to `41747107325` (00:28:44 UTC 4 Nov) has job `skipped`, 0 steps. On a schedule `github.ref` is always `refs/heads/main`, so the skip means `vars.AWS_CI_ROLE_ARN` was empty then. No run since | [V] absent at 00:28; **[U]** now |
| `aws-prod` environment variables (prod ARNs) | none | **[U]** |
| `AWS_IMAGE_PUBLISHER_ROLE_ARN` (4 products) | none | **[U]** |

**Variable scope matters** [E, GitHub behaviour as I understand it, not tested here]. The session job's
`if: vars.AWS_CI_ROLE_ARN != ''` is evaluated before the job enters its environment, so only a repository
or organisation variable can satisfy it. If the owner had set these as `aws-nonprod-session` environment
variables only, the job would keep skipping. The owner's report says repository variables, which is the
runbook's form (NEXT-EXECUTION-PLAN §2).

### 2.3 Expected ARNs against the bootstrap, by name [V `iam.tf`, `outputs.tf`, `variables.tf`, `main.tf` @00667f3]

| Variable | Where (runbook) | Expected name | Bootstrap resource |
| --- | --- | --- | --- |
| `AWS_CI_ROLE_ARN` | platform repo | `role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod` | `aws_iam_role.ci["nonprod"]` (`${prefix}-ci-${env}`, path `/munaxa-shared/bootstrap/`) ✔ |
| `AWS_DEPLOYER_ROLE_ARN` | platform repo | `…/munaxa-shared-deployer-nonprod` | `aws_iam_role.deployer["nonprod"]` ✔ |
| `AWS_CI_ROLE_ARN` | `aws-prod` env | `…/munaxa-shared-ci-prod` | `aws_iam_role.ci["prod"]` ✔ |
| `AWS_DEPLOYER_ROLE_ARN` | `aws-prod` env | `…/munaxa-shared-deployer-prod` | `aws_iam_role.deployer["prod"]` ✔ |
| `AWS_IMAGE_PUBLISHER_ROLE_ARN` | identity/control/work/school repo | `…/munaxa-<product>-image-publisher` | `aws_iam_role.publisher[...]` (`${each.key}-image-publisher`, key `munaxa-<product>`) ✔ |

Trust subjects use immutable ids `repo:munaxa@311481412/<repo>@<id>`. The live ids match the bootstrap
defaults (`repo-ids.txt`): platform 1318353961, identity 1354378376, control 1434295290, work 1318345640,
school 1318345275, owner 311481412. [V] The probe run `41168348185` showed this subject form
(`repo:munaxa@311481412/munaxa-platform@1318353961:ref:…`). [V]

A misplaced variable fails closed. If `aws-prod` lacked its environment variables, a prod job would use the
nonprod CI ARN, whose trust lists only `aws-nonprod*` subjects, and AssumeRoleWithWebIdentity would be
refused. [V by trust text]

## 3. Scheduled `aws-session.yml` runs (task 3) [V `aws-session-runs.txt`, `aws-session-jobs.txt`]

| Run | Event | Conclusion | Head | Created (UTC) | Delay after the 20:00 slot |
| --- | --- | --- | --- | --- | --- |
| 41144903826 | schedule | skipped | 329a8b9 | 2026-10-30 23:30:47 | 3 h 31 |
| 41251490157 | schedule | skipped | 9acc541 | 2026-10-31 23:11:42 | 3 h 12 |
| 41362021669 | schedule | skipped | 9acc541 | 2026-11-01 23:25:18 | 3 h 25 |
| 41563819348 | schedule | skipped | 9acc541 | 2026-11-03 02:04:35 | 6 h 05 (2 Nov slot) |
| 41747107325 | schedule | skipped | 9acc541 | 2026-11-04 00:28:44 | 4 h 29 (3 Nov slot) |

Each run has 1 job, `skipped`, with 0 steps. Total runs: 5. There is no `workflow_dispatch` run.
**No run after 4 Nov 08:59 UTC exists** (checked 10:10 UTC).

The next run is the 4 Nov 20:00 UTC slot. From GitHub's observed 3 to 6 h delay, it is expected between
about **23:00 UTC 4 Nov and 02:30 UTC 5 Nov**. It will run `00667f3`, or a later main if anything merges
first. GitHub can also drop a scheduled run. [E]

## 4. What the next scheduled `down` does, with the variables set and no nonprod stack (task 4)

The trace follows `aws-session.yml` @00667f3 step by step. The bootstrap policies quoted are from `iam.tf`
and were verified applied by G2 (phase 4 SECURITY-VERIFICATION §1).

| # | Step | Predicted behaviour | AWS side effect |
| --- | --- | --- | --- |
| 0 | Job `if` | `refs/heads/main` and a non-empty repo var: the job **runs** (or still skips if the variable is environment-only, §2.2) | none |
| 1 | Environment `aws-nonprod-session` | No reviewer, so it proceeds. GitHub creates a **deployment record**, the first evidence the environment exists. If the environment did not exist, GitHub would create it **unprotected** (G2-3); the branch policy cannot be read here [U] | none |
| 2 | checkout, setup-terraform 1.16.5 | normal | none |
| 3 | configure-aws-credentials | OIDC token: `aud=sts.amazonaws.com`, `sub=…munaxa-platform@1318353961:environment:aws-nonprod-session`, `ref=refs/heads/main` match the `munaxa-shared-ci-nonprod` trust. `role-skip-session-tagging: true`, so no `sts:TagSession` is needed (the trust grants only AssumeRoleWithWebIdentity). 3600 s ≤ max 3600 s. `allowed-account-ids` calls GetCallerIdentity | STS only (CloudTrail events) |
| 4 | Assume the deployer | CI inline policy allows `sts:AssumeRole` + `SetSourceIdentity` on the deployer; deployer trust requires `SourceIdentity=github-actions`. Expected to succeed. SecretAccessKey and SessionToken are masked; the AccessKeyId is not (not a secret) | STS only |
| 5 | Start the database | `if: SESSION == 'up'`, so **skipped** | none |
| 6 | terraform init | S3 backend `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate`, `use_lockfile=true`, deployer assumed. ListBucket for workspaces is allowed (`StateList`); providers come from the committed `.terraform.lock.hcl`. Init writes no state object | S3 List/Get only |
| 7a | plan: lock | Takes the native lock: **PutObject `nonprod/stack.tfstate.tflock`** (allowed by `State` on `nonprod/*`; state key via `StateKey`) | **1 object put** |
| 7b | plan: read state | GetObject returns NoSuchKey, so the state is empty. Provider: GetCallerIdentity via the deployer. The stack has no AWS data source (only `aws_iam_policy_document`, computed locally); `images = {}`, so no image-dependent validation fires | read only |
| 7c | plan: diff | edge/services false, empty state: **creates** for every unconditional resource, e.g. `aws_vpc.main` (network.tf:32), `aws_db_instance.main` (data.tf:78), `aws_kms_key.data`, `aws_s3_bucket.files`, `aws_ecs_cluster.main`, `aws_secretsmanager_secret.service`. The plan stays local (`-out=tfplan`) and is **not** written to S3. **Raw plan stdout goes to the public log** | none |
| 7d | plan: unlock | **DeleteObject `…tflock`**. The bucket is versioned with no noncurrent-version lifecycle (none in bootstrap `main.tf`), so a noncurrent version and a delete marker remain | **1 delete marker** |
| 7e | plan-summary.sh | Addresses and actions only, to the step summary (public) | none |
| 7f | "unexpected" filter | `aws_vpc`, `aws_db_instance`, `aws_kms_key`, `aws_s3_bucket`, … are not in the allowed type list, so `unexpected` is non-empty: `::error::the session plan changes more than the session: …`, **exit 1**. `plan.json` was already removed | none |
| 8 | Apply the switches | Default `if: success()`, so **skipped**. Nothing is applied | none |
| 9 | Stop the database | **Skipped** (prior failure, no `always()`). Had it run, `describe-db-instances` would fail on DBInstanceNotFound | none |

**Conclusion [V by trace, E for runtime]: it fails closed before any apply.** It creates and modifies no AWS
resource and no state object. Its only S3 writes are the lock put and delete, which leave version
clutter. The run concludes `failure` and notifies the owner, every night until G3 is applied. Any earlier
failure (OIDC trust, deployer, backend access, plan error) also stops it before the apply.

The ordering is also safe if G3 is partial: a partly applied state still plans creates outside the allowed
types, so the run fails closed again.

**Side note on concurrency [E].** Both workflows share the group `aws-terraform-nonprod`. GitHub keeps one
pending run per group and cancels the older pending one. A dispatched nonprod plan that is queued while a
session run is pending (or the reverse) can be cancelled, but never mid-run. The lead should not dispatch
around the session window.

### 4.4 Recommended guard (code-only, not implemented) [R]

**Value.** It turns the nightly failure into a green no-op until G3. It keeps the B3 verification (steps 1
to 4 plus a state read still run), and it avoids the lock writes.

**Placement.** Insert a step after "Assume the deployer for the database calls", before "Start the database".

```yaml
      - name: Is the nonprod stack applied?
        id: stack
        working-directory: .
        run: |
          set -euo pipefail
          export AWS_ACCESS_KEY_ID="$DEPLOYER_AWS_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$DEPLOYER_AWS_SECRET_ACCESS_KEY" AWS_SESSION_TOKEN="$DEPLOYER_AWS_SESSION_TOKEN"
          if out=$(aws s3api head-object --bucket "munaxa-shared-tfstate-$AWS_ACCOUNT_ID" --key nonprod/stack.tfstate 2>&1 >/dev/null); then
            echo "applied=true" >> "$GITHUB_OUTPUT"
          elif grep -q '(404)' <<<"$out"; then
            [ "$SESSION" = up ] && { echo "::error::the nonprod stack is not applied (G3): nothing to start"; exit 1; }
            echo "::notice::the nonprod stack is not applied yet (no state object): nothing to stop"
            echo "applied=false" >> "$GITHUB_OUTPUT"
          else
            echo "::error::cannot read the nonprod state object"; exit 1   # 403 or other: fail closed
          fi
```

Then add `steps.stack.outputs.applied == 'true'` to the `if:` of "Start the database", "terraform init"
(optional; init is read-only), "Plan the switches", "Apply the switches" and "Stop the database". Keep the
existing `env.SESSION` conditions.

- A 404, not a 403, is guaranteed because the deployer has `s3:ListBucket` on the bucket. HeadObject needs
  `s3:GetObject`, which the deployer has on `nonprod/*`. [V by policy text]
- An `up` without a stack stays a hard error. Any read error fails closed.
- It skips only when the state object is absent. An existing but empty or partial state still runs the
  plan and its filter.
- Optional extra: a tiny `aws_s3_bucket_lifecycle_configuration` expiring noncurrent `*.tflock` versions
  in bootstrap. That is a root/CloudShell change, so it is not proposed for now.

## 5. OIDC assumption history and product ECR publishing (task 5)

### 5.1 munaxa-platform [V `aws-terraform-runs.txt`, `oidc-probe-runs.txt`]

- `aws-terraform.yml`: 17 runs, all `pull_request` (`static` job, no AWS). Latest is `41205740236`
  (31 Oct 13:28, success). **0 dispatch runs.**
- `oidc-subject-probe.yml` (id 402469601, still listed active; the file is gone from branch
  `claude/project-thread-0b9ykr`): one run, `41168348185` (31 Oct 04:23, push on that branch, job
  `124440682760`). It requested a token with audience `munaxa-oidc-subject-probe` and printed
  `sub/aud/ref` claims; **no STS call**. The same probe ran once in identity `41168351504`, control
  `41168353163`, work `41168355717` and school `41168358457`.
- **No OIDC role assumption into any munaxa-shared role has ever happened.**

Indirect evidence that the `:ref` condition key works in this account [E]: the Docs bootstrap trusts also
use `token.actions.githubusercontent.com:ref` (`munaxa-docs` `infra/terraform/bootstrap/github_oidc.tf:63`,
`ecr.tf:127`). Docs OIDC runs have succeeded: `terraform-eu-prod.yml` `41797685617` (4 Nov 08:12,
success) and `publish-images.yml` `40225272398`.

### 5.2 Product publish workflows [V file reads at the SHAs above]

| Repo | Workflow | Trigger | Env-gated job | Role source | Runs |
| --- | --- | --- | --- | --- | --- |
| identity | `publish-images-ecr.yml` | `push: tags image/**` | `publish` in `image-release`, after `source` (tag must be `image/<40-hex>` = the commit, on main) | `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN`, fails if empty | 0 |
| identity | `publish-images.yml` (GHCR, Render-era) | `push: tags image/**` + dispatch | **no environment** | GHCR token | 2 (latest `34323444447`, 9 Sep, success) |
| control | `publish-images.yml` (ECR) | `push: tags image/**` | `image-release` | `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` | 0 |
| work | `publish-images-ecr.yml` | `push: tags image/**` | `image-release` | `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` | 0 |
| work | `publish-images.yml` (GHCR) | `push: tags image/**` + dispatch | **no environment** (W3/TD-10) | GHCR | 1 (`33634221986`, 2 Sep) |
| school | `publish-images-ecr.yml` | **`workflow_dispatch` only**, from an `image/<sha>` tag | `production-gate` (`deploy-gate.mjs verify-environment image-release`), then `publish` in `image-release` | `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` | 0 |
| docs | `publish-images.yml` | `push: tags image/**` | `image-release` (3 jobs) | **hard-coded** `role/munaxa-docs/bootstrap/munaxa-docs-eu-prod-image-publisher` (Docs bootstrap, retained) | 9 (latest `40225272398`) |

- **Nothing publishes on a merge to main.** Every ECR path needs an `image/*` tag (push or dispatch), and
  the publisher trusts require `environment:image-release` and `ref` like `refs/tags/image/*`. [V by
  workflow and trust text]
- The human gate is the `image-release` required reviewer, which is **[U]**. In identity, control, work
  and school, **no tag ruleset** restricts who creates `image/*` tags (`rulesets` = `[]`). If
  `image-release` lacked a reviewer, any writer's tag push would publish to ECR unattended in identity,
  control and work. School needs a dispatch, but no reviewer either. Docs has tag ruleset `25664662`
  (create/update/delete restricted; bypass: repository role id 5, which is the admin role). [V rulesets; U env]
- An identity or work release tag also fires the unprotected GHCR workflow (known W3/TD-10).
- New Docs in the shared stack pulls the `munaxa-docs/*` images published by the retained Docs-bootstrap
  role, not by a munaxa-shared publisher (bootstrap `image_repositories` has no docs). Whether that role
  still exists after the retirement is [U]; phase 5 rules say the Docs bootstrap is retained.

## 6. CI and deployment status on main; open PRs (task 6) [V `workflows-latest.txt`, `open-prs.txt`]

| Repo | main HEAD | Workflow | Latest run on main | Event | Conclusion | SHA | Created (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| platform | 00667f3 | ci.yml | 41206616329 | push | success | 1331ef8 | 10-31 13:40 |
| platform | | aws-session.yml | 41747107325 | schedule | skipped | 9acc541 | 11-04 00:28 |
| platform | | aws-terraform.yml | none on main (PR-only; latest PR run 41205740236 success) | | | | |
| platform | | release.yml | 40851584196 | dispatch | success | 354b4d6 | 10-29 09:41 |
| identity | b97b3ab | ci.yml | 41071826393 | push | success | b97b3ab | 10-30 14:28 |
| identity | | publish-images.yml | 34323444447 | dispatch | success | 7e2eb6a | 09-09 07:21 |
| identity | | publish-images-ecr.yml | no runs | | | | |
| control | a24c568 | ci.yml | 41122329528 | push | success | a24c568 | 10-30 20:20 |
| control | | publish-images.yml | no runs | | | | |
| work | da84612 | ci.yml | none on main (PR-only trigger); latest PR run 41065851607 success, 10-30 13:45 | | | | |
| work | | publish-images.yml | 33634221986 | dispatch | success | 869cceb | 09-02 13:11 |
| work | | publish-images-ecr.yml | no runs | | | | |
| school | 54cf3eb | ci.yml | none on main (PR-only); latest PR run 41069902465 success, 10-30 14:13 | | | | |
| school | | deploy.yml (Render-era) | 40861985353 | push* | **failure** (job "Apply database migrations") | b79c4fd | 10-29 11:00 |
| school | | deploy-cloudflare.yml | 40861985303 | push* | success | b79c4fd | 10-29 11:00 |
| school | | seed-environment.yml | 30805552451 | dispatch | success | 44f5d7b | 08-03 10:25 |
| school | | publish-images-ecr.yml | no runs | | | | |
| docs | b8c7e25 | ci.yml | 41797643375 | push | success | b8c7e25 | 11-04 08:11 |
| docs | | terraform-eu-prod.yml | 41797685617 | dispatch | success | b8c7e25 | 11-04 08:12 |
| docs | | publish-images.yml | none on main (tag runs; latest 40225272398 success) | | | | |

\* The API reports `push`, but both files on main today are `workflow_dispatch`-only. The trigger probably
changed afterwards; this was not investigated, as it is out of scope.

- Platform commits since `1331ef8` (#34, #35, #36) are Markdown only (`git diff --name-only`: 0 non-md
  files), so `ci.yml`'s push `paths-ignore` skipped them. That is expected, not a gap. [V]
- `00667f3` has no check runs; the PR head of #36 ran CI (`41809194833`, success, 09:39). [V]
- **Open PRs: none** in platform, identity, control, work, school or docs (10:10 UTC). The latest merged
  are platform #36, identity #4, control #7, work #27, school #23, docs #174. [V]

## 7. Branch protection and rulesets on main (task 7) [V `rulesets-deployments.txt`, `ruleset-details.txt`]

| Repo | Classic protection API | `branches/main.protected` | Rulesets on main | Tag rulesets |
| --- | --- | --- | --- | --- |
| platform | 403 | true | `20906222` "Protect main", active, **no bypass actors**: deletion, non-fast-forward, linear history, PR required (0 approvals, dismiss stale), required checks (3, strict) | none |
| docs | 403 | true | `20906159` "Protect main", active, no bypass: same rules, 7 required checks | `25664662` `refs/tags/image/*` (admin bypass) |
| identity | 403 | **false** | none (`rules/branches/main` = `[]`) | none |
| control | 403 | **false** | none (C8/TD-9 still open) | none |
| work | 403 | **false** | none | none |
| school | 403 | **false** | none; `ci.yml`'s comment says "Branch protection … gates merges", which is not true | none |

`orgs/munaxa/rulesets` returns 403. Any org ruleset targeting these repositories would still appear in
`rules/branches/main`, which is empty. [V] For public repositories with unprotected `main`, a writer's
direct push lands untested. **[O]** Protect main in identity, control, work and school (TD-9 extended), and
add an `image/*` tag ruleset there as in docs. This is not a G3 blocker; it is a pre-image-publish item.

## 8. Missing or unverified configuration (summary)

| Item | Status |
| --- | --- |
| Platform environments `aws-nonprod`, `aws-nonprod-session`, `aws-prod`, and their reviewers/branch rules | [U] owner-reported; first evidence is a deployment record from the next non-skipped run |
| Platform repo vars `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN`; `aws-prod` env vars | [U]; absent at 00:28 UTC [V] |
| `image-release` + `AWS_IMAGE_PUBLISHER_ROLE_ARN` in identity, control, work, school | [U]; no run will show it until an image tag is pushed (out of scope now) |
| munaxa-shared role assumption ever succeeded | No [V] |
| Product `main` protection (identity, control, work, school) | Missing [V] [O] |
| `image/*` tag rulesets (identity, control, work, school) | Missing [V] [R] |
| Raw `terraform plan` output in public logs | [R] decide before the first real plan dispatch |
| Session-run guard (§4.4) | [R] lead decides; Agent 3 owns the workflow |
