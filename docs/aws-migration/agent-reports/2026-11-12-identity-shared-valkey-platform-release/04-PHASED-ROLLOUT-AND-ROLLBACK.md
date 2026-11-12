# 04. Phased rollout and rollback

12 Nov 2026. Plan only. "Separate owner authorization" means a new, explicit owner approval naming that
phase; the merge rule of 30 Oct covers only repository PRs with green checks and no auto-deploy.
Labels as in `01`.

Dependency graph:

```
A (repo: Terraform design, Identity config, tests) ───────────────┐
B (repo: version PR) → B-publish (owner) → C (Identity adoption PR)─┼─→ D (nonprod deploy, owner)
                                         └→ F (Work, Control: optional)  └─→ E (prod deploy, owner)
```

A and B are independent and can run in parallel. C needs B published. D needs A merged and, for the
new Identity code, C merged plus the AW-01 prerequisites. E needs D passed and the production gate.

## Phase A: repository preparation

| Item | Detail |
|---|---|
| Repositories | munaxa-platform (`infra/aws`), munaxa-identity |
| Files | Platform: new `stack/identity-cache.tf`; `stack/variables.tf` (`identity_cache`; the existing `valkey_image` rule relaxed for `identity_cache`; five new validations including the unconditional no-sidecar-in-prod rule, `01` §6); `stack/services.tf` (sidecar only when `identity_cache == null`, `extra_security_group_ids` with the cache-client group, deployment percentages); `modules/service/{main,variables}.tf` (`deployment_minimum_healthy_percent`, `deployment_maximum_percent`, `extra_security_group_ids` for the cache-client group on the service only; defaults unchanged); `stack/outputs.tf` (cache endpoint); `prod.tfvars` is **not** changed in Phase A (the cache is proven by mocked tests only; adding `identity_cache` there before Phase E would make every production plan read the bundle and create the cache); `stack/data.tf` comment (REDIS_URL per environment); `stack/tests/*.tftest.hcl`; `infra/aws/README.md`. Identity: `apps/api/src/platform/cache.ts` (`reconnectOnError` READONLY), `packages/config/src/environment.ts` (production non-loopback cache needs `rediss://` and a password), tests, `docs/production-readiness.md`, `docs/rate-limits.md` (topology) |
| Tests | mocked `terraform test`: prod plan has the replication group with `transit_encryption_mode = required`, at-rest KMS, `noeviction`, no public route, ingress only from the cache-client group, `auth_token_wo` set and no token in state; validations refuse prod + sidecar (also with services off and no image), sidecar + `identity > 1`, both stores, prod Identity image without the cache, the cache without a pinned `secret_version_ids.identity`; the existing rule accepts prod with the cache and no sidecar; the cache plans with `images = {}`; the probe task definition has no cache-client group; nonprod plan diff is only the Identity service's deployment percentages; `terraform validate`, `fmt`, tflint/checkov as in CI. Identity: unit tests for the URL rule; integration against a TLS `redis-server` with `requirepass`; READONLY injection; the two-instance HTTP edge suite on that server |
| Acceptance | CI green on both PRs; independent review approves exact heads; the nonprod expected-changes file updated and matching the mocked plan; no secret value in any file or test output |
| Dependencies | none |
| Rollback | revert the PRs; nothing was applied |
| Owner authorization | not for the PRs (standing merge rule, repository only). The production deployer IAM change (ElastiCache actions, `kms:CreateGrant`, `iam:CreateServiceLinkedRole` for ElastiCache, `secretsmanager:GetSecretValue` on the identity bundle for both the plan and the apply role, because the ephemeral read runs at plan time too, unless the ROTATE-then-SET fallback is chosen) is a bootstrap change and **needs separate authorization** at the deployment-IAM stage |

## Phase B: Platform release preparation

| Item | Detail |
|---|---|
| Repositories | munaxa-platform |
| Files | PR 1: `.github/workflows/release.yml`, publish and dry-run steps narrowed to the 13 packages. PR 2 (version PR): 13 `package.json`, 13 `CHANGELOG.md`, two changesets removed (`02` §4) |
| Tests | full Platform CI including the real-Redis job; `release:check --since 54bbf46`; release workflow dry run |
| Acceptance | PR 1 changes only the two filters; the version PR shows only version, changelog and changeset changes; CI green and review approval on each; the dry-run log lists exactly the 13 at 2.5.0 |
| Dependencies | none |
| Rollback | before publish: revert the version PR. After publish: a version cannot be replaced; publish 2.5.1 with a fix; consumers remain on 2.4.1 through their lockfiles |
| Owner authorization | PR 1 and the version PR: no (repository only). **Dry-run dispatch and publish dispatch: yes, separate authorization** (publication is irreversible) |

