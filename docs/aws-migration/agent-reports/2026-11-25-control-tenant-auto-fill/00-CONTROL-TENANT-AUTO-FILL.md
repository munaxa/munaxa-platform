# Control: tenant identifier filled in automatically when linking (25 Nov 2026)

**Outcome:** built and merged in the repositories. munaxa-control#18 merged as `659c8b8` (Control
API, database, portal) and munaxa-docs#187 merged as `cec7bcc` (Docs sends the organisation slug),
both under the standing merge rule with all checks green. Nothing deployed, migrated, published or
changed in AWS yet. Tamer said yes (19:45 UTC) to rolling it out on Testing. The rollout is combined
with the Docs demo starter and Identity login redesign rollouts in one pin PR (platform#191), one
owner apply and one session, run by the Docs demo starter thread.

## Problem

In the Control operator portal, **Link tenant** on a customer required the operator to paste the
product's tenant identifier by hand (for Docs nonprod `d75d9645-d2da-48c3-af91-ab6f36e789a8`,
organisation `munaxa-internal`). Tamer asked for it to be filled in automatically.

## Options considered

| Option | Verdict |
| --- | --- |
| A. Control records an unlinked tenant when a deployment asks about it with its valid credential; the operator picks it from a list | **Chosen.** Uses a call every SaaS product already makes; works for Docs, Work and School with no product change; the identifier never passes through a person |
| B. Products register each new organisation with Control through a new write endpoint | Needs a new call in every product and a retry path; Docs tenants come from a config catalogue, so there is no single "organisation created" moment to hook. A sends the same fact for free |
| C. Operator types the slug and Control asks the product for the id | Control would have to call products, which ARCHITECTURE.md forbids (products call Control, never the reverse) |

## What was built

### munaxa-control#18

- New table `tenant_sighting` (migration `20261125200000_tenant_sighting`, additive): product,
  deployment, tenant identifier, optional label, first and last seen. Unique per deployment and
  identifier.
- `GET /products/{product}/tenants/{tenantId}/entitlements`: when the tenant is linked to **no**
  customer, the question is recorded as a sighting. The answer is still the same `404`; recording is
  not awaited, so it neither changes nor delays the answer. An optional request header
  `Munaxa-Tenant-Label` carries the product's name for the tenant.
- `GET /admin/tenant-sightings` (permission `customers:read`): unlinked sightings, newest first.
- `POST /admin/customers/{id}/tenants` also accepts `{ sightingId, displayName? }`. Product,
  identifier and deployment are taken from the sighting, never from the form. Display name defaults
  to the reported label. The audit event records `source: SIGHTING` and the sighting id.
- Portal, customer page: **Link a product tenant** now shows a drop-down of reported tenants
  (product, label, identifier, deployment, last seen) and an optional display name. A second card,
  **Link a tenant by its identifier**, keeps manual entry for on-premises tenants and tenants not
  reported yet.
- `docs/api.md` and `docs/integration.md` updated.

### munaxa-docs#187

`ControlPlaneLookup` sends `Munaxa-Tenant-Label: <organisation slug>` (from the in-memory tenant
registry) with each entitlement question. A registry failure sends no label and the question is still
asked. Only `LICENSING_MODE=CONTROL_PLANE` is affected.

## Security review

| Concern | Control |
| --- | --- |
| Can a sighting grant access? | No. Linking is still an operator action needing `customers:write`, audited. Once linked, entitlements are served only to the deployment whose credential reported it (unchanged three-equality boundary) |
| Can a credential learn about other deployments' tenants? | No. A tenant linked anywhere is not recorded and the answer is the same `404`; recording runs after the answer is decided and is not awaited, so timing does not reveal it |
| Flooding by a leaked credential | At most 200 unlinked sightings per deployment; a row is rewritten at most every 5 minutes; all service routes stay rate limited (ADR-0007) |
| Untrusted label | Control characters removed, whitespace collapsed, max 100 characters (DB check too), rendered as React text only, decides nothing |
| Wrong tenant picked | The list shows label, identifier, deployment and last seen; the link is audited and the operator chooses the customer |
| Database privileges | Runtime role `control_app`: SELECT, INSERT, UPDATE on `tenant_sighting`; DELETE and TRUNCATE revoked, like every business table |
| Data sent by Docs | Only the organisation slug, which is already in every sign-in URL |

## Evidence

- Control, local PostgreSQL 16 using the CI procedure (`infra/sql/roles.sql`, `pnpm db:migrate`
  with grants): format, lint, typecheck, `pnpm test` (API 89/89 including 4 new end-to-end tests:
  record with label and still 404, link by sighting then served 200, refusal of mixed bodies and
  missing permission, the 200 cap), build, permission catalogue unchanged.
- Docs: API typecheck, eslint and prettier on changed files, full API vitest 1065/1065.
- CI: control#18 green (Format · Lint · Typecheck · Test · Build, Build the images); docs#187 all
  24 checks green.

## Deploying it (approved by Tamer; combined rollout, not done yet)

1. **[O]** Tags `image/659c8b85f5232ea6044456ca477cf9be7c9e5af9` (munaxa-control) and
   `image/cec7bcc1b14427a5fcf811da0a12b301fb8c1177` (munaxa-docs), each with an `image-release`
   approval. This session cannot push tags (the proxy answers 403).
2. Pin in platform#191: `control_api`, `control_migrate`, `control_portal` (expected 3 task-definition
   replacements for Control, services off) and the Docs images; D-SSL list only if the scans need it.
3. Session: after `up`, run `munaxa-nonprod-control-migrate` (no overrides). Success is exit 0 with
   `20261125200000_tenant_sighting` applied and `grants applied`. This is also the first AWS run of
   control#16. Then Docs entitlements for `d75d9645…` must still return 200.
3. After that, any new Docs organisation appears in Control's **Link a product tenant** list as soon
   as someone uses it. `munaxa-internal` is already linked in Testing, so it will not appear.

Until both are deployed, nothing changes in Testing.
