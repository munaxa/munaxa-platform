# 01. Identity security state: non-production sidecar and production shared ElastiCache for Valkey

12 Nov 2026. Repository analysis and design only. Nothing in this document has been built, planned
against a real backend, applied or deployed.

Labels: **[V]** verified (file, test or public AWS documentation named next to it), **[E]** estimate,
**[R]** recommendation, **[U]** unverified (what is missing is named), **[O]** owner action.

Baseline: munaxa-platform `0c6421a`, munaxa-identity `a1bf695`. Owner decisions applied as final:
non-production runs one Identity task with one Valkey sidecar; production runs several Identity tasks
on one shared Amazon ElastiCache for Valkey, with no sidecars.

## 1. Summary

- **Non-production is correctly configured for one task and one sidecar [V],** with one gap: an ECS
  rolling deployment briefly runs a second task with its own empty Valkey, because the service uses
  the ECS defaults (100 % minimum healthy, 200 % maximum) [V `infra/aws/modules/service/main.tf`,
  `aws_ecs_service.this` sets neither]. Phase A sets 0 % / 100 % for a service with a sidecar store,
  so the old task is stopped before the new one starts [R; U until the Phase D step 5 test shows how
  ECS counts a draining task].
- **Production has never run Identity [V `infra/aws/stack/envs/prod.tfvars`: `images = {}`,
  `services_enabled = false`].** There is no per-task state to migrate in production. The shared store
  is a first deployment, not a migration. The production tfvars still say `desired_counts.identity = 2`,
  and `valkey_image` would add a sidecar per task; Phase A adds validations that make that combination
  impossible.
- **Every piece of Identity state that must be fleet-wide is already in the one cache port [V §4].**
  Pointing `REDIS_URL` at a shared endpoint makes all of it shared. No Identity code path keeps a
  security counter, challenge or replay marker in process memory in production. Production already
  refuses to start without the Redis-backed MFA replay guard (`assertMfaDistributed`,
  `apps/api/src/platform/security.ts`).
- **One in-process cache is not in Valkey:** the Platform `PermissionResolver` keeps each organisation's
  role hierarchy in a process `Map` with no expiry (`packages/platform/rbac/src/resolver.ts`,
  `#hierarchies`). A role definition written by the seed scripts is already documented as needing an
  Identity restart; with several tasks that means replacing every task (ECS force new deployment).
  This is a process rule, not a store change (§4, item 11).
