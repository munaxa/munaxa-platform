# 01. Implementation details

## A1. ECS deployment percentages (platform#110)

`infra/aws/modules/service`:

- New optional inputs `deployment_minimum_healthy_percent` (null or a whole number 0 to 100) and
  `deployment_maximum_percent` (null or 100 to 200). Null keeps the ECS defaults (100/200), so every
  service except Identity in Testing plans exactly as on main **[L]** (test asserts the other services).
- Validation: minimum below maximum (100/100 would deadlock a one-task service).
- `single_task_store` (bool): a task carrying its own store must run at most one task and deploy 0/100.
  Sidecars may not publish ports (validation).
- `extra_security_group_ids` (default `[]`): appended to the service's network configuration only.
- Output `service_deployment` exposes the percentages, circuit breaker, rollback, desired count and
  security groups for tests.
- The deployment circuit breaker with rollback is unchanged and asserted **[L]**.

`infra/aws/stack/services.tf`: Identity gets `single_task_store = var.valkey_image != ""` and 0/100
when the sidecar is set, null otherwise. The README section "Identity in Testing: deployments"
documents the expected outage: **[E] about one to two minutes per deployment** (deregistration 15 s,
SIGTERM, image pull, Valkey healthy, Identity health, two ALB checks 15 s apart). Sessions and refresh
tokens are in PostgreSQL and survive; the sidecar's counters, lockouts, pending MFA challenges and
replay markers start empty, as on any replacement.

**[U]** Whether ECS counts a draining task towards the 100 % maximum: observed in the first Testing
session with a forced deployment (ECS events). Until then "never two stores" is verified in plan only.

New CI step: `.github/workflows/aws-terraform.yml` static job inits and tests `modules/service`
(lockfile copied from the stack, works with `-lockfile=readonly`).

## A2. Production ElastiCache for Valkey (platform#110, `stack/identity-cache.tf`)

Every resource has `count = local.identity_cache` (`var.identity_cache != null`).

| Requirement | Implementation |
| --- | --- |
| Node-based, cluster mode disabled | `aws_elasticache_replication_group`, `num_cache_clusters = 1 + replicas`, engine `valkey`, version `8.x` (validated) |
| One cache.t4g.micro now, in-place Multi-AZ later | `node_type` validated, `replicas` 0 or 1; with 1, automatic failover and Multi-AZ on |
| TLS required | `transit_encryption_enabled = true`, `transit_encryption_mode = "required"`; postcondition |
| At-rest encryption with the data key | `at_rest_encryption_enabled`, `kms_key_id = aws_kms_key.data.arn`; postcondition |
| AUTH token | `auth_token_wo` + `auth_token_wo_version` (write-only), strategy ROTATE or SET |
| noeviction | parameter group family `valkey8`, `maxmemory-policy = noeviction` |
| Isolated DB subnets | subnet group over `aws_subnet.db` (no route to the internet) |
| Dedicated client SG on the Identity service only | `identity_cache_client` attached via `extra_security_group_ids` of the Identity module only; probe, bootstrap and db-admin tasks use other groups (test) |
| Cache SG | ingress 6379 from the client group only, no egress rules |
| No public access | private subnets, SG above; ElastiCache has no public endpoint option |
| No snapshots | `snapshot_retention_limit = 0`, no final snapshot |
| Alarms to ops SNS | per member: CPU > 80 % (3 x 300 s), DatabaseMemoryUsagePercentage > 70 % (missing data breaching), Evictions > 0, CurrConnections > 200; ReplicationLag > 5 s on replicas |
| Ops topic | `aws_sns_topic.ops` encrypted with the data key; topic policy: CloudWatch publish from this account's alarms only, deny without TLS; KMS statement for CloudWatch with `aws:SourceAccount` only when the cache exists, so the Testing key policy is unchanged |
| Engine logs | **none**: Valkey's slow log records command values (MFA and session state); see 02 |
| Maintenance | `sun:03:30-sun:04:30` (after the database window), minor upgrades automatic, `apply_immediately = false` |

`stack/variables.tf`: `identity_cache` object (node type, replicas, engine version, token version,
strategy) with validations: production only, exclusive with `valkey_image`, a production Identity
image requires it, `secret_version_ids.identity` must be pinned. The "some store for Identity" rule
moved here from `valkey_image` to avoid a validation cycle. `valkey_image` must be empty in prod,
and the sidecar implies at most one Identity task.

Output `identity_cache` = `{primary_endpoint, port, ops_topic_arn}`, null without the cache.

