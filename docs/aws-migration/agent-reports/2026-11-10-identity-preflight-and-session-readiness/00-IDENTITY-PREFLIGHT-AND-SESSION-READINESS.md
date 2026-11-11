# Identity first session: review, corrected helpers and owner preflight

- Date: 10 Nov 2026, 07:09 to about 08:10 UTC
- Repository: `munaxa/munaxa-platform`, `main` at `3c836a2` (PR #75 merged by the owner at 07:08
  UTC). Environment `nonprod`, account `229251310592`, region `eu-central-1`.
- Update 08:25 to 08:50 UTC (owner request): `supporting/preflight-readonly.sh` reviewed and
  hardened: account guard, ERROR versus ABSENT versus FAIL, read-only allowlist, 24 offline tests
  (section 11). PR #76 was merged by the owner at 08:13 UTC; the hardening is a new PR, not merged.
- Reviews: [`2026-11-10-identity-first-session-preparation/00-IDENTITY-FIRST-SESSION-PREPARATION.md`](../2026-11-10-identity-first-session-preparation/00-IDENTITY-FIRST-SESSION-PREPARATION.md)
  (called "the preparation report" below).
- Labels:
  - **[V-gh]** GitHub evidence read today;
  - **[V-src]** source on `main`;
  - **[V-test]** local test run in this task;
  - **[O]** owner action;
  - **[NR]** not run.

## 1. Executive verdict

**PARTIALLY READY — OWNER ACTIONS REQUIRED.**

The repository side is ready:

- The procedure, task definitions, workflows and helpers on `main` support the first Identity
  session. The two helper defects found in review are fixed and tested in this PR.
- GitHub preflight: G-1, G-2, G-3 and G-5 PASS. G-4 is BLOCKED here (settings not readable).

The AWS side is not established:

- **The AWS preflight P-1 to P-13 has not run.** At 07:47 to 07:50 UTC the reconnected connector's
  read-only tool failed on every call, even a script that makes no AWS call ("internal error"), so
  no AWS read succeeded.
- At 07:52 UTC the owner withdrew connector reads unless separately authorized. The preflight is
  therefore prepared for the owner to run in CloudShell (section 5).
- Until its output is reviewed, nothing about the current AWS state is claimed. That includes the
  service-linked roles (F-3).

**Next approval required:**

1. The owner runs the preflight (section 5) and the G-4 UI check, and posts the output.
2. Claude reviews it against the expected values.
3. Only then can the verdict become READY FOR OWNER APPROVAL, followed by a separate session
   approval.

## 2. PR #75 and CI status

| Item                         | State                                                                                                                                                                                                                                                                                                             | Label   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| PR #75                       | **Merged** by the owner at 07:08 UTC as `3c836a2`, so it can no longer be updated. Corrections to its report are made in place in its folder by this PR, with a dated correction note at the top of that report. The original text stays at `3c836a2`                                                             | [V-gh]  |
| CI on the #75 head `19f3474` | `CI` run 42771575500 success: "Accessibility · contrast and keyboard, every story, four brands, light and dark" success (matrix step 06:54 to 07:06); "Lint · Typecheck · Test · Build" success, including format check; "Façades match the platform surface" success. `AWS Terraform` PR run 42771575409 success | [V-gh]  |
| CI on `main` `3c836a2`       | `CI` push run 42773169658 success (07:08 to 07:18)                                                                                                                                                                                                                                                                | [V-gh]  |
| Newer reports                | None after `2026-11-10-identity-first-session-preparation`                                                                                                                                                                                                                                                        | [V-gh]  |
| Config A1 unchanged          | `git diff 67904bc 3c836a2 -- infra .github scripts` is empty. Every commit after the A1 inputs is docs only                                                                                                                                                                                                       | [V-src] |
| This PR                      | Docs and supporting code only; CI result in the PR                                                                                                                                                                                                                                                                | —       |

## 3. Review of the preparation report

### 3.1 Findings F-1 to F-10, re-checked

