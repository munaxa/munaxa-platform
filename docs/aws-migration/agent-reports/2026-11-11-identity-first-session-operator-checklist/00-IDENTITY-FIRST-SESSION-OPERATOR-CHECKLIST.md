# First Identity non-production session: operator checklist (11 Nov 2026)

- Repository: `munaxa/munaxa-platform`, `main` at `55b5449` (PR #85 squash merge). Identity source
  `munaxa/munaxa-identity` `main` at `5277d71`, the commit the deployed images were built from.
- Environment `nonprod`, account `229251310592`, region `eu-central-1`.
- Scope: repository inspection and documentation only. **This document is not deployment
  authorization.** The owner authorizes the session separately, in writing.

Labels:

- **[V-src]** verified here, from source on `main` today (platform `55b5449`, identity `5277d71`);
- **[V-gh]** verified here, from GitHub run and PR metadata today;
- **[R]** from evidence already in the repository;
- **[O]** owner-provided evidence, not inspected here;
- **NOT VERIFIED** cannot be confirmed from the source available here.

---

## 1. Executive summary

- The first-session procedure (runbook steps 8 to 23, as corrected by the 10 Nov first-session
  preparation F-1 and F-2) matches the code on `main` today. Every workflow input, resource name,
  task-definition family, container name, log group, log stream prefix, security group, target
  group and listener rule used by the commands was checked against source.
- Nothing that the readiness review relied on has changed:
  - no commit under `infra/` or `.github/` since `67904bc` (the Config A1 inputs);
  - the preflight script's SHA256 is unchanged;
  - no AWS-credentialed workflow has run since 00:04 UTC;
  - no PR is open.
- Three things are added to the procedure here:
  - a refresh-token and logout test (step 19b), since refresh is implemented;
  - unauthenticated-access checks against Identity itself;
  - a log check for sensitive data.
- Two requested tests do not apply to this build:
  - **MFA:** a refusal path exists, but no enrolment or verification endpoint does.
  - **Password reset:** a token store exists, but no HTTP route does.

  Both are recorded as limitations, not as tests (section 8.2).

- One logging observation: bootstrap step 13 writes the operator's email address to the
  `/munaxa/nonprod/ops` log group, which has 14-day retention. That is not a secret, but it is
  personal data (section 8.3).

**Assessment: READY FOR OWNER EXECUTION**, with the conditions in section 12. This is a
judgement on the procedure's quality and completeness, not authorization to deploy.

## 2. Current readiness status

### 2.1 Repository state [V-gh] [V-src]

| Check                                                  | Result                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `main` head                                            | `55b5449`, "final Identity non-production deployment-readiness review (#85)"                                           |
| PR #85                                                 | **Merged**, squash commit `55b5449`, 11 Nov 08:07 UTC                                                                  |
| PR #84                                                 | Merged, `7cd5e4f`                                                                                                      |
| Open PRs on `munaxa-platform`                          | None                                                                                                                   |
| Commits since the readiness review's basis (`d9ecb2f`) | `d95ee7b` (#82), `f594ab8` (#83), `7cd5e4f` (#84), `55b5449` (#85): all under `docs/aws-migration/agent-reports/` only |
| `infra/` and `.github/`                                | No change since `67904bc` (Config A1 inputs, applied 10 Nov)                                                           |
| `preflight-readonly.sh` SHA256                         | `21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c` (expected)                                          |
| `verify-identity-jwt.mjs` SHA256                       | `bf5e88f2a933439fe8ced20269f26934cbeaa7a614b46637f6101020e63db9cf` (expected)                                          |
| `cloudtrail-denials.py` SHA256                         | `0669df65de48088855ac71b10024496f6fe9e555cc79d01262890731be1b7589` (expected)                                          |
| Identity `main`                                        | `5277d71`, the image build commit (no later Identity change)                                                           |

### 2.2 Workflow runs [V-gh]

| Workflow                                | Latest runs                                                                                                       | Effect on readiness                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| AWS Testing session (`aws-session.yml`) | 19 runs in total. Latest `42928482147`, 11 Nov 00:04 UTC, `schedule` (`down`), success. **`up` has never run**    | None. Tonight's 19:17 UTC scheduled `down` has not run yet |
| AWS Terraform (`aws-terraform.yml`)     | Runs 94 to 98 (06:46 to 07:52 UTC) are `pull_request` runs on docs PRs: mocked tests only, Plan and Apply skipped | None: no AWS credentials, no state access                  |

No AWS-credentialed run has happened since the 07:01 UTC preflight, so its evidence is still
current for a session **today**. It must be re-run (section 3, A-3) if the session is on another
day, or if any AWS-credentialed workflow runs or any `infra/` PR merges first.

### 2.3 Readiness distinctions carried forward unchanged

| Item                                                        | Status                                                                                                                                     | Source                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| P-12 raw result                                             | **FAIL** (`OVERALL: FAIL (1 check(s) failed)`, exit 1)                                                                                     | [R] 05:43 raw output; [O] 07:01 |
| P-12 investigation                                          | **RESOLVED — EXPECTED BEHAVIOUR** (10 implicit `s3:ListTagsForResource` denials, provider 6.67.0 fallback; accepted D-1)                   | [R]                             |
| Other preflight checks                                      | P-1 to P-11b and P-13 PASS                                                                                                                 | [R] 05:43; [O] 07:01            |
| G-4 environment `aws-nonprod-session`                       | **VERIFIED on owner evidence** (no reviewers, no timer, `main` only, admin bypass enabled, no environment secrets, both variables correct) | [O]                             |
| SC-1 installed GitHub Apps                                  | **NOT VERIFIED, by owner choice.** Not inspected here                                                                                      | —                               |
| Identity used for the preflight                             | Root, read-only, `ALLOW_ROOT_READONLY=yes`                                                                                                 | [R]                             |
| Effective session-deployer permissions                      | **Not exercised** (`up` never ran; P-11b compares documents only)                                                                          | [R]                             |
| Secret version ids, signing key pair, bootstrap partial ARN | **Session-time verification conditions** (steps 8, 10, 11, 13, 19)                                                                         | [R]                             |
| Raw 07:01 preflight output                                  | **Not in the repository** (only `preflight-20261111T0543Z.txt` is). Not in the project uploads either. Not recreated here. L-1 stays open  | [V-gh]                          |

If the raw 07:01 file is wanted as repository evidence, the owner should add it, for example as
`2026-11-11-identity-final-deployment-readiness-review/evidence/preflight-20261111T0701Z.txt`.

## 3. Preconditions and owner authorization (part A: before starting)

Every item must be true before step 8. Each one is a hard stop if it is not.

| #    | Precondition                                                                                                                                                                                                                                                                                                                  | How to confirm                                              | Status now                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| A-1  | **Written owner authorization** for the first Identity session. It names the date and start time and accepts the corrected readings of steps 8 and 17 (F-1, F-2), the 3-hour hard stop and the cost ceiling                                                                                                                   | Owner message in the project                                | **Not given**                            |
| A-2  | **Date and start time.** Start no later than **15:30 UTC**. All checks done and `down` dispatched by **18:30 UTC**, ahead of the 19:17 UTC scheduled `down` and the 21:00 UTC backstop                                                                                                                                        | Owner names it in A-1                                       | Open                                     |
| A-3  | **Preflight freshness.** The 07:01 UTC run is valid for a session today, if nothing in L-6 has happened since. Otherwise re-run it with readiness-status §5 (SHA-gated download; mode B; root with `ALLOW_ROOT_READONLY=yes`). The expected raw result is P-12 FAIL, with only S-1 to S-8 denials, and every other check PASS | Re-check G-2 below; re-run if needed                        | Current for today [V-gh]                 |
| A-4  | **GitHub G-1 to G-5** on the session day: `main` head `55b5449` or a later docs-only commit; no AWS Terraform run waiting or in progress; latest AWS Testing session run green; G-4 unchanged; no `infra/` PR pending                                                                                                         | Owner, GitHub UI                                            | PASS at 08:30 UTC [V-gh], except G-4 [O] |
| A-5  | **Workflow and branch:** `.github/workflows/aws-session.yml` ("AWS Testing session"), branch **`main`**                                                                                                                                                                                                                       | Both jobs require `github.ref == 'refs/heads/main'` [V-src] | —                                        |
| A-6  | **Workflow inputs:** exactly one input, `session` (choice `up` or `down`). `up` for step 8, `down` for step 22. Nothing else                                                                                                                                                                                                  | `aws-session.yml` lines 32 to 42 [V-src]                    | —                                        |
| A-7  | **Account and region:** `229251310592`, `eu-central-1`. The workflow pins both (`allowed-account-ids`, `AWS_REGION`). CloudShell is checked by the setup block                                                                                                                                                                | [V-src]                                                     | —                                        |
| A-8  | **Cost ceiling:** about **US$0.20** expected for 2 hours; **US$0.35** at the 3-hour hard stop (section 9)                                                                                                                                                                                                                     | Owner accepts in A-1                                        | —                                        |
| A-9  | **Three-hour hard limit** from the `up` dispatch time, whatever the state                                                                                                                                                                                                                                                     | Owner records the dispatch time                             | —                                        |
| A-10 | **Owner prerequisites at hand:** CloudShell in `eu-central-1` as root (ACCESS-POLICY); the Cloudflare dashboard for zone `munaxa.com`; the password manager, ready to create the "Munaxa Testing Identity operator" entry (a dedicated Testing address and a 32-character password)                                           | Owner                                                       | —                                        |
| A-11 | **SC-1** stays unverified by owner choice. Recorded, not inspected                                                                                                                                                                                                                                                            | —                                                           | Accepted limitation                      |

## 4. Exact sequential operator procedure

Order: A-1 to A-11 → step 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 19b → 20 →
21 → 22 → 23.

**General rule:** if a step fails, do not run the next one.

1. Record the failure.
2. Delete the bootstrap secret if it exists (step 16).
3. Dispatch `down` (step 22).
4. Collect the shutdown evidence (step 23).

### 4.1 Step matrix

Cost risk is the extra cost if the step goes wrong, on top of the running session (about
US$0.10 an hour).

| Step | Action (operator)                                                                                                                                                | Expected result                                                                                                                                                                                                                                                                                  | Evidence to retain                                                   | Failure condition (stop)                                                                                                                                                                                                  | Recovery                                                                                                                                                                                               | Cost risk                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 8    | Dispatch `aws-session.yml`, `main`, `session=up` (part B)                                                                                                        | Run green. Summary lists the 11 session creates only. DB `available`. ALB `active`, `internet-facing`, listeners 80/443. Service `identity` `ACTIVE`, desired 1. First tasks get past secret injection and Valkey becomes HEALTHY; then Identity exits with a **database** error (expected, F-1) | Run id and URL; summary; CloudShell outputs; dispatch UTC time       | Plan check refuses; any `AccessDenied`; `CannotPullContainerError`; `ResourceInitializationError`; Valkey unhealthy; Identity exits with an **environment/configuration** error; DB not `available`; job timeout (50 min) | A failed or cancelled `up` stops the DB by itself. Then dispatch `down` to remove anything created. For `AccessDenied`: decode (owner, root), compare with `iam_session.tf`, report. **No IAM change** | ALB about US$0.04/h until `down` |
| 9    | Cloudflare: one CNAME `id.test` → the ALB DNS name, **DNS only**                                                                                                 | `getent hosts id.test.munaxa.com` resolves to the ALB's addresses                                                                                                                                                                                                                                | ALB DNS name; screenshot of the record (proxy grey)                  | Record proxied; resolves elsewhere                                                                                                                                                                                        | Fix the record; no AWS change                                                                                                                                                                          | None                             |
| 10   | `run_one munaxa-nonprod-db-admin:1 $SG_DBADMIN`                                                                                                                  | Exit 0. Log: `db-bootstrap: identity: database identity, roles identity_owner and identity_app are in place.` (control, work, school: "no bundle values, skipped.")                                                                                                                              | Task id, exit code, that log line                                    | Non-zero exit; `TaskFailedToStart`; `ResourceInitializationError`; `... is missing or malformed; nothing was changed for identity.`                                                                                       | `down`. Bundle content is fixed by owner guide A/B and a version-id PR                                                                                                                                 | Cents                            |
| 11   | `run_one munaxa-nonprod-identity-migrate:1 $SG_MIGRATE`                                                                                                          | Exit 0. `All migrations have been successfully applied.`                                                                                                                                                                                                                                         | Task id, exit code, the final Prisma line                            | Non-zero; `P1000` or `P1001`                                                                                                                                                                                              | `down`. No fix-forward in the session; a reviewed procedure later                                                                                                                                      | Cents                            |
| 12   | Owner guide C: create `munaxa-nonprod/identity-bootstrap` (keys `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD`; key `alias/munaxa-nonprod-data`; no rotation) | `describe-secret` shows the name, the data key and 1 version                                                                                                                                                                                                                                     | That metadata output only                                            | Wrong name or key                                                                                                                                                                                                         | Delete and recreate it correctly                                                                                                                                                                       | < US$0.01                        |
| 13   | `run_one munaxa-nonprod-identity-bootstrap:1 $SG_DBADMIN` (default command)                                                                                      | Exit 0. `Created <address> in organisation munaxa-group.`, then `organisation <uuid>` and `sub <uuid>`                                                                                                                                                                                           | Task id; organisation id and `sub` (public ids). **Not the address** | Non-zero; `ResourceInitializationError` naming the bootstrap secret (partial ARN, R-6); password-policy refusal                                                                                                           | Step 16 first, then `down`. Partial ARN failure: fix by PR to the full ARN; do not improvise. Password policy: regenerate the password, update the secret, re-run 13                                   | Cents                            |
| 14   | Same, with the `seed-control-roles.mjs` command override                                                                                                         | Exit 0. One line per role, then `OPERATOR_ORGANISATION_ID <uuid>`, equal to step 13's organisation                                                                                                                                                                                               | Task id; `OPERATOR_ORGANISATION_ID`                                  | Non-zero; organisation id differs                                                                                                                                                                                         | Step 16, `down`                                                                                                                                                                                        | Cents                            |
| 15   | Same, with `bootstrap-account.mjs --role control-operator-admin`                                                                                                 | Exit 0. `Already bootstrapped. … No password was written.`, then `Assigned control-operator-admin, unscoped.`, same `sub`                                                                                                                                                                        | Task id; the confirmation line                                       | Non-zero; `No role "control-operator-admin"`                                                                                                                                                                              | Step 16, `down`                                                                                                                                                                                        | Cents                            |
| 16   | Owner guide D: force-delete the bootstrap secret                                                                                                                 | `list-secrets` count `0`                                                                                                                                                                                                                                                                         | Count output                                                         | Count stays `1` after a few 30-second retries                                                                                                                                                                             | Repeat the delete; never `down` with the secret present                                                                                                                                                | None                             |
| 17   | `update-service --service identity --force-new-deployment`; wait stable                                                                                          | `STABLE`; running 1 and desired 1; one deployment `COMPLETED`; target `healthy`; containers `identity` and `valkey` RUNNING HEALTHY                                                                                                                                                              | Outputs                                                              | Not stable in 15 min; target unhealthy                                                                                                                                                                                    | Collect stopped-task reasons and logs; `down`                                                                                                                                                          | Small (a few minutes)            |
| 18   | Health probes                                                                                                                                                    | `live 200`; `ready 200` with `cache: redis` and `signingKid: identity-nonprod-2026-11`                                                                                                                                                                                                           | Status codes and the `ready` body                                    | Not 200; `503` naming `database`, `schema`, `cache` or `signing`                                                                                                                                                          | `down`                                                                                                                                                                                                 | None                             |
| 19   | Login, wrong password, unauthenticated session, JWT verification                                                                                                 | `login 200`; `wrong-password 401` `AUTH_INVALID_CREDENTIALS`; session without cookie `{"signedIn":false}`, with cookie `signedIn: true`; JWT script `PASS`                                                                                                                                       | Status codes, script output (no token, no cookie)                    | `401` with the right password; `503`; any JWT `FAIL` (signature `FAIL` = key pair mismatch)                                                                                                                               | `down`. Key mismatch: new key pair (guide A/B), new version id and public key by PR                                                                                                                    | None                             |
| 19b  | Refresh and logout (added here)                                                                                                                                  | `refresh 200`; `logout 200`; refresh with the pre-logout cookie copy `401`                                                                                                                                                                                                                       | Status codes only                                                    | Refresh `401` with a valid cookie; old refresh `200` after logout                                                                                                                                                         | `down`; report (a revocation failure is a security finding)                                                                                                                                            | None                             |
| 20   | Access restrictions via `--resolve`                                                                                                                              | Operator host `403` and `403`; `control-api` admin `403`; wrong host `404`; HTTP `301` to HTTPS                                                                                                                                                                                                  | Status codes                                                         | Operator host anything but `403`                                                                                                                                                                                          | `down` immediately; report                                                                                                                                                                             | None                             |
| 21   | ACM and TLS                                                                                                                                                      | `ISSUED`; `InUseBy` = the ALB; listener `ELBSecurityPolicy-TLS13-1-2-2021-06`, same certificate ARN; openssl shows SAN `*.test.munaxa.com, operator-test.munaxa.com`, not expired                                                                                                                | Outputs                                                              | Certificate error; wrong ARN                                                                                                                                                                                              | `down`                                                                                                                                                                                                 | None                             |
| 22   | Dispatch `aws-session.yml`, `main`, `session=down`                                                                                                               | Both jobs green; summary lists only deletes of the 11 session addresses; DB `stopping` then `stopped`                                                                                                                                                                                            | Run id; DB status                                                    | Red run; DB not stopping                                                                                                                                                                                                  | Dispatch `down` again (the DB job is separate). Still running: owner stops the DB in the console. The 21:00 UTC backstop is the last line                                                              | ALB US$0.04/h until removed      |
| 23   | Read-only shutdown evidence (owner or authorized read)                                                                                                           | 0 ALB, 0 services, 0 tasks, 0 EIP, 0 public ENI, 0 NAT; DB `stopped`; 11 backstop schedules ENABLED; bootstrap secret count 0; CloudTrail denials only S-1 to S-8 (2 per session run)                                                                                                            | Outputs; Cost Explorer next day                                      | Anything left running; any denial outside the signature                                                                                                                                                                   | `down` again or owner console stop; report                                                                                                                                                             | Whatever is left running         |

### 4.2 Expected AWS resource changes

- **Step 8 creates exactly 11 addresses** (A-13 of the first-session preparation, derived from
  `edge.tf`, `services.tf` and `modules/service`) [V-src]:
  - the ALB;
  - the certificate validation;
  - 2 listeners;
  - 3 fixed-response rules (10, 21, 39);
  - the Identity target group;
  - Identity rules 40 and 50;
  - the `identity` ECS service.

  The workflow refuses any change outside `aws_lb*`, `aws_acm_certificate_validation`,
  `aws_ecs_service` and `aws_service_discovery_service`, and any network-placement change.

- **Out-of-band changes** (not Terraform):
  - the database start (by `up`);
  - 5 one-off ECS tasks (steps 10, 11, 13, 14, 15);
  - one ECS deployment (step 17);
  - the temporary bootstrap secret (created at step 12, deleted at step 16);
  - one Cloudflare record.
- **Anything else is unexpected AWS resource creation, and a stop.**

## 5. Exact commands and workflow inputs (parts B and C)

All names below were checked against `main` today [V-src]:

| Item                           | Value                                                                                                                                                                                                           | Source                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Cluster                        | `munaxa-nonprod`                                                                                                                                                                                                | `local.prefix`                                                                   |
| ECS service                    | `identity` (not `munaxa-nonprod-identity`, F-2)                                                                                                                                                                 | `modules/service/main.tf:339` (`name = var.name`)                                |
| Task-definition families       | `munaxa-nonprod-db-admin`, `-identity`, `-identity-migrate`, `-identity-bootstrap`; one ACTIVE revision each (`:1`, P-3)                                                                                        | `ops.tf:106`, `ops.tf:253`, `modules/service` `family = local.id`                |
| Container names                | `db-admin`, `identity` and `valkey`, `identity-migrate`, `identity-bootstrap`                                                                                                                                   | `ops.tf:120`, `services.tf:106`, `ops.tf:267`                                    |
| Log groups and stream prefixes | `/munaxa/nonprod/ops` (`db-admin`, `identity-bootstrap`); `/munaxa/nonprod/identity` (`identity`, `valkey`); `/munaxa/nonprod/identity-migrate` (`identity-migrate`). Stream = `<prefix>/<container>/<task id>` | `ops.tf:150-152`, `ops.tf:286`, `services.tf:161`, `modules/service/main.tf:241` |
| Security groups                | `munaxa-nonprod-db-admin` (db-admin and bootstrap), `munaxa-nonprod-identity-migrate`, `munaxa-nonprod-identity` (service)                                                                                      | `ops.tf:23`, `modules/service` `name = local.id`                                 |
| Target group                   | `munaxa-nonprod-identity`; health check `/api/auth/health/ready`, matcher 200-399                                                                                                                               | `modules/service/main.tf:263`, `services.tf`                                     |
| ALB                            | `munaxa-nonprod`; HTTP 80 → 301 to 443; HTTPS 443 `ELBSecurityPolicy-TLS13-1-2-2021-06`; default 404                                                                                                            | `edge.tf:70`, `edge.tf:91-118`                                                   |
| Hosts                          | `id.test.munaxa.com` (rule 40); operator `operator-test.munaxa.com` refused by rule 39                                                                                                                          | `envs/nonprod.tfvars`, `edge.tf:177`                                             |
| Pinned secret versions         | `identity` `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a`; `identity-migrate` `a3cc6622-df66-4787-bae7-83ccfec56ff4`                                                                                                    | `envs/nonprod.tfvars:83-84`                                                      |
| Signing kid                    | `identity-nonprod-2026-11`                                                                                                                                                                                      | `envs/nonprod.tfvars:77`                                                         |

### 5.1 Step 8: dispatch `up` (owner only, after A-1)

Use either:

- **GitHub UI:** Actions → **AWS Testing session** → Run workflow → Branch **`main`** → `session` =
  **`up`** → Run workflow.
- **CLI:** `gh workflow run aws-session.yml -R munaxa/munaxa-platform --ref main -f session=up`

What the job does, in order [V-src]:

1. Assumes the CI role, then the session deployer.
2. Checks that the state object exists.
3. Plans `edge_enabled=true` and `services_enabled=true`.
4. Refuses unexpected types and network placement.
5. **Starts the database and waits for `available`.** This is the database startup step. The
   readiness wait is `aws rds wait db-instance-available`, inside the job's 50-minute timeout.
6. Applies.
7. On failure or cancellation, stops the database.

The apply output and `alb_dns_name` are not printed (F-4). A green run does not prove the service
is healthy (F-5).

Expect two `s3:ListTagsForResource` implicit denials from this run, matching S-1 to S-8.

### 5.2 CloudShell setup (once per tab, after step 8)

```bash
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1
C=munaxa-nonprod
[ "$(aws sts get-caller-identity --query Account --output text)" = 229251310592 ] || echo "WRONG ACCOUNT: STOP"
SUBNETS=$(aws ec2 describe-subnets --filters Name=tag:Name,Values=$C-public-a,$C-public-b \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG_DBADMIN=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$C-db-admin \
  --query 'SecurityGroups[0].GroupId' --output text)
SG_MIGRATE=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$C-identity-migrate \
  --query 'SecurityGroups[0].GroupId' --output text)
echo "subnets=$SUBNETS db_admin=$SG_DBADMIN migrate=$SG_MIGRATE"   # two subnet ids, two sg ids; no "None"

# Runs one task, waits for it to stop, prints exit code and stop reason. Never pass a secret in $3.
run_one() { # run_one <task-definition> <security-group> [overrides-json]
  local args=(--cluster "$C" --launch-type FARGATE --count 1 --task-definition "$1"
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$2],assignPublicIp=ENABLED}"
    --started-by first-identity-session --query 'tasks[0].taskArn' --output text)
  [ -n "${3:-}" ] && args+=(--overrides "$3")
  TASK=$(aws ecs run-task "${args[@]}") || { echo "run-task refused: STOP"; return 1; }
  echo "task ${TASK##*/} started"; aws ecs wait tasks-stopped --cluster "$C" --tasks "$TASK"
  aws ecs describe-tasks --cluster "$C" --tasks "$TASK" --query \
    'tasks[0].{stopCode:stopCode,stoppedReason:stoppedReason,exitCode:containers[0].exitCode,containerReason:containers[0].reason}' --output table
}
```

**Network and security-group validation.** The lookups must print two subnet ids and two group
ids, with no `None`. `assignPublicIp=ENABLED` is required, because the subnets are public and there
is no NAT. The security-group set and its rules were compared with code by P-13 (PASS).

**Secrets and configuration checks.** No secret value is read at any point. The secret references
were checked by P-4 and P-5. Steps 8, 10 and 11 prove the referenced versions work at run time.

### 5.3 Step 8 verification

```bash
aws rds describe-db-instances --db-instance-identifier $C-pg --query 'DBInstances[0].DBInstanceStatus' --output text
aws elbv2 describe-load-balancers --names $C --query 'LoadBalancers[0].[DNSName,State.Code,Scheme]' --output text
aws elbv2 describe-listeners --load-balancer-arn $(aws elbv2 describe-load-balancers --names $C --query 'LoadBalancers[0].LoadBalancerArn' --output text) --query 'Listeners[].[Port,Protocol]' --output text
aws ecs describe-services --cluster $C --services identity --query 'services[0].{status:status,desired:desiredCount,running:runningCount,deployments:deployments[].{state:rolloutState,reason:rolloutStateReason,failed:failedTasks}}'
T=$(aws ecs list-tasks --cluster $C --service-name identity --desired-status STOPPED --query 'taskArns[0]' --output text)
[ "$T" != None ] && aws ecs describe-tasks --cluster $C --tasks $T --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason,containers:containers[].{n:name,exit:exitCode,health:healthStatus,r:reason}}'
aws logs tail /munaxa/nonprod/identity --since 30m --format short | tail -40
```

### 5.4 Step 9: DNS (Cloudflare, owner)

```bash
aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].DNSName' --output text
```

In zone `munaxa.com`, create or update one record: type `CNAME`, name `id.test`, target the DNS
name above, proxy status **DNS only**, TTL Auto. Create no record for `work.test`,
`control-api.test` or `operator-test`. Verify with `getent hosts id.test.munaxa.com`. The ALB name
changes every session, so the record is updated every session.

### 5.5 Steps 10 and 11: database bootstrap and migration

```bash
run_one $C-db-admin:1 "$SG_DBADMIN"
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix db-admin/db-admin/${TASK##*/} --since 30m --format short

run_one $C-identity-migrate:1 "$SG_MIGRATE"
aws logs tail /munaxa/nonprod/identity-migrate --log-stream-name-prefix identity-migrate/identity-migrate/${TASK##*/} --since 30m --format short
```

**Migration verification:**

- exit 0 and the final line `All migrations have been successfully applied.`;
- step 18's `ready` probe then confirms the 8 required tables.

### 5.6 Steps 12 to 16: bootstrap and bootstrap-secret handling

```bash
# 12 (after the owner creates the secret in the console, guide C): metadata only
aws secretsmanager describe-secret --secret-id munaxa-nonprod/identity-bootstrap --query '[Name,KmsKeyId,length(VersionIdsToStages)]'

# 13
run_one $C-identity-bootstrap:1 "$SG_DBADMIN"
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short
# 14
run_one $C-identity-bootstrap:1 "$SG_DBADMIN" '{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/seed-control-roles.mjs","--organisation","munaxa-group"]}]}'
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short
# 15
run_one $C-identity-bootstrap:1 "$SG_DBADMIN" '{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/bootstrap-account.mjs","--organisation","munaxa-group","--role","control-operator-admin"]}]}'
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short

# 16 (only after 13, 14 and 15 each exited 0; also on any failure, before down)
aws secretsmanager delete-secret --secret-id munaxa-nonprod/identity-bootstrap --force-delete-without-recovery
aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/identity-bootstrap --query 'length(SecretList)'   # 0
```

- The overrides carry only commands, never a secret.
- The bootstrap task injects the bootstrap secret on every run (`ops.tf:278-279`), so the secret
  must exist for all three runs (F-9).
- Do not paste step 13's `Created <address>` line into any report.

### 5.7 Step 17: ECS deployment, load balancer and target-group health

```bash
aws ecs update-service --cluster $C --service identity --force-new-deployment --query 'service.deployments[0].[id,rolloutState]' --output text
aws ecs wait services-stable --cluster $C --services identity && echo STABLE
aws ecs describe-services --cluster $C --services identity --query 'services[0].{running:runningCount,desired:desiredCount,deployments:deployments[].{state:rolloutState,running:runningCount}}'
TG=$(aws elbv2 describe-target-groups --names $C-identity --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn $TG --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
T=$(aws ecs list-tasks --cluster $C --service-name identity --desired-status RUNNING --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster $C --tasks $T --query 'tasks[0].containers[].[name,lastStatus,healthStatus]' --output text
```

The target group checks `/api/auth/health/ready`, so a `healthy` target already means the
database, schema, cache and signing probes pass.

### 5.8 TLS and DNS (step 21)

```bash
ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='*.test.munaxa.com'].CertificateArn" --output text)
aws acm describe-certificate --certificate-arn $ARN --query 'Certificate.[Status,NotAfter,InUseBy]'
aws elbv2 describe-listeners --load-balancer-arn $(aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].LoadBalancerArn' --output text) --query 'Listeners[?Port==`443`].[SslPolicy,Certificates[0].CertificateArn]' --output text
echo | openssl s_client -connect id.test.munaxa.com:443 -servername id.test.munaxa.com 2>/dev/null | openssl x509 -noout -subject -issuer -enddate -ext subjectAltName
```

### 5.9 Step 22: dispatch `down` (owner)

Use either:

- **GitHub UI:** Actions → **AWS Testing session** → Run workflow → Branch `main` → `session` =
  **`down`**.
- **CLI:** `gh workflow run aws-session.yml -R munaxa/munaxa-platform --ref main -f session=down`

What `down` does:

- the separate "Stop the database" job stops the database first;
- "Testing down" plans both switches false and applies;
- it then stops the database again.

Expect two more S-1 to S-8 denials from this run.

## 6. Application and security tests (part D)

Each test was checked against the Identity source at `5277d71` [V-src]. Routes exist only under
`/api/auth`:

- `GET /login`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /session`;
- `GET /health/live`, `GET /health/ready`.

### 6.1 Coverage of the requested tests

| Requested test                      | Implemented in Identity?                                                                                                                                                                   | Covered by                                                                                   | Notes                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Identity service health             | Yes: `health.controller.ts` (`live`; `ready` with database, schema, cache and signing probes)                                                                                              | Step 18; step 17 target health                                                               | `ready` 503 body names the failed dependency                                                                   |
| Login                               | Yes: `POST /api/auth/login`, JSON `{identifier, password, organisation}`. The token is set only as an httpOnly cookie, never in a body                                                     | Step 19                                                                                      | `Origin: https://id.test.munaxa.com` is required: origin checking is the CSRF defence (`CSRF_TRUSTED_ORIGINS`) |
| Token issuance and validation       | Yes: ES256 access token in the session cookie                                                                                                                                              | Step 19, `verify-identity-jwt.mjs` (alg, kid, signature, iss, aud, exp, iat, 900 s lifetime) | Signature `FAIL` = key pair mismatch, a hard stop                                                              |
| Refresh-token behaviour             | **Yes:** `POST /api/auth/refresh` with cookie `__Secure-mx_refresh` (path `/api/auth/refresh`); rotates cookies; a failed refresh clears them                                              | **Step 19b (added here)**                                                                    | Not in the earlier runbook                                                                                     |
| Invalid credentials                 | Yes: `401 {"code":"AUTH_INVALID_CREDENTIALS"}`, identical for unknown user, wrong password and unknown organisation                                                                        | Step 19 (one wrong attempt only, because of lockout counters)                                | —                                                                                                              |
| Unauthorized access                 | Identity has no protected resource route. Unauthenticated `GET /api/auth/session` answers `{"signedIn":false}`; `POST /api/auth/refresh` without a cookie answers 401                      | Step 19 (session without cookie), step 19b (refresh after logout)                            | Edge refusals: operator host 403, `control-api` admin 403, unknown host 404 (step 20)                          |
| Database connectivity               | Yes: `ready` runs `select 1` and checks the 8 tables                                                                                                                                       | Steps 17 and 18                                                                              | Also proven by steps 10 and 11 exit 0                                                                          |
| MFA                                 | **Not available.** Login returns `401 AUTH_MFA_REQUIRED` for an account with `mfaEnrolled`, but no enrolment or verification route exists. Sessions are created with `mfaSatisfied: false` | **No test: unsupported**                                                                     | Section 8.2                                                                                                    |
| Password reset                      | **Not available.** `PrismaResetTokenStore` exists, but no HTTP route exposes reset                                                                                                         | **No test: unsupported**                                                                     | Section 8.2                                                                                                    |
| Logging and sensitive-data exposure | Pino JSON logs, with redaction of authorization and cookie headers, set-cookie, `password`, `identifier`, tokens, `privateKey`, `passwordHash` (`observability/logger.ts`)                 | **Step 19c (added here)**                                                                    | Bootstrap prints the operator email (section 8.3)                                                              |

### 6.2 Step 18: health

```bash
curl -sS -o /dev/null -w 'live %{http_code}\n' https://id.test.munaxa.com/api/auth/health/live
curl -sS -w '\nready %{http_code}\n' https://id.test.munaxa.com/api/auth/health/ready
```

### 6.3 Step 19: login, wrong password, unauthenticated session, JWT

The password is typed at a hidden prompt. It is never put in a command line or a file.

```bash
read -r -p 'operator email: ' ID; read -r -s -p 'password: ' PW; echo
export ID PW
jq -n '{identifier: env.ID, password: env.PW, organisation: "munaxa-group"}' | \
  curl -sS -c /tmp/id.jar -o /dev/null -w 'login %{http_code}\n' -H 'Content-Type: application/json' \
  -H 'Origin: https://id.test.munaxa.com' --data @- https://id.test.munaxa.com/api/auth/login
# One wrong attempt only (lockout counters):
PW="${PW}x" jq -n '{identifier: env.ID, password: env.PW, organisation: "munaxa-group"}' | \
  curl -sS -w '\nwrong-password %{http_code}\n' -H 'Content-Type: application/json' \
  -H 'Origin: https://id.test.munaxa.com' --data @- https://id.test.munaxa.com/api/auth/login
unset PW
# Unauthenticated vs authenticated session (added here):
curl -sS -w '\nsession-anon %{http_code}\n' https://id.test.munaxa.com/api/auth/session          # {"signedIn":false} 200
curl -sS -b /tmp/id.jar -o /dev/null -w 'session-auth %{http_code}\n' https://id.test.munaxa.com/api/auth/session   # 200, signedIn true (body not printed)
# JWT verification (from main, hash-checked):
export TOKEN=$(awk '$6 !~ /refresh/ && $7 ~ /^eyJ/ {print $7}' /tmp/id.jar | head -1)
curl -sSfLO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-first-session-preparation/supporting/verify-identity-jwt.mjs
echo "bf5e88f2a933439fe8ced20269f26934cbeaa7a614b46637f6101020e63db9cf  verify-identity-jwt.mjs" | sha256sum -c - && node verify-identity-jwt.mjs
unset TOKEN
```

The `sha256sum -c` form refuses to run the script on a mismatch. The earlier preparation printed
the hash for comparison by eye.

### 6.4 Step 19b: refresh and logout (added here)

> **Corrected 11 Nov, after merge (PR #86).** The refresh body must name the organisation. Identity
> resolves the tenant from `organisation` or `IDENTITY_DEFAULT_ORGANISATION`, which is empty in
> Config A1 (`auth.service.ts` lines 103 to 106, `attemptRefresh` line 177). The original `{}` body
> would have answered 401 for a valid cookie: a false H-12 stop.

```bash
curl -sS -b /tmp/id.jar -c /tmp/id.jar -o /dev/null -w 'refresh %{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://id.test.munaxa.com' --data '{"organisation":"munaxa-group"}' \
  https://id.test.munaxa.com/api/auth/refresh                                          # 200
cp /tmp/id.jar /tmp/id.before-logout
curl -sS -b /tmp/id.jar -c /tmp/id.jar -o /dev/null -w 'logout %{http_code}\n' -X POST \
  -H 'Origin: https://id.test.munaxa.com' https://id.test.munaxa.com/api/auth/logout  # 200
curl -sS -b /tmp/id.before-logout -o /dev/null -w 'refresh-after-logout %{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -H 'Origin: https://id.test.munaxa.com' --data '{"organisation":"munaxa-group"}' \
  https://id.test.munaxa.com/api/auth/refresh                                          # expected 401
rm -f /tmp/id.jar /tmp/id.before-logout verify-identity-jwt.mjs; unset ID
```

- **Verified from source:**
  - the refresh route, its cookie name and path;
  - logout revokes the session by its `sid` and always answers 200;
  - refresh without a valid cookie answers 401.
- **NOT VERIFIED:** that a pre-logout refresh token is refused after logout. That depends on the
  security stack's session validation, which was not traced to the end.
- **Treat `refresh-after-logout 200` as a stop and a security finding to report.**

### 6.5 Step 19c: logs carry no secret (added here)

```bash
aws logs filter-log-events --log-group-name /munaxa/nonprod/identity --start-time $(( $(date -d '-3 hours' +%s) * 1000 )) \
  --filter-pattern '%eyJ|PRIVATE\sKEY|[Pp]assword\x5c?\x22\s*:\s*\x5c?\x22[^\x22\x5c\[]%' --query 'length(events)'     # 0
```

- **Expected:** `0`. That means no JWT, no private-key PEM line and no unredacted password field
  in the service logs.
- The pattern is a single CloudWatch Logs regular expression. It was tested on 47 synthetic lines
  with `TestMetricFilter`, and all 47 were classified correctly. It has **not** been run on live
  logs. Details and limits:
  `2026-11-11-identity-claude-executed-deployment-plan/02-LOG-FILTER-CORRECTION.md`.
- **`FilterLogEvents` verified (11 Nov 2026, 09:45 UTC):**
  - the exact pattern above was accepted on a temporary synthetic log group;
  - it returned the expected 24 of 47 synthetic lines as a count only;
  - the group was deleted afterwards.
    A broken pattern gives `InvalidParameterException`. Any error from this command is a stop
    (H-17), never a 0. The known limits L-F1 to L-F10 and L-FV1 to L-FV3 are listed in section 4
    and section 6 of that file.
- **Correction (11 Nov 2026, PR #87):** the first pattern was
  `?eyJ ?BEGIN ?PRIVATE ?"password\":\""`. It missed `"password": "…"` written with a space
  (F-1). It also counted redacted password values and public-key or certificate PEM headers (F-2),
  which would have caused false stops.
- A non-zero count is a stop. Report the count and the field names only, never the line contents.

### 6.6 Step 20: access restrictions

```bash
ALB=$(aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].DNSName' --output text)
IP=$(getent ahostsv4 "$ALB" | awk 'NR==1{print $1}')
curl -sS -o /dev/null -w 'operator /api/auth %{http_code}\n' --resolve operator-test.munaxa.com:443:$IP https://operator-test.munaxa.com/api/auth/health/live
curl -sS -o /dev/null -w 'operator / %{http_code}\n'         --resolve operator-test.munaxa.com:443:$IP https://operator-test.munaxa.com/
curl -sS -o /dev/null -w 'control-api admin %{http_code}\n'  --resolve control-api.test.munaxa.com:443:$IP https://control-api.test.munaxa.com/api/v1/admin/x
curl -sSk -o /dev/null -w 'wrong host %{http_code}\n' -H 'Host: unknown.test.munaxa.com' "https://$ALB/"
curl -sS -o /dev/null -w 'http %{http_code} -> %{redirect_url}\n' http://id.test.munaxa.com/api/auth/health/live
```

The expected values match `edge.tf` [V-src]:

- rule 39: operator host `403`;
- rule 10: `control-api` `/api/v1/admin/*` `403`;
- default action: `404`;
- port 80: `301` to 443.

## 7. Stop conditions and recovery

**Hard stops: never continue after one of these.**

| #    | Condition                                                                                                                           | Where                                                    | Recovery                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| H-1  | Any `AccessDenied` other than the S-1 to S-8 `s3:ListTagsForResource` signature                                                     | Step 8, any CloudShell call, step 22, step 23 CloudTrail | `down`. Decode as root (owner). Compare with `bootstrap/iam_session.tf`. Report. **No IAM change in the session**                         |
| H-2  | Session plan refused ("changes more than the session" or "network placement")                                                       | Step 8                                                   | Nothing changed and the DB was not started. Report the addresses                                                                          |
| H-3  | Unexpected Terraform plan: anything other than 11 creates on `up`, or 11 deletes on `down`                                          | Steps 8 and 22                                           | Stop. On `up`, the workflow refuses unexpected types itself. A count mismatch within the allowed types is still a stop: `down` and report |
| H-4  | Database not `available` within the job, or a DB connectivity failure (`P1001`, `ready` 503 `database`)                             | Steps 8, 10, 11, 18                                      | `down`                                                                                                                                    |
| H-5  | Migration failure (non-zero, `P1000`/`P1001`, not "All migrations…")                                                                | Step 11                                                  | `down`. No fix-forward                                                                                                                    |
| H-6  | Bootstrap failure (non-zero; `ResourceInitializationError` on the bootstrap secret)                                                 | Steps 13 to 15                                           | **Step 16 first**, then `down`. Partial ARN: fix by PR                                                                                    |
| H-7  | `CannotPullContainerError`                                                                                                          | Steps 8, 10, 11, 13                                      | `down`. Compare with P-10                                                                                                                 |
| H-8  | `ResourceInitializationError` (version id, KMS)                                                                                     | Steps 8, 10, 11                                          | `down`. Check P-5. Fix by PR                                                                                                              |
| H-9  | Identity exits with a configuration error (not a database error) at step 8                                                          | Step 8                                                   | `down`. Owner regenerates the bundle (guide A/B); new version id by PR                                                                    |
| H-10 | Service not stable in 15 minutes, or target unhealthy                                                                               | Step 17                                                  | Collect stopped reasons and logs; `down`                                                                                                  |
| H-11 | TLS failure (certificate error, wrong ARN, not ISSUED) or DNS not resolving to the ALB                                              | Steps 9, 21                                              | DNS: correct the record. TLS: `down` and report                                                                                           |
| H-12 | Any JWT `FAIL`; login 401 with the right password; old refresh token accepted after logout                                          | Steps 19, 19b                                            | `down`. Do not configure any product with this key                                                                                        |
| H-13 | Operator host reachable (not 403)                                                                                                   | Step 20                                                  | `down` immediately                                                                                                                        |
| H-14 | Any AWS resource created outside section 4.2                                                                                        | Any                                                      | `down`; report; owner removes it after review                                                                                             |
| H-15 | **Time:** 3 hours after the `up` dispatch, or 18:30 UTC, whichever comes first                                                      | Any                                                      | Delete the bootstrap secret if it exists; `down` now                                                                                      |
| H-16 | **Cost:** any sign that the session will exceed US$0.35 (for example a second ALB, a NAT gateway, a larger task or another service) | Any                                                      | `down` now; report                                                                                                                        |
| H-17 | Secret value shown in a command, log or output                                                                                      | Any                                                      | Stop; `down`; the owner rotates that secret by the guide; report without the value                                                        |

Every fix is a reviewed PR and its own apply, with the session down. Do not edit task
definitions, IAM, security groups or secrets by hand during the session.

## 8. Security verification

### 8.1 Controls exercised by the session

- **Identity and dispatch.**
  - Main-only jobs and OIDC trust.
  - The session deployer's create path is exercised for the first time; any `AccessDenied` is a
    stop.
  - Human dispatch is owner-only. SC-1 (GitHub Apps) is unverified by owner choice.
- **Secrets.**
  - Version-pinned references are proven at run time by steps 8, 10 and 11.
  - The bootstrap secret lives only from step 12 to step 16, and step 23 confirms the count is 0.
  - No secret is put in `--overrides` or on a command line.
- **Key pair.** Step 19's JWT `PASS` proves that the private key in `munaxa-nonprod/identity` and
  the committed public key are a pair.
- **Edge.**
  - The operator host is closed (rule 39).
  - The Control admin path is refused (rule 10).
  - Unknown hosts get 404.
  - HTTP redirects to HTTPS.
  - TLS 1.3/1.2 policy.
- **Sessions.** Refresh rotates the cookies, and logout revokes the session (19b).
- **Logs.** Redaction is in code; step 19c spot-checks it.

### 8.2 Unsupported features (no test, recorded as limitations)

- **MFA:** cannot be enrolled or completed in this build. An MFA-enrolled account would be refused
  with `AUTH_MFA_REQUIRED`. The operator account created by bootstrap is password-only.
- **Password reset:** no route. A lost operator password is recovered by a reviewed bootstrap
  procedure, not by self-service.

### 8.3 Logging observation

`bootstrap-account.mjs` writes `Created <email> in organisation <slug>.` to stdout
(`apps/api/scripts/bootstrap-account.mjs:165`). That line reaches `/munaxa/nonprod/ops`, which keeps
it for 14 days.

- It is personal data, not a credential.
- Record only the public ids in reports.
- Changing the script is an Identity code change and is not proposed here.

## 9. Cost and time controls

From list prices [R] (first-session preparation §8). This is not a billing measurement.

| Item                                                      | Per hour                |
| --------------------------------------------------------- | ----------------------- |
| Fargate Identity task, 0.5 vCPU / 1 GB (Valkey inside it) | about US$0.028          |
| ALB (2 subnets) plus minimal LCU                          | about US$0.027 to 0.035 |
| Public IPv4: 1 task and 2 ALB addresses                   | about US$0.015          |
| RDS db.t4g.micro while running                            | about US$0.019          |
| **Total**                                                 | **about US$0.10**       |

| Duration                              | Estimate                                    |
| ------------------------------------- | ------------------------------------------- |
| Planned 2 h                           | about **US$0.20**                           |
| **Hard stop at 3 h**                  | about **US$0.30 to 0.35** (ceiling US$0.35) |
| One-off tasks (5 tasks, minutes each) | under US$0.02                               |
| Bootstrap secret (hours)              | under US$0.01                               |

**Time plan:**

| Phase                   | Time                |
| ----------------------- | ------------------- |
| Database start and `up` | about 15 minutes    |
| Tasks (steps 10 to 17)  | about 30 minutes    |
| Checks (steps 18 to 21) | about 30 minutes    |
| Buffer                  | the rest of 2 hours |

**Shutdown layers:**

1. Explicit `down` (step 22), by 18:30 UTC and in any case at the 3-hour hard stop.
2. The scheduled `down` (19:17 and 01:47 UTC, often late).
3. The AWS backstop at 21:00 UTC: database stop and service at 0. It cannot delete the ALB, which
   costs about US$0.04 an hour until the next `down`.

**Concurrency.** A pending `aws-terraform.yml` nonprod run holds `aws-terraform-nonprod` and would
delay `up` or `down` (F-10). A-4 confirms that none is pending.

## 10. Shutdown and post-session verification (part E)

1. **Evidence collected:** every row of the section 4.1 evidence column, with UTC times, in a new
   report folder (suggested `2026-11-11-identity-first-session-execution/`), plus its index line.
2. **Bootstrap secret deleted:** count `0` (step 16).
3. **Stop Identity ECS and the database:** dispatch `down` (step 22), then wait for both jobs to be
   green.
4. **Shutdown evidence (step 23)**, read-only, by the owner or under a separate read authorization:

```bash
aws elbv2 describe-load-balancers --query 'length(LoadBalancers)'                       # 0
aws ecs list-services --cluster munaxa-nonprod --query 'length(serviceArns)'            # 0
aws ecs list-tasks --cluster munaxa-nonprod --query 'length(taskArns)'                  # 0
aws rds describe-db-instances --db-instance-identifier munaxa-nonprod-pg --query 'DBInstances[0].DBInstanceStatus' --output text   # stopped
aws ec2 describe-addresses --query 'length(Addresses)'                                  # 0
aws ec2 describe-network-interfaces --filters Name=association.public-ip,Values='*' --query 'length(NetworkInterfaces)'  # 0
aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'length(NatGateways)'                   # 0
aws scheduler list-schedules --name-prefix munaxa-nonprod-backstop --query 'length(Schedules[?State==`ENABLED`])'           # 11
aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/identity-bootstrap --query 'length(SecretList)'   # 0
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-first-session-preparation/supporting/cloudtrail-denials.py
echo "0669df65de48088855ac71b10024496f6fe9e555cc79d01262890731be1b7589  cloudtrail-denials.py" | sha256sum -c - && \
for r in eu-central-1 us-east-1; do
  aws cloudtrail lookup-events --region $r --start-time <up dispatch time, UTC> --output json | python3 -I cloudtrail-denials.py
done
```

5. **Backstop verified:** 11 schedules ENABLED.
6. **No unexpected running resources:** all the counts above.
7. **Denials:**
   - expect 4: 2 from `up` and 2 from `down`, each meeting S-1 to S-8 (readiness status §6);
   - any other denial is reported;
   - the raw result is recorded verbatim.
8. **Time and cost:**
   - record the `up` dispatch time and the `down` completion time (must be 3 hours or less);
   - owner checks Cost Explorer the next day, filtered by `Environment = nonprod` and unfiltered;
   - must be US$0.35 or less for the session.
9. **DNS:** the `id.test` record now points at a deleted ALB. Leave it, or remove it. The next
   session updates it either way (DNS-H1).

## 11. Outstanding limitations

| #    | Limitation                                                                                                           | Effect                                          | Treatment                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| L-1  | Raw 07:01 preflight output not in the repository (owner supplied it in the project conversation; not recreated here) | Repository evidence incomplete                  | Owner adds the file if wanted. Not a blocker |
| SC-1 | Installed GitHub Apps not verified, by owner choice                                                                  | An app with Actions write could dispatch        | Accepted by the owner; recorded              |
| L-2  | Session-deployer effective permissions not exercised                                                                 | First `up` may fail with `AccessDenied`         | H-1                                          |
| L-3  | Secret versions, key pair, bootstrap partial ARN unproven                                                            | Possible stop at step 8, 10, 11, 13 or 19       | H-6, H-8, H-12                               |
| L-4  | G-4 rests on owner evidence                                                                                          | —                                               | Recorded                                     |
| L-5  | Administrator bypass enabled                                                                                         | Low; main-only job guards and OIDC trust remain | Recorded                                     |
| L-6  | Evidence recency: the preflight is valid for today only, if nothing changes                                          | Stale evidence                                  | A-3                                          |
| L-7  | DNS is a manual Cloudflare change                                                                                    | Operator error possible                         | Step 9 evidence                              |
| L-8  | MFA and password reset not implemented                                                                               | Not testable; operator account is password-only | Section 8.2                                  |
| L-9  | Old-refresh-after-logout result and the step 19c log filter are NOT VERIFIED from source                             | First observation is in the session             | H-12; H-17                                   |
| L-10 | Operator email in `/munaxa/nonprod/ops` for 14 days                                                                  | Personal data in logs                           | Section 8.3                                  |
| L-11 | Root used for the read-only preflight and for CloudShell steps 10 to 23                                              | Broad identity                                  | ACCESS-POLICY owner decision                 |

## 12. Final recommendation

**READY FOR OWNER EXECUTION.**

**Why:**

- every command and input is taken from code on `main` and checked today;
- nothing the readiness assessment depended on has changed;
- every step has an expected result, evidence, a hard-stop condition and a recovery;
- unsupported tests are identified, not assumed.

**Conditions:**

- the owner's written authorization (A-1), with a start time no later than 15:30 UTC;
- a fresh preflight if the session is not today, or if anything in L-6 happens first.

**This is not deployment authorization.** Nothing in this document permits any of these:

- dispatching `aws-session.yml`;
- starting the database or ECS;
- running migrations or bootstrap;
- touching secrets;
- changing DNS.

## 13. What was done for this document

**Read:**

- the merged reports;
- `aws-session.yml`;
- `infra/aws/stack/{edge,services,ops}.tf` and `infra/aws/modules/service/main.tf`;
- `envs/nonprod.tfvars`;
- the Identity source at `5277d71`:
  - `auth/auth.controller.ts`, `auth/auth.service.ts`, `auth/cookies.ts`;
  - `health/health.controller.ts`;
  - `observability/logger.ts`;
  - `packages/config/src/environment.ts`;
  - `scripts/bootstrap-account.mjs`.

**Checked:**

- GitHub run lists for `aws-session.yml` and `aws-terraform.yml`;
- open PRs.

**Not done:**

- no AWS API call and no connector use;
- no workflow dispatch, `up` or `down`;
- no RDS or ECS action;
- no migration or bootstrap;
- no secret read, created or deleted;
- no Terraform;
- no IAM, GitHub setting, variable, DNS or infrastructure change;
- no GitHub App inspection;
- no merge.

The only change is this document and its README index line, in a documentation-only PR.