Full checklist: `02` §4.

## Phase C: Identity compatibility

| Item | Detail |
|---|---|
| Repositories | munaxa-identity |
| Files | `apps/api/package.json`, `packages/config/package.json`, `packages/testing/package.json`, `pnpm-lock.yaml`, comment updates in `security/auth-edge-limits.ts`, `platform/security.ts`, `password/password-change.ts`, `password/password-recovery.ts`, a unit test for `addressSubject` idempotence through Platform's rule subject |
| Tests | full `ci.yml` (format, lint, typecheck, build, migrations from zero, unit, integration with real PostgreSQL and Redis, catalogue drift); the #16 mutation script subset for limiter behaviour |
| Acceptance | lockfile resolves 2.5.0 from the registry with integrity hashes; all tests pass (the local candidate run: 47 unit, 280 integration); review confirms no rule, limit, subject or failure mode changed (`02` §5 table) |
| Dependencies | B published |
| Rollback | revert the PR (lockfile back to 2.4.1) |
| Owner authorization | no for the PR (repository only); the image build and deployment belong to D |

## Phase D: non-production deployment preparation (one task, one sidecar)

Preconditions: A merged; an Identity image pair built from `main` after C (or the current pin for an
A-only change); the AW-01 prerequisites of `docs/production-readiness.md` (MFA key ring in the bundle,
`identity_security_config`, the MFA migration) if the image is newer than `5277d71`.

Sequence (each AWS step is an owner-approved session step, executed by Claude per the 11 Nov direction):
1. Reviewed tfvars PR pins the new image digests and bundle version; the expected-changes file lists the
   task definition revision and the deployment-percentage change.
2. Plan (workflow) → compare with the expected changes → apply.
3. Start the session with the session workflow (`.github/workflows/aws-session.yml`): database started, edge and services enabled,
   `desired_counts.identity = 1`.
4. Verify: one running Identity task with two containers, `valkey` HEALTHY first; ALB target healthy;
   `/api/auth/health/ready` 200; the session probe (15 checks) passes; the edge limit returns 429 at the
   configured count with a scaled test identifier; no 503 `AUTH_UNAVAILABLE` in the logs except
   during deliberate store tests.
5. Verify the deployment percentages: a forced new deployment shows the old task stopped before the new
   one starts (ECS events). Until this test passes, "never two stores" is unverified.
6. Shut down (`down`), confirm nothing running, backstop armed.

Rollback: pin the previous image and bundle versions in a reviewed tfvars PR and apply; or the ECS
circuit breaker rolls back automatically on a failed deployment. State in the sidecar is lost on any
replacement; that is accepted in Testing.

Owner authorization: **yes, separately** (AWS apply, session, secrets).

## Phase E: production deployment preparation (shared ElastiCache, several tasks)

Preconditions: D passed; production gate approved; production deployment IAM in place (deferred
decision of 8 Nov); the Identity production prerequisites (`docs/production-readiness.md`).

Sequence:
1. Operator writes a `munaxa-prod/identity` bundle version holding `REDIS_PASSWORD` (a generated,
   URL-safe token) with the other keys; pin its version id in a reviewed tfvars PR.
2. A reviewed tfvars PR adds `identity_cache` to `prod.tfvars` (now, not in Phase A), then plan and apply the production stack with services off: creates the cache and the
   cache-client security group (TLS, AUTH read from the pinned version into the write-only argument,
   `noeviction`, alarms). The cache does not depend on the Identity image (`01` §6), so this works
   while `images` is still empty. Cost starts here (about US$11 a month for P1 [E]). (With the
   ROTATE-then-SET fallback instead, the token is set here by the operator, before any Identity task exists.)
3. Operator writes the next bundle version adding `REDIS_URL=rediss://:<token>@<endpoint>:6379` with the
   same token; pin it. `auth_token_version` is not changed, so the cache token is untouched.
