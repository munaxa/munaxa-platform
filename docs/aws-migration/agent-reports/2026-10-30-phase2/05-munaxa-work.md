# 05 · munaxa-work: phase 2

Author: the lead orchestrator. Inspection only. No Work code change was needed.

## Verified facts [V]

- `main` at `da84612` (merge of #27). No open PRs at 20:05 UTC.
- **OPENAPI_ENABLED:** Work's config defaults it to `true` (`packages/config/src/environment.ts:88`,
  `booleanFromEnvironment(true)`). `apps/api/src/main.ts:17` serves the document only when it is true.
  platform#27 sets `OPENAPI_ENABLED = "false"` on `module.work_api` (**merged** as `329a8b9` (head `811acf9` pinned)).
- **Authentication:** Work accepts Identity ES256 tokens with `aud` overlapping `munaxa-work`
  (`PLATFORM_AUTH_AUDIENCE`). The token also carries `munaxa-control` (I2, accepted for Testing; see 03).
- **Authorization:** Work authorizes from the token's `perms` claim. Without `perms` it authorizes
  nothing (W6 [C]). Identity resolves `perms` at login and refresh. The first tenant is created by the
  runbook from #26 (W1 [C]).
- **Environment configuration** in the stack (`services.tf` work_api): `LICENSING_MODE=CONTROL_PLANE`,
  `CONTROL_PLANE_URL` = Control's HTTPS host, `PLATFORM_AUTH_AUDIENCE=munaxa-work`, and after #27
  `OPENAPI_ENABLED=false`. Secrets come from the `munaxa-nonprod/work-api` bundle.
- The ECR publish actions are pinned by SHA (#27 in Work, `f33da25`) [V present on main].

## Cross-repository dependencies

| Dependency | Status |
| --- | --- |
| Platform: `OPENAPI_ENABLED=false` (W4) | **merged** as `329a8b9` (head `811acf9` pinned) |
| Identity: `perms` claim, audience | Present (audience shared, accepted for Testing) |
| Control: `work` tenant reference and `mxc_` credential | Needs Control running in a session (G7) |
| Platform: Work migrate and runtime grants (`deploy/aws/runtime-grants.sql`) | On main [C] |

## Changes made / merged

None in munaxa-work.

## Tests executed

None (no code change). Work CI does not run on push to main [C].

## Outstanding blockers

G2, G4, G5. Identity and Control must be running first. W3 (GHCR publish shares `image/**`) waits for TD-10.

## Actions explicitly not performed

No tag, no publish, no migration, no Render change.