| #                                                          | Re-check                                                                                                                                                                                                                                                                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 Identity's database dependency at first start          | Identity `main.ts` runs `void bootstrap()`. `PrismaService.onModuleInit` calls `$connect()`. Readiness requires `select 1`, the 8 tables, the cache and signing. AWS documents that the circuit breaker stops launching tasks for a first deployment with no `COMPLETED` deployment, with a threshold of at least 3                                                                      | **Confirmed** [V-src]. Distinguishable: secret, pull and Valkey failures stop the task before Identity starts (`ResourceInitializationError`, `CannotPullContainerError`, dependency not HEALTHY); configuration errors are listed by Identity's environment validation before any connection; only a database error comes after it |
| F-2 service `identity` vs family `munaxa-nonprod-identity` | `modules/service` `aws_ecs_service.name = var.name`; the backstop schedule input uses `Service = "identity"`                                                                                                                                                                                                                                                                             | **Confirmed** [V-src]                                                                                                                                                                                                                                                                                                               |
| F-3 service-linked roles                                   | The session deployer's policy has no `iam:CreateServiceLinkedRole`; only the main deployer's `-allow` policy has it (`iam_allow.tf` Sid `ServiceLinkedRoles`)                                                                                                                                                                                                                            | **Confirmed in code**; whether the roles exist: **not verified** (P-11, owner)                                                                                                                                                                                                                                                      |
| F-4 ALB DNS not printed                                    | `aws-session.yml` writes apply stdout to a file it deletes                                                                                                                                                                                                                                                                                                                               | **Confirmed** [V-src]                                                                                                                                                                                                                                                                                                               |
| F-5 green run is not a stable service                      | No `wait_for_steady_state` in `modules/service`                                                                                                                                                                                                                                                                                                                                          | **Confirmed** [V-src]                                                                                                                                                                                                                                                                                                               |
| F-7 untested session create path                           | 17 session runs, all `down`; the session deployer allows `elasticloadbalancing:*`, `ecs:CreateService`, `ecs:UpdateService`, `ecs:DeleteService` and tags on `munaxa-nonprod` names, and `rds:StartDBInstance`/`StopDBInstance` on `munaxa-nonprod-pg`. Its read policy includes `acm:DescribeCertificate` and `acm:GetCertificate` (used when the HTTPS listener names the certificate) | **Confirmed**; still unexercised until the first `up`. P-11b lists the live session roles and statement ids for comparison with code                                                                                                                                                                                                |
| F-8 bootstrap secret partial ARN                           | Name suffix `bootstrap` (9 characters) cannot be mistaken for the 6-character ARN suffix; IAM resource `identity-bootstrap-??????`                                                                                                                                                                                                                                                       | **Confirmed**; residual risk stays, stop on `ResourceInitializationError`                                                                                                                                                                                                                                                           |
| F-9 bootstrap secret lifetime                              | All three bootstrap runs inject it; delete after step 15, before `down` in any case                                                                                                                                                                                                                                                                                                      | **Confirmed** [V-src]                                                                                                                                                                                                                                                                                                               |
| F-10 time limits                                           | Scheduled `down` at 19:17 and 01:47 UTC (often late), backstop at 21:00 UTC, concurrency group `aws-terraform-nonprod`                                                                                                                                                                                                                                                                   | **Confirmed** [V-src]. Session by 18:30 UTC, 2 h planned, 3 h hard stop, unchanged                                                                                                                                                                                                                                                  |

### 3.2 Errors found and corrected (this PR)

**E-1: the JWT helper checked neither the audience nor the expiry.**
`supporting/verify-identity-jwt.mjs` checked only alg, kid, issuer and signature. Its corrected
version checks the following, each derived from configuration on `main`, not chosen here:

| Claim       | Expected                                                                                  | Source                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alg`       | `ES256`                                                                                   | `services.tf` `IDENTITY_SIGNING_ALGORITHM`                                                                                                                                                                                                                                                                                                       |
| `kid`       | `identity-nonprod-2026-11`                                                                | `envs/nonprod.tfvars` `identity_signing_kid`                                                                                                                                                                                                                                                                                                     |
| `iss`       | `https://id.test.munaxa.com`                                                              | `IDENTITY_BASE_URL = local.https.identity`                                                                                                                                                                                                                                                                                                       |
| `aud`       | exactly `munaxa-work` and `munaxa-control`, as an array, any order, no extra or duplicate | `services.tf` `IDENTITY_AUTH_AUDIENCE = "munaxa-work,munaxa-control"`. Identity's config maps it to `MUNAXA_TOKEN_AUDIENCE` (`packages/config/src/environment.ts`). `@munaxa/config` `list()` splits on `,`. `@munaxa/auth` 2.4.1 `TokenService.issueAccessToken` writes `aud: this.#audience` (platform `packages/platform/auth/src/tokens.ts`) |
| `exp`       | in the future                                                                             | —                                                                                                                                                                                                                                                                                                                                                |
| `iat`       | not more than 30 s in the future                                                          | `TokenService` default skew                                                                                                                                                                                                                                                                                                                      |
| `exp - iat` | exactly 900 s                                                                             | `MUNAXA_ACCESS_TOKEN_TTL` default `900_000` ms (`platform-schema.ts`). The task definition sets no `ACCESS_TOKEN_TTL`, and Identity's `auth.service.ts` passes no per-token `ttl`                                                                                                                                                                |

The helper still prints no token, subject or tenant. sha256 is now
`bf5e88f2a933439fe8ced20269f26934cbeaa7a614b46637f6101020e63db9cf` (was `9aec8246…ff52`).

