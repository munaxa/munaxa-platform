# G3 failed apply: investigation, state reconciliation and recovery plan

- **Date:** 5 Nov 2026, 23:35 UTC to about 00:30 UTC on 6 Nov. **Author:** the lead of the thread "Recover failed G3 Testing apply".
- **Subject:** `aws-terraform.yml` run [42123952620](https://github.com/munaxa/munaxa-platform/actions/runs/42123952620/attempts/1), attempt 1, `nonprod` `apply` on `main` at the G3 declaration merge commit `bf46c5def9882141cd72217b1e797f51bbbe5b00` (platform #53).
- **Scope:** investigation and plan only. **No AWS write, no Terraform plan, apply, import, state or destroy command against AWS, no IAM change, no DNS or Cloudflare change, no image, no secret value read or written, no migration.** Render, Supabase and production were not touched; CanteenHub was not inspected, searched or touched.
- **AWS access used:** the only AWS connector in this session is signed in as **root** of `229251310592` (`GetCallerIdentity` returned `arn:aws:iam::229251310592:root`). It was used for **read-only calls only** (list in §11). Working as root through a connector is a security risk in itself; it was accepted here because it is the owner's standing arrangement until launch, and every call was a read.
- **Labels:** **[V]** verified in this task (source given), **[E]** estimated, **[U]** unverified, **[O]** owner action.

## Verdict

# READY FOR RECOVERY PLAN APPROVAL

The cause is proven, not inferred: AWS's own decoded authorization messages name the two deny statements that refused the creates (§4). The fix is one narrow change to those two statements; the recovery is the 26 G3 resources that were not created, with nothing else changed. Two owner approvals are needed: the IAM change (a root bootstrap re-apply) and the recovery apply. One residual uncertainty remains and is handled by a hard stop rather than more IAM change: whether `rds:CreateDBInstance` hits the same pattern on its option, parameter or subnet group (§4.5, risk K-1).

No independent review of this report was run (the thread does not use subagents unless asked). ChatGPT's review is the review gate.

## 1. Executive summary

1. **What failed.** The plan job passed (64 creates, intent check `--enforce`). The apply job ran 70 seconds and stopped with **10 explicit denies**, all EC2 creates of a child of the new VPC: 5 subnets, 3 security groups, 2 route tables. **16 further resources were never attempted** because they depend on those 10. **38 of 64 were created and are tracked in state.** [V: job log, CloudTrail, state]
2. **Why.** The deployer's inline policy has two guardrails, `CreatesCarryProjectTag` and `CreatesCarryEnvironmentTag`: deny the tagged create actions on `Resource: "*"` when `aws:RequestTag/Project` is not `munaxa` (or `aws:RequestTag/Environment` is not `nonprod`). EC2 authorizes `CreateSubnet`, `CreateSecurityGroup` and `CreateRouteTable` **also on the parent VPC**, and puts the request tags only into the context of the resource being created. In the VPC's context `aws:RequestTag/*` is absent, `StringNotEquals` on an absent key is true, so the deny matched. AWS's decoded messages show exactly this: matched statements `CreatesCarryProjectTag` and `CreatesCarryEnvironmentTag`, resource `vpc/vpc-0824ebbff902d2980`, and a context with the VPC's `aws:ResourceTag/*` keys and **no `aws:RequestTag` key**. [V]
3. **Why nobody saw it earlier.** The statements came in with platform #38 (`46dfbd9`, B2/TD-14), live since the first bootstrap re-apply on 5 Nov about 05:15 UTC. The second re-apply (`6b8997a`) did not touch them (`git diff 46dfbd9 6b8997a` shows no change to either). The IAM simulation case D08.1 ("create subnet in own VPC with own tags", on the VPC ARN) passed because the script put `aws:RequestTag/*` into the context of the VPC resource, which real EC2 authorization does not do. A plan never calls a create, so plan runs 41887322394, 41977870108 and the G3 plan job could not catch it. [V: git, simulation script line 204 of `2026-11-05-phase7/supporting/simulation/b2-owner-simulation.sh`]
4. **State is consistent with AWS.** 38 addresses in state, each one found in AWS; nothing in AWS tagged `Project = munaxa` that state does not track (beyond the bootstrap's own ECR repositories and state bucket and key); nothing tracked that is missing. No lock left (the lock object's latest version is a delete marker at 22:47:23). No tainted or deposed instance. **No import, `state rm` or `state mv` is needed.** [V]
5. **Recovery.** (a) Change those two denies so they never apply to the four EC2 parent types (VPC, subnet, security group, route table); every other tagged create, including the created internet gateway and VPC endpoint, stays covered, and untagged EC2 creates of those four types stay refused by the allow-list. (b) Root re-applies bootstrap: expected `0 to add, 3 to change, 0 to destroy`. (c) A recovery declaration of exactly the 26 missing addresses replaces the 64-address one. (d) A new `aws-terraform.yml` apply: expected `26 to add, 0 to change, 0 to destroy`. (e) `down` right after, as in the G3 checklist.
6. **Cost.** Now (partial G3): about **US$5.5 a month** above the pre-G3 baseline (10 empty secret containers, the data key, the Cloud Map private zone). After recovery, idle with the database stopped: the G3 figure already reviewed, about **US$8.7 a month** above baseline, **US$11 to 12** for the account. [E]
7. **New finding for tonight.** Because the state object now exists, the scheduled `aws-session.yml` `down` (cron 01:47 and 19:17 UTC) no longer ends with "nothing to take down": it will plan, see the 26 missing creates as changes outside the session's resource types, and **fail before any apply**. That failure is the guard working and is safe; it will be red until the recovery apply. [V: workflow code; the run itself has not happened yet]

## 2. Verified AWS inventory (read-only, 5 Nov 23:40 to 23:55 UTC)

Every item in the brief's §2 was read again. All observations confirmed; additions in bold.

| Item | Observed | Health beyond existence |
| --- | --- | --- |
| Identity | `arn:aws:iam::229251310592:root`, account `229251310592` | Root, read-only use only |
| VPC `vpc-0824ebbff902d2980` | 10.130.0.0/16, available, tags Project munaxa, Environment nonprod, Stack shared, Name munaxa-nonprod, ManagedBy | Default VPC `vpc-0ed30515ad9631ea6` untouched |
| Internet gateway `igw-01c51c4963afa87fb` | Attached to the nonprod VPC, tagged | The default VPC's gateway `igw-000a119f674f30026` untouched |
| Subnets | **None** in the nonprod VPC | — |
| Route tables | Only the main table `rtb-097fb8b570941d867`, local route only, untagged (AWS-created) | No internet route (expected: the public table was not created) |
| Security groups | Only the default group `sg-09f4c73e5cd0880c6` | **0 ingress, 0 egress rules** (Terraform stripped them as designed), tagged `munaxa-nonprod-default-unused` |
| NAT gateways, Elastic IPs, network interfaces, VPC endpoints | None | No public IPv4 charge |
| ECS | Only cluster `munaxa-nonprod`, ACTIVE, 0 services, 0 running, 0 pending, capacity providers FARGATE and FARGATE_SPOT | **Task definitions:** only the 12 old `munaxa-docs-eu-prod-*` revisions (inert, no charge) |
| Cloud Map | `nonprod.munaxa.internal` (`ns-d2gy2gp44byzxcef`), DNS_PRIVATE, 0 services | **Private hosted zone `Z05887381K9O4VANJZICT`** (US$0.50 a month) |
| RDS | **No instance, no subnet group.** Parameter group `munaxa-nonprod-pg16` (postgres16) exists | Snapshots: `munaxa-docs-eu-prod-pg-final` (manual, 4 Nov, deletion due about 4 Dec) and 14 retained automated Docs backups 22 Oct to 4 Nov |
| ALB, target groups | None | — |
| ACM | `7cb48297-...`, `*.test.munaxa.com` + `operator-test.munaxa.com`, **PENDING_VALIDATION**, created **22:46:18 UTC 5 Nov**, not in use | Validation record names `_03282899ed2d1640c316f06ff46b2cc7.test.munaxa.com.` and `_d67e37ad6024932ab65abd1e6dad5356.operator-test.munaxa.com.` (values in `terraform output certificate_validation_records` or the ACM console) |
| Secrets Manager | **10** `munaxa-nonprod/*` containers, KMS key `45eda044-...` (the nonprod data key), **no version in any of them** (`SecretVersionsToStages` empty; values were not and cannot be read). Also 2 deleted `munaxa-docs-eu-prod/*` in their recovery window | Empty containers, as G3 intends |
| KMS | `alias/munaxa-nonprod-data` -> `45eda044-...`, Enabled, ENCRYPT_DECRYPT, rotation on, created 22:46:18 | Plus the two state keys (`alias/munaxa-shared-tfstate`, `alias/munaxa-docs-eu-prod-tfstate`) |
| CloudWatch Logs | Only `/munaxa/nonprod/ops`, retention 14 days, 0 bytes | — |
| ECR | 14 repositories, all `IMMUTABLE`. `munaxa-docs/{api,web,antivirus}`: 3 tagged images each (`c6a6d8c`, `db97825`, `f8a8bea` and their `sha-` tags). **Identity (2), Control (3), Work (3), School (3): 0 images** | Docs images 17+ commits stale (earlier report) |
| S3 | `munaxa-nonprod-docs-files-229251310592`, `munaxa-nonprod-school-files-229251310592` (both: all four public-access blocks on; docs versioning Enabled), plus `munaxa-shared-tfstate-229251310592`, `munaxa-docs-tfstate-eu-prod-229251310592`, `munaxa-docs-cloudtrail-229251310592` | Buckets empty of objects was not checked (no object listing done) [U] |
| IAM (`/munaxa-shared/`) | **`munaxa-nonprod-db-admin-execution` and `munaxa-nonprod-docs-db-admin-execution` exist, both with the nonprod boundary, and no inline or attached policy** (their policies are among the 26). Bootstrap roles unchanged (CI, deployer, session roles, four publishers) | The two roles can do nothing until their policies exist |
| EventBridge Scheduler | No schedule | Backstop not applied (expected) |
| Tag scan (`Project = munaxa`, eu-central-1 and us-east-1) | 34 + 10 ARNs. Every Testing ARN maps to a state address; the rest are bootstrap-owned (ECR, state key and bucket, budgets, bootstrap policies, boundaries) | **No untracked Testing resource** |

## 3. Terraform state reconciliation

Read with `s3:HeadObject`, `ListObjectVersions` and `GetObject` (the object was parsed inside the AWS tool sandbox; only metadata, addresses, ids and instance status were returned; no attribute value, output value or secret reached this session or this report).

| Item | Value [V] |
| --- | --- |
| Object | `s3://munaxa-shared-tfstate-229251310592/nonprod/stack.tfstate`, version `cmp240i_.nN.inwND8wBX52tvNC.Ynp2`, 73,739 bytes, last modified **22:47:23 UTC 5 Nov**, `aws:kms` with key `679d1b6b-...` (the shared state key), bucket key on |
| Earlier versions | 22:46:41 (59,228 B) and 22:47:08 (60,140 B): Terraform's intermediate saves during the apply. No state before 22:46:41 |
| State | format 4, Terraform 1.16.5, **serial 3**, lineage `7aae1c65-0597-26b4-fc3a-b93522f72721`; output keys `certificate_validation_records`, `cluster_name`, `file_buckets`, `hosts`, `secret_bundles` |
| Lock | `nonprod/stack.tfstate.tflock`: latest entry is a **delete marker at 22:47:23** (released when the apply exited). **No lock remains** |
| Saved plan | `nonprod/plans/42123952620.tfplan` (131,410 B, 22:45:32) still in the bucket. It cannot be applied again (the apply job checks commit and age; 4 hours have passed). It may hold sensitive values; it is KMS-encrypted. Removal is an owner decision, not part of the recovery |
| Managed instances | **38**, all `status ok`, none tainted, none deposed |

**Comparison with the declared 64** (`envs/nonprod.expected-changes.json` at `bf46c5d`; lists in `supporting/`):

| Class | Count | Addresses |
| --- | --- | --- |
| Created and tracked | **38** | `supporting/state-38-addresses.txt`; each found in AWS (§2) |
| Created but not tracked | **0** | Tag scan and per-service listing found nothing |
| Tracked but missing in AWS | **0** | — |
| Creation failed (explicit deny) | **10** | 5 `aws_subnet`, 2 `aws_route_table`, 3 `aws_security_group` (§4.1) |
| Never attempted (dependency on a failed one) | **16** | §5 |
| Needs import or state change | **0** | — |
| In state but not declared | **0** | — |

Terraform does not record "failed" in state for a create that the API refused: the 26 are simply absent, so the next plan proposes exactly them (provided nothing drifted on the 38; the real plan is the check).

## 4. Exact IAM failure diagnosis

### 4.1 Every denial

From the apply job log ([job 127583979301](https://github.com/munaxa/munaxa-platform/actions/runs/42123952620/job/127583979301), step "terraform apply (saved plan)", 22:46:11 to 22:47:22) and CloudTrail (10 `Client.UnauthorizedOperation` events, 22:46:21 to 22:46:22, user `gha-run-42123952620`). Principal in every case: `arn:aws:sts::229251310592:assumed-role/munaxa-shared-deployer-nonprod/gha-run-42123952620`. Resource in every case: `arn:aws:ec2:eu-central-1:229251310592:vpc/vpc-0824ebbff902d2980`. Every message: "with an explicit deny in an identity-based policy".

| # | Terraform address | Code | API action | Resource type evaluated |
| --- | --- | --- | --- | --- |
| 1 | `aws_security_group.database` | `data.tf:51` | `ec2:CreateSecurityGroup` | vpc (parent) |
| 2 | `aws_security_group.alb` | `edge.tf:37` | `ec2:CreateSecurityGroup` | vpc (parent) |
| 3 | `aws_security_group.db_admin` | `ops.tf:22` | `ec2:CreateSecurityGroup` | vpc (parent) |
| 4 | `aws_subnet.public["a"]` | `network.tf:45` | `ec2:CreateSubnet` | vpc (parent) |
| 5 | `aws_subnet.public["b"]` | `network.tf:45` | `ec2:CreateSubnet` | vpc (parent) |
| 6 | `aws_subnet.db["a"]` | `network.tf:56` | `ec2:CreateSubnet` | vpc (parent) |
| 7 | `aws_subnet.db["b"]` | `network.tf:56` | `ec2:CreateSubnet` | vpc (parent) |
| 8 | `aws_subnet.db["c"]` | `network.tf:56` | `ec2:CreateSubnet` | vpc (parent) |
| 9 | `aws_route_table.public` | `network.tf:67` | `ec2:CreateRouteTable` | vpc (parent) |
| 10 | `aws_route_table.db` | `network.tf:86` | `ec2:CreateRouteTable` | vpc (parent) |

Non-fatal errors in the same run (CloudTrail), none of which stopped a resource:

- `s3:CreateBucket` AccessDenied twice at 22:46:18: "not authorized to perform: s3:TagResource ... because no identity-based policy allows" (create-with-tags). The provider retried without tags at once (same second, success) and tagged with `PutBucketTagging` (success). Both buckets are tagged and tracked. [V]
- `s3:ListTagsForResource` AccessDenied twice (implicit): tolerated by the provider on read; buckets reached state. [V]
- `OperationAborted` on `PutBucketOwnershipControls`, `PutBucketEncryption`, `PutBucketPolicy` (S3 "conflicting conditional operation"): transient, retried, all settings in state. [V]

These need no change for the recovery: the recovery plan does not create a bucket.

### 4.2 The matched statements (decoded by AWS)

`sts:DecodeAuthorizationMessage` (read-only) on three of the encoded messages (#1 security group, #4 subnet, #9 route table): all three returned `explicitDeny: true` with **exactly two matched statements**, `CreatesCarryProjectTag` and `CreatesCarryEnvironmentTag`, effect DENY, `Resource: *`, conditions `aws:RequestTag/Project` (`munaxa`) and `aws:RequestTag/Environment` (`nonprod`). The evaluated context for the VPC resource held `aws:ResourceTag/{Project,Environment,Stack,Name,ManagedBy}` and `ec2:ResourceTag/*`, `ec2:VpcID`, `ec2:Tenancy`, `aws:Region`, and **no `aws:RequestTag/*` key and no `aws:TagKeys`**. The other seven messages are the same action types on the same VPC; they were not decoded [U for those seven individually, E that they match].

Live policy check: `GetRolePolicy munaxa-shared-deployer-nonprod / deployer` shows both statements with `Resource: "*"`, 21 actions each, `StringNotEquals` on the request tag. Code: `infra/aws/bootstrap/iam.tf` lines 353 to 378 at `bf46c5d`, actions `local.tagged_creates` (`iam_allow.tf` 33 to 42). [V]

### 4.3 Why it is a deny and not the allow-list

The allow side admits the creates: `Ec2CreateSubnet`, `Ec2CreateSecurityGroup` and `Ec2CreateRouteTable` allow the action on the new resource's own type with both request tags, and `OwnTagged` allows `ec2:*` on the VPC because it carries `Project = munaxa` and `Environment = nonprod` (§2). Without the deny, the evaluation of the VPC resource would be allowed by `OwnTagged`, and that of the new subnet by `Ec2CreateSubnet`. The design comment at `iam_allow.tf` 44 to 45 already describes this ("its parents ... must already carry them"); the two denies contradicted it for EC2.

### 4.4 Was it the second re-apply?

No. Both statements were introduced by platform #38 (`git log -S CreatesCarryProjectTag` returns only `46dfbd9`) and have been live since the first re-apply (5 Nov about 05:15). `git diff 46dfbd9 6b8997a -- infra/aws/bootstrap` contains no change to them or to `tagged_creates`. The second re-apply's effective permissions are therefore irrelevant to this failure; D-B stays **PARTIALLY VERIFIED** for Testing only and B2 stays **ROOT CAUSE UNRESOLVED, ACCEPTED FOR TESTING ONLY**. This diagnosis changes neither status.

The simulation missed it because case D08.1 sends `aws:RequestTag/*` in the context of the VPC ARN; the IAM simulator evaluates whatever context it is given, while EC2 itself does not put request tags on a parent resource. Every simulation case that pairs request tags with a parent EC2 resource has the same blind spot (D07.1, D08.1 and the equivalents for security groups, route tables and the VPC endpoint).

### 4.5 Other actions with the same pattern

| Action in `tagged_creates` | Authorized on a parent too? | In the recovery? | Status |
| --- | --- | --- | --- |
| `ec2:CreateSubnet`, `CreateSecurityGroup`, `CreateRouteTable` | Yes, the VPC [V by the decoded messages] | Yes | **Fixed** by the change |
| `ec2:CreateVpcEndpoint` | Yes: the VPC and the route tables named (also subnets and security groups for interface endpoints) [E from the EC2 authorization model; not observed] | Yes (`aws_vpc_endpoint.s3`) | **Fixed** by the change (all four parent types excluded) |
| `ec2:CreateVpc`, `ec2:CreateInternetGateway` | No parent | Already created | Unchanged |
| `rds:CreateDBInstance` | Also authorized on the option group, parameter group and subnet group | Yes (`aws_db_instance.main`) | **[U] K-1.** If RDS, like EC2, omits request tags on those, the same deny will refuse it. Not observed: `CreateDBParameterGroup` (single resource) succeeded in this run |
| `servicediscovery:CreateService`, `elasticloadbalancing:CreateListener`, `CreateRule`, `ecs:CreateService` | Possibly (namespace, load balancer, listener, cluster) | No (session resources, later) | **[U] K-2**, for the first `up`, not G3 |

For K-1 and K-2 no IAM change is proposed now: there is no evidence that they fail, and the brief asks for the minimum change. They are covered by hard stops and the same diagnosis path (decode the message, report, no further change without approval).

## 5. Resource-by-resource recovery matrix

The 26 that are not in AWS or state:

| Terraform resource | Declared action | AWS state | Terraform state | Failure reason | Recommended recovery |
| --- | --- | --- | --- | --- | --- |
| `aws_subnet.public["a"]` | create | Absent [V] | Absent [V] | Explicit deny `CreatesCarry*` on parent VPC (denial 4) | Create in recovery apply, after P-1 |
| `aws_subnet.public["b"]` | create | Absent | Absent | Same (denial 5) | Same |
| `aws_subnet.db["a"]` | create | Absent | Absent | Same (denial 6) | Same |
| `aws_subnet.db["b"]` | create | Absent | Absent | Same (denial 7) | Same |
| `aws_subnet.db["c"]` | create | Absent | Absent | Same (denial 8) | Same |
| `aws_route_table.public` | create | Absent | Absent | Same (denial 9) | Same |
| `aws_route_table.db` | create | Absent | Absent | Same (denial 10) | Same |
| `aws_security_group.alb` | create | Absent | Absent | Same (denial 2) | Same |
| `aws_security_group.database` | create | Absent | Absent | Same (denial 1) | Same |
| `aws_security_group.db_admin` | create | Absent | Absent | Same (denial 3) | Same |
| `aws_route.public_internet` | create | Absent | Absent | Not attempted: needs `aws_route_table.public` | Create (allowed by `OwnTagged` on the tagged route table) |
| `aws_route_table_association.public["a"]` | create | Absent | Absent | Not attempted: needs subnet and route table | Create (both parents tagged, `OwnTagged`) |
| `aws_route_table_association.public["b"]` | create | Absent | Absent | Same | Same |
| `aws_route_table_association.db["a"]` | create | Absent | Absent | Same | Same |
| `aws_route_table_association.db["b"]` | create | Absent | Absent | Same | Same |
| `aws_route_table_association.db["c"]` | create | Absent | Absent | Same | Same |
| `aws_vpc_endpoint.s3` | create | Absent | Absent | Not attempted: needs `aws_route_table.public` | Create; would have hit the same deny on its parents without P-1 (§4.5) |
| `aws_vpc_security_group_ingress_rule.alb["80"]` | create | Absent | Absent | Not attempted: needs `aws_security_group.alb` | Create (`Ec2CreateRule` + `OwnTagged`; the authorize actions are not in `tagged_creates`) |
| `aws_vpc_security_group_ingress_rule.alb["443"]` | create | Absent | Absent | Same | Same |
| `aws_vpc_security_group_ingress_rule.database_from_db_admin` | create | Absent | Absent | Not attempted: needs both groups | Same |
| `aws_vpc_security_group_egress_rule.db_admin_database` | create | Absent | Absent | Same | Same |
| `aws_vpc_security_group_egress_rule.db_admin_https` | create | Absent | Absent | Not attempted: needs `aws_security_group.db_admin` | Same |
| `aws_db_subnet_group.main` | create | Absent | Absent | Not attempted: needs the 3 db subnets | Create |
| `aws_db_instance.main` | create | Absent | Absent | Not attempted: needs subnet group and database group | Create (K-1 hard stop); created **running**: `down` immediately after |
| `aws_iam_role_policy.db_admin_execution` | create | Absent (role has no policy) | Absent | Not attempted: references `aws_db_instance.main.master_user_secret` | Create after the database |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | create | Absent | Absent | Same | Same |

The 38 that exist (all verified in AWS and in state):

| Terraform resource | Declared action | AWS state | Terraform state | Failure reason | Recommended recovery |
| --- | --- | --- | --- | --- | --- |
| `aws_acm_certificate.main` | create | Exists, PENDING_VALIDATION (created 22:46:18), 2 validation records pending, not in use [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_cloudwatch_log_group.ops` | create | Exists, retention 14 days, 0 bytes [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_db_parameter_group.main` | create | Exists (`munaxa-nonprod-pg16`, postgres16), tagged [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_default_security_group.default` | create | `sg-09f4c73e5cd0880c6`, 0 ingress and 0 egress rules, tagged `munaxa-nonprod-default-unused` [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_ecs_cluster.main` | create | ACTIVE, 0 services, 0 running, 0 pending tasks, tagged [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_ecs_cluster_capacity_providers.main` | create | FARGATE and FARGATE_SPOT attached [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_iam_role.db_admin_execution` | create | Exists, boundary `munaxa-shared-workload-boundary`, **no inline or attached policy yet** (its policy is one of the 26) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_iam_role.docs_db_admin_execution[0]` | create | Exists, same boundary, **no policy yet** (one of the 26) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_internet_gateway.main` | create | `igw-01c51c4963afa87fb`, attached to the nonprod VPC, tagged [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_kms_alias.data` | create | `alias/munaxa-nonprod-data` -> key `45eda044...` [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_kms_key.data` | create | Enabled, ENCRYPT_DECRYPT, rotation on [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket.files["docs"]` | create | Bucket exists (both buckets: all four public-access blocks on; docs versioning Enabled) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket.files["school"]` | create | Bucket exists (both buckets: all four public-access blocks on; docs versioning Enabled) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_cors_configuration.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_cors_configuration.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_lifecycle_configuration.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_lifecycle_configuration.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_ownership_controls.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_ownership_controls.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_policy.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_policy.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_public_access_block.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_public_access_block.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_server_side_encryption_configuration.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_server_side_encryption_configuration.files["school"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_s3_bucket_versioning.files["docs"]` | create | Bucket setting applied (4 transient `OperationAborted` retries in CloudTrail, all then succeeded) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["control-api"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["control-migrate"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["docs-api"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["docs-operator"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["identity"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["identity-migrate"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["school-api"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["school-migrate"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["work-api"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_secretsmanager_secret.service["work-migrate"]` | create | Container exists, KMS key `munaxa-nonprod-data`, **no secret version** (value never set, as designed; not read) [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_service_discovery_private_dns_namespace.main` | create | `nonprod.munaxa.internal` (`ns-d2gy2gp44byzxcef`), private zone `Z05887381K9O4VANJZICT`, 0 services [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |
| `aws_vpc.main` | create | `vpc-0824ebbff902d2980`, 10.130.0.0/16, tagged Project munaxa, Environment nonprod [V] | In state, status ok, not tainted [V] | None | **Keep.** No action; the recovery plan must show it as no-op |

"Exists" above means the API returns it with the stated settings; it does not mean the Testing environment works. Nothing can run yet: no subnet, no route to the internet, no database, no image for Identity, Control, Work or School, and empty secrets.

## 6. Required code changes

Two changes, prepared in this task, **not merged and not applied**:

**C-1, bootstrap (IAM guardrail), for owner approval as P-1.** Patch `supporting/bootstrap-createscarry-ec2-parents.patch` (sha256 `70fbed7d2319a24307dde7c81a45ac3a16d3a85bd300f62e32ae6ef93e0daf00`), against `bf46c5d`:

- `iam_allow.tf`: new local `ec2_create_parents` = the four ARNs `arn:aws:ec2:eu-central-1:229251310592:{vpc,subnet,security-group,route-table}/*`.
- `iam.tf`: in `CreatesCarryProjectTag` and `CreatesCarryEnvironmentTag`, `resources = ["*"]` becomes `not_resources = local.ec2_create_parents`. Actions and conditions unchanged. A comment records why.
- `tests/bootstrap.tftest.hcl`: one new assertion (both statements have no `Resource`, exactly those four `NotResource` ARNs, and still cover `ec2:CreateSubnet` and `rds:CreateDBInstance`).

Local check (Terraform 1.16.5, AWS provider 6.67.0, mocked provider, no AWS call): `terraform fmt -check -recursive infra/aws` clean; `terraform validate` (bootstrap) passes; `terraform test` (bootstrap) **12 passed, 0 failed**; with `iam.tf` reverted, the new assertion fails (so it guards the change). [V]

**C-2, the recovery declaration.** `supporting/nonprod.expected-changes.g3-recovery-DRAFT.json` (sha256 `c8ca8789a72bc9ae0f2aebdadc93522c268af67b32bba528c0cc9ca3e05cb931`): the 26 addresses of §5, each `["create"]`, taken from the merged 64-address declaration by filter (no address typed by hand). `scripts/terraform/check-plan-intent.sh --validate`: "Declaration valid: root stack-nonprod, 26 declared change(s)." It replaces `infra/aws/stack/envs/nonprod.expected-changes.json`, because the apply job enforces an exact match and the real plan will now contain 26 creates, not 64. [V]

No change to `infra/aws/stack/*.tf`, the workflows, or any product repository is needed. The G3 architecture and its 64-resource intent are unchanged: the recovery only completes it.

## 7. Proposed AWS changes (none executed)

### P-1: the IAM change, for owner approval

| | |
| --- | --- |
| What | The two inline statements above, in three inline policies |
| Where in AWS | `aws_iam_role_policy.deployer["nonprod"]`, `aws_iam_role_policy.deployer["prod"]`, `aws_iam_role_policy.deployer_session["nonprod"]` (the session deployer takes the same guardrails through `source_policy_documents`) |
| How | Root, CloudShell, `infra/aws/bootstrap` at the merge commit of C-1: `terraform init -reconfigure`, `terraform plan -out`, check, `terraform apply` of the saved plan, post-apply plan |
| Expected plan | **`0 to add, 3 to change, 0 to destroy`**, those three addresses, attribute `policy` only. Anything else: stop |
| Size | Each statement grows by 207 characters (414 per policy). Deployer about 6,796 -> 7,210; session deployer about 9,468 -> 9,882 characters minified, under the 10,240 limit for a role's inline policies [V: lengths of the live documents read; E: the new length is computed, not rendered by AWS] |
| Trust, boundaries, SCPs, role assignments | Unchanged |

**Security impact.** The denies stop applying to `vpc/*`, `subnet/*`, `security-group/*` and `route-table/*` in this account and Region. For those four types, "created without the Project or Environment tag" is still refused, by the allow-list alone: the only EC2 create allows are `Ec2Create<Type>`, each on its own type and only with both request tags; `OwnTagged` (`ec2:*`) needs `aws:ResourceTag/*`, which a resource being created does not have [E: from the policy text and the decoded contexts]; and the session deployer has no EC2 create allow at all. A create with a **wrong** tag value is still refused explicitly by `NeverTagForAnotherProject` and `NeverCreateForTheOtherEnvironment`, and anything in the default VPC by `NeverProtectedVpcs` and `NeverInProtectedVpcs`. The second layer for "missing tag" on those four types is what is given up; nothing new is allowed. All other 17 actions (internet gateway, VPC endpoint, ELB, ECS, RDS, Logs, KMS, ACM, Cloud Map) keep both layers. The prod deployer gets the same change; prod has never been applied.

**Statuses.** D-B stays PARTIALLY VERIFIED (Testing only). B2 stays ROOT CAUSE UNRESOLVED, ACCEPTED FOR TESTING ONLY. Neither is changed or used as authority by this proposal; P-1 needs its own owner approval.

### P-2: the recovery apply, for owner approval after P-1

`aws-terraform.yml` dispatch on `main` at the merge commit of C-1 + C-2, `nonprod`, `apply`, two `aws-nonprod` approvals.

**Expected recovery plan:** **`Plan: 26 to add, 0 to change, 0 to destroy`**, no replace, the 26 addresses of §5 exactly, intent check `--enforce` passing against C-2. The 38 existing resources must be no-op. [E: derived from state and code; the real plan job is the verification. A local mocked plan cannot reproduce it because it starts from empty state.]

**Minimum AWS changes overall:** three inline-policy updates (P-1) and 26 creates (P-2). No import, no state edit, no delete, no replacement, no change to the 38 existing resources.

## 8. Cost impact [E]

Prices from `2026-11-05-g3-plan-review/02` §3 (AWS Price List, eu-central-1, on demand).

| State | Above the pre-G3 baseline (about US$2.5 to 3 a month) | Account idle |
| --- | --- | --- |
| **Now (partial G3)** | 10 secrets 4.00 + data key 1.00 + Cloud Map private zone 0.50 = **about US$5.5** | about US$8 to 8.5 |
| **After recovery, database stopped** | about **US$8.7** (adds RDS 20 GB gp3 storage about 2.74 and backups; gateway endpoint free; no public IPv4) | about **US$11 to 12** |
| With RDS automatic restarts (AWS starts a stopped instance after 7 days) until the backstop exists | up to about US$10.5 | up to about US$13 to 14 |
| Database left running | + US$0.019 an hour (about US$14 a month) | — |

The recovery apply creates the database running; it runs from creation (about 10 to 15 minutes) until `down` stops it. No NAT, ALB or public IPv4 is created by G3 or by the recovery. The Testing budget reads US$0 until `Environment` is an active cost allocation tag (`02` §9).

## 9. Risks, failure handling and rollback

| Id | Risk | Handling |
| --- | --- | --- |
| K-1 | `rds:CreateDBInstance` refused by the same deny on its option, parameter or subnet group [U] | Hard stop: the recovery apply then ends with the network, groups and rules created and tracked, the database and the two role policies not. No destroy. Decode the message (`aws sts decode-authorization-message`, root, read-only), report; a further narrow change follows the same approval path |
| K-2 | Session creates (listener, rule, ECS service, Cloud Map service) refused at the first `up` [U] | Not G3. Before the first session, either evidence or the same decode path |
| K-3 | The recovery plan is not 26/0/0 (drift on the 38, or anything else) | Do not approve the apply; report the run id |
| K-4 | Tonight's scheduled `aws-session.yml` (01:47 UTC) and later ones fail at "Plan the switches" ("the session plan changes more than the session") because state now exists with 26 resources missing | Expected, safe: the check exits before any apply; the "Stop the database" job finds no database. Red until the recovery apply. Not a reason to disable the schedule |
| K-5 | ACM validation timeout: the certificate was requested at 22:46:18 UTC 5 Nov; AWS stops trying after 72 hours, about **22:46 UTC 8 Nov** | Add the two validation CNAMEs (DNS only) by then, independent of the recovery (owner, Cloudflare). After expiry: a replacement needs its own plan |
| K-6 | The database runs unattended | `down` right after the apply (G3 checklist steps 9 and 10); backstop before any session |
| K-7 | P-1 breaks something else | Bootstrap tests pass; the change only removes deny coverage, never adds an allow. Post-apply bootstrap plan must be clean |

**Rollback of P-1:** re-apply bootstrap at `bf46c5d` (root, CloudShell): expected `0 to add, 3 to change, 0 to destroy`, restoring `Resource: "*"`. Reversible within minutes; does not affect created resources.

**Rollback of P-2 / G3 as a whole:** not recommended and not part of this plan. It would be a separately approved `terraform destroy` plan as the deployer, after turning off `database_deletion_protection` (true in `nonprod.tfvars`); a final snapshot is taken (`skip_final_snapshot = false`); secrets enter a recovery window; the KMS key enters a pending-deletion window. The partial state itself needs no rollback: it is consistent and the 38 resources are harmless at about US$5.5 a month.

**If the recovery apply fails part way:** same as this time. Stop, no retry, no destroy, read the log and CloudTrail, decode messages, reconcile state read-only, report. Terraform keeps whatever was created in state.

## 10. Exact next execution sequence

| # | Who | Step | Expected | Stop if |
| --- | --- | --- | --- | --- |
| 1 | Owner | Approve this recovery plan: P-1 (IAM change, §7) and P-2 (26-create apply) | Approval in the project thread | — |
| 2 | Lead | Open one PR with C-1 and C-2 (bootstrap patch byte for byte, recovery declaration byte for byte); checks green | PR changes exactly 4 files: `bootstrap/iam.tf`, `bootstrap/iam_allow.tf`, `bootstrap/tests/bootstrap.tftest.hcl`, `stack/envs/nonprod.expected-changes.json` | Any other file |
| 3 | Owner | Review and merge the PR; record the merge SHA | — | — |
| 4 | Owner (root, CloudShell) | Bootstrap: `git checkout <merge SHA>`, `terraform -chdir=infra/aws/bootstrap init -reconfigure`, `plan -out=p1.tfplan`, `show -json` checked by address | **0 add, 3 change, 0 destroy**; addresses `aws_iam_role_policy.deployer["nonprod"]`, `["prod"]`, `aws_iam_role_policy.deployer_session["nonprod"]` | **Any other count or address: STOP, do not apply** |
| 5 | Owner | `terraform apply p1.tfplan`, then `terraform plan -detailed-exitcode` | Apply 0/3/0; post-apply exit 0 | Non-zero |
| 6 | Owner or lead (read-only) | `aws iam get-role-policy --role-name munaxa-shared-deployer-nonprod --policy-name deployer`: both `CreatesCarry*` show `NotResource` with the four ARNs and no `Resource` | As stated | Otherwise STOP |
| 7 | Owner | Dispatch `aws-terraform.yml`, `main` at the merge SHA, `nonprod`, `apply`; approve the plan job | — | Head SHA not the merge SHA |
| 8 | Owner | Read the plan summary | **26 to add, 0 to change, 0 to destroy**, no replace, intent `--enforce` passes | **Anything else: do not approve the apply** |
| 9 | Owner | Approve the apply job within 4 hours | Apply succeeds | Any error: stop, report the run id (K-1) |
| 10 | Owner | Immediately dispatch `aws-session.yml` `down` | Both jobs green; "database munaxa-nonprod-pg: was available, stop requested" (it may wait for creation to finish) | Fails: stop the database in the RDS console (reversible) |
| 11 | Owner | Verify the database is **Stopped** | — | Not stopped |
| 12 | Lead (read-only) | Reconcile again: state 64 addresses, AWS inventory, CloudTrail errors for the run; report | 64 tracked, 0 untracked | Any difference |
| 13 | Owner | ACM validation CNAMEs before about 22:46 UTC 8 Nov (G3 checklist 11 and 12) | Certificate Issued | — |
| 14 | — | Backstop, then the first-session prerequisites (§12) | — | No session before the backstop is verified |

The G3 checklist's steps 2 to 4 (pre-apply `down` with "nothing to take down") no longer apply: the state exists now, and until step 9 a `down` fails at its plan check (K-4). Step 10 above replaces G3 checklist step 9.

## 11. AWS calls made (all read-only, root connector)

`sts:GetCallerIdentity`; `sts:DecodeAuthorizationMessage` ×3; `s3:HeadObject`, `s3:ListObjectVersions`, `s3:GetObject` (state, parsed in the sandbox, addresses and ids only), `s3:ListBuckets`, `s3:GetPublicAccessBlock` ×2, `s3:GetBucketVersioning` ×2; `ec2:Describe{Vpcs,Subnets,RouteTables,SecurityGroups,InternetGateways,VpcEndpoints,NatGateways,Addresses,NetworkInterfaces,SecurityGroupRules}`; `ecs:DescribeClusters`, `ListClusters`, `ListTaskDefinitions`; `servicediscovery:ListNamespaces`, `ListServices`; `route53:ListHostedZones`; `rds:DescribeDBInstances`, `DescribeDBSubnetGroups`, `DescribeDBParameterGroups`, `DescribeDBSnapshots`; `elasticloadbalancing:DescribeLoadBalancers`, `DescribeTargetGroups`; `acm:ListCertificates`, `DescribeCertificate`; `secretsmanager:ListSecrets` (metadata only; no `GetSecretValue` or `BatchGetSecretValue`); `kms:ListAliases`, `DescribeKey`, `GetKeyRotationStatus`; `logs:DescribeLogGroups`; `ecr:DescribeRepositories`, `DescribeImages` ×14; `iam:ListRoles`, `GetRole` ×2, `ListRolePolicies` ×3, `ListAttachedRolePolicies` ×3, `GetRolePolicy` ×4; `cloudtrail:LookupEvents` ×2; `scheduler:ListSchedules`; `tag:GetResources` ×2. No write of any kind. GitHub: workflow job list and job logs (read).

## 12. Other outstanding prerequisites (assessed, not implemented)

| Item | State [V unless marked] | Needed before | Owner of the step |
| --- | --- | --- | --- |
| ACM DNS validation | Two CNAMEs pending (names in §2); deadline about 22:46 UTC 8 Nov | First session (HTTPS listener) | Owner, Cloudflare, DNS only. Not published by this task |
| Shutdown backstop | `session_backstop_schedule = ""`; no Scheduler schedule exists; `TestingBackstop` already in the nonprod boundary | Before any session (C-6) | Own PR, 13-create declaration, plan, approved apply, first 21:00 UTC run verified (G3 checklist 13) |
| ECR images Identity, Control, Work | 0 images in all 8 repositories (School 3 too) | First session of each product | Publisher workflows in each product repo, owner-dispatched; image tag protection first |
| Cloudflare Access | Not checked (no Cloudflare access in this task) [U]; `operator-test.munaxa.com` must sit behind an Access application (`infra/aws/cloudflare-access.md`) | Control portal session | Owner |
| Identity signing keys | Not present in any secret (no versions anywhere) | Identity first start | Owner generates; value goes into `munaxa-nonprod/identity` |
| Secret values | All 10 containers empty | Each service's first start | Owner, through the agreed write path; never printed |
| Valkey and PostgreSQL image digests | `valkey_image` and `postgres_image` default `""`, not set in `nonprod.tfvars` (only `docs_redis_image` is pinned) | Services that use them, db-admin tasks | Code PR with digests, reviewed |
| Control licence key | `control_licence_kid` and `control_licence_public_key` default `""`; the two-step KMS key (Config A then B) not started | Control first start | Per `2026-11-05-g3-plan-review/04` §5 |
| DNS-H1 | The ALB is created on every `up` and destroyed on `down`, so its DNS name changes each session | Every session | Update the Testing CNAMEs after each `up` |

## 13. Facts and assumptions

- **Verified:** the job log, the 10 CloudTrail denials and their timing, the decoded messages (3 of 10), the live statements, the state metadata and addresses, the AWS inventory, the git history of the statements, the local Terraform checks.
- **Estimated:** the recovery plan count (26/0/0) until the real plan runs; the new policy lengths; costs; that the 7 undecoded denials match the 3 decoded ones (same action types and resource).
- **Unverified:** K-1 and K-2; Cloudflare state; S3 object contents of the file buckets.
