# Phase 5, Agent 2: security boundary (B2 / TD-14, with H-1, H-2, H-3, M-1)

Date: 4 Nov 2026 (UTC). Author: Agent 2. Labels: **[V]** verified (how is stated), **[E]** estimated,
**[R]** recommended, **[U]** unverified or inaccessible, **[O]** owner action required.

No AWS credentials were used: no AWS CLI, no AWS MCP tool. The shell had `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` set. Every Terraform command ran through a wrapper (`evidence/02/harness/tfx`)
that removes them, points HOME at an empty folder and sends all HTTPS to a dead proxy port. A stray
AWS call fails: the diff harness's first try, which refreshed, failed on `127.0.0.1:9` [V]. AWS facts
come from GitHub Actions logs (GitHub MCP) or are marked [U]. CanteenHub was not looked at.

Evidence folder: `/tmp/claude-0/-home-claude/df3735a4-576f-54df-9e2e-1e5ea940a7ef/scratchpad/phase5/evidence/02/`
(called `evidence/02/` below).

## 1. Result

| Item | State |
| --- | --- |
| Patch | `evidence/02/b2-boundary.patch` (sha256 `166d0fcc…ca73a4`). It touches only `infra/aws/bootstrap/**` (7 files, +1097/−136) |
| Base | munaxa-platform `origin/main` **`c688e9ee242a46d94df09307c97fa4281da7ed78`** (platform#37). Written on `00667f3`; bootstrap/ is the same in both [V `git diff --stat 00667f3 c688e9e -- infra/aws/bootstrap` = empty]. `git apply --check` is clean on c688e9e [V] |
| fmt / validate / test | `fmt -check` clean; `validate` Success; `terraform test` **8 passed, 0 failed** [V `evidence/02/terraform-fmt-validate-test.txt`]. Baseline main: 4 passed [V `terraform-test-baseline-main.txt`]. Terraform 1.16.5 and AWS provider 6.67.0, both checked against HashiCorp SHA256SUMS |
| Local policy evaluation (not AWS) | 82 of 82 cases as designed [V `eval/matrix-result.md`]. G3 coverage estimate: 183 of 183 expected calls allowed [E `eval/coverage-result.md`] |
| Mutation checks | 12 of 13 caught. M9 is harmless (§7) [V `mutation-checks.txt`] |
| AWS simulation | Not run: it needs credentials. Ready-to-run script for the owner: `evidence/02/b2-owner-simulation.sh` (93 read-only simulate calls) [U]/[O] |
| **B2 status** | **Fixable with code and a bootstrap re-apply. It is not fixed now.** After the patch is merged, the owner re-applies the bootstrap as root in CloudShell (separate approval) and runs the simulation. A small, listed residual remains (§5). The owner either accepts it formally or confirms TD-14 for those 4 resource types |

## 2. What was wrong (verified against the code at c688e9e)

- **B2 / TD-14** [V `iam.tf`]. Statement `StackServices` allowed `ec2:*`, `elasticloadbalancing:*`,
  `ecs:*`, `rds:*`, `logs:*`, `acm:*`, `servicediscovery:*`, `scheduler:*` and `cloudwatch:*` on
  `"*"`, plus KMS `PutKeyPolicy`, `ScheduleKeyDeletion` and `CreateGrant` on `"*"`. The only limits
  were denies on a wrong tag (platform#31 and #33). An untagged resource matched no deny, so it was
  writable.
  - My local evaluation of the current main policy shows this. The deployer can delete an untagged
    security group, load balancer, log group, ECS service, Cloud Map namespace or certificate, and
    open ingress on an untagged security group.
  - It can also create a subnet in an untagged VPC, claim an untagged subnet by tagging it, and
    schedule deletion of an untagged KMS key.
  - It can delete the kept Docs final snapshot if that snapshot were untagged. `db:munaxa-docs*`
    does not cover `snapshot:`.
  - It can turn off EBS default encryption (`ec2:*` on `"*"`) and change ECS account settings. All of
    these are `allowed` in the "Before (main)" column of `eval/matrix-result.md`.
- **H-1, confirmed** [V]. There was one boundary for both environments. It allowed reads of
  `munaxa-prod/*` secrets, every `rds!*` secret, `kms:Decrypt` on every key, and `munaxa-prod-*`
  objects. The nonprod deployer could create `role/munaxa-shared/<any name>` with that boundary, add
  a policy and set any trust. The `NeverTheOtherEnvironmentByName` deny covered only `munaxa-prod-*`
  names, so it did not stop this. Matrix cases D31 and B01: allowed before.
- **H-2, confirmed** [V]. The state key carries only bootstrap's `default_tags` (Project = munaxa, no
  Environment), so no tag deny matched it. `kms:PutKeyPolicy` and `kms:ScheduleKeyDeletion` on `"*"`
  reached it. Matrix cases D22 and D23: allowed before. The state bucket's configuration was never
  allowed (implicit deny); it now also has an explicit deny.
- **H-3, confirmed** [V `aws-session.yml` at c688e9e, bootstrap `variables.tf`]. The nonprod CI role
  trusted both `aws-nonprod` and `aws-nonprod-session`. The session environment has no reviewer and
  reached the full nonprod deployer.
- **A side finding in an existing test** [V]. The assertion "nonprod deployer reads and writes nonprod
  state only" filtered on `s.effect == "Allow"`. In the configuration `effect` is unset (null), so the
  assertion checked nothing. The patch filters on `!= "Deny"` and compares the exact resource. The
  mutation M12b now fails, as it should.

## 3. The old Docs VPC and what the Docs retirement changes (from logs and code only)

- **Docs VPC: deleted** [V, GitHub log]. munaxa-docs run **41794933464**, job 126458208975 (head
  `1f47ba4`), `ROOT=core`, ended with "0 added, 0 changed, **59 destroyed**" at 07:54:58Z.
  - The VPC `aws_vpc.main` `vpc-06ed50fc514fb4f21` was destroyed at 07:54:57Z, together with its IGW,
    5 subnets, 2 route tables, the S3 endpoint, 6 tier security groups and their rules, and 9 IAM roles.
  - AWS deletes a VPC only when nothing remains in it (no ENI, subnet, non-default security group,
    IGW or endpoint). So nothing hand-made or AWS-managed stayed inside [V, by inference from the
    DeleteVpc contract].
  - **The "read-only Docs VPC tag inventory" (P9 residual) is no longer needed.** Ids and lines:
    `evidence/02/docs-retirement-run-evidence.md`.
- **Data root** [V, GitHub log]. Run **41788878315** (job 126439371247) deleted RDS
  `db-7LIZ7FWXFPEHOQQMWGGBW2Q2QA` at 07:33:30Z, plus the documents bucket, the subnet and parameter
  groups and the RDS log group. It failed on the backup vault, which still held recovery points.
  Run **41797685617** (job 126468340980, head `b8c7e25`) destroyed `aws_kms_key.data` at 08:21:19Z,
  which starts its 30-day wait before deletion.
- **What remains of old Docs, and how it is protected now:**

  | Remaining | Tags | Before the patch | After the patch |
  | --- | --- | --- | --- |
  | Final snapshot `munaxa-docs-eu-prod-pg-final` | Project = MunaxaDocs, copied from the instance [E] (munaxa-docs `3959a26:infra/terraform/eu-prod/data/rds.tf`: `copy_tags_to_snapshot = true`, default_tags) | Tag deny only | Also by name: `snapshot:munaxa-docs*`; and no allow for any `snapshot:` that is not `munaxa-<env>-*` (D19) |
  | Retained automated backups (`delete_automated_backups = false`, 35 days) | [U] | Reachable through `rds:*` on `"*"` | No allow on `auto-backup:` at all |
  | Data KMS key, PendingDeletion until about 4 Dec | Project = MunaxaDocs [E] | Tag deny | Tag deny; no allow unless tagged munaxa/<env>; `kms:CancelKeyDeletion` denied (D24) |
  | Docs bootstrap: state bucket, CloudTrail bucket, trail, OIDC provider, ECR `munaxa-docs/*`, budgets | Project = MunaxaDocs (Docs bootstrap `providers.tf` default_tags) [V code] | Name and tag denies | Also denied by name: `oidc-provider/*`, `policy/munaxa-docs/*`, `trail/munaxa-docs*`, `alias/munaxa-docs*`, `log-group:*munaxa-docs*`; `cloudtrail:*` and `budgets:*` denied |
  | The account's default VPC `vpc-0ed30515ad9631ea6` (id from munaxa-docs `bootstrap/variables.tf`) | untagged (AWS default) | **Reachable** | `NeverProtectedVpcs`, `NeverInProtectedVpcs` (`ec2:Vpc`), `NeverProtectedVpcsInZones` (D14, D15, D58) |

- **[O] Optional, narrow and read-only checks.** None is needed for the patch. Use them to confirm
  the [E] and [U] tags above, in CloudShell, eu-central-1:
  ```sh
  aws rds describe-db-snapshots --db-snapshot-identifier munaxa-docs-eu-prod-pg-final --query 'DBSnapshots[0].TagList'
  aws rds describe-db-instance-automated-backups --db-instance-identifier munaxa-docs-eu-prod-pg --query 'DBInstanceAutomatedBackups[].{arn:DBInstanceAutomatedBackupsArn,status:Status}'
  aws ec2 describe-vpcs --vpc-ids vpc-06ed50fc514fb4f21   # expect InvalidVpcID.NotFound
  aws ec2 describe-vpcs --vpc-ids vpc-0ed30515ad9631ea6 --query 'Vpcs[0].IsDefault'   # expect true
  ```

## 4. The design in the patch

| File | What it does |
| --- | --- |
| `iam.tf` | Per-environment boundaries (H-1). The deployer's inline policy keeps state access and **every earlier guardrail**, and adds `ProtectStateKeyAndBucket` (H-2), `CreatesCarryProjectTag` and `CreatesCarryEnvironmentTag`, `NeverProtectedVpcs`, `NeverInProtectedVpcs` and `NeverProtectedVpcsInZones`, and `NeverAccountSettingsOrSharing` (M-1), and wider Docs name denies (M-1) |
| `iam_allow.tf` (new) | The positive allow-list in two managed policies per environment, plus a shared read policy (table below) |
| `iam_session.tf` (new) | A session-only CI role and deployer (H-3) |
| `variables.tf` | `deploy_environments.nonprod` is now `["aws-nonprod"]`. Adds `session_environments` (nonprod only, validated) and `protected_vpc_ids` |
| `outputs.tf` | `workload_boundary_arn` is unchanged (nonprod). Adds `workload_boundary_arns`, `session_ci_role_arns` and `session_deployer_role_arns` |
| `backend.tf` | Adds `kms_key_id` = the state key alias ARN, the same as platform#37 (§8) |

The allow-list. Each write is an **allow with StringEquals**, not a deny on a mismatch:

| Statement | Scope |
| --- | --- |
| `OwnNames` | `elasticloadbalancing:*`, `ecs:*`, `rds:*`, `logs:*`, `scheduler:*` and `cloudwatch:*` only on this environment's names: `loadbalancer/app/munaxa-<env>/*`, listener and listener-rule under it, `targetgroup/munaxa-<env>-*`, `cluster/munaxa-<env>`, `service/munaxa-<env>/*`, `task(-definition)/munaxa-<env>*`, `db:`, `subgrp:`, `pg:` and `snapshot:munaxa-<env>*`, `log-group:/munaxa/<env>/*`, schedules, alarms, `alias/munaxa-<env>-*` |
| `OwnTagged` | `ec2:*`, `acm:*`, `servicediscovery:*` and KMS key management only when **both** `aws:ResourceTag/Project = munaxa` and `aws:ResourceTag/Environment = <env>` hold. This statement also admits the parent of a create, such as the VPC of a new subnet |
| `Ec2Create*` (7 statements) | One statement per created type: vpc, subnet, security-group, route-table, internet-gateway, vpc-endpoint, security-group-rule. Each needs `aws:RequestTag/Project` and `aws:RequestTag/Environment`. A parent ARN is never matched by its child's request tags (D05, D07) |
| `Ec2TagOnCreate` | `ec2:CreateTags` only with `ec2:CreateAction` set and the environment's tags. An existing untagged resource cannot be claimed (D12) |
| `CreateWithOwnTags`, `CloudMapServiceWithOwnTags` | `kms:CreateKey` and `kms:TagResource`, `acm:RequestCertificate` and `acm:AddTagsToCertificate`, and Cloud Map create and tag, all needing the request tags |
| `OwnRolesWithOwnBoundary`, `ManageOwnRoles`, `PassOwnRoles` | IAM only on `role/munaxa-shared/munaxa-<env>-*`. CreateRole needs **this environment's** boundary. PassRole only to ecs-tasks, ecs and scheduler (H-1) |
| `OwnSecretContainers`, `RdsMasterSecret` | Secret containers `munaxa-<env>/*` only. `rds!*` only when `aws:CalledVia = rds.amazonaws.com` |
| `DataKeyThroughRdsAndSecretsManager` | Decrypt and GenerateDataKey only through RDS or Secrets Manager (`kms:ViaService`) and only on keys tagged `Environment = <env>`. This keeps Agent 3's RDS master-user-secret path working: coverage rows for `CreateGrant` and `GenerateDataKey` via RDS and Secrets Manager are allowed |
| `FileBuckets` | Bucket configuration on `munaxa-<env>-*` only (before, both environments, with a name deny) |
| `deployer_read` | Configuration reads (`ec2:Describe*`, `elasticloadbalancing:Describe*`, `ecs:Describe*`/`List*`, `rds:Describe*`, log-group metadata, ACM, Cloud Map, Route 53, `kms:List*` and similar) on `"*"`, and ECR metadata on `repository/munaxa-*`. **No data reads**: no log events, secret values, RDS log files or console output |

**Boundaries (H-1).** The nonprod boundary keeps its name, `munaxa-shared-workload-boundary`. It
moves to `["nonprod"]` through a `moved` block and is updated in place, so the stack needs **no
change for Testing**.
- It allows its own environment's names only: secrets `munaxa-nonprod/*`; the `rds!*` secret only
  with RDS's tag `aws:rds:primaryDBInstanceArn` = `db:munaxa-nonprod-*` [E]; keys tagged
  Project = munaxa and Environment = nonprod; buckets `munaxa-nonprod-*`; logs `/munaxa/nonprod/*`;
  tasks `task-definition/munaxa-nonprod-*`; PassRole `munaxa-nonprod-*`.
- It denies anything tagged for the other environment.
- Prod gets `munaxa-shared-workload-boundary-prod`. **[R] Before any prod apply, Agent 3 changes the
  boundary ARN in stack/ to depend on the environment.** It appears in `modules/service/main.tf:68`
  and `:123`, `ops.tf:59`, `:205` and `:307`, `docs.tf:288` and `:388`, and `services.tf:467`. Until
  then the prod deployer cannot create any role: it fails closed.

**Sessions (H-3).**
- `munaxa-shared-ci-nonprod-session` trusts only `aws-nonprod-session` (main) and may assume only
  `munaxa-shared-deployer-nonprod-session`.
- That deployer has reads and nonprod state, plus: ELB on own names; ECS
  `Create`/`Update`/`DeleteService` and tags on `service/munaxa-nonprod/*`; security-group rule
  changes on own-tagged groups; Cloud Map services; RDS `Start`/`StopDBInstance` on
  `db:munaxa-nonprod-pg`.
- It carries **all** nonprod guardrails through `source_policy_documents`. The rendered JSON is
  checked: all 16 denies are present and unchanged.
- It has no IAM (except PassRole), KMS, secret, bucket, log, network, database or task-definition
  write (S07 to S12).
- **Workflow change: none needed [E].** The job names `environment: aws-nonprod-session`, and
  environment variables take precedence over repository variables. The owner sets
  `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on that environment from the new outputs. The
  job-level `if: vars.AWS_CI_ROLE_ARN != ''` still sees the repository value.
  - [R] If GitHub does not resolve environment variables in the job-level `env:` (`TF_VAR_deployer_role_arn`),
    Agent 3 should read the session variables with a fallback, for example
    `vars.AWS_SESSION_DEPLOYER_ROLE_ARN || vars.AWS_DEPLOYER_ROLE_ARN` (and the same for the CI role).
  - The session workflow's AWS calls (sts assume-role, s3api head-object on `nonprod/stack.tfstate`,
    rds describe/start/stop/wait, and plan/apply of the session's resource types) are all covered.
- **Order of operations [O]:** set the two environment variables right after the re-apply. Until
  then the session job fails at OIDC, which is harmless before G3. In any case, do it before the
  first G3-era session.

**Agent 3's Route 53 items.** `route53:AssociateVPCWithHostedZone`, `DisassociateVPCFromHostedZone`
and `UpdateHostedZoneComment` are added on `hostedzone/*`. That is as tight as Route 53 allows: it has
no tag or name condition, and `route53:VPCs` would name a VPC id that exists only after G3. The account's
protected VPCs are denied in those calls and in `CreateHostedZone` (D58). `ChangeResourceRecordSets`
is limited by `route53:ChangeResourceRecordSetsNormalizedRecordNames` to `<env>.munaxa.internal`
(D44 allowed, D45 denied).

**Size limits** [V, rendered JSON with whitespace removed]:

| Policy | Size | Limit |
| --- | --- | --- |
| Deployer inline | 6,530 | 10,240 |
| Session inline | 8,911 | 10,240 |
| Managed: allow | 4,912 | 6,144 |
| Managed: allow-tagged | 3,702 | 6,144 |
| Managed: read | 898 | 6,144 |

Managed policies attached per role: 3 for each deployer and 1 for the session deployer.

## 5. Residual risk (cannot be scoped; stated explicitly)

| # | Residual | Why | Severity | Mitigation in the patch |
| --- | --- | --- | --- | --- |
| R1 | An **untagged KMS key** could be claimed: `kms:TagResource` with Project = munaxa and Environment = nonprod, then the key managed or scheduled for deletion | Tagging on create (KMS `CreateKey` authorizes `kms:TagResource` on the new key) offers no condition that tells a new key from an existing untagged one | Medium if such keys exist, and only if their key policy delegates to IAM | Request tags are mandatory. The state key and Docs keys are protected by ARN and tag. CloudTrail records the claim |
| R2 | An **untagged ACM certificate** could be claimed in the same way (`acm:AddTagsToCertificate`) | Same reason | Low: a certificate in use cannot be deleted | Same |
| R3 | An **untagged Cloud Map namespace or service** could be claimed (`servicediscovery:TagResource` has no resource type, per the AWS Service Authorization Reference) | Required by `CreatePrivateDnsNamespace` and `CreateService` | Low | Same |
| R4 | **The default security group of a VPC** (`aws_default_security_group`) can be adopted: an untagged security group can be tagged with Name `munaxa-<env>-default-unused` | AWS creates it untagged | Low to medium (another workload's untagged security group) | Never in a protected VPC (D14). Only with the stack's exact Name tag, so any such group outside the Munaxa VPC is visible. [R] Agent 3 could drop `aws_default_security_group` and then this statement |
| R5 | `route53:CreateHostedZone`, `DeleteHostedZone`, `ChangeTagsForResource`, `AssociateVPCWithHostedZone`, `DisassociateVPCFromHostedZone` and `UpdateHostedZoneComment` on any zone | Route 53 has no tag or name conditions; Cloud Map uses the caller's rights | Low: DeleteHostedZone needs an empty zone | Record changes are limited to `<env>.munaxa.internal`. Protected VPCs are denied |
| R6 | Configuration reads (`Describe*` and `List*`) across the account | Most have no resource-level permission; Terraform plan needs them | Low (metadata, no data) | No data reads at all (D30) |
| R7 | A nonprod role's trust policy cannot be restricted to this account (IAM has no condition on the trust document) | IAM limit | Low after H-1: the boundary limits such a role to nonprod data | Boundary per environment |
| R8 | Within its own environment the deployer can still `s3:PutBucketPolicy` and `kms:PutKeyPolicy` on its own buckets and keys, which could grant another account access | The stack needs both | Low (Testing data); existed before | `PutResourcePolicy` on secrets and snapshot sharing are denied |

**TD-14 narrowed.** The owner no longer has to confirm that "every non-Munaxa resource carries a
Project tag". Only these four remain: non-Munaxa **KMS keys, ACM certificates, Cloud Map namespaces
and services, and security groups** that are untagged (R1 to R4). The owner either confirms that
none exist in eu-central-1, or formally accepts R1 to R8. [O] This must not be turned into
account-wide discovery by agents.

## 6. Validation

- **Rendered JSON** [V]: the policies were rendered by the real AWS provider's `aws_iam_policy_document`
  code. The harness is `terraform test` with every managed resource overridden, an `override_data`
  for the OIDC provider, and placeholder provider settings that are not credentials. No AWS call
  happens. Files: `evidence/02/rendered/{before,after}/*.json`; harness: `evidence/02/harness/`.
- **Local evaluator** (`eval/iam_eval.py`, documented in its header). **It is NOT an AWS simulation.**
  - It follows IAM's documented rules for identity policies: explicit deny, then allow, otherwise
    implicit deny. A multi-resource request is allowed only if every resource is allowed.
  - It does not model key policies, resource policies, SCPs or IfExists.
  - The matrix (`eval/matrix-result.md`, 82 cases, before and after) covers tagged nonprod resources
    (allowed), other-project tags (deny), untagged (deny), creates with and without tags, claiming an
    untagged resource, prod resources and the prod deployer, other regions, the state key and bucket,
    Docs artefacts, boundaries, and sessions.
  - Results: **82/82 as designed after the patch. Under main, 52 of the cases that should be denied
    are allowed** (the "Before" column).
- **G3 coverage** [E]: `eval/coverage.py` lists 183 API calls that the provider is expected to make
  for every resource type in `stack/` and `modules/service`, on the stack's own nonprod names and
  tags. All 183 are allowed. Resource types per action were cross-checked against the public AWS
  Service Authorization Reference JSON (servicereference.us-east-1.amazonaws.com, no credentials).
- **Points the AWS simulation must confirm** [U]:
  - (a) `kms:CreateKey` also authorizes `kms:PutKeyPolicy` on the new key, which `OwnTagged` admits
    only if KMS evaluates the new key with its request tags. If the first G3 apply gets AccessDenied
    on CreateKey, that is the cause.
  - (b) The RDS-managed secret carries `aws:rds:primaryDBInstanceArn` (boundary B07).
  - (c) RDS's call on the deployer's behalf sets `aws:CalledVia` (`RdsMasterSecret`).
  - (d) GitHub resolves environment-level variables in the job-level `env` (H-3).
  - The G3 plan is read-only and needs only `deployer_read` plus state; a failure would show at
    apply, not at plan [E].
- **Owner simulation** [O]: `bash evidence/02/b2-owner-simulation.sh`, run in CloudShell after the
  re-apply. It is read-only: `simulate-principal-policy`, `simulate-custom-policy`,
  `get-policy` and `get-policy-version`.
  - Each call passes `aws:RequestedRegion=eu-central-1`, uses JSON context entries, and simulates
    each resource of a multi-resource request separately.
  - The expected result per line comes from the local matrix. The last line counts mismatches; 0 is
    required.

## 7. Tests and mutation checks

**New and changed test runs** (`tests/bootstrap.tftest.hcl`, mock provider, plan only):

| Run | Checks |
| --- | --- |
| `one_ci_role_and_one_deployer_per_environment` | Nonprod CI trusts only `aws-nonprod`; the session CI role trusts only `aws-nonprod-session`. This **changes an existing assertion on purpose** (it was "nonprod trusts both") |
| `b2_writes_are_an_allow_list_not_tag_denies` | No service-wide write on `"*"` without a condition. The only unconditioned allow on `"*"` is the Cloud Map zone residual. Every tag-scoped allow needs Project AND Environment (StringEquals). The 7 EC2 create statements each cover one typed ARN. `OwnNames` lists only its own environment. Guardrails present; snapshot sharing denied; Docs snapshot denied by name; default VPC protected |
| `h2_state_key_and_bucket_are_protected` | The deny covers the key, the bucket and objects; only state object reads and writes are exempt |
| `h1_each_environment_has_its_own_boundary` | Boundary names; no other-environment names; every allow names its own environment; keys by the Environment tag; CreateRole needs the environment's own boundary; IAM names `munaxa-<env>-*` |
| `h3_sessions_have_a_narrow_deployer` | No IAM, KMS, secret, `s3:Put`, logs, network, database or task-definition write; guardrails come from the source document |

All 4 earlier runs still pass. The State assertion was strengthened (see §2).

**Mutation checks** [V `mutation-checks.txt`]. Each change below made a test run fail:

| Mutation | Change |
| --- | --- |
| M1 | `OwnTagged` Environment condition made StringNotEquals |
| M2 | Unconditioned `ec2:*` on `"*"` |
| M3 | The boundary allows `munaxa-*` secrets |
| M4 | State key removed from the H-2 deny |
| M5 | CreateRole on `munaxa-shared/*` |
| M6 | Session deployer given `kms:PutKeyPolicy` |
| M7 | Nonprod CI trusts the session environment again |
| M8 | An EC2 create on any type |
| M10 | Snapshot-sharing deny removed |
| M11 | Docs snapshot name deny removed |
| M12b | State on `/*` |

The one survivor, M9, added `elasticloadbalancing:*` and `ecs:*` to `ServiceLinkedRoles`. Its
resource is `role/aws-service-role/*`, which no ELB or ECS resource can match, so the mutation has
no effect.

## 8. Bootstrap backend: kms_key_id (Agent 3's item 2)

- [V code] The S3 backend with `encrypt = true` and no `kms_key_id` sends SSE-S3 (AES256), which
  overrides the bucket's SSE-KMS default. So the bootstrap's own state object is SSE-S3 today [E].
  The patch adds `kms_key_id = "arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-tfstate"`,
  the same as platform#37.
- **Impact.** Root runs `terraform init -reconfigure`; bucket and key are unchanged, so there is
  nothing to migrate. The re-apply then writes the state as SSE-KMS. Earlier versions stay SSE-S3
  (the bucket is versioned).
  - Root reaches the key through the default key policy.
  - The deployers never touch `bootstrap/*` (State is `<env>/*` only).
  - With platform#37 the stack state is SSE-KMS too. The deployers' `StateKey` and the H-2 exemption
    allow exactly Encrypt, Decrypt, GenerateDataKey and DescribeKey, which S3 needs for SSE-KMS objects.

## 9. Expected bootstrap re-apply (root, CloudShell; separate approval; NOT authorized now)

From a credential-free Terraform diff of origin/main's bootstrap, applied with overrides, to the
patched bootstrap (`evidence/02/reapply-diff-summary.txt`, harness `harness/diff.tftest.hcl`):
**17 to add, 0 to destroy, and in-place changes.**

| Change | Addresses |
| --- | --- |
| Moved, then updated in place | `aws_iam_policy.workload_boundary` → `aws_iam_policy.workload_boundary["nonprod"]` (policy only; name unchanged) |
| Updated in place | `aws_iam_role_policy.deployer["nonprod"]`, `aws_iam_role_policy.deployer["prod"]` (StackServices and IAM/S3/KMS allows move out; guardrails added) |
| Updated in place | `aws_iam_role.ci["nonprod"]` (trust: the `aws-nonprod-session` subject removed; `evidence/02/reapply-diff-ci-nonprod.txt`) |
| May show as updated in place | `aws_iam_role.deployer["nonprod"]` and `["prod"]`: their trust document is read again at apply time because `aws_iam_role.ci` changes. Content identical [E] |
| Created (17) | `aws_iam_policy.workload_boundary["prod"]`; `aws_iam_policy.deployer_read`; `aws_iam_policy.deployer_allow["nonprod"]` and `["prod"]`; `aws_iam_policy.deployer_allow_tagged["nonprod"]` and `["prod"]`; `aws_iam_role_policy_attachment.deployer_read["nonprod"]` and `["prod"]`; `aws_iam_role_policy_attachment.deployer_allow["nonprod"]` and `["prod"]`; `aws_iam_role_policy_attachment.deployer_allow_tagged["nonprod"]` and `["prod"]`; `aws_iam_role.ci_session["nonprod"]`; `aws_iam_role_policy.ci_session["nonprod"]`; `aws_iam_role.deployer_session["nonprod"]`; `aws_iam_role_policy.deployer_session["nonprod"]`; `aws_iam_role_policy_attachment.deployer_session_read["nonprod"]` |

So the expected real plan is **17 to add, 4 to change (up to 6), 0 to destroy** [E]. The harness also
showed the two budgets as changed; that comes only from overriding budget notifications in the
harness. Any destroy, or a change to a budget, ECR repository, KMS key or bucket, means stop.

**Owner sequence [O]:**
1. Merge the patch (lead).
2. In CloudShell: `terraform init -reconfigure`, then
   `plan -out=tfplan`, and check the plan against the table above.
3. `apply tfplan`.
4. Set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on the `aws-nonprod-session` environment from
   `session_ci_role_arns` and `session_deployer_role_arns`.
5. Run `b2-owner-simulation.sh` and expect 0 mismatches.
6. Confirm TD-14 for R1 to R4, or formally accept R1 to R8.

Make sure no aws-terraform or aws-session job runs during the apply. The inline policy shrinks before
the attachments exist, which leaves a short window with fewer rights; it fails closed.

**Docs for the lead or Agent 3 (outside bootstrap/):**
- infra/aws/README.md G2 step 4: the session pair is now environment variables of
  `aws-nonprod-session`.
- CONTRACT §4: the boundary is per environment, and nonprod keeps its name.
- The stack's boundary ARN must be per environment before prod.

## 10. Addendum: H-2b shared alias protection (Agent 6 via lead)

- [V] New inline deny `NeverSharedAliases` for both deployers (iam.tf): `kms:CreateAlias`, `UpdateAlias`, `DeleteAlias` on `arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-*` and the state key ARN. Mirrors the Docs bootstrap pattern. The session deployer inherits it via `source_policy_documents`.
- [E] Already partly covered by the patch (the state key has no Environment tag, so OwnTagged never matched it, and ProtectStateKeyAndBucket denies alias calls on the key ARN); the explicit alias-ARN deny closes it on main's `"*"` grants and against future allow changes. Stack aliases are `alias/munaxa-<env>-data`, so nothing the stack does is affected.
- [V] New assert in `h2_state_key_and_bucket_are_protected`; mutation M13 (deny narrowed to the tfstate alias, key ARN dropped) is caught.
- [V] Patch rebased onto origin/main c688e9ee242a46d94df09307c97fa4281da7ed78: 7 files, +1119/-136, sha256 8698ea28845675d8e3259646cff0aff2dc7cc5929ac31ad96ed39ad6eb5cd079, `git apply --check` clean; fmt, validate clean; `terraform test` 8 passed, 0 failed.
- [E] Re-apply diff unchanged in counts (the deployer inline policies were already in the 4 changes; they now carry one more statement).

## 11. Addendum: Agent 6 review of PR #38 (B-1, B-2, N-1, R10). Pushed as 0ff0879

- **B-1 [V]:** confirmed against the IAM global condition key reference (Agent 6 evidence 06/14). The services that aws:CalledVia supports are athena, cloud9, cloudformation, databrew, dataexchange, dynamodb, kms, servicecatalog-appregistry and sqlworkbench. RDS is not one of them, so the condition would never have matched.
  - The fix: RdsMasterSecret now uses Bool aws:ViaAWSService = true, still on rds!* only.
  - Why this is safe either way [E]: if RDS makes the call with the deployer's credentials (a forward access session), aws:ViaAWSService is true. If RDS uses its own role instead, the deployer's policy is not consulted at all.
  - coverage.py now uses this key. The owner simulation adds 4 B-1 cases (RB1*), passing aws:ViaAWSService as a boolean.
- **N-1:** the unverified tag key stays [U]. docs.aws.amazon.com and the awsdocs GitHub repositories are blocked in this session.
  - Added OwnRdsMasterSecretByTag (Project = munaxa, Environment = own) as a second way to admit the secret. [E] The Docs Production master secret carried Environment = Production, so RDS copies the instance tags onto the secret.
  - H-1 stays closed: each statement admits only the boundary's own environment, and secrets tagged prod or MunaxaDocs are refused (local matrix B07b, B08b, B08c).
- **B-2 [E]:** new managed policy munaxa-shared-deployer-nonprod-session-read, attached to the session deployer. Contents:
  - KMS key reads (Describe, GetKeyPolicy, rotation status, ListResourceTags), only on keys tagged Project = munaxa and Environment = nonprod;
  - secret DescribeSecret and GetResourcePolicy on munaxa-nonprod/*;
  - bucket ListBucket and Get* configuration reads on munaxa-nonprod-*;
  - role GetRole, GetRolePolicy, ListRolePolicies, ListAttachedRolePolicies and ListRoleTags on role/munaxa-shared/munaxa-nonprod-*.
  - Not added: iam:GetPolicy and GetPolicyVersion. No stack resource reads a managed policy (GetRole returns the boundary ARN), and policy/munaxa-shared/* stays denied by NeverMunaxaDocsOrBootstrap.
  - Everything else a refresh needs is already in deployer_read. New eval/session_coverage.py covers 107 cases: the refresh reads for every G3 resource type, the up and down writes, and the refusals. All 107 come out as expected.
- **R10 [V] (from the Service Authorization Reference):** AuthorizeSecurityGroupIngress has only ec2:Region as an action condition key, so a CIDR source cannot be denied in IAM.
  - [V] from stack code: the only rules a session writes are modules/service from_alb (count = edge_enabled), which use a referenced security group as the source. The ALB's 80/443 rules and all egress rules are persistent.
  - What the session can do now: only Authorize and Revoke on ingress, on its own groups. It has no egress or modify action. It is denied rules on the ALB, database, db-admin and default-unused groups by their Name tag. It may tag only new rules (at create), never a group.
  - Residual [R]: a session could still add a CIDR ingress rule to a task group, and tasks have public IPs (assign_public_ip = true).
  - Proposal for Agent 3 (stack change): make from_alb independent of edge_enabled, since a rule that references the persistent ALB group is harmless while there is no ALB. The session would then need no security-group write at all.
- **Tests [V]:**
  - fmt and validate clean; terraform test 9 passed, 0 failed;
  - mutations M14 to M20 all caught;
  - local matrix 85/85; G3 coverage 183/183; session coverage 107/107;
  - owner simulation: 214 read-only calls. The session inline policy is 9,800 characters, under the 10,240 limit.
- **Re-apply [E]** (from the diff harness): 19 to add, 4 real changes, 0 to destroy. The harness shows 8 changes; 2 are budget artifacts and 2 are the deployer roles' trust being read again with identical content.
- **Patch vs c688e9e:** sha256 80f94dcf86b135e3e4bde3d3511cb758e33287cb79fff387abfba6a7f617ed99 ( 7 files changed, 1295 insertions(+), 136 deletions(-)).
