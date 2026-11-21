# 08. Dependency and execution plan

Each step lists its dependencies, what changes, the owner approval (ids from file 10), the tests, the duration [E], the cost [E], the rollback and the completion criteria. Nothing here is authorized by this report.

## Step 1. Identity Stage E (first Identity session)

| | |
| --- | --- |
| Depends on | G-1 to G-7, H-20 (all done); RDS rotation check at about 00:30 UTC 21 Nov |
| Changes | session only: ALB, listener, target group, `identity` service; operator secret (Option A) |
| Approval | A-1 |
| Tests | gate pass; db-admin and migrate exit 0; `/health` 200; sign-in route; probe; `down`; next R succeeds |
| Duration / cost | half a day; under US$2 |
| Rollback | `down`; R and backstop |
| Done when | operator can sign in to Identity in Testing; nothing left running after `down` |

## Step 2. Docs preparation (in parallel with step 1)

| | |
| --- | --- |
| Depends on | nothing in step 1 |
| Changes | 2a merge the script PR and docs#178; 2b Docs bootstrap plan and apply (`munaxa-docs/migrate` ECR repository); 2c Docs image release tag `image/<sha>` at or after `9d06698`; 2d owner runs `docs-testing-secrets.sh bundles`; 2e Resend decision |
| Approval | A-2, A-3, A-4, A-5, A-6 |
| Tests | bootstrap plan shows only the new repository (and its policy); images scanned, no Critical; script prints BUNDLES VERIFIED and the version ids |
| Duration / cost | 1 to 2 days, mostly owner availability; cents |
| Rollback | bootstrap: destroy the empty repository; secrets: new version, or restore AWSPREVIOUS |
| Done when | migrate repository exists; images at the release sha; three bundles have one version each; tenant id known |

## Step 3. Control and Docs configuration (two applies, services off)

| | |
| --- | --- |
| Depends on | Cloudflare Access application (owner); step 1 for the operator subject; step 2 for Docs pins |
| Changes | C-1: Control digests, `operator_access`, desired 0 (creates the KMS licence key). C-2 plus D-1: licence public key and kid, operator org and subjects, Docs digests and `secret_version_ids` (mocked: 42 Docs creates) |
| Approval | A-7 (Access + C-1), A-8 (C-2 + D-1) |
| Tests | plan matches the expected-changes declaration (replaces the stale R-7 declaration); post-apply plan "No changes"; nothing running |
| Duration / cost | 1 day; cents |
| Rollback | revert the PR and apply; keys are kept (KMS deletion is scheduled, not immediate) |
| Done when | both applies verified, services still 0 |

## Step 4. Control session, credential, licensed Docs

| | |
| --- | --- |
| Depends on | step 3 |
| Changes | session: control db-admin, migrate, api, portal, Identity, Docs db-admin, migrate, provision (with `provision-create` before and `provision-delete` after); owner signs in to the portal and mints the Docs credential; `replace-key CONTROL_PLANE_TOKEN`; pin apply; Docs api/web desired 1 PR |
| Approval | A-9, A-10 |
| Tests | file 04 §7, A1 to A12 |
| Duration / cost | 1 to 2 days across two sessions; US$3 to 8 |
| Rollback | `down`; revoke the credential in Control; restore AWSPREVIOUS of docs-api |
| Done when | acceptance checklist complete |

Steps 1 to 4: about 8 owner approvals (some batched) and 3 Testing sessions; at least 3 to 5 working days; about US$5 to 10 on top of the idle baseline.

## Step 5. Work refresh (optional, after step 1)

New Work images from `eabcc47`, bundles, pins, session, tenant re-binding (file 05). Not on the Docs path.

## Step 6. Production infrastructure

Separate account decision (AW-02), AW-06, AW-07, AW-09, AW-10, DC-02 to DC-04, the production Identity cache (node-based Valkey, already in code from platform#110), Cloudflare Access and DNS for production hosts (`docs.munaxa.com`), Resend with a verified domain. About 3 to 6 weeks of engineering plus owner gates [E].

## Step 7. First production launch (Docs first)

Identity, Control and Docs in production, with the acceptance checklist repeated, backups and restore tested, alarms, and a go-live runbook pass. Cost in file 09.