4. Pin the Identity images and enable Identity with `desired_counts.identity = 2`.
5. **Shared-state verification** (with scaled test limits on a test organisation, never real accounts):
   - lockout: N failed sign-ins spread across both tasks (repeat until the ALB has used both; task id in
     the response log) lock the account at exactly `LOGIN_MAX_ATTEMPTS`;
   - edge limit: the per-identifier limit refuses at its count across both tasks;
   - MFA: a challenge started on one task is redeemed on the other; one TOTP code is accepted once in
     total; challenge attempts stop at 5 in total;
   - reauthentication on one task is honoured by the other;
   - role revocation through `RoleAdministration` takes effect on both tasks at once.
6. **Security verification:** cache admits only the cache-client group and only the Identity service
   carries it (rule review and describe calls; a probe test adds nothing, since the probe's own group
   already has no 6379 egress), TLS required (`transit_encryption_mode = required` confirmed by describe; a plaintext test
   would need a client in the client group and is not planned), at-rest encryption and KMS key confirmed by
   describe calls, no token in Terraform state (state inspection for `auth_token`), no token in logs.
7. **Availability verification:** stop one Identity task: sign-in continues on the other with the same
   lockout state. For P2 only: test failover (`TestFailover`) and confirm 503s for a few seconds, then
   recovery without a restart (READONLY reconnect).
8. Operational acceptance: alarms in OK state and the SNS subscription confirmed; cost tag present;
   the month's estimate within the production budget.

Migration: none (production has never run Identity [V prod.tfvars]). For any future store change,
use the switch procedure: scale Identity to 0; make the old store unusable (delete it, or revoke its
token), because every older task definition revision still carries its `REDIS_URL` and a failed
deployment's automatic rollback would otherwise run on it; wait at least 5 minutes in total (longer
than the TOTP replay window of 120 s); change `REDIS_URL` in a new bundle version; start the tasks.
Sessions survive; lockouts, counters, pending MFA challenges and reauthentication markers restart once.

Rollback:
- Application: previous task definition revision (kept by `skip_destroy`); it points at the same cache
  because production never had a sidecar revision (and the unconditional validation keeps it so). It
  also pins its own bundle version: after a token rotation completed with `SET`, older revisions fail
  closed. The circuit breaker picks the last steady revision itself, so the outcome is a fail-closed 503; for a manual rollback, the operator picks a revision pinned to the current bundle version.
- Cache configuration: revert the Terraform change; engine downgrades are not possible in place, so no
  engine version change goes in without a plan review.
- Role changes: after a role-definition seed, replace every task and wait 60 s before relying on it (stale permission sets in the shared cache, `01` §4 item 11).
- Cache loss: Identity fails closed (503 on credential routes) until ElastiCache replaces the node.
  No snapshot restore (none are kept), so old security state can never come back.
- Fallback to sidecars: refused by the validations. An emergency single-task sidecar fallback is a
  reviewed change that relaxes the production validation and needs owner approval; it must start with
  Identity at 0 tasks and the 5-minute wait.

Owner authorization: **yes, separately** (production apply, secrets, DNS for `id.munaxa.com`,
enabling services).

## Phase F: other product adoption

| Item | Detail |
|---|---|
| Repositories | munaxa-work, munaxa-control (optional, for #100 token hardening). School, Docs, munaxa: none |
| Files | `apps/api/package.json` ranges for `@munaxa/auth` and `@munaxa/crypto`, `pnpm-lock.yaml` |
| Tests | full CI of each; Work's identity and revocation suites; Control's authentication guard tests |
| Acceptance | CI green, review, no change to tenant binding, revocation, licensing or own rate limits |
| Dependencies | B published; independent of C, but after C in order |
| Rollback | revert the PR |
| Owner authorization | no for the PRs; yes for any image or deployment that carries them |

## Summary of authorization gates

| Step | Authorization |
|---|---|
| Phase A PRs, B version PR, C adoption PR, F PRs | repository only, standing merge rule (green CI, review, no auto-deploy) |
| Release dry run and publish (B) | **separate owner authorization** |
| Production deployer IAM (A, bootstrap) | **separate owner authorization** |
| Nonprod plan, apply, session (D) | **separate owner authorization** |
| Production cache creation, secrets, enabling Identity, DNS (E) | **separate owner authorization** |
