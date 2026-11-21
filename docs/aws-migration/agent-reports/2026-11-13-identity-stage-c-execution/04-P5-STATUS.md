# 04. P-5 status (PR #121)

PR: https://github.com/munaxa/munaxa-platform/pull/121, **draft, not merged**, head `268eebe`.

## The change

One value in `infra/aws/stack/envs/nonprod.tfvars`, plus its comment (the merge-blocker comment is replaced by the provenance):

```
secret_version_ids = {
  identity         = "80914756-68cd-420d-8094-0fd49afe3492"   # was ad02f18e-f3e7-41da-9959-f9b41e0b7e1a
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"   # unchanged
}
```

Unchanged: both image digests (api `sha256:9a8c6ebd…`, migrate `sha256:5f3bdcce…`), `identity_security_config = { mfa_primary_kid = "mfa-nonprod-2026-11", mfa_policy = "off" }`, the migrate pin, `envs/nonprod.expected-changes.json` with its six declared changes, and `prod.tfvars`.

## Offline checks at `268eebe` (no AWS call, no credentials) [V]

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive` | pass |
| `terraform init -backend=false`, `terraform validate` | valid |
| `terraform test` (stack: docs-secret-lifecycle, identity-cache, stack) | 67 passed, 0 failed |
| `scripts/terraform/check-plan-intent.sh --validate envs/nonprod.expected-changes.json` | valid, root stack-nonprod, 6 changes |
| Mocked render (mock provider, temporary test file not committed), PR head `3ca18ce` vs `268eebe` | see below |

Mocked render result:

- `module.identity[0]`: the six `identity` secret references (`DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD`, `MFA_ENCRYPTION_KEYS`) and the Valkey sidecar's `REDIS_PASSWORD` move from `ad02f18e…` to `80914756…`. No environment change; `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11`, `MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`, `NODE_ENV=production`.
- `db_admin[0]`: `IDENTITY_APP_URL` moves to `80914756…`; everything else unchanged. This is the declared db-admin replacement, so `--enforce` will now accept the real plan if it matches the declaration.
- `module.migrate["identity"]` and `identity_bootstrap[0]`: identical.

**Not a real plan.** The real plan and apply are stage D, an owner-approved dispatch, and `check-plan-intent.sh --enforce` checks it then. The PR branch is behind `main` by documentation-only commits; it was not updated.
