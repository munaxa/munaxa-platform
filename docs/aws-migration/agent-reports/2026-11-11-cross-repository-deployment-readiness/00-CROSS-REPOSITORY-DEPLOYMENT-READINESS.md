# Cross-repository deployment readiness audit (11 Nov 2026)

Requested by the owner on 11 Nov 2026 14:05 UTC after the Identity security hardening (identity#7 to #13,
report platform#99). Scope: the latest `main` of munaxa-identity, munaxa-platform, munaxa-work, munaxa-docs,
munaxa-control and munaxa-school, plus the AWS infrastructure code in munaxa-platform `infra/` and the retired
Docs infrastructure in munaxa-docs `infra/`.

**This is an audit and repository-remediation report. Nothing was deployed.** No Terraform plan or apply against a
real backend, no AWS call of any kind, no IAM, KMS, network, secret, DNS or Cloudflare change, no workflow dispatch,
no staging or production migration, no licensing change. All tests ran locally against disposable Postgres 16 and
Redis instances that were stopped afterwards.

Labels: **[V]** verified in code or by running it, **[D]** documentation claim only, **[E]** estimate.

Supporting files (the full evidence per repository, with file:line citations, exact snippets, commands and counts):

| File | Content |
| --- | --- |
| [supporting/identity.md](supporting/identity.md) | Identity: 20 findings (ID-), env and secret names, commands |
| [supporting/platform.md](supporting/platform.md) | Shared packages and consumer contracts: 17 findings (PL-) |
| [supporting/work.md](supporting/work.md) | Work backend, admin, portals, jobs: 16 findings (WK-) |
| [supporting/docs.md](supporting/docs.md) | Docs application and its old and new hosting: 21 findings (DC-) |
| [supporting/control-school.md](supporting/control-school.md) | Licensing across products; Control and School: 18 findings (CT-, SC-) |
| [supporting/aws.md](supporting/aws.md) | AWS infrastructure code: 21 findings (AW-) |
| [supporting/review-round1.md](supporting/review-round1.md) | Independent review of the remediation PRs (rounds 1 to 3) |

The supporting files were written during the audit: "fixed-in-local-commit <sha>" there refers to branch commits
that were later squash-merged; section 12 has the merge SHAs on main. `<audit-scratch>` stands for the audit's
temporary working directory.

---

## 1. Executive summary

- **Closest to a non-production deployment: Identity**, on the already pinned image `5277d71` and the already
  applied Config A1. That path is blocked only by owner approvals (Stages B, C and D). [V]
- **No Identity image built from current main can start on the current stack (AW-01 / ID-01, High).** The task
  definition lacks `MFA_ENCRYPTION_KEYS` (secret), `MFA_ENCRYPTION_PRIMARY_KID` and `IDENTITY_PASSWORD_RESET=disabled`;
  the reset feature defaults to `enabled`, which production mode refuses without an email transport. The MFA migration
  `20261111130000_identity_mfa` must also run first. Reproduced by starting the built service with a production
  configuration. [V]
- **Work** is code-complete enough for a non-production test on its backend, but its admin is read-only, it has no
  file storage, notification delivery or scheduler, and it trusts a token's permissions in every Work tenant the user
  belongs to (WK-01, High, reproduced) and accepts revoked tokens until expiry, about 15 minutes (WK-02, High). [V]
- **Docs** is **not ready** for the shared hosting: there is no way to run its database migrations there (DC-01,
  High). Its Redis is a per-task throwaway sidecar (DC-02). Docs and School do not use Munaxa Identity at all; each
  has its own HS256 sign-in. [V]
- **Licensing is consistent and fails safe**: all products share `@munaxa/licensing` 0.2.0, all refuse the permissive
  default in production even when the variable is unset, and degrade gradually when Control is unreachable. [V]
- **AWS architecture code** is sound for an Identity-only nonprod session (role split, PassRole scoping, OIDC
  conditions, SGs, TLS 1.3, encrypted RDS, digest-pinned images, immutable ECR tags all verified), but conflicts with
  the approved direction in three High ways: everything is in the single Organizations management account (AW-02),
  production Identity would run two tasks each with its own Valkey (AW-03), and nothing alarms (AW-09). [V]
- **Remediation:** six focused PRs, one per repository, covering 23 findings. See section 12 for review, CI and
  merge SHAs.

### Final decision per product

| Product | Non-production | Production | Basis |
| --- | --- | --- | --- |
| Identity, image `5277d71` | **READY FOR NON-PRODUCTION** (after owner Stages B, C, D) | NOT READY | Config A1 applied; task def matches that image; no MFA or reset routes in that image |
| Identity, current main | **NOT READY** until AW-01 is fixed in infra and the MFA key secret exists | NOT READY | Startup refuses on current stack (reproduced) |
| Platform packages | **READY FOR NON-PRODUCTION** | NOT READY (auth 2.4.2 release, PL-05/07/08 decisions) | 1655 tests, all consumer imports type-check against resolved versions |
| Work | **READY FOR NON-PRODUCTION** (backend API, single-membership test users, after work#30) | NOT READY | WK-01, WK-02, WK-05, missing storage/notifications/scheduler |
| Docs | **NOT READY** | NOT READY | DC-01 no migration path; DC-02, DC-03, DC-04 |
| Control | **READY FOR NON-PRODUCTION** | NOT READY (CT-01, KMS key, operator access) | 83 + 43 tests, migrations 3/3, ADR-0008 signing matches code |
| School | **READY FOR NON-PRODUCTION** (after school#25) | NOT READY | SC-04 to SC-07; not on Identity |
| AWS hosting (nonprod) | **READY** for an Identity-only session on `5277d71` after Stages B, C, D | NOT READY | AW-02, AW-03, AW-06 to AW-10 |

"Ready for non-production" never means authorized: every AWS step still needs the owner's explicit approval.

---

## 2. Repository-by-repository readiness matrix

| Repository | Visibility | Main at audit start | CI on main | Open PRs at start | Local checks (this audit) | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| munaxa-identity | public [V] | `c3928e8` (#13) | green, run 43030112337 | none | typecheck, build, prisma validate, unit 46, integration 217 → 222 after fixes, audit no high | Nonprod (5277d71) / not main |
| munaxa-platform | public [V] | `0ae17f9` (#99) | green | #98 (other thread's report) | build, typecheck, lint, 1655 tests, validate, audit exit 0 | Nonprod |
| munaxa-work | public [V] | `b490b25` (#29) | **CI never runs on main** (WK-07, fixed in work#30) | none | lint 51/51, typecheck 51/51, build 29/29, 5675 tests 0 failed, 34 migrations, RLS on 187/187 tables | Nonprod |
| munaxa-docs | public [V] | `b8c7e25` (#174) | last main CI 4 Nov green | none | typecheck 13/13, lint 13/13, unit api 1010, web 523, domain 164, build 9/9, 32 migrations, integration 1172 pass / 49 fail (object store and scanner unavailable locally) | Not ready |
| munaxa-control | public [V] | `a24c568` (#7) | green | none | api 83/83, portal 43/43, migrations 3/3, lint, typecheck, build | Nonprod |
| munaxa-school | public [V] | `9671bcb` (#24) | green | none | api 514, domain 6, utils 5, e2e/RLS 327, deploy-gate 39, migrations 92/92, RLS 165/165 | Nonprod |

Note on visibility: all six repositories are **public** (GitHub API `visibility`, read 11 Nov 15:15 UTC). That
is consistent with the standing rule that operator data never goes into a repository, but it raises the weight of
committed development credentials (School `app-role.sql` dev password, now no longer used by any deploy path) and of
account identifiers in Terraform. Visibility was not changed (out of scope). No operator email appears in this report
or its supporting files.

Docker image builds could not run in the audit session (no Docker daemon); the repositories' own CI image smoke jobs
were used where they ran (section 9).

Documentation versus implementation: the largest mismatches found and corrected were Identity `docs/runbooks/aws.md`
(said `mfaSatisfied` is always false and listed only the 5277d71 configuration), Work ADR-0076 (claimed a tokenVersion
check Work does not do), Work and Docs `.env.example` gaps, Docs `retired.tf` pointing at a commit absent from
history, Control docs calling ADR-0008 "proposed", platform `ops.tf` mentioning a deploy workflow that does not exist
(AW-04, open), and Control ADR-0008 "products are unaffected" by a KMS outage (CT-02, open).

---

## 3. Identity security verification

Starting point: the hardening report (platform#99). Everything below was re-checked in code on `c3928e8`, and the
security-relevant paths were exercised by the integration suite (222 tests on a disposable Postgres 16 + Redis).

| Area | Result | Evidence (see supporting/identity.md) |
| --- | --- | --- |
| MFA secret encryption and rotation | **[V]** AES-GCM key ring (`MFA_ENCRYPTION_KEYS`, primary kid); `mfa-reencrypt` re-seals under the primary and reports retired kids | `mfa-runtime.ts`, `operator-cli` |
| TOTP enrollment, verification, replay | **[V]** Platform `MfaService` from `@munaxa/auth` 2.4.1 (`mfa-runtime.ts:161`); confirmation step is claimed (no replay); per-step replay key. Low: a code from an earlier step still works after a later step was used (ID-07) | |
| Recovery codes | **[V]** generated once, single-use atomic consume in Identity's store adapter. Platform-level gaps (no pepper, no confirmed-factor check) neutralised by the adapter; the check is now also in the package (PL-09, platform#100) | |
| MFA login challenge and session issuance | **[V]** opaque single-use challenge in Redis, sha256-keyed, attempts reserved before verify (concurrency tests), no session or token until the factor is proven, tokens carry `amr` and `mfa` | |
| Session listing and revocation | **[V]** list, revoke one, revoke others; revocations audited | |
| Authenticated password change | **[V]** one transaction, step-up required when enrolled, every session ends | |
| Password recovery | **[V]** atomic completion, fail-closed delivery; **must stay `IDENTITY_PASSWORD_RESET=disabled`** until an email transport exists (none in infra, AW-18); tokens in URL mean ALB/CDN logs on the reset path would hold them | |
| Tenant isolation and RLS | **[V]** every tenant table, including both MFA tables, has RLS forced with `tenant_isolation`; no role in code bypasses it; CI grant list covers the new tables | migrations applied in order to PG16 |
| Audit events | **[V]** emitted for MFA, sessions, lockdown; `AUDIT_ENABLED` has no effect (ID-11, Low) | |
| Operator commands | **[V]** dry run unless `--apply`, ticket reference required, `--account-id` accepted. **No in-app authorization**: whoever can run the task definition can run them (ID-19); no dedicated run-only task definition in infra (AW-16) | |
| Production startup | **[V] reproduced**: refuses without `MFA_ENCRYPTION_KEYS`, and with `IDENTITY_PASSWORD_RESET` at its default `enabled` | `environment.ts:352-378`, `password-recovery.ts:31,110-117` |
| Redis dependency | **[V]** readiness 503 and sign-in 503 when Redis is down (fails closed); edge rate limiter fails open | |
| Readiness vs migrations | **Fixed (ID-03)**: readiness ignored the MFA tables, so an image rolled before the migration reported ready (reproduced). identity#14 | |
| Open redirect | **Fixed (ID-02, Medium)**: `returnTo=/\evil.example` produced `Location: /\evil.example`. identity#14 | |

Consumer contract and residual weaknesses:

- **JWT**: ES256, `iss` exact, `aud` enforced by Work and Control, 30 s skew, `exp` ~15 min, refresh rotation in
  Identity. Shared verifier now also rejects tokens without numeric `exp` and matches a string `aud` exactly (PL-01,
  PL-02, platform#100; consumers get it at the next auth release).
- **One audience list for every token** (`IDENTITY_AUTH_AUDIENCE = "munaxa-work,munaxa-control"`): a Work token is
  also valid at Control's operator API (ID-05 / PL-07, Medium, prod). Control additionally requires its operator
  organisation and subject allowlist, which limits but does not remove this.
- **Revocation propagation**: Work and Control verify offline and never check `tokenVersion` or session, so sign-out,
  password change, MFA reset or account lockdown takes effect there only when the access token expires, about
  15.5 minutes (ID-06 / PL-05 / WK-02). Owner sign-off or a shorter TTL for the operator plane is needed for prod.
- **MFA trust on first enrollment**: an account without a factor enrolls whoever holds its password first when the
  policy starts enforcing (ID-18; ADR-0005 documents mitigations). Procedural for prod.
- **No JWKS**: rotation of the signing key means redeploying every verifier with new public keys (PL-06, WK-03).
- **Operational privilege**: running operator commands or reading the Identity secret requires `ecs:RunTask`,
  `ecs:ExecuteCommand` or task-definition registration with PassRole, or secret read. Today only root can do these
  (the session deployer has no `ecs:RunTask`).

Documented production configuration versus code: after identity#14, `docs/production-readiness.md`,
`docs/runbooks/aws.md` and `.env.example` name the same variables as `environment.ts`. The **platform infra does not
yet** (AW-01).

---

## 4. Platform compatibility findings

- **Versions [V]:** 13 lockstep packages at 2.4.1 (auth, crypto, types, ...), licensing 0.2.0, platform 1.7.0, six UI
  façades 1.1.1. Since each version, main has only devDependency changes. Every consumer resolves exactly the declared
  version with identical integrity hashes. The registry returned 401 to the audit session, so tarball contents were
  not byte-compared with main.
- **API compatibility [V]:** every named `@munaxa/*` import from the five consumers type-checks against the built
  packages at the resolved versions.
- **Identity uses the shared MFA implementation [V]** (`MfaService`), with its own store adapter.
- **Duplicates (PL-14, PL-15, Low):** Docs has its own HS256 JWT, TOTP and recovery codes (no secret pepper); School
  has its own HS256 JWT; each product has its own RLS `set_config` helper.
- **Licensing contract [V]:** Control issuer and products all use `@munaxa/licensing` 0.2.0. ES256/RS256 only; Control's
  KMS signer converts DER to P1363 correctly. Snapshot from Control is unsigned JSON over TLS + service token (PL-13).
  Control's 304 replies would be treated as an outage if a product sent `If-None-Match` (PL-12, latent).
- **Release pipeline (PL-03 High, PL-04 Medium):** `release.yml` could publish from any branch and skipped the release
  manifest check. **Fixed in platform#100.**
- **Shared verifier gaps (PL-01, PL-02) and MfaService recovery check (PL-09): fixed in platform#100**, with a patch
  changeset; they reach consumers only when auth 2.4.2 is released and consumers bump, which is a separate,
  owner-visible release step (not done here).
- **Remaining MfaService issues (PL-10, Low):** recovery codes are bare SHA-256 without pepper, `remove()` keeps
  recovery codes, `beginTotpEnrollment` overwrites. Only Identity uses MfaService and its adapter neutralises them.
- **Timing-sensitive tests (PL-17):** one wall-clock test failed on a loaded CI runner during this audit (audit
  package); rewritten in platform#100 to assert sink concurrency, not elapsed time.

---

## 5. Work readiness findings

Complete versus partial versus missing [V] (details in supporting/work.md):

- **Backend:** 18 modules wired, 513 routes. 34 migrations apply cleanly and idempotently as a non-superuser owner; RLS
  enabled and forced on 187/187 tables; startup refuses a superuser or BYPASSRLS role, production with licensing unset,
  and the default PII secret (each tested live).
- **Every module is partial as a product:** the admin is **read-only** (0 forms or buttons), has no token refresh (shows
  "signed out" after ~15 min) and no tenant picker (a user with two memberships gets 401). Relations and identity
  modules have no admin UI. Employee portal, manager portal and mobile app are placeholders.
- **Missing:** file storage (documents hold metadata only), notification delivery, a scheduler (workflow reminders and
  escalations never fire).
- **WK-01 (High, prod):** Work ignores the token's `tid` and applies its `perms` in whichever Work tenant the request
  names; reproduced with one ES256 token returning 200 in two tenants. Acceptable for nonprod only if every test user
  has one membership.
- **WK-02 (High, prod):** no tokenVersion, session, `amr` or `mfa` checks; no step-up for payroll or compensation.
- **WK-04 (Medium): fixed in work#30.** Tenant settings were read without the tenant set, so under the real runtime
  role RLS hid them and every tenant silently got the defaults. New test runs as the application role.
- **WK-06:** `/health` reports the cache "up" whenever `REDIS_URL` is set, although Redis is never used.
- **Licensing:** with Control unreachable and no stored snapshot, every request returns 402 while readiness stays 200.
- **WK-07: fixed in work#30**: CI ran only on pull requests, never on main. WK-09, WK-08, WK-10 doc and example
  corrections also in work#30.
- **Open Low:** OpenAPI page on by default in production (WK-11), `schema.prisma` drift from migrations (WK-12), no
  security headers or rate limiting (WK-13), ECR publish not gated on CI (WK-14), HEALTHCHECK port hard-coded (WK-15).

---

## 6. Docs readiness findings

- **Auth:** own HS256 sign-in with one `JWT_ACCESS_SECRET`; role and permission changes re-checked per request, failing
  closed when Redis is down. Not integrated with Munaxa Identity. [V]
- **Licensing:** Control Plane mode; production refuses the unlicensed default. [V]
- **Schema and migrations:** 32 migrations apply cleanly to two disposable tenant databases; RLS forced on 78/79 tables
  (the exception is the tenant table). [V]
- **Storage and files:** S3 with per-tenant prefixes in one `STORAGE_BUCKET`; the catalogue's per-tenant bucket is
  validated but ignored (DC-07). Uploads are presigned per object with 300 s expiry and must pass antivirus before
  download. Type sniff uses client-supplied magic bytes at session creation (DC-13, Low). [V]
- **Tenant isolation:** one database per tenant plus RLS. [V]
- **Email:** Resend, contradicting ADR-0025 (SES) (DC-12). No SES or SMTP in the platform infra (AW-18).
- **Background processing:** the worker module is a no-op; all consumers run inside the API process (DC-08).
- **DC-01 (High, blocks nonprod and prod):** the runtime image (`FROM scratch`) has no Prisma CLI; platform `docs.tf`
  gives migrations to `docs-provision`, but `provision.js` does not migrate and refuses an unmigrated database. Needs a
  `migrate` image target in Docs plus a `docs-migrate` task in the platform.
- **DC-02 (High, prod):** Redis is a sidecar per API task without persistence: restarts drop queued jobs; with more
  than one task, rate limits, caches and queues split.
- **DC-03 (prod):** audit checkpoints live in the document bucket, deletable by the API role, old versions expire after
  30 days, against a documented 7-year retention.
- **DC-04 (prod):** no cross-region replication and no scheduled per-tenant dump, against the documented RPO/RTO.
- **DC-06: fixed in docs#175** (production accepted the `.env.example` placeholder secrets).
- **Old eu-prod Terraform (DC-05):** emptied roots cannot recreate anything on their own; recreating would need a
  revert of #172 on main plus an approved run. `terraform-eu-prod.yml` remains dispatchable with a live CI/deployer
  path into the management account: an owner hygiene decision (retire the environment and roles), not done here.
- Current AWS Docs design versus app needs: the platform `docs.tf` matches the env and secret names, but lacks the
  migration path (DC-01), a durable Redis (DC-02), a separate audit-checkpoint store (DC-03), and Production `hosts`
  and certificate entries for Docs (AW-07).

---

## 7. Control and School findings

Licensing across Control, School, Work and Docs [V]:

| Question | Answer |
| --- | --- |
| Modes implemented | Control issues signed offline licences, signed revocation lists, and online entitlement snapshots. School: `DATABASE` (default, permissive), `LICENSE_FILE`, `CONTROL_PLANE`. Work and Docs: `NONE`, `LICENSE_FILE`, `CONTROL_PLANE` |
| Default | permissive (`DATABASE` / `NONE`) outside production |
| Can production run permissively by accident? | **No.** All three products refuse the permissive default in production, even with the variable unset (School booted to confirm) |
| Control required? | Only in `CONTROL_PLANE` mode; on-premises licence files never contact Control |
| Fails safely? | Bad signature, wrong product or installation, missing file → core modules only; expired → read-only; Control down → full 1 h, no growth 24 h, read-only 7 days, then nothing (Work: no snapshot ever → 402) |
| Signing | KMS asymmetric per ADR-0008; code and Terraform match |
| Public key distribution | by hand (`LICENSE_PUBLIC_KEYS`); no product fetches keys from Control |
| Migrations | Control 3/3 and School 92/92 apply and are idempotent on disposable databases |
| Contract consistency | product codes `school`, `work`, `docs` and payload fields match |

Control: CT-01 (Medium) image publishing on tag push relies only on the `image-release` environment existing and being
protected; CT-02 (Medium) a KMS self-test failure at startup takes the whole API down, entitlements included. Docs
correction in control#8.

School: SC-01 and SC-02 (High) **fixed in school#25** (deploy no longer creates the runtime DB role with the committed
password; seeding fails instead of using the public default owner password). SC-03 fixed (licensing variables in the
staging doc). Open: SC-04 `deploy.yml` reports success when the migration secret is missing; SC-05 its rollout job
only prints a message; SC-06 `render.yaml` is labelled staging but claims `app.munaxa.com` and `admin.munaxa.com`;
SC-07 School does not use Munaxa Identity. None of the School workflows can deploy on a push [V].

Missing School staging configuration (names only): GitHub environment secrets `DIRECT_DATABASE_URL`,
`PLATFORM_OWNER_PASSWORD`; variables `DATABASE_ENVIRONMENT`, `DATABASE_HOST`, `PLATFORM_OWNER_EMAIL`; runtime
`LICENSING_MODE`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`. Whether they are set in GitHub could not be inspected
(no environment-settings access).

---

## 8. AWS architecture assessment

Verified correct in code [V]: task vs execution role split; PassRole limited to the stack's roles; GitHub OIDC trust
pinned on `aud`, `sub` and ref; public subnets with public IPs, no NAT; security groups (database only from app and
db-admin groups); HTTP→HTTPS redirect; TLS 1.3 policy; RDS encrypted, not public; version-pinned secret references;
immutable ECR tags with scan on push; digest-only image references enforced by variable validation. Offline checks:
Terraform 1.16.5 / AWS provider 6.67.0 (checksums verified), `fmt` and `validate` pass for both roots,
`terraform test` bootstrap 12/12 and stack 28/28, probe tests 72/72, `stop-database.test.sh` 10/10, expected-changes
intent files valid.

Conflicts with application requirements or the approved direction:

| ID | Sev | Finding | Blocks |
| --- | --- | --- | --- |
| AW-01 | High | Identity task definition lacks `MFA_ENCRYPTION_KEYS`, `MFA_ENCRYPTION_PRIMARY_KID`, `IDENTITY_PASSWORD_RESET=disabled` (`services.tf:112-129`, `data.tf:150`) | nonprod for any post-5277d71 image; prod |
| AW-02 | High | Nonprod, prod, state and ECR all in account 229251310592, the Organizations management account (SCPs do not apply); contradicts separate member accounts | prod (nonprod: owner has accepted root-as-dev) |
| AW-03 | High | Prod Identity runs 2 tasks each with its own Valkey sidecar; MFA challenges, replay keys and lockout counters only work per task | prod |
| AW-04 | Med | Migrations and seeds are manual `ecs run-task` by root; `ops.tf` mentions a deploy workflow that does not exist | prod process |
| AW-05 | Med | `up` reports success without waiting for services to be healthy | nonprod operational |
| AW-06 | Med | Every stack role uses the nonprod permissions boundary name; a prod apply cannot create roles | prod |
| AW-07 | Med | `prod.tfvars` has no Docs host or certificate name, so Docs is not recreated in Production | prod (Docs) |
| AW-08 | Med | ECR lifecycle keeps only 20 newest images in repos shared by nonprod and prod; a pinned prod digest or rollback target can expire | prod |
| AW-09 | Med | No alarms, no SNS, no ALB access logs, Container Insights off | prod |
| AW-10 | Med | Prod RDS single-AZ, backups only same account and region | prod |
| AW-11 | Med | AWS-side backstop cannot delete the ALB; Stage B cleanup not yet in code | nonprod (owner rule on unbounded ALB cost) |
| AW-12 | Med | The $50 budget is account-wide and would include prod (~$170-230/month [E]) | neither |
| AW-13..21 | Low | Log groups not KMS-encrypted; stale `OPERATOR_REQUIRE_MFA=false` comment; `TRUST_PROXY_HOPS=1` behind proxied Cloudflare host sees the edge IP; no operator-command task def; no email transport; workers on by default; no image signature; scheduled `down` database job concurrency group | neither / prod |

Work, Control, School and Docs task definitions match their apps' required production settings, except Docs'
migration path (DC-01); none of them is enabled in nonprod tfvars today.

Cost and idle cleanup: the nonprod design (on-demand sessions, RDS stopped between sessions, scheduled backstop at
21:00) fits the ~$50/month target for Identity-only sessions [E]; the unbounded item is the ALB if a `down` fails,
which the Stage B cleanup design (platform#90, not built) addresses.

---

## 9. End-to-end integration assessment

Dependency chain per product (details and failure behaviour in the supporting files):

| | Identity | Work | Control | Docs | School |
| --- | --- | --- | --- | --- | --- |
| Authentication | own (password, MFA, sessions) | Identity ES256 access token (`PLATFORM_AUTH_*`), static public keys | Identity token + Cloudflare Access (`OPERATOR_ACCESS_*`) + operator org and subject allowlist | **own HS256** | **own HS256** |
| Authorization | roles in Identity org | `perms` from the token, applied per Work tenant header (WK-01) | operator allowlist | own RBAC, re-checked per request | own RBAC |
| Tenant resolution | organisation in token / default org | `x-tenant` header + membership | single operator org | tenant catalogue, DB per tenant | tenant DB overrides |
| Licensing | n/a | `CONTROL_PLANE` / `LICENSE_FILE` | issuer | `CONTROL_PLANE` | `CONTROL_PLANE` / `LICENSE_FILE` / `DATABASE` |
| Revocation | immediate in Identity | ~15.5 min (token expiry) | ~15.5 min | own sessions | own sessions |
| Database | RDS `identity` DB, `identity_app` role, RLS | `work` DB, `work_app`, RLS 187/187 | `control` DB, `control_app` | DB per tenant, RLS 78/79 | `school` DB, RLS 165/165 |
| Supporting services | Valkey (required, fails closed) | Redis configured but unused | KMS signing key (self-test at boot) | Redis sidecar (queues), S3, ICAP antivirus, Resend | S3, Resend, optional SMS/Firebase |
| Health | live `/api/auth/health/live`; ready checks DB, cache, required tables | `/health` (cache reported "up" if configured) | live/ready | ready fails if any tenant DB down | live/ready |

Integration gaps the per-repository audits alone would miss:

1. **Identity and Work cannot be deployed from current main together on today's stack**: Work verifies Identity
   tokens, but the only Identity image that starts on the stack is `5277d71`, which has no MFA routes. Work's
   behaviour is independent of `amr`/`mfa` (it reads neither), so pairing Work with `5277d71` is functionally
   possible for a nonprod test, but the hardened Identity needs AW-01 first.
2. **Single Identity audience list** makes every Work token valid at Control (PL-07); separate audiences per client
   need an Identity change.
3. **"Single sign-on" exists only for Work and Control.** Docs and School have their own users and secrets; a user
   has separate credentials in each. This is a product decision, not a defect, but it contradicts any claim of one
   Munaxa account.
4. **Key distribution is manual on both planes** (Identity signing public keys and Control licence public keys are
   pasted into env vars), so any rotation is a coordinated redeploy of all verifiers.
5. **Email exists nowhere in AWS**: Identity reset must stay disabled; Docs and School need Resend keys; ADR-0025
   says SES.
6. **Redis semantics differ**: Identity needs a shared Redis for correctness in multi-task prod (AW-03), Docs needs a
   durable one for queues (DC-02), Work does not use it at all (WK-06).

---

## 10. Critical and high-risk findings

No Critical findings. High findings:

| ID | Repo | Finding | Blocks | Status |
| --- | --- | --- | --- | --- |
| AW-01 / ID-01 | platform infra | Identity task def lacks MFA key ring, primary kid, `IDENTITY_PASSWORD_RESET=disabled` | nonprod (new images), prod | **open**: needs an infra PR plus a new secret (owner) |
| AW-02 | platform infra | single management account for everything | prod | open (owner decision) |
| AW-03 | platform infra | per-task Valkey for multi-task prod Identity | prod | open |
| WK-01 | work | token permissions apply in every Work tenant of the user | prod | open (Work owner decision) |
| WK-02 | work | revoked tokens accepted until expiry; no MFA step-up | prod | open |
| DC-01 | docs + platform | no migration path in the shared hosting | nonprod, prod | open |
| DC-02 | docs + platform | throwaway Redis sidecar holds the job queue | prod | open |
| PL-03 | platform | release could publish from any branch | prod | **fixed, platform#100** |
| SC-01 | school | seed used the public default owner password | nonprod, prod | **fixed, school#25** |
| SC-02 | school | deploy created the runtime DB role with a committed password | nonprod, prod | **fixed, school#25** |

## 11. Medium and low-priority findings

Medium, open: ID-04 (staging compose and `render.yaml` lack MFA/reset config), ID-05/PL-07 (one audience list),
ID-06/PL-05 (revocation window), PL-06 (no JWKS), PL-08 (Work ignores `tid`; same as WK-01), WK-03, WK-05, WK-06,
DC-03, DC-04, DC-05, DC-07, DC-08, CT-01, CT-02, SC-04, SC-05, SC-06, SC-07, AW-04 to AW-12.
Medium, fixed: ID-02, ID-03 (identity#14); PL-01, PL-04, PL-09 (platform#100); WK-04, WK-07 (work#30); DC-06 (docs#175);
SC-03 (school#25).

Low: listed with evidence in each supporting file (ID-07..17, PL-10..17, WK-08..16, DC-09..21, CT-03..08, SC-08..10,
AW-13..21). Fixed among them: ID-15, ID-16, ID-17, PL-02, PL-17, WK-08, WK-09, WK-10, DC-09, DC-10, CT-06.

---

## 12. Remediation PRs and merge SHAs

Each PR is narrowly scoped, tested locally, reviewed by an independent reviewer on its exact final head
(supporting/review-round1.md), and merged by squash only with CI green on that head.

| PR | Findings | Final head | Review (supporting/review-round1.md) | CI on final head | Merge SHA |
| --- | --- | --- | --- | --- | --- |
| munaxa-identity#14 | ID-02, ID-03, ID-01 docs, ID-15..17 | `a2ec0db` | Round 1 APPROVE | green | `cb11a66` |
| munaxa-work#30 | WK-04, WK-07..10 | `b6c48e5` | Round 1 APPROVE | green | `d3ba53b` |
| munaxa-control#8 | CT-06 + recovery.md path | `f8b5b53` | Rounds 1-2 APPROVE | green | `1f58c90` |
| munaxa-school#25 | SC-01..03 + staging role creation | `635264c` | Rounds 1-2 APPROVE | green | `4c2b4a4` |
| munaxa-platform#100 | PL-01..04, PL-09, PL-17, docs | `a4d052f` | Round 2 CHANGES REQUESTED (environment comment) → Round 3 APPROVE | green | `116650c` |
| munaxa-docs#175 | DC-06, DC-09, DC-10 + CONTROL_PLANE_TOKEN placeholder | `130b671` | Rounds 1-2 APPROVE | green | `187f08a` |

`main` after the merges (section 2 shows the audited baseline): identity `cb11a66`, work `d3ba53b`, control `1f58c90`,
school `4c2b4a4`, platform `116650c`, docs `187f08a`. Nothing was built, published or deployed from them.

Review findings carried forward rather than fixed (not blocking, recorded here):
- School (Medium, operational): any environment where an older deploy ran `app-role.sql` against a database that
  lacked the role has `munaxa_app` with the committed dev password. The staging guide now gives the rotation
  command; checking deployed School databases needs database access (owner action, not done here).
- Platform (Low): with the in-memory MFA store, abandoning a re-enrolment now also disables recovery codes; Identity
  is unaffected (its store keeps confirmed and pending factors apart).
- Platform (Low, cosmetic): a step comment in `release.yml` still says "see the environment above".
- Identity (Low, pre-existing): a repeated `returnTo` query parameter returns 500.
- Work (Low): ADR-0076 still calls the revocation window "not a defect".
- Release publishing (Medium, settings): `release.yml`'s branch guard stops accidents only; a real control needs the
  publish token held as a main-only environment secret with a reviewer and package Actions access reduced to Read
  (owner settings change, production prerequisite).

CI during this audit: between about 14:26 and 16:58 UTC GitHub-hosted runners could not resolve `archive.ubuntu.com`
/ `security.ubuntu.com`, so every job that installs apt packages failed (Docs ClamAV/c-icap image and integration
jobs, Docs end-to-end, Platform accessibility). Those failures were in steps the PRs do not touch. The failed jobs
were re-run at 15:02, 15:45 and 16:03 (still failing on name resolution, logs show `Temporary failure resolving`)
and at 16:58 (Platform) and 17:03 (Docs), when the mirror resolved again. A PR was merged only when its final head was green.

Deliberately **not** fixed here: AW-01 (changing the Identity task definition invalidates the Stage C/D plans already
predicted and couples to creating a new secret, which needs the owner), DC-01 (a cross-repo feature: new image target
plus a new task definition), WK-01/WK-02 (authorization model changes needing the Work owner), all owner decisions.

---

## 13. Exact remaining blockers

For an **Identity non-production session on `5277d71`** (closest path):
1. Owner approval of Stage B (cleanup infrastructure: build of the platform#90 design), Stage C (probe task
   definition plan and apply), Stage D (session and Option A secrets). All are AWS changes: prohibited here.

For **Identity from current main** in non-production, additionally:
2. Repository: an infra PR adding `MFA_ENCRYPTION_KEYS` to the identity secret bundle and
   `MFA_ENCRYPTION_PRIMARY_KID`, `IDENTITY_PASSWORD_RESET=disabled`, `MFA_POLICY` to the task environment, with updated
   expected-changes intent and mocked tests (can be prepared without AWS access).
3. Owner: create the MFA key-ring secret value (generation is prohibited for Claude without approval), plan and apply
   the change, publish an Identity image from main (dispatch), run migration `20261111130000_identity_mfa` before
   rolling the new image.

For **Work** in non-production: Work enablement in nonprod tfvars (new resources, owner apply), the Work image digest,
`PII_MATCH_SECRET` and `CONTROL_PLANE_TOKEN` secrets, Control running (or `LICENSE_FILE` mode), test users with one
membership each.

For **Docs**: DC-01 implemented in both repos before any hosting.

For **Production** (all products): member accounts (AW-02), prod boundary (AW-06), shared Redis (AW-03, DC-02),
alarms and logs (AW-09), backups (AW-10, DC-04), ECR retention (AW-08), auth 2.4.2 release and consumer bumps, owner
sign-off on the revocation window and single audience (PL-05, PL-07), Work tenant permission model (WK-01), email
transport, Docs host and certificate (AW-07).

---

## 14. Required environment variable names (never values)

Identity (post-hardening image, `NODE_ENV=production`): required `NODE_ENV`, `DATABASE_URL`*,
`IDENTITY_SIGNING_PRIVATE_KEY`*, `IDENTITY_SIGNING_SECRET`*, `IDENTITY_SIGNING_KID`, `IDENTITY_BASE_URL`,
`IDENTITY_AUTH_AUDIENCE`, `CSRF_TRUSTED_ORIGINS`, `REDIS_URL`*, `MFA_ENCRYPTION_KEYS`*, `MFA_ENCRYPTION_PRIMARY_KID`,
`IDENTITY_PASSWORD_RESET` (=disabled); set by the stack `PORT`, `IDENTITY_SIGNING_ALGORITHM`,
`IDENTITY_DEFAULT_ORGANISATION`, `LOG_PRETTY`, `TRUST_PROXY_HOPS`, `MFA_POLICY`, `MFA_PRIVILEGED_ROLES` (if
privileged), `APP_VERSION`, `BUILD_SHA`. (* secret; each also accepted as `<NAME>_FILE`.) Bootstrap task:
`IDENTITY_OWNER_EMAIL` (placeholder `IDENTITY_OPERATOR_EMAIL` in docs), `IDENTITY_OWNER_PASSWORD`. Migrate:
`DATABASE_MIGRATION_URL`.

Work: `DATABASE_URL`, `NODE_ENV`, `PII_MATCH_SECRET`, `LICENSING_MODE`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`
(or `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_INSTALLATION_ID`), `PLATFORM_AUTH_ISSUER`,
`PLATFORM_AUTH_AUDIENCE`, `PLATFORM_AUTH_ALGORITHM`, `PLATFORM_AUTH_PUBLIC_KEYS`, `OPENAPI_ENABLED` (set false);
admin `WORK_API_URL`, `PLATFORM_SIGN_IN_URL`; migrate `DATABASE_MIGRATION_URL`.

Control: `NODE_ENV`, `DATABASE_URL`, `OPERATOR_AUTH_ISSUER`, `OPERATOR_AUTH_AUDIENCE`, `OPERATOR_AUTH_ALGORITHM`,
`OPERATOR_AUTH_PUBLIC_KEYS`, `OPERATOR_ORGANISATION_ID`, `OPERATOR_REQUIRE_MFA`, `OPERATOR_SUBJECT_ALLOWLIST`,
`OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`, `LICENCE_SIGNING_BACKEND`, `LICENCE_SIGNING_KMS_KEY_ID`,
`LICENCE_SIGNING_PUBLIC_KEY`, `LICENCE_SIGNING_KID`, `LICENCE_SIGNING_ALGORITHM`, `TRUST_PROXY_HOPS`; portal
`CONTROL_API_URL`, `OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`.

Docs: `NODE_ENV`, `DEPLOYMENT_PROFILE`, `TENANT_CATALOGUE`, `DATABASE_URL`, `REDIS_URL`, `QUEUE_CONSUMERS_ENABLED`,
`JWT_ACCESS_SECRET`, `CORS_ORIGINS`, `WEB_BASE_URL`, `TRUST_PROXY`, `STORAGE_DRIVER`, `STORAGE_BUCKET`,
`STORAGE_REGION`, `STORAGE_CREDENTIALS_SOURCE`, `MAIL_DRIVER`, `MAIL_FROM_ADDRESS`, `MAIL_RESEND_API_KEY`,
`AV_DRIVER`, `AV_ICAP_URL`, `OPENAPI_ENABLED`, `METRICS_DRIVER`, `METRICS_SCRAPE_TOKEN`, `LICENSING_MODE`,
`CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`, `OUTBOUND_HTTP_ALLOWLIST`, `SIGNATURE_WITNESS_SECRET`,
`AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`.

School: `NODE_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL` (migrations, seed), `CORS_ORIGINS`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `LICENSING_MODE`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`, `AWS_REGION`, `AWS_S3_BUCKET`,
`RESEND_API_KEY`, `EMAIL_FROM`; admin build `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENV`; seed `PLATFORM_OWNER_EMAIL`,
`PLATFORM_OWNER_PASSWORD`.

Full lists including optional tuning variables are in each supporting file.

## 15. Required secret names (never values)

Secrets Manager bundles defined in infra: `munaxa-<env>/identity` (`DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`,
`IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD`; **missing `MFA_ENCRYPTION_KEYS`**),
`munaxa-<env>/identity-migrate` (`DATABASE_MIGRATION_URL`), one-run `munaxa-<env>/identity-bootstrap`
(`IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD`), persistent `munaxa-nonprod/identity-operator` (Option A),
`munaxa-<env>/work-api` (`DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN`), `munaxa-<env>/work-migrate`,
`munaxa-<env>/control-api` (`DATABASE_URL`), `munaxa-<env>/control-migrate`, `munaxa-<env>/school-api` (`DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CONTROL_PLANE_TOKEN`, `RESEND_API_KEY`), `munaxa-<env>/school-migrate`,
`munaxa-<env>/school-bootstrap`, `munaxa-<env>/docs-api` (`DATABASE_URL`, `TENANT_CATALOGUE`, `REDIS_URL`,
`REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `SIGNATURE_WITNESS_SECRET`, `AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`,
`METRICS_SCRAPE_TOKEN`, `MAIL_RESEND_API_KEY`, `CONTROL_PLANE_TOKEN`), `munaxa-<env>/docs-operator`,
`munaxa-<env>/docs-provision/<slug>`, and the RDS-managed master secret. KMS: Control licence signing key (no key
material in any secret).

GitHub: `PLATFORM_PACKAGES_TOKEN` (all product repos), variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`, environment
`image-release`; Docs `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`; School `DIRECT_DATABASE_URL`,
`PLATFORM_OWNER_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

---

## 16. Non-production deployment prerequisites

Identity on `5277d71` (Config A1 already applied, nothing running):
1. Owner approval and execution of Stages B, C, D (cleanup infra, probe task definition, session with Option A
   secret custody), as defined in `2026-11-11-identity-final-operator-runbook/`.
2. `MFA_POLICY` irrelevant (image has no MFA); `IDENTITY_PASSWORD_RESET` irrelevant (no reset route).

Identity from main: items 2 and 3 of section 13, then the same Stage D session.

Work (after Identity): enablement PR and apply, secrets above, Control or licence file, single-membership test users,
acceptance that the admin is read-only.

Control: KMS key and enablement in nonprod (owner apply), Cloudflare Access application (owner), `image-release`
environment protection confirmed (CT-01).

School: school#25 merged, GitHub environment configuration listed in section 7, enablement and apply.

Docs: DC-01 first.

## 17. Production deployment prerequisites

Section 13 production list, plus: separate Production member account with its own state and ECR replication, prod
permissions boundary, Docs recreated there (AW-07, owner direction), ALB access logs and alarms with SNS, multi-AZ
or documented single-AZ acceptance, cross-account or cross-region backups, auth 2.4.2 released and consumed, MFA
policy `privileged` with the trust-on-first-enrollment procedure, operator command task definition with least
privilege, email transport (SES per ADR or Resend decision), and owner sign-off on residual risks (revocation window,
single audience, Work tenant permissions).

## 18. Recommended next execution sequence

1. (Done in this audit) merge the six remediation PRs.
2. **Owner decides which Identity image the first nonprod session uses.** Recommended: the hardened main image,
   because `5277d71` would test an Identity without MFA, password change or reset routes that will never ship. That
   needs step 3.
3. Repository-only, no AWS: one platform PR for AW-01 (task env + secret key + intent + mocked tests), reviewed.
4. Owner approvals in order: Stage B (cleanup infra), MFA key-ring secret creation, plan/apply of AW-01 and Stage C,
   Identity image publish from main, Stage D session (migrate → bootstrap → probe → down).
5. Then Work and Control enablement for a first end-to-end nonprod session; Docs after DC-01; School after its
   GitHub environment configuration.
6. Production work only after the member-account decision (AW-02).

**Single recommended next step:** prepare the AW-01 platform PR (repository-only) so that the first Identity
non-production session can run the hardened image; it needs no AWS access and unblocks every later Identity step.