**E-2: the CloudTrail denial check (P-12, step 23) was unreliable.** The original command was
`lookup-events --max-results 50 --query 'Events[].CloudTrailEvent' --output text | grep -c -E '"errorCode":"(AccessDenied|.*UnauthorizedOperation)'`.
Reproduced locally [V-test], it has four defects:

- **Undercount.** `--output text` prints the whole list on one line, separated by tabs, and
  `grep -c` counts lines. Two denials in one page counted as `1`.
- **False positive.** `.*` can run past the error code. An event with `errorCode`
  `ThrottlingException` and an `errorMessage` containing `UnauthorizedOperation` counted as a
  denial.
- **Missed match.** `"errorCode": "AccessDenied"` (with a space) is not matched.
- **Truncation.** `--max-results 50` stops the CLI after 50 events. A window like 8 to 9 Nov had 326
  write events.

Replacement: `supporting/cloudtrail-denials.py` (sha256
`ed3711dabcfd29d2514ea75a56637913a02164afaf4b33516e81a07daf7f12f8`).

- It reads the full `lookup-events --output json` (no `--max-results`, so every page).
- It parses each event and tests only the `errorCode` field: contains `AccessDenied`, or ends in
  `UnauthorizedOperation`.
- It prints time, source, action, code and principal ARN for each denial, and never the request or
  response.
- Exit codes: 0 for no denial, 1 for any denial, 2 for bad input.
- It runs for `eu-central-1` and `us-east-1`, because IAM and STS events are recorded in
  `us-east-1`.

### 3.3 Corrected commands

```bash
# P-12 (preflight) and step 23 (after the session); script in the same folder
for r in eu-central-1 us-east-1; do
  aws cloudtrail lookup-events --region $r --start-time 2026-11-10T06:00:00Z --output json \
    | python3 -I cloudtrail-denials.py
done
# Expected per region: "events N denials 0"

# Step 19, token check (unchanged invocation; corrected script)
node verify-identity-jwt.mjs      # TOKEN from the cookie jar, as in the preparation report
# Expected: one "ok" line per check, then PASS (exit 0)
```

The preparation report's P-12, step 19 (expected output, sha256, stop conditions), step 23 and
section 11 are updated accordingly.

### 3.4 Test results [V-test]

| Suite                                   | Command                                                                      | Result                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| JWT helper                              | `node --test verify-identity-jwt.test.mjs` (Node 22.23)                      | **26 / 26 pass**                                             |
| CloudTrail filter                       | `python3 -I cloudtrail_denials_test.py -v` (Python 3.13)                     | **7 / 7 pass**                                               |
| Preflight script syntax and P-12 wiring | `bash -n`; run against a stub `aws` returning one denial and one clean event | Syntax OK; P-12 printed `events 2 denials 1` for each region |

JWT helper cases (26):

- passes: a valid token; the audience in reverse order;
- signature failures: another key's signature; the same token against the committed key (no false
  PASS); a tampered payload;
- claim failures: wrong kid; issuer with a trailing slash;
- audience failures: missing, a comma-string, only `munaxa-work`, an extra entry, a duplicate;
- time failures: expired; `exp` equal to now; `iat` in the future; a 3600 s lifetime; `exp`
  missing;
- algorithm failures: `alg` `none` and HS256;
- malformed tokens: six of them, none throws;
- CLI: exit codes 0, 1 and 2, and no subject or tenant in the output;
- the committed key loads as P-256.

CloudTrail filter cases (7):

- matches: `AccessDenied`, `AccessDeniedException`, `UnauthorizedOperation`,
  `Client.UnauthorizedOperation`;
- non-matches: no error, `ThrottlingException`, `InvalidDBInstanceStateFault`,
  `ServiceNotFoundException`, `ResourceNotFoundException`, `ValidationException`,
  `UnauthorizedOperationRetry`;
- the words appearing in `errorMessage`, `requestParameters` or `responseElements` do not match;
- pretty-printed event JSON;
- a mixed batch is counted correctly;
- an empty input;
- CLI exit codes 0, 1 and 2.

## 4. GitHub preflight G-1 to G-5

