# Independent security review: Terraform `school_identity_sign_in` wiring (munaxa-platform#203)

Date: 26 Nov 2026. Review only. PR https://github.com/munaxa/munaxa-platform/pull/203, head `95b4db7801cdcf158ee8bf891775b378e7d5423e`. Posted as a GitHub review (COMMENT). Nothing planned or applied.

## Verdict

**No Critical, High, Medium or Low findings.** 3 informational. Default `[]` leaves the School environment and school-api bundle contract unchanged.

## Checked and correct

- `IDENTITY_SIGN_IN_CLIENT_SECRETS` is a school-api bundle key via ECS `secrets`, added only when configured; `IDENTITY_PUBLIC_KEYS` is public (School refuses a private key at boot).
- Issuer and redirect URI come from `local.https.*`, not tfvars; the client string matches School's parser.
- The plan-time pairing check requires each School entry to match an `identity_oidc_clients` entry with the same client id, organisation and exact School callback; the public keys are required when enabled.
- Tests cover defaults, the conditional key and each validation failure.

## Informational

| Id | Finding | Recommendation |
|---|---|---|
| I-1 | No plan-time shape checks on `client_id`/`organisation` or duplicate client ids (School refuses them at boot). | Mirror School's regexes. |
| I-2 | School's `IDENTITY_ISSUER` must exactly equal Identity's `MUNAXA_TOKEN_ISSUER`. | Shared local or equality check. |
| I-3 | One client secret now lives in two bundles. | Rotation runbook line: update both together. |
