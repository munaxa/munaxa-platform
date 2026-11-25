# Docs demo starter configuration

Date: 25 Nov 2026. Requested by Tamer: a fresh Docs Testing tenant starts blank (no document
libraries, document types or numbering), and he wants basic demo administration settings to start
testing and learning the application.

**Status: built in the repository (munaxa-docs#184). Nothing published, applied, run or read in
AWS.** Applying it to Testing is a separate, owner-approved step (section 5).

## 1. What was built

A one-off command in the Docs API image, `node apps/api/dist/seed-demo.js`
(`pnpm --filter @edms/api seed:demo`), that loads a small generic starter setup into one tenant.

| Area                   | Items created                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Departments            | QA, HR, FIN, OPS, IT under the tenant's root entity                                                   |
| Confidentiality levels | Public 10, Internal 20, Confidential 30 (watermark), Restricted 40 (view only, reason required)      |
| Retention policies     | STD-7Y archive, FIN-10Y review, SHORT-2Y purge with review                                            |
| Categories             | Management System (+ Audits and Inspections), HSE, People, Finance, Technology, General              |
| Metadata fields        | Effective date, Next review due, Counterparty, External reference, Amount, Contract end, Language    |
| Numbering rules        | `POL-QA-0001` per type, `INV-2026-00001` per type and year, `DOC-000001` shared                       |
| Approval               | Group `document-approvers` (starts with current tenant administrators) + published `standard-approval` |
| Document types         | Policy, SOP, Work Instruction, Form, Contract (approval); Invoice, Report, Memo (no approval)          |
| Libraries              | Quality Management, Human Resources, Finance, General, with 11 folders                               |

Files (munaxa-docs): `apps/api/src/demo/starter-catalogue.ts` (data), `starter-seeder.ts`,
`seed-guard.ts`, `apps/api/src/seed-demo.ts` (entry point), 3 spec files,
`docs/operations/demo-starter-configuration.md`.

## 2. Safety design

- **Never automatic.** Nothing calls it at boot, provisioning or migration.
- **Environment guard.** Refuses (exit 2, nothing opened or written) unless
  `DEMO_SEED_ENVIRONMENT` is `development`, `test` or `nonprod` and `DEMO_SEED_CONFIRM_TENANT`
  repeats `DEMO_SEED_TENANT`. Unset or `production` is refused.
- **Same write path as the admin screens.** Each item is parsed by the HTTP API's
  `@edms/contracts` create schema and created through the same application service: validation,
  audit trail (actor SYSTEM, correlation id `seed-demo:<slug>`), outbox events and the
  suspended-tenant refusal all apply. No SQL, no new repository.
- **Additive and re-runnable.** Items matched by code or key; existing ones are untouched and
  reused; items an administrator retired are never restored (dependents skipped and reported);
  folders only added to libraries the same run created; `DEMO_SEED_DRY_RUN=true` writes nothing.
- **Readiness gates.** Refuses when the tenant is not in the catalogue, its database is not
  migrated for the build (same check as provisioning), or it has no administrator.
- No schema, migration, infrastructure or secret change. Merging deploys nothing.
- Not included: sample documents (would need storage and the virus scanner in the run).

## 3. Evidence

- Unit tests: 25 new (catalogue accepted by every create schema, `checkRule` and `checkVersion`;
  no duplicate codes or ranks; references resolve; guard cases including production refusal;
  seeder creates all, second run creates nothing, dry run writes nothing, existing items reused,
  retired items respected). Full API unit suite 85 files, 1064/1064 pass. Typecheck, eslint,
  prettier clean.
- Real end-to-end run, local PostgreSQL 16, all 32 migrations, tenant provisioned with the real
  `provision.js`, seed run in catalogue mode (as Testing runs):
  - no variables: exit 2; `DEMO_SEED_ENVIRONMENT=production`: exit 2
  - dry run: `created 54, already present 0, skipped 0`, nothing written
  - run 1: `created 54, already present 0, skipped 0`
  - run 2: `created 0, already present 43, skipped 0`
  - database: 8 document types, 4 libraries, 15 folders (4 roots + 11), 1 published workflow
    version, 1 group member, 55 audit rows all channel `SYSTEM`
- CI on munaxa-docs#184: see the PR checks.

Local toolchain note: GitHub Packages returns 401 in sessions, so `@munaxa/*` were packed from
munaxa-platform main and overridden only in the local install; package.json and the lockfile were
restored and are not in the PR.

## 4. Findings during the work

- F-1 (info): the API configuration refuses `TENANT_SLUG` beside a tenant catalogue, so the command
  names its tenant with `DEMO_SEED_TENANT` (falls back to `TENANT_SLUG` on single-tenant installs).
- F-2 (info): a workflow `ROLE` participant cannot name the seeded system roles through the API
  (role keys are upper case, `configurationKeySchema` is lower case only). The starter workflow
  therefore routes to an approval group. Not changed here.
- F-3 (info): the `docs-provision` task cannot be reused for this (its run-only secret is deleted
  after provisioning), so the hosted run uses the `docs-api` task definition with overrides.

## 5. Applying to Testing (owner decision, not done)

1. Publish Docs images from the merge commit (the D-SSL exception expires 2026-12-01T00:00:00Z, so
   before then, or after OpenSSL 3.5.10).
2. Pin the new Docs API digest in `nonprod.tfvars` (platform PR, owner apply run).
3. During an armed Testing session, Claude runs one ECS task from the `docs-api` task definition,
   container `docs-api`, command `["node","apps/api/dist/seed-demo.js"]`, environment
   `DEMO_SEED_TENANT=munaxa-internal`, `DEMO_SEED_CONFIRM_TENANT=munaxa-internal`,
   `DEMO_SEED_ENVIRONMENT=nonprod`, `QUEUE_CONSUMERS_ENABLED=false`; dry run first, then the real run;
   then verify in the app.

Each step needs Tamer's yes; nothing above is authorised by this report.
