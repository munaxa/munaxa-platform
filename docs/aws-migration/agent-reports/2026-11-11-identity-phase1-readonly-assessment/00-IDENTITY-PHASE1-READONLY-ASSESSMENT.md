# Identity non-production: Phase 1 read-only readiness assessment

> **Superseded, 11 Nov 2026.** This report arrived on `main` through the Workstream 4 PR (#94),
> not through its own PR #88, which stays open but is superseded and should not be merged on
> its own. The current procedure is the final operator runbook
> (`../2026-11-11-identity-final-operator-runbook/`) and the approval package in
> `../2026-11-11-identity-consolidated-readiness/`.

- Date: 11 Nov 2026, AWS calls 09:14 to 09:26 UTC
- Account `229251310592`, region `eu-central-1` (IAM and CloudTrail also read in `us-east-1`)
- Scope: the owner's 09:14 UTC approval of **Phase 1 only**. That covers read-only AWS and GitHub
  checks, permission simulation, and log-filter testing with synthetic data.
- Caller: `arn:aws:iam::229251310592:root` through the AWS connector (ACCESS-POLICY, 8 Nov)
- Repository: `main` at `49c51f3`. The preflight script `preflight-readonly.sh` has SHA256
  `21ae3205…`, the same as the reviewed file.
- Plan this follows: PR #87, phase A (A-0 to A-5). PR #87 is still open.

**This is evidence for ChatGPT review. It is not a request for deployment approval, and nothing
was changed.** No infrastructure change, workflow dispatch, Terraform, secret creation, secret
value, IAM change, DNS change, production change, merge, or GitHub App inspection.

## 1. Result

| Area                                 | Result                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A-0 connector call record            | The record shows service, operation, status and item counts only. See limit L-A0               |
| A-1 P-1 to P-11, P-13                | **PASS**, every line                                                                           |
| A-1 P-12 CloudTrail denials          | Raw rule: FAIL (12 denials). All 12 match the accepted signature S-1 to S-8: **EXPECTED**      |
| P-11b session roles against the code | **PASS**, 20 of 20 lines, using the script's own verifier                                      |
| A-2 GitHub G-1 to G-5                | **PASS**. The 08:27 use of the session roles is explained (section 4)                          |
| A-3 permission simulation            | **PASS**. All 30 allow checks were allowed; all 27 guardrail checks were denied. See F-3       |
| A-4 log-filter test                  | **2 findings.** 8 of 9 synthetic secrets matched; 3 of 13 lines were mis-classified (F-1, F-2) |

**Verdict: no blocker found for the session.** F-1 and F-2 are gaps in the session-day log check
(step 19c, C-12), not in AWS. They are for ChatGPT and the owner to rule on before deployment
approval is requested. Every PASS above comes from the raw outputs in `evidence/`.

## 2. AWS calls made

177 successful calls, all read-only or simulation. The per-file call list is in each evidence
file under `result.api_calls`.

| Service        | Operations                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sts            | `GetCallerIdentity` (3)                                                                                                                                                                                                                       |
| rds            | `DescribeDBInstances` (2)                                                                                                                                                                                                                     |
| ecs            | `DescribeClusters`, `ListServices`, `ListTasks`, `ListTaskDefinitionFamilies`, `ListTaskDefinitions` (4), `DescribeTaskDefinition` (4)                                                                                                        |
| secretsmanager | `DescribeSecret` (2), `ListSecretVersionIds` (2), `ListSecrets`                                                                                                                                                                               |
| kms            | `DescribeKey` (3)                                                                                                                                                                                                                             |
| ec2            | `DescribeVpcs`, `DescribeSubnets`, `DescribeRouteTables`, `DescribeVpcEndpoints`, `DescribeSecurityGroups`, `DescribeInternetGateways` (each 2); `DescribeNatGateways`, `DescribeAddresses`, `DescribeInstances`, `DescribeNetworkInterfaces` |
| elbv2          | `DescribeLoadBalancers`, `DescribeTargetGroups`                                                                                                                                                                                               |
| scheduler      | `ListSchedules`, `GetSchedule`                                                                                                                                                                                                                |
| acm            | `ListCertificates`, `DescribeCertificate`                                                                                                                                                                                                     |
| ecr            | `DescribeImages` (2)                                                                                                                                                                                                                          |
| iam            | `ListRoles` (2), `GetRole` (6), `ListRolePolicies` (4), `ListAttachedRolePolicies` (4), `GetRolePolicy` (4), `GetPolicy` (4), `GetPolicyVersion` (4), `SimulatePrincipalPolicy` (35)                                                          |
| cloudtrail     | `LookupEvents` (64)                                                                                                                                                                                                                           |
| logs           | `TestMetricFilter` (1)                                                                                                                                                                                                                        |

Three more attempts were rejected or failed, and none of them reached anything outside the list
above:

- one was refused by the sandbox's code check (`__name__` is blocked), before any AWS call;
- one was refused for using more than 10 services in one script, before any AWS call;
- one timed out after 60 s while it was still paging CloudTrail `LookupEvents`.

No `GetSecretValue`, `BatchGetSecretValue` or Secrets Manager Agent call was made. The words
appear in the evidence only as text inside policies and as simulated action names.

## 3. A-0 and A-1: account readiness (C-1)

Raw files:

- `evidence/a0-caller-and-logging.json`
- `evidence/p01-p10-part1.json`
- `evidence/p11-p13-part2-raw.json`
- `evidence/p11b-p13-refetch.json`
- `evidence/p11b-p13-files/`
- `evidence/p11b-p13-verify-output.txt`

**A-0.** For every call, the connector's record of calls returned to Claude shows only the
service, the operation, the status and the item count. The test call used a non-secret
parameter, `DBInstanceIdentifier=munaxa-nonprod-pg`, and the parameter did not appear in that
record. What a script returns does reach Claude in full. So the C-8 secret script must return
only the secret's name, ARN and version count, as part 5 of the plan says.

L-A0 (limit): the plan's A-0 called for a `GetRandomPassword` throwaway test. This run used the
non-secret parameter above instead. Neither test can show the connector's own server-side audit
log, because Claude cannot read it.

| Check | Result (raw lines in `p01-p10-part1.json`)                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1   | Account `229251310592`, caller root, region `eu-central-1`                                                                                                                                                                                                                                                          |
| P-2   | `munaxa-nonprod-pg`: stopped, `db.t4g.micro`, not public, deletion protection on, single AZ, encrypted, parameter group `munaxa-nonprod-pg16` in sync, master secret active, `vpc-0824ebbff902d2980`, PostgreSQL 16.13                                                                                              |
| P-3   | Cluster ACTIVE with 0 services and 0 tasks. Four families, each with only revision `:1`. Digests: identity `71d01fdf` with Valkey `757b7e55`; migrate `d175ef37`; bootstrap `71d01fdf`; db-admin `5983db9a`                                                                                                         |
| P-4   | identity has 6 references, all pinned to `ad02f18e…`. migrate `DATABASE_MIGRATION_URL` and bootstrap `DIRECT_DATABASE_URL` are both pinned to `a3cc6622…`. The bootstrap owner email and password references are present. db-admin has the master secret username and password and both pins                        |
| P-5   | Data key `45eda044…` is enabled and used for encryption. Both secrets are encrypted with it, neither is deleted, and both pinned versions are `AWSCURRENT` (metadata only)                                                                                                                                          |
| P-6   | 0 secrets named `munaxa-nonprod/identity-bootstrap`                                                                                                                                                                                                                                                                 |
| P-7   | 0 services, 0 tasks, 0 load balancers, 0 target groups, 0 NAT gateways, 0 Elastic IPs, 0 instances, 0 public ENIs                                                                                                                                                                                                   |
| P-8   | Backstop: 11 of 11 schedules enabled. Database stop at `cron(0 21 * * ? *)` UTC, target `rds:stopDBInstance`, input `munaxa-nonprod-pg`                                                                                                                                                                             |
| P-9   | 1 certificate for `*.test.munaxa.com`: ISSUED, SANs `*.test.munaxa.com` and `operator-test.munaxa.com`, not in use, NotAfter 2027-05-22                                                                                                                                                                             |
| P-10  | `munaxa-identity/api@71d01fdf` and `munaxa-identity/migrate@d175ef37` are both tagged `5277d71`                                                                                                                                                                                                                     |
| P-11  | `AWSServiceRoleForECS` and `AWSServiceRoleForElasticLoadBalancing` exist                                                                                                                                                                                                                                            |
| P-11b | **20/20 PASS.** Both session roles match the offline Terraform render on every point: path, ARN, max session 3600, no boundary, trust policy, inline and attached policy sets, all 30 statements of `session-deployer`, both managed policies, and the state key behind `alias/munaxa-shared-tfstate` (`679d1b6b…`) |
| P-13  | **PASS** on every line: VPC `10.130.0.0/16`; 5 subnets with no public IP on launch; IGW `igw-01c51c4963afa87fb` attached; S3 gateway endpoint on the public route table only; route tables and associations exact; exactly 6 security groups; the default group has no rules                                        |

**How P-11b and P-13 were verified.** The script's `VERIFY` program and `SESSION_SPEC` were
extracted byte-for-byte from `preflight-readonly.sh` on `main`:

- `VERIFY` has SHA256 `496c54a9…`; a copy is in `supporting/verify-extracted.py`;
- `SESSION_SPEC` is in `supporting/session-spec-extracted.json`.

Both were run locally with `python3 -I`, against JSON files written from one re-fetch at
09:24:10 UTC. Those files use the same names and shapes as the script's fetches. Exit code 0 for
both, and the full output is in `p11b-p13-verify-output.txt`.

One difference from a CloudShell run: the files come from boto3, not the AWS CLI's `--query`
output. Dates are ISO strings, and the policy documents are already URL-decoded objects, which is
what the CLI also gives.

### P-12 CloudTrail denials

Window: 10 Nov 06:00:00 to 11 Nov 09:20:00 UTC. Every page was read, with no truncation, in
50-event pages. The match rule is the same as `DENIAL_FILTER`: the `errorCode` field matches
`AccessDenied|UnauthorizedOperation$`.

Raw files:

- `p12-eu-central-1-main.json`
- `p12-eu-central-1-tail.json`
- `p12-us-east-1.json`
- `p12-probe-6h-window.json`, the first attempt, which hit the 1000-item cap and is not used for
  the count.

| Region       | Events                                                 | Denials |
| ------------ | ------------------------------------------------------ | ------- |
| eu-central-1 | 2,452 (2,450 + 2 after resume; oldest 10 Nov 06:05:14) | 12      |
| us-east-1    | 635 (10 Nov 06:04:51 to 11 Nov 09:20:00)               | 0       |

The 12 denials are 6 runs with 2 each, one denial per bucket:

| Run                                               | Role                                     | Time (UTC)         | GitHub conclusion |
| ------------------------------------------------- | ---------------------------------------- | ------------------ | ----------------- |
| 42766116306 (A1 plan)                             | `munaxa-shared-deployer-nonprod`         | 10 Nov 06:05:36    | success           |
| 42766582624 (A1 apply)                            | same                                     | 10 Nov 06:09:44    | success           |
| 42766964719 (post-apply plan)                     | same                                     | 10 Nov 06:13:15-16 | success           |
| 42785877006 (scheduled down)                      | `munaxa-shared-deployer-nonprod-session` | 10 Nov 08:51:47    | success           |
| 42928482147 (scheduled down)                      | same                                     | 11 Nov 00:05:23    | success           |
| **42987103535 (scheduled down, new since 07:01)** | same                                     | 11 Nov 08:27:29    | success           |

Each of the 12 denials was checked against the accepted signature:

- S-1: `s3.amazonaws.com` `ListTagsForResource` with `AccessDenied`;
- S-2: region `eu-central-1`;
- S-3: one of the two deployer roles, with session `gha-run-<run id>` and source identity
  `github-actions`;
- S-4: bucket `munaxa-nonprod-school-files-229251310592` or
  `munaxa-nonprod-docs-files-229251310592`;
- S-5: the message says "no identity-based policy allows", which is an implicit deny;
- S-6: user agent `terraform-provider-aws/6.67.0`;
- S-7: a successful `GetBucketTagging` by the same principal on the same bucket in the same
  second, which was found for all 12;
- S-8: every run concluded `success`.

**All 12 match, so P-12 is EXPECTED.** The 07:01 owner run counted 10. The two new events
belong to run 42987103535 (section 4).

## 4. A-2: GitHub checks (C-2)

| Check                         | Result                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- |
| G-1 `main` head               | `49c51f3` (PR #86)                                                          |
| G-2 no run waiting            | 0 runs `waiting`, 0 `in_progress` (09:27 UTC)                               |
| G-3 latest session run        | 42987103535, `schedule`, `down`, success                                    |
| G-4 no `infra/` PR open       | Only #87 is open, and it is docs only                                       |
| G-5 latest AWS Terraform runs | All from PRs and all successful. The last dispatch was 10 Nov (42766964719) |

**What used the session roles at 08:27 UTC.** `RoleLastUsed` showed
`munaxa-shared-ci-nonprod-session` at 08:27:36 and `munaxa-shared-deployer-nonprod-session` at
08:27:44.

That was run 42987103535 of `aws-session.yml`:

- event `schedule`, at `main` `55b5449`;
- created 08:26:53 and ended 08:27:47;
- conclusion success.

It is the `47 1 * * *` backstop cron, which GitHub started about 6 h 40 min late. The workflow
header records 3 to 6 hour delays. It is a `down` run, and the database was still stopped
afterwards (P-2). Nobody dispatched it.

## 5. A-3: permission simulation (C-3)

Raw files:

- `evidence/a3-simulation.json`, 30 cases (48 action checks) at 09:25:32;
- `evidence/a3-simulation-elb-resource-types.json`, 5 cases (9 action checks) at 09:25:50.

The simulation used `iam:SimulatePrincipalPolicy` on
`role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session`.

The context was:

- `aws:RequestedRegion=eu-central-1`;
- `aws:RequestTag/Project=munaxa` and `Environment=nonprod` on creates;
- `aws:ResourceTag/*` with the same values on updates and deletes;
- `iam:PassedToService` where it applies.

Resource ARNs use the real names with placeholder ids, for example `0123456789abcdef`.

**Allowed, as `up` and `down` need: 30 of 30 action checks.**

- elasticloadbalancing:
  - `CreateLoadBalancer`, `AddTags`, `ModifyLoadBalancerAttributes` and `DeleteLoadBalancer` on
    `loadbalancer/app/munaxa-nonprod/*`;
  - `CreateListener` on the load balancer;
  - `CreateRule`, `ModifyListener` and `DeleteListener` on the listener;
  - `ModifyRule` and `DeleteRule` on the listener rule;
  - `CreateTargetGroup`, `ModifyTargetGroupAttributes`, `DeleteTargetGroup` and
    `RegisterTargets` on `targetgroup/munaxa-nonprod-identity/*`.
- ecs: `CreateService`, `UpdateService`, `DeleteService` and `TagResource` on
  `service/munaxa-nonprod/identity`.
- servicediscovery: `CreateService`.
- iam: `PassRole` of `munaxa-nonprod-identity-execution` to `ecs-tasks.amazonaws.com`.
- rds: `StartDBInstance` and `StopDBInstance` on `munaxa-nonprod-pg`.
- State: `s3:GetObject` and `PutObject` on `nonprod/terraform.tfstate`, and `kms:Decrypt` and
  `GenerateDataKey` on the state key.
- Reads: `ecs:DescribeServices`, `elbv2:DescribeLoadBalancers`, `rds:DescribeDBInstances` and
  `ec2:DescribeSubnets`, allowed by `munaxa-shared-deployer-read`.

**Denied, as the guardrails intend: 27 of 27 action checks.**

- Secrets: `GetSecretValue` and `PutSecretValue` on `munaxa-nonprod/*` (explicit).
- Security groups: `Authorize*` and `CreateSecurityGroup` (explicit).
- ALB tags: create with `Project=other` or `Environment=prod` (explicit).
- A `munaxa-prod` service: denied (implicit).
- `munaxa-docs-pg`: start and delete (explicit).
- IAM writes: `CreateUser` and `CreateAccessKey` (implicit); `PutRolePolicy` and
  `AttachRolePolicy` on the bootstrap role (explicit).
- `PassRole` of a bootstrap role (explicit).
- `prod/` state (explicit).
- Any create in `us-east-1` (explicit).
- `route53:ChangeResourceRecordSets` (implicit).
- `ModifyDBInstance` and `DeleteDBInstance` on the nonprod database (implicit).
- `ecs:RunTask` (implicit).
- `kms:Sign` and `ScheduleKeyDeletion` on the state key (explicit).
- `cloudtrail:StopLogging` and `DeleteTrail` (explicit).

**Correction inside this run.** Five cases in the first batch returned `implicitDeny`:

- `CreateListener`, `CreateRule`, `ModifyListener` and `DeleteListener`;
- `ModifyTargetGroupAttributes`.

They had been given the wrong resource type. `CreateListener` is authorized on the load balancer,
`CreateRule` on the listener, and `ModifyTargetGroupAttributes` on the target group. The second
batch repeated them with the right resource types, and all were allowed. Both batches are kept.
The 30 allowed checks are the 21 correctly typed ones from the first batch plus the 9 in the second.

**F-3 (information).** The session deployer cannot `ecs:RunTask`. This matches the plan: the
one-off tasks (B-4, B-5, B-7, B-9) run as root through the connector (plan part 3, U-5), not
under the session role.

Limits of the simulation:

- It evaluates identity-based policies only. Resource policies are not included, such as the KMS
  key policies, bucket policies and the Secrets Manager resource policy.
- SCPs do not apply to this management account.
- Neither session role has a permission boundary (P-11b).
- It does not prove that the live API calls succeed. That is what the session run shows.

## 6. A-4: log-filter test (C-4)

Raw file: `evidence/a4-test-metric-filter.json`.

The test ran `logs:TestMetricFilter` with the checklist's pattern (step 19c, line 438) against 19
synthetic lines. No log data was read. The pattern, as CloudWatch receives it, is
`?eyJ ?BEGIN ?PRIVATE ?"password\":\""`.

The fake JWT is `eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3QifQ.eyJzdWIiOiJGQUtFIn0.ZmFrZXNpZw`. It
decodes to `{"alg":"ES256","kid":"test"}.{"sub":"FAKE"}`, and its signature is the word
`fakesig`.

| #   | Line (kind)                                                           | Matched | As intended  |
| --- | --------------------------------------------------------------------- | ------- | ------------ |
| 1   | JWT in a JSON field (secret)                                          | yes     | yes          |
| 2   | `authorization: Bearer <JWT>` (secret)                                | yes     | yes          |
| 3   | bare JWT (secret)                                                     | yes     | yes          |
| 4   | `-----BEGIN PRIVATE KEY-----` (secret)                                | yes     | yes          |
| 5   | `-----BEGIN EC PRIVATE KEY-----` (secret)                             | yes     | yes          |
| 6   | `-----BEGIN RSA PRIVATE KEY-----` (secret)                            | yes     | yes          |
| 7   | `"password":"FAKE-not-a-password"`, compact JSON (secret)             | yes     | yes          |
| 8   | `"password": "FAKE-not-a-password"`, a space after the colon (secret) | **no**  | **no (F-1)** |
| 9   | JWT in a URL query (secret)                                           | yes     | yes          |
| 10  | request log, POST `/auth/login` 200 (clean)                           | no      | yes          |
| 11  | startup line (clean)                                                  | no      | yes          |
| 12  | `/health` 200 (clean)                                                 | no      | yes          |
| 13  | `"password":"[REDACTED]"` (clean)                                     | **yes** | **no (F-2)** |
| 14  | `passwordHash column migrated` (clean)                                | no      | yes          |
| 15  | `All migrations have been successfully applied.` (clean)              | no      | yes          |
| 16  | lower-case `begin` / `private` (clean)                                | no      | yes          |
| 17  | `-----BEGIN PUBLIC KEY-----` (clean)                                  | **yes** | **no (F-2)** |
| 18  | `eyeJ`, `eyj` (clean)                                                 | no      | yes          |
| 19  | 401 Unauthorized line (clean)                                         | no      | yes          |

**F-1 (low, a missed secret).** A password field written with a space after the colon is not
matched.

Identity's own logs are written by pino, which emits compact JSON with no spaces
(`apps/api/src/observability/logger.ts` at `5277d71`). So Identity's own lines are matched. Lines
from other writers are not covered if they put a space there, such as the Valkey sidecar, a Node
crash dump, or the bootstrap CLI. The plan's stop rule for A-4 says "the pattern misses a
synthetic secret", so this is formally a stop condition.

**F-2 (low, a false stop).** A password field that has already been redacted, and a public-key
PEM header, are both matched. The error is in the safe direction: the session-day count (C-12)
would be above 0, and the run would stop when nothing leaked.

Identity's logger censors `password`, `*.password` and `req.body.password` to the lower-case
`[redacted]` (`logger.ts:18-40`). Any redacted line that keeps the key would therefore count. No
code at `5277d71` was found that logs a PEM public key.

Ruling on F-1 and F-2 is for ChatGPT and the owner. No change was made.

## 7. Limits of this evidence

- **L-A0.** The connector's server-side audit log cannot be inspected (section 3).
- **L-sim.** The simulation covers identity-based policies only (section 5).
- **L-time.** Every result is a point-in-time reading from 09:14 to 09:27 UTC on 11 Nov. The
  session-day check (C-1) repeats it.
- **L-1, the 07:01 raw file.** This report puts fresh raw evidence for P-1 to P-13 in the
  repository. Whether that closes L-1 in place of the owner's 07:01 file is the owner's call
  (plan, phase A note).
- **Not covered by Phase 1:**
  - the in-AWS probe (phase P);
  - the session itself;
  - MFA and password reset, which are not implemented in Identity `5277d71`.

## 8. Files

| File                                                                       | Content                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `evidence/a0-caller-and-logging.json`                                      | A-0 script and result                                             |
| `evidence/p01-p10-part1.json`                                              | P-1 to P-10 script and the PASS lines                             |
| `evidence/p11-p13-part2-raw.json`                                          | P-11 and the first raw P-11b/P-13 fetch                           |
| `evidence/p11b-p13-refetch.json`                                           | The 09:24:10 re-fetch that the verifier used                      |
| `evidence/p11b-p13-files/`                                                 | The 19 input files, plus `_fetch-meta.json`                       |
| `evidence/p11b-p13-verify-output.txt`                                      | Verifier output, exit 0 and exit 0                                |
| `evidence/p12-*.json`                                                      | CloudTrail paging, the denials and the `GetBucketTagging` matches |
| `evidence/a3-simulation*.json`                                             | Both simulation batches                                           |
| `evidence/a4-test-metric-filter.json`                                      | Filter test, the 19 lines and the matches                         |
| `supporting/verify-extracted.py`, `supporting/session-spec-extracted.json` | The extracted verifier and spec                                   |

Each evidence file holds:

- the exact script sent to the connector;
- the time it was called;
- the connector's response.

Pagination warnings and resume tokens were removed, because they are not evidence and are long.
