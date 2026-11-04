# 06 - Independent security and architecture review (Phase 5, Stage 1)

Reviewer: Agent 6 (independent). Date: 2026-11-04, written ~10:30 UTC. Read-only: no AWS call, no
dispatch, no push, no GitHub post. AWS MCP connector not used.

Labels: [V] verified (how stated), [E] estimated / inferred from code, [R] recommended,
[U] unverified or inaccessible, [O] owner action.

## 0. Baseline and evidence

- munaxa-platform `origin/main` = `00667f31493b1e8ba4380ddc3f49efce3abffc11` (#36), reviewed in a
  detached worktree. File SHA-256s: `evidence/06/01-baseline-sha256.txt` [V].
- munaxa-platform is a **public** repository (`visibility: public`, id 1318353961, owner id 311481412):
  `evidence/06/02-repo-visibility.json` [V].
- `main` ruleset 20906222 (`Protect main`, active, no bypass actors): PR required with
  `required_approving_review_count: 0`; required status checks are only the three CI contexts
  (Lint/Typecheck/Test/Build, Accessibility, Facades). **The AWS Terraform job (fmt/validate/mocked
  tests/intent validation) is not a required check**: `evidence/06/03-main-ruleset.json` [V].
- Environments, variables and branch-protection APIs return 403 here (`evidence/06/06-environments-api.txt`):
  every statement on environment reviewers, deployment-branch rules and variable values is [U]
  (owner-reported 4 Nov 08:59 UTC per phase 4 MASTER-EXECUTION-STATUS).
- aws-session.yml runs: all scheduled runs to 41747107325 (2026-11-04T00:28:44Z) **skipped**;
  scheduled for `0 20 * * *` but started 23:11, 23:25, 23:30, 00:28, 02:04 UTC, i.e. **3 h 11 min to
  6 h 04 min late**: `evidence/06/04-aws-session-runs.tsv` [V]. No run has used the shared CI roles yet [V].
- The four product repositories return **0 rulesets** each: `evidence/06/05-product-rulesets-count.txt`
  [V] (classic branch protection not readable, 403 [U]).
- Docs run 41797685617 / job 126465632564 (2026-11-04T08:18Z) shows `Authenticated as assumedRoleId
  ...:gha-run-41797685617` through a trust of the same shape as the shared CI roles (aud, immutable
  `owner@id/repo@id` sub with `:environment:`, `ref = refs/heads/main`), and its public log prints the
  full plan attributes of the retained Docs data key, including `tags_all` `Project = MunaxaDocs`:
  `evidence/06/08-docs-run-41797685617-excerpt.txt` [V].

## 1. G2 resources vs code, and the platform#33 fix

- Code count at `00667f3` with default variables: state 8 + ECR 22 (11 repos + 11 lifecycle) + IAM 17
  (boundary 1, deployer 2+2, CI 2+2, publishers 4+4) + budgets 2 = **49**, equal to the G2 report's
  `49 added` and the four `read` data sources (OIDC provider + deferred policy documents)
  (`evidence/06/09-resource-count.txt`) [V code; live AWS state [U], only the G2 CloudShell outputs].
- `git diff 351352a..1331ef8 -- infra` touches only `bootstrap/iam.tf` and its test; the change adds
  `Null aws:ResourceTag/Project = false` and `Null aws:RequestTag/Project = false` to the two
  "another project" denies [V]. The logic is right: a negated operator on a missing key evaluated true
  and denied everything untagged. The consequence (stated honestly in code and reports) is that
  **untagged resources are outside every Project deny** [V]. I agree with the fix and with G2-1's
  Medium/fail-closed rating.

## 2. Findings

### H-1 (High, latent until prod exists) The workload boundary is shared by both environments, so the nonprod deployer can mint a role that reads production secrets and buckets

Evidence (`bootstrap/iam.tf`, [V] by code):
- One boundary `munaxa-shared-workload-boundary` for both environments. It allows
  `secretsmanager:GetSecretValue` on `munaxa-nonprod/*`, **`munaxa-prod/*`** and **`rds!*`** (every RDS-
  managed master secret in the account, prod included), `kms:Decrypt`/`kms:Sign` on `key/*`, S3 object
  read/write on `munaxa-nonprod-*` **and `munaxa-prod-*`**, and `ecs:RunTask` + `iam:PassRole` on `*`.
- The nonprod deployer may `iam:CreateRole` under `role/munaxa-shared/*` with that boundary and then
  `iam:PutRolePolicy` / `iam:UpdateAssumeRolePolicy` **with any content** (`ManageSharedRoles`).
  Only `role/munaxa-shared/munaxa-prod-*` and `bootstrap/*` are denied by name; a role named e.g.
  `munaxa-shared/x` is not. No condition constrains the trust policy, so it can name `ecs-tasks`,
  the deployer itself, or **an external AWS account**.
- The deployer's `NeverTheOtherEnvironment*` denies apply to the deployer's own calls only, not to
  the role it creates. Prod data keys use the `AccountAdministration` root statement (data.tf), so
  IAM alone decides decrypt.
- Path: nonprod deployer -> CreateRole (boundary attached, untagged or Environment=nonprod) ->
  PutRolePolicy `GetSecretValue munaxa-prod/*`, `kms:Decrypt *` -> run a Fargate task in the nonprod
  cluster (deployer has `ecs:*` and PassRole on `munaxa-shared/*`; the task has a public IP and egress
  443) or let an external principal assume it. Result: production secrets and production file
  objects from a non-production credential. This contradicts the R-17 claim in iam.tf lines 5-7.
- Not simulated (no AWS access) [U]; the reasoning is standard IAM evaluation [E].

[R] Two boundaries, `munaxa-shared-workload-boundary-nonprod` / `-prod`, each listing only its own
`munaxa-<env>/*` secrets, `munaxa-<env>-*` buckets, its own keys (by tag `aws:ResourceTag/Environment`)
and, for `rds!*`, a `secretsmanager:ResourceTag/Environment` or `aws:ResourceTag` condition; the
deployer's `iam:PermissionsBoundary` condition pinned to its own environment's boundary; a deny in each
boundary on `sts:AssumeRole` and `iam:PassRole` to anything not `munaxa-shared/munaxa-<env>-*`; and
require role names `munaxa-shared/munaxa-<env>-*` on CreateRole (resource ARN pattern) so the name
denies work. Trust content cannot be constrained by IAM condition keys; the boundary is the control.

### H-2 (High) The nonprod deployer can schedule deletion of, or rewrite the policy of, the shared Terraform state key

- `StackServices` grants `kms:PutKeyPolicy`, `kms:ScheduleKeyDeletion`, `kms:CreateGrant`,
  `kms:UpdateAlias`, `kms:DeleteAlias`, `kms:TagResource`/`UntagResource` on `*` [V code].
- The state key `aws_kms_key.state` carries the bootstrap default tags `Project = munaxa`,
  `Stack = shared-bootstrap`, `ManagedBy = ...` and **no Environment tag** (bootstrap/providers.tf) [V
  code]. None of the deployer denies matches it: not Docs-tagged, Project = munaxa, no Environment
  tag, and the name denies list no `kms:` ARN [V code].
- So either deployer (nonprod included, and nonprod is reachable without a reviewer, see H-3) can
  `ScheduleKeyDeletion` (7-30 days) on the key that encrypts **nonprod, prod and bootstrap state and
  every saved plan**, or `PutKeyPolicy` to grant an external account decrypt or to make itself the
  only key administrator. `kms:CancelKeyDeletion` is not granted, so recovery needs root, and
  security monitoring is deferred, so nothing would alert [E].
- The same applies to every customer key that has no `Environment = <other env>` tag, e.g. any key
  created untagged.

[R] Add to both deployers a deny on every `kms:*` except `Encrypt`/`Decrypt`/`GenerateDataKey`/
`DescribeKey` for `aws_kms_key.state.arn` (the Docs bootstrap already does exactly this:
`ProtectStateKeyByArn`), and deny `kms:PutKeyPolicy`/`ScheduleKeyDeletion`/`CreateGrant` unless
`aws:ResourceTag/Environment` equals the deployer's own environment.

### H-3 (High in combination) The reviewer gate on `aws-nonprod` is bypassable through `aws-nonprod-session` and an unreviewed merge

- The nonprod CI role trusts both `:environment:aws-nonprod` (reviewer, owner-reported [U]) and
  `:environment:aws-nonprod-session` (by design no reviewer) and both lead to the **same full nonprod
  deployer** [V code].
- `main` requires a PR but **0 approvals**, and the AWS Terraform checks are not required [V,
  ruleset]. Any workflow merged to main that declares `environment: aws-nonprod-session` gets the full
  nonprod deployer with no environment approval; with H-1/H-2 that reaches prod secrets and the
  shared state key. The ref condition (main) and deployment-branch rule (main only, [U]) do not help,
  because the code is on main.
- [R] Give the session its own role chain: a `munaxa-shared-session-nonprod` deployer allowed only
  `rds:StartDBInstance`/`StopDBInstance`/`DescribeDBInstances` on `munaxa-nonprod-pg`, ELB/ECS/
  Cloud Map/SG-rule actions on Environment=nonprod resources, and state read/write; keep the full
  deployer behind `aws-nonprod` only. [R] Make the `Format, validate, mocked plan tests` check required
  for `infra/aws/**` changes. [O] Decide whether 0 required approvals stays acceptable for a repository
  whose main branch can obtain AWS credentials.

### M-1 (Medium) B2/TD-14: what the nonprod deployer can still reach outside its scope

[V code; effects [E], no simulation possible here]:
- **Untagged resources** of any kind in eu-central-1 (`ec2:*`, `elasticloadbalancing:*`, `ecs:*`,
  `rds:*`, `logs:*`, `acm:*`, `servicediscovery:*`, `scheduler:*`, `cloudwatch:*`, secrets
  Create/Delete/Update, KMS admin): including the default VPC and its subnets/SGs.
- **Creating untagged resources** is allowed: the `RequestTag` denies use `Null = false`, so a
  request without a Project tag passes, and nothing requires `aws:RequestTag/Project = munaxa` on
  create. Every untagged resource the deployer creates is then outside every tag deny itself.
- **Account/region-level settings** with no resource tag: `ec2:DisableEbsEncryptionByDefault`,
  `ec2:ModifyEbsDefaultKmsKeyId`, `ec2:ModifyInstanceMetadataDefaults`,
  `ec2:DisableImageBlockPublicAccess`, `ec2:DisableSnapshotBlockPublicAccess`,
  `ec2:ModifyVpcBlockPublicAccessOptions`, `ec2:EnableSerialConsoleAccess`, `ec2:CreateDefaultVpc`,
  `rds:ModifyCertificates` (default CA override), `ecs:PutAccountSettingDefault`,
  `logs:PutAccountPolicy` (account-wide subscription filter / data protection policies) and
  `logs:PutResourcePolicy`.
- **Data egress** of nonprod data: `rds:CreateDBSnapshot` + `rds:ModifyDBSnapshotAttribute` to another
  account together with `kms:PutKeyPolicy`/`CreateGrant` on the nonprod data key;
  `ec2:ModifySnapshotAttribute`; VPC peering to another account. Nonprod holds no copied data (fixed
  fact), so impact is limited today.
- **Route 53**: `CreateHostedZone`/`DeleteHostedZone`/`ChangeResourceRecordSets` on `*`; Route 53 does
  not evaluate `aws:ResourceTag` for these [E, verify against the Service Authorization Reference], so
  every hosted zone in the account is reachable regardless of tags.
- `iam:PassRole` has no `iam:PassedToService` condition; `iam:CreateServiceLinkedRole` covers every
  service [V code]. Low on their own.
- **Tag-deny coverage is per action**: a `aws:ResourceTag` deny only works where the action supports
  the key. Prod isolation of resources with generated IDs (SGs, subnets, target groups, listeners,
  task definitions, Cloud Map) depends on that support [E]; name patterns cover only IAM, secrets,
  S3, RDS instances, ECS clusters, log groups and state.
- The account is the **Organizations management account** (CLAUDE.md): SCPs never apply to it, so
  none of the above can be fixed by an SCP; only IAM policies and boundaries can (and AWS guidance is
  not to run workloads in the management account) [V fact, O decision].
- Retained Docs bootstrap: Docs roles live under `/munaxa-docs/` (Docs bootstrap `locals.tf`) and are
  denied by name [V code]. The pending-deletion Docs data key carries `Project = MunaxaDocs` (Docs run
  41797685617 plan log) so `NeverMunaxaDocsProductionByTag` covers it [V tag at 08:18 UTC; deny V code].
  The final snapshot `munaxa-docs-eu-prod-pg-final` is **not** covered by any name deny
  (`db:munaxa-docs*` does not match `snapshot:`); it is covered only if it carries
  `Project = MunaxaDocs`, which `copy_tags_to_snapshot = true` in the deleted Docs `rds.tf`
  (munaxa-docs `1f47ba4^`) makes likely [E], not checked live [U]. [R] add
  `arn:aws:rds:${region}:${account}:snapshot:munaxa-docs*` and `cluster-snapshot:munaxa-docs*` to
  `NeverMunaxaDocsOrBootstrap`.
- Contrast: the retained Docs deployer is an **allow-list** keyed on `aws:RequestTag/Environment =
  Production` / `aws:ResourceTag/Environment = Production` per action family, plus `ProtectStateKeyByArn`
  and `NeverChangeProtectedVpcs` (munaxa-docs `infra/terraform/bootstrap/policies/*.json.tftpl`) [V].
  That is a working in-repo template for the B2 fix.

[R] B2: replace `ec2:*`/`elasticloadbalancing:*`/`ecs:*`/`rds:*`/`logs:*`/`acm:*`/`servicediscovery:*`/
`scheduler:*`/`cloudwatch:*` on `*` with: create actions allowed only with `aws:RequestTag/Project =
munaxa` and `aws:RequestTag/Environment = <own env>` (plus `ec2:CreateAction`-scoped CreateTags);
mutate/delete allowed only with `aws:ResourceTag/Environment = <own env>`; Describe/List/Get read-only
on `*`; explicit denies on the account-level actions listed above; and the state key deny of H-2.

### M-2 (Medium, cost) The evening backstop fails open on cost

[V code, aws-session.yml]:
- "Stop the database" is the **last** step and runs only if the switch plan passes the type filter and
  the apply succeeds. Any drift outside the session types (a provider upgrade diff, a tag change, a
  task definition update, an out-of-band console edit), an apply error, or a credential expiry
  leaves the database **running**, and the next evening's run fails the same way, indefinitely.
- `up` starts the database **before** the plan is checked; a failing plan leaves it running.
- Schedule lag 3-6 h observed (section 0), so "20:00 UTC" is in practice up to ~02:00 UTC [V].
- GitHub disables schedules in public repositories after 60 days without repository activity [E,
  GitHub documented behaviour]; the backstop then silently stops.
- Concurrency group `aws-terraform-nonprod` is shared with aws-terraform.yml: while an apply run waits
  for its environment approval (up to 30 days), the backstop queues behind it, and a newer queued run
  replaces an older pending one [E].
- [R] Stop the database in a separate job or step with `if: always()` for `down` (and on failure of
  `up`); add a CloudWatch/EventBridge Scheduler stop independent of GitHub; alert on a failed
  scheduled run.

### M-3 (Medium) Full Terraform plans are printed to public logs

- `aws-terraform.yml` line 167 and `aws-session.yml` line 117 run `terraform plan` with stdout to the job
  log; the repository is public [V]. The comment "Addresses and actions only: no attribute value
  reaches the summary" is true for the step summary only. The Docs run 41797685617 log shows what this
  looks like: key ARNs, the full key policy JSON, tags [V]. For the stack that includes container
  environment values, SG/subnet IDs, hostnames, ARNs, `operator_cidrs`. Sensitive-marked values stay
  hidden [E]. [R] `terraform plan -out=tfplan >/dev/null` (or `| grep '^Plan:'`) and keep the
  sanitized summary; the reviewer reads `terraform show tfplan` only where needed.

### M-4 (Medium, architecture) Workloads in the Organizations management account

Fixed fact; noted because it removes SCPs as a defence for every finding above and concentrates
billing/Organizations blast radius with the workload. The deployer denies `organizations:*` and
`account:*` [V code]. [O] Member accounts before production.

### L-1 (Low) Intent enforcement bounds addresses and actions, not content

`check-plan-intent.sh` [V code]: compares the set of `address actions` lines excluding `no-op` and
`read`. Consequences: an `update` or `create` may carry any attribute content; a resource **imported**
with no change has actions `["no-op"]` and is invisible to the check; a `forget` action cannot be
declared and therefore always fails enforcement (fail-closed); an output-only change gives exit code 2,
`changes=true`, then fails enforcement against a non-empty declaration (fail-closed). `--report` (every
`plan` dispatch) only warns and exits 0 on mismatch; `--enforce` is used only for `apply` with changes,
and refuses an empty declaration (both current declarations are empty, so **no apply is possible on
main today** [V]). It is not bypassable from a dispatch input; it is bypassable only by changing the
declaration, workflow or script on main, which H-3 makes a 0-approval PR. Compared with the Docs
workflow, the shared one has no plan-age limit (Docs: 4 h), no `--if-none-match`, and no commit
metadata on the saved plan; saved plans are never deleted (no lifecycle on `*/plans/`). Terraform's own
stale-plan check still refuses a plan whose state serial changed [E]. [R] port the Docs hardening.

### L-2 (Low) Session filter is by resource type only

The allowed types include `aws_vpc_security_group_ingress_rule` and `egress_rule` for any address
(e.g. the database SG's ingress rules) and any action [V code]. Changes still need main code. [R]
filter by address prefix and by `module.*.aws_ecs_service.this[*]`-style patterns.

### L-3 (Low) Image publishers depend on one GitHub control

Publisher trust: immutable sub `...:environment:image-release`, `ref` like `refs/tags/image/*` [V code].
The product repos have no rulesets, so any writer can push an `image/*` tag from any commit [V count];
the only gate is the `image-release` environment reviewer [U]. ECR tags are IMMUTABLE and deploys pin
digests in reviewed tfvars [V code], so impact is a pushed-but-unused image. [R] tag ruleset restricting
`image/*` creation.

### L-4 (Low, ops) One-hour credentials around long waits

CI session 3600 s; `aws rds wait db-instance-available` and `aws_acm_certificate_validation` (no
`validation_record_fqdns`; waits on Cloudflare DNS) can exceed it, leaving a failed apply and possibly a
lock file [E].

### I-1 (Info) Logs are not KMS-encrypted

The data key policy grants CloudWatch Logs and its description says "logs", but no log group sets
`kms_key_id` [V code]. Fine at Testing scale; the text is misleading.

## 3. What I verified as sound

- OIDC trusts: `aud = sts.amazonaws.com`, immutable `repo:munaxa@311481412/<repo>@<id>:environment:<env>`
  subjects, `ref = refs/heads/main` (CI) / `refs/tags/image/*` (publishers), StringEquals, no wildcard
  subject [V code; phase 4 get-role output]. That this exact shape (incl. the `ref` key) evaluates in
  IAM is shown by Docs run 41797685617 authenticating through it [V, indirect; the shared roles have not
  been assumed yet].
- CI role -> own deployer only, `sts:SourceIdentity = github-actions` required on the deployer trust,
  1 h sessions, `role-skip-session-tagging` [V code]. Prod/nonprod CI roles and deployers are separate;
  state objects by prefix, with a name deny on the other environment's prefix [V code].
- **Environment auto-creation risk** (GitHub creates a referenced, missing environment unprotected):
  for `aws-prod` it fails closed, because the prod ARNs exist only as `aws-prod` environment variables
  and the repository variables are the nonprod ARNs, whose CI role does not trust `:environment:aws-prod`
  [E from phase 4 variable layout, U live]. For `aws-nonprod` an auto-created environment would allow a
  nonprod **plan** without a reviewer; apply is refused while the declaration is empty [V code]. Owner
  reports all three environments exist [U].
- Scheduled `aws-session.yml` now that variables are set and G3 is not applied: the job-level `if`
  reads repository variables (set), so the run will start; `down` skips the database step; plan
  against an empty `nonprod/stack.tfstate` proposes the whole persistent layer, the type filter finds
  non-session types and exits 1 **before apply**, and the stop step is never reached [E from code;
  first real run expected 2026-11-04 after 20:00 UTC, [U] until its log is read]. It fails closed on
  infrastructure but will show a red run every night until G3 [R: guard on a `AWS_STACK_APPLIED`
  variable or on state existence].
- State bucket: versioning, all four public-access blocks, SSE-KMS with a dedicated rotating key and
  bucket key, BucketOwnerEnforced, TLS-only deny [V code; live per G2 CloudShell output]. Deployer state
  access: `ListBucket` bucket-wide, objects only `<env>/*`, no `DeleteObjectVersion`, no bucket-config
  actions (the bucket name does not match `munaxa-<env>-*`) [V code]. Weakness: H-2.
- Stack networking: ALB SG 80/443 from 0.0.0.0/0; task SGs ingress only from the ALB SG and named caller
  SGs; egress 443 anywhere (needed without NAT), 5432 only to the DB SG; RDS `publicly_accessible =
  false` in subnets with a local-only route table, `rds.force_ssl = 1`; default SG emptied; S3 gateway
  endpoint policy limited to the ECR layer bucket and the environment's own buckets; ECS Exec off,
  capabilities dropped [V code]. Missing by decision: flow logs, WAF [V, deferred].
- Secrets: Terraform creates containers only, values written out of band and pinned by version id;
  RDS master password RDS-managed; each execution role reads only its own bundle via
  `kms:ViaService = secretsmanager`; task roles only for Control (kms:Sign one key, ES256 digests,
  `NoOtherSigner`, `NoGrants`), School and Docs (own bucket) [V code]. No secret value in tfvars, state
  or the step summary [E]. db-admin reads the master secret and all URLs by design.
- Budgets: account US$50 (80 % and 100 % actual, 100 % forecast) and Testing US$50 on
  `user:Environment$nonprod` (needs the cost-allocation tag active; the Docs bootstrap has a
  var-gated `aws_ce_cost_allocation_tag` for Environment, whether applied [U]). Alerts are e-mail only,
  no budget action [V code]. The Docs bootstrap's `munaxa-account-monthly` and Docs budget still exist
  [U live]. RDS 7-day auto-restart is real AWS behaviour and is caught only by the nightly backstop,
  subject to M-2.

## 4. Stage 1 verdicts (provisional)

- B2/TD-14: **open**. The tag denies are correct after #33 but are a deny-list; untagged resources,
  untagged creation, account-level settings, Route 53, and above all H-1 and H-2 remain. Stage 2 will
  check Agent 2's patch against M-1, H-1 and H-2.
- G3 plan dispatch (plan only, nonprod): safe in itself (read plus state lock; apply refused by the
  empty declaration) [E]. A G3 **apply** should wait for at least H-2 and H-1, and M-2's stop step.

## 5. Stage 2 (part 1): what changed since Stage 1, verified

New baseline: munaxa-platform `origin/main` = `c688e9ee242a46d94df09307c97fa4281da7ed78` (#37, merged
2026-11-04T11:23:07Z, parent `00667f3`). `git diff 6df77ff c688e9e` is empty, so the squash is the
reviewed PR head [V, `evidence/06/10-pr37-verification.txt`]. PR head checks: all four required + AWS
Terraform `Format, validate, mocked plan tests` success; merge-commit CI still running when read [V].

| Stage 1 item | Status after #37 | Residual |
| --- | --- | --- |
| M-2 backstop fails open on cost | **Mostly fixed** [V diff]: `Stop the database` now `always() && down && deployer ok && state exists`, waits out `starting`; `up` starts the database only after the plan check; HeadObject guard (404 -> green notice on `down`, error on `up`; 403/other -> red) | Schedule lag 3-6 h, 60-day schedule disable in a public repo, and the shared concurrency group (an apply waiting up to days for approval blocks the backstop) remain. An `up` whose apply fails after the DB start leaves it running until the next `down` (acceptable) |
| M-3 plan values in public logs | **Mostly fixed** [V diff]: `terraform plan ... > /dev/null` in both workflows; summary = addresses/actions + names of changed attributes (`plan-changed-attributes.sh`, names only, I read the jq) | `terraform apply` still prints progress lines with resource IDs and the full `Outputs:` block (`outputs.tf`: `database_endpoint`, `secret_bundles`, `certificate_validation_records`, `run_task_network`, ...), and provider errors may quote values. Not secret, but more than the comment says. [R] `-compact-warnings`, `> /dev/null` on apply plus an explicit `terraform output -json \| jq keys` |
| L-1 intent / saved plan | **Partly fixed** [V diff]: 4 h plan age limit; commit check | The commit check compares two values that are always equal within one run (`steps.keep` writes `$GITHUB_SHA`, the apply job runs the same run's `$GITHUB_SHA`, re-runs included), so it adds nothing; harmless. Still no `--if-none-match`, no plan lifecycle, address/action-only intent |
| Backend encryption (Agent 3) | **Confirmed and fixed for the stack**: Terraform 1.16.5 `client.go` sets `ServerSideEncryption = AES256` when `encrypt = true` and no `kms_key_id` [V source, `evidence/06/11-tf-s3-backend-sse.txt`] | **New issue, see H-2b.** Bootstrap's own state (`bootstrap/backend.tf`, no `kms_key_id`) is therefore SSE-S3, not SSE-KMS: this **contradicts** the phase 4 SECURITY-VERIFICATION §3 reading, which verified the bucket default, not the object [V code; object header U]. Low impact (no secrets in bootstrap state) |

### H-2b (High, introduced by #37) The state key is now addressed by an alias that the nonprod deployer may repoint

`envs/{nonprod,prod}.backend.hcl` now set `kms_key_id = "arn:aws:kms:...:alias/munaxa-shared-tfstate"`
[V, `evidence/06/13-nonprod-backend-after-37.txt`]. Both deployers hold `kms:CreateAlias`,
`kms:UpdateAlias`, `kms:DeleteAlias` on `*`; aliases carry no tags, and the current target (the state
key) matches no deny (H-2) [V code]. So the nonprod deployer can `UpdateAlias` the state alias to a key
it creates, untagged, whose key policy names the prod deployer and an outside account. Every later
prod state write would then be encrypted under that key (a key policy that names a same-account
principal is enough for KMS, whatever the prod deployer's IAM `StateKey` statement lists), readable by
the attacker [E]; or `DeleteAlias` to break every state write [E]. The Docs bootstrap avoids this with a
deny on its state alias ARN (`ProtectBootstrapIdentityStateAndAudit`). [R] either use the key ARN
(`key/679d1b6b-...`, public, not secret) in both backend files, or deny `kms:*Alias` on
`alias/munaxa-shared-*` to both deployers as part of the H-2 bootstrap change. I prefer both.

## 6. Challenges and disagreements

### Agent 1 (01-GITHUB-OIDC-CI-READINESS)

- **Agree** [V same sources]: no shared role has ever been assumed; scheduled runs all skipped, 3-6 h late;
  the `ref` key works in IAM by the Docs runs; a misplaced prod variable fails closed; the pre-#37
  `down` fails closed before apply.
- **Superseded**: §4's trace (lock put/delete, red nightly) is for `00667f3`. On `c688e9e` the guard
  stops before `init`, so tonight's run, if the variables are set, should be green with a notice and
  write nothing to S3 [E code; U until the run log exists].
- **Strengthens my L-3**: Agent 1 found `main` unprotected in identity, control, work and school
  (`branches/main.protected=false`, no rules) [V by Agent 1; consistent with my 0-ruleset count]. With
  no `image/*` tag ruleset either, the only control between a direct push to `main` and an ECR image is
  the `image-release` reviewer, which is [U]. I raise L-3 to **Medium** for the publish path (still not a
  G3 blocker: images enter the stack only by digest in a reviewed platform PR).
- **Addition**: Agent 1's concurrency note covers queued-run cancellation; it misses that a pending
  approval holds the group and so delays the backstop (M-2 residual).

### Agent 3 (03-TERRAFORM-G3-PLAN-READINESS) and the G3 expected-changes list

- **List verified** [V]: `PROPOSED-nonprod.expected-changes.json` has 64 changes, all `["create"]`, root
  `stack-nonprod`, and its address set equals `g3-expected-addresses.txt` exactly (`diff` empty). The mock
  (`zz_mock_override.tf.txt`) points every endpoint at a closed local port with a local backend, so it
  made no AWS request; with an empty state and no data source a real plan is config-only, so addresses
  and actions should be the same [E strong]. A difference would make `--enforce` refuse (fail-closed),
  so the cost of being wrong is one more PR, not an unintended change.
- I checked the list against the code: the 64 match the unconditional resources at `edge_enabled =
  false`, `services_enabled = false`, `images = {}`, `hosts.docs` set (10 bundles, 2 buckets, docs
  versioning, `docs_db_admin_execution`). `aws_default_security_group.default` "create" adopts the
  VPC default SG and strips its rules (intended) [V code].
- **Challenge 1, ACM 72-hour validation window** [E, ACM behaviour]: G3 creates
  `aws_acm_certificate.main` (DNS validation). ACM stops trying after 72 hours and the certificate goes
  to `VALIDATION_TIMED_OUT`; it cannot be revived, only replaced. If the G6 Cloudflare records are not
  in place within 72 h of the G3 apply, the first `up` (`aws_acm_certificate_validation`) waits 75 min
  and fails, and recovery needs a code change to force a new certificate (`-replace` is prohibited).
  [R] Have the G6 records ready (the validation records are a plan-time-known output only after
  create, so: apply G3, read `certificate_validation_records`, create the records the same day), or
  accept a cert-recreation PR later.
- **Challenge 2, "a deny shows up as a partial apply ... does not require destroying anything"**: not
  always. If `aws_db_instance.main` fails after RDS accepted the create (e.g. the managed-secret KMS
  step), Terraform records it tainted; the next plan is a replace, and `deletion_protection = true`
  makes the delete fail. Recovery then needs `terraform untaint` (a state write outside the workflow)
  or a code change [E]. Not a reason to stop, but the runbook should say so.
- **Challenge 3, sequencing with B2**: if Agent 2's patch turns the deployer into an allow-list, a G3
  plan made before the bootstrap re-apply is still valid as a plan, but its apply runs under the new
  policy and any missing permission becomes a partial apply. [R] Apply the bootstrap change first, then
  plan and apply G3.
- **Agree** with §4 items 1 and 2 as [U]: RDS-managed master secret via `kms:ViaService` is the documented
  path [E]; the Route 53 Associate/Disassociate question is open and cheap to cover in the B2 patch.
- **#37 review**: correct and an improvement except H-2b and the commit-check tautology (above).

### Agent 4 (04-COST-AND-BUDGET)

- **Arithmetic verified** [V by recomputation]: idle core 20 x 0.137 + 1 + 11 x 0.40 + 0.50 = 8.64;
  session 0.1857 + 12 x 0.005 + 0.027 + 0.004 + 0.019 + 0.01 = 0.306 /h; break-even 90/117/134 h follow from
  the stated fixed costs. Unit prices are from the Price List files cited; I did not re-fetch them [U].
- **Stale, should be corrected before publication**: §7 #2 ("backstop inactive ... variables not set
  yet") asserts absence after the owner's 08:59 report on evidence from 00:28; it is [U], not [V]. §7 #3
  ("`down` stops RDS only if plan and apply succeed") and §8 item 3's proposal are fixed by #37.
- **Agree**: budgets alert only; Testing budget undercounts (bootstrap has no Environment tag; task ENI
  public IPv4 is not attributable to task tags) [E]; the account budget is the real backstop; the Docs
  US$10 account budget will alert monthly (TD-13, [O]); the snapshot remains billed after the key is
  deleted ([O] ~4 Dec).
- **Missing risk**: the approval-wait concurrency block (M-2 residual); and a forgotten session can run
  up to ~30 h because of the lag (Agent 4 states this). Overall verdict on cost claims: **sound, with the
  two stale lines corrected**; US$50 holds at roughly 90-117 session hours [E].

### Agent 5 (05-CROSS-PRODUCT-READINESS) and identity#5 / work#28

- **Verified**: both merged files `deploy/aws/rds-ca-eu-central-1.crt` on identity `main` and work `main`
  hash to `56a0cae0...d8b84`, equal to Agent 5's downloaded AWS bundle; it holds the three
  `Amazon RDS eu-central-1 Root CA {RSA2048, RSA4096, ECC384} G1` roots [V,
  `evidence/06/12-rds-ca-bundle-hashes.txt`, openssl]. Identity adds it to the `runtime` stage (the
  `munaxa-identity/api` image the identity-bootstrap task runs, ops.tf); Work to `migrate` and `runtime`
  [V commit 4001ed8, f812dfe patches]. Verification stays on.
- **Challenge, the Prisma side is a security weakness, not "not affected"**: if Prisma's default for
  `sslmode=require` is to accept any certificate (Agent 5's own [E]), then Control, School, Docs, the
  Identity runtime and every migrate job use TLS without server authentication. Inside a VPC whose
  database subnets have no internet route the practical risk is low, but it should be recorded as
  [R] `sslaccept=strict` with `sslcert=<bundle>` once images are rebuilt, not as a non-issue.
- **Addition**: new Docs depends on the **retained Docs bootstrap** (its ECR repositories and its
  hard-coded publisher role). Removing the Docs bootstrap later would break Testing Docs; the owner's
  ~4 Dec decision should not touch it [V workflow text per Agent 5/Agent 1; O].
- `aws_db_instance` sets no `ca_cert_identifier`, so the account default applies, which the nonprod
  deployer can change (`rds:ModifyCertificates`, M-1); all three G1 roots are in the bundle, so any
  regional G1 choice still verifies [V bundle, E behaviour].

## 7. Verdicts (all except B2, which waits for Agent 2's patch)

| Question | Verdict |
| --- | --- |
| G3 expected-changes list (64 creates) | **Accepted** as the declaration for the first nonprod apply, subject to the real plan matching it exactly (enforce will check). Add the ACM 72 h note and the tainted-RDS note to the runbook |
| Cost claims (Agent 4) | **Accepted with corrections** (§7 #2 and #3 stale). US$50/month for Testing holds under the stated session discipline [E] |
| Scheduled session run, variables set, G3 not applied | **Fails closed** on `c688e9e`: green notice, no S3 write [E code; U until the run log] |
| Is a nonprod G3 **plan** dispatch safe now? | **Yes** [E]: read-only plus a lock object; apply impossible while `nonprod.expected-changes.json` is empty; the log no longer carries plan values |
| Is it safe to **prepare** a separate G3 apply (declaration PR + saved plan)? | **Yes to prepare.** For the **apply** itself I recommend, in order: (1) the bootstrap change covering H-2 and H-2b (state key and alias denies, or key ARN in the backend files) and whatever B2 lands, applied by root; (2) a fresh G3 plan matching the 64-create declaration; (3) G6 DNS ready within 72 h; (4) a `down` dispatched right after the apply. H-1 is latent (no prod yet) and does not block a nonprod apply, but must be fixed before any prod plan |
| #37 | **Accepted**, with H-2b to fix next |
| identity#5, work#28 | **Accepted** [V bundle and wiring] |

B2/TD-14 verdict: see §8.

## 8. B2 / TD-14: review of platform PR #38 (Agent 2)

PR #38: head `8170e127f809b45047108bbefd146db924ead784`, base `c688e9e`, 7 files under
`infra/aws/bootstrap/` only (+1119/-136), open, mergeable_state `blocked` (Accessibility check still
running); `Format, validate, mocked plan tests`, Lint/Build and Facades **success** [V check-runs]. I
read `iam.tf`, `iam_allow.tf`, `iam_session.tf`, `variables.tf`, `outputs.tf`, `backend.tf` at the
head, and Agent 2's rendered JSON and evaluator inputs. Evidence: `evidence/06/15-pr38-checks.txt`,
`14-iam-condition-keys-archived.md`. Nothing here is an AWS simulation.

### 8.1 Does it close the findings? [V code unless marked]

| Finding | Closed? | Basis |
| --- | --- | --- |
| B2 / TD-14 (deny-list on `*`) | **Yes, by design**, residual R1-R5 | `StackServices` removed. Writes are allows on the deployer's own names (`OwnNames`), on resources tagged Project=munaxa **and** Environment=<env> (`OwnTagged`), or on creates carrying both request tags (one EC2 statement per created type; `Ec2TagOnCreate` needs `ec2:CreateAction`). Untagged resources, `RunInstances`, NAT, EIP, ENI creates and default-VPC changes get no allow. The old denies stay as a second layer |
| H-1 (shared boundary) | **Yes** | Two boundaries; nonprod keeps the name stack/ uses (`moved` block, in-place update). Each allows only its own secrets, keys (by both tags), buckets, logs, task definitions and PassRole; denies the other env's tag. CreateRole/PutRolePermissionsBoundary only on `role/munaxa-shared/munaxa-<env>-*` with **that** env's boundary; the other boundary's ARN is in the name deny; no AttachRolePolicy/CreatePolicy. R7 (any trust content) remains, now bounded to nonprod data |
| H-2 (state key) | **Yes** | `ProtectStateKeyAndBucket` denies everything except Encrypt/Decrypt/GenerateDataKey/DescribeKey and object List/Get/Put/Delete on the key, bucket and objects; `OwnTagged` needs an Environment tag the state key lacks |
| H-2b (alias) | **Yes** | `NeverSharedAliases` denies Create/Update/DeleteAlias on `alias/munaxa-shared-*` and on the state key ARN; stack aliases are `alias/munaxa-<env>-data` |
| H-3 (session reaches the full deployer) | **Yes** | Nonprod CI trusts only `aws-nonprod`; a separate session CI role and session deployer. With 0-approval merges a new workflow can still reach the session deployer, whose power is now small (but see R10) |
| M-1 (account settings, sharing, Route 53, snapshot) | **Mostly** | `NeverAccountSettingsOrSharing` (EBS default encryption/key, IMDS defaults, block-public-access, serial console, peering, TGW, VPN, IPAM, snapshot/AMI sharing, RDS default CA, ECS account settings, logs account policies, secret resource policies, CancelKeyDeletion, DeleteRolePermissionsBoundary, CloudTrail/Config/GuardDuty/SecurityHub/Access Analyzer/Budgets/CE); Docs snapshot, aliases, trail, log groups, OIDC provider by name; default VPC protected. Route 53 zone actions on any zone remain (R5); `PassRole` now has `iam:PassedToService` |

### 8.2 Does it break what G3 or the sessions need?

Walked through every G3 resource (the 64 creates) against the new allows:

- **VPC, subnets, IGW, route tables, routes, associations, S3 gateway endpoint, SGs, SG rules:**
  covered: create with request tags, parents tagged by default_tags [E].
- **`aws_default_security_group`:** covered by `Ec2AdoptDefaultSecurityGroup` if the provider tags
  the group before it revokes its rules [E, provider order not checked].
- **KMS key:** `CreateKey` plus `TagResource` by request tags; rotation, policy reads and the alias
  through `OwnTagged`/`OwnNames`. Agent 2's open point (a), PutKeyPolicy on create, has a working
  precedent. The Docs deployer that created the Docs keys had PutKeyPolicy only on Environment-tagged
  keys and CreateKey by request tag [V munaxa-docs `deployer-data.json.tftpl`]. **Not a concern [E].**
- **RDS instance, subnet group, parameter group, default option group:** covered. The data key
  goes through `OwnTagged` (CreateGrant, DescribeKey) and `DataKeyThroughRdsAndSecretsManager`
  (ViaService plus the Environment tag).
- **Secret containers, buckets and their sub-configurations, ECS cluster and capacity providers,
  Cloud Map namespace with Route 53 create/associate, ACM request, log group, both IAM roles and their
  policies, service-linked roles:** covered [V code, E provider calls].

**Blocking issues:**

1. **B-1: the RDS-managed master secret will very likely be refused at G3 apply.** Statement
   `RdsMasterSecret` allows `secretsmanager:CreateSecret`/`TagResource` on `rds!*` only when
   `aws:CalledVia = rds.amazonaws.com`.
   - The AWS IAM guide lists the services that set `aws:CalledVia`: athena, cloud9, cloudformation,
     databrew, dataexchange, dynamodb, kms, servicecatalog-appregistry and sqlworkbench. **RDS is not
     on the list** [V archived AWS IAM user guide, `evidence/06/14`; the live page could not be
     fetched from here, so a later addition is [U]].
   - RDS creates the secret with the caller's permissions (Agent 3's RDS-guide reading), so the key is
     absent and no other statement allows `rds!*`. `aws_db_instance.main` would then fail with
     AccessDenied. That is a partial apply, possibly leaving a tainted instance behind deletion
     protection (§6, Agent 3 challenge 2).
   - Agent 2's coverage script **assumes** the key is present (`coverage.py:74`); its §6 point (c)
     marks this [U].
   - Precedent: the Docs deployer that successfully created an RDS-managed secret had this allow
     **without any condition** (`RdsManagedMasterSecretCreate`; Docs `rds.tf:64`
     `manage_master_user_password = true`).
   - Fix: drop the condition (the resource `rds!*` plus `NoSecretValues…` is the limit, as in Docs), or
     use `Bool aws:ViaAWSService = true`.
2. **B-2: the session deployer cannot refresh the persistent layer, so every session plan after G3
   fails.**
   - The session deployer has `deployer_read` plus its inline policy. Neither grants:
     - `kms:DescribeKey`, `GetKeyPolicy`, `GetKeyRotationStatus`, `ListResourceTags` (aws_kms_key.data);
     - `secretsmanager:DescribeSecret`, `GetResourcePolicy` (10 bundles);
     - `s3:GetBucket*` and `s3:Get*Configuration` (2 buckets and their sub-resources);
     - `iam:GetRole`, `GetRolePolicy`, `ListRolePolicies`, `ListAttachedRolePolicies` (2 roles).

     Source: rendered `session_nonprod.json` and `read.json`, in `evidence/06/15`.
   - `aws-session.yml` runs a full `terraform plan` (refresh), so `up` and `down` both fail at plan.
     #37's `always()` stop still stops the database, so there is **no cost risk**, but sessions become
     impossible.
   - Agent 2's session matrix (S01-S13) tests writes only, no refresh reads.
   - Fix: add those reads, scoped to `munaxa-nonprod-*` / `munaxa-nonprod/*` /
     `role/munaxa-shared/munaxa-nonprod-*` and keys tagged Environment=nonprod, to the session deployer
     (or to a nonprod read policy).

**Non-blocking issues (fix before or right after the re-apply):**

3. **N-1: the boundary's `OwnRdsMasterSecret` uses the tag key `aws:rds:primaryDBInstanceArn`** [U]. The Docs
   workload boundary uses `aws:ResourceTag/Environment = Production` on `rds!*`, and that worked with RDS
   copying instance tags [V Docs `workload-boundary.json.tftpl`, E working]. A wrong key breaks only the
   db-admin task at G7, not G3. [R] Use `aws:ResourceTag/Environment = <env>` (plus Project).
4. **N-2: `TF_VAR_deployer_role_arn` is set in `aws-session.yml`'s job-level `env`.**
   - Whether environment-level variables resolve there is [U] (Agent 2's point d).
   - If they do not, the provider tries the full deployer from the session CI role and fails. This
     fails closed, and #37's stop still runs.
   - [R] Agent 3 moves it to step-level env, or uses separate `AWS_SESSION_*` names.
5. **N-3: once re-applied, the nonprod CI role no longer trusts `aws-nonprod-session`.**
   - Until the owner sets the session ARNs as `aws-nonprod-session` environment variables, the
     scheduled run fails at OIDC (red).
   - Before G3 that is harmless: nothing to stop.
   - After G3 the database would not be stopped by that run, because the stop needs the deployer step.
   - **Tonight's run is unaffected**, because nothing is re-applied yet.
   - [O] Set the two variables in the same sitting as the re-apply, and before G3.

### 8.3 Residuals R1-R8 and two more

I agree with R1-R8 and their severities: claiming untagged keys, certificates, Cloud Map resources and
default-SG-style groups; Route 53 zone actions; account-wide config reads; trust content; own-env
bucket and key policies. Two additions:

- **R9 (Low): "no data reads" is not quite true.** `OwnNames` grants `logs:*` on `/munaxa/<env>/*`
  (GetLogEvents, FilterLogEvents, StartQuery, PutSubscriptionFilter) and `rds:*` on own DBs
  (DownloadDBLogFilePortion). This covers nonprod only.
- **R10 (Low-Medium): the session deployer can open its own task and DB security groups to
  0.0.0.0/0.** It has Authorize* on own-tagged SGs with no source restriction. Tasks have public IPs,
  so a 0-approval main workflow in `aws-nonprod-session` could expose a task port directly, bypassing
  the ALB and Cloudflare Access. The DB stays unreachable, since its subnets have no internet route.
  - [R] Deny `AuthorizeSecurityGroupIngress` with a CIDR source for the session deployer. The session
    only needs SG-referenced rules: `from_alb`, `alb_to_service`.
  - [O] Required approvals on platform main.

The re-apply plan Agent 2 expects (17 add, 4-6 change, 0 destroy) is consistent with the code [E].

### 8.4 Verdict on B2 / TD-14

The design closes B2/TD-14, H-1, H-2, H-2b and H-3, and most of M-1. It is better than the Docs model
it borrows from. TD-14 narrows to R1-R4, which the owner confirms or formally accepts [O].

*(Superseded by §8.5: B-1 and B-2 are fixed at 0ff0879, so the verdict is now merge.)* At 8170e12: **Merge PR #38 now: no, not as is.** B-1 would most likely break the G3 apply at the RDS instance as soon
as the bootstrap is re-applied. B-2 would make every Testing session fail after G3. Both are small,
local fixes in `iam_allow.tf` / `iam_session.tf`, with a test each.

**Yes once B-1 and B-2 are fixed** (N-1 recommended in the same commit). Merging is code only; the
re-apply stays a separate root action with owner approval, followed by `b2-owner-simulation.sh`. Add to
that script a `secretsmanager:CreateSecret` on `rds!db-x` simulation with and without
`aws:ViaAWSService`, and the session refresh reads.

### 8.5 Re-review of the fix delta, PR #38 head `0ff0879ad788f2999aa256471b0e56cb6b76ba41`

Scope: `git diff 8170e12 0ff0879` (`evidence/06/16-pr38-delta-8170e12-0ff0879.diff`; `iam.tf`, `iam_allow.tf`,
`iam_session.tf`, tests). CI on 0ff0879: the AWS Terraform tests, Lint/Build and Facades passed;
Accessibility still running [V check-runs].

- **B-1, fixed.** `RdsMasterSecret` now requires `Bool aws:ViaAWSService = true` on `rds!*`.
  - IAM sets that key to true exactly when a service uses the principal's credentials for an onward
    call, which is the forward access path RDS uses for the managed master secret (RDS guide, via
    Agent 3) [E strong].
  - If RDS used its service-linked role instead, the caller's permission would not be evaluated at
    all. Either way the condition cannot block creation.
  - The deployer can still never call these actions on an `rds!` secret directly.
  - New test run `b1_rds_master_secret_only_through_rds` pins the condition [V code]. Residual [U]
    until the owner simulation or the G3 apply.
- **B-2, fixed.** New managed policy `munaxa-shared-deployer-nonprod-session-read`, attached only to the
  session deployer [V code]. It allows:
  - KMS Describe/GetKeyPolicy/GetKeyRotationStatus/ListResourceTags on keys tagged munaxa + nonprod;
  - Secrets Manager DescribeSecret/GetResourcePolicy on `munaxa-nonprod/*`;
  - S3 ListBucket, GetBucket* and the four `Get*Configuration` actions on `munaxa-nonprod-*`;
  - IAM GetRole/GetRolePolicy/List* on `role/munaxa-shared/munaxa-nonprod-*`.

  I checked every G3 resource type against `deployer_read` plus this policy: KMS key and alias,
  secrets, both buckets and their sub-resources, IAM roles and inline policies, log group, RDS
  instance/subnet/parameter groups, VPC objects, ACM, Cloud Map namespace, ECS cluster and capacity
  providers. **Nothing a session refresh needs is missing** [E provider calls]. That includes the
  G5-era task definitions (`ecs:Describe*`) and the licence key, whose policy lets the account read it.
  `s3:ListTagsForResource`, if provider 6.67 calls it, is missing for the full deployer too, so it is
  not a session regression.
- **N-1, addressed.** The boundary statement `OwnRdsMasterSecretByTag` (Project = munaxa and
  Environment = <env>) sits alongside the unverified tag-key statement. Both admit only the deployer's
  own environment. This matches the Docs precedent [V code].
- **R10, partly addressed.** The session now has only Authorize/RevokeSecurityGroupIngress, on
  own-tagged groups and rules. It has no egress or modify actions and may not tag security groups.
  An explicit deny keeps it off the ALB, database, db-admin and default groups (by Name tag, which it
  cannot rewrite).
  - The session's only rules are `from_alb` ingress rules, so nothing it needs is lost [V code vs
    Agent 3's session list].
  - Agent 2 is right that `AuthorizeSecurityGroupIngress` has no condition key for the CIDR or source
    group [E]. A task group can therefore still be opened to 0.0.0.0/0 by an unreviewed workflow on
    main. **Residual R10 stays Low-Medium**; the real fix is required approvals on platform main [O].
- **Does any new allow reopen H-1 or B2?** No.
  - The session-read policy is read-only and scoped to the environment.
  - `ViaAWSService` admits only calls made through a service the deployer can call, on its own
    resources.
  - The new boundary statement is environment-scoped, and the boundary still has
    `NeverTheOtherEnvironment`.
- **One new Low observation (not blocking).** `SessionDiscoveryWithOwnTags` allows
  `servicediscovery:CreateService` on `*` with request tags. The request tags then also satisfy it
  for the **namespace** resource, so the namespace check in `SessionCloudMapServices` is moot: a
  session could add a tagged service to an untagged foreign namespace (the same class as R3). The full
  deployer does this correctly by limiting the create to `service/*`. [R] Narrow it the same way in a
  follow-up.

**Final verdict on PR #38 at 0ff0879: merge — yes** (code only). There are no blocking issues. Do it once
the Accessibility check is green.
- The re-apply stays a separate root/CloudShell action with the owner's approval. The owner then runs
  `b2-owner-simulation.sh` (add rds! CreateSecret with and without `aws:ViaAWSService`, and the
  session refresh reads), expects 0 mismatches, and sets the session ARNs on `aws-nonprod-session` in
  the same sitting.
- Follow-ups, none blocking: the Cloud Map create scoping above; N-2 (`TF_VAR_deployer_role_arn` at
  step level in `aws-session.yml`, Agent 3); owner acceptance of R1-R10.

## 9. Final verdicts

| Question | Verdict |
| --- | --- |
| B2/TD-14 | **Resolved in design by #38 at 0ff0879; not yet in AWS.** Merge now (B-1/B-2 fixed, §8.5); re-apply by root, simulate (0 mismatches), owner accepts R1-R4 (and R5-R10) |
| H-1, H-2, H-2b, H-3 | Closed by #38 once re-applied [V code]; H-3 residual R10 |
| M-1 | Mostly closed by #38; R5 Route 53 accepted; management-account point (M-4) remains an owner decision |
| M-2, M-3, L-1 | Mostly fixed by #37 (residuals §5) |
| G3 expected-changes list | Accepted (64 creates), subject to the real plan matching; ACM 72 h and tainted-RDS notes |
| Cost claims | Accepted with two stale lines corrected |
| G3 plan dispatch (run 41820815532, awaiting approval) | Safe: read-only on an empty state. It is planned under the **current** (pre-#38) deployer policy, which is broader. A plan says nothing about whether #38's allow-list suffices |
| G3 apply | Prepare now. Apply only after: (1) #38 (0ff0879) merged, re-applied by root, simulation 0 mismatches; (2) a fresh plan (after the re-apply) matching the 64-create declaration; (3) G6 DNS ready within 72 h; (4) session ARNs set on `aws-nonprod-session`; (5) `down` dispatched right after |
| identity#5, work#28, #37 | Accepted |
