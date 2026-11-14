# 05. Stage E readiness assessment (no execution)

Stage E is the first Identity non-production session: `up`, database bootstrap and migrations, the operator account, Identity rollout, verification and `down`, on one day. **Nothing in this file was run.** This is an assessment of the repository, the two existing runbooks and the AWS state read on 14 Nov (02).

Sources:
- `2026-11-12-phase-c-d-preparation/03-NONPROD-DEPLOYMENT-RUNBOOK.md` (**runbook 03**, stage letters A to E);
- `2026-11-11-identity-final-operator-runbook/00-IDENTITY-FINAL-OPERATOR-RUNBOOK.md` (**operator runbook**, steps S-0 to S-14);
- `2026-11-11-identity-first-session-operator-checklist/00-IDENTITY-FIRST-SESSION-OPERATOR-CHECKLIST.md` (**checklist**);
- platform `main` `68fa6f9`; Identity `main` `2db6ed9` (the source of the pinned images).

**Verdict: STAGE E NOT READY — BLOCKERS IDENTIFIED** (section 12).

## 0. What exists, what is registered, what runs

| Category | Items | Evidence |
| --- | --- | --- |
| **Infrastructure applied (at rest)** | VPC, subnets, security groups, RDS `munaxa-nonprod-pg` (stopped), secrets (identity bundle version `80914756…`, identity-migrate, docs-migrate container), IAM execution roles, log groups, ACM certificate `*.test.munaxa.com`, ECR images, backstop schedules (21:00 UTC), session workflows | G3 (6 Nov), Config A1 (10 Nov), stage D (13 Nov, direct read 21:46–21:48); 14 Nov scheduled plan "No changes" [G] (03) |
| **Registered only (task definitions, nothing started)** | `munaxa-nonprod-identity:2`, `-identity-migrate:2`, `-identity-bootstrap:2`, `-db-admin:2` (2db6ed9 images, bundle `80914756`); revision 1 of each (old 5277d71 images) | 02 A (direct, 14 Nov 20:36) |
| **Not created** | ALB, listeners, target groups, ECS services (created only by `up`); probe task definition `munaxa-nonprod-identity-probe` (`identity_probe_source` is empty on `main`); secrets `munaxa-nonprod/identity-operator` and `munaxa-nonprod/identity-bootstrap`; the independent cleanup (PR #90 design, not built) | `envs/nonprod.tfvars`; `infra/aws/stack/*.tf` has no state machine; 02 C and F (direct, 14 Nov: 0 ALB; the two secrets absent) |
| **Running** | **nothing**: 0 services, 0 running, 0 pending, 0 recently stopped tasks; database `stopped` | 02 A, B (direct, 14 Nov 20:36) |
| **Never run** | db-admin, identity-migrate, bootstrap, any Identity task; the Identity schema has never been created in this database | runbook 03 P-7 "never run"; no `RunTask` or `StartTask` in CloudTrail since 13 Nov 21:40 (02 D) |

**There is no working Identity service.** A registered task definition is a template. Identity has never started in AWS; its first start needs the schema, which needs the migrate task.

## 1. Preconditions for the first session

| # | Precondition | State | Blocking |
| --- | --- | --- | --- |
| E-P1 | Stage D applied; the four revision 2 task definitions registered with the 2db6ed9 digests and bundle `80914756` | **met** (06 of stage D, direct 13 Nov; re-read directly 14 Nov, 02 A) | — |
| E-P2 | Scheduled `down` healthy after stage D (S-1) | **met**: runs 43533662116 and 43574175677, switch plan "No changes" (03) | — |
| E-P3 | Backstop working | **met**: last stop 13 Nov 21:00:48; 11 schedules ENABLED on 14 Nov (02 B, 03) | re-check on session day |
| E-P4 | One reconciled stage E procedure that names **revision 2** task definitions | **not met.** The checklist and the operator runbook hard-code `:1` (`run_one munaxa-nonprod-identity-migrate:1`, `…-db-admin:1`, `…-identity-bootstrap:1`, operator runbook §4.3). After stage D, `:1` is the **old 5277d71 image** (pre-MFA, pre-CVE fix). Running `identity-migrate:1` would apply the old migration set and `bootstrap:1` would run the old code. Runbook 03 says "with the new image" but gives no revision. The procedure must name `:2` explicitly and check it before each RunTask (see §3) | **yes** |
| E-P5 | Independent cleanup (operator runbook I-7, PR #90 revision 2) built and checked (gate H-20) | **not met.** Design merged, not built. Owner position of 11 Nov 10:30 UTC: the first session should not proceed with an unbounded ALB cost risk | **yes, unless the owner explicitly accepts the risk (06, D-E2)** |
| E-P6 | Verification route chosen and ready: either the probe (operator runbook §3–§4; needs the I-3 pin PR and an I-4 apply, 1 create) or runbook 03 §12–§14 checks | **not met.** Probe not pinned or registered; runbook 03's throwaway-account helper does not exist | **yes** |
| E-P7 | Throwaway-account MFA, recovery-code and revocation helper (runbook 03 §13) | **not written** (repository task) | **yes** for MFA testing; Identity could start without it but MFA would be untested |
| E-P8 | Operator sign-in route that never shows the password to Claude (runbook 03 §13: `asm-exec` [U], owner hidden prompt, or skip) | **undecided**; `asm-exec` was found unavailable on 11 Nov | yes, as an owner choice (06, D-E4) |
| E-P9 | Operator account custody (Option A): `munaxa-nonprod/identity-operator` and `/identity-bootstrap` created in-session by script C-8; operator email as private runtime input | email confirmed 11 Nov. C-8, C-8R, C-8v, C-16 and C-24 are on `main` only as `option-a-connector-scripts.DRAFT.py` ("Not run", `2026-11-11-identity-option-a-custody-cost-review`). They use `type(e).__name__`, and on 13 Nov the connector sandbox refused a read-only stage D check script for using `__name__`; it also refuses `secrets`, `os`, `base64` and `hashlib` imports (stage C execution note, 13 Nov 18:09). They have never run in the sandbox. The two secrets do not exist (02 C, 14 Nov) | **yes**: the scripts must be made sandbox-compatible and re-reviewed before stage E |
| E-P10 | `id.test.munaxa.com` DNS points at the session ALB | owner action in Cloudflare during the session (runbook 03 §7.1) | in-session owner step |
| E-P11 | RDS master secret rotation (S-2) checked before the session | see 04; rotation fails while stopped | no, checked on session day |
| E-P12 | Session-day read-only checks (the 02 script) and GitHub has no pending nonprod run. The connector must work | to do on the day; the connector refused calls for most of 14 Nov before the owner reconnected it (V-1) | in-session |

## 2. The database start and its authorization

- The database must be running for db-admin, migrate, bootstrap and Identity readiness.
- It is started **by the `up` workflow itself** (`aws-session.yml`, step "Start the database", skipped on `down`), not by a separate call. Approving the `up` dispatch and its `aws-nonprod-session` gate therefore approves the database start. The stage E approval must say so.
- No manual `StartDBInstance` is part of any runbook, and none is proposed.
- It is stopped by `down` ("Stop the database"), by the separate "Stop the database" job of every scheduled run, and by the 21:00 UTC backstop.
- RDS restarts a stopped instance by itself after 7 days (N-1). The next automatic start is due around 20 Nov (04). It is unrelated to stage E and the backstop stops it the same evening.

## 3. Migration and bootstrap sequence (exact order)

Taken from the operator runbook §8 (S-0 to S-7), with the revision fixed to 2. **Each RunTask is a mutating call that needs the stage E approval.**

| Step | Action | Task definition | Expected |
| --- | --- | --- | --- |
| E-0 | Session-day read-only checks; record `ACTIVE` revisions; confirm each family's latest is `:2` with the 2db6ed9 digest (the 02 script) | — | `:2` everywhere; any other revision: stop |
| E-1 | Dispatch `aws-session.yml` `up` (ref `main`); owner approves `aws-nonprod-session`. Record T0 | — | switch plan = only session types; database `available`; ALB and services created |
| E-2 | Owner updates `id.test.munaxa.com` to this session's ALB | — | resolves to the new ALB |
| E-3 | Identity service starts and crash-loops on the empty schema (expected; `/ready` needs the schema) | `identity:2` (service) | not healthy yet; no action |
| E-4 | RunTask db-admin, wait STOPPED | **`munaxa-nonprod-db-admin:2`** | exit 0; `db-bootstrap: identity: … roles identity_owner and identity_app are in place.` |
| E-5 | RunTask identity-migrate, wait STOPPED | **`munaxa-nonprod-identity-migrate:2`** | exit 0; `All migrations have been successfully applied.` |
| E-6 | Create the operator and bootstrap secrets (C-8, then C-8v metadata check; scripts to be revised first, BE-8) | — | 2 secrets, 1 version each; output has names, ARNs and version ids only |
| E-7a | RunTask bootstrap, default command | **`munaxa-nonprod-identity-bootstrap:2`** | exit 0; `Created <email> in organisation munaxa-group.` (masked) |
| E-7b | same, `seed-control-roles.mjs` override | `:2` | exit 0 |
| E-7c | same, `--role control-operator-admin` override | `:2` | exit 0; `Assigned control-operator-admin` |
| E-8 | `UpdateService --force-new-deployment` on `identity` | `identity:2` | rollout COMPLETED; 1 healthy target |
| E-9 | Verification (§5 to §9) | — | as listed |
| E-10 | Delete the bootstrap secret (C-16), then `down` | — | 0 bootstrap secret; operator secret kept |

- Bootstrap must not run before migrate; migrate must not run before db-admin.
- "Already bootstrapped" at E-7a is a stop (the operator secret may not match the account).
- Migrations are forward-only. A failed migrate means: do not start Identity, `down`, report; no hand fix in the session.

## 4. Verifying the database schema and migration state

| Check | How | Exposes a secret? |
| --- | --- | --- |
| Migrate result | E-5 exit code 0 and the final Prisma line, read through the allow-list (operator runbook §10.2) | no |
| Schema completeness | `GET /api/auth/health/ready`: 503 with `reason` and a `missing` table list while the schema is incomplete; 200 when the database, the cache and signing all answer (Identity `apps/api/src/health/health.controller.ts`) | no (the reason names a dependency, never a credential) |
| Migration history (optional) | a `prisma migrate status` run of the migrate task definition with a command override. **Not in any runbook**; it would be one more mutating RunTask and must be named in the approval if wanted | no |
| No direct SQL | Claude does not connect to the database; no SQL client is used | — |

## 5. Identity API health without secrets

- `GET https://id.test.munaxa.com/api/auth/health/live` → 200, body has `status`, `name`, `version`, `build` (no secret).
- `GET /api/auth/health/ready` → 200, body has `cache` (`redis` expected), `sessionLimit`, `signingKid` (`identity-nonprod-2026-11` expected). The kid is public.
- Target group `munaxa-nonprod-identity`: exactly one `healthy` target.
- ECS: `identity` and `valkey` containers `HEALTHY`; no `ResourceInitializationError` in `stoppedReason`.
- Count-only log checks for secret-shaped strings (operator runbook §10.3): every count 0.

## 6. Login and MFA, safely

- **No credential enters Claude's context** (runbook 03 §13).
- Operator account: sign-in only, through the route the owner picks (06, D-E4). Never enroll MFA on it.
- MFA, recovery codes and lockout: only on a **throwaway** `@example.invalid` account, created and used inside one helper process that prints status codes and the claims `aud`, `exp` and the presence of `sid` only. **That helper does not exist** (E-P7).
- Exactly one wrong-password attempt per identifier per run (lockout counting).
- Expected: sign-in 200 with a JWT that passes `verify-identity-jwt.mjs` (ES256, kid, issuer, audience, expiry); wrong password 401; MFA enroll 200, sign-in with a TOTP code 200, replay refused; a recovery code works once.

## 7. Password reset (disabled)

- The identity task definition revision 2 sets `IDENTITY_PASSWORD_RESET=disabled` (stage D report 06).
- In the Identity source at `2db6ed9`, `apps/api/src/password/password-recovery.controller.ts`: with availability `disabled`, `GET /api/auth/password/forgot` and `POST /api/auth/password/forgot` both answer **404**.
- Test: one `GET` of `/api/auth/password/forgot` without a body, expect 404. No address is submitted, so no mail can be sent and no account is touched. A 200 or 202 is a stop (reset would be live without a mail route).

## 8. MFA key bundle loaded, without key material

- `MFA_ENCRYPTION_KEYS` is referenced from the bundle at version `80914756…`; `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11` (stage D report 06).
- With `NODE_ENV=production`, Identity refuses to start when the key ring is empty, malformed, or does not hold the primary kid (`packages/config/src/environment.ts`, `mfaKeyIssues`). The refusal message names the setting, never the value. So **a task that reaches `/health/live` 200 has parsed the ring and found the primary kid.**
- Positive check: the throwaway account's MFA enrolment (§6) returns 200, which needs the ring to encrypt the TOTP secret.
- Negative check: a startup failure appears in ECS `stoppedReason` and the log as a configuration issue for `MFA_ENCRYPTION_KEYS`; read through the allow-list, counts only for anything else.
- Never read the secret, never print the bundle, never grep a log for a key value. Search only for the version id or the setting name.

## 9. Secret access permissions

| Check | When | Method |
| --- | --- | --- |
| Execution-role policies name exactly the expected secret ARNs | before the session, read-only | `iam:GetRolePolicy` on the identity, migrate, bootstrap and db-admin execution roles (stage D verified the docs-db-admin change) |
| Each task's referenced secrets resolve | at task start | no `ResourceInitializationError`; the task reaches RUNNING |
| Only execution roles read secret values | after the session | CloudTrail `GetSecretValue`: callers are only the ECS execution roles; none by a deployer role, none by root (runbook 03 §16) |
| Claude never reads a value | always | no `GetSecretValue`, `BatchGetSecretValue` or Secrets Manager Agent call |

## 10. Rollback steps and criteria

| Trigger | Action |
| --- | --- |
| Any hard stop (runbook 03 §14 stop list; operator runbook §13) | delete the bootstrap secret if it exists, dispatch `down`, verify, report. No fix-forward |
| Migrate exit ≠ 0 | do not start Identity; `down` |
| Identity unhealthy or `/ready` 503 for more than 5 minutes after COMPLETED | `down` |
| Wrong password returns 2xx, a token or password in a log, `operator-host` reachable | `down` immediately |
| New image defective | the previous revision 1 is **not** a usable rollback target for Identity: it is the old 5277d71 image (pre-CVE fix, no MFA) and does not match the migrated schema. Rollback is `down` and a fixed image through a reviewed PR and apply. Never `update-service --task-definition` by hand |
| Data | schema migrations are not rolled back by hand; the Testing database can be rebuilt by a reviewed procedure if needed |

## 11. Shutdown and cost control

1. Delete the bootstrap secret (C-16), confirm 0; the operator secret stays.
2. Dispatch `down`; both jobs green; database `stopped`.
3. Read-only shutdown check (operator runbook §12): 0 ALB, 0 target groups, 0 services, 0 tasks, 0 Elastic IPs, 0 NAT, 0 public ENIs, backstop schedules enabled.
4. Hard stop: `down` by T0 + 3 h, start by 15:30 UTC.
5. Layers behind Claude: scheduled `down` runs (late or dropped by GitHub at times), the 21:00 UTC backstop (stops the database and scales services to 0, **cannot delete the ALB**), the independent cleanup (**not built**).
6. Cost: about US$0.09–0.10 an hour while up [E]; unbounded ALB cost (about US$0.89 a day) if Claude loses control and every `down` fails, until the cleanup is built.

## 12. Blockers and risks to resolve before the first session

| Id | Item | Kind | Resolution |
| --- | --- | --- | --- |
| **BE-1** | Runbooks name revision `:1` (old image) for db-admin, migrate and bootstrap | repository (documentation) | One reconciled stage E runbook naming `:2` and checking the digest before each RunTask; reviewed |
| **BE-2** | Independent cleanup not built (owner position 11 Nov: do not proceed with unbounded ALB risk) | owner decision, then build (Stage B approvals) | 06, D-E2 |
| **BE-3** | No verification tool ready: probe not pinned or registered; throwaway-account helper not written | repository + one owner-approved plan/apply if the probe is chosen | 06, D-E3 |
| **BE-4** | Operator sign-in route undecided | owner decision | 06, D-E4 |
| **BE-8** | Option A connector scripts (C-8, C-16, C-24) are unrun drafts and use `__name__`, which the connector sandbox refused on 13 Nov | repository | Revise for the sandbox, re-run the offline harness, independent review |
| BE-5 | S-2 rotation failures while stopped; secret stages to check on the day | operational | session-day check |
| BE-6 | Leftover throwaway account after the session (no reviewed disable step) | owner acceptance | 06, D-E5 |
| BE-7 | Stage E approval text: must name the database start via `up`, every mutating connector call, the DNS step, the secret creation and deletion, the hard stop and the cost statement | owner approval | after BE-1 to BE-4 and BE-8 |

Non-blocking: S-3 (certificate renewal while unused), B-1 ($10 alert budget).