| #   | Source inspected                                                                                  | Result                                                                                                                                                                                                                         | Status                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G-1 | `git log origin/main`; `git diff 67904bc origin/main -- infra .github scripts`                    | `main` = `3c836a2` (#75, docs only); no change under `infra/`, `.github/`, `scripts/` since the A1 inputs `67904bc`                                                                                                            | **PASS**                                                                                                                                                                                                                                   |
| G-2 | Actions run list, `aws-terraform.yml`                                                             | Latest runs all `completed`: 42767325480 and 42771575409 (PR checks), 42766964719, 42766582624, 42766116306 (owner dispatches). None waiting or in progress                                                                    | **PASS** (re-check on the session day)                                                                                                                                                                                                     |
| G-3 | Actions run list, `aws-session.yml`                                                               | Latest scheduled run 42741362297, 10 Nov 02:14 UTC, success, on `6496a80` (before the A1 inputs). The first scheduled `down` on A1 is tonight's 19:17 run                                                                      | **PASS** for the latest; if the session is on a later day, tonight's run must be green too                                                                                                                                                 |
| G-4 | `GET repos/munaxa/munaxa-platform/environments/aws-nonprod-session/variables` and `/environments` | HTTP 403 "not permitted through this proxy". Indirect evidence: the nightly OIDC and deployer steps succeed (02:14 UTC), so both variables resolve to assumable roles. Rulesets readable: "Protect main" (id 20906222, active) | **BLOCKED** (owner checks in the UI: Settings → Environments → `aws-nonprod-session` → variables `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN` end in `-ci-nonprod-session` and `-deployer-nonprod-session`; no unexpected protection change) |
| G-5 | Open PR list                                                                                      | 0 open PRs before this one. This PR is docs and supporting code only, with no `infra/` change                                                                                                                                  | **PASS**                                                                                                                                                                                                                                   |

## 5. AWS preflight P-1 to P-13: prepared for the owner, not run

### 5.1 What happened

| Time (UTC)     | Event                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07:09          | Connector call refused: "needs you to sign in again"                                                                                                                                                 |
| 07:47          | Owner reconnected                                                                                                                                                                                    |
| 07:47 to 07:50 | Four attempts with the read-only tool returned "An internal error occurred". One attempt contained no AWS call at all, so the failure is in the tool, not a permission. **No AWS request succeeded** |
| 07:52          | Owner instruction: no connector AWS reads unless separately authorized. The scheduled retry was cancelled                                                                                            |

### 5.2 Owner execution (CloudShell, eu-central-1, signed in as root per `infra/aws/ACCESS-POLICY.md`)

