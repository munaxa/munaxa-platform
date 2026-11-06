# G3 non-production recovery: execution report

- **Date:** 6 Nov 2026, 13:22 UTC to 16:26 UTC. **Author:** the lead of the thread "Recover failed G3 Testing apply".
- **Authorization:** the owner's brief "Execute G3 Non-Production Recovery — Approved" (6 Nov, about 05:00 UTC), Stages A to E. Two further owner approvals were given on decision cards during execution: PR #56 (13:30) and PR #59, the IAM change (16:00). The owner also approved each plan and apply job in the `aws-nonprod` GitHub environment.
- **Plan being executed:** [`../2026-11-05-g3-failed-apply-recovery/`](../2026-11-05-g3-failed-apply-recovery/) (platform #54, `f784491`); code and the 26-create declaration in platform #55 (`a25898c`).
- **AWS access:** the AWS connector's sign-in was expired for the whole task, so every AWS read and both root bootstrap re-applies were run **by the owner as root in CloudShell**, from scripts pinned by commit and sha256 (in `supporting/`). Their outputs are pasted verbatim in `supporting/owner-output-*.txt`. The lead made no AWS call. The stack applies and the shutdown ran in GitHub Actions under the nonprod deployer role.
- **Labels:** **[V]** verified from a log or an AWS read (source given), **[E]** inferred, **[O]** owner action.

## Verdict

# RECOVERY COMPLETE

All 64 G3 resources now exist and are tracked in state, no more and no fewer (§7). The apply finished in run 42248868140 [V]. Shutdown ran in run 42251171427 and the database read `stopped in-sync` at 16:25:52 [V]. Nothing billable is running: no ECS task, load balancer, NAT gateway, Elastic IP or EC2 instance [V].

**This was not a single clean 26-create apply.** Stage C took four plan rounds and three apply attempts. Two attempts failed partway, each on a different defect that the mocked plan and the IAM simulation could not catch (§4, §5). Each failure stopped at a guard. Each fix was a merged PR, and the declaration was narrowed after each partial apply, never widened. One fix was a new IAM permission. That falls outside the brief's own boundary ("Do not introduce additional IAM permissions") and was made **only after a separate explicit owner approval** (§5.4). The original 64-create declaration was never rerun.

## 1. Preflight evidence (Stage A)

Owner script `supporting/stage-ab-owner-cloudshell.sh` (sha256 `744941d5…cae8`, fetched at `6cb4ab6`), run 13:22:11 to 13:23:25 UTC. Output: `supporting/owner-output-stage-ab.txt`. [V]

| Check | Result |
|---|---|
| Identity | `arn:aws:iam::229251310592:root` |
| Region | `eu-central-1` |
| Nonprod state | `nonprod/terraform.tfstate`, SSE `aws:kms`, serial 3, lineage `7aae1c65…`, 38 instances (same as the recovery report) |
| Lock | none |
| Running | no database, 0 ECS tasks |
| PR #55 present | pinned clone at `a25898c`; diff since `6b8997a` is the 3 files of #55 |
| Declaration | `infra/aws/stack/envs/nonprod.expected-changes.json` at `a25898c` = the 26 missing addresses (the recovery report's §6 matrix) |
| Live CreatesCarry statements before | `Resource: "*"` on all three policies, as expected |

## 2. Bootstrap plan and execution (Stage B)

Same script and log as §1. [V]

- Saved plan: **`Plan: 0 to add, 3 to change, 0 to destroy.`** The three addresses were exactly the approved ones: `aws_iam_role_policy.deployer["nonprod"]`, `deployer["prod"]` and `deployer_session["nonprod"]`. On each, only the two CreatesCarry statements changed (`Resource *` → `NotResource` of the four EC2 parent types), and every other statement was unchanged. Policy sizes after: 7,210, 7,226 and 9,882 characters, against a 10,240 limit.
- Apply exit 0, followed by a clean post-apply plan ("found no differences").
- Live after: all six statements show `NotResource` of `vpc/*`, `subnet/*`, `security-group/*` and `route-table/*`. Bootstrap state stays at 68 resources, with no bootstrap lock. Done at 13:23:25.

A second bootstrap re-apply (B2) was needed later for the IAM change in §5.4. It was approved separately and is reported there.

## 3. Bootstrap test results

- Stage B, at `a25898c`: `terraform test` → **`Success! 12 passed, 0 failed.`** [V, owner log]
- Stage B2, at `9e45133`: **`Success! 12 passed, 0 failed.`** These include the new assertions of #59: the exact `SecretsManagerDefaultKeyMetadata` statement, and each `deployer_allow` document at or under 6,144 characters. [V, `supporting/owner-output-stage-b2.txt`]
- The same suites ran green in CI on #55 and #59 before merge.

## 4. Fresh plans (Stage C), in order

All plans ran in `aws-terraform.yml` (`nonprod`, `apply`) on `main`. The intent check runs `check-plan-intent.sh --enforce` against the current declaration, so any plan that was not exactly the declared creates was refused before it was saved.

| Run | Commit | Declaration | Plan | Outcome |
|---|---|---|---|---|
| [42225271265](https://github.com/munaxa/munaxa-platform/actions/runs/42225271265) | `a25898c` (#55) | 26 | 26 create **+ 1 update** (`aws_db_parameter_group.main`, attribute `parameter`) | intent check FAILED; nothing saved or applied |
| [42227734534](https://github.com/munaxa/munaxa-platform/actions/runs/42227734534) | `d81185e` (#56) | 26 | 26 create + 1 update, the same diff | intent check FAILED; nothing applied |
| [42230546277](https://github.com/munaxa/munaxa-platform/actions/runs/42230546277) | `fc3b1c9` (#57) | 26 | **26 / 0 / 0** | passed; apply below |
| [42234410579](https://github.com/munaxa/munaxa-platform/actions/runs/42234410579) | `8cca472` (#58) | 6 | **6 / 0 / 0** | passed; apply below |
| [42248868140](https://github.com/munaxa/munaxa-platform/actions/runs/42248868140) | `9e45133` (#59) | 3 | **3 / 0 / 0** | passed; apply below |

Every passing plan had no replace, update or destroy, and every address was in the recovery report's matrix. No production or unrelated address appeared in any of them. [V, job logs]

**Parameter group diff (runs 42225271265 and 42227734534).**

- **Wrong first diagnosis.** #56 (owner-approved, `d81185e`) assumed `rds.force_ssl` was ignored because it is a PG16 default, stored with Source "system", and removed it. **That was wrong**: the next plan showed the same diff.
- **Actual cause.** It was found by reading the source of AWS provider 6.67.0. On refresh, the provider keeps configured parameters, including Source "system" ones, and records the `ApplyMethod` that AWS returns (`pending-reboot` for this static parameter). `apply_method` is part of the set hash, and the configuration's default was `immediate`, so the hashes never matched.
- **Fix.** #57 (`fc3b1c9`) restored the parameter with `apply_method = "pending-reboot"` and reverted #56's `CONTRACT.md` note. `CONTRACT.md` is byte-identical to `a25898c` again. #57 corrected the change the owner had approved in #56; it was merged under the standing merge rule without a second card. No AWS change was involved.
- **Live value.** `rds.force_ssl` reads `1` [V, Stage E].

## 5. Apply results

### 5.1 Run 42230546277: 20 of 26 created, then stopped

- **Result.** The apply created 20 resources, then failed on `CreateSecurityGroup` for `munaxa-nonprod-database` with `InvalidParameterValue`. The security-group description contained an apostrophe, which EC2 does not accept in descriptions. A mocked plan cannot catch this.
- **State and AWS afterwards.** Serial 4, 58 addresses, no lock, no RDS [V, owner read 14:11].
- **Fix.** #58 (`8cca472`) rewrote the description in `infra/aws/stack/data.tf` (same resource, same rules, text only) and narrowed the declaration to the 6 creates still missing. It was merged under the standing merge rule.

### 5.2 Run 42234410579: 3 of 6 created, then stopped

- **Result.** The apply created the database security group and its 2 rules. `CreateDBInstance` then failed with `KMSKeyNotAccessibleFault`; no database was created.
- **Cause.** The owner's CloudTrail read showed one error, `kms:DescribeKey` AccessDenied by `deployer-nonprod` on key `033b4382-b443-4527-a34e-41d91b62cfd5`. That key is `alias/aws/secretsmanager`, the AWS-managed key that RDS uses for the managed master password. AWS-managed keys carry no tags, so the deployer's tag-scoped KMS allow can never match them. This was the hard stop K-1 foreseen in the recovery plan, though on a different key than expected.
- **State.** Serial 5, 61 addresses, no lock, no RDS [V, owner read 15:42].
- **Process note.** The owner approved this apply before the lead had checked the plan. The job log confirmed afterwards that it was 6/0/0.

### 5.3 Run 42248868140: 3 of 3 created, success

The apply created `aws_db_instance.main`, `aws_iam_role_policy.db_admin_execution` and `aws_iam_role_policy.docs_db_admin_execution[0]`. The job succeeded at 16:16:39 UTC [V, job log]. Total created across the recovery: 20 + 3 + 3 = **26**.

### 5.4 The IAM change (owner-approved exception)

- **Change.** platform #59 (`9e45133`) adds one statement to `deployer_allow`: `SecretsManagerDefaultKeyMetadata`, allowing `kms:DescribeKey` on that one key ARN only. It grants no encrypt, decrypt or grant action and no other key, and no deny was changed. It also narrows the declaration to the 3 missing creates.
- **Approval.** The owner approved it on a decision card at 16:00, because the brief forbids new IAM permissions without such an approval.
- **Re-apply (B2).** The owner ran `supporting/stage-b2-owner-cloudshell.sh` (sha256 `2443cdec…d32d9`, pin `9e45133`) at 16:01:52 to 16:03:30. It checked that the state was missing exactly the 3 declared creates, and that bootstrap files changed since `a25898c` were only `iam_allow.tf` and the test.
  - Plan **0 / 2 / 0**, on `aws_iam_policy.deployer_allow["nonprod"]` and `["prod"]`. Exactly that one statement was added; the policies are now 5,880 and 5,813 characters.
  - Apply exit 0, followed by a clean post-apply plan. The statement is live in both policies, and there was no lock. [V, `supporting/owner-output-stage-b2.txt`]
  - The `prod` policy belongs to the shared bootstrap's prod deployer role. It changes in the same way, because one code path renders both. No production infrastructure exists or was touched.

## 6. Shutdown result (Stage D)

[`aws-session.yml` run 42251171427](https://github.com/munaxa/munaxa-platform/actions/runs/42251171427), `session: down`, dispatched at 16:18, both jobs green [V, job logs]:

- **"Stop the database":** `database munaxa-nonprod-pg: was available, stop requested`.
- **"Testing down":** switches plan with edge and services off. The result was **No changes** (0/0/0/0) and `Session down applied`; the database was then `stopping`.
- **Owner read at 16:23:** `stopping`. **Owner read at 16:25:52:** **`stopped in-sync`** [V, end of `supporting/owner-output-stage-e.txt`].
- **Nothing else running:** ECS services 0, tasks 0, load balancers 0, NAT gateways 0, Elastic IPs 0, EC2 instances 0 [V, Stage E].

## 7. AWS versus Terraform reconciliation (Stage E)

Owner script `supporting/stage-e-owner-cloudshell.sh` (sha256 `2e7e5744…7038`, pin `5c2b520`), run 16:23:30 to 16:24:08 UTC as root, read only. Output: `supporting/owner-output-stage-e.txt`. Secret values were never read; Secrets Manager was read by `list-secrets` metadata only. [V]

| Item | Result |
|---|---|
| State | serial 7, lineage `7aae1c65` (unchanged since the failed apply), SSE `aws:kms`, last written 16:19:27. The down run wrote serial 7 with no resource change [E] |
| Lock | **none** |
| Count | **64 addresses in state = 64 expected G3 addresses** (the 38 of the failed apply plus the 26 of this recovery, fetched at the pin). In the list but not in state: **none**. In state but not in the list: **none** |
| RDS | `munaxa-nonprod-pg`: `db.t4g.micro`, PostgreSQL 16.13. Storage encrypted, not public, single-AZ, 20 GiB; deletion protection on. Now **stopped**, parameter group in-sync, `rds.force_ssl = 1`. One automated snapshot from creation (16:13) |
| ECS | cluster exists (one of the 38); services 0, tasks 0 |
| Load balancers | 0 (the ALB is a session resource, created only by `up`) |
| ACM | `*.test.munaxa.com`: **PENDING_VALIDATION** (see §8) |
| VPC | `vpc-0824ebbff902d2980`; 1 internet gateway; S3 gateway endpoint `available` |
| Subnets | public a and b (`10.130.0.0/24`, `10.130.1.0/24`); database a, b and c (`10.130.64–66.0/24`). None maps public IPs at launch |
| Route tables | `rt-public`: local + `0.0.0.0/0` (to the IGW), 2 associations; `rt-db`: local only, 3 associations; the VPC main table: local only, its 1 main association |
| Security groups | `alb`: 2 ingress, 0 egress (service egress only exists in a session); `database`: 1 ingress (from db-admin); `db-admin`: 0 ingress, 2 egress (443, 5432); `default`: no rules. This matches `edge.tf`, `data.tf` and `ops.tf` with services off |
| Log groups | `/munaxa/nonprod/ops`, 14-day retention, as declared (the only stack log group) |
| Secrets (metadata) | the 10 `munaxa-nonprod/*` containers declared by the stack, plus RDS's managed `rds!db-…` master secret (owned by RDS); all encrypted, with no value read |
| ECR | 14 repositories from the bootstrap. Docs repositories have 6 images each (from before G3); identity, control, work and school have **0**. No image was published |
| Budgets | `munaxa-account-monthly` 6.21 of 10.00 USD; `munaxa-shared-account-monthly` 6.21 of 50; `munaxa-shared-testing-monthly` 0.05 of 50; `munaxa-docs-eu-prod-monthly` 4.69 of 10 (the old Docs stack before its retirement on 4 Nov). Cost Explorer, 1 to 7 Nov: 6.21 USD |
| CloudTrail write errors by `deployer-nonprod` since 13:00 | the 2 known failures (§5.1, §5.2). Also 4 `CreateSubnet` `RequestLimitExceeded`, which were throttling retried by the SDK (all 5 subnets exist), and 3 `RevokeSecurityGroupEgress` `InvalidPermission.NotFound`, which come from the provider removing the default egress rule on new groups [E]. Neither left anything out of place |

**Discrepancies:** none between state and AWS.

## 8. Remaining blockers and risks

1. **ACM certificate validation. Owner, deadline about 22:46 UTC on 8 Nov.**
   - The certificate was requested at 22:46:18 on 5 Nov and is still PENDING_VALIDATION.
   - It needs the DNS validation CNAME in Cloudflare. Changing DNS was outside this brief and was not done.
   - If the deadline passes, the certificate fails and must be re-requested, which would be a replace in a later plan.
2. **Shutdown backstop not built.** It is a separate 13-create apply, kept out of G3 on purpose. Until it exists, a session that is not taken down depends on the scheduled `down` (19:17 and 01:47 UTC).
3. **RDS auto-start after 7 days stopped** (about 16:25 on 13 Nov). The scheduled `down` asks for a stop again on each run [E: the workflow's "Stop the database" job runs on every `down`].
4. **B2 (GetLogEvents simulation) is unchanged:** ROOT CAUSE UNRESOLVED, accepted for Testing only.
5. **Product prerequisites (from the readiness audit) are unchanged:** no product images, plus Cloudflare Access, signing keys, secret values and DNS (G6). This recovery delivers G3 infrastructure only. It does not make Testing ready for a session.
6. **Lessons.** Three defects passed every pre-apply check: the parameter set hash, the description character set, and the AWS-managed key's lack of tags. The mocked plan and the IAM simulation cannot show provider refresh behaviour, EC2 input validation or tag-less AWS-managed keys. The next new-resource gate (the backstop) should expect the same class of failure, and keep the same guarded, narrowing-declaration approach.

## 9. Run IDs and CloudShell evidence

| What | Where |
|---|---|
| Stage A and B (owner, root) | `supporting/stage-ab-owner-cloudshell.sh` → `supporting/owner-output-stage-ab.txt` (13:22:11 to 13:23:25) |
| Plans, refused by the intent check | runs 42225271265, 42227734534 |
| Apply, partial (20) | run 42230546277 |
| Apply, partial (3) | run 42234410579 |
| Bootstrap B2 (owner, root) | `supporting/stage-b2-owner-cloudshell.sh` → `supporting/owner-output-stage-b2.txt` (16:01:52 to 16:03:30) |
| Apply, success (3) | run 42248868140 (16:16:39) |
| Shutdown | run 42251171427 |
| Stage E (owner, root, read only) | `supporting/stage-e-owner-cloudshell.sh` → `supporting/owner-output-stage-e.txt` (16:23:30 to 16:24:08, plus the 16:25:52 RDS read) |
| Code PRs | #55 `a25898c`, #56 `d81185e` (wrong fix), #57 `fc3b1c9`, #58 `8cca472`, #59 `9e45133` |
| Owner reads used for diagnosis | pasted in the thread at 13:27 (parameters), 14:11 (state), 15:42 and 15:43 (KMS, CloudTrail, state) |

## 10. Production and CanteenHub

- **Production:** no production infrastructure exists, and none was created, changed, read for content or destroyed. Every stack plan and apply ran with `environment = nonprod`, and no address outside the nonprod stack appeared. The only "prod" items touched were the two shared-bootstrap IAM policies of the prod deployer role (§2, §5.4). Each was changed only as approved, and each change narrows or adds metadata access.
- **CanteenHub:** not inspected, searched or touched. No read in any script names it.
- **Other boundaries:**
  - no Cloudflare, DNS or domain change; no image published; no migration run;
  - no secret value read or written; no Render or Supabase change;
  - nothing destroyed; no manual state edit, import or `state rm`;
  - the 26-create declaration was never expanded, and the 64-create declaration was never rerun.

No independent review of this report was run. ChatGPT's review is the review gate.
