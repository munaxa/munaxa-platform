# Development access policy update and Testing readiness continuation

- **Date:** 8 Nov 2026, from 06:30 UTC. **Thread:** "Update root access policy and verify Testing readiness".
- **Brief:** the owner's "Munaxa AWS — Development Access Policy Update and Testing Readiness Continuation" (8 Nov 2026, 06:30 UTC).
- **Starting point:** platform `main` = `8c7c282` (PR #65). Source of truth: [`../2026-11-07-release-readiness-verification/00-RELEASE-READINESS-VERIFICATION.md`](../2026-11-07-release-readiness-verification/00-RELEASE-READINESS-VERIFICATION.md) and [`../2026-11-07-testing-readiness-phase-1/00-TESTING-READINESS-PHASE-1.md`](../2026-11-07-testing-readiness-phase-1/00-TESTING-READINESS-PHASE-1.md).
- **AWS authorization for this task:** read-only inspection with the existing root-connected connector. No AWS or GitHub modification, no IAM simulation, no Terraform. CanteenHub fully out of scope.
- **Labels:** **[V-aws HH:MM]** observed in AWS in this task at that UTC time; **[V-gh]** verified from GitHub in this task; **[V-repo]** verified from code at `8c7c282`; **[V-doc]** AWS documentation read in this task; **[V-prior]** from an earlier report, not re-read; **[E]** inferred; **[U]** unverified; **[O]** owner action.

| File | Content |
|---|---|
| this file | Summary, policy decision, report corrections, fresh AWS evidence, image publication status, sequence, owner actions |
| [`../../../../infra/aws/ACCESS-POLICY.md`](../../../../infra/aws/ACCESS-POLICY.md) | **The development access policy** (development stage now; deployment stage prepared, deferred) |
| [`01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md`](01-GITHUB-RELEASE-CONTROLS-CHECKLIST.md) | Owner checklist for identity, control, work |
| [`02-CONFIG-A-IAM-ASSESSMENT.md`](02-CONFIG-A-IAM-ASSESSMENT.md) | Config A deployer IAM assessment |
| [`supporting/config-a-iam-simulation-PREPARED-NOT-RUN.sh`](supporting/config-a-iam-simulation-PREPARED-NOT-RUN.sh) | Simulation commands for owner review (not run) |

## 1. Summary

- **Fresh AWS evidence (8 Nov 06:54 to 06:55 UTC, read-only, root connector):** nothing running and nothing billable in compute or networking (0 ALB, NAT, EC2, Elastic IP, ECS service or task); RDS stopped; 8 ECR repositories IMMUTABLE with 0 images; 3 publisher roles match the code; 10 secret containers with 0 versions; only the nonprod data key exists (no licence key); ACM ISSUED, unattached, renewal INELIGIBLE; 11 backstop schedules enabled and both nightly runs (6 and 7 Nov) behaved as designed; no AccessDenied in 48 hours of CloudTrail write events. Live deployer policies match the code for every Config A statement.

- **Development access:** root plus the existing root-connected Claude connector remain the approved development method; no IAM identity is created for development or read-only checks; deployment IAM is prepared and deferred. Documented in `infra/aws/ACCESS-POLICY.md` and linked from `infra/aws/README.md`.
- **Report correction:** the 7 Nov blocker RB-3 ("no approved non-root read-only identity") is withdrawn. Technical blockers stay, including RB-5 (Config A IAM).
- **GitHub release controls:** still **not verified** (owner-only settings). 0 `image/*` tags, 0 publish runs, release SHAs unchanged [V-gh 06:33].
- **Config A IAM:** **NOT VERIFIED.** `ecs:RegisterTaskDefinition` resource scope is the likeliest failure; `kms:PutKeyPolicy` needs a real apply to prove. Simulation prepared, not run.
- **Image publication:** Identity and Control **still blocked**, now only on GitHub release-control evidence, the self-review decision and owner release approval (§5).

## 2. Development access policy (decision of 8 Nov 2026)

Full text: [`infra/aws/ACCESS-POLICY.md`](../../../../infra/aws/ACCESS-POLICY.md). In short:

**Development stage (now).** The existing root account and root-connected Claude AWS connector are the approved development access method. Root MFA stays on; root access keys are never created. No IAM user, role or Identity Center configuration is created solely to run readiness scripts or continue development. Claude performs only explicitly authorized AWS operations, keeps read-only inspection and changes clearly apart, and every infrastructure change has a defined scope, a reviewed plan where applicable and explicit authorization. Unexpected `AccessDenied` means stop and investigate before changing policies or retrying. Never retrieve or expose secret values, private keys, credentials, application data or Terraform state contents.

**Deployment stage (prepared, not implemented).** IAM Identity Center; an MFA-enforced operator identity; Administrator, Engineering and ReadOnly permission sets; dedicated, narrowly scoped deployment roles; root break-glass; production access separation; account recovery and access verification. None is created in this task, and none is a prerequisite for the development steps in §6.

**Development access is not deployment access.** Root proves nothing about what the Terraform deployer, CI, session or publisher roles may do. Those roles keep their own scoped permissions and must be assessed on their own (§4 IAM, 02).

## 3. Corrections to the 7 Nov release-readiness report

Applied in place, with the original text kept ([`../2026-11-07-release-readiness-verification/00-RELEASE-READINESS-VERIFICATION.md`](../2026-11-07-release-readiness-verification/00-RELEASE-READINESS-VERIFICATION.md): header note, §3.3 note, §7 RB-3 and RB-4):

1. Root-connected AWS access is intentionally retained during development by owner decision.
2. The owner authorizes read-only inspection with this existing connection when requested for the current readiness task.
3. No new IAM identity is required for such a check; §3.3 option (b) is not pursued, and option (a) (`ALLOW_ROOT_READONLY=yes`) is the approved mode, not a deviation.
4. Future deployment IAM remains deferred.
5. This does not grant blanket authorization for AWS modifications.
6. **Not removed:** RB-5 Config A IAM (root does not prove the deployer's permissions), RB-1/RB-2 GitHub controls and self-review, RB-6 product prerequisites.

The phase 1 report (7 Nov) needs no change for this: its root limitation was already superseded by the 7 Nov verification report.

## 4. Fresh AWS read-only verification

**Ran:** 8 Nov 2026, 06:54:06 to 06:55:26 UTC, through the existing root-connected AWS connector (caller `arn:aws:iam::229251310592:root`, account `229251310592`, Region `eu-central-1`), under the owner's read-only authorization for this task.

**Script review first.** `../2026-11-07-release-readiness-verification/supporting/release-readiness-readonly-check.sh` (v2) was read command by command: every AWS call is `sts get-caller-identity`, `organizations describe-organization`, `ecr describe-*`, `iam get-*/list-*` (role and policy documents), `secretsmanager list-secrets/list-secret-version-ids`, `kms list-aliases/describe-key`, `acm list-/describe-certificate`, `rds/ecs/elbv2/ec2 describe-*/list-*`, `scheduler list-schedules` and `cloudtrail lookup-events`. No create, put, update, delete, start, stop, tag, simulate or `get-secret-value`. **Safe and strictly read-only.** The connector has no shell, so the same calls were run one-to-one as boto3 read calls (two batches, because the connector allows 10 services per run), plus one extra read-only CloudTrail query (48-hour write events, summarized to time, name, user and error code; the raw event bodies were not kept or returned). No other call was made. The Secrets Manager calls return names and version metadata only; no value was requested.

### 4.1 Results (all [V-aws], times UTC on 8 Nov)

| # | Check | Result | Time |
|---|---|---|---|
| 0 | Caller, account, Organizations role | root of `229251310592`; organization `o-6i2zz7t70i`, management account `229251310592` (this account) | 06:54:06 |
| 1 | ECR repositories (8) | `munaxa-identity/{api,migrate}`, `munaxa-control/{api,migrate,portal}`, `munaxa-work/{api,admin,migrate}` all exist, **IMMUTABLE**, scan on push on, AES256. **0 images in every repository** (so no digests or tags exist yet) | 06:54 |
| 2 | Publisher roles (3) | `role/munaxa-shared/bootstrap/munaxa-{identity,control,work}-image-publisher` exist; max session 3600 s; no boundary; no attached policies; one inline policy `push-own-images`. **Trust:** GitHub OIDC provider, `aud` = `sts.amazonaws.com`, `sub` = `repo:munaxa@311481412/munaxa-<product>@<repo id>:environment:image-release` (identity 1354378376, control 1434295290, work 1318345640), `ref` like `refs/tags/image/*`. **Policy:** `ecr:GetAuthorizationToken` on `*`; push and read actions only on that product's own repositories | 06:54 |
| 3 | Secrets Manager `munaxa-nonprod/` containers | 10 containers: `identity`, `identity-migrate`, `control-api`, `control-migrate`, `work-api`, `work-migrate`, `school-api`, `school-migrate`, `docs-api`, `docs-operator`. **Version count 0 for every one** (no value has been set) | 06:54 |
| 4 | KMS `alias/munaxa-nonprod*` | One: `alias/munaxa-nonprod-data` → key `45eda044-…`, SYMMETRIC_DEFAULT, ENCRYPT_DECRYPT, Enabled, customer managed, created 5 Nov 22:46:18. **No licence (asymmetric) key exists** | 06:54 |
| 5 | ACM `*.test.munaxa.com` | `…/7cb48297-f637-4de3-bc1a-9d8203699f05`: **ISSUED**, NotAfter 2027-05-22, SANs `*.test.munaxa.com`, `operator-test.munaxa.com`; **InUseBy empty; RenewalEligibility INELIGIBLE** (expected while unattached; recheck after an ALB uses it) | 06:54 |
| 6a | RDS `munaxa-nonprod-pg` | **stopped**, db.t4g.micro, PostgreSQL 16.13, not public | 06:54 |
| 6b | ECS `munaxa-nonprod` | ACTIVE, 0 services, 0 running, 0 pending; **0 active task-definition families** with prefix `munaxa-nonprod` | 06:54 |
| 6c | ALB, NAT, EC2, Elastic IP | **0 load balancers, 0 NAT gateways, 0 EC2 instances (any non-terminated state), 0 Elastic IPs** in `eu-central-1` | 06:54 to 06:55 |
| 7 | Shutdown backstop | 11 schedules `munaxa-nonprod-backstop-*` (database + 10 services), all ENABLED, group `default` | 06:55 |
| 8 | Deployer `munaxa-shared-deployer-nonprod` | Exists; trust = CI role `munaxa-shared-ci-nonprod` with `sts:SourceIdentity` = `github-actions`; **no permissions boundary**; inline `deployer`; attached `deployer-read` (v1, 5 Nov 05:12), `deployer-nonprod-allow-tagged` (v1, 5 Nov 05:12), `deployer-nonprod-allow` (v3, 6 Nov 16:03). Workload boundary v3 (5 Nov 09:55). Statement-level comparison with the code at `8c7c282`: see 02 §2 (match) | 06:55 |
| 9 | CloudTrail, `eu-central-1`, 6 Nov 06:55 to 8 Nov 06:55 (212 write events, complete) | **No AccessDenied.** Backstop on 6 Nov and 7 Nov at 21:00: `StopDBInstance` → `InvalidDBInstanceStateFault` (DB already stopped) and 10 × `UpdateService` → `ServiceNotFoundException` each night, as designed. Last workload change: 6 Nov (G3 recovery and backstop applies). Since 7 Nov 21:00:49 the only write events are CloudShell session events by root (latest 8 Nov 06:40:42). No `ConsoleLogin` in this Region (root console sign-ins are logged in `us-east-1`, which was not queried) | 06:55 |

### 4.2 What changed since the last evidence

| Item | Last evidence | Now (8 Nov 06:54) |
|---|---|---|
| ECR images | 0 (owner, 6 Nov 21:21) [V-prior] | 0, unchanged |
| Publisher roles | Live-verified 31 Oct to 4 Nov [V-prior] | Re-read: trust and policy match the code (`bootstrap/` publisher module), unchanged |
| Secrets | 10 containers, 0 versions [V-prior] | Same |
| ACM | ISSUED 6 Nov, InUseBy empty, INELIGIBLE [V-prior] | Same |
| RDS | Stopped 6 Nov 16:18 [V-prior] | Stopped. AWS restarts a stopped instance after 7 days (about 13 Nov 16:18 UTC); the 21:00 backstop is then expected to stop it [E] |
| Backstop | First run verified 6 Nov 21:00 [V-prior] | Second run 7 Nov 21:00 also as designed |
| Deployer policies | Code only (7 Nov) | Live documents read; Config A statements match code |

### 4.3 Cost-relevant inventory

Nothing billable is running in compute or networking (no ALB, NAT, EC2, Elastic IP, ECS task). Remaining standing items: the stopped RDS instance's storage, one customer managed KMS key, 10 secret containers, the empty ECR repositories, the backstop schedules [E, from the inventory above].

## 5. Image publication readiness

| Condition (7 Nov §8) | Identity | Control | Evidence now |
|---|---|---|---|
| C-1 `image-release` with reviewer, admin bypass off | [U] | [U] | Owner checklist G-1, G-2, G-4 |
| C-2 deployment restricted to `image/*` tags | [U] | [U] | G-5 |
| C-3 self-review resolved | [U] | [U] | Owner decision |
| C-4 `AWS_IMAGE_PUBLISHER_ROLE_ARN` correct | [U] | [U] | G-7 |
| C-5 build token present, unexpired | [U] | [U] (fallback) | G-8, G-9 |
| C-6 live publisher role trust and policy equal code | **Verified** [V-aws 06:54] | **Verified** [V-aws 06:54] | §4 |
| C-7 ECR repos exist, IMMUTABLE, no image for the release SHA | **Verified**: 2 repos, IMMUTABLE, 0 images [V-aws 06:54] | **Verified**: 3 repos, IMMUTABLE, 0 images [V-aws 06:54] | §4 |
| C-8 `image/*` tag ruleset (recommended) | [U] | [U] | G-10 |
| C-9 owner approves release at the SHA | Pending | Pending | identity `5277d7190b3dda496443c4bd7d80c78bd4d9174e`, control `a24c5681f0ca98f446098444c79bc36cd4d9bc0c` [V-gh 06:33] |

**Identity: BLOCKED** on C-1, C-2, C-4, C-5 (owner GitHub evidence), the C-3 self-review decision and C-9 approval; the AWS side (C-6, C-7) is now verified. **Control: BLOCKED** on the same. Neither is blocked by AWS access any more. Publishing remains a separate owner-approved step.

## 6. Next development sequence (unchanged order; no Identity Center prerequisite)

1. Complete fresh read-only AWS verification (§4).
2. Complete GitHub release-control verification (01, owner).
3. Resolve Identity image publication prerequisites (C-1 to C-9).
4. Publish Identity images only after separate owner approval.
5. Resolve Control image publication prerequisites.
6. Publish Control images only after separate owner approval.
7. Complete the Config A IAM assessment (02; simulation only if separately authorized; otherwise the first apply with stop-on-AccessDenied).
8. Prepare Config A only when its inputs are evidenced (digests, Valkey and PostgreSQL digests, `operator_access`, Identity kid and public keys, desired counts, bootstrap products, declaration file).
9. Submit the exact Terraform plan for owner review before any apply.
10. Continue Identity and Control deployment and testing only after explicit approval.

## 7. Remaining blockers and owner actions

| # | Item | Who |
|---|---|---|
| O-1 | Fill in the GitHub checklist G-1 to G-11 for identity, control, work (01) | Owner |
| O-2 | Self-review decision: second reviewer, or explicit Testing-only risk acceptance | Owner |
| O-3 | Decide whether to authorize the prepared IAM simulation (02 §5), or rely on the first apply | Owner |
| O-4 | Approve each image release at its SHA (after O-1, O-2) | Owner |
| O-5 | Review and merge this PR (docs only; not merged by Claude) | Owner |
| RB-5 | Config A IAM NOT VERIFIED | Owner and Claude |
| RB-6 | Unchanged from phase 1: Cloudflare Access application, Identity signing key, secret values, Valkey and PostgreSQL digests, product DNS, no deployment or smoke test | Owner |
| RB-3 | **Withdrawn** (development access by owner decision) | — |

## 8. What this task did and did not do

- **Did:** read the 7 Nov reports, index and runbooks; wrote the access policy; corrected the 7 Nov report; reviewed the read-only script command by command; reran the read-only checks of the 7 Nov v2 script through the root connector (8 Nov 06:54 to 06:55 UTC) plus a 48-hour CloudTrail write-event summary; read GitHub tags and runs; assessed Config A IAM from code and documentation; prepared (did not run) an IAM simulation; wrote the owner checklist; added an index entry.
- **Did not:** create or change any AWS resource; create IAM users, roles or Identity Center; change IAM policies, boundaries or SCPs; read any secret value, private key, credential, application data or Terraform state; run an IAM simulation; run Terraform; publish images, push tags or trigger workflows; change GitHub settings, Cloudflare, DNS, certificates, Render, Supabase or production. CanteenHub was not inspected, inventoried or touched.
