# 02 · munaxa-control (Control Plane): phase 2

Author: the lead orchestrator.

## Verified facts [V]

- `main` at `739be21` (#6). No open PRs at 20:05 UTC.
- KMS asymmetric licence signing is implemented: control#4 (`869fdb8`, `LICENCE_SIGNING_BACKEND=KMS`,
  `KmsLicenceSigner`). The shared stack creates the `ECC_NIST_P256` / `SIGN_VERIFY` key with
  `prevent_destroy` and a key policy that lets only the control-api task role sign
  (`ECDSA_SHA_256`, `DIGEST`), denies every other signer, and denies grants (platform
  `stack/services.tf`).
- **ADR-0008 was not accepted in the repository:** `docs/adr/0008-licence-signing-key-in-aws-kms.md`
  line 3 said "Status Proposed · Approval Pending the owner's decision". The ADR index said
  "Proposed". `docs/operations/secrets.md`, `licence-signing.md` and `deployment.md` said
  "(ADR-0008, proposed)". The owner's decision (KMS asymmetric signing for Control, 30 Oct) is
  recorded in project memory and in the 30 Oct baseline as TD-6.
- The operator surface verifies Cloudflare Access (`apps/api/src/auth/cloudflare-access.ts`,
  control#5). `OPERATOR_ACCESS_TEAM_DOMAIN` and `OPERATOR_ACCESS_AUDIENCE` are required in production.
  `OPERATOR_AUTH_AUDIENCE = munaxa-control` in the stack.
- C8: the baseline found `main` unprotected [C]. This pass has no tool that reads branch protection.
  control#7 merged with no ruleset gate, which is consistent with `main` still being unprotected.

## Changes made

- [control#7](https://github.com/munaxa/munaxa-control/pull/7), branch `claude/project-thread-0f18qv`, head
  `f530170`, **documentation only**: ADR-0008 Status Accepted (approval: the owner, 2026-10-30);
  "Decision (proposed)" becomes "Decision"; the index row; the three operations pages. Prettier
  re-aligned one table in `secrets.md`.

## Merged / not merged

- control#7: **merged** as `a24c568` (head `f530170` pinned, checks green)

## Tests executed

- Prettier `--check docs README.md` locally: clean.
- control#7 CI: success: "Format · Lint · Typecheck · Test · Build" and "Build the images" (run 41121447291) on `f530170`

## Outstanding blockers

- C8: protect `main` (GitHub settings, owner). Recommended required checks: "Format · Lint ·
  Typecheck · Test · Build" and "Build the images".
- At first start in Testing: C9 and C10 [C] (watch control-api for a restart loop). The KMS public key
  is exported after G3 and set as `control_licence_public_key` / `control_licence_kid` by PR.

## Decisions still required

None in Control's code. TD-6 is closed by control#7.

## Actions explicitly not performed

No KMS key created, no public key exported, no image published, no deploy, no GitHub settings change.
