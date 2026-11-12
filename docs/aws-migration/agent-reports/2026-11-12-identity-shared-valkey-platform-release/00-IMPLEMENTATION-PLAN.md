# Identity shared security state and Platform release: implementation plan

12 Nov 2026. Task: repository-only implementation planning and release preparation for the Identity
multi-instance security architecture and the Platform rate-limiter release. Baseline:
`2026-11-12-identity-platform-rate-limiting/00-REPORT.md`.

**Nothing was deployed, applied, published, dispatched or tagged. No AWS API was called** (§9).

Labels: **[V]** verified, **[E]** estimate, **[R]** recommendation, **[U]** unverified, **[O]** owner action.

| File | Content |
|---|---|
| `00-IMPLEMENTATION-PLAN.md` | this summary |
| `01-IDENTITY-SHARED-VALKEY-DESIGN.md` | non-production sidecar check, production ElastiCache design, security-state inventory, cost, migration |
| `02-PLATFORM-RELEASE-PLAN.md` | 2.5.0 release content, checklist, Identity adoption checks |
| `03-CROSS-PRODUCT-CONSUMER-ASSESSMENT.md` | dependency matrix for the six products |
| `04-PHASED-ROLLOUT-AND-ROLLBACK.md` | Phases A to F with tests, acceptance, rollback and authorization |
| `05-INDEPENDENT-REVIEW.md` | the independent review (1 High, 7 Medium, 9 Low or Info) and how each finding was resolved |
| `supporting/compatibility-run.txt`, `supporting/platform-2.5.0-candidate-SHA256SUMS.txt` | evidence of the local candidate build and test runs |

## 1. Owner decisions applied (final, not reopened)

- Non-production: one Identity ECS task, one Valkey sidecar in it, all Identity security state in it.
- Production: several Identity tasks, one shared Amazon ElastiCache for Valkey, no sidecars, no
  independent Identity/Valkey pairs.
- Platform: controlled release of the merged fix, then a separate, compatibility-tested Identity
  adoption; other products only where they consume affected code.

## 2. Repository state [V]

