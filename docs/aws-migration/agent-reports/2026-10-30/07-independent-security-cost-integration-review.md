# 07 Independent security, cost and integration review (Agent 7)

Agent 7 owns none of the implementation it reviews. Report refreshed **30 Oct 2026, 15:25 UTC**
against live GitHub. Read-only throughout: no secret values appear here.

Labels used below: **[V]** verified against the repository or GitHub at the time stated,
**[A]** assumption or estimate, **[R]** recommendation.

## 1. Scope and repositories inspected

All six repositories were inspected. Each local checkout was confirmed equal to `origin/main` at
15:20 UTC [V]:

| Repository | main | Last merged change |
| ---------- | ---- | ------------------ |
| munaxa/munaxa-platform | `c4a1ad0` | #26 Docs and file storage in the shared stack, shared contract |
| munaxa/munaxa-control | `739be21` | #6 portal downloads carry the Access token, offline pnpm |
| munaxa/munaxa-identity | `b97b3ab` | #4 bootstrap password kept out of ECS task overrides (R-16) |
| munaxa/munaxa-docs | `406eaee` | #166 outbound User-Agent and timeout test |
| munaxa/munaxa-work | `da84612` | #27 publish actions pinned by SHA |
| munaxa/munaxa-school | `54cf3eb` | #23 SSE header not signed into presigned uploads |

The scope covers security, tenant isolation, authentication and authorization, KMS and
licensing, IAM, network exposure, secrets handling, images and workflows, migration safety, cost
against the US$50 target, and cross-product compatibility. It also covers review of the Agent 1 to 6
reports and every PR they opened in this phase.

**Incomplete parts of this audit:**
- No live AWS check was possible today, because the AWS connector's sign-in had expired, so live
  cost and resource state are unverified. Cost uses the 29 Oct measured idle Docs figure and list
  prices from memory [A].
- No Terraform plan ran against AWS (that needs G2). No container image was built by the reviewer.
- Docs application code was reviewed only for its AWS interface (licensing, storage, workflows),
  not as a full security audit.

## 2. Current implementation status

| Component | Code | Shared stack | Open items |
| --------- | ---- | ------------ | ---------- |
| Platform | Ready [V] | n/a | T13 `OPENAPI_ENABLED=false` for work-api (Low) |
| Identity | Ready [V] | Yes [V] | none |
| Control | Ready [V] | Yes [V] | none |
| Work | Ready [V] | Yes [V] | none |
| School | Ready [V] | Yes, with bucket and task role [V] | R-05 Firebase (optional), R-15 mobile uploads (outside Testing) |
| Docs | Ready, image must be rebuilt [V] | Yes, `stack/docs.tf` [V] | docs#167 open |

Nothing is deployed. No Testing AWS resource exists from this work [A: not re-checked live today].

## 3. Files and components reviewed

- **Platform:** `infra/aws/bootstrap/{main,iam,budget,variables}.tf`,
  `infra/aws/stack/{network,edge,data,services,ops,storage,docs,variables,outputs}.tf`,
  `stack/scripts/{db-bootstrap.sh,docs-cluster-roles.sql}`, `modules/service/*`,
  `stack/envs/nonprod.tfvars`, `stack/tests/stack.tftest.hcl` (14 runs on main),
  `.github/workflows/{aws-session,aws-terraform}.yml`, `infra/aws/README.md`, `CONTRACT.md`.
- **Control:** `apps/api/src/auth/authentication.guard.ts`, the route controllers (licensing,
  entitlements, catalogue, customers, reports, health), `apps/api/src/setup.ts`,
  `apps/portal/src/middleware.ts`, `apps/portal/src/lib/api.ts`, `Dockerfile`,
  `scripts/migrate.mjs`, `.github/workflows/publish-images.yml`.
- **Identity:** `packages/config/src/environment.ts`, `apps/api/src/auth/auth.service.ts`,
  `apps/api/Dockerfile`, `docs/runbooks/aws.md`, `publish-images-ecr.yml`, root tree.
- **Work:** `packages/config/src/environment.ts`, `apps/api/Dockerfile`,
  `deploy/aws/runtime-grants.sql`, `apps/api/src/main.ts`, `publish-images-ecr.yml`.
