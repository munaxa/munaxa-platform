# 05. Work and School: Testing readiness

Neither product is on the first Testing path (Identity, then Control, then Docs). Nothing was
deployed or published.

## 1. Work (`main` `61c115b`)

| Area | Evidence | Status |
| --- | --- | --- |
| Identity integration | WK-01/WK-02 (work#31, identity#15): tenant resolved through `tenant_platform_binding` (issuer + Identity organisation), forced RLS, read-only runtime role, `bootstrap-tenant` refuses re-binding [VERIFIED reports of 12 Nov; code unchanged since] | READY in code |
| Tenant binding for Testing | needs the Identity organisation and operator from Stage E (now known: `munaxa-group` `071d3060…`, operator sub `ae62eef5…`) and a Work session to run `bootstrap-tenant` | OWNER ACTION (W-4), after a Work release |
| Licensing | `CONTROL_PLANE_TOKEN` in the `work-api` bundle (`infra/aws/stack/data.tf`); needs a Control credential (Control step 10) | BLOCKED on Control |
| Database and migrations | `work_owner`/`work_app` created by db-admin when `work` is in `db_bootstrap_products`; migrate image runs `prisma migrate deploy` | READY in code; never run |
| Secret custody | `work-api` bundle (`DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN`) has **no owner script** yet (Docs and Control have one) | **GAP (W-3)**, RECOMMENDED next |
| Task roles | stack module `work_api`: execution role reads only its bundle version; no S3 (Work has no file storage) | READY |
| Images | api, migrate, admin build, verify and scan in CI; only D-SSL fails (run 44900060343); last published `b490b25` is withdrawn | BLOCKED (D-SSL) |
| Health checks | `HEALTHCHECK` in api and admin images; non-root `work`/`admin` | READY |
| GitHub Actions | pinned, no persisted token, least privilege (work#34 merged `61c115b`); package-token draft work#32 waits on the owner grant | IMPLEMENTED |
| Rollback | services at desired 0; tfvars revert | READY |
| Product gaps | admin read-only; no file storage, notifications or scheduler [from 20 Nov report, not re-verified] | product work |

**Testing blockers, in order:** D-SSL → Work release (owner) → W-3 custody script (Claude) and
bundle fill (owner) → Control credential → config PR with pins (Claude) → plan/apply (owner) →
session with `bootstrap-tenant` (owner approval).

## 2. School (`main` `1e5977e`)

| Area | Evidence | Status |
| --- | --- | --- |
| Authentication | own HS256 JWT (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`), optional Firebase; **not** Munaxa Identity (SC-07) [from 11 Nov audit; not re-verified line by line today] | BLOCKED (product work) |
| Licensing | no Control integration found in the 11 Nov audit | BLOCKED (product work) |
| Deploy workflow | SC-04 (missing migration secret ended green) and SC-05 (rollout printed success with no target) | **FIXED in [school#28](https://github.com/munaxa/munaxa-school/pull/28)**, `deploy-gate.test.mjs` 39/39 |
| `render.yaml` | SC-06: staging blueprint lists production domains | OWNER DECISION (editing it may change a connected Render service) |
| Images | api, migrate, admin build, verify and scan in CI; only D-SSL fails (run 44900062129); none published | BLOCKED (D-SSL) |
| Health checks | `HEALTHCHECK` in api and admin; non-root `nestjs`/`nextjs`/`migrate` | READY |
| GitHub Actions | pinned, no persisted token, least privilege (school#27 merged `1e5977e`); all deploy/seed workflows `workflow_dispatch` only, behind a gate and environments (tested) | IMPLEMENTED |
| Ruleset and push CI | no ruleset, no CI on `main` pushes (O-8) | OWNER ACTION REQUIRED |
| Stack integration | `school-api`/`school-admin` services and `school-files` bucket exist in the stack at desired 0; no secret custody, no pins | NOT STARTED |

**Testing blockers:** SC-07 (Identity) is the gating product decision; then S-3 release, S-4
secrets design, S-5 stack configuration.