| Repository | Default branch head |
|---|---|
| munaxa-platform | `0c6421a` (#108 report; #107 is `bc1f21b`, the commit before) |
| munaxa-identity | `a1bf695` (#16, still the head) |
| munaxa-work | `eabcc47` |
| munaxa-control | `1f58c90` |
| munaxa-school | `4c2b4a4` |
| munaxa-docs | `9d06698` |

Platform #107 `bc1f21b` and Identity #16 `a1bf695` are on their default branches. Full SHAs in `03`.

## 3. Confirmed topologies

**Non-production [V]:** one task, one sidecar, correctly configured (loopback only, password from the
bundle, `noeviction`, no persistence, Identity waits for Valkey HEALTHY). One gap: ECS rolling
deployments briefly run two tasks with two stores; Phase A sets 0 % / 100 % deployment percentages for
a sidecar-store service (`01` §3), to be confirmed by a forced deployment in Phase D.

**Production [R, within the decision]:** node-based ElastiCache for Valkey 8.1, cluster mode disabled,
TLS required, at-rest encryption with the environment data key, AUTH token from the existing bundle key
through a write-only Terraform argument (never in state), `noeviction` parameter group, isolated database
subnets, ingress only from a cache-client group carried by the Identity service alone (not the probe), no snapshots, alarms to an ops SNS topic. Start
with one `cache.t4g.micro` (P1); add a Multi-AZ replica (P2) in place when the database goes Multi-AZ.
Production has never run Identity, so there is nothing to migrate (`01` §5 to §8).

Serverless was evaluated and not selected: fixed `volatile-lru` eviction would let a key flood evict
lockout and replay keys, it needs a cluster-mode client, and it supports RBAC only (`01` §7.2).

**Security-state inventory [V]:** rate counters, block state, lockouts, MFA challenges and attempts, MFA
account failures, TOTP replay markers, reauthentication markers, reset and change limits, permission
cache are all on the one cache port, so one shared endpoint shares all of
them. Sessions, the concurrent-session limit (advisory lock), refresh lineages, reset tokens and MFA enrolments are in PostgreSQL. The only in-process
state is the role-hierarchy map, which needs every task replaced after a role-definition seed (`01` §4).

## 4. Platform release readiness

**READY FOR A VERSION PR; publication needs separate authorization.**
- 13 lockstep packages 2.4.1 → 2.5.0; content #107 and #100 [V `changeset status`].
- Local candidate: build, `release:check` (also `--since 54bbf46`), security 145, cache 59, auth 110,
  rbac 81, session 71 tests pass with real Redis [V].
- `main` still declares 2.4.1, so the version PR must merge before any dispatch [V `release.yml`].
- The publish step publishes every `packages/**` and `tooling/**` package whose version is missing
  from the registry, and today's dry run (`npm pack --dry-run`) cannot show which ones. A separate
  release-workflow PR narrows both steps to the 13 packages before any dispatch [U whether `typography`, `utils` 1.1.1 are
  published] (`02` §4).

## 5. Identity compatibility readiness

**COMPATIBLE on the local 2.5.0 candidate [V]:** 47 unit and 280 integration tests, lint, typecheck,
build, Prisma validation pass with the 12 lockstep packages Identity uses replaced. No #16 rule is weakened; IPv6 grouping is
idempotent across Identity's and Platform's `addressSubject`; malformed counters move from pass to 503;
introspection and MFA behaviour unchanged (`02` §5). The adoption PR waits for publication.

## 6. Cross-product upgrade requirements

| Product | Affected rate limiter used | Action |
|---|---|---|
| Identity | yes | adopt 2.5.0 (Phase C) |
| Work | no (uses `TokenService` only) | optional, for #100 token hardening (Phase F) |
| Control | no (own in-process limiter; uses `TokenService`) | optional (Phase F) |
| School | no | none |
| Docs | no | none |
| munaxa site | no | none |

## 7. Cost [E]

| Item | Monthly |
|---|---|
| Non-production sidecar | US$0 additional |
| Production P1: 1 × cache.t4g.micro Valkey, eu-central-1 (US$0.0144/h, third-party price index; official table not rendered) | about US$10.5 |
| Production P2: primary + replica, Multi-AZ | about US$21.0 |
| Alarms (5) | about US$0.50 |
| Backups | US$0 (none kept by design) |
| Data transfer within the VPC | cents |

Assumptions: on-demand, 730 h, no reserved nodes; Serverless would start near US$6 at the 100 MB minimum
(us-east-1 rate) but is not suitable (§3).

## 8. Remaining implementation gates

1. Phase A PRs (Terraform cache design, validations, deployment percentages; Identity READONLY reconnect
   and TLS URL rule): repository only.
2. Phase B release-workflow PR and version PR: repository only. **Release dry run and publish: owner authorization.**
3. Phase C Identity adoption PR after publication: repository only.
4. **Production deployer IAM** for ElastiCache (and optionally the bundle read for the AUTH token):
   owner authorization at the deployment-IAM stage.
5. **Nonprod deployment (D) and production deployment (E):** owner authorization each.
6. [O, production gate] P1 or P2 at launch (recommendation P1 until the database is Multi-AZ).
7. [U] Official Frankfurt Valkey prices; ephemeral secret-version support in the pinned provider
   (proven by a mocked test in Phase A).

## 9. Boundaries kept

During this task nobody:
- called an AWS API or used the console (AWS facts come from public documentation pages only);
- ran Terraform against a real backend or applied anything;
- created ElastiCache, Valkey, ECS, IAM, KMS, security-group or network resources;
- read or changed a secret;
- published a package, dispatched a workflow, created a tag or published an image;
- deployed anything, migrated a database, or changed DNS, Cloudflare or a GitHub App.

The local runs used a scratch copy of each repository, local PostgreSQL 16 and Redis 7, and locally
packed tarballs that were never uploaded.
