# Identity-only Testing deployment runbook (Config A1)

Part of [`00-IDENTITY-CONFIG-A1-PREPARATION.md`](00-IDENTITY-CONFIG-A1-PREPARATION.md). The Identity
extract of `infra/aws/README.md` G4 to G7, for Config A1. **Nothing here is approved or has been
run.** Every step that changes AWS, DNS or data needs the owner's explicit approval at that step.

Changes column: AWS, DNS, SEC (secret values), DATA (Testing data), none.

## Phase 1: inputs and infrastructure (session down)

| # | Step | Who | Evidence of success | Stop if | Changes |
|---|---|---|---|---|---|
| 1 | Merge this preparation PR (code: no Docs `db-admin` in A1; tests; report) | Owner | CI green; merge commit | any check red | none |
| 2 | Owner guide A and B: key and bundles into Secrets Manager; public snippet and version ids to the thread | Owner | Both bundles show 1 version (metadata); snippet posted | generator check fails | SEC |
| 3 | Read-only re-check (owner authorizes): ECR digests, RDS stopped, ECS empty, backstop 11 ENABLED, ACM ISSUED, secret version counts, no AccessDenied | Claude, root connector, metadata only | Matches report §2.2 | anything differs from §2.2 | none |
| 4 | Inputs PR: `envs/nonprod.tfvars` from `supporting/nonprod.config-a1.tfvars.TEMPLATE` with the real public key and version ids; `envs/nonprod.expected-changes.json` = the 22-address declaration | Claude opens, owner merges | `aws-terraform.yml` PR checks green | — | none |
| 5 | Dispatch `aws-terraform.yml` nonprod **plan** on `main` | Owner | Summary lists exactly the 22 declared creates, 0 change, 0 destroy | any stop condition in report §4.3 | none |
| 6 | Review the real plan against the declaration (report §4) | Claude and owner | Written comparison in the thread | any difference not explained | none |
| 7 | Separate owner approval of the exact plan; dispatch **apply**; approve `aws-nonprod` twice | Owner | Apply 22 added, 0 changed, 0 destroyed; post-apply plan: no changes | `AccessDenied` (stop, decode, report; access policy D-8); any error | AWS |

Between steps 4 and 7 the scheduled `aws-session` runs (19:17 and 01:47 UTC) will fail at "Plan the
switches", because main declares task definitions that are not yet applied. That is a safe failure
(before any change) and the 21:00 UTC backstop still stops the database. Do steps 4 to 7 in one
sitting to keep the window short.

## Phase 2: first Identity session

Run tasks from CloudShell (eu-central-1) with the `run_task_network` output: subnets, and
`db_admin_group` or `migrate_groups.identity`; `assignPublicIp=ENABLED` (public subnets, no NAT).
One task at a time; each must exit 0 (`aws ecs describe-tasks ... --query 'tasks[0].containers[0].exitCode'`)
before the next. Never put a secret in `--overrides`.

| # | Step | Evidence of success | Stop if | Changes |
|---|---|---|---|---|
| 8 | Owner approves the session. Dispatch `aws-session.yml` **up** | Run green; ALB exists; database `available`; `identity` service 1 task RUNNING with Valkey healthy | the plan check refuses; service fails to stabilize | AWS |
| 9 | DNS (owner, Cloudflare): `id.test.munaxa.com` CNAME to `alb_dns_name`, **DNS only** (not proxied). Work and the operator host are not needed in A1 | `nslookup id.test.munaxa.com` returns the ALB | — | DNS |
| 10 | `db-admin` (`--task-definition munaxa-nonprod-db-admin`, `db_admin_group`) | Exit 0; log "identity: database identity, roles identity_owner and identity_app are in place." | non-zero exit: `down`, read the log | DATA |
| 11 | `identity-migrate` (`munaxa-nonprod-identity-migrate`, `migrate_groups.identity`) | Exit 0; Prisma "All migrations have been successfully applied" | non-zero | DATA |
| 12 | Owner guide C: create `munaxa-nonprod/identity-bootstrap` | Secret exists, 1 version | — | SEC |
| 13 | `identity-bootstrap` step 1, default command (`db_admin_group`) | Exit 0; log prints `organisation` and `sub` (record both: public ids for Config C) | `ResourceInitializationError` naming the secret: the partial ARN did not resolve (risk R-6); stop, report | DATA |
| 14 | Step 2: `--overrides '{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/seed-control-roles.mjs","--organisation","munaxa-group"]}]}'` | Exit 0; prints `OPERATOR_ORGANISATION_ID` | non-zero | DATA |
| 15 | Step 3: command `["node","scripts/bootstrap-account.mjs","--organisation","munaxa-group","--role","control-operator-admin"]` | Exit 0; role assigned, no password written | non-zero | DATA |
| 16 | Owner guide D: delete the bootstrap secret (force, no recovery) | `list-secrets` count 0 | — | SEC |
| 17 | `aws ecs update-service --cluster munaxa-nonprod --service munaxa-nonprod-identity --force-new-deployment` (role cache) | New task RUNNING, old one stopped | — | AWS |
| 18 | Health: `https://id.test.munaxa.com/api/auth/health/live` and `/api/auth/health/ready` | Both 200; `ready` reports `cache: redis` and the database up | not 200 | none |
| 19 | Login: sign in on `https://id.test.munaxa.com` with organisation `munaxa-group` and the operator account from the password manager | Signed in; a wrong password is refused; the token's `iss` is `https://id.test.munaxa.com` and header `kid` is `identity-nonprod-2026-11` | any failure | DATA |
| 20 | Operator access check: `https://operator-test.munaxa.com/api/auth/*` answers **403** (A1 has no `operator_access` and `operator_cidrs = []`, so the operator host stays closed); the ALB name directly with a wrong Host answers 404 | As stated | operator host reachable | none |
| 21 | ACM: `aws acm describe-certificate` shows `InUseBy` = the ALB listener while the ALB exists; status ISSUED; browser shows a valid certificate for `id.test.munaxa.com` | As stated | certificate error | none |
| 22 | Dispatch `aws-session.yml` **down** | Run green; 0 ALB, 0 services, database `stopping` then `stopped` | not stopped: dispatch `down` again; the 21:00 UTC backstop is the last line, not the plan | AWS |
| 23 | Read-only evidence (owner authorizes): 0 ALB, 0 running tasks, 0 EIP, RDS `stopped`, backstop 11 ENABLED; CloudTrail: no AccessDenied; Cost Explorer next day (owner) | Recorded in a dated report folder and the index | anything left running | none |

## Cost of one session

Identity only (0.5 vCPU, 1 GB) plus Valkey sidecar inside the same task, the ALB (2 subnets), one
task public IPv4 and two ALB IPv4 addresses, and the database while running: about **US$0.10 an
hour** (Fargate ≈ 0.028, ALB ≈ 0.027 plus LCU, IPv4 3 × 0.005, RDS db.t4g.micro ≈ 0.019) [E, list
prices from the 5 Nov runbook §10]. Run-only tasks cost cents. Config A1 adds **nothing to the idle
cost**: task definitions, IAM roles, security groups and empty log groups are free.