- **School:** `apps/api/src/common/storage.service.ts`, `apps/api/src/config/env.validation.ts`,
  `apps/api/src/auth/services/firebase.service.ts`, `apps/api/Dockerfile`,
  `infra/postgres/runtime-grants.sql`, `publish-images-ecr.yml`.
- **Docs:** `infra/terraform/eu-prod/service/{ecs,secrets,variables,launch.auto}.tf*`,
  `.github/workflows/publish-images.yml` (main and the docs#167 head).

## 4. Work completed by Agent 7

1. Independent first-pass review: 13 findings (R-01 to R-13) at 10:57 UTC [V].
2. Reviewed the reports of Agents 2 to 6 and `SHARED-CONTRACT.md`, and challenged Agent 4 on the
   ECR boundary conflict (see §14).
3. Reviewed these PRs before they merged: school#21, control#6, platform#26 (commits `abf6af3`,
   `875083a`, `cfb01ee`), and school#23. Verified on main after merge: identity#3, work#27, school#22.
4. Raised R-14 (`edms_backup` BYPASSRLS), R-15 (School mobile Content-Length), R-16 (bootstrap
   password in overrides) and R-07b (Docs actions).
5. Wrote the 8 consolidated deliverables in `/mnt/project-files/aws-testing/`:
   AWS-EXECUTION-BACKLOG (ledger T01 to T34), ARCHITECTURE-READINESS, COST-ESTIMATE,
   ENVIRONMENT-VARIABLES, DEPLOYMENT-SEQUENCE, SECURITY-REVIEW, TESTING-ACCEPTANCE and
   BLOCKERS-AND-OWNER-ACTIONS.

## 5. Work still in progress

- docs#167: verify CI on its latest head before merge (§7).
- Tamer's B2 budget decision is pending on a decision card in this thread.
- T13: `OPENAPI_ENABLED=false` for work-api is not set on platform main (Low; the ALB does not
  route `/api/docs`).

## 6. PRs reviewed, with status (checked 15:20 UTC) [V]

