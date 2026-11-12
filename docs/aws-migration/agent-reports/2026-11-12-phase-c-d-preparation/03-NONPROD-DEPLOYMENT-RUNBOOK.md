# 03. Testing (non-production) deployment runbook: Identity on Platform 2.5.0

Tags: **[V]** repository-verified fact, **[L]** locally tested, **[E]** estimate, **[R]** recommendation,
**[U]** AWS behaviour not yet verified, **[O]** needs the owner's explicit authorization.

**This runbook was written, not executed.** No step below has run.

It extends, and does not replace, the first-session checklist in `2026-11-11-identity-first-session-operator-checklist/00-IDENTITY-FIRST-SESSION-OPERATOR-CHECKLIST.md` (the "11 Nov checklist"). That checklist was written for image `5277d71`. Its CloudShell helpers (§5.2), database bootstrap and migration (§5.5), bootstrap-secret handling (§5.6), DNS (§5.4) and shutdown (§10) still apply where this runbook refers to them.

Per the owner's direction of 11 Nov:
- Claude executes AWS steps only after the owner's explicit, scoped approval for each stage.
- The owner's own actions are only approvals, environment approvals in GitHub, MFA, and Cloudflare sign-in (and the `id.test` record), plus, only if no other route exists, typing the operator password once at a hidden prompt (§13).
- The Testing operator email is **never** written here, in a PR or in a log. It is the runtime input `IDENTITY_OPERATOR_EMAIL`.

## 1. Preconditions

| # | Precondition | Status now | Kind |
| --- | --- | --- | --- |
| P-1 | Platform 2.5.0 published, all 13 packages, from main | not done | **[O]** dispatch `release.yml` dry run, then publish (irreversible) |
| P-2 | identity#18 made ready: lockfile regenerated against the registry, published tarballs equal to the candidate content digests (01), CI green, independent review, merged | draft | repository; merge under the standing rule after P-1 |
| P-3 | Identity images (`api`, `migrate`) built from the identity#18 merge commit; both digests recorded | not done | **[O]** tag `image/<sha>` and approve the `image-release` environment |
| P-4 | Hardened-image inputs: `MFA_ENCRYPTION_KEYS` in a new `munaxa-nonprod/identity` bundle version; `identity_security_config = { mfa_primary_kid, mfa_policy = "off" }`; `IDENTITY_PASSWORD_RESET` is fixed at `disabled` by the stack (AW-01) | not done | **[O]** secret write; values never seen by Claude: the owner in the console, or the asm-exec resolve pattern **[U]** (an earlier report found asm-exec not available in this environment; check before stage C) |
| P-5 | tfvars PR: pin the P-3 digests, set `identity_security_config`, pin the P-4 `secret_version_ids.identity`; `envs/nonprod.expected-changes.json` declares the plan (05) | not done | repository (Claude); merge under the standing rule |
| P-6 | At-rest nonprod apply of P-5, which includes the pending docs-migrate delta (+1 create, 1 update; 05) | not done | **[O]** `aws-terraform.yml` dispatch, `aws-nonprod` approval |
| P-7 | Database bootstrap of the Identity roles has run once (11 Nov checklist steps 10 to 16), or runs in this session | never run | **[O]**, in session |
| P-8 | Cost guard: the session backstop (EventBridge 21:00 UTC) and the `down` schedules are active | **[V]** in code; live state last verified 6 Nov | read-only check **[O]** (stage R) |

## 2. Owner authorizations required, in order

