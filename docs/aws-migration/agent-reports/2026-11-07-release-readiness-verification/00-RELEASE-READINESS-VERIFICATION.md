# Release readiness verification: Identity and Control image publication prerequisites

- **Date:** 7 Nov 2026, 11:38 UTC onward. **Author:** the lead of the thread "Prepare Identity, Control and Work image releases".
- **Brief:** the owner's "Munaxa — Phase 1 Report Corrections and Read-Only Release Readiness Verification" (7 Nov 2026, 11:38 UTC).
- **Starting point:** platform `main` = `56640a9` (PR #64, the phase 1 report). Phase 1 report: [`../2026-11-07-testing-readiness-phase-1/00-TESTING-READINESS-PHASE-1.md`](../2026-11-07-testing-readiness-phase-1/00-TESTING-READINESS-PHASE-1.md), corrected in the same PR as this report (§12 there).
- **Labels:** **[V-gh]** verified from GitHub in this task, with the time; **[V-repo]** verified from code at the commit named; **[V-doc]** verified from public AWS documentation in this task; **[V-prior]** verified by an earlier report, not re-read in AWS; **[E]** inferred; **[U]** unverified; **[O]** owner action.

## 1. Decision

# NO-GO FOR IMAGE PUBLICATION (Identity and Control), until the conditions in §8 are evidenced

| Image | Status | Why |
|---|---|---|
| **Identity** | **BLOCKED (evidence unavailable)** | The workflow is correct in code, but none of the GitHub release controls it depends on (environment reviewers, self-review setting, tag restriction, role variable, build token) can be read from this session, and the live publisher role has not been re-read since 4 Nov |
| **Control** | **BLOCKED (evidence unavailable)** | Same, except its build token has a `GITHUB_TOKEN` fallback |
| Work | Not assessed for go/no-go (later stage) | Same controls apply |

Both become **conditionally ready** the moment the owner supplies the evidence in §8 and decides the self-review question (§6.3). No workflow has been tested: a code-reviewed workflow is not a tested one until an `image-release` run has succeeded.

## 2. What was checked, with source and time

| # | Check | Source | Time (UTC) | Result |
|---|---|---|---|---|
| 1 | `image/*` tags in identity, control, work | GitHub API (`list_tags`) | 7 Nov ~11:40 | **0** in each [V-gh] |
| 2 | Latest workflow runs in identity, control, work | GitHub API (`list_workflow_runs`) | 7 Nov ~11:40 | Newest runs unchanged since the phase 1 audit (identity CI 41992700652 of 5 Nov; control CI 41122329528 of 30 Oct; work CI 41983857218 of 5 Nov). **No ECR publish run has ever happened** [V-gh] |
| 3 | `main` of each product | Local `git fetch` and GitHub runs | 7 Nov ~11:40 | identity `5277d71`, control `a24c568`, work `b490b25`, unchanged, CI green [V-gh] |
| 4 | Phase 1 owner script (v1) | Code review | 7 Nov | Read-only and safe, with gaps (§3) |
| 5 | Config A IAM requirements | `infra/aws/stack/*.tf`, `modules/service/main.tf`, `bootstrap/iam.tf`, `iam_allow.tf`, `iam_session.tf` at `56640a9` | 7 Nov | §4 [V-repo] |
| 6 | Whether SCPs can restrict the deployer | AWS Organizations user guide | 7 Nov | "SCPs don't affect users or roles in the management account" [V-doc]; account `229251310592` is the management account of `o-6i2zz7t70i` (project record) |
| 7 | IAM action and resource tables (ECS, KMS, IAM) in the AWS Service Authorization Reference | Attempted web fetch | 7 Nov | **Could not be read** (pages returned no table content). Resource-level support claims below are therefore [U] |
| 8 | Any AWS call | — | — | **None.** The only AWS connector here is signed in as root and was not used |
| 9 | GitHub environments, variables, secrets, rulesets | — | — | Not readable from this session (no API; earlier phases got 403). Owner-only (§6) |

## 3. The owner-run read-only script

### 3.1 Review of v1 (`2026-11-07-testing-readiness-phase-1/supporting/phase1-readonly-check.sh`)

**Safe:** yes. Every AWS call is Describe, Get, List or Lookup; secrets only through `list-secrets` and `list-secret-version-ids`; no state, plan, log events or application data. **Suitable:** not fully. Against this brief it lacks:

1. A caller check. It does not stop when run as root, and the brief says not to execute it with root.
2. EC2 instance inventory (only NAT gateways and Elastic IPs).
3. ECS services by name with desired and running counts (only cluster totals).
4. KMS key metadata (only aliases).
5. The Config A deployer's IAM metadata and the account's Organizations role, needed for §4.
6. Its CloudTrail section asks for the full `CloudTrailEvent` and relies on `grep` to cut it down. It prints only time, user and error code, but a failed `grep` pattern would hide everything and the approach is brittle.

### 3.2 Corrected version (v2)

[`supporting/release-readiness-readonly-check.sh`](supporting/release-readiness-readonly-check.sh), sha256 `30d6c178b10fb6333a58196c1ace8bffb850a052b4dcb28cac354e5d4111f6e4`. It replaces v1 for this purpose and covers every item in the brief:

| Brief item | Section |
|---|---|
| Caller identity and account (stops if not `229251310592`; stops if root unless the owner sets `ALLOW_ROOT_READONLY=yes`) | 0 |
| Organizations role of the account (management account check) | 0 |
| ECR repositories (mutability, scan, encryption) and image counts, digests, tags | 1 |
| Publisher roles: existence, path, trust, boundary, inline and attached policies | 2 |
| Secrets Manager: container names and version counts only | 3 |
| KMS aliases and `DescribeKey` metadata (spec, usage, state, manager) | 4 |
| ACM status, `InUseBy`, `RenewalEligibility` | 5 |
| RDS state; ECS cluster, services by name, desired and running counts; ALB, NAT gateway, EC2 instance and Elastic IP inventory | 6 |
| Backstop schedules; recent `StopDBInstance` and `UpdateService` calls (time and user only) | 7 |
| Deployer role, its inline and managed policy documents, and the workload boundary (for §4) | 8 |

Commands used, all read-only: `sts get-caller-identity`, `organizations describe-organization`, `ecr describe-repositories|describe-images`, `iam get-role|get-role-policy|list-role-policies|list-attached-role-policies|get-policy|get-policy-version`, `secretsmanager list-secrets|list-secret-version-ids`, `kms list-aliases|describe-key`, `acm list-certificates|describe-certificate`, `rds describe-db-instances`, `ecs describe-clusters|list-services|describe-services|list-task-definition-families`, `elbv2 describe-load-balancers`, `ec2 describe-nat-gateways|describe-instances|describe-addresses`, `scheduler list-schedules`, `cloudtrail lookup-events`. Checked: `bash -n` passes; no create, put, update, delete, start, stop, tag, run, simulate or get-secret-value verb appears.

### 3.3 The identity problem: no approved non-root read-only identity exists

The brief asks for an "approved read-only identity". Under the recorded owner decisions (29 Oct 2026: root until launch, no Identity Center, no IAM users or access keys), **this account has none**. The GitHub OIDC roles (CI, deployers, publishers) cannot be assumed from CloudShell. So fresh AWS evidence needs one of:

- **(a)** The owner decides to run v2 in CloudShell as root, read-only, as on 6 Nov, by setting `ALLOW_ROOT_READONLY=yes`. This is a deviation from "do not execute it with root" that only the owner can accept.
- **(b)** The owner creates a read-only identity first. That changes the root-only decision and IAM, which this task must not do or recommend as routine.
- **(c)** No AWS refresh. AWS facts stay at 6 Nov 21:21 UTC [V-prior] and every AWS-dependent condition in §8 stays unverified.

This report does not choose. Until (a) or (b) happens, §8 conditions C-6 and C-7 stay **[U]**.

### 3.4 Owner instructions (if (a) or (b) is chosen) [O]

1. Open AWS CloudShell in `eu-central-1` (console top bar → CloudShell).
2. Fetch the script from `main` after this PR merges, or from the PR branch before. Check its hash:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-07-release-readiness-verification/supporting/release-readiness-readonly-check.sh
   sha256sum release-readiness-readonly-check.sh   # must print 30d6c178b10fb6333a58196c1ace8bffb850a052b4dcb28cac354e5d4111f6e4
   ```

   (The repository is private, so if `curl` returns 404, copy the file from GitHub in the browser and paste it into `nano release-readiness-readonly-check.sh`, then check the hash.)
3. Read it once. Then run it:
   - as a read-only identity: `bash release-readiness-readonly-check.sh 2>&1 | tee /tmp/release-readiness-check.log`
   - as root, only if you chose (a): `ALLOW_ROOT_READONLY=yes bash release-readiness-readonly-check.sh 2>&1 | tee /tmp/release-readiness-check.log`
4. Paste the whole log into the thread. It holds no secret value. Do not paste anything else from CloudShell.

---

## 4. IAM readiness assessment for Config A

**The mocked Terraform test is not evidence of AWS permissions.** It uses a mocked provider and proves only that the configuration validates. Everything below is from code [V-repo] and earlier AWS evidence [V-prior]; nothing was simulated or run.

### 4.1 Who runs Config A

- **Executing role:** `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod` (`bootstrap/iam.tf` 190 to 197). `aws-terraform.yml` assumes the CI role `munaxa-shared-ci-nonprod` through GitHub OIDC in the `aws-nonprod` environment, which assumes the deployer with source identity `github-actions` (`iam.tf` 172 to 188; workflow lines 120 to 179).
- **Policies (code):** inline `deployer` (state access and guardrail denies, `iam.tf` 201 to 503); managed `munaxa-shared-deployer-read` (reads), `munaxa-shared-deployer-nonprod-allow-tagged` and `munaxa-shared-deployer-nonprod-allow` (writes, `iam_allow.tf`).
- **Permissions boundary on the deployer:** none in code. Live state [U] until v2 §8.
- **SCPs:** do not apply. The account is the Organizations management account, and SCPs don't affect users or roles in the management account [V-doc].
- **Later, not Config A:** the session deployer `munaxa-shared-deployer-nonprod-session` creates ECS services, target groups and Cloud Map services at `up` (`iam_session.tf`).

### 4.2 Actions Config A needs, against the policies

"Exercised" means the same action and pattern already succeeded in a real apply (G3, recovery or backstop).

| # | Resources (Config A) | Actions | Allowing statement | Denies that could apply | Exercised in AWS? | Status |
|---|---|---|---|---|---|---|
| 1 | 5 log groups `/munaxa/nonprod/{identity,identity-migrate,control-api,control-migrate,control-portal}` | `logs:CreateLogGroup`, `PutRetentionPolicy`, `TagResource`, `ListTagsForResource` | `OwnNames` (`logs:*` on `log-group:/munaxa/nonprod/*`) | `CreatesCarry*` (tags present through provider `default_tags`) | Yes, G3 (`/munaxa/nonprod/ops`) | **Likely OK [E]** |
| 2 | Roles `munaxa-nonprod-<service>-execution`, `munaxa-nonprod-control-api-task`, `munaxa-nonprod-identity-bootstrap-execution`, path `/munaxa-shared/`, boundary `munaxa-shared-workload-boundary` | `iam:CreateRole`, `TagRole`, `PutRolePolicy`, `GetRole*`, `ListRole*` | `OwnRolesWithOwnBoundary` (requires that boundary), `ManageOwnRoles` | `NeverMunaxaDocsOrBootstrap` (only `role/munaxa-shared/bootstrap/*`, not these) | Yes, G3 (db-admin roles), backstop role | **Likely OK [E]** |
| 3 | Security groups `munaxa-nonprod-<service>` and their rules; ingress rules on the database security group | `ec2:CreateSecurityGroup`, `AuthorizeSecurityGroupIngress/Egress`, `RevokeSecurityGroupEgress`, `CreateTags` | `Ec2CreateSecurityGroup`, `Ec2CreateRule`, `Ec2TagOnCreate`, `OwnTagged` (`ec2:*` on tagged resources) | `CreatesCarry*` (security groups are excluded as parents since platform #55) | Yes, G3 recovery | **Likely OK [E]** |
| 4 | Task definitions `munaxa-nonprod-identity`, `-identity-migrate`, `-identity-bootstrap`, `-control-api`, `-control-migrate`, `-control-portal`, `-db-admin` | `ecs:RegisterTaskDefinition`, `TagResource`, `DescribeTaskDefinition` | `OwnNames` (`ecs:*` on `task-definition/munaxa-nonprod-*`) | `CreatesCarry*` (`ecs:RegisterTaskDefinition` is a tagged create; tags present) | **No**: no task definition has ever been registered | **[U]**. Works only if ECS authorizes `RegisterTaskDefinition` against the task-definition ARN. If it authorizes against `*`, the name-scoped allow does not match and the apply fails here. The authorization reference could not be read in this task |
| 5 | Pass the execution and task roles to ECS | `iam:PassRole` (`iam:PassedToService = ecs-tasks.amazonaws.com`) | `PassOwnRoles` | none | **No** for ECS (only to Scheduler, backstop) | **Likely OK [E]**, unexercised |
| 6 | `aws_kms_key.licence` (ECC_NIST_P256, SIGN_VERIFY) | `kms:CreateKey` with tags, `TagResource`; then `DescribeKey`, `GetKeyPolicy`, `GetKeyRotationStatus`, `ListResourceTags` | `CreateWithOwnTags`; `OwnTagged` (and the key policy's account statement) | `CreatesCarry*` (tags present) | Symmetric key yes (G3 data key); **asymmetric no** | **Likely OK [E]**; `GetKeyRotationStatus` on an asymmetric key is [U] (provider behaviour) |
| 7 | `aws_kms_key_policy.licence` | `kms:PutKeyPolicy` | `OwnTagged` | KMS lockout safety check (the new policy grants the account root `kms:PutKeyPolicy`, which delegates to IAM, so the deployer keeps it [E]); the policy names the new `control-api` task role, which must already exist and be visible to KMS [E] | **No** (the data key's policy is set at creation) | **[U]** |
| 8 | `alias/munaxa-nonprod-control-licence` | `kms:CreateAlias` (authorized on the alias and the key) | `OwnNames` (alias), `OwnTagged` (key) | `NeverSharedAliases` covers only `alias/munaxa-shared-*` | Yes (G3 `alias/munaxa-nonprod-data`) | **Likely OK [E]** |
| 9 | Refresh of all the above by later plans, including session plans | `ecs:Describe*`, `iam:GetRole*`, `kms:DescribeKey`, `GetKeyPolicy`, `GetKeyRotationStatus`, `ListResourceTags`, `logs:Describe*` | `deployer_read`; session `RefreshOwnKeys`, `RefreshOwnRoles` | none | Partly | **Likely OK [E]** |

**Not in Config A** (session `up`, session deployer): ECS services, the control-api Cloud Map service, target groups, listener rules, ALB. These were also never exercised and carry the same kind of risk at the first `up`.

**Workload boundary for the new roles** [V-repo `iam.tf` 38 to 165]: allows ECR pull from `munaxa-*`, logs to `/munaxa/nonprod/*`, `GetSecretValue` on `munaxa-nonprod/*` and the nonprod RDS master secret, `kms:Decrypt` and `kms:Sign` on keys tagged Project `munaxa` and Environment `nonprod`. So the control-api task role's `kms:Sign` on the licence key fits inside the boundary [E].

### 4.3 What only an authorized simulation or owner evidence can settle

| # | Item | How to settle |
|---|---|---|
| U-1 | Live deployer policies equal the code (managed policy default versions, inline policy, no boundary) | v2 §8 output, compared against the code at `56640a9` |
| U-2 | `ecs:RegisterTaskDefinition` matches a name-scoped resource | AWS Service Authorization Reference (ECS), or an owner-run `iam simulate-principal-policy` for the deployer with resource `arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-nonprod-identity:1` and request tags Project `munaxa`, Environment `nonprod` |
| U-3 | `kms:PutKeyPolicy` with this policy passes the lockout check | Only a real apply shows it. The simulator does not run the KMS lockout check |
| U-4 | `iam:PassRole` to `ecs-tasks.amazonaws.com` | Simulation, as U-2 |
| U-5 | Provider's `GetKeyRotationStatus` handling on an asymmetric key | Provider source or the first real apply |

A simulation is a separate owner-approved step (it is read-only but uses the account's IAM). It is not prepared as a script here; it can be on request. Earlier simulations missed real failures (G3's parent-VPC deny), so a clean simulation lowers the risk without removing it. The G3 recovery approach still applies: stop at the first AccessDenied, decode it, fix in code, re-apply.

**IAM verdict for Config A: NOT VERIFIED.** No policy change is proposed. U-2 is the most likely point of failure.

---

## 5. Verified and unverified findings

### 5.1 Verified in this task

- 0 `image/*` tags and 0 ECR publish runs in identity, control and work (7 Nov ~11:40 UTC) [V-gh].
- Product mains unchanged and green: identity `5277d71`, control `a24c568`, work `b490b25` [V-gh].
- The three publish workflows reference an environment named `image-release`, build only from `image/<40-hex SHA>` tags on commits on `main`, and stop if `AWS_IMAGE_PUBLISHER_ROLE_ARN` is empty [V-repo].
- The publisher roles' code trust requires the `image-release` environment subject and an `image/*` tag ref; their code policies allow pushing only to their own product's repositories [V-repo].
- v1 is read-only; v2 is read-only and covers the brief [V-repo].
- SCPs cannot restrict the deployer (management account) [V-doc].

### 5.2 Unverified

| Item | Last evidence |
|---|---|
| `image-release` exists in each repository, its required reviewers, "Prevent self-review", deployment branch and tag rules, admin bypass | Owner said "done" on 4 Nov (phase 4) for environment and variable; settings never read |
| `AWS_IMAGE_PUBLISHER_ROLE_ARN` present and correct in each repository | Same |
| `PLATFORM_PACKAGES_TOKEN` present and valid (identity, work) | Identity CI used it successfully on 5 Nov; work's last proof 2 Sep |
| `image/*` tag rulesets | Proposed in phase 7, never confirmed |
| Live publisher roles (trust and policies) | Verified live in phase 4 (31 Oct to 4 Nov) [V-prior] |
| ECR images, secret versions, KMS, ACM, RDS, ECS state | Owner read 6 Nov 21:21 UTC [V-prior] |
| Deployer permissions for Config A | Never simulated or exercised for items 4, 5, 7 |

---

## 6. GitHub release-environment verification (owner) [O]

Only the owner can see these settings. Change nothing while checking. Do the steps in **munaxa-identity**, **munaxa-control** and **munaxa-work**, and report what you see for each.

### 6.1 Steps

| # | Where | Check | Expected |
|---|---|---|---|
| G-1 | Settings → Environments | An environment named exactly `image-release` exists | Present |
| G-2 | `image-release` → Deployment protection rules | "Required reviewers" ticked; who is listed | At least one reviewer (see §6.3) |
| G-3 | Same | "Prevent self-review" ticked or not | Report as is (see §6.3) |
| G-4 | Same | "Allow administrators to bypass configured protection rules" | **Off** |
| G-5 | `image-release` → Deployment branches and tags | Setting and rules | "Selected branches and tags", with one **tag** rule `image/*` and no branch rule |
| G-6 | `image-release` → Environment secrets and variables | Anything defined there | Nothing expected (a value here would override the repository one) |
| G-7 | Settings → Secrets and variables → Actions → **Variables** | `AWS_IMAGE_PUBLISHER_ROLE_ARN` and its value (a role name, not a secret) | identity: `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`; control: `…/munaxa-control-image-publisher`; work: `…/munaxa-work-image-publisher` |
| G-8 | Same page → **Secrets** | `PLATFORM_PACKAGES_TOKEN` listed, and its "Updated" date. **Never open, copy or paste the value** | Listed |
| G-9 | Your GitHub account (or the machine account that owns the token) → Settings → Developer settings → Personal access tokens | The token used for `PLATFORM_PACKAGES_TOKEN`: its expiry date and that it has `read:packages` for the munaxa organization. The page shows metadata only, never the token | Not expired; `read:packages` |
| G-10 | Settings → Rules → Rulesets | A ruleset targeting **tags** with pattern `refs/tags/image/*` (or `image/*`): enforcement Active; "Restrict creations", "Restrict updates", "Restrict deletions"; bypass list | Active; only the owner (or nobody) can create `image/*` tags; updates and deletions blocked |
| G-11 | Settings → Rules → Rulesets (branch) | A `main` ruleset requiring pull requests and the CI checks | Present (product `main` rulesets were also proposed in phase 7) |

Screenshots of these pages are fine to share: none of them shows a secret value.

### 6.2 Token validity without exposing it

- G-9 shows the expiry and scopes without the value.
- For identity, a green CI run proves the token works, because identity CI uses it with no fallback. The latest such run is 5 Nov. A newer proof needs a new CI run (for example, the next identity PR). Do not dispatch a publish to test it.
- For work, CI falls back to `GITHUB_TOKEN`, so CI cannot prove it. Rely on G-8 and G-9.
- Control's build falls back to `GITHUB_TOKEN` too; it needs the token only if the platform packages are not granted to the control repository.

### 6.3 Self-review: a separation-of-duties risk, not a routine setting

If "Prevent self-review" is off, the person who pushes the `image/*` tag can also approve the publish. One person then controls both steps, and the environment no longer separates duties. Prefer adding a second authorized reviewer to `image-release`. If there is no second reviewer, allowing self-review needs the owner's **explicit acceptance of this risk**, recorded in the thread and **limited to non-production Testing**. If "Prevent self-review" is on and the owner is the only reviewer, the owner cannot approve their own tag's run, so the publish would wait forever. That is safe, but it blocks publication.

---

## 7. Remaining blockers

| # | Blocker | Owner of the next step |
|---|---|---|
| RB-1 | GitHub release controls unverified (§6, G-1 to G-10) | Owner |
| RB-2 | Self-review decision (§6.3): second reviewer, or explicit Testing-only risk acceptance | Owner |
| RB-3 | No approved non-root read-only AWS identity; choose §3.3 (a), (b) or (c) | Owner |
| RB-4 | Live publisher role state not re-read since 4 Nov (v2 §2) | Owner, after RB-3 |
| RB-5 | Config A IAM not verified (U-1 to U-5). Blocks Config A, **not** image publication | Owner and lead |
| RB-6 | From phase 1, unchanged: Cloudflare Access application, Identity signing key, secret values, Valkey and PostgreSQL digests, product DNS, no deployment or smoke test | Owner |

## 8. Conditions for GO (Identity, then Control)

Publication of a product's images becomes **conditionally ready** when all of these are evidenced in the thread:

| # | Condition | Evidence | Identity | Control |
|---|---|---|---|---|
| C-1 | `image-release` exists with at least one required reviewer, admin bypass off | G-1, G-2, G-4 | [U] | [U] |
| C-2 | Deployment restricted to `image/*` tags | G-5 | [U] | [U] |
| C-3 | Self-review resolved (second reviewer, or recorded Testing-only acceptance) | §6.3 | [U] | [U] |
| C-4 | `AWS_IMAGE_PUBLISHER_ROLE_ARN` equals the expected ARN | G-7 | [U] | [U] |
| C-5 | Build token present and unexpired | G-8, G-9 | [U] | [U] (fallback exists) |
| C-6 | Live publisher role trust and policy equal the code | v2 §2 | [U] (last [V-prior] 4 Nov) | [U] (same) |
| C-7 | ECR repositories exist, IMMUTABLE, and hold no image for the release SHA | v2 §1 | [U] (6 Nov: 0 images) | [U] (same) |
| C-8 | `image/*` tag ruleset restricts who can create tags | G-10 | [U] (recommended; not required by the workflow) | [U] |
| C-9 | The owner approves the release at the named SHA (identity `5277d7190b3dda496443c4bd7d80c78bd4d9174e`, control `a24c5681f0ca98f446098444c79bc36cd4d9bc0c`) | Thread | Pending | Pending |

With C-1 to C-7 and C-9 met, publication is **GO** for that product. Until then it is **NO-GO**. Config A additionally needs RB-5 and RB-6.

## 9. What this task did and did not do

- **Did:** read the merged phase 1 report, index and supporting files; re-read GitHub tags and runs; reviewed the script and wrote v2; assessed Config A IAM from code; wrote owner instructions; corrected the phase 1 report (§12 there); added an index entry.
- **Did not:** make any AWS call (the root connector was not used); publish images, push tags or trigger workflows; change IAM, KMS, Secrets Manager, Cloudflare, DNS, certificates, GitHub settings, Render, Supabase or production; run Terraform plan or apply. CanteenHub was not inspected, inventoried or touched.