| PR | Head / merge | Status | Agent 7 verdict |
| -- | ------------ | ------ | --------------- |
| [platform#26](https://github.com/munaxa/munaxa-platform/pull/26) | merged `c4a1ad0` | merged | No blocker at `abf6af3`, `875083a`, `cfb01ee` |
| [control#6](https://github.com/munaxa/munaxa-control/pull/6) | merged `739be21` | merged | Sound; closes R-08, R-07 for Control, C1, R-12 |
| [identity#2](https://github.com/munaxa/munaxa-identity/pull/2) | merged `9aa4dc1` | merged | Agrees with I1 |
| [identity#3](https://github.com/munaxa/munaxa-identity/pull/3) | merged `594003f` | merged | Verified R-07 and R-11 on main; raised R-16 on its runbook |
| [identity#4](https://github.com/munaxa/munaxa-identity/pull/4) | merged `b97b3ab` | merged | R-16 runbook side; diff not separately reviewed |
| [work#26](https://github.com/munaxa/munaxa-work/pull/26) | merged | merged | Docs only; not reviewed line by line |
| [work#27](https://github.com/munaxa/munaxa-work/pull/27) | merged in `da84612` | merged | Verified all ECR publish `uses:` SHA-pinned on main |
| [school#21](https://github.com/munaxa/munaxa-school/pull/21) | merged `c6ddd5a` | merged | No blocking issue |
| [school#22](https://github.com/munaxa/munaxa-school/pull/22) | merged | merged | Verified pins and SVG `attachment` on main |
| [school#23](https://github.com/munaxa/munaxa-school/pull/23) | merged `54cf3eb` | merged | No hold |
| [docs#167](https://github.com/munaxa/munaxa-docs/pull/167) | head `a53852d`, branch `claude/project-thread-rs73yv` | **open** | Head pins every action by SHA (closes R-07b once merged); CI evidence on this head not seen |

## 7. CI and test evidence [V]

- **munaxa-platform main `c4a1ad0`:** CI run [41073487240](https://github.com/munaxa/munaxa-platform/actions/runs/41073487240)
  `success` (push, 14:39 to 14:50 UTC). On the PR head: "Format, validate, mocked plan tests"
  `success`. The `Plan`/`Apply` jobs were `skipped` on the PR, which is expected because they are
  dispatch-only. No real plan has run.
- **control#6** (first head): "Format · Lint · Typecheck · Test · Build" and "Build the images"
  were `failure` at 10:58 UTC. Agent 2 reports both green on `d68e1a7` before merge; the reviewer did
  not re-open that run.
- **school#21:** "Lint · Typecheck · Test · Build (JS/TS)" `success` and "Security scans"
  `success` (run 41044095832).
- **docs#167:** 22 check runs were all `success`, from runs 41044058200 and 41044081583 at 10:53 UTC.
  These predate the pinning commit `a53852d`, and **no check run for `a53852d` was visible** at
  15:20 UTC.
- **Work isolation:** Agent 5 reproduced it locally on PostgreSQL 16 (`app_isolation_diagnostics()`
  = `work_app|f|f|f`). That is the agent's evidence; the reviewer did not re-run it.
- The reviewer's own checks were static reading, `git grep`, and diffs. No unit test was run by Agent 7.

## 8. Infrastructure dependencies (as reviewed)

The detail is in CROSS-REPOSITORY content: `SHARED-CONTRACT.md` and platform `infra/aws/CONTRACT.md`.
Key reviewed edges:
- Identity (issuer `https://id.test.munaxa.com`, ES256) → Work and Control token verification.
- Control (`https://control-api.test.munaxa.com`, `mxc_` per-deployment credential) → Work,
  School and Docs licensing. The ALB forwards only `/api/v1/products/*`, `/api/v1/licensing/*` and `/health/*`.
- Shared RDS PostgreSQL 16, with a database plus owner and runtime role per product. Docs uses
  a database per tenant, `edms_*`.
- S3: the School and Docs buckets are admitted on the gateway endpoint. ECR is `munaxa-<product>/*`, and Docs is pull-only.
- Cloudflare: DNS-only `*.test` hosts, plus `operator-test.munaxa.com` proxied behind Access.

## 9. Required environment variables

Names only, consolidated in `ENVIRONMENT-VARIABLES.md`. No values are recorded anywhere.

## 10. Security findings and severity (current status, 15:20 UTC)

| ID | Sev | Finding | Status |
| -- | --- | ------- | ------ |
| R-01 | Blocker | Docs had no Testing home; the boundary denied `munaxa-docs*` | **Closed** [V] platform#26 (`docs.tf`, pull-only boundary) |
| R-02 | Blocker (decision) | US$50 vs. old Docs stack | **Open**, Tamer (§14, §15) |
| R-03 | High | School needed static keys, silently stubbed uploads, endpoint blocked buckets | **Closed** [V] school#21, #23 and platform#26 |
| I1 (Agent 3) | High | Per-IP login limit was global behind the ALB | **Closed** [V] identity#2 plus `TRUST_PROXY_HOPS=1` |
| C1 (Agent 2) | High | Portal downloads lacked the Access token | **Closed** [V] control#6 |
| R-04 | Medium | Licence KMS key destroyable via tfvars | **Closed** [V] `prevent_destroy` |
| R-05 | Medium | School Firebase off on AWS | Open, optional |
| R-06 | Medium | One token valid for Work and Control | **Open**, accepted for Testing; fix before Production [R] |
| I3 / C6 | Medium | No MFA claim; Access is the operator's second factor | **Open**, accepted for Testing; the Access policy must require MFA (G6) |
| R-07 | Medium | Tag-pinned actions with OIDC credentials | **Closed** [V] for Identity, Control, Work and School |
| R-07b | Medium | Same, in Docs `publish-images.yml` | Open until docs#167 merges |
| R-08 | Medium | Control migrate downloaded pnpm at run time | **Closed** [V] control#6 |
| R-14 | Medium | `edms_backup` BYPASSRLS on the shared instance | **Mitigated** [V]: CONNECT only on `edms_*`, fail-closed check; residual Low |
| R-15 | Medium | School mobile uploads lack Content-Length vs. signed header | Open, outside Testing |
| R-16 | Medium | Bootstrap password via ECS override | **Closed** [V] platform#26 `cfb01ee`, identity#4 |
| C4 | Low | ALB admin refusal was case-sensitive | **Closed** [V] platform#26 `875083a` |
| C8 | Low | munaxa-control `main` unprotected | Open, Tamer |
| R-09 | Low | Public-repo schedule can auto-disable | **Closed** [V] account budget alerts at 80% and 100%, plus forecast |
| R-10 | Low | SVG branding | **Closed** [V] school#22 |
| R-11 | Low | Stray root files in Identity | **Closed** [V] identity#3 |
| R-12 | Low | Stale Control Dockerfile header | **Closed** [V] control#6 |
| R-13 | Info | No Terraform check on empty operator allow-list | Open, Info; Control refuses at boot |
| W3 / T13 | Low | Work serves OpenAPI | Closed by platform#27 once merged |
| P9 (Agent 1) | Medium | Deployer can change Docs Production VPC, security groups and ALB | **Open**; fix before G3 [R] |
| R-17 | Medium | One deployer role for nonprod, the unreviewed session environment, and prod | **Open**; fix before G8 [R] |
| P10 / P11 (Agent 1) | Verify | KMS rotation-status read; OIDC subject format | **Open**; check before G2/G3 |

### First-pass findings as raised at 10:57 UTC (preserved)

| ID | Sev | Owner | Finding | Evidence |
| -- | --- | ----- | ------- | -------- |
| R-01 | Blocker | Agent 1 + Agent 4 | **Docs has no Testing environment in the shared architecture.** The kickoff says recreate Docs in the new architecture. The platform stack has no Docs service, and its README says Docs "keeps its own Production stack and is not managed here". The only Docs Terraform is `munaxa-docs/infra/terraform/eu-prod`, which is the old stack we must not touch. Worse, the shared workload boundary and deployer **explicitly deny** `munaxa-docs*` secrets and `repository/munaxa-docs/*` ECR, which is the naming the stack's own image regex (`munaxa-<product>/<image>`) would give a Docs image. Adding Docs needs new names or a boundary change. | platform `infra/aws/README.md:5`, `infra/aws/bootstrap/iam.tf` (`NeverMunaxaDocs`, `NeverMunaxaDocsOrBootstrap`), `stack/variables.tf:175` |
| R-02 | Blocker (owner decision) | Lead / Tamer | **The US$50 target cannot hold while the old Docs stack runs in the same account.** Idle Docs alone was about US$47.8/month on 29 Oct (ALB, IPv4, RDS, storage, KMS, secrets). Testing adds an idle floor (RDS storage, 3 KMS keys, 9 secrets, private zone, ECR) of roughly US$10-12 and about US$0.21 per session hour. The decision "keep the old Docs stack" and the "$50" target conflict; one of them has to give, or the target must exclude the old stack. | memory of 29 Oct cost evidence; `stack/data.tf`, `stack/services.tf` |
| R-03 | High | Agent 6 (code), Agent 1 (infra) | **School file storage cannot work on AWS without static IAM keys.** `StorageService.configured` requires `AWS_ACCESS_KEY_ID` as well as `AWS_S3_BUCKET`. With a task role and no keys, production silently returns stub URLs (`https://uploads.munaxa.local/...?stub=put`), so uploads look accepted and are lost. Static keys are forbidden (no IAM users or keys). Also: the platform has no School bucket or task role, and the VPC's S3 gateway endpoint policy only admits `prod-eu-central-1-starport-layer-bucket`, so the task's `HeadObject`/`DeleteObject` calls to any School bucket in eu-central-1 would be denied. | school `apps/api/src/common/storage.service.ts:81-83,158-161`; platform `stack/network.tf` (`aws_vpc_endpoint.s3`) |
| R-04 | Medium | Agent 1 | **The licence signing key is destroyed if `images.control_api` is ever unset.** `aws_kms_key.licence` has `count = local.defined.control_api ? 1 : 0` and no `prevent_destroy`. Clearing the image, or a typo, schedules the key for deletion; every licence it signed then becomes unverifiable after 30 days. | platform `stack/services.tf` (`aws_kms_key.licence`) |
| R-05 | Medium | Agent 6 + Agent 1 | **Firebase is off on AWS Testing**, so School's account-linking fix (#20) cannot be accepted there. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` are in neither the School env block nor the `school-api` bundle. | school `apps/api/src/auth/services/firebase.service.ts:26`; platform `stack/data.tf` `secret_keys` |
| R-06 | Medium | Agent 3 | **One Identity token is valid for both Work and Control** (`IDENTITY_AUTH_AUDIENCE = "munaxa-work,munaxa-control"`). Control mitigates with `tid`, `sid`, allow-list and Cloudflare Access, so not a Testing blocker, but tokens should be audience-scoped per product before Production. | platform `stack/services.tf` (identity env); control `apps/api/src/auth/authentication.guard.ts:142-173` |
| R-07 | Medium | Agents 2, 3, 5, 6 | **ECR publish jobs use third-party actions pinned by mutable tag** while holding AWS OIDC credentials (`docker/setup-buildx-action@v3`, `docker/build-push-action@v6`, `aws-actions/*`, `actions/checkout@v6`). The platform repo pins by SHA. Mitigated by the required reviewer and per-repo push scope. | `publish-images-ecr.yml` in identity, work, school; `publish-images.yml` in control |
| R-08 | Medium | Agent 2 | **Control's migrate image may not run as `node`.** `scripts/migrate.mjs` shells out to `pnpm`; pnpm was prepared by corepack as root in the `base` stage, and the `migrate` target switches to `USER node`. Corepack then likely downloads pnpm at run time, or fails. Needs one `docker run --target migrate` check. | control `Dockerfile:32,80-84`, `scripts/migrate.mjs:14-27` |
| R-09 | Low | Agent 1 | The evening "down" backstop is a `schedule` in a **public** repo; GitHub disables schedules after 60 days without repository activity, so Testing could stay up silently. A budget alert should be the second backstop. | platform `.github/workflows/aws-session.yml:25-26` |
| R-10 | Low | Agent 6 | Branding uploads allow `image/svg+xml`. Served from the bucket origin, so not same-origin XSS, but should be served as attachment or removed. | school `storage.service.ts:150` |
| R-11 | Low | Agent 3 | Empty stray files `node`, `pnpm`, `munaxa-identity@0.1.0` at the Identity repo root since the initial commit. | identity root |
| R-12 | Low | Agent 2 | Control `Dockerfile` header still says the signing key is mounted at run time; stale under KMS (ADR-0008). | control `Dockerfile:16` |
| R-13 | Info | Agent 1 | Terraform does not check `control_operator_subjects` is non-empty while MFA is off; Control refuses at boot, so this is only an earlier failure. | platform `stack/variables.tf:258` |

### Exposure model (no defect; owner awareness)
- The `*.test` hosts are DNS-only, so the ALB is directly on the internet with no WAF. Only
  `operator-test` is behind Cloudflare Access. A direct ALB request carrying that Host header gets
  401 from both the portal and the API [V].
- **Process risk:** the AWS connector authenticates as the account **root user** (owner
  decision of 29 Oct to stay on root until launch). Any tool session holds full account power [R]:
  keep connector use read-only, keep root MFA on, and never create root access keys.

## 11. Cost implications [A]

From `COST-ESTIMATE.md`. These are list prices from memory, not checked against the Pricing API today.
- Testing idle floor is about **US$11 a month**. Per session hour, about **US$0.21** without Docs and about **US$0.30** with Docs.
- The old Docs stack in the same account is about **US$47.8 a month** idle (measured on 29 Oct).
- At 40 session hours a month: about **US$23** for Testing alone, or about **US$71** for the account.
- `bootstrap/budget.tf` sets a **US$50 account budget** [V], so while the old stack runs, the
  80% alert will fire every month.

## 12. Blockers and owners

| Blocker | Owner |
| ------- | ----- |
| B2: does the US$50 target cover Testing only or the whole account? | **Tamer** (decision card in this thread) |
| G2 bootstrap, G4 secret values, G5 image publish, G6 Cloudflare DNS and Access | **Tamer** |
| Protect munaxa-control `main` | **Tamer** |
| docs#167 CI on `a53852d`, then merge | Agent 4 |
| A fresh Docs image from main (the old digest predates licensing) | Tamer at G5 |

All code blockers raised by Agent 7 are closed.

## 13. Recommended next actions [R]

1. Tamer answers B2. Agent 1 then sets `budget_limit_usd` to match, by PR.
2. Merge docs#167 once its latest-head CI is green.
3. Optional PR: `OPENAPI_ENABLED=false` on work-api (T13).
4. Tamer runs G2 (bootstrap as root in CloudShell), then follows `DEPLOYMENT-SEQUENCE.md`.
5. Before Production: per-product token audiences (R-06), an Identity MFA claim (I3), and a decision on Firebase for School (R-05).
6. Sign in to the AWS connector again so cost and resource state can be verified live.

## 14. Conflicting recommendations and inconsistencies (not silently resolved)

| # | Conflict | Positions | State |
| - | -------- | --------- | ----- |
| X1 | **Budget scope** | The kickoff says the "testing budget target" is about US$50. `SHARED-CONTRACT.md` §10 and `bootstrap/budget.tf` treat US$50 as the **whole account**, including the old Docs stack (about US$48). Agent 7: the two cannot both hold. | **Unresolved; Tamer's decision** |
| X2 | Docs images | Agent 4 wanted to reuse the `munaxa-docs/*` ECR repos. The workload boundary denied them (Agent 7, R-01). | Resolved by Agent 1: boundary allows pull only (platform#26) |
| X3 | Control and the platform | Agent 2: "no platform change required for Control". Agent 7 and Agent 2's own C4: the ALB admin refusal was case-sensitive. | Resolved: the allow list plus rule 21 (platform#26 `875083a`) |
| X4 | School Firebase | Agent 6: add the keys only if Firebase login is wanted (optional). Agent 7: Medium, because the #20 fix cannot be accepted on AWS without it. | **Open**; low stakes, Tamer may choose |
| X5 | Database model | Shared stack: one database per product. Docs: a database per tenant with a cluster-wide BYPASSRLS backup role. | Accepted with a fail-closed CONNECT check (R-14) |
| X6 | Authentication | Work and Control use Identity (ES256). School uses its own HS256 JWT plus Firebase. Docs uses its own auth, MFA and OIDC/SAML. Identity has no OIDC. | Accepted for Testing; SSO is a later phase |
| X7 | Token audience | Identity issues both audiences in every token. Control mitigates; Work does not need to. | Accepted for Testing (R-06) |
| X9 | Deployer scope | Agent 1 treats P9 (deployer reach over Docs Production network/ALB) as an owner decision. Agent 7 rates it Medium, to fix before G3, and adds R-17 (one deployer for all environments). | **Open**; Tamer decides, Agent 1 implements |
| X8 | School deploy workflows | School's GHCR/Render path coexists with ECR. Work's GHCR publish also triggers on the same `image/**` tag without a protected environment (Agent 5 W2). | Open, Low; retire when Render is retired (G9 closed) |

## 15. Explicitly not executed by Agent 7

No Terraform plan or apply. No AWS write, and no live AWS read today. No KMS key or key-policy
change. No secret created, read or modified. No image built or published. No deploy. No remote
migration. No Cloudflare, Render or Supabase change. No retirement of anything (G9 stays closed). No PR
opened, no commit pushed, no merge performed by Agent 7: all merges listed were by owner agents
under the standing rule.

## platform#27 review (head `7de8106`, 30 Oct, 18:50 UTC): no objection

- `3a72557`: `OPENAPI_ENABLED=false` on work-api. Closes W3/T13 [V].
- `7de8106`: `school-bootstrap` run-only task. It mirrors `identity-bootstrap`: a boundary-scoped
  execution role that pulls only `munaxa-school/migrate` and reads only `school-migrate` plus
  `munaxa-<env>/school-bootstrap-??????`. Decryption goes through Secrets Manager only, logs go to
  ops, capabilities are dropped, and it runs on the db-admin network. The owner email and password
  arrive as ECS `secrets`, not overrides [V].
- What it runs [V]: `prisma/seed.ts` only upserts the global permission, plan and feature catalogs
  (no users, no demo data). `scripts/seed-platform-owner.ts` falls back to a built-in development
  email and password only when the variables are **unset**. Here the task cannot start without
  the secret, so the fallback cannot apply. The image sets `NODE_ENV=production`.
- Non-blocking [R]: the platform owner is a cross-tenant School super-user, and the script only
  checks the password for 8 characters with upper, lower and digit. Use a long generated
  password. Delete the one-run secret after the run (same caveat as identity-bootstrap: it is
  injected on every start). Root filesystem writable for the tsx cache is acceptable for a one-off task.

## Cross-review of agent1-platform.md (30 Oct, 18:52 UTC)

Agree with the report overall. Every [V] claim I could check matches: `c4a1ad0`, run
41073487240 success, and 14 test runs on main. Points to note:

1. **P9 is understated as an owner decision only. I rate it Medium, and it should be closed before G3.**
   The deployer has `ec2:*`, `elasticloadbalancing:*`, `ecs:*` and `rds:*` in-region. Docs
   Production RDS, ECS, secrets and S3 are denied by ARN, but its VPC, security groups, ALB and
   target groups are not. Kickoff boundary: "do not modify the existing Docs stack". Mitigations exist:
   applies use a reviewed saved plan plus `expected-changes.json`. But one wrong address in the plan
   could touch Docs Production. [R] Deny `ec2`/`elasticloadbalancing` mutations on resources tagged with
   the Docs stack's tags, or name-prefix them, before the first apply.
2. **New R-17 (Medium, before Production):** one deployer role serves every environment. The CI role
   trusts `aws-nonprod`, `aws-nonprod-session` (no required reviewer, by design) and `aws-prod`, and
   all assume the same deployer. A workflow on `main` in the unreviewed session environment can
   therefore obtain credentials that can change Production. That needs only a merged change to a
   workflow file. [R] Separate deployer roles per environment, or condition the deployer trust on the
   source environment, before G8.
3. **P10 and P11 agreed, and both should be checked before G2/G3 rather than discovered there.** P10: the licence key
   policy delegates a fixed action list to the account, without `kms:GetKeyRotationStatus`, so IAM
   cannot grant it to the deployer. If the provider reads it, refresh fails. P11: the
   `repo:munaxa@<id>/<repo>@<id>` subject only exists if the organisation's OIDC subject claim is
   customised. [R] Check the org and repo OIDC customisation in GitHub settings before G2; it is an
   owner action, read-only.
4. **Stale point:** §2 says "no open PRs in munaxa-platform". platform#27 is open now (reviewed above).
5. **Cost:** Agent 1 gives idle ≈ US$13 and ≈ US$0.30/h for 10 services, about 120 session hours within US$50.
   I gave ≈ US$11 idle and about 130 hours. The difference is 2 more bundles plus the RDS master secret and buckets.
   Agent 1's figure is the more complete one. Both agree the account is over US$50 while Docs
   Production stays (X1).
6. Wording: §12 says "G2 bootstrap **re-apply**", but §2 says no bootstrap exists. It is a first apply.

## Appendix: review log (chronological, preserved)

## Owner reports reviewed so far

- **Agent 3 (Identity):** agree with I1 (no `trust proxy`, so the per-IP login limit was one global
  counter); identity#2 merged `9aa4dc1`. With `TRUST_PROXY_HOPS=1`, Express takes the ALB-appended
  rightmost `X-Forwarded-For` entry, so a client cannot spoof its address on the DNS-only hosts.
  Platform still has to set the variable. I2/I3 match my R-06.
- **Agent 4 (Docs):** agree with the verdict (code ready, no Testing home). Challenge: its plan to
  reuse the `munaxa-docs/*` ECR repos and have shared execution roles pull from them is blocked by
  the workload boundary's `NeverMunaxaDocs` deny (R-01). The lead must pick: lift that deny for
  pulls only, or publish Docs images to new repos. Docs DB-per-tenant needs `CREATEDB`, which the
  shared bootstrap does not grant.
- **Agent 6 (School):** S1 = my R-03 (code half). **school#21 reviewed: no blocking issue.** It
  detects ECS task-role credentials and refuses uploads with 503 in production. It works only once
  the platform gives `school-api` a task role, because ECS sets
  `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` only when a task role exists. The S3 gateway endpoint
  change (R-03) is still needed for `HeadObject`/`DeleteObject` from the task.

## platform#26 review (30 Oct, 14:15 UTC): no blocker

Commit `abf6af3`. Verified in the diff:
- R-01: Docs is in `stack/docs.tf`. The boundary now allows only the three ECR pull actions on
  `munaxa-docs/*`, and still denies `munaxa-docs*` secrets and S3 (Docs Production).
- R-03: School bucket with Block Public Access, BucketOwnerEnforced, SSE-S3 and a TLS-only policy.
  The task role covers `tenants/*`, `AWS_S3_BUCKET` is set, and the S3 endpoint admits only these buckets.
- R-04: `prevent_destroy` on the licence key. I1: `TRUST_PROXY_HOPS=1` on Identity. R-09: account budget at 80/100% and forecast.
- R-14: `edms_backup` = `pg_read_all_data` + BYPASSRLS, with CONNECT only on `edms_*`, and a
  fail-closed check in docs-db-admin. Residual risk is low (the check runs only with that task).
Non-blocking notes: (1) the US$50 account budget will alert every month while the old Docs
stack runs (depends on Tamer's B2 decision). (2) The deployer's `s3:PutBucket*` on
`munaxa-<env>-*` includes policy and public-access changes; that is the same trust as the rest of
the deployer. Info only.

## school#23 review (30 Oct, 14:16 UTC): no hold

Removes `ServerSideEncryption` from both presigned PUTs. The presigner had made
`x-amz-server-side-encryption` a signed header that no client sends, so every upload failed.
Encryption at rest is not lost. The bucket default is SSE-S3 (platform#26 `storage.tf`), and S3
encrypts every new object with SSE-S3 by default in any case. The test asserts that the signed
headers are a subset of host, content-type and content-length. `content-length` remains signed,
so the URL still caps the size.
Logged R-15 (outside Testing): the mobile receipt upload through Dio sends no explicit
Content-Length, which fails the signed `content-length`. Browsers set Content-Length from the
body, so the web admin is not affected.

## platform#26 delta 875083a (30 Oct, 14:22 UTC): no objection

Rule 20 now forwards only `/api/v1/products/*`, `/api/v1/licensing/*` and `/health/*` on the
`control-api` host, and the new rule 21 returns 403 for everything else in any case. Checked against Control `main`:
every route outside `/api/v1/admin/*` is `products/:product/tenants/:id/entitlements`,
`products/:product/usage`, `licensing/public-keys` or `health/{live,ready}` (unprefixed by
`setGlobalPrefix` exclude), so no product call is cut off. Admin controllers are all under
`admin` and behind `@ForOperators`. This closes C4 (T15). The allow list is case-sensitive, so a
client must use lowercase paths, which all products do.

## platform#26 delta cfb01ee (R-16, 30 Oct, 14:30 UTC): no objection

The new `identity-bootstrap` run-only task has its own boundary-scoped execution role, which can
pull only `munaxa-identity/api` and read only `identity-migrate` plus
`munaxa-<env>/identity-bootstrap-??????`. Decryption is through Secrets Manager only, and the role
writes only to the ops log group. The password and email reach the container as ECS `secrets`,
not as overrides, so they are not visible in DescribeTasks or CloudTrail RunTask parameters. The
root filesystem is read-only, all capabilities are dropped, and it runs on the db-admin network.
This closes R-16 once merged.
Notes, none blocking:
(1) The task always injects the one-run secret, so the owner must delete it only **after** steps 2
and 3, or those runs fail to start (the comment says so). (2) `valueFrom` uses the ARN without
the random suffix. Secrets Manager resolves that partial ARN because the name does not end in
`-` plus 6 characters. Confirm on the first run, because the stack's other `valueFrom`s use the full ARN.
(3) Deletion goes through a recovery window unless `--force-delete-without-recovery` is used.
A scheduled-for-deletion secret cannot be read, so either is fine.