- **Selected ElastiCache configuration [R]:** node-based ElastiCache for Valkey 8.x, cluster mode
  disabled, one replication group with TLS required, encryption at rest with the environment's data
  KMS key, AUTH token, a custom parameter group with `maxmemory-policy noeviction`, in the isolated
  database subnets, reachable on 6379 only from a dedicated cache-client security group attached to the
  Identity ECS service alone (not the probe or bootstrap tasks, which share Identity's main group). Start with **one
  `cache.t4g.micro` node (about US$10.5 a month [E])**; adding a replica with Multi-AZ automatic
  failover is an in-place change (about US$21 a month for both [E]) with a documented trigger (§7.10).
- **ElastiCache Serverless was evaluated and is not selected [V AWS docs]:** its `maxmemory-policy` is
  fixed at `volatile-lru`, and every Identity security key carries a TTL, so every one of them is an
  eviction candidate; it also needs a cluster-mode client (an Identity code change) and RBAC users. It
  is still ElastiCache for Valkey, so this is a deployment-mode choice inside the owner's decision, not
  a different architecture (§7.2).
- **Two small Identity code changes are needed before production [R]:** reconnect on `READONLY` after a
  failover, and refuse a non-TLS `REDIS_URL` to a non-loopback host in production (§7.7).
- **Credentials stay out of Terraform variables, state, logs and task overrides [R]:** the AUTH token
  is the existing `REDIS_PASSWORD` key of the `munaxa-prod/identity` bundle, read at apply time through
  an ephemeral resource into the write-only `auth_token_wo` argument, so it is never stored in state
  (§7.5). Whether the deployer may read that bundle is an IAM change for the deployment-IAM stage [O].

## 2. Current state (verified)

| Item | Where | Value |
|---|---|---|
| Identity service | `infra/aws/stack/services.tf` `module "identity"` | Fargate, 512 CPU, 1024 MiB, port 4001, public subnets with public IPv4, circuit breaker with rollback |
| Valkey sidecar | same, `sidecars` | `valkey` container, `essential = true`, user 999:999, all capabilities dropped, `valkey-server --bind 127.0.0.1 --port 6379 --protected-mode yes --maxmemory 128mb --maxmemory-policy noeviction --save '' --appendonly no`, password from the bundle's `REDIS_PASSWORD` |
| Start order | `depends_on_sidecars = ["valkey"]` → `dependsOn: HEALTHY` | Identity starts only after `valkey-cli ping` answers `PONG` (interval 10 s, 5 retries, start period 10 s) |
| Image guard | `variables.tf` `valkey_image` validation | Identity cannot be enabled with services on and no sidecar image |
| Valkey image | `envs/nonprod.tfvars` | `public.ecr.aws/valkey/valkey@sha256:757b7e55…` (Valkey 8.1.11) |
| Connection | bundle `munaxa-nonprod/identity` keys `REDIS_URL`, `REDIS_PASSWORD` (`stack/data.tf`) | values written by the operator, never by Terraform |
| Client | `apps/api/src/platform/cache.ts` | ioredis, `lazyConnect`, `maxRetriesPerRequest: 3`, `commandTimeout: 2000`, key prefix `identity:`, standalone (not cluster) client |
| Readiness | `cache.ts` `reachable()` (PING), used by `/api/auth/health/ready` and sign-in | a task whose cache is down is unready and refuses sign-in (fail closed) |
| Desired count | `nonprod.tfvars` / `prod.tfvars` | nonprod `identity = 1`; prod `identity = 2` |
| Production | `prod.tfvars` | `images = {}`, `services_enabled = false`; no Identity task has ever been defined there |
| Database subnets | `stack/network.tf` | three isolated subnets (x.x.64-66.0/24, eu-central-1a/b/c), local routes only |
| Alarms | whole stack | no CloudWatch alarm and no SNS topic exist |
| ElastiCache | whole repository | not referenced anywhere |
| Deployer permissions | `infra/aws/bootstrap/iam_session.tf` | nonprod session deployer only; no `elasticache:*`; production deployment IAM is deferred (owner decision 8 Nov) |

## 3. Non-production topology (one task, one sidecar)

**Confirmed [V]:** one Identity task (`desired_counts.identity = 1`), one Valkey container in that
task, all Identity cache state in it.

| Aspect | Behaviour |
|---|---|
| ECS task configuration | two containers, `awsvpc`, the sidecar listens on 127.0.0.1 only; no port mapping, no security-group rule, so nothing outside the task can reach it |
| Sidecar lifecycle | created and destroyed with the task; `essential = true`, so a Valkey crash stops the task and ECS replaces it |
| Environment and connection | `REDIS_URL=redis://:<password>@127.0.0.1:6379` (operator-written bundle value); `REDIS_PASSWORD` injected into the sidecar from the same bundle version |
| Health and startup | Valkey `HEALTHY` before Identity starts; Identity's own health check, then ALB readiness `/api/auth/health/ready`, which also pings the cache |
| Task replacement | a new task starts with an empty Valkey: every counter, lockout, MFA challenge, reauthentication marker, TOTP replay marker and cached permission set is gone |
| Rolling deployment (gap) | with the ECS defaults a deployment starts the new task before stopping the old one, so for up to a few minutes two tasks with two independent stores receive traffic |
| Security controls | password-protected, loopback only, no persistence (nothing on disk), no capabilities, non-root user, secret from Secrets Manager via the execution role |

**State-loss consequences [V by code, §4]:** sessions, refresh lineages, reset tokens and MFA enrolments
are in PostgreSQL and survive. What is lost: lockouts (an attacker regains at most 10 guesses per account
per restart), edge counters, pending MFA challenges (the user signs in again), reauthentication markers
(the user reauthenticates again), TOTP replay markers (a code used in the last 2 minutes could be used
again, which still needs the password and a fresh challenge), cached permission sets (rebuilt from the
database). This is accepted for Testing (Identity ADR-0002 §1, `services.tf` comment).

**Phase A change for non-production [R]:** give `modules/service` the two optional variables
`deployment_minimum_healthy_percent` and `deployment_maximum_percent`, and set them to 0 and 100 for
Identity while it has a sidecar store. A deployment then stops the old task before starting the new one:
about one minute of Identity downtime per deployment in Testing, and the old store is gone before the new one serves (to be confirmed by the Phase D step 5 test). The circuit
breaker still rolls back. Production does not use this setting.

## 4. Security-state inventory

Every key below is written through the one `CachePort` built in `buildSecurityStack`
(`apps/api/src/platform/security.ts`), under the `identity:` prefix, with single-key commands only [V:
`RedisCache` uses `GET`, `SET [NX] [PX|KEEPTTL]`, `DEL key`, `EXISTS key`, and a one-key Lua script for
`increment`; `clear()` is the only multi-key path and nothing in Identity's runtime calls it except
`invalidateTenant`, see item 10].

| # | State | Current storage (code) | Key shape (after `identity:`) | TTL | Required shared behaviour | Failure consequence if per task or lost |
|---|---|---|---|---|---|---|
| 1 | Edge rate-limit counters: sign-in per identifier and per address, reset per address, six MFA routes per session/challenge and per address | `AuthEdgeLimiter` → Platform `RateLimiter` (`security/auth-edge-limits.ts`) | `rl:<rule>:<tenant>:<subject>:<bucket>` | rule window × 2 | one counter per rule and subject across all tasks, atomic increment | per task: each limit is multiplied by the task count; lost: counts restart |
| 2 | General edge limits (`api-per-ip` sliding window; `api-per-user` token bucket) and introspection limits (identity#15) | `RateLimiter` (`edgeRules()`, `createIntrospectionLimiter`) | `rl:<rule>:<tenant>:<subject>[:<bucket>]`; the token bucket has no bucket suffix | window × 2; token bucket about 12 s (`cache/src/counters.ts`) | shared | same; these admit on a store failure by design. The token bucket is a best-effort GET then SET (`RedisCache` has no compare-and-set), so concurrent requests on two tasks can lose an update; acceptable for a general rule that admits on failure anyway |
| 3 | Adaptive block state | Platform `RateLimiter` `:block`, `:violations` keys | `rl:…:block`, `rl:…:violations` | penalty; 32 windows | shared | Identity's rules are all non-adaptive [V identity#16], so Identity writes none today; Platform 2.5.0 keeps them per rule and subject if a rule becomes adaptive |
| 4 | Account lockout counters and lock | Platform `LoginService` (`auth/src/login.ts`) | `auth:failures:<tenant>:<digest>` and `auth:lock:<tenant>:<digest>` (digest of the trimmed lowercased identifier) | failures: `attemptWindow` (15 min default, not set by Identity); lock: `LOGIN_LOCKOUT` (15 min) | shared, so 10 failures lock on every task | per task: 10 × task count guesses; lost: unlocked early |
| 5 | MFA login and enrolment challenges and their attempt counters | `MfaChallenges` (`mfa/mfa-challenges.ts`) | `mfa:challenge:<sha256>` and `mfa:challenge-attempts:<sha256>` | `MFA_CHALLENGE_TTL` 5 min; `MFA_ENROLLMENT_CHALLENGE_TTL` 10 min | shared: a challenge started on task A must be redeemable on task B, and its attempt counter must be one | per task: the ALB sends the second request to another task and the challenge is unknown (sign-in fails), or 5 × task count attempts; lost: user starts again |
| 6 | MFA failures per account (across challenges) | `MfaFailureCounter` | `mfa:failures:<tenant>:<user>` | 15 min window | shared | per task: limit multiplied |
| 7 | TOTP replay protection | Platform `MfaService.#claimStep` via `replayGuard = cache` (`mfa/mfa-runtime.ts`) | `mfa:totp:<tenant>:<user>:<step>` (`SET NX`) | `period × (2 × window + 2)` = 120 s at the defaults | shared: a code accepted on one task is refused on every task | per task: a code can be replayed once per task; production refuses to start without it (`assertMfaDistributed`) |
| 8 | Recent-reauthentication markers | `Reauthentication` (`mfa/reauthentication.ts`) | per (tenant, session) | `MFA_REAUTH_WINDOW` 5 min | shared, or a step-up done on A is not honoured on B | per task: users asked again (usability, not a bypass); lost: same |
| 9 | Password reset request limits and password-change limits | `ResetRequestLimiter`, `createChangeLimiter` (`password/*.ts`) | `rl:…` | window × 2 | shared | per task: limit multiplied; reset is `disabled` in production today [V `services.tf`] |
| 10 | Cached permission sets | Platform `PermissionResolver` (`rbac/src/resolver.ts`) | `rbac:<tenant>:<user>` | 60 s | shared, so `RoleAdministration` invalidation reaches every task | per task: a revoked grant stays live on other tasks up to 60 s; `invalidateTenant` calls `clear()` (SCAN + multi-key `DEL`), which is valid on a cluster-mode-disabled group and would fail with `CROSSSLOT` on a cluster-mode (or Serverless) cache |
| 11 | Role hierarchy per organisation | `PermissionResolver.#hierarchies`, **process memory**, no TTL | — | until restart | not in Valkey; must be refreshed on every task | already documented: role definitions written by `seed-*-roles.mjs` need an Identity restart; with several tasks, replace every task (ECS force new deployment). While old tasks still run during the rolling replacement, they can write permission sets resolved from the stale hierarchy into the shared cache (item 10), and new tasks then read them for up to 60 s. Rule: after every task is replaced, wait 60 s before relying on the role change |
| 12 | Concurrent-session limit | `PrismaSessionStore.createWithinLimit` (PostgreSQL advisory lock, `persistence/session-store.adapter.ts`), taken first by `SessionManager.create` (`session/src/manager.ts`, path 1) | — | — | already shared (database) | none. The `CacheLock` path 2 is not used by Identity. Note: `CacheLock.release` is a non-atomic GET then DEL (`cache/src/locks.ts`); nothing in Identity relies on it today |
| 13 | Pending MFA enrolment | PostgreSQL (`pending` view, `mfa-enrollment-store.adapter.ts`) | — | 15 min (in the row) | already shared | none |
| 14 | Sessions, refresh lineages, reset tokens, audit | PostgreSQL | — | — | already shared | none |

**Conclusion [V]:** with one shared store, items 1 to 10 are shared without a code change, and no
security state remains task-local. Item 11 is an in-process cache with an operational rule. The
architecture is complete on this point only because the MFA, replay and lockout state is in the same
port as the rate counters; the inventory shows that it is.

## 5. Production topology (selected)

```
             ALB (public subnets a, b)
               │ 4001
     ┌─────────┴─────────┐
 Identity task 1     Identity task 2 … n      (public subnets, no sidecar)
     │ 6379 TLS + AUTH   │
     └─────────┬─────────┘
   munaxa-prod-identity-cache   (ElastiCache for Valkey, cluster mode disabled)
   primary endpoint, isolated DB subnets a, b, c, no public IP
```

All Identity tasks read the same `REDIS_URL` from the same pinned bundle version, so they use the same
primary endpoint and the same state [V by construction: one `secret_version_id` per service in
`module "identity"`].

## 6. Terraform resources (Phase A, not written yet)

New file `infra/aws/stack/identity-cache.tf`, created only when `var.identity_cache != null`. None of
it references `module.identity`, which exists only once an Identity image is pinned (`count =
local.defined.identity_api`), so the cache can be created and its bundle prepared before the
production image is pinned.

| Resource | Settings |
|---|---|
| `aws_security_group.identity_cache` | "Identity's ElastiCache: 6379 from the cache-client group only"; no egress rules |
| `aws_security_group.identity_cache_client` | "Identity service tasks that may reach the cache"; attached only to the Identity ECS service |
| `aws_vpc_security_group_ingress_rule.identity_cache_from_client` | tcp 6379 on the cache group, `referenced_security_group_id = identity_cache_client` |
| `aws_vpc_security_group_egress_rule.identity_cache_client_to_cache` | tcp 6379 on the client group, to the cache group |
| Service attachment | new optional `modules/service` variable `extra_security_group_ids` (default `[]`), added to `aws_ecs_service.network_configuration.security_groups` only, never to run-only tasks. The probe and bootstrap tasks run with Identity's main group (`identity-probe.tf`, output `identity_group`), so they are not admitted |
| `aws_elasticache_subnet_group.identity` | the three `aws_subnet.db` subnets |
| `aws_elasticache_parameter_group.identity` | family `valkey8`; `maxmemory-policy = noeviction` |
| `aws_elasticache_replication_group.identity` | `engine = "valkey"`, `engine_version = "8.1"` (parity with the 8.1.11 sidecar), `node_type = var.identity_cache.node_type` (`cache.t4g.micro`), `num_cache_clusters = 1 + var.identity_cache.replicas` (0 or 1), `automatic_failover_enabled` and `multi_az_enabled = replicas > 0`, `port = 6379`, `transit_encryption_enabled = true`, `transit_encryption_mode = "required"`, `at_rest_encryption_enabled = true`, `kms_key_id = aws_kms_key.data.arn`, `auth_token_wo` + `auth_token_wo_version` (§7.5), `auth_token_update_strategy = "ROTATE"` for rotations, `snapshot_retention_limit = 0`, `maintenance_window` outside school hours (for example `sun:02:30-sun:03:30`, after the RDS window), `auto_minor_version_upgrade = true`, `apply_immediately = false`, `slow-log` delivery to `/munaxa/prod/identity-cache` (KMS-encrypted log group; the data key policy already admits `/munaxa/<env>/*`) |
| `aws_cloudwatch_metric_alarm.*` and `aws_sns_topic.ops` | §7.9; the subscription address is an operator input, never in the repository |
| `output "identity_cache_endpoint"` | the primary endpoint address (not a secret), so the operator can write `REDIS_URL` |

Variables and validations (`variables.tf`):

- `identity_cache = null | object({ node_type = string, replicas = number, engine_version = string, auth_token_version = number })`.
- **Changed existing rule** (`variables.tf`, `valkey_image` validation, today `valkey_image != "" ||
  images.identity_api == "" || !services_enabled`): becomes `valkey_image != "" || identity_cache !=
  null || images.identity_api == "" || !services_enabled`. Without this change the existing rule refuses
  the production design.
- `identity_cache != null` and `valkey_image != ""` are mutually exclusive.
- **Unconditional:** `var.environment != "prod" || var.valkey_image == ""`. Production can never register
  a sidecar task definition, even with services off or no image (with `skip_destroy`, a registered
  revision would otherwise remain a rollback target).
- `var.environment == "prod"` and `images.identity_api != ""` ⇒ `identity_cache != null` (regardless of
  `services_enabled`).
- `valkey_image != ""` ⇒ `lookup(var.desired_counts, "identity", 1) <= 1` (one task per sidecar store, in every environment).
- Each validation gets a mocked `terraform test` that proves it refuses the combination.
- `identity_cache != null` ⇒ `lookup(var.secret_version_ids, "identity", "") != ""`, so the ephemeral read
  always uses a pinned bundle version. Ephemeral resources are read at plan time too, so the **plan**
  role, not only the apply role, needs the bundle read [O, deployment-IAM stage].
- `prod.tfvars` gets `identity_cache = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }`
  only in the Phase E PR, after `REDIS_PASSWORD` is written and pinned; Phase A proves the cache with
  mocked tests only. `valkey_image` stays unset.
- `nonprod.tfvars`: unchanged. The non-production plan must show no change to existing resources apart
  from the deployment percentages of the Identity service (Phase A acceptance).

**Separation [R]:** both environments use the same stack; the store is chosen by inputs, and the
validations refuse a production configuration with a sidecar and a sidecar configuration with more
than one task. Nonprod never creates an ElastiCache resource (count 0).

## 7. Design details

### 7.1 Subnets and network isolation [V network.tf, R]
The isolated database subnets have only local routes, so the cache has no path to or from the internet,
like RDS. ElastiCache nodes get no public IP in a VPC subnet group. Only the dedicated cache-client
group is admitted on 6379, and only the Identity ECS service carries it. No other service, the db-admin
task or the ALB is admitted. The probe and bootstrap tasks run in Identity's main security group, not
the client group, so they are not admitted either; they do not use the cache. (Admitting Identity's main
group instead would have let the probe reach the port.)

### 7.2 Why node-based, not Serverless [V AWS docs, R]

| Property | Node-based, cluster mode disabled | Serverless |
|---|---|---|
| Eviction policy | custom parameter group, `noeviction` allowed | fixed `volatile-lru`, "all Valkey or Redis OSS configuration is not modifiable" (ElastiCache User Guide, RedisConfiguration) |
| Client | standalone ioredis works unchanged | "only accessible using clients that support … cluster mode" (User Guide, wwe-troubleshooting) |
| Multi-key commands | `clear()` (SCAN + multi-key DEL) works | multi-key only within one hash slot |
| Authentication | AUTH token (needs TLS) or RBAC | RBAC only ("All serverless caches must use RBAC", User Guide, auth) |
| Availability | single node, or primary + replica Multi-AZ | always across three AZs |
| Minimum cost [E] | about US$10.5/month (one t4g.micro) | about US$6.1/month at the 100 MB minimum in us-east-1 (Frankfurt rate not verified), plus ECPUs |

Every Identity security key carries a TTL (§4), so under `volatile-lru` a flood of new keys (for
example sign-in attempts for many identifiers) can evict lockout counters, challenge attempt counters or
replay markers: a bypass, not a refusal. With `noeviction` a full store refuses writes, and Identity's
credential routes then fail closed with 503 (identity#16). That property decides the choice; Serverless
is cheaper only at the very bottom and needs a client change.

### 7.3 TLS [V AWS docs, V ioredis README]
`transit_encryption_mode = "required"` refuses plaintext. ioredis enables TLS from a `rediss://` URL
with no code change. ElastiCache presents an Amazon-issued certificate, which Node's default trust store
accepts [U: to be confirmed in the Phase D or E connection check, since no cache exists to test against].

### 7.4 Encryption at rest [V AWS docs]
`at_rest_encryption_enabled = true` with `kms_key_id = aws_kms_key.data.arn`, the key that already
encrypts RDS, the bundles and the logs. ElastiCache uses KMS grants created on the caller's behalf; the
key policy delegates to IAM (`AccountAdministration`), so the deployer needs `kms:CreateGrant` and
`kms:DescribeKey` on that key [U: exact action list to be confirmed against the ElastiCache
documentation when the deployer policy is written].

### 7.5 Authentication and secret references [R]
- Identity's view does not change: it reads `REDIS_URL` from the bundle as today. Production value:
  `rediss://:<token>@<primary endpoint>:6379`.
- The cache's AUTH token must equal the token in that URL. It is the bundle's existing `REDIS_PASSWORD`
  key, so no new key is added.
- **Order:** (1) the operator writes a bundle version with `REDIS_PASSWORD` (the token) and pins it;
  (2) the apply creates the cache, reading that pinned version; (3) the operator writes the next bundle
  version adding `REDIS_URL` with the endpoint and the same password, and pins it. Step 3 must not bump
  `auth_token_version`, so the cache token is not changed by it.
- Terraform reads it with `ephemeral "aws_secretsmanager_secret_version"` (bundle ARN, pinned version)
  and passes `jsondecode(...).REDIS_PASSWORD` to `auth_token_wo`. A write-only argument is never stored
  in state or plan files [V: Terraform AWS provider docs for `aws_elasticache_replication_group`,
  "`auth_token_wo` … will not be stored in state"]. The repository pins Terraform `~> 1.16.5` and the AWS
  provider `~> 6.67` [V `stack/versions.tf`]; write-only arguments need Terraform 1.11 or later.
  [U: that the pinned provider exposes the ephemeral secret-version resource, to be proven by a mocked
  `terraform test` in Phase A.]
- Rotation: write a new `REDIS_PASSWORD` and `REDIS_URL` version, bump `auth_token_version` with
  `auth_token_update_strategy = "ROTATE"` (old and new tokens both accepted), roll Identity onto the
  new bundle version, then `SET` to drop the old token [V AWS docs: ROTATE then SET, Valkey 7.2 or
  later]. After `SET`, every older task definition revision carries a bundle version with the old
  token, so an automatic or manual rollback to it fails closed (cache unreachable, 503) rather than
  succeeding. The circuit breaker chooses its own target, so its rollback is a fail-closed 503; for a manual rollback, choose a revision pinned to the current bundle version.
- Token format: 16 to 128 printable characters, without `"`, `/` or `@` (ElastiCache AUTH rules) [U:
  exact character rules to be copied from the AWS documentation into the operator guide]; the URL form
  also needs URL-safe characters, so the operator generates a URL-safe token.
- What this needs from IAM [O, deployment-IAM stage]: the production deployer may call
  `secretsmanager:GetSecretValue` on `munaxa-prod/identity` (plus `kms:Decrypt` via Secrets Manager).
  That widens the deployer. **Fallback without that permission:** create the group without
  `auth_token_wo`, then the operator sets the token with ModifyReplicationGroup `ROTATE` followed
  immediately by `SET`. Between those two calls the group also accepts unauthenticated connections
  [V AWS docs], and only the cache-client group can reach it. Either is acceptable; the ephemeral
  read is recommended because there is no unauthenticated window.
- IAM authentication (no static secret) is supported for Valkey 7.2+ but needs Identity to mint a SigV4
  token every 15 minutes and reconnect within 12 hours [V AWS docs]; ioredis has no built-in provider.
  Not selected now; a later hardening option.
- Nothing goes into Terraform variables, task overrides, logs or reports. The task definition carries
  only the bundle ARN reference, as today.

### 7.6 Parameter group [V AWS docs]
`valkey8` family, `maxmemory-policy noeviction`. Defaults otherwise (`reserved-memory-percent` 25 %).
No `SELECT`: Identity uses database 0.

### 7.7 Connection management (Identity code changes, Phase A) [R]
1. `reconnectOnError: (error) => error.message.startsWith('READONLY')` in `openCache`. After a failover
   the old primary becomes a replica; a connection still open to it answers writes with `READONLY`, and
   ioredis then reconnects through the primary endpoint's new address. Without it, writes keep failing
   until the connection drops.
2. Configuration check in `packages/config`: in production, a `REDIS_URL` whose host is not loopback
   must use `rediss://` and carry a password. The sidecar (loopback) stays `redis://`.
3. Unchanged: `commandTimeout` 2 s, `maxRetriesPerRequest` 3, readiness PING, fail-closed credential
   routes. One connection per task; at 2 to 4 tasks the cache sees a handful of connections.
4. Tests: integration against a TLS `redis-server` with `requirepass`; a `READONLY` injection test
   (a replica promoted with `REPLICAOF`); the existing two-instance HTTP suite run against that server.

### 7.8 Health checks
Identity's readiness already pings the cache. During a cache outage every task becomes unready at once;
the ALB then sends traffic to all of them anyway (all-unhealthy behaviour), and Identity answers 503 on
credential routes. No separate cache health check exists at the ALB; ElastiCache health is watched by
alarms (§7.9).

### 7.9 Monitoring and alerting [V metric names in AWS docs, R thresholds]
SNS topic `munaxa-prod-ops` (email subscription confirmed by the owner [O]). Alarms on the replication
group: `CPUUtilization` > 80 % for 15 min (the metric for nodes with 2 vCPUs or fewer);
`DatabaseMemoryUsagePercentage` > 70 % [U: metric name not confirmed on the page read]; `Evictions` > 0
(must never happen with `noeviction`; a non-zero value means the policy is wrong); `CurrConnections` > 200;
`ReplicationLag` > 5 s (only with a replica). Plus an Identity log metric filter on
`SECURITY_RATE_LIMIT_UNAVAILABLE` / `AUTH_UNAVAILABLE` 503s. Cost: five alarms, about US$0.50 a month [E].

### 7.10 Failure, failover and availability trade-off [V AWS docs, E]

| Configuration | Monthly cost [E] | Node failure | AZ failure | Matches |
|---|---|---|---|---|
| **P1 (selected start): 1 × cache.t4g.micro** | about US$10.5 | ElastiCache replaces the node on the same endpoint; minutes of 503 on credential routes; state reset | same as node failure, if the AZ has capacity | the production database, which is single-AZ (`multi_az = false`, `stack/data.tf`) |
| P2: primary + replica, Multi-AZ automatic failover | about US$21.0 | failover "typically a few seconds"; asynchronous replication can lose the last writes | same | a future Multi-AZ database |

Evidence for P1: Identity's availability already depends on one single-AZ PostgreSQL instance; a
replica cache does not raise it above the database's. Upgrade P1 → P2 by setting `replicas = 1`: an
in-place modification, same endpoint, no state loss [R; U: the exact in-place behaviour when enabling
Multi-AZ on a one-node group to be confirmed in the plan for that change]. Trigger: the database goes
Multi-AZ, or an availability objective for sign-in is set. Either way the failure mode is fail closed:
sign-in, reset and MFA refuse with 503; they never admit unlimited attempts.

### 7.11 Backup and recovery [R]
No snapshots (`snapshot_retention_limit = 0`). All state is short-lived (5 min to 15 min, 60 s for
permissions), and restoring a snapshot would bring back expired lockouts, replay markers and stale
permission sets. Recovery is an intentional reset: an empty store is safe (§4 consequences). Nothing to
pay for backup storage.

### 7.12 Scaling and capacity [E]
A t4g.micro has 0.5 GiB; with 25 % reserved about 0.37 GiB is usable. Keys are a few hundred bytes; at
1 KiB each that is about 380,000 live keys. A school morning (§8 of the rate-limit report: about 900
sign-ins per 15 min per site) writes a few keys per sign-in, so tens of sites fit with large headroom.
Scale up the node type (t4g.small, about US$21 a month for one node [E]) if memory passes 70 %.
CPU credits of a burstable node are not a concern at this rate [E].

### 7.13 Cost assumptions
- Prices: eu-central-1 on-demand Valkey cache.t4g.micro US$0.0144 an hour, cache.t4g.small US$0.0288,
  from a third-party price index (cloudprice.net). AWS's own table did not render without JavaScript.
  The figure equals the Redis OSS price less AWS's published 20 % Valkey discount. [E, U official
  Frankfurt rate]. 730 hours a month.
- Data transfer between Identity tasks and the cache inside one VPC across AZs: a few GB a month at
  most, cents [E].
- No backup storage, no reserved nodes. Total for P1 with alarms about US$11 a month; P2 about US$21.5.
- Not included, expected to be cents: CloudWatch Logs ingestion and storage for the slow-log delivery
  (only slow commands are logged), and KMS requests for the at-rest key grants [E].
- Non-production: no additional cost; the sidecar uses the task's existing CPU and memory.

## 8. Migration and rollback

Full sequence in `04-PHASED-ROLLOUT-AND-ROLLBACK.md` (Phase E). Key points:

- **Production has no per-task state to migrate [V prod.tfvars].** The first production Identity runs on
  the shared cache from its first task.
- **If a per-task deployment ever existed** (or for any store change), the migration is an intentional
  state reset, not a data copy: sidecars have no persistence and ECS Exec is disabled
  (`enable_execute_command = false`), so there is nothing to copy. Sessions and refresh tokens are in
  PostgreSQL and survive; pending MFA challenges and reauthentication markers are lost (users repeat a
  step).
- **Preventing replay across a store switch:** stop all Identity tasks, keep zero tasks for at least
  the TOTP replay window (120 s; use 5 minutes for margin), then start on the new store. Pending MFA
  challenges (5 or 10 min) and reauthentication markers are simply lost with the old store; they cannot
  be replayed on the new one. Lockouts and counters restart, which gives at most one extra lockout
  allowance per account.
- **The old store must become unusable before the new one starts.** Every task definition revision pins
  its own bundle version, so a rollback target (the circuit breaker's automatic rollback, or a manual
  previous revision kept by `skip_destroy`) still carries the old `REDIS_URL` and token. If the old store
  still existed, a failed deployment would roll back onto it, bringing back stale lockout and replay
  state, and during a rolling deployment tasks on both stores would run at once. The switch procedure
  therefore deletes the old store, or at least revokes its token, before any task starts on the new
  one; a rollback onto it then fails closed.
- **Rollback must not reintroduce per-task stores:** the validations refuse any production sidecar,
  even with services off, and any sidecar with more than one task. Production has never registered a
  sidecar revision, and the unconditional rule keeps it that way, so application rollbacks keep the
  shared cache. If the cache itself fails, the fallback is fail closed, not a sidecar. A deliberate
  emergency fallback to one task with a sidecar is a reviewed change that relaxes the production
  validation, and needs owner approval [O].
- **No snapshot restore**, so a rollback can never bring back old security state.

## 9. Open points (smallest decisions; none blocks the selected architecture)

1. [O, deployment-IAM stage] Allow the production deployer to read `munaxa-prod/identity` for the
   ephemeral AUTH token, or accept the ROTATE-then-SET fallback.
2. [O, production gate] P1 (single node) at launch, or P2 (Multi-AZ, about +US$10.5 a month).
   The recommendation is P1 until the database is Multi-AZ.
3. [U] Official eu-central-1 ElastiCache Valkey rates (pricing page needs JavaScript; Price List API is
   an AWS call and was not used).
4. [U] Ephemeral secret-version resource support in the pinned provider; proven by a mocked test in
   Phase A.