## A3. Validations

The ten strict validations requested are all present and each has a failing-case test **[L]**:
production only; exclusive with the sidecar; prod image needs the cache; pinned bundle version;
node type; replicas 0 or 1; engine 8.x; token version a whole number from 1; strategy ROTATE or SET;
token shape (precondition, 32 to 128 of `[A-Za-z0-9-]`; corrected in platform#114, see 2026-11-12-phase-c-d-preparation/05, message never quotes it).

**[V]** Provider check: the pinned `hashicorp/aws` 6.67.0 schema lists `auth_token_wo` as `write_only`
and `sensitive`, `auth_token_wo_version`, and the ephemeral `aws_secretsmanager_secret_version`.
Terraform 1.16.5 supports write-only arguments and ephemeral resources. No provider or Terraform
version was changed.

## A4. The AUTH token never stored

- `modules/secret-key-ephemeral`: an `ephemeral "aws_secretsmanager_secret_version"` reading the bundle
  at the pinned version, output `value` ephemeral and sensitive (one JSON key).
- The stack calls it as `module.identity_cache_auth` through the provider alias `aws.ephemeral_secrets`,
  configured identically to the default provider.
- **Why the module and alias:** Terraform 1.16.5 mock providers refuse ephemeral resources ("The provider
  mocking mechanism does not yet support ephemeral resource types"), even at count 0 **[L]**. In
  tests the alias is a real but offline provider (fake keys, unreachable endpoints) and the module is
  replaced with `override_module` returning a fixed placeholder. No test fixture contains a secret.
- The token reaches only `auth_token_wo`: not in a variable, output, state or plan **[V]** by schema
  and code reading; **[U]** a real plan file inspected in Phase E.
- No secret was read in this task.
- Permissions the production plan and apply roles will need are in `infra/aws/README.md`, including
  the Deny exception (owner decision) and the alternative if declined.

## A5. Identity cache connection (identity#17)

`apps/api/src/platform/cache.ts`:

- `reconnectOnError` returns **1** on `READONLY` only: the refused command fails closed to its caller,
  the connection is reopened, and the next command reaches whatever the DNS name now resolves to. It
  never resends (round 1 finding I1).
- `rediss://` sets TLS with `rejectUnauthorized: true`, TLS 1.2 minimum and the server name (IPv6
  brackets stripped). `tls.ca` exists only for tests.
- `reachable()` asks `ROLE` and is true only for `master`, so a task connected to a replica is not ready.
- `commandTimeout` 2 s, `maxRetriesPerRequest` 3, lazy connect, unchanged fail-closed semantics.

`packages/config/src/redis-url.ts` (production only): scheme redis or rediss; a non-loopback host must
use rediss; a password is required; no query string (ioredis copies query values into options);
loopback is 127.0.0.0/8 in canonical decimal, `::1`, `localhost`; problems never quote the URL;
`redactRedisUrl` for `describeEnvironment`. `environment.ts` refuses a blank (after trim) `REDIS_URL`
in production.

Unchanged and re-tested: loopback sidecar in Testing, fail-closed on store loss, MFA `setIfAbsent`
replay protection, lockout counting, identity#16 edge limits.

## B1. Release workflow (platform#111)

- `scripts/release-packages.mjs`: the release list is `fixed[0]` of `.changeset/config.json`, which must
  equal `LOCKSTEP` in `scripts/verify-release.mjs`; exactly 13 public packages under `packages/platform/`
  at one version; names `@munaxa/[a-z-]+` only. Modes `--names`, `--filters`, `--versions`.
- `.github/workflows/release.yml`: `workflow_dispatch` only, concurrency `release` without cancelling.
  Job `dry-run` (`contents: read` only) builds, tests, runs `release:check` and packs. Job `publish`
  (`packages: write`) starts with the main-and-dispatch guard and repeats it in the step condition.
  Both refuse a package list that is not exactly 13 filters. All actions pinned by SHA,
  `persist-credentials: false`.
- `scripts/release-packages.test.mjs`: 19 tests, run in CI; the old workflow fails 10.

## B2. Version PR (platform#112)

28 files: 13 `package.json` 2.4.1 to 2.5.0, 13 CHANGELOGs, the two consumed changesets (#100 `116650c`,
#107 `bc1f21b`). Licensing stays 0.2.0; lockfile unchanged. The changelog was generated with an offline
stand-in of the GitHub changelog plugin (no network to the GitHub API); attribution and hashes were
checked by the reviewer.
