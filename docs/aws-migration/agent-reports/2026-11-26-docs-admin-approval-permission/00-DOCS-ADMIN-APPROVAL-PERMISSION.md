# Docs: nobody could approve a document with the built-in roles (26 Nov 2026)

**Status: FIXED in repo, munaxa-docs#190 merged `f100d4f` (all CI checks green). This thread made no AWS change and no Testing data
change; it only read CloudWatch logs (read-only).**

## What the owner saw

On Testing (`docs.test.munaxa.com`, organisation `munaxa-internal`), after the demo starter
configuration was loaded, the owner (`admin.tamer`) was assigned an approval task and got "You do
not have permission to do that" when approving. Adding the Approver role to the user and signing
in again did not help.

## Evidence (CloudWatch `/munaxa/nonprod/docs-api`, read-only)

- 11:22:30 document submitted; 11:23:27 and 11:23:38 `POST /approval-tasks/01a21797-.../decision`
  FORBIDDEN.
- 11:23:57 `PATCH /admin/users/:id` 200 (Approver role added), 11:24:04 sign-in 200.
- 11:24:11 onwards, including 11:43:58 after a fresh sign-in at 11:43:28: still FORBIDDEN. A second
  document (task `01a2179d-...`) was refused the same way.

## Cause (two defects)

1. **Product bug.** `08-permission-model.md` §6 marks `document:approve` and `document:reject` as
   `T` ("only on a task assigned to them") for `APPROVER` and `LIBRARY_MANAGER`. The seed
   (`apps/api/src/modules/identity/domain/role-seed.ts`) gave the keys to no role. The decision
   route is gated on `document:approve` by `RbacGuard`, which reads the permissions in the access
   token, so the `T` cells were unreachable: anybody holding only built-in roles was refused every
   decision, including on a task assigned to them. That is why adding the Approver role did not
   help.
2. **Demo starter.** It seeds the approval group `document-approvers` with the tenant
   administrators, and the Tenant administrator role deliberately has neither key (§6: approval is
   not conferred by seniority).

## Fix (munaxa-docs#190)

- Built-in `APPROVER` and `LIBRARY_MANAGER` roles carry `document:approve` and `document:reject`.
  `WorkflowEngine.decide` still refuses any task not assigned or delegated to the caller, so this
  grants exactly the `T` cells and nothing wider.
- Migration `20261126120000_approver_decision_keys` adds the two keys to existing tenants' built-in
  roles (bounded by key, idempotent, bumps the permission version only for holders of a role that
  gained a key). Tenant administrator and all other roles are unchanged (asserted in tests).
- Demo starter grants the Approver role to the administrators it puts in its approval group
  (additive, idempotent, respects a retired role, dry run writes nothing).
- Docs: `08-permission-model.md` (how `T` is implemented) and
  `docs/operations/demo-starter-configuration.md`.
- Tests: role seed (T cells hold both keys, every other role holds neither), identity admin
  integration test, 5 demo seeder cases. Verified by repository CI.

## Testing today

Owner workaround in the app (no AWS change): Administration, Roles, Approver, add
`document:approve` and `document:reject`, save, sign in again. The code fix reaches Testing with the
next Docs image from main plus its migration run, which is an AWS step needing a separate owner yes.

## Links

- munaxa-docs#190: https://github.com/munaxa/munaxa-docs/pull/190
