# First Identity-only Testing session: preparation (runbook steps 8 to 23)

> **Cost correction, 11 Nov 2026 (PR #95 finding X-6).** Every US$0.35 figure in this report is a
> conditional ceiling, not a guarantee. It holds only while Claude's session and the AWS connector
> stay available and `down` runs by T0 + 3 h. If Claude loses control: about US$1.00 when a
> scheduled `down` runs; **no fixed upper limit** (the ALB costs about US$0.89 a day) when both
> scheduled runs are dropped. Current statement: final operator runbook, section 15.

- Date: 10 Nov 2026, from 06:44 UTC
- Repository: `munaxa/munaxa-platform`, `main` at `6050c2f` (PR #74). Environment `nonprod`, account
  `229251310592`, region `eu-central-1`.
- Authoritative procedure: [`02-IDENTITY-ONLY-RUNBOOK.md`](../2026-11-09-identity-config-a1-preparation/02-IDENTITY-ONLY-RUNBOOK.md),
  Phase 2. This report prepares it; where this report corrects the runbook (section 2), the
  correction is marked and the reason is given.
- Starting evidence: [`01-REAL-PLAN-AND-APPLY.md`](../2026-11-10-identity-config-a1-continuation/01-REAL-PLAN-AND-APPLY.md).
- **Preparation only. No AWS call, workflow dispatch, DNS change, ECS task, migration, bootstrap,
  secret, KMS or IAM change, and no merge was made (section 12).**
- **Corrected 10 Nov 2026 (owner review, report
  [`2026-11-10-identity-preflight-and-session-readiness`](../2026-11-10-identity-preflight-and-session-readiness/00-IDENTITY-PREFLIGHT-AND-SESSION-READINESS.md)):**
  - `supporting/verify-identity-jwt.mjs` now also checks the audience and the expiry (with tests);
  - the CloudTrail denial check (P-12, step 23) is replaced by the tested
    `supporting/cloudtrail-denials.py`. The original command undercounted, could report a false
    denial and stopped after 50 events.
  - Original text at `3c836a2`.

Labels:

- **[V-gh]** verified from GitHub evidence (workflow runs, job steps, merged commits), read today.
- **[V-src]** verified from source code on `main` (platform `6050c2f`, identity `5277d71`).
- **[V-doc]** verified against AWS public documentation (not the account).
- **[P]** previously reported, not reverified today.
- **[AWS]** not verifiable without an owner-authorized AWS inspection.

## Verdict

**READY WITH OWNER ACTIONS.**

> Superseded: the later readiness report (`2026-11-10-identity-preflight-and-session-readiness/`)
> lowered this to PARTIALLY READY, OWNER ACTIONS REQUIRED. Kept as written for the audit trail.

The code, task definitions, secret references and workflows on `main` support the session. No
code change is needed. Before step 8 the owner must:

1. authorize and run the preflight read-only check (section 3);
2. accept the two runbook corrections in section 2 (F-1, F-2) as part of the session approval;
3. give the separate session approval, with a start time that leaves the session finished by
   18:30 UTC.

There is no blocker in the repository. Four things are still unproven until the session runs:

- the session deployer's create permissions (`up` has never run, F-3);
- the secret version ids;
- the signing key pair;
- the bootstrap secret's partial ARN.

Each has a stop condition below.

---

## 1. Current verified starting state (Stage A)

| #    | Item                                        | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Label                                                                           |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A-1  | `main`                                      | `6050c2f` (#74), parent `67904bc` (#73, the A1 inputs). No infrastructure change after `67904bc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [V-gh]                                                                          |
| A-2  | Config A1 declaration                       | `infra/aws/stack/envs/nonprod.expected-changes.json`: 22 `create` addresses (4 task definitions, 3 execution roles and 3 inline policies, 2 log groups, 2 security groups, 8 rules including `alb_to_service["identity"]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [V-src]                                                                         |
| A-3  | A1 applied                                  | Plan 42766116306: 22/0/0/0, exact match. Apply 42766582624: saved plan (sha256 `3e0f3b8d…78a4`) applied without error. Post-apply plan 42766964719: "No changes". All three runs `success` on `67904bc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [V-gh]                                                                          |
| A-4  | Identity images                             | `identity_api` `…/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156`. `identity_migrate` `…/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820`. Built from identity `5277d71`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [V-src] tfvars; [P] ECR, 9 Nov 13:10                                            |
| A-5  | Sidecar and client images                   | Valkey `public.ecr.aws/valkey/valkey@sha256:757b7e55…8e8e` (8.1.11 amd64). PostgreSQL client `public.ecr.aws/docker/library/postgres@sha256:5983db9a…c64e` (16.15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [V-src]; [P] manifests                                                          |
| A-6  | Task definitions                            | `munaxa-nonprod-identity` (0.5 vCPU, 1 GB, Identity + Valkey, port 4001). `munaxa-nonprod-identity-migrate` (`prisma migrate deploy` as `identity_owner`). `munaxa-nonprod-identity-bootstrap` (runtime image, default command `bootstrap-account.mjs --organisation munaxa-group --organisation-name "Munaxa Group"`). `munaxa-nonprod-db-admin` (psql 16, `db-bootstrap.sh`, `db_bootstrap_products = ["identity"]`)                                                                                                                                                                                                                                                                                                                                                           | [V-src]                                                                         |
| A-7  | Secret references (version ids, not values) | Identity container: `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` from `munaxa-nonprod/identity` at version `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a`. Valkey: `REDIS_PASSWORD`, same version. Migrate: `DATABASE_MIGRATION_URL` from `munaxa-nonprod/identity-migrate` at `a3cc6622-df66-4787-bae7-83ccfec56ff4`. db-admin: the RDS master secret (`username`, `password`, current version), plus `IDENTITY_APP_URL` and `IDENTITY_OWNER_URL` from the two bundles at the same pinned versions. Bootstrap: `DIRECT_DATABASE_URL` from the migrate bundle at `a3cc6622…`, plus `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` from `arn:…:secret:munaxa-nonprod/identity-bootstrap` (partial ARN, current version) | [V-src]; that the versions exist and are AWSCURRENT: [AWS]                      |
| A-8  | Execution roles                             | Identity: pull `munaxa-identity/api`, write `/munaxa/nonprod/identity`, read only `munaxa-nonprod/identity`, `kms:Decrypt` on the data key via Secrets Manager. Migrate: same pattern on its own image, log group and bundle. Bootstrap: pull `munaxa-identity/api`, read the migrate bundle and `munaxa-nonprod/identity-bootstrap-??????`, decrypt via Secrets Manager, write `/munaxa/nonprod/ops`. db-admin (G3): master secret plus the product URL bundles. No task role: Identity calls no AWS API. All roles carry the workload boundary                                                                                                                                                                                                                                 | [V-src]                                                                         |
| A-9  | `aws-session.yml`                           | `up` order: assume the session deployer, check that the state exists, plan with `edge_enabled` and `services_enabled` true, refuse any change outside `aws_lb*`, `aws_acm_certificate_validation`, `aws_ecs_service` and `aws_service_discovery_service`, refuse any network-placement change, **start the database and wait for `available`**, apply. A failed `up` stops the database again. `down` stops the database in its own job, plans both switches false, applies, stops the database again. Main only; environment `aws-nonprod-session` (no reviewer)                                                                                                                                                                                                                | [V-src]                                                                         |
| A-10 | Session history                             | 17 runs. 15 scheduled, all `down`; the latest was 10 Nov 02:14 UTC on `6496a80`, green. 2 dispatched (5 and 6 Nov), both `down`. **`up` has never run**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [V-gh]                                                                          |
| A-11 | Backstop                                    | `session_backstop_schedule = "cron(0 21 * * ? *)"`: 1 database stop plus 10 `UpdateService desiredCount 0` schedules. The service names match the ECS service names (`identity`, …)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [V-src]; 11 ENABLED, ran 8 Nov 21:00: [P] 9 Nov; live: [AWS]                    |
| A-12 | Identity-only settings                      | `desired_counts` has only `identity = 1`. `images` holds only the two Identity entries. `hosts.identity = id.test.munaxa.com`. `operator_cidrs = []` and `operator_access` unset, so rule 39 refuses the operator host. `identity_signing_kid = identity-nonprod-2026-11`; the committed public key loads as P-256 (checked locally today). `identity_default_organisation = ""`, so the sign-in form asks for the organisation                                                                                                                                                                                                                                                                                                                                                  | [V-src]                                                                         |
| A-13 | Session `up` plan size                      | 11 creates: ALB, certificate validation, 2 listeners, 3 fixed-response rules (10, 21, 39), the Identity target group, Identity rules 40 and 50, the `identity` service. No Cloud Map entry for Identity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [P] mocked plan of 9 Nov; derived again from code [V-src]; real plan: at step 8 |
| A-14 | Database, ECS, ALB, ACM, secrets            | RDS stopped. ECS empty. 0 ALB, NAT, EIP. ACM `*.test.munaxa.com` + `operator-test.munaxa.com` ISSUED, `InUseBy` empty, renewal INELIGIBLE. Version counts of the two bundles: not read since the owner wrote them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [P] 9 Nov; [AWS] now                                                            |
| A-15 | GitHub configuration                        | The `aws-nonprod-session` variables work: the nightly OIDC and deployer steps were green at 02:14 UTC. Settings pages (environments, variables, rulesets on platform) are not readable through this session's proxy. Not changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [V-gh] indirect; settings: owner                                                |

**What is not claimed:** that AWS is healthy now. The only post-apply evidence is Terraform's
"No changes" at 06:13 UTC. The live state is checked in the preflight.

---

## 2. Findings from this review (they change how steps 8 and 17 are read)

**F-1 (high, procedure). Identity cannot be healthy at step 8, so the runbook's step 8 evidence
and stop condition would stop a correct session.**

Identity validates its environment, then Prisma connects at boot (`PrismaService.onModuleInit`
calls `$connect()`). `main.ts` runs `void bootstrap()`, so a failed connect exits the process
[V-src]. At step 8:

- the `identity` database and the `identity_app` role do not exist yet (they come at step 10);
- the tables do not exist (step 11), and `/api/auth/health/ready` checks the 8 required tables.

ECS's circuit breaker counts consecutive tasks that never reach RUNNING, with a minimum threshold
of 3. For a new service there is no `COMPLETED` deployment, so it "does not launch new tasks and
the deployment is stalled" [V-doc: ECS developer guide, "How the deployment circuit breaker
detects failures"].

Corrected reading (no code change):

- **Step 8** proves the edge, the database start and the task start-up path. That path covers
  the image pull, the pinned `identity` bundle version, Valkey reaching HEALTHY (the Identity
  container waits on it) and Identity's environment validation (key format, kid, URLs).
- Identity is then expected to exit with a database error, and the deployment may stall.
- **Step 17** (force new deployment, after the database, migrations and bootstrap exist) is the
  step that must reach 1 RUNNING task and a healthy target.
- Step 8's stop conditions are narrowed to the real failures (section 6).

**F-2 (medium, procedure). The service name in runbook step 17 is wrong.** The ECS service is
named `identity`: `modules/service` names it `var.name`, and the backstop targets `identity` too.
`munaxa-nonprod-identity` is the task definition family and would return
`ServiceNotFoundException`. The corrected command is in section 4. [V-src]

**F-3 (medium, unexercised IAM). `aws-session.yml up` has never run (A-10).** The session deployer
has never created any of these:

- an ALB, a target group, a listener or a rule;
- an ECS service;
- a database start (`rds:StartDBInstance`).

Its policy covers them on `munaxa-nonprod` names [V-src]. It has **no `iam:CreateServiceLinkedRole`**,
so `up` fails with `AccessDenied` if `AWSServiceRoleForECS` or
`AWSServiceRoleForElasticLoadBalancing` is missing. Both very likely exist: the old Docs stack ran
ECS and an ALB in this account, and G3 created the ECS cluster. Not verified [AWS]: preflight item
P-11. Nothing is broadened in advance.

**F-4 (low). `up` does not print the ALB DNS name.** The workflow keeps the apply output out of
the public log, so `alb_dns_name` is not shown. Step 9 reads it in CloudShell (section 4). [V-src]

**F-5 (low). A green `up` run does not prove a healthy service.** `aws_ecs_service` sets no
`wait_for_steady_state`, so the apply ends when the service is created. Health is checked with
`describe-services` and target health. [V-src]

**F-6 (low, documentation).** Two small mismatches in the earlier documents:

- Guide parts C and D cite "runbook step 9" and "step 13". The right steps are **12** (create the
  bootstrap secret) and **16** (delete it).
- The db-admin log line has a `db-bootstrap: ` prefix. The full line is
  `db-bootstrap: identity: database identity, roles identity_owner and identity_app are in place.`

[V-src]

**F-7 (info). `RegisterTaskDefinition` and `PassRole` (I-1, I-2 of the 9 Nov report) are now
exercised.**

- The A1 apply registered 4 task definitions that name the new execution roles, and the
  post-apply plan is clean. That needs both actions, so the main nonprod deployer has done both
  [V-gh, by inference].
- Steps 10 to 17 run as the owner in CloudShell, not as a deployer.
- Still unexercised: the session deployer (F-3), and the execution roles at run time (ECR pull,
  secret read, KMS decrypt, logs).

**F-8 (info). The bootstrap secret's partial ARN.** The task definition names
`arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap:<KEY>::`.

- AWS's own Fargate example uses this form (no 6-character suffix, with a JSON key) [V-doc,
  "Latest updates to AWS Fargate for Amazon ECS"].
- The name's last hyphen is followed by 9 characters (`bootstrap`), so Secrets Manager cannot
  mistake it for a full ARN with a suffix.
- The IAM resource `identity-bootstrap-??????` matches the real ARN.

Residual risk is low. `ResourceInitializationError` at step 13 stays a hard stop.

**F-9 (info). The bootstrap secret must exist for all three bootstrap runs.** The task definition
injects it on every run, so a run without it fails to start. Delete it only after step 15 exits 0.
[V-src]

**F-10 (operational). Two scheduled jobs can end a session.**

- The scheduled `down` (19:17 and 01:47 UTC; GitHub often starts it hours late) takes the session
  down when it runs.
- The AWS backstop stops the database and scales the service to 0 at 21:00 UTC.
- Start in the morning and finish by **18:30 UTC**.
- A pending `aws-terraform.yml` nonprod run waiting for approval holds the
  `aws-terraform-nonprod` concurrency group and would hold `up` behind it.

[V-src]

---

## 3. Session preflight checklist (Stage B)

Run immediately before step 8, on the same day. Read-only.

- The GitHub checks are the owner's: the settings are not readable here.
- The AWS checks can be run either way:
  - by the owner in CloudShell (eu-central-1, signed in as root, per `infra/aws/ACCESS-POLICY.md`);
  - or by Claude through the root connector, if the owner authorizes that read separately.

The commands print metadata only: no secret value, no state object.

### 3.1 GitHub (owner)

| #   | Check                             | Expected                                                                                                                |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| G-1 | `main` head                       | `6050c2f`, or a later docs-only commit; no change under `infra/` since `67904bc`                                        |
| G-2 | Actions → AWS Terraform           | No run waiting for approval or in progress (F-10)                                                                       |
| G-3 | Actions → AWS Testing session     | Latest scheduled run green. If tonight's 19:17 run has already happened, it is the first `down` on A1 and must be green |
| G-4 | Environment `aws-nonprod-session` | Variables `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` present (the `-session` roles); unchanged                       |
| G-5 | Open PRs touching `infra/`        | None merged or pending merge during the session                                                                         |

### 3.2 AWS (read-only, needs authorization)

> **Superseded for execution (10 Nov, after PR #78).** Do not run the commands in this section by
> hand. The AWS preflight now runs as one tested script,
> `2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh`, downloaded
> alone from `main` with its SHA256 checked. The P-12 denial filter is embedded in that script, so
> no separate helper is needed for the preflight. The exact procedure is section 13.8 of
> `2026-11-10-identity-post-merge-preflight-verification/` (it replaces that report's section 10
> after the P-11b/P-13 hardening). The table below is kept as the original description of each
> check; the current checks are in the readiness report's section 5.3. The P-13 row below is out of
> date (the script now checks the whole network topology), and P-11b has no row here.

Run the setup block once per CloudShell tab. The checks follow it.

```bash
export AWS_REGION=eu-central-1 AWS_DEFAULT_REGION=eu-central-1
C=munaxa-nonprod
[ "$(aws sts get-caller-identity --query Account --output text)" = 229251310592 ] && echo "account OK" || echo "WRONG ACCOUNT: STOP"
```

| #    | Check                                          | Command                                                                                                                                                                                                                                                                                                                                                                     | Expected                                                                                                                                                         |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1  | Account and region                             | above, plus `aws configure get region` or `echo $AWS_REGION`                                                                                                                                                                                                                                                                                                                | `229251310592`, `eu-central-1`                                                                                                                                   |
| P-2  | RDS stopped                                    | `aws rds describe-db-instances --db-instance-identifier munaxa-nonprod-pg --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass,PubliclyAccessible,DeletionProtection]' --output text`                                                                                                                                                                                  | `stopped db.t4g.micro False True`                                                                                                                                |
| P-3  | A1 task definitions present, one revision each | `aws ecs list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE --output text`, then `aws ecs list-task-definitions --family-prefix <family> --status ACTIVE --output text` per family (corrected 10 Nov: `list-task-definitions` takes the exact family name, so the bare prefix lists nothing; results review R-1)                                  | Exactly `munaxa-nonprod-db-admin:1`, `-identity:1`, `-identity-bootstrap:1`, `-identity-migrate:1`. If more revisions exist, record them and use `:1` explicitly |
| P-4  | Secret version references, without values      | `for f in identity identity-migrate identity-bootstrap db-admin; do aws ecs describe-task-definition --task-definition $C-$f --query 'taskDefinition.containerDefinitions[].secrets[].valueFrom' --output text \| tr '\t' '\n'; done`                                                                                                                                       | ARNs ending `::ad02f18e-…` (identity), `::a3cc6622-…` (migrate), the master-secret ARN (db-admin), the bootstrap partial ARN. ARNs only, never values            |
| P-5  | Versions exist and are current                 | `for s in identity identity-migrate; do aws secretsmanager list-secret-version-ids --secret-id munaxa-nonprod/$s --query 'Versions[].[VersionId,VersionStages[0]]' --output text; done`                                                                                                                                                                                     | `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a AWSCURRENT` and `a3cc6622-df66-4787-bae7-83ccfec56ff4 AWSCURRENT`. Metadata only (never `get-secret-value`)                |
| P-6  | No leftover bootstrap secret                   | `aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/identity-bootstrap --query 'length(SecretList)'`                                                                                                                                                                                                                                                  | `0`                                                                                                                                                              |
| P-7  | Nothing running                                | `aws ecs list-services --cluster $C --query 'length(serviceArns)'`; `aws ecs list-tasks --cluster $C --query 'length(taskArns)'`; `aws elbv2 describe-load-balancers --query 'length(LoadBalancers)'`; `aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'length(NatGateways)'`; `aws ec2 describe-addresses --query 'length(Addresses)'` | `0` each                                                                                                                                                         |
| P-8  | Backstop enabled                               | `aws scheduler list-schedules --name-prefix munaxa-nonprod-backstop --query 'Schedules[].[Name,State]' --output text`                                                                                                                                                                                                                                                       | 11 lines, all `ENABLED`                                                                                                                                          |
| P-9  | ACM                                            | `ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='*.test.munaxa.com'].CertificateArn" --output text); aws acm describe-certificate --certificate-arn $ARN --query 'Certificate.[Status,NotAfter,SubjectAlternativeNames,InUseBy]'`                                                                                                             | `ISSUED`, about 22 May 2027, SANs `*.test.munaxa.com` and `operator-test.munaxa.com`, `InUseBy` empty. `id.test.munaxa.com` is covered by the wildcard           |
| P-10 | Images exist                                   | `aws ecr describe-images --repository-name munaxa-identity/api --image-ids imageDigest=sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156 --query 'imageDetails[0].imageTags'` (same for `munaxa-identity/migrate` with `sha256:d175ef37…0820`)                                                                                                        | Tags include `5277d71`                                                                                                                                           |
| P-11 | Service-linked roles (F-3)                     | `aws iam get-role --role-name AWSServiceRoleForECS --query Role.Arn`; `aws iam get-role --role-name AWSServiceRoleForElasticLoadBalancing --query Role.Arn`                                                                                                                                                                                                                 | Both exist. If either is missing: **stop**, report; do not create it or broaden IAM without a separate decision                                                  |
| P-12 | No denials since the apply                     | `for r in eu-central-1 us-east-1; do aws cloudtrail lookup-events --region $r --start-time 2026-11-10T06:00:00Z --output json \| python3 -I cloudtrail-denials.py; done` (corrected; script in `supporting/`; since PR #78 the preflight script embeds the same filter)                                                                                                                                                               | `events N denials 0` for both regions                                                                                                                            |
| P-13 | Network names resolve                          | `aws ec2 describe-subnets --filters Name=tag:Name,Values=$C-public-a,$C-public-b --query 'length(Subnets)'`; `aws ec2 describe-security-groups --filters Name=group-name,Values=$C-db-admin,$C-identity-migrate,$C-identity --query 'length(SecurityGroups)'`                                                                                                               | `2` and `3` (outdated: see readiness report §5.3)                                                                                                                |

### 3.3 Session limits (decide before step 8)

| Item             | Value                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Window           | Start no later than **15:30 UTC**. All verification done and `down` dispatched by **18:30 UTC**, ahead of the 19:17 scheduled `down` and the 21:00 backstop (F-10)       |
| Planned duration | **2 hours** (about 15 min database start, about 30 min for tasks, about 30 min for checks, buffer). **Hard stop at 3 hours** after the `up` dispatch, whatever the state |
| Cost limit       | About **US$0.20** expected, **US$0.35** at the hard stop (section 9)                                                                                                     |
| Workflow input   | `aws-session.yml`, branch `main`, `session: up` (step 8); `session: down` (step 22). Nothing else                                                                        |

---

## 4. Exact workflow-dispatch instructions and ECS command sequence (Stage C)

### Common CloudShell setup (after step 8, once per tab)

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

The `run_task_network` Terraform output is not readable without state access. These lookups
resolve the same ids by the names in `network.tf` and `ops.tf`:

- subnets `munaxa-nonprod-public-a` and `-b`;
- `db_admin_group` = `munaxa-nonprod-db-admin`;
- `migrate_groups.identity` = `munaxa-nonprod-identity-migrate`.

`assignPublicIp=ENABLED` is required: public subnets, no NAT.

### Step 8: start the session (owner approval required)

The owner dispatches the session. Either:

- **GitHub UI:** Actions → **AWS Testing session** → Run workflow → Branch `main` → `session` = `up`; or
- **CLI:** `gh workflow run aws-session.yml -R munaxa/munaxa-platform --ref main -f session=up`.

Then, in CloudShell:

```bash
aws rds describe-db-instances --db-instance-identifier $C-pg --query 'DBInstances[0].DBInstanceStatus' --output text
aws elbv2 describe-load-balancers --names $C --query 'LoadBalancers[0].[DNSName,State.Code,Scheme]' --output text
aws elbv2 describe-listeners --load-balancer-arn $(aws elbv2 describe-load-balancers --names $C --query 'LoadBalancers[0].LoadBalancerArn' --output text) --query 'Listeners[].[Port,Protocol]' --output text
aws ecs describe-services --cluster $C --services identity --query 'services[0].{status:status,desired:desiredCount,running:runningCount,deployments:deployments[].{state:rolloutState,reason:rolloutStateReason,failed:failedTasks}}'
T=$(aws ecs list-tasks --cluster $C --service-name identity --desired-status STOPPED --query 'taskArns[0]' --output text)
[ "$T" != None ] && aws ecs describe-tasks --cluster $C --tasks $T --query 'tasks[0].{stopCode:stopCode,reason:stoppedReason,containers:containers[].{n:name,exit:exitCode,health:healthStatus,r:reason}}'
aws logs tail /munaxa/nonprod/identity --since 30m --format short | tail -40
```

**Expected** (corrected, F-1):

- The run is green, and its summary lists only the 11 session addresses (A-13).
- The database is `available`.
- The ALB is `active` and `internet-facing`, with listeners `80 HTTP` and `443 HTTPS`.
- The `identity` service is `ACTIVE` with desired 1.
- The first tasks get past secret injection. Valkey becomes HEALTHY: its log shows
  `Ready to accept connections`, and the Identity container starts at all.
- Then Identity stops with a **database** error (Prisma: authentication failed, or the database
  `identity` does not exist). The deployment may show `FAILED` or stalled after 3 tasks. **That
  is expected; continue to step 9.**

**Stop** (dispatch `down`, read section 6) if any of these:

- the plan check refuses the plan;
- any `AccessDenied` (F-3);
- `CannotPullContainerError`;
- `ResourceInitializationError` (the `identity` version id or KMS);
- Valkey unhealthy;
- Identity exits with an **environment** error (its startup lists configuration problems: key,
  kid, URL) rather than a database error;
- the database is not `available` within the run.

### Step 9: DNS (owner, Cloudflare; prepared only)

```bash
aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].DNSName' --output text
```

In Cloudflare, zone `munaxa.com`, create or update **one** record:

| Type  | Name      | Target                                                                                             | Proxy status              | TTL  |
| ----- | --------- | -------------------------------------------------------------------------------------------------- | ------------------------- | ---- |
| CNAME | `id.test` | the DNS name printed above, for example `munaxa-nonprod-1234567890.eu-central-1.elb.amazonaws.com` | **DNS only** (grey cloud) | Auto |

- No record for `work.test`, `control-api.test` or `operator-test`.
- The ALB name changes with every session, so update this record at every session (DNS-H1).
- **Evidence:** `getent hosts id.test.munaxa.com` (or `nslookup`) resolves to the ALB's addresses.
  Check with `getent ahostsv4 <alb-dns-name>`.

### Step 10: `db-admin`

```bash
run_one $C-db-admin:1 "$SG_DBADMIN"
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix db-admin/db-admin/${TASK##*/} --since 30m --format short
```

- **Expected:** `exitCode 0`, and the log contains:
  `db-bootstrap: control: no bundle values, skipped.` (and the same for work and school), then
  `db-bootstrap: identity: database identity, roles identity_owner and identity_app are in place.`
- **Stop** if:
  - the exit code is not 0;
  - `stopCode TaskFailedToStart` or `ResourceInitializationError` (the version ids or the master
    secret);
  - `... is missing or malformed; nothing was changed for identity.` (bundle content).
- The script prints no password.

### Step 11: `identity-migrate`

```bash
run_one $C-identity-migrate:1 "$SG_MIGRATE"
aws logs tail /munaxa/nonprod/identity-migrate --log-stream-name-prefix identity-migrate/identity-migrate/${TASK##*/} --since 30m --format short
```

- **Expected:** `exitCode 0`; Prisma lists the migrations and ends with
  `All migrations have been successfully applied.`
- **Stop** on any other exit code, or `P1000`/`P1001` (credentials or network).
- The datasource line shows host and database, never the password. Do not paste logs beyond the
  quoted lines.

### Step 12: create the temporary bootstrap secret (owner guide C, corrected step number)

The owner follows [`01-OWNER-INPUT-GUIDE.md` part C](../2026-11-09-identity-config-a1-preparation/01-OWNER-INPUT-GUIDE.md):

1. Password manager entry "Munaxa Testing Identity operator": a dedicated Testing address and a
   32-character generated password.
2. Console, Secrets Manager, "Other type of secret", keys `IDENTITY_OWNER_EMAIL` and
   `IDENTITY_OWNER_PASSWORD`.
3. Encryption key **`alias/munaxa-nonprod-data`**.
4. Name exactly **`munaxa-nonprod/identity-bootstrap`**, no rotation.

**Evidence (metadata only):**

```bash
aws secretsmanager describe-secret --secret-id munaxa-nonprod/identity-bootstrap --query '[Name,KmsKeyId,length(VersionIdsToStages)]'
```

Expect the name, the data key's ARN or alias, and `1`.

### Steps 13 to 15: bootstrap (one task at a time, each must exit 0)

```bash
# 13: default command: create organisation munaxa-group and the operator account
run_one $C-identity-bootstrap:1 "$SG_DBADMIN"
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short

# 14: Control roles in munaxa-group (command override only; no secret)
run_one $C-identity-bootstrap:1 "$SG_DBADMIN" '{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/seed-control-roles.mjs","--organisation","munaxa-group"]}]}'
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short

# 15: assign control-operator-admin (the account exists, so no password is written)
run_one $C-identity-bootstrap:1 "$SG_DBADMIN" '{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/bootstrap-account.mjs","--organisation","munaxa-group","--role","control-operator-admin"]}]}'
aws logs tail /munaxa/nonprod/ops --log-stream-name-prefix identity-bootstrap/identity-bootstrap/${TASK##*/} --since 30m --format short
```

| Step | Expected log                                                                                                                                                                       | Record (public ids only)                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13   | `Created <address> in organisation munaxa-group.` then `organisation <uuid> (munaxa-group)` and `sub <uuid>`                                                                       | organisation id, `sub` (for Config C: `control_operator_organisation_id`, `control_operator_subjects`). **Do not record the address in the report** |
| 14   | One line per role: `<role>: <n> Control grants in organisation munaxa-group.`, then `OPERATOR_ORGANISATION_ID <uuid>` (must equal step 13's organisation) and the restart reminder | `OPERATOR_ORGANISATION_ID`                                                                                                                          |
| 15   | `Already bootstrapped. … No password was written.` then `Assigned control-operator-admin, unscoped.` and the same organisation and `sub`                                           | confirms the same `sub`                                                                                                                             |

- **Stop** on any non-zero exit.
- **Step 13 stops** on `ResourceInitializationError` naming `munaxa-nonprod/identity-bootstrap`
  (the partial ARN did not resolve, F-8): `down`, report, fix by PR to the full ARN; do not
  improvise.
- Other errors and what they mean:
  - `IDENTITY_OWNER_PASSWORD does not meet the password policy`: regenerate the password,
    update the secret, re-run step 13.
  - `No role "control-operator-admin"`: step 14 did not run or failed.
  - `SELF_SIGNED_CERT_IN_CHAIN`: the RDS CA bundle in the image; stop.

### Step 16: delete the bootstrap secret (owner guide D, corrected step number)

Run only after steps 13, 14 and 15 have each exited 0 (F-9).

```bash
aws secretsmanager delete-secret --secret-id munaxa-nonprod/identity-bootstrap --force-delete-without-recovery
aws secretsmanager list-secrets --filters Key=name,Values=munaxa-nonprod/identity-bootstrap --query 'length(SecretList)'
```

- **Expected:** the first command returns `DeletionDate`; the second prints **`0`**.
- If it prints `1`, wait 30 seconds and repeat. The deletion is asynchronous.
- If any bootstrap step failed, still delete the secret **before `down`**. A later retry recreates it.

### Step 17: refresh Identity (corrected service name, F-2; first health gate, F-1)

```bash
aws ecs update-service --cluster $C --service identity --force-new-deployment --query 'service.deployments[0].[id,rolloutState]' --output text
aws ecs wait services-stable --cluster $C --services identity && echo STABLE
aws ecs describe-services --cluster $C --services identity --query 'services[0].{running:runningCount,desired:desiredCount,deployments:deployments[].{state:rolloutState,running:runningCount}}'
TG=$(aws elbv2 describe-target-groups --names $C-identity --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn $TG --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
T=$(aws ecs list-tasks --cluster $C --service-name identity --desired-status RUNNING --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster $C --tasks $T --query 'tasks[0].containers[].[name,lastStatus,healthStatus]' --output text
```

- **Expected:** `STABLE` (the waiter allows about 10 minutes), running 1 and desired 1, one
  deployment `COMPLETED`, the target `healthy`. Containers `identity RUNNING HEALTHY` and
  `valkey RUNNING HEALTHY`.
- **Stop** if it is not stable within 15 minutes. Then read the stopped tasks' reasons and
  `aws logs tail /munaxa/nonprod/identity --since 20m`.

---

## 5. Expected evidence for every step (summary)

| Step      | Evidence to record in the session report                                                                                                                            | Source                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Preflight | P-1 to P-13 and G-1 to G-5 as expected, with the UTC time                                                                                                           | CloudShell output, GitHub UI       |
| 8         | Run id, green; plan summary 11 creates; database `available`; ALB `active`; service `ACTIVE`; first task: Valkey HEALTHY, Identity exit with a database error (F-1) | Run summary, CloudShell            |
| 9         | ALB DNS name; Cloudflare record DNS-only; resolution                                                                                                                | CloudShell, Cloudflare             |
| 10        | Task id, exit 0, the `db-bootstrap: identity: …in place.` line                                                                                                      | `/munaxa/nonprod/ops`              |
| 11        | Task id, exit 0, `All migrations have been successfully applied.`                                                                                                   | `/munaxa/nonprod/identity-migrate` |
| 12        | Secret exists, 1 version, data key                                                                                                                                  | `describe-secret`                  |
| 13 to 15  | Task ids, exit 0 each; organisation id, `sub`, `OPERATOR_ORGANISATION_ID`                                                                                           | `/munaxa/nonprod/ops`              |
| 16        | `list-secrets` count `0`                                                                                                                                            | CloudShell                         |
| 17        | Stable, 1 RUNNING, target healthy, both containers HEALTHY                                                                                                          | CloudShell                         |
| 18 to 21  | Section 7 results                                                                                                                                                   | curl, Node, CloudShell             |
| 22        | `down` run id, green; database `stopping` or `stopped`                                                                                                              | Run, CloudShell                    |
| 23        | Section 8 results; CloudTrail; Cost Explorer next day                                                                                                               | CloudShell, console                |

---

## 6. Failure conditions and recovery

General rule: **on any failed step, do not run the next step.**

1. Record the stop reason and the log lines (no secret values).
2. If a bootstrap secret exists, delete it (step 16).
3. Dispatch `down` (step 22) and verify (step 23).
4. Report in the thread.

Do not modify IAM, task definitions or secrets during the session. Every fix is a reviewed PR and
its own apply, with the session down.

| Symptom                                                | Likely cause                                                                                         | Action                                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `up`: "the session plan changes more than the session" | Drift, or a task-definition diff on `main`                                                           | Stop. Nothing changed; the database was not started. Report the listed addresses                                                                                                      |
| `up`: `AccessDenied` (any service)                     | Session deployer gap (F-3), for example a missing service-linked role                                | Stop. The failed `up` stops the database itself. Decode the message (`aws sts decode-authorization-message` as root, owner), compare with `iam_session.tf`, report. **No IAM change** |
| `up` cancelled or timed out                            | Slow database start                                                                                  | The workflow stops the database. Dispatch `down` to remove anything created                                                                                                           |
| `ResourceInitializationError` on Identity or a task    | Wrong or non-current version id, a KMS decrypt issue, or the bootstrap secret missing or partial ARN | Stop. Check P-5 and the secret's key. Fix by PR (version ids) or by recreating the bootstrap secret with the right key; never edit the task definition by hand                        |
| `CannotPullContainerError`                             | ECR permission or digest                                                                             | Stop. Compare with P-10                                                                                                                                                               |
| Identity exits with configuration errors               | Bundle content (key format, kid)                                                                     | Stop. The owner regenerates with the guide; new version id by PR and apply                                                                                                            |
| `db-admin` non-zero                                    | Bundle URL malformed; master secret; network                                                         | Stop. Read the log line (names the field, never the value)                                                                                                                            |
| `identity-migrate` non-zero                            | Role, grants, network                                                                                | Stop. In Testing the database may be dropped and recreated by a reviewed procedure; no fix-forward in the session                                                                     |
| Bootstrap non-zero                                     | Policy, order, TLS                                                                                   | Stop. Delete the bootstrap secret, `down`                                                                                                                                             |
| Step 17 not stable                                     | Health check, Redis, schema                                                                          | Stop. Collect the stopped reasons and logs, `down`                                                                                                                                    |
| Health, login or JWT check fails                       | Key mismatch, issuer, routing                                                                        | Stop at the failing check, collect evidence, `down`. Key mismatch: new key pair by guide A/B, new version id and public key by PR                                                     |
| `down` red or the database not stopping                | Plan or state lock                                                                                   | Dispatch `down` again. The database job runs on its own. If still running, stop the database in the console (owner). The 21:00 UTC backstop is the last line, not the plan            |

---

## 7. Security and access verification (steps 18 to 21, Stage D)

### Step 18: health

```bash
curl -sS -o /dev/null -w 'live %{http_code}\n' https://id.test.munaxa.com/api/auth/health/live
curl -sS -w '\nready %{http_code}\n' https://id.test.munaxa.com/api/auth/health/ready
```

- **Expected:** `live 200`.
- `ready 200` with body
  `{"status":"ok",…,"sessionLimit":…,"cache":"redis","signingKid":"identity-nonprod-2026-11"}`.
- `ready` succeeding means four probes passed: the database (`select 1`), the schema (the 8
  tables), the cache and a signing probe.
- A `503` names the failed dependency (`database`, `schema`, `cache`, `signing`): stop.

### Step 19: operator sign-in, wrong password and JWT

In CloudShell, with the password typed at a hidden prompt. It never goes in a command line or a
file.

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
# The access token is in the session cookie (httpOnly, never in a body). Verify it locally:
export TOKEN=$(awk '$6 !~ /refresh/ && $7 ~ /^eyJ/ {print $7}' /tmp/id.jar | head -1)
# Get the script: from main once this PR is merged (or paste supporting/verify-identity-jwt.mjs with a heredoc)
curl -sSLO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-first-session-preparation/supporting/verify-identity-jwt.mjs
sha256sum verify-identity-jwt.mjs   # bf5e88f2a933439fe8ced20269f26934cbeaa7a614b46637f6101020e63db9cf (corrected version)
node verify-identity-jwt.mjs
unset TOKEN ID; rm -f /tmp/id.jar verify-identity-jwt.mjs
```

**Expected:**

- `login 200`;
- `wrong-password 401` with `{"code":"AUTH_INVALID_CREDENTIALS"}`;
- the script prints one `ok` line per check and **`PASS`**. The checks are:
  - `alg` ES256 and `kid` `identity-nonprod-2026-11`;
  - the signature against the committed key;
  - `iss` exactly `https://id.test.munaxa.com`;
  - `aud` exactly `munaxa-work` and `munaxa-control` (from `IDENTITY_AUTH_AUDIENCE`);
  - `exp` in the future, `iat` not in the future, lifetime exactly 900 seconds (Identity's default
    `ACCESS_TOKEN_TTL`; the task definition sets none).

What this proves:

- The private key in `munaxa-nonprod/identity` and the public key committed in
  `envs/nonprod.tfvars` are a pair.
- They are the same key that Work and Control will be configured with.

The script ([`supporting/verify-identity-jwt.mjs`](supporting/verify-identity-jwt.mjs)) works as
follows:

- It verifies with Node's `crypto` and the committed key.
- It prints no token and no subject.
- It is tested by `supporting/verify-identity-jwt.test.mjs` (`node --test`, 26 cases: valid,
  wrong key, wrong kid, issuer, each audience error, expired, future `iat`, wrong lifetime, `alg
none`/HS256, malformed tokens, CLI exit codes).

Optionally, sign in through a browser at `https://id.test.munaxa.com/api/auth/login` (organisation
`munaxa-group`). Never paste the token or cookies anywhere.

Stop conditions:

- `401` on the right password;
- `503` (a dependency);
- a `FAIL`. A `FAIL` on the signature line means the key pair does not match: stop, do not
  configure any product with this key. A `FAIL` on `aud` or the lifetime means the running
  configuration differs from `main`: stop and report.

### Step 20: access restrictions (no DNS needed for the operator host)

```bash
ALB=$(aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].DNSName' --output text)
IP=$(getent ahostsv4 "$ALB" | awk 'NR==1{print $1}')
curl -sS -o /dev/null -w 'operator /api/auth %{http_code}\n' --resolve operator-test.munaxa.com:443:$IP https://operator-test.munaxa.com/api/auth/health/live
curl -sS -o /dev/null -w 'operator / %{http_code}\n'         --resolve operator-test.munaxa.com:443:$IP https://operator-test.munaxa.com/
curl -sS -o /dev/null -w 'control-api admin %{http_code}\n'  --resolve control-api.test.munaxa.com:443:$IP https://control-api.test.munaxa.com/api/v1/admin/x
curl -sSk -o /dev/null -w 'wrong host %{http_code}\n' -H 'Host: unknown.test.munaxa.com' "https://$ALB/"
curl -sS -o /dev/null -w 'http %{http_code} -> %{redirect_url}\n' http://id.test.munaxa.com/api/auth/health/live
```

**Expected:**

- operator `403` and `403` (rule 39: no `operator_access`, `operator_cidrs = []`);
- control-api admin `403` (rule 10);
- wrong host `404` (default action);
- http `301` to `https://…`.

`--resolve` sends the real host name, SNI included, to the ALB's address, so no DNS record or
Cloudflare change is needed. `-k` is used only for the wrong-host probe, whose name the
certificate does not cover.

**Stop** if the operator host answers anything but 403.

### Step 21: ACM

```bash
ARN=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='*.test.munaxa.com'].CertificateArn" --output text)
aws acm describe-certificate --certificate-arn $ARN --query 'Certificate.[Status,NotAfter,InUseBy]'
aws elbv2 describe-listeners --load-balancer-arn $(aws elbv2 describe-load-balancers --names munaxa-nonprod --query 'LoadBalancers[0].LoadBalancerArn' --output text) --query 'Listeners[?Port==`443`].[SslPolicy,Certificates[0].CertificateArn]' --output text
echo | openssl s_client -connect id.test.munaxa.com:443 -servername id.test.munaxa.com 2>/dev/null | openssl x509 -noout -subject -issuer -enddate -ext subjectAltName
```

**Expected:**

- `ISSUED`, with `InUseBy` = the `munaxa-nonprod` ALB ARN;
- listener `ELBSecurityPolicy-TLS13-1-2-2021-06` with the same certificate ARN;
- an Amazon-issued certificate, SAN `*.test.munaxa.com, operator-test.munaxa.com`, not expired.

Also record `RenewalEligibility`: after attachment it may become ELIGIBLE. That is not claimed
here.

### Known risks (Stage D) and how the sequence handles them

| Risk                                    | Handling                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key pair never proven together          | Step 18's readiness only proves the private key signs. Step 19's `PASS` is the proof; `FAIL` is a hard stop                                                                                               |
| Secret version ids not proven           | Step 8 proves `identity` (`ad02f18e…`) by the Identity container starting. Step 10 proves both bundles, read by db-admin. Step 11 proves `identity-migrate`. `ResourceInitializationError` is a hard stop |
| Bootstrap partial ARN (R-6)             | Step 13 is its first use; `ResourceInitializationError` stops, and the fix is a PR to the full ARN (F-8)                                                                                                  |
| `RegisterTaskDefinition` and `PassRole` | Exercised by the A1 apply (F-7). The new exposure is the session deployer's create path (F-3), with preflight P-11. Stop on `AccessDenied`; no pre-emptive broadening                                     |
| Operator endpoint must stay closed      | Step 20. Rule 39 is in code; rules 30 and 31 do not exist while `operator_open` is false                                                                                                                  |
| Failed database or migration task       | Hard stop before any later step                                                                                                                                                                           |
| Secrets in commands or logs             | No `--overrides` carries a secret. Passwords only at a hidden prompt into a pipe. Logs print names, never values. The report records only public ids                                                      |
| `sub` and organisation ids              | Public identifiers, needed by Config C. The operator email is not recorded                                                                                                                                |

---

## 8. Shutdown and cost checklist (steps 22 and 23)

### Step 22: `down`

The owner dispatches it. Either:

- **GitHub UI:** Actions → **AWS Testing session** → Run workflow → Branch `main` → `session` = `down`; or
- **CLI:** `gh workflow run aws-session.yml -R munaxa/munaxa-platform --ref main -f session=down`.

**Expected:**

- both jobs are green ("Stop the database" and "Testing down");
- the plan summary shows only deletes of the 11 session addresses;
- the database is `stopping`, then `stopped`.

If it is red: dispatch `down` again. The database job runs on its own and is not held by the
Terraform group.

### Step 23: read-only shutdown evidence (owner, or Claude with authorization)

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
# Step 23 runs after the session, so it needs the helper itself. Download it alone and check it first:
#   curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-first-session-preparation/supporting/cloudtrail-denials.py
#   sha256sum cloudtrail-denials.py   # 0669df65de48088855ac71b10024496f6fe9e555cc79d01262890731be1b7589
#   (since the 10 Nov hardening: unread or truncated input is exit 2; was ed3711da… before it)
for r in eu-central-1 us-east-1; do   # corrected: all pages, errorCode only (supporting/cloudtrail-denials.py)
  aws cloudtrail lookup-events --region $r --start-time <session start, UTC> --output json | python3 -I cloudtrail-denials.py
done                                                                                       # denials 0, or each one explained
```

- **Cost Explorer (owner, next day):** service breakdown for the session day, filtered by tag
  `Environment = nonprod` and unfiltered. Record it in the session report.
- **Expected after shutdown:** idle cost unchanged. The task definitions, roles, log groups (with
  14 days of the session's logs, a few KB) and the database storage remain, as before.

### Cost estimate (not a billing measurement)

List prices for eu-central-1, from the 5 Nov runbook §10 and the 9 Nov runbook [P]. **Not a live
AWS billing figure.**

| Item                                                      | Per hour                |
| --------------------------------------------------------- | ----------------------- |
| Fargate, Identity task 0.5 vCPU / 1 GB (Valkey inside it) | about US$0.028          |
| ALB (2 subnets) plus minimal LCU                          | about US$0.027 to 0.035 |
| Public IPv4: 1 task + 2 ALB                               | about US$0.015          |
| RDS db.t4g.micro while running                            | about US$0.019          |
| **Total**                                                 | **about US$0.10**       |

| Duration                                                                          | Estimate                  |
| --------------------------------------------------------------------------------- | ------------------------- |
| Planned 2 h                                                                       | about **US$0.20**         |
| Hard stop 3 h                                                                     | about **US$0.30 to 0.35** |
| One-off tasks (db-admin, migrate, 3 bootstrap; 0.25 to 0.5 vCPU for minutes each) | under US$0.02             |
| Bootstrap secret (US$0.40 per secret-month, prorated over hours)                  | under US$0.01             |

The shutdown has three layers, in order:

1. Explicit `down` at the end of verification, by 18:30 UTC, and in any case at the 3-hour hard
   stop.
2. The scheduled `down` (19:17 and 01:47 UTC, often late).
3. The AWS backstop at 21:00 UTC: database stop, service to 0. It cannot delete the ALB, which
   costs about US$0.04 an hour until the next `down`.

The backstop is not a substitute for step 22.

---

## 9. Owner actions required

| #    | Action                                                                                                                                               | When                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| O-1  | Authorize the preflight read-only AWS check (section 3.2): owner in CloudShell, or Claude through the root connector                                 | Session day, before step 8 |
| O-2  | GitHub checks G-1 to G-5                                                                                                                             | Session day, before step 8 |
| O-3  | Accept the corrected readings of step 8 and step 17 (F-1, F-2) and the session window, duration and hard stop (section 3.3)                          | With the session approval  |
| O-4  | **Separate explicit session approval**, then dispatch `up` (step 8)                                                                                  | Session start              |
| O-5  | Cloudflare: CNAME `id.test` → the session's ALB DNS name, DNS only (step 9)                                                                          | After step 8               |
| O-6  | Run steps 10, 11, 13, 14, 15, 17 in CloudShell, or authorize Claude to run them through the root connector, step by step                             | During the session         |
| O-7  | Create the bootstrap secret (step 12) and delete it (step 16); password manager entry                                                                | During the session         |
| O-8  | Sign-in check (step 19): the owner types the password                                                                                                | During the session         |
| O-9  | Dispatch `down` (step 22); authorize the shutdown evidence read (step 23); Cost Explorer next day                                                    | End of session, next day   |
| O-10 | Optional: fix the step numbers in guide C/D and the runbook's step 8/17 text by a small docs PR. This report already supersedes them for the session | Any time                   |

## 10. Exact session execution sequence

1. Preflight G-1 to G-5 and P-1 to P-13, all as expected → owner session approval.
2. **Step 8:** dispatch `aws-session.yml` `up` on `main`. Verify the edge, the database, the
   service and the first task's expected database error.
3. **Step 9:** Cloudflare `id.test` CNAME to the ALB DNS name, DNS only; resolution check.
4. **Step 10:** `db-admin` → exit 0, roles line.
5. **Step 11:** `identity-migrate` → exit 0, "All migrations have been successfully applied".
6. **Step 12:** create `munaxa-nonprod/identity-bootstrap` (data key).
7. **Step 13:** bootstrap default → exit 0; record the organisation and `sub`.
8. **Step 14:** `seed-control-roles.mjs --organisation munaxa-group` → exit 0; record
   `OPERATOR_ORGANISATION_ID`.
9. **Step 15:** `bootstrap-account.mjs --organisation munaxa-group --role control-operator-admin`
   → exit 0.
10. **Step 16:** force-delete the bootstrap secret → count 0.
11. **Step 17:** `update-service --service identity --force-new-deployment` → stable, 1 RUNNING,
    target healthy.
12. **Step 18:** live 200, ready 200 (`cache: redis`, kid).
13. **Step 19:** login 200, wrong password 401, JWT `PASS`.
14. **Step 20:** operator 403, admin 403, wrong host 404, http 301.
15. **Step 21:** ACM ISSUED and `InUseBy` the ALB; listener certificate; browser or openssl valid.
16. **Step 22:** dispatch `down` → green, database stopping or stopped.
17. **Step 23:** read-only shutdown evidence; Cost Explorer next day; session report folder and
    index line.

Any stop condition: delete the bootstrap secret if it exists, then go to step 22.

---

## 11. Local checks made for this report

- The committed public key loads as P-256 (`prime256v1`).
- `supporting/verify-identity-jwt.mjs`:
  - a token signed with a generated P-256 key verifies with the matching public key (PASS);
  - the same token fails against the committed key (FAIL);
  - sha256 `9aec82467ef3fb75d3ddcf102cc3da1fcb1ad5bc9e54149015d9a4c72973ff52` (original); the
    corrected version with the audience and expiry checks is
    `bf5e88f2a933439fe8ced20269f26934cbeaa7a614b46637f6101020e63db9cf`.
- Source reads:
  - platform: `aws-session.yml`, `stack/{services,edge,ops,data,backstop,outputs,network}.tf`,
    `modules/service/main.tf`, `stack/scripts/db-bootstrap.sh`,
    `bootstrap/{iam_session,iam_allow}.tf`, `scripts/aws/stop-database.sh`,
    `scripts/terraform/session-network-placement.jq`;
  - identity at `5277d71`: `main.ts`, `persistence/prisma.service.ts`, `health/*`,
    `auth/auth.controller.ts`, `apps/api/scripts/{bootstrap-account,seed-control-roles}.mjs`,
    `apps/api/Dockerfile`.
- GitHub: the `aws-session.yml` and `aws-terraform.yml` run lists and the jobs of the two
  dispatched session runs.
- AWS public documentation (not the account): the ECS circuit breaker and Secrets Manager
  references in ECS task definitions.

## 12. Statement of what was not done

In this task Claude made **no AWS call of any kind** (no read, no write; only public AWS
documentation was searched). It also did none of the following:

- dispatch a workflow;
- start or stop the database;
- run an ECS task, a migration or a bootstrap;
- read or change a secret value, private key, password or Terraform state;
- make a KMS, IAM, Cloudflare, DNS or certificate change;
- touch production, Control, Work, School, Docs, CanteenHub, Render or Supabase;
- merge anything.

The only change is this report and its index line, in a docs-only PR that is not merged.
