# Claude-executed first Identity non-production deployment: plan for review (11 Nov 2026)

- **Owner direction, 11 Nov 09:01 UTC.** Claude prepares and carries out the first Identity
  non-production session. ChatGPT reviews the plans and the results. The owner keeps only the
  steps that truly need the account owner.
- **This report is a plan only.** Nothing in it has been executed, and it is not deployment
  authorization.
- **Basis.**
  - `munaxa/munaxa-platform` `main` `49c51f3` (PR #86, the operator checklist, merged).
  - `munaxa/munaxa-identity` `main` `5277d71`, the commit the deployed images were built from.
  - Account `229251310592`, region `eu-central-1`.

Labels:

- **[V]** verified here today, from source, GitHub metadata or a test in this session;
- **[R]** from evidence already in the repository;
- **[O]** owner-provided;
- **NOT VERIFIED** not yet proven.

---

## Summary

- **Claude can run almost the whole session.**
  - GitHub is reached through the integration, which acts as the owner's account.
  - AWS is reached through the AWS connector, signed in as the account root.
  - Every CloudShell step in the operator checklist can be done through the connector instead.
- **The owner is left with three short actions and one decision.** None of them needs a command
  line, a script or reading a log (part 2):
  1. a written go-ahead;
  2. a Testing email address for the operator account;
  3. keeping the AWS connector signed in;
  4. the decision is where the operator password is kept.
- **Two limits change the design** (part 3):
  - This session's network cannot reach `id.test.munaxa.com`. That was tested at 09:02 UTC: the
    egress proxy refused it.
  - This environment has no tool that uses a secret without the value entering Claude's context.
    The project rule requires one (`{{resolve:…}}` with `asm-exec`).

  So Claude must not log in with the operator password itself. The fix is to run the HTTP and
  sign-in tests **inside AWS**: a short test program runs in the existing `identity-bootstrap`
  task, which already receives the operator credentials from Secrets Manager. The password then
  never reaches Claude, the owner or a chat. It also means **no DNS change is needed** for the
  first session.
- **One correction to PR #86 (merged), found while preparing this.** Step 19b's refresh request
  must name the organisation. Without it, a correct Identity answers 401, a false stop. It is
  corrected in this PR (see [Correction](#correction-to-pr-86)).

---

## 1. What Claude can do automatically (after the owner's go-ahead)

| # | Work | How | Evidence Claude keeps |
| --- | --- | --- | --- |
| C-1 | Session-day readiness check: account, database stopped, ECS empty, task definitions and digests, secret **metadata** (version ids, AWSCURRENT, key), no leftover bootstrap secret, nothing running, backstop 11 enabled, ACM, ECR images, service-linked roles, CloudTrail denials, network | Read-only AWS calls through the connector, the same checks as `preflight-readonly.sh` P-1 to P-13 | Raw JSON output committed to the repository (closes L-1, section 4) |
| C-2 | GitHub checks G-1 to G-5: `main` head, no AWS Terraform run waiting, latest session run green, no `infra/` PR open | GitHub integration, read-only | Run ids in the report |
| C-3 | Pre-check of the session deployer's permissions (L-2) | IAM policy simulation, read-only (`SimulatePrincipalPolicy`) | Raw results |
| C-4 | Check of the CloudWatch filter pattern for sensitive data (L-9), against made-up sample lines | `TestMetricFilter`, read-only, needs no log data | Raw results |
| C-5 | Start the session: dispatch `aws-session.yml` on `main` with `session=up`, then follow the run to the end | GitHub integration (`workflow_dispatch`) | Run id, summary (11 creates) |
| C-6 | Confirm the database, ALB, listeners, service and first task (step 8, corrected reading F-1) | Read-only AWS calls | Outputs |
| C-7 | Create the Identity database and roles (step 10), then migrate (step 11) | `ecs:RunTask` of the existing task definitions, wait, read exit code and log lines | Task ids, exit codes, the expected lines |
| C-8 | Create the temporary bootstrap secret (step 12). The password is generated **inside AWS** and never returned | `GetRandomPassword` and `CreateSecret` in one connector script that returns only the secret's name, ARN and version count | Metadata only |
| C-9 | Bootstrap steps 13 to 15 | `ecs:RunTask` with command overrides, which carry no secret | Organisation id and `sub` (public ids). The email is masked before Claude sees the log |
| C-10 | Restart Identity and wait until healthy (step 17) | `ecs:UpdateService --force-new-deployment` on service `identity`, then wait | Stable, 1 running, target healthy |
| C-11 | Health, sign-in, wrong password, unauthenticated access, token (JWT) verification, refresh, logout, refresh after logout, operator host 403, admin path 403, unknown host 404, HTTP to HTTPS (steps 18 to 20, 19b) | **In-AWS probe:** the `identity-bootstrap` task with a command override that runs a reviewed test program (part 4, P-1). It reaches the ALB by its AWS name and sends the real host name for TLS and routing, so DNS is not needed | PASS or FAIL lines only. No token, no cookie, no email |
| C-12 | Logs carry no secret (step 19c) | `FilterLogEvents` with the tested pattern; Claude receives the **count only** | Count |
| C-13 | Certificate attached and valid (step 21) | Read-only ACM and listener calls; the probe checks the certificate it is served | Outputs |
| C-14 | Delete the bootstrap secret (step 16, now after the probe) | `DeleteSecret --force-delete-without-recovery`, then confirm count 0 | Count 0 |
| C-15 | End the session: dispatch `session=down`, follow it, confirm the database is stopped | GitHub integration, read-only AWS | Run id, database `stopped` |
| C-16 | Shutdown evidence (step 23): 0 ALB, 0 services, 0 tasks, 0 public IP, 0 NAT, database stopped, backstop 11 enabled, bootstrap secret 0, CloudTrail denials match S-1 to S-8 | Read-only AWS calls | Raw output committed |
| C-17 | Time guard | Claude schedules its own reminder at 2 h 45 min after `up` and dispatches `down` at the hard stop, whatever the state | Times in the report |
| C-18 | Next-day cost | Cost Explorer through the connector (about US$0.01 per request) | Figures in the report |
| C-19 | Session report, its index line and the project-files copy for ChatGPT | Docs PR. **Merged only on the owner's word** | Link |

Every AWS change above is made **as root through the connector** (part 3, U-5). Each one is
listed in part 4. Nothing else is changed.

## 2. What needs one simple action from the owner

| # | Action | When | How long |
| --- | --- | --- | --- |
| O-1 | **Approve in writing.** One message that approves: (a) the session-day read-only checks C-1 to C-4; (b) the session on a named date, starting no later than 15:30 UTC, with the cost ceiling US$0.35 and the 3-hour hard stop; (c) Claude running the AWS writes in part 4, as root through the connector. You can approve (a) first and (b) later, after ChatGPT has reviewed C-1 to C-4 | Before anything runs | 1 minute |
| O-2 | **A Testing email address for the operator account**, for example a new mailbox or alias used only for Munaxa Testing. It is not a secret, but it will appear once in an AWS log (part 3, U-7). Send it in the thread | With O-1 | 1 minute |
| O-3 | **Keep the AWS connector signed in.** If Claude reports that the AWS sign-in expired, a Reconnect card appears in the thread; press it and complete the AWS sign-in, including MFA | Only if it expires | 1 minute |
| O-4 | **Decide where the operator password lives** (decision; part 5) | With O-1 | 1 minute |

**Not needed from the owner:** no AWS CLI, no CloudShell, no script, no Terraform, no log
reading, no Cloudflare change (DNS is optional, part 3, U-3), and no GitHub App inspection (SC-1
stays as the owner chose).

## 3. What is blocked or unsafe, and how the plan handles it

| # | Item | Why | Handling |
| --- | --- | --- | --- |
| U-1 | Sign-in tests from this session's network | The egress proxy refused `id.test.munaxa.com`, `munaxa.com` and general web hosts (403 to CONNECT at 09:02 UTC) [V]. The project runs on the built-in cloud environment, which has no network settings | Tests run inside AWS (C-11). No environment change requested |
| U-2 | Claude handling the operator password | The project rule requires secrets to be resolved at run time with `asm-exec`, which this environment does not provide [V]. Claude must not read a secret value (`get-secret-value` is forbidden) | Password generated inside AWS and used only by the ECS task. **Open point (V-1):** whether the connector's call log repeats call parameters. It is checked first with a harmless call; if it does, C-8 is not run and part 5 option B applies |
| U-3 | DNS (Cloudflare) | Claude has no working Cloudflare DNS tool (the Cloudflare connector's sign-in has expired, and its DNS capability is not established). **The owner asked that DNS is not changed without approval** | Not needed for the first session: the probe sends the real host name to the ALB. A record is needed only for opening Identity in a browser; that can be a later, separate step |
| U-4 | GitHub Apps (SC-1) | Owner instruction | Not inspected. Recorded as an accepted limitation |
| U-5 | AWS writes as root | The connector is the root user (owner decision, 8 Nov ACCESS-POLICY). Root has no permission boundary | Each write is listed in part 4 and needs O-1. No IAM, KMS, Terraform, network or security-group change. CloudTrail is reviewed afterwards (C-16) |
| U-6 | P-12 denials | Known provider fallback (RESOLVED — EXPECTED BEHAVIOUR). The owner forbids hiding it with IAM | No IAM change. The raw result stays FAIL. Each new denial from `up` and `down` (2 per run expected) is checked against S-1 to S-8. Anything else stops the session |
| U-7 | Operator email in logs | `bootstrap-account.mjs:165` prints `Created <email> …` into `/munaxa/nonprod/ops` (14-day retention) [V] | Claude masks it before reading the log. Changing the script is Identity code, not proposed here |
| U-8 | MFA | Not implemented: login refuses an MFA-enrolled account with `AUTH_MFA_REQUIRED`, and no enrolment or verification route exists [V] | No test. The operator account is password-only. Listed for the owner to accept for Testing |
| U-9 | Password reset | No HTTP route; only the token store exists [V] | No test. A lost password needs a reviewed repair procedure (part 5) |
| U-10 | The preflight script itself | The bash script is made for CloudShell. The connector runs Python and has no shell | C-1 runs the same checks as connector calls and commits the raw output. It is labelled as connector evidence, not as a script run |
| U-11 | Merges, production, Terraform | Owner instruction | None in this plan. Docs PRs stay open until the owner says merge |

## 4. Exact actions proposed after approval

### Phase A: read-only (needs O-1 a), about 15 minutes, no cost

| # | Action | AWS or GitHub calls | Stop if |
| --- | --- | --- | --- |
| A-0 | **V-1:** check whether the connector's call log echoes parameters | `secretsmanager:GetRandomPassword` with a throwaway value that is never used. Look at the call log only | Parameters or responses appear in the log: do not use C-8; use part 5 option B |
| A-1 | Readiness check (C-1) | `sts:GetCallerIdentity`; `rds:DescribeDBInstances`; `ecs:Describe*`/`List*`; `secretsmanager:DescribeSecret`, `ListSecretVersionIds`, `ListSecrets`; `kms:DescribeKey`; `elbv2:Describe*`; `ec2:Describe*`; `scheduler:ListSchedules`; `acm:DescribeCertificate`; `ecr:DescribeImages`; `iam:GetRole`; `cloudtrail:LookupEvents` (both regions, from 10 Nov 06:00 UTC) | Any result outside readiness status §5 and §6 |
| A-2 | GitHub G-1 to G-5 (C-2) | Run lists, PR list | A run waiting, an `infra/` PR, a red session run |
| A-3 | Deployer simulation (C-3) | `iam:SimulatePrincipalPolicy` for `munaxa-shared-deployer-nonprod-session` on the actions the 11 session resources need: `elasticloadbalancing:Create*`, `AddTags` and `ModifyListener`; `ecs:CreateService`; `rds:StartDBInstance`; `acm:DescribeCertificate`; `iam:PassRole` where used | Any `implicitDeny` or `explicitDeny`. Report; **no IAM change** |
| A-4 | Log-filter check (C-4) | `logs:TestMetricFilter` with synthetic lines (a fake JWT, a fake PEM header, a fake password field, plus clean lines) | The pattern misses a synthetic secret, or matches a clean line |
| A-5 | Commit A-0 to A-4 raw outputs | Docs PR (unmerged) | — |

Phase A **closes L-1** with fresh repository evidence, if the owner accepts that in place of the
07:01 file. It **narrows L-2** and **closes the filter half of L-9**.

### Phase P: prepare the in-AWS probe (repository only, before phase B)

- **P-1.** Add `supporting/identity-session-probe.mjs` with local tests (`node --test`) against a
  mocked server. The program:
  - connects to the ALB's AWS DNS name;
  - sends SNI and `Host` set to `id.test.munaxa.com`, and verifies the certificate for that name;
  - reads `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` from its own environment (ECS
    injects them from the bootstrap secret);
  - checks:
    - `live` 200;
    - `ready` 200 with `cache: redis` and the kid;
    - `session` without cookie `{"signedIn":false}`;
    - login 200;
    - one wrong password 401 `AUTH_INVALID_CREDENTIALS`;
    - `session` with cookie `signedIn: true`;
    - the JWT against the committed public key (alg, kid, signature, iss, aud, exp, iat, 900 s,
      reusing `verify-identity-jwt.mjs`);
    - refresh 200, with `organisation: munaxa-group`;
    - logout 200;
    - pre-logout refresh token 401;
    - the operator host 403 on `/` and `/api/auth/*`;
    - `control-api` `/api/v1/admin/*` 403;
    - an unknown host 404;
    - HTTP 301 to HTTPS.
  - It prints one PASS or FAIL line per check and never a token, cookie, email or password.
- **P-2.** Run command (an override, which carries no secret): `node -e` with a short loader. The
  loader downloads the probe from `raw.githubusercontent.com` at a **pinned commit**, checks its
  SHA256 and runs it. The task already has HTTPS egress to the internet (`ops.tf:29-36`) and the
  Node 22 runtime image (`apps/api/Dockerfile:111`). Falling back to embedding the program in the
  override (8 KB limit) is possible.
- **P-3.** Docs PR with the probe, its tests and the exact override. ChatGPT reviews it. Merged only
  on the owner's word, because the probe must be on `main` at a pinned commit before phase B.

### Phase B: the session (needs O-1 b and c, O-2, O-4), at most 3 hours

The order replaces the operator checklist's CloudShell steps. The checklist's expected results,
evidence and hard stops H-1 to H-17 apply unchanged, except where this table says otherwise.

| # | Claude's action | Change | Hard stop |
| --- | --- | --- | --- |
| B-1 | Repeat A-1 and A-2 if more than 2 hours have passed since phase A | none | as A-1 |
| B-2 | **Dispatch** `aws-session.yml`, ref `main`, `session=up`. Record the time T0. Schedule the T0 + 2 h 45 min reminder | DB start; 11 creates | H-1, H-2, H-3, H-4, H-7, H-8 |
| B-3 | Confirm step 8 (DB `available`, ALB active, service `identity` ACTIVE, Valkey HEALTHY, Identity exits on a **database** error) | none | H-9 |
| B-4 | `ecs:RunTask` `munaxa-nonprod-db-admin:1` (sg `munaxa-nonprod-db-admin`, public subnets, public IP), wait, exit 0, roles line | DATA | H-4 |
| B-5 | `ecs:RunTask` `munaxa-nonprod-identity-migrate:1` (sg `munaxa-nonprod-identity-migrate`), exit 0, "All migrations have been successfully applied." | DATA | H-5 |
| B-6 | Create `munaxa-nonprod/identity-bootstrap` (keys `IDENTITY_OWNER_EMAIL` = O-2 and `IDENTITY_OWNER_PASSWORD` generated in AWS; key `alias/munaxa-nonprod-data`; no rotation). Per O-4, also the persistent copy (part 5). Return metadata only | SEC | wrong name or key |
| B-7 | `ecs:RunTask` `munaxa-nonprod-identity-bootstrap:1` (default command), then with the two command overrides (checklist steps 13 to 15) | DATA | H-6 |
| B-8 | `ecs:UpdateService` cluster `munaxa-nonprod`, service `identity`, force new deployment; wait stable; target healthy | AWS | H-10 |
| B-9 | `ecs:RunTask` `munaxa-nonprod-identity-bootstrap:1` with the probe override (P-2) | none (reads only) | any FAIL: H-11, H-12, H-13 |
| B-10 | Log check (C-12) and certificate check (C-13) | none | H-11, H-17 |
| B-11 | Delete the bootstrap secret; count 0 | SEC | H-17 |
| B-12 | **Dispatch** `session=down`; confirm both jobs green and the DB stopping | removes the 11; DB stop | H-3 |
| B-13 | Shutdown evidence (C-16); commit | none | anything left running |

**On any hard stop:**

1. delete the bootstrap secret if it exists;
2. dispatch `down`;
3. run B-13;
4. report.

At T0 + 3 h, Claude dispatches `down` whatever the state.

### Phase C: after the session

- C-18 next day.
- The session report, the project-files copy and the GitHub link for ChatGPT.

## 5. Owner decision: where the operator password lives (O-4)

The bootstrap scripts never change an existing account's password. "Already bootstrapped. … No
password was written." And Identity has no password reset (U-9).

| Option | What happens | Cost | Recommended |
| --- | --- | --- | --- |
| **A. Kept in AWS for you** | Claude generates the password inside AWS and stores it in the temporary bootstrap secret, plus a permanent copy, `munaxa-nonprod/identity-operator` (data key). Claude never reads it. When you need the operator sign-in (later, for Control), you open that secret in the AWS console and copy it into your password manager | US$0.40 a month | **Yes** |
| B. Not kept | The password exists only for the session. The account works for the tests, but nobody can sign in with it afterwards. A later Control session needs a reviewed repair, such as a new operator account | none | No |
| C. You create the bootstrap secret yourself | You type the address and a password from your password manager into the AWS console, following clicks Claude gives you (about 10 clicks). Everything else stays with Claude | none | Only if you prefer to hold the password from the start |

## 6. Cost, time, resources, rollback and shutdown

- **Cost ceiling: US$0.35 for the session** (US$0.20 expected for 2 hours).
  - Per hour, about US$0.10: Fargate, the ALB, 3 public IPv4 addresses and the database, at the
    list prices of first-session §8.
  - Tasks cost under US$0.02.
  - Option A adds US$0.40 a month.
  - Any sign of more (a second ALB, a NAT gateway, another service) means `down` now (H-16).
- **Time.**
  - Start no later than **15:30 UTC**.
  - `down` by **18:30 UTC**, or at **T0 + 3 h** if that comes first.
  - Expected duration: about 2 hours.
- **AWS resources while running.**
  - From `up`: 1 ALB, 2 listeners, 3 fixed-response rules, Identity rules 40 and 50, the
    certificate validation, 1 target group and 1 ECS service with 1 task (Identity plus Valkey).
    The database runs.
  - Run-to-exit tasks: db-admin 1, migrate 1, bootstrap 3, probe 1.
  - Temporary secret: 1, plus the permanent copy under option A.
  - **Nothing else.**
- **Rollback.**
  - Data: this is the first deployment, so there is no earlier state. A failed migration or
    bootstrap stops the session. The Testing database is repaired later by a reviewed procedure,
    never fixed forward in the session.
  - Infrastructure: `down` removes everything `up` made.
- **Shutdown layers.**
  1. Claude's `down` (B-12, or at the hard stop).
  2. The scheduled `down` at 19:17 and 01:47 UTC.
  3. The AWS backstop at 21:00 UTC: database stop and service at 0. It cannot remove the ALB, about
     US$0.04 an hour until the next `down`.

## 7. Outstanding items, one by one

| Item | Status now | After this plan |
| --- | --- | --- |
| **P-12** S3 `ListTagsForResource` denials | Raw FAIL; RESOLVED — EXPECTED BEHAVIOUR [R]; no IAM change (owner) | Unchanged. New denials from `up` and `down` are checked against S-1 to S-8 in C-16; anything else stops |
| **G-4** environment `aws-nonprod-session` | VERIFIED on owner evidence [O]; Claude cannot read the settings | Unchanged. `up` itself confirms the environment's variables resolve (run log) |
| **L-1** raw 07:01 output | Not in the repository, thread or uploads [V]; not recreated | Closed by phase A's fresh raw evidence, if the owner accepts that. Otherwise the owner attaches the file |
| **L-2** deployer permissions | Not exercised [R] | Narrowed by A-3 (simulation); proven only by B-2. `AccessDenied` stops the session (H-1); no IAM change |
| **L-3** secret versions, key pair, bootstrap partial ARN | Metadata PASS [R] | Versions proven at B-3, B-4 and B-5. Key pair proven by the probe's JWT signature check (B-9). Partial ARN proven at B-7 (`ResourceInitializationError` stops) |
| **L-9** refresh after logout | Source now traced [V]: logout revokes the refresh token and the session (`auth.service.ts` `logout`), and refresh of a revoked token or session returns `invalid-credentials`, which is 401 (`attemptRefresh`). Runtime result NOT VERIFIED | Proven at B-9 |
| **L-9** log filter | NOT VERIFIED | Pattern proven by A-4; applied in B-10 |
| **MFA** | Not implemented [V] | No test; owner accepts for Testing |
| **Password reset** | Not implemented [V] | No test; part 5 covers the consequence |
| **SC-1** GitHub Apps | Unverified by owner choice | Unchanged; not inspected |

## Correction to PR #86

Operator checklist §6.4 (step 19b) sent the refresh request with an empty body. Identity resolves
the organisation from the request, or from `IDENTITY_DEFAULT_ORGANISATION`, which Config A1 leaves
empty (`apps/api/src/auth/auth.service.ts` lines 103 to 106). A valid refresh would therefore have
answered 401 and stopped a correct session. The checklist now sends
`{"organisation":"munaxa-group"}`, with a dated correction note. Nothing else in that document
changes.

## What was done for this report

**Read:**

- PR #86 and `main` of both repositories;
- `auth.service.ts` (`organisation`, `attemptRefresh`, `logout`);
- `auth.controller.ts`;
- `ops.tf` (task egress);
- the Identity Dockerfile (Node 22).

**Tested:**

- this session's outbound network: four hosts, all refused by policy;
- the AWS skill registry: there is no `aws-secrets-manager` skill and no `asm-exec`.

**Not done:**

- no AWS account API call (only the public AWS documentation and skill search was used);
- no workflow dispatch;
- no secret, IAM, DNS, Terraform or settings change;
- no GitHub App inspection;
- no merge.
