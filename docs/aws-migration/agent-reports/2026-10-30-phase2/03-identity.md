# 03 · munaxa-identity: phase 2

Author: the lead orchestrator. Inspection only. No Identity code change was needed in this pass.

## Verified facts [V]

- `main` at `b97b3ab` (#4). No open PRs at 20:05 UTC.
- **Token audience design.** Identity signs one ES256 access token whose `aud` is the list in
  `IDENTITY_AUTH_AUDIENCE` (munaxa-identity `packages/config/src/environment.ts:79`, at least one
  audience required, line 196). The shared stack sets `IDENTITY_AUTH_AUDIENCE = "munaxa-work,munaxa-control"`
  (platform `stack/services.tf:115`). Work checks `PLATFORM_AUTH_AUDIENCE = "munaxa-work"`
  (`services.tf:529`) and Control checks `OPERATOR_AUTH_AUDIENCE = "munaxa-control"` (`services.tf:314`),
  both by overlap. So **a token issued for one product is valid at the other** (I2 / R-06).
- **MFA.** `mfaSatisfied` is hard-coded `false` at login (`apps/api/src/auth/auth.service.ts:159`).
  Control therefore runs with `OPERATOR_REQUIRE_MFA=false`.
- **MFA through Cloudflare Access for Testing.** Control verifies the Access JWT
  (`Cf-Access-Jwt-Assertion`) on the portal and API (control#5). The ALB serves the operator host only
  when `operator_access` is set (platform `cloudflare-access.md`). **Gap found:** the Access setup
  instructions did not require MFA. The login method could be "one-time PIN" (a single factor) and no
  MFA rule was listed. That contradicted TD-3. It is fixed in the instructions on platform#29 (**merged** as `c41f08d` (head `7af38e0` pinned)).
- Identity's `TRUST_PROXY_HOPS=1` (I1), the bootstrap password out of task overrides (R-16), and the
  operator role seed are on main [C, from the baseline, with commits `9aa4dc1`, `594003f`, `b97b3ab`
  present on main V].

## Limitations accepted for Testing, and what must change before Production

| Limitation | Accepted for Testing because | Before Production |
| --- | --- | --- |
| One token is valid for Work and Control (I2) | Test data only; Control's operator surface is also behind Access; Work authorizes by `perms`, which Control operators do not hold by default | Per-product audiences: issue a token per audience, or a token exchange (Identity code), then split `IDENTITY_AUTH_AUDIENCE` in the stack |
| No MFA claim; Control does not require MFA (I3) | Access enforces MFA in front of every operator request, **once the owner creates the policy with the MFA rule** (G6) | Identity implements MFA and sets `mfaSatisfied`; Control sets `OPERATOR_REQUIRE_MFA=true` |
| Access protects only `operator-test.munaxa.com` | Product end users have no operator rights | Production keeps Access on the operator host and adds Identity MFA |

## Changes made / merged

None in munaxa-identity. The Access MFA instruction is in munaxa-platform (#29).

## Tests executed

None (no code change). CI on `main` was last green at `b97b3ab` [C: run 41071629943].

## Outstanding blockers

G2, G4 (signing key generation by the owner), G5 image, and the Identity runbook steps after the
first `identity-migrate` [C].

## Decisions still required

TD-2 and TD-3 for Production (timing of the Identity code work). Nothing blocks Testing.

## Actions explicitly not performed

No key generated, no secret written, no image published, no Cloudflare Access application created.