> **Superseded (10 Nov, after the owner's 11:22 UTC run).** Use the procedure in
> [`2026-11-10-identity-preflight-results-review/`](../2026-11-10-identity-preflight-results-review/00-IDENTITY-PREFLIGHT-RESULTS-REVIEW.md)
> section 6: one download (the denial filter is now embedded), a root caller is refused unless
> `ALLOW_ROOT_READONLY=yes` is set, and the corrected P-3 and P-4 expectations. The block below is
> kept as the record of what was run.

```bash
mkdir -p ~/identity-preflight && cd ~/identity-preflight
B=https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports
# until the script-hardening PR (section 11) is merged, replace main with claude/project-thread-yi55u0
curl -sSfO $B/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
curl -sSfO $B/2026-11-10-identity-first-session-preparation/supporting/cloudtrail-denials.py
sha256sum preflight-readonly.sh cloudtrail-denials.py
#   deacf85bbc70107b8ce12748c7b2f4efd77f9a89cb755ebc42381f51ab0423d4  preflight-readonly.sh
#   ed3711dabcfd29d2514ea75a56637913a02164afaf4b33516e81a07daf7f12f8  cloudtrail-denials.py
bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
```

Paste the whole output into the thread. The script:

- stops before any other AWS call unless the active account is exactly `229251310592`;
- calls only the read operations in its allowlist (31 at this report; 32 since PR #78 added
  `ecs list-task-definition-families`; 37 since the P-11b/P-13 hardening added `iam get-policy`,
  `iam get-policy-version`, `ec2 describe-vpcs`, `ec2 describe-internet-gateways` and
  `ec2 describe-vpc-endpoints`) (`Describe*`, `List*`, `Get*` metadata,
  `sts get-caller-identity`, `cloudtrail lookup-events`); anything else is refused;
- never calls `get-secret-value`;
- reads no Terraform state, no logs and no application data (since the hardening, more precisely: no CloudWatch Logs; CloudTrail management events for P-12 are downloaded whole and filtered locally to metadata);
- prints PASS, FAIL (including ABSENT, with the AWS error code) or ERROR per line, a summary per
  check, and one `OVERALL:` line: `PASS` (exit 0), `FAIL` (1), `INCOMPLETE` (2: some call failed,
  never a PASS) or `NOT RUN` (3: account not verified). With `| tee` the exit code is hidden, so read
  the `OVERALL:` line.

~~`get-role-policy` prints statement ids and effects only.~~ (Superseded: this was not accurate, the
script printed statement ids only. Since the hardening, P-11b compares every policy document with
the code and prints one PASS line per document, or on a difference the differing Sids, actions or
resources; never condition values. See 2026-11-10-identity-post-merge-preflight-verification/ section 13.)

### 5.3 Checks and what PASS means

| #     | Command group in the script                                                                                                  | PASS when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P-1   | `sts get-caller-identity`                                                                                                    | Account `229251310592`; region `eu-central-1`                                                                                                                                                                                                                                                                                                                                                                                                                                              | NR     |
| P-2   | `rds describe-db-instances munaxa-nonprod-pg`                                                                                | `stopped`, `db.t4g.micro`, not public, deletion protection on, single-AZ, encrypted; parameter group `munaxa-nonprod-pg16` `in-sync`; master secret `active`                                                                                                                                                                                                                                                                                                                               | NR     |
| P-3   | `ecs describe-clusters`, `list-task-definition-families`, `list-task-definitions` per family, `describe-task-definition` × 4 | Cluster `ACTIVE` with 0 tasks and services. Exactly `munaxa-nonprod-db-admin:1`, `-identity:1`, `-identity-bootstrap:1`, `-identity-migrate:1` ACTIVE. Images: Identity and bootstrap `@sha256:71d01fdf…` (bootstrap runs the api image), Valkey `@sha256:757b7e55…`, migrate `@sha256:d175ef37…`, postgres `@sha256:5983db9a…`. **Corrected 10 Nov (results review R-1, R-2)**                                                                                                            | NR     |
| P-4   | secret `valueFrom` of the 4 task definitions                                                                                 | Identity and Valkey `…:secret:munaxa-nonprod/identity-XXXXXX:<KEY>::ad02f18e-f3e7-41da-9959-f9b41e0b7e1a`. Migrate: only `DATABASE_MIGRATION_URL` `…identity-migrate-XXXXXX:DATABASE_MIGRATION_URL::a3cc6622-df66-4787-bae7-83ccfec56ff4`. Bootstrap: `DIRECT_DATABASE_URL` with the same reference (**corrected 10 Nov, results review R-3**). db-admin master-secret ARN plus both pins. Bootstrap `…:secret:munaxa-nonprod/identity-bootstrap:IDENTITY_OWNER_EMAIL::` and `…PASSWORD::` | NR     |
| P-5   | `describe-secret`, `list-secret-version-ids`, `kms describe-key alias/munaxa-nonprod-data`                                   | `ad02f18e…` and `a3cc6622…` each `AWSCURRENT`; both bundles use the data key; not deleted; key `Enabled`, `ENCRYPT_DECRYPT`                                                                                                                                                                                                                                                                                                                                                                | NR     |
| P-6   | `list-secrets` name `munaxa-nonprod/identity-bootstrap`                                                                      | `0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | NR     |
| P-7   | services, tasks, ALBs, target groups, NAT, EIP, EC2, public ENIs                                                             | all `0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | NR     |
| P-8   | `scheduler list-schedules`, `get-schedule …-backstop-database`                                                               | 11 × `ENABLED`; `cron(0 21 * * ? *)` `UTC`; target `aws-sdk:rds:stopDBInstance`, input `munaxa-nonprod-pg`                                                                                                                                                                                                                                                                                                                                                                                 | NR     |
| P-9   | `acm describe-certificate` (`*.test.munaxa.com`)                                                                             | `ISSUED`, not after about 22 May 2027, SANs `*.test.munaxa.com,operator-test.munaxa.com`, `InUseBy` 0                                                                                                                                                                                                                                                                                                                                                                                      | NR     |
| P-10  | `ecr describe-images` by digest × 2                                                                                          | Both found, tags include `5277d71`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | NR     |
| P-11  | `iam get-role AWSServiceRoleForECS`, `AWSServiceRoleForElasticLoadBalancing`                                                 | Both exist. **Missing = blocking** for `up` (the session deployer cannot create them; no IAM change without a separate decision)                                                                                                                                                                                                                                                                                                                                                           | NR     |
| P-11b | session roles: names, policy names, statement ids                                                                            | **Hardened 10 Nov (superseded text below):** both roles' path, ARN, max session 3600, no permissions boundary, trust policy, exact inline and attached policy sets, and every statement (Effect, Action/NotAction, Resource/NotResource, Condition) of `session-deployer` (30), `assume-own-session-deployer-only` (1), `munaxa-shared-deployer-read` (2) and `munaxa-shared-deployer-nonprod-session-read` (4) equal the code; no other `-session` role. Not an effective-permission test. ~~`munaxa-shared-ci-nonprod-session` and `munaxa-shared-deployer-nonprod-session` (max session 3600). Deployer: inline `session-deployer`, attached `deployer_read` and the session-read policy. Statement ids include `SessionEdgeAndServices`, `SessionNeverSecurityGroupRules`, `SessionNeverNetworkPlacement`, `SessionPassOwnRoles`, `SessionDatabaseStartStop`~~ (presence only; `deployer_read` was never checked) | NR     |
| P-12  | `cloudtrail lookup-events` (both regions) through the denial filter (embedded since the results review R-4)                  | `denials 0` in both                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | NR     |
| P-13  | subnets, security groups, public route                                                                                       | **Hardened 10 Nov (superseded text below):** the VPC tagged `munaxa-nonprod` is the database VPC (10.130.0.0/16); exactly 5 subnets (CIDR, AZ, no public IP on launch); exactly 3 route tables (main: local only; `-rt-public`: public-a and public-b, local, `0.0.0.0/0` active to the `-igw` gateway, S3 endpoint route; `-rt-db`: db-a/b/c, local only); `-igw` attached to that VPC; one S3 gateway endpoint on `-rt-public`; exactly the security groups `default`, `-alb`, `-database`, `-db-admin`, `-identity`, `-identity-migrate`. ~~2 public subnets (`-public-a`, `-public-b`, same VPC as RDS); groups `-db-admin`, `-identity-migrate`, `-identity`, `-alb`, `-database` in that VPC; `0.0.0.0/0` route to an `igw-`~~ | NR     |

## 6. Evidence table (identifiers used)

| Resource                    | Identifier                                                                                                                                                                                    | Source  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Repository head             | `munaxa/munaxa-platform` `3c836a2`                                                                                                                                                            | [V-gh]  |
| A1 runs                     | plan 42766116306, apply 42766582624, post-apply 42766964719                                                                                                                                   | [V-gh]  |
| CI                          | 42771575500, 42771575409 (PR #75), 42773169658 (main)                                                                                                                                         | [V-gh]  |
| Latest scheduled session    | 42741362297                                                                                                                                                                                   | [V-gh]  |
| Ruleset                     | "Protect main" 20906222                                                                                                                                                                       | [V-gh]  |
| ECS                         | cluster `munaxa-nonprod`, service `identity` (after `up`), families `munaxa-nonprod-{identity,identity-migrate,identity-bootstrap,db-admin}`                                                  | [V-src] |
| RDS                         | `munaxa-nonprod-pg`                                                                                                                                                                           | [V-src] |
| ALB, target group (session) | `munaxa-nonprod`, `munaxa-nonprod-identity`                                                                                                                                                   | [V-src] |
| Secrets                     | `munaxa-nonprod/identity` @ `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a`; `munaxa-nonprod/identity-migrate` @ `a3cc6622-df66-4787-bae7-83ccfec56ff4`; temporary `munaxa-nonprod/identity-bootstrap` | [V-src] |
| KMS                         | `alias/munaxa-nonprod-data`                                                                                                                                                                   | [V-src] |
| Schedules                   | `munaxa-nonprod-backstop-*` (11)                                                                                                                                                              | [V-src] |
| Session roles               | `munaxa-shared-ci-nonprod-session`, `munaxa-shared-deployer-nonprod-session`                                                                                                                  | [V-src] |
| Hosts                       | `id.test.munaxa.com`, `operator-test.munaxa.com`                                                                                                                                              | [V-src] |

## 7. Readiness questions

| #   | Question                                                                     | Answer now                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Do the ECS and ELB service-linked roles exist?                               | **Unknown** until P-11. Likely (the account ran ECS and an ALB for the old Docs stack), but not claimed                                                                                                                                                        |
| 2   | Can the session deployer run `up` without more IAM permissions?              | **By code, yes**, provided both service-linked roles exist. Not exercised; P-11b compares the live policy documents with code (not an effective-permission test); any `AccessDenied` at step 8 stops the session                                                                                             |
| 3   | Is the expected first-start database failure understood and distinguishable? | **Yes** (F-1, section 3.1)                                                                                                                                                                                                                                     |
| 4   | Are database setup, migration and bootstrap executable?                      | **By code, yes** (preparation report steps 10 to 15). Secret version ids and bundle contents are proven only when the tasks run; P-4 and P-5 check the references and versions beforehand                                                                      |
| 5   | Can the bootstrap secret be created and deleted safely?                      | **Yes**: data key, exact name, delete with `--force-delete-without-recovery` after step 15, verify count `0`; P-6 confirms there is no leftover today                                                                                                          |
| 6   | Are ALB, DNS and certificate steps documented correctly?                     | **Yes**, with F-4: the ALB DNS name is read in CloudShell; Cloudflare CNAME `id.test`, DNS only. Rollback: delete the `id.test` record (or leave it; it points at nothing after `down`, and the next session updates it). ACM check P-9 before, step 21 during |
| 7   | Is shutdown safe and verifiable?                                             | **Yes**: `down`, its separate database job, the step 23 checks (with the corrected P-12 filter), the scheduled `down` and the 21:00 UTC backstop as fallback. P-8 confirms the backstop before the session                                                     |

## 8. Blocking findings and owner actions

There are no blocking findings in the repository. The verdict waits on these:

| #   | Owner action                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Run section 5.2 in CloudShell and paste the output (or separately authorize Claude to run the same reads through the connector once its tool works) |
| O-2 | G-4 in the GitHub UI (section 4)                                                                                                                    |
| O-3 | PR #76 merged by the owner at 08:13 UTC. Review and merge the script-hardening PR (section 11; Claude does not merge)                               |
| O-4 | After a clean preflight: the separate session approval (preparation report section 3.3 window; finish by 18:30 UTC)                                 |

**Updated session execution checklist:** not issued. The preflight has not established readiness.
The preparation report sections 3 to 8, with the corrections in this PR, stay the execution
procedure. Claude re-issues it as a final owner checklist once the preflight output is reviewed.

## 9. Not performed

- No AWS read succeeded, and there was no AWS write of any kind. No connector read was made after
  the owner's 07:52 instruction.
- No workflow dispatch (`aws-session.yml` neither `up` nor `down`, `aws-terraform.yml` nothing).
- No Terraform plan or apply.
- No ECS service or task, migration or bootstrap.
- No secret created, changed, deleted or read.
- No IAM, service-linked role, KMS, Cloudflare, DNS or certificate change.
- No production, GitHub settings or environment change.
- No schedule, budget or backstop change.
- No merge.

## 10. Recommendation

Merge this PR so the corrected helpers are on `main`, then run the preflight (O-1, O-2).

- If P-1 to P-13 all PASS and G-4 is confirmed, the verdict becomes **READY FOR OWNER APPROVAL**.
  Under root (mode B) a PASS shows resource state and policy documents only, not effective
  permissions (ACCESS-POLICY §1.2).
  The next approval is the session itself (step 8 `up`), given separately.
- A missing service-linked role (P-11), a non-current version id (P-5) or any denial (P-12) is a
  stop: report it, with no IAM or secret change.

## 11. Preflight script hardening (owner request 08:25 UTC)

Scope: `supporting/preflight-readonly.sh` only, plus its offline tests. It was not run against AWS.
No workflow was dispatched and no AWS resource was touched.

### 11.1 Defects in the version merged in #76 (sha `5b517d7d…`)

| #   | Defect                                                                                                  | Effect                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| S-1 | No account guard: `sts get-caller-identity` was printed, not compared                                   | In the wrong account every later read would run and print plausible output                                                    |
| S-2 | Failed calls were not detected. `set -e` was off, stderr went to the terminal and nothing was evaluated | An `AccessDenied`, throttling or network error appeared between other lines and the run still ended with "preflight finished" |
| S-3 | `echo "services=$(aws …)"` style counts                                                                 | A failed count printed `services=` (empty), which reads like no services                                                      |
| S-4 | P-11 printed `get-role … 2>&1 \| head -1`                                                               | A missing role (`NoSuchEntity`) and a denied call (`AccessDenied`) looked alike                                               |
| S-5 | P-9 called `describe-certificate` with an empty ARN when no certificate was listed                      | An error, not "absent"                                                                                                        |
| S-6 | P-12 piped `lookup-events` into the helper                                                              | A failed lookup sent empty input; the helper reported a parse error, not the AWS failure                                      |
| S-7 | No overall result                                                                                       | Nothing stopped a reader from treating a partly failed run as clean                                                           |

### 11.2 What the script does now (sha `deacf85bbc70107b8ce12748c7b2f4efd77f9a89cb755ebc42381f51ab0423d4`)

- **Account guard first.** If the `aws` CLI is missing, the account cannot be read, or the account is
  not exactly `229251310592`, the script prints `STOP`, makes no other AWS call, and ends with
  `OVERALL: NOT RUN` (exit 3).
- **One call path.** Every other call goes through `aws_call`, which:
  - refuses any operation outside a fixed allowlist of 31 read operations;
  - captures stderr;
  - classifies the result.
- **Three outcomes.**
  - **ERROR**: the call failed. This covers access denied, throttling, network, CLI or helper
    failures, and an unknown response. Nothing was verified.
  - **ABSENT**: AWS answered with a not-found code that names the resource, for example
    `DBInstanceNotFound`, `NoSuchEntity`, `ImageNotFoundException`, `ResourceNotFoundException` or
    ECS "Unable to describe task definition". It is shown with that code and counts as **FAIL**.
  - A failure without an AWS error code is never treated as ABSENT.
- **Expected absence.** The leftover bootstrap secret (P-6) is expected to be absent, so a count of
  `0` is a PASS and a count of 1 is a FAIL.
- **Values are checked against expectations.** Each P check compares values with the section 5.3
  table instead of printing them for a reader to compare. Details:
  - P-13 compares the subnet and security group VPCs with the database VPC from P-2.
  - P-13 is a FAIL, not a PASS, when P-2 returned no VPC.
- **Overall result.** Each check takes its worst line. The overall result is:
  - `INCOMPLETE` if any check has an ERROR (it never ends as PASS);
  - otherwise `FAIL` if any check failed;
  - otherwise `PASS`.
  - A check that produced no line at all is an ERROR.
- **What is printed.** The output stays metadata only:
  - ARNs and version ids of secret references;
  - statement ids, but not statement contents;
  - no environment values, no secret values, no Terraform state and no logs.

### 11.3 Tests [V-test]

`supporting/preflight_readonly_test.py` runs the real script with `aws` replaced on `PATH` by
`supporting/preflight_aws_stub.py`. The stub:

- returns API-shaped JSON responses from a scenario;
- applies the script's own `--query` expressions with `jmespath`;
- prints them in the CLI's text format;
- emits CLI-style errors (`An error occurred (Code) when calling the Op operation: …`, exit 254) and
  CLI-level failures without a code (exit 253 or 255);
- logs every call.

No AWS endpoint is contacted. Command: `pip install jmespath` (once), then
`python3 -I preflight_readonly_test.py -v`. Result on bash 5.2.21, Python 3.13.18 and jmespath
1.1.0: **24 tests, 24 passed, 0 failed** (about 33 s).

| Group             | Tests | Asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expected state    | 1     | Exit 0, `OVERALL: PASS (all 14 checks)`, each P check PASS, no FAIL or ERROR line, CloudTrail `events 3 denials 0` (one ThrottlingException event is not a denial), first call is `get-caller-identity`, only allowlisted reads, canary values in task definition environment and policy actions never printed                                                                                                                                                                                                 |
| Wrong account     | 4     | Other account `111122223333` and `2292513105920` (extra digit): exit 3, `STOP`, exactly 1 AWS call. Unreadable account (no credentials, exit 253): exit 3, 1 call. No `aws` CLI: exit 3, 0 calls                                                                                                                                                                                                                                                                                                               |
| AWS CLI failures  | 8     | `AccessDeniedException` on RDS: P-2 ERROR, exit 2, `INCOMPLETE`, P-13 not PASS. `AccessDenied` on `get-role`: ERROR, not ABSENT. CLI failure whose text mentions `NoSuchEntity` but carries no AWS code: ERROR, not ABSENT. Network failure (exit 255): ERROR. `Throttling` on a count: ERROR, not `0`. CloudTrail denied in us-east-1: P-12 ERROR (eu-central-1 still PASS). Malformed lookup JSON: ERROR (helper exit 2). Missing `cloudtrail-denials.py`: ERROR and no lookup call. Unknown response: ERROR |
| Missing resources | 7     | Bootstrap secret absent: PASS; present: FAIL, exit 1, `OVERALL: FAIL`. `AWSServiceRoleForElasticLoadBalancing` `NoSuchEntity`: FAIL "ABSENT … blocking for up", no ERROR. `DBInstanceNotFound`: FAIL. ECR `ImageNotFoundException`: FAIL. Task definition `ClientException`: P-3 and P-4 FAIL. Cluster `MISSING` and no certificate: FAIL, `describe-certificate` not called                                                                                                                                   |
| Differing values  | 2     | RDS `available`, a CloudTrail `AccessDenied`, pin not `AWSCURRENT`: P-2, P-12, P-5 FAIL, exit 1. A FAIL plus an ERROR: exit 2, `INCOMPLETE (1 … command failures, 1 failed)`                                                                                                                                                                                                                                                                                                                                   |
| Static            | 1     | Every allowlist entry is a read verb, with none of `get-secret-value`, `batch-get-secret-value`, `get-login-password`, `get-authorization-token`, `get-session-token` or `get-object`. No `terraform`, `tfstate`, `s3 cp`, `logs` in code. `aws` is invoked directly only in `aws_call` and the account guard. Every `aws_call` operation is allowlisted                                                                                                                                                       |

Mutation check: each of these deliberate breakages of a temporary copy made the suite fail.

- Account comparison removed: 2 failures.
- Failed calls returned as success: 6 failures.
- ABSENT allowed without an AWS error code: 1 failure.
- Errors ignored in the overall result: 7 failures.
- `secretsmanager:get-secret-value` added to the allowlist: 1 failure.

`bash -n` passes.

### 11.4 Limits

- The stub reproduces the CLI's text format for the shapes these queries return; it is not the AWS
  CLI. The first real run is the owner's. A query or output difference in the real CLI shows as a
  FAIL or ERROR line, never as a silent PASS.
- Expected values are those of section 5.3, from source on `main`. If the owner changes the
  configuration, for example the backstop count or the role path, the script reports a FAIL to
  review, not a PASS.