| Stage | What the owner approves | Irreversible? |
| --- | --- | --- |
| A | Publish Platform 2.5.0 (P-1) | **yes**: a version is published once |
| B | Build and push Identity images (P-3) | no (immutable tags, can be left unused) |
| R | Read-only AWS pre-checks before stage C and D: P-8 backstop and schedule state, §4.1 `ecr describe-images`, §4.4 `describe-secret` (metadata only) | no (reads only; still a named approval, per the owner's rule) |
| C | Write the bundle version with `MFA_ENCRYPTION_KEYS` (P-4) | **yes, in effect**: once MFA data is encrypted with it, the key must be kept |
| D | Nonprod at-rest plan + apply (P-6) | changes AWS |
| E | Session `up`, the `id.test` DNS update (owner, Cloudflare), bootstrap and migrations, the forced redeployment, the verification, `down` (§7 to §16) | **yes, in part**: the schema migrations are forward-only (never rolled back by hand); everything else is undone by `down`. Costs while up |

Each stage is a separate yes. Stage E is one session, and it ends with `down` on the same day.

## 3. Account and roles

**[V]** Account `229251310592`, region `eu-central-1`, cluster `munaxa-nonprod`, service `identity`, target group `munaxa-nonprod-identity`, log group `/munaxa/nonprod/identity` (stream prefixes `identity`, `valkey`).

| Action | Identity | Source |
| --- | --- | --- |
| Plan and apply (P-6) | GitHub OIDC, then `munaxa-shared-ci-nonprod`, then `munaxa-shared-deployer-nonprod`, from main in environment `aws-nonprod` | **[V]** `bootstrap/iam.tf` |
| Session `up`/`down` | `aws-session.yml`, environment `aws-nonprod-session`, session-only deployer | **[V]** |
| Run tasks (bootstrap, migrate), observe (describe, logs), force a new deployment | root through the owner-approved AWS connector (ACCESS-POLICY, 8 Nov: approved development access; no keys) | owner decision 8 Nov |

**[R]** Every mutating connector call is listed in the stage E approval: `ecs run-task`, `ecs update-service --force-new-deployment`, and the optional desired-count changes in §7b. Nothing else.

## 4. Image and configuration checks (before stage D)

1. Check **[O] (stage R)**, read-only, not yet run: for each digest, `ecr describe-images` shows the tags `sha-<identity#18 merge sha>` and `<short>`.
2. **[L]** Rendered task definition, offline (05 method): containers `identity` and `valkey`.
   - The environment holds `MFA_ENCRYPTION_PRIMARY_KID`, `MFA_POLICY=off` and `IDENTITY_PASSWORD_RESET=disabled`.
   - The secrets reference `MFA_ENCRYPTION_KEYS` at the pinned version.
   - No secret value appears anywhere in the rendered output.
3. **[L]** The Identity configuration loader accepts that environment (the AW-01 harness, report `2026-11-11-identity-aw01-remediation/supporting/harness.mjs`, re-run against the new image's source).
4. Check **[O] (stage R)**, read-only, not yet run: `secret_version_ids.identity` is the version created in stage C. `describe-secret` metadata only, never the value.

## 5. Pre-deployment plan (stage D)

1. **[O] (stage D)** Dispatch `aws-terraform.yml` with `nonprod` / `plan`. Expect "Plan: N to add, M to change, 0 to destroy". N and M are the P-5 declaration.
2. The intent check (`--report`) must say "The plan matches the declared changes exactly".
3. Stop conditions:
   - any destroy;
   - any change to `aws_db_instance`, VPC, subnets, routes, ACM, the backstop or production;
   - any IAM change other than the declared execution-role policies;
   - any `elasticache`, `sns` or `cloudwatch_metric_alarm` address. These are production only, and seeing one means `identity_cache` leaked into nonprod.
4. Dispatch `apply`. The owner approves `aws-nonprod`. Then a post-apply `plan` must say **No changes** **[O]**.

## 6. Expected plan differences

| Plan | Expected | Basis |
| --- | --- | --- |
| At rest, before P-5 | +1 `aws_secretsmanager_secret.service["docs-migrate"]`, ~1 `aws_iam_role_policy.docs_db_admin_execution[0]` | **[L]** 05 |
| At rest, with P-5 | the above, plus new revisions of `module.identity[0]`, `module.migrate["identity"]` (and `identity_bootstrap` if it uses the image) task definitions, and execution-policy updates for the new secret keys | **[E]**; computed exactly in the P-5 PR |
| Session `up` | creates ALB, listeners, rules, target groups, ECS services, service discovery; Identity's service has `deployment_minimum_healthy_percent = 0`, `deployment_maximum_percent = 100` | **[L]** stack tests |
| Production cache resources | **none** in nonprod, ever | **[L]** |
| Extra AssumeRole for the `ephemeral_secrets` alias | at most one more `sts:AssumeRole`; **no** `GetSecretValue` | **[E]** 05 |

## 7. Deployment execution (stage E, documented, not executed)

Times are UTC. Every command below is read-only unless it is marked **[mutating]**.

1. **Session up** **[O] (stage E)** (owner dispatches `aws-session.yml` `up`, approves `aws-nonprod-session`). The job:
   - plans the switches;
   - refuses non-session types;
   - starts the database;
   - applies.

   Record the run id and its start and end times.

   **Then the DNS update** **[O] (stage E, owner in Cloudflare)**. The ALB name changes every session, so the
   `id.test.munaxa.com` CNAME must point at this session's ALB DNS name (11 Nov checklist §5.4).
   Check with `getent hosts id.test.munaxa.com` that it resolves to the new ALB before §12. Without
   this step every check in §12 to §14 reaches a stale record.
2. **First deployment = service creation.** No old task exists, so there is no replacement. Expect Identity to crash-loop until the migrations run (known since 10 Nov: `/ready` needs the schema). The circuit breaker can fail this first deployment and stall it (04). That is expected.
3. **Database bootstrap and migrations** (11 Nov checklist §5.5 and §5.6) **[mutating] [O] (stage E)**:
   - run `db-admin` (if P-7 has not run yet);
   - then `identity-migrate`, with the new image. It applies every migration since `5277d71`: MFA, reset, sessions.

   Each runs as `ecs run-task`. Wait for STOPPED and exit code 0.
4. **Bring Identity up** **[mutating] [O] (stage E)**: `aws ecs update-service --cluster munaxa-nonprod --service identity --force-new-deployment`. Its first healthy task is the **baseline task (T1)**. Wait for `rolloutState = COMPLETED`.
5. **Verification part 1** (§10 to §14) on T1.
6. **The observation: forced redeployment (7a)** **[mutating] [O] (stage E)**. Capture T=0, then `aws ecs update-service --cluster munaxa-nonprod --service identity --force-new-deployment`. Capture everything in §8 to §10 until `rolloutState = COMPLETED` on the new task (**T2**).
7. **Optional, only if 7a showed T2 created before T1 stopped and the owner wants a literal "never two tasks" (7b)** **[mutating] [O] (stage E, a separate yes)**. This is the only procedure that guarantees it (04):
   - `update-service --desired-count 0`, then wait until T2 is STOPPED;
   - `update-service --desired-count 1`;
   - capture the same evidence.

   Terraform still says `desired_count = 1`. The next session's plan shows no drift, because the switches recreate the service.
8. **Verification part 2** (§10 to §14) on T2. Compare it with part 1: the state was reset.
9. **Session down** **[O] (stage E)** (owner dispatches `down`). The `id.test` record then points at a deleted ALB: leave or remove it, as the 11 Nov checklist §10 item 9 says (DNS-H1). Then post-session verification (11 Nov checklist §10).

## 8. ECS events to capture (for 7a and 7b)

```
aws ecs describe-services --cluster munaxa-nonprod --services identity \
  --query 'services[0].{events:events[:40],deployments:deployments}'
```

Capture this every 10 s from T=0 until COMPLETED. Record:
- the `PRIMARY`/`ACTIVE` deployments, with `rolloutState`, `runningCount`, `pendingCount` and `failedTasks`;
- every event line, notably "has stopped 1 running tasks", "has started 1 tasks", "deregistered 1 targets", "registered 1 targets" and "has reached a steady state".

## 9. Old-task stop and new-task start timestamps

```
aws ecs list-tasks --cluster munaxa-nonprod --service-name identity --desired-status RUNNING
aws ecs list-tasks --cluster munaxa-nonprod --service-name identity --desired-status STOPPED
aws ecs describe-tasks --cluster munaxa-nonprod --tasks <T1> <T2> \
  --query 'tasks[].{arn:taskArn,last:lastStatus,desired:desiredStatus,created:createdAt,pull:pullStartedAt,started:startedAt,stopping:stoppingAt,stopped:stoppedAt,exec:executionStoppedAt,reason:stoppedReason,containers:containers[].{n:name,s:lastStatus,h:healthStatus}}'
```

**The decisive comparison [U]:** T2 `createdAt` against T1 `stoppedAt` (and against T1 `stoppingAt`).

| Observation | Meaning | Action |
| --- | --- | --- |
| T2 created after T1 stopped | ECS waited: never two tasks | record; nothing to change |
| T2 created after T1 `stoppingAt` but before `stoppedAt` | Two tasks briefly; T1 already deregistered | record; the ALB argument (04) holds; 7b optional |
| T2 created before T1's target left `draining` | Overlap includes the drain; check §10 that T2 was not yet `healthy` while T1 was still `healthy` | If T1 and T2 were ever both `healthy` at once, **stop**: that contradicts 04. Report it, and use 7b for every later deployment |

## 10. ALB target registration and deregistration

```
aws elbv2 describe-target-groups --names munaxa-nonprod-identity --query 'TargetGroups[0].TargetGroupArn'
aws elbv2 describe-target-health --target-group-arn <arn>
```

Capture this every 5 s. Record each target IP with its state transitions (`initial`, `healthy`, `draining`, gone) and their timestamps. Map each IP to T1 or T2 using `describe-tasks` `attachments[].details` `privateIPv4Address`.

**Pass:** there is no instant at which T1 is `healthy` and T2 is `healthy`, and no instant at which T1 is registered and not yet `draining` (`initial`, `healthy` or `unhealthy`) while T2 is `healthy`.

Also record the CloudWatch ALB metrics over the window: `HTTPCode_ELB_5XX_Count`, `HTTPCode_Target_5XX_Count`, `HealthyHostCount`, `UnHealthyHostCount`. These give the measured outage. **[E]** Expected 1 to 2 minutes.

## 11. Valkey sidecar health

- `describe-tasks`: container `valkey` `healthStatus = HEALTHY` before container `identity` is RUNNING (`dependsOn HEALTHY`) **[V]** in the task definition.
- Logs `/munaxa/nonprod/identity`, stream prefix `valkey`: a "Ready to accept connections" line, and no `requirepass` value in the log. **[R]** Grep for the bundle version id only, never for the value.
- Valkey is not reachable from outside: no port mapping; the SG admits only the ALB on 4001 **[V]**. There is nothing to test from outside.

## 12. Identity readiness

Run sections 12 to 14 on T1 (part 1) and again on T2 (part 2).
`IDENTITY_OPERATOR_EMAIL` is a runtime input only and never appears in a log, report or commit.

| Check | Expected |
| --- | --- |
| `GET https://id.test.munaxa.com/api/auth/health/live` | 200 |
| `GET https://id.test.munaxa.com/api/auth/health/ready` | 200 only when the database, the cache (`ROLE` master) and signing all answer |
| Target health (§10) | the serving task `healthy`, no other target `healthy` at the same time |

## 13. Login and MFA verification

**No credential enters Claude's context.** Two rules:
- **The operator account is used only for sign-in.** Its password lives in `munaxa-nonprod/identity-operator`
  (Option A custody: generated in AWS, never returned). The sign-in check needs a route that does not
  show it to Claude. That route is not settled yet **[U]**:
  - the `{{resolve:secretsmanager:munaxa-nonprod/identity-operator:SecretString:...}}` pattern via
    `asm-exec`. An earlier report (`2026-11-11-identity-claude-executed-deployment-plan`) found
    `asm-exec` not available in this environment. Check this before stage E;
  - if it is not available, the owner types the password once at a hidden prompt in CloudShell. This is
    an owner action and must be named in the stage E approval;
  - otherwise, skip the operator sign-in. The throwaway account below covers the sign-in checks.
- **Tokens and cookies stay inside the helper process** for both accounts. The helper outputs only status codes and the claims `aud`, `exp` and the presence of `sid`; it never prints a token, cookie, password, seed or code.
- **MFA and recovery codes are never tested on the operator account.** Enrolling it would make every
  later operator sign-in need a TOTP seed with no agreed custody, and no reviewed task removes a factor
  (AW-16, open). Those checks run on a **throwaway test account** created in the session. Its password,
  TOTP seed and recovery codes are generated and used inside one process, never printed or logged, and
  discarded at the end. Only status codes are recorded. Its identifier uses a reserved, non-deliverable domain (`@example.invalid`). The account stays in the Testing database after the session unless a reviewed disable step exists; the stage E approval must accept that leftover or name the step. **[R]** That helper does not exist yet. It is a
  repository task before stage E, together with a way to create the account that the stage E approval
  names.

| Check | Account | Expected |
| --- | --- | --- |
| Sign-in | operator (route above) or throwaway | 200, session cookies; JWT checked with `verify-identity-jwt.mjs` (exact `aud`, `exp` present); only the claims `aud`, `exp` and the presence of `sid` are recorded |
| One wrong password | throwaway | 401 `invalid-credentials`, no token |
| Token-claim hardening (new in 2.5.0) | n/a | **[R]** Not testable from outside without the signing key. Covered by the identity#18 test **[L]** |
| MFA (`mfa_policy = off`): enroll, sign in with a TOTP code, replay the same code | throwaway only | enroll 200; sign-in with code 200; the replayed code refused |
| Recovery code | throwaway only | one code signs in once; the second use is refused |

## 14. Lockout and rate-limit verification

| Check | Expected |
| --- | --- |
| Lockout | after `LOGIN_MAX_ATTEMPTS` wrong attempts on a throwaway identifier, 401 with lockout reported; the edge limit then gives 429 `AUTH_RATE_LIMITED` with `Retry-After` |
| Rate limit | `EDGE_LOGIN_PER_IP_LIMIT` + 1 attempts from one address give 429. IPv6 /64 counting cannot be checked here: the Testing ALB has no IPv6 listener **[V]**; covered locally (02) |
| Store reset after 7a | on T2, the throwaway identifier's lockout and the per-IP count are gone (expected, 04); the MFA replay marker from part 1 is gone, so the part-1 code is refused only because its time step has passed |

**Stop conditions** (as in the 11 Nov checklist §7, plus):
- `/ready` stays 503 for more than 5 minutes after COMPLETED;
- both tasks are `healthy` at once;
- any secret value appears in a log;
- a 2xx sign-in for a wrong password.

On a stop condition: capture the evidence, dispatch `down`, report.

## 15. Failure and rollback

| Failure | Procedure |
| --- | --- |
| Session `up` refused at "Plan the switches" | P-6 not applied, or drift. Do not apply anything by hand. `down`, then fix the declaration |
| Migrate task exit code not 0 | Do not start Identity. Capture the logs (no values). `down`. A migration is never rolled back by hand |
| Deployment fails (circuit breaker) | Expect a rollback to the last COMPLETED deployment, also 0/100. **[E]** 5 to 12 minutes without Identity. If there is no COMPLETED deployment (first in a session), it stalls: `down` |
| New image unhealthy after P-6 | Previous task-definition revisions are kept (`skip_destroy`). Roll back with a reviewed tfvars PR re-pinning the previous digests, plan and apply **[O]**. Never `update-service --task-definition` by hand |
| Database left running | The backstop stops it at 21:00 UTC; `down` stops it immediately |

## 16. Post-deployment verification

1. `down` completed. The database is stopped; there is no ECS service and no ALB. Run the 11 Nov checklist §10 read-only queries.
2. A nonprod `plan` gives **No changes**.
3. CloudTrail for the session window shows only:
   - the listed mutating calls;
   - `GetSecretValue` by the ECS execution roles and the asm-exec path;
   - no `GetSecretValue` by the deployer roles.
4. Cost: the session's hours × (ALB + Fargate 0.5 vCPU/1 GB + RDS). **[E]** Under USD 2 for a 3-hour session.

## 17. Evidence to retain

All of it goes in the agent-reports folder of the session. **No secret values. No operator email.**
- Workflow run ids and times (plan, apply, post-apply plan, `up`, `down`).
- `describe-services` snapshots (§8), `describe-tasks` for T1 and T2 (§9), the target-health timeline (§10), and the ALB metrics.
- The decisive comparison and its verdict (§9 table).
- Verification results (§12 to §14), with status codes and the redacted JWT claims (`aud`, `exp`, `sid` presence).
- The CloudTrail summary (§16) and the post-session plan.

## What is verified, tested locally, and unverified

| Kind | Items |
| --- | --- |
| **[V]** Repository | 1 task + sidecar, 0/100, circuit breaker, ALB-only ingress (now enforced, platform#114), drain 15 s, health checks, `dependsOn HEALTHY`, session plan type allow-list, CI and deployer roles |
| **[L]** Local | Identity suites on 2.5.0 (02); offline nonprod plan delta (05); Terraform tests (05) |
| **[U]** AWS | whether ECS counts DEACTIVATING/STOPPING tasks; actual outage; Fargate start time; Valkey image behaviour; the alias AssumeRole; CloudTrail content |
| **[O]** Owner | stages A to E (§2) |
