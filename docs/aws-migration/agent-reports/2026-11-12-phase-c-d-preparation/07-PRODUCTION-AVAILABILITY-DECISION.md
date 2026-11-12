# 07. Production availability decision: one cache node, or two with Multi-AZ

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required, **[V-doc]** stated in AWS or Terraform documentation, not observed.

**This paper does not decide.** It sets out what each choice means so the owner can answer yes or no.
Nothing exists yet. Neither choice affects Testing, which uses the sidecar.

## What the repository already supports

**[V]** `stack/identity-cache.tf` and `variables.tf` (platform#110):
- `identity_cache.replicas` is 0 or 1 (validation refuses more);
- with 1, Terraform sets `num_cache_clusters = 2`, `automatic_failover_enabled = true` and `multi_az_enabled = true`;
- going from 0 to 1 is an in-place change (stack test `a_replica_adds_multi_az_failover_in_place`);
- `snapshot_retention_limit = 0`: no backups, by design (the data is short-lived security state);
- node type: a required input, planned as `cache.t4g.micro`; engine Valkey 8.

So the choice can be made now and changed later without replacing the cache.

## What lives in the cache, and what losing it means

Identity keeps only short-lived security state there **[V]** (04, table "Lost"): rate-limit counters and
penalty blocks, login lockout counters, pending MFA challenges, TOTP replay markers, reauthentication
markers and the permission cache. Accounts, sessions, refresh tokens and MFA factors are in PostgreSQL.

While the cache is unreachable, Identity **fails closed** **[L]** (02, "Redis/Valkey connection failure"):
- credential routes (sign-in, MFA, password change and recovery) answer 503 `AUTH_UNAVAILABLE`;
- `/api/auth/health/ready` reports not ready;
- general API rate limits fail open, as before; token introspection keeps working from PostgreSQL.

When the cache comes back empty, the losses are those of a Testing replacement: fresh rate-limit
allowances, early unlocks, users mid-MFA must start again, and a recently used TOTP code could be
replayed once within its window.

## The two choices

| | **One node** (`replicas = 0`) | **Two nodes, Multi-AZ** (`replicas = 1`) |
| --- | --- | --- |
| Node or AZ failure | ElastiCache replaces the node **[V-doc]**. Sign-in is down until it is back, **[E]** several minutes. The new node is empty | Automatic failover to the replica in the other AZ, **[V-doc]** typically seconds. Identity's READONLY reconnect moves writes to the new primary **[L]** |
| State after the event | All lost (no replica, no snapshot) | Kept, except writes not yet replicated (asynchronous replication, **[V-doc]** a small loss is possible) |
| Maintenance (engine patches) | Downtime during the patch **[E]** | Applied replica first, then a failover **[E]** |
| Effect on Identity tasks | Readiness fails on every task. **[E]** The ALB then marks all targets unhealthy and ECS may replace healthy tasks until the cache is back. More churn, no extra data loss | A failover of seconds; readiness may blink, normally within one ALB check interval |
| Security effect | One fresh allowance per outage for every attacker (counters reset); lockouts lifted early | Normally none |
| Cost **[E]** | About USD 12 to 14 per month (Phase A estimate, on demand, eu-central-1; the pricing tables could not be read here) | About double: USD 24 to 28 per month |
| When it is acceptable | Early production with few users, where a few minutes without sign-in per incident is tolerable | Once sign-in availability matters to schools during the day |

**[U]** None of the failover or replacement times above were measured. They come from AWS documentation
and estimates. Phase E should record one real failover if two nodes are chosen.

## What the choice does not change

- Security of the data at rest and in transit: both use TLS, AUTH, private subnets and the same SG rules.
- Identity configuration: `REDIS_URL` points at the primary endpoint in both cases; failover keeps the endpoint.
- Rotation of the AUTH token (06).

## The owner's decision **[O]**

> For production sign-in, choose one:
> **One node** (about USD 13 a month): if the node fails, sign-in stops for several minutes and the
> short-lived security state is lost.
> **Two nodes in two zones** (about USD 26 a month): a failure switches over in seconds and keeps the state.

Both can be changed later in place. The answer goes into `envs/prod.tfvars` in the Phase E PR.
