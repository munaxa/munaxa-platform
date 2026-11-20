# 06. Control: revalidation, C-1 and C-2 packages

**Status:**
- Code: CODE COMPLETE — NOT DEPLOYED.
- C-1 and C-2: READY FOR OWNER APPROVAL once their prerequisites are met.
- Not applied. No KMS key created, no Cloudflare Access change, no credential minted.

## 1. Revalidation

| Topic | Evidence | Result |
| --- | --- | --- |
| Images | `a24c568` api `d6bf8c3c…`, migrate `203079c9…`, portal `5a76933c…` [V ECR] | present, but **7 HIGH CVEs each**: apt, util-linux x3, zlib x2, glibc [V scan]. Fix in [control#10](https://github.com/munaxa/munaxa-control/pull/10), then a new release (A-5C) |
| KMS signing | `apps/api/src/licensing/licence-signer.ts`: `SigningAlgorithm: 'ECDSA_SHA_256'`, a P-256 key that never leaves KMS (ADR-0008) [V code] | as designed; C-1 creates the key, its alias and key policy (offline plan) |
| ES256 snapshot verification in Docs | docs `apps/api/src/core/config/configuration.ts` `LICENSE_ALGORITHM` default ES256; P-256 tests in `core/licensing/licensing.spec.ts` [V code] | as designed |
| Operator authentication | `authentication.guard.ts`: Identity ES256 access token, Cloudflare Access JWT (team domain and AUD), organisation id and subject allow-list [V code] | needs Stage E (operator ids) and A-7 (Access) |
| Credential minting and revocation | e2e `control-plane.e2e.spec.ts`: "a credential is issued once; its retry is refused and its secret is never kept"; the guard refuses `revokedAt !== null` [V code, CI 83/83 on control#10] | as designed |
| Docs integration, fail-closed | Docs refuses licensed routes with 402 without a valid snapshot (file 07) | as designed |
| Terraform guard | a session with control-api above 0 is refused without licence key, kid, operator org, subjects and Identity keys | **confirmed offline** (run `control_session_without_licence_is_refused`) [T] |

## 2. C-1 package: images, Access, services off

**Prerequisites:**
- A-7: the Cloudflare Access application for `operator-test.munaxa.com` exists. Its team domain and AUD tag are known; they are not secrets.
- A-5C: new Control images released (recommended, so C-1 pins clean digests).

**Config change** (one PR to `infra/aws/stack/envs/nonprod.tfvars`):

```hcl
images = {
  identity_api     = "…/munaxa-identity/api@sha256:9a8c6ebd…"      # unchanged
  identity_migrate = "…/munaxa-identity/migrate@sha256:5f3bdcce…"  # unchanged
  control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:<new>"
  control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:<new>"
  control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:<new>"
}
operator_access = {
  team_domain = "https://<team>.cloudflareaccess.com"
  audience    = "<AUD tag>"
}
# desired_counts: control-api = 0, control-portal = 0 (already 0 on main)
```

Plus `envs/nonprod.expected-changes.json` declaring the 33 creates.

**Expected plan** (offline mocked, [supporting/control-c1-c2-plan-addresses.txt](supporting/control-c1-c2-plan-addresses.txt)): **33 to add, 0 to change, 0 to destroy.**

- KMS licence key, alias and key policy (3).
- ALB-to-service egress rules for control-api and control-portal (2).
- control-api (12): log group, task definition, execution role, task role, two role policies, security group, and 5 security-group rules.
- control-migrate (8): log group, task definition, execution role, execution policy, security group, and 3 rules.
- control-portal (8): log group, task definition, execution role, execution policy, security group, and 3 rules.
- No service, no ALB, no listener (services off).

**Cost:**
- KMS asymmetric key: US$1 a month [E].
- Log groups and roles: free at rest.

**After apply:** read the public key with `aws kms get-public-key` (public; output `control_licence_key_arn`).

## 3. C-2 package: licence key, operator ids, Control database bootstrap

**Prerequisites:**
- C-1 applied.
- Stage E done: the operator organisation id and subject come from Identity.
- A-4C: the Control bundles are filled (version ids from the script).
- Stage E already run, or the Stage E manifest updated in the same PR (file 05 §1).

**Config change:**

```hcl
control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"   # public half from C-1
control_licence_kid              = "control-licence-nonprod-2026-11"
control_operator_organisation_id = "<Identity organisation id>"
control_operator_subjects        = ["<operator subject id>"]
db_bootstrap_products            = ["identity", "control"]
secret_version_ids = {
  identity         = "80914756-68cd-420d-8094-0fd49afe3492"
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
  control-api      = "<version id printed by control-testing-secrets.sh>"
  control-migrate  = "<version id printed by control-testing-secrets.sh>"
}
```

**Expected plan** (offline mocked): **0 to add, 3 to change, 0 to destroy.**

| Resource | Change |
| --- | --- |
| `aws_ecs_task_definition.db_admin[0]` | adds `CONTROL_APP_URL` (control-api `DATABASE_URL`) and `CONTROL_OWNER_URL` (control-migrate `DATABASE_MIGRATION_URL`), each pinned to its version id |
| `module.control_api[0].aws_ecs_task_definition.this` | `LICENCE_SIGNING_KID`, `LICENCE_SIGNING_PUBLIC_KEY`, `OPERATOR_ORGANISATION_ID`, `OPERATOR_SUBJECT_ALLOWLIST`; `DATABASE_URL` pinned |
| `module.control_migrate[0].aws_ecs_task_definition.this` | `DATABASE_MIGRATION_URL` pinned |

The mocked provider renders task-definition changes as in-place updates. The live plan shows each as a replacement (`delete`, `create`; a new revision), as the L-A0 change did (`expected-changes.json` on main records `identity_bootstrap` as `["delete","create"]`). The declaration must use the live actions.

**D-1 together with C-2:** the Docs pins (19 Nov report file 04 §6: 42 creates with services off) can share this apply, so the two products use one plan and apply cycle. The declaration then lists both.

## 4. Control secret custody (new, closes a gap)

The two Control bundles had no versions and no documented way to fill them [V]. Without them db-admin cannot create `control_owner` and `control_app`, and control-api cannot start.

`scripts/aws/owner/control-testing-secrets.sh` (in [platform#143](https://github.com/munaxa/munaxa-platform/pull/143)) follows the Docs script:
- It generates two independent 64-hex passwords inside CloudShell.
- It writes control-migrate first, then control-api.
- It is resumable: it never splits a password and refuses `PASSWORD_REUSED`.
- Values go only through stdin. The script prints only version ids.
- `status` reads no value.
- There is a lock (one run at a time).

Tests: 8 offline cases (fill, rerun, not confirmed, partial resume, wrong order, wrong account, status, refused modes) [T].

## 5. Control session (C-3, plan only)

From the C-2 state, a session with control-api and portal at 1 (and identity 1) plans **19 creates**: ALB, two listeners, three refusal rules, three services, target groups, listener rules, service discovery and the certificate validation [T]. This is the `up` set; `down` removes it.

## 6. Open Control findings (unchanged)

- CT-01: the credential is shown once.
- CT-02: the subject allow-list changes need an apply.

Neither blocks Testing.
