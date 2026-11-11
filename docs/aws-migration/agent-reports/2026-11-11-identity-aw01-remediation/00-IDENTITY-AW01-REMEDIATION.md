# Identity AW-01 remediation: hardened Identity task configuration (11 Nov 2026)

**Status: AW-01 FIXED IN REPOSITORY CODE.** Implementation PR
[munaxa-platform#102](https://github.com/munaxa/munaxa-platform/pull/102), squash-merged as
`964cbaa` (head `9a0dd6a`). Nothing was deployed. No AWS API was called, no secret was
created, read, generated or changed, no image was built, no workflow was dispatched and no migration ran.

- Requested by: Tamer, 11 Nov 2026 18:25 UTC (repository work and the reviewed merge only).
- Baselines: munaxa-platform main `3aacc4c` (#101), munaxa-identity main `cb11a66` (#14).
- Independent review: a separate reviewer agent, APPROVE on `1951a8e` and again on the final head
  `9a0dd6a`. No Critical, High or Medium finding.

---

## 1. The original finding and how it was verified

AW-01 (High), report
`2026-11-11-cross-repository-deployment-readiness/00-CROSS-REPOSITORY-DEPLOYMENT-READINESS.md`:
the Identity task definition lacks `MFA_ENCRYPTION_KEYS` (secret), `MFA_ENCRYPTION_PRIMARY_KID`
and `IDENTITY_PASSWORD_RESET=disabled`, so any Identity image built from current main refuses to
start with `NODE_ENV=production`.

Verified again from source, not from the report (munaxa-identity `cb11a66`):

| Setting | Source | Rule in the code |
| --- | --- | --- |
| `MFA_ENCRYPTION_KEYS` | `packages/config/src/environment.ts` (schema, `secret: true`), `mfa-keys.ts` (`parseMfaKeys`) | **Not JSON.** A comma-separated list of `kid=key`; `kid` matches `^[A-Za-z0-9_-]{1,64}$`, no duplicates; `key` is exactly 32 bytes of base64url or base64 and not one repeated byte. Required when `NODE_ENV=production` ("supply it through MFA_ENCRYPTION_KEYS_FILE"; ECS's environment injection of the same name is also read). Refused if an entry equals `IDENTITY_SIGNING_SECRET` (the refresh-token pepper) or is taken from the signing private key. |
| `MFA_ENCRYPTION_PRIMARY_KID` | `environment.ts`, `mfaKeyIssues` | Not secret. Required when the ring is set; must name an entry of the ring. Also checked again at runtime (`apps/api/src/mfa/mfa-keys.ts`). |
| `MFA_POLICY` | `environment.ts` | `off` (default), `privileged`, `all`. Not `off` without a ring is refused. |
| `MFA_PRIVILEGED_ROLES` | `environment.ts`, `@munaxa/config` `list()` | Comma-separated role keys, trimmed, empties dropped. Required (non-empty) with `privileged`. |
| `IDENTITY_PASSWORD_RESET` | `packages/config/src/password-recovery.ts` | `enabled` (default) or `disabled`. `PRODUCTION_EMAIL_TRANSPORTS` is empty, so `enabled` is refused in production. |
| runtime | `apps/api/src/platform/security.ts` `assertMfaDistributed` | Production refuses to start without MFA or without the shared Redis replay guard. |

Reproduction (offline, section 6, case L1): the task environment exactly as the stack renders it
today for release `5277d71`, fed to Identity main's own configuration loader, is refused on
`MFA_ENCRYPTION_KEYS` and `IDENTITY_PASSWORD_RESET`.

## 2. Design: switched on with the image, never before

Release `5277d71` (pinned in `envs/nonprod.tfvars`, Config A1 applied) reads none of these
settings, and the bundle version it is pinned to (`secret_version_ids.identity`) holds no
`MFA_ENCRYPTION_KEYS`. ECS refuses to start a task whose secret names a JSON key the pinned
version lacks. Adding the reference unconditionally would therefore stop the current release from
starting and would change the Stage C and D plans. So the hardened contract sits behind one new
variable, `identity_security_config`, which defaults to `null`:

- **null**: the Identity task definition is byte-identical to main (section 6).
- **set**: the bundle contract gains `MFA_ENCRYPTION_KEYS`, and the environment gains the plain
  settings.

It is set in the same reviewed PR that pins a hardened image (section 11).

## 3. Exact files changed (PR #102)

| File | Change |
| --- | --- |
| `infra/aws/stack/variables.tf` | New `identity_security_config` object (`mfa_primary_kid`, `mfa_policy`, `mfa_privileged_roles`), default `null`, 5 validations |
| `infra/aws/stack/data.tf` | `local.identity_secret_keys`: the five existing keys, plus `MFA_ENCRYPTION_KEYS` only when the config is set; bundle table comment |
| `infra/aws/stack/services.tf` | `local.identity_security_environment` merged into the Identity environment |
| `infra/aws/modules/service/outputs.tf` | `task_definition_container_definitions` output, for plan tests (names and secret ARNs only; not a root output) |
| `infra/aws/stack/tests/stack.tftest.hcl` | 9 new mocked runs (section 5) |
| `infra/aws/stack/envs/nonprod.tfvars` | A commented block only (no effective change) |
| `infra/aws/README.md`, `infra/aws/CONTRACT.md` | Bundle contract and the ordering for a hardened image |

Not changed: IAM, KMS, networking, security groups, ECR, the image digests, the migrate,
bootstrap, probe and db-admin tasks, the other services, `envs/*.expected-changes.json`, workflows,
Stages B, C and D.

## 4. Final contracts

### Secret bundle `munaxa-<env>/identity` (names only)

| Key | When |
| --- | --- |
| `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` | always (unchanged) |
| `MFA_ENCRYPTION_KEYS` | only with `identity_security_config` |

Each is injected through the existing ECS `secrets` mechanism under its own name:
`<bundle ARN>:<KEY>::<secret_version_ids.identity>`. There is no alias, so `MFA_ENCRYPTION_KEYS`
cannot resolve to the signing key or the pepper. Only the Identity execution role reads the bundle;
Identity still has no task role. Other bundles are unchanged (asserted).

### Task environment (names and safe non-secret values)

| Name | Value |
| --- | --- |
| `NODE_ENV`, `PORT`, `IDENTITY_BASE_URL`, `IDENTITY_AUTH_AUDIENCE`, `IDENTITY_SIGNING_ALGORITHM`, `IDENTITY_SIGNING_KID`, `IDENTITY_DEFAULT_ORGANISATION`, `CSRF_TRUSTED_ORIGINS`, `LOG_PRETTY`, `TRUST_PROXY_HOPS` | unchanged |
| `MFA_ENCRYPTION_PRIMARY_KID` | `identity_security_config.mfa_primary_kid` (a key name such as `nonprod-2026-11`, never the key) |
| `MFA_POLICY` | `identity_security_config.mfa_policy`, no default: it must be written explicitly |
| `MFA_PRIVILEGED_ROLES` | `join(",", mfa_privileged_roles)`, present only with `privileged` |
| `IDENTITY_PASSWORD_RESET` | `disabled`, fixed (not a variable) |

Terraform validations: the kid follows Identity's rule; a 43-character kid (the length of an
encoded 32-byte key) is refused, because it is most likely the key pasted into a public file;
policy is one of the three values; `privileged` needs roles and the other policies take none; no
role key contains a comma or whitespace (it would be split or trimmed into another key).

## 5. MFA policy decision

**Non-production: `MFA_POLICY=off`**, written explicitly (commented example in `nonprod.tfvars`).
With `off`, MFA is available (anyone may enrol, and an enrolled account is always challenged) but
no account is forced to enrol. That matches Identity's own rollout order
(`docs/production-readiness.md` section 6: deploy with `off`, enrol the privileged accounts, then
switch to `privileged`). `privileged` was not chosen because the privileged accounts' enrolment and
recovery procedure is not established yet. No role names were invented: `MFA_PRIVILEGED_ROLES` is
not set with `off`, and the tests use placeholders (`role-a`, `role-b`).

## 6. Tests and results

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive infra/aws` | pass |
| `terraform validate` (bootstrap, stack) | pass |
| `terraform test` bootstrap | 12/12 |
| `terraform test` stack (mocked AWS provider) | **37/37** (28 before; 9 new) |
| Probe node tests | 72/72 |
| Intent declarations valid (`--validate`) | nonprod 22, prod 0 (unchanged) |
| Mutations of the new code (7) | each caught (`supporting/mutations.txt`) |
| Offline Identity config harness | **11/11** (`supporting/harness-output.txt`) |
| PR CI on `9a0dd6a` | see section 8 |

New mocked runs, mapped to the requested tests:

| # | Requirement | Run / assertion |
| --- | --- | --- |
| 1 | bundle contains the MFA key | `aw01_hardened_...`: `local.secret_keys["identity"]` is the 5 keys plus `MFA_ENCRYPTION_KEYS` |
| 2 | task references the correct secret | `valueFrom` = identity bundle ARN `:MFA_ENCRYPTION_KEYS::<pin>`; every secret uses its own name |
| 3 | primary kid is a plain variable | env `MFA_ENCRYPTION_PRIMARY_KID` |
| 4 | reset disabled | env `IDENTITY_PASSWORD_RESET=disabled` |
| 5 | policy explicit and valid | env `MFA_POLICY=off`; refusal runs for an unknown policy, privileged without roles, roles without privileged, role key with a comma; `aw01_privileged_policy_passes_its_role_keys` |
| 6 | no secret value in repo files | no name is both plain and secret; no plain value is key- or PEM-shaped; key-shaped kid refused; manual diff scan |
| 7 | other bundles unchanged | exact key lists of every other bundle; 8 bundles |
| 8 | nonprod and prod valid | nonprod and prod-environment runs |
| 9 | IAM boundaries and role split | Identity has no task role; migrate and bootstrap tasks do not reference `MFA_` |
| 10 | digest-pinned | image equals `images.identity_api`, `@sha256:<64 hex>` |
| — | 5277d71 contract unchanged | `aw01_without_security_config_...`: exact environment names and values, five pinned secrets, image, single Valkey sidecar, no `MFA_` or `IDENTITY_PASSWORD_RESET` |

**No plan change for non-production.** A mocked-provider test rendered the Identity container
definitions with the real `envs/nonprod.tfvars`, on main and on this branch: the two files are
byte-identical (3438 bytes, sha256
`824e9b2dee10d4645e72667cc9296325b549c390cebd64f482ba67ab82f53480`). The reviewer independently
repeated this for the API, migrate and bootstrap task definitions, `local.secret_keys` and the
bundle count, on both reviewed heads. With `identity_security_config` set on the same tfvars, the
only differences are the 3 environment entries and 1 secret reference above; the image, the other
secrets and every other container field are identical.

**Offline harness** (`supporting/harness.mjs`). The rendered environments, fed to munaxa-identity
`cb11a66` `@identity/config` `loadEnvironment` (bundled locally with esbuild from Identity and
platform sources), with throwaway secrets generated in memory for the process only:

| Case | Expected | Result |
| --- | --- | --- |
| H1 hardened task definition + full bundle | starts | starts |
| H2 `MFA_ENCRYPTION_KEYS` missing | refused | refused (`MFA_ENCRYPTION_KEYS`, `MFA_ENCRYPTION_PRIMARY_KID`) |
| H3 primary kid not in the ring | refused | refused |
| H4 ring not `kid=key` | refused | refused |
| H5 key not 32 bytes | refused | refused |
| H6 MFA key equals `IDENTITY_SIGNING_SECRET` | refused | refused |
| H7 `IDENTITY_PASSWORD_RESET` unset (default enabled) | refused | refused |
| H8 `IDENTITY_PASSWORD_RESET=enabled` | refused | refused |
| H9 `privileged` without roles | refused | refused |
| H10 `privileged` with role keys | starts | starts |
| L1 the 5277d71 task definition with the hardened image (AW-01) | refused | refused |

On ECS, H2 does not even reach the application: the task stops at start because the JSON key is
missing. Both paths fail closed. No application validation was changed.

## 7. Security review

Independent reviewer agent, given the code and not this thread's conclusions, adversarial brief
(secret references and JSON key mapping, plan changes, environment correctness against the
Identity schema, MFA policy safety, digest preservation, secret leakage, other products,
compatibility with Identity main).

| Round | Head | Verdict | Findings |
| --- | --- | --- | --- |
| 1 | `1951a8e` | APPROVE | 0 Critical/High/Medium; 3 Low, 5 Info |
| 2 | `9a0dd6a` | APPROVE | Low 1 to 3 fixed; 1 Info (line length) |

| Finding | Severity | Resolution |
| --- | --- | --- |
| The 5277d71 test checked environment names only | Low | Fixed in `9a0dd6a`: exact values, image and sidecar asserted; reviewer confirmed a changed `TRUST_PROXY_HOPS` now fails |
| README did not say the new bundle version must keep every existing key | Low | Fixed: the version is the existing JSON plus one key; a fresh `put-secret-value` replaces it all; a new `IDENTITY_SIGNING_SECRET` invalidates every refresh token |
| Moving the pin also changes `db_admin` and needs an expected-changes declaration | Low | Fixed in README |
| Nothing ties the config to the image | Info | Accepted: Terraform cannot tell images apart by digest; every wrong order fails closed; rollback to 5277d71 still works |
| db-admin's execution role can read the whole identity bundle | Info | Pre-existing (it already reads the signing key); recorded as wider blast radius |
| Refusal runs do not name which validation fired | Info | Accepted; each input checked by hand |
| Kid check stricter than Identity | Info | Kept on purpose |
| New module output exposes plain environments | Info | Not a root output; no secret values |

No operator email appears in the PR or in this report (checked by search before each push).

## 8. PR and merge

- PR: https://github.com/munaxa/munaxa-platform/pull/102
- Final head: `9a0dd6a` (reviewed: APPROVE)
- CI on `9a0dd6a`: all green: Format, validate, mocked plan tests; Lint · Typecheck · Test · Build; Accessibility; Façades (plan and apply jobs skipped, as on every pull request)
- Squash merge: `964cbaa`

## 9. Image digest

Not changed. `envs/nonprod.tfvars` still pins `munaxa-identity/api@sha256:71d01fdf…8156` (release
`5277d71`) and `munaxa-identity/migrate@sha256:d175ef37…0820`. No image was built or published.

## 10. Operations not performed

No AWS API call (AWS MCP tools unused). No Terraform plan against a real backend and no apply. No
secret created, retrieved, generated, rotated or deleted (the harness keys were throwaway in-memory
test values in one local process, never stored or printed). No IAM, KMS, network or security group
change. No workflow dispatch. No image build. No deployment, ECS task or migration. No DNS or
Cloudflare change. No production or staging data touched. Terraform ran locally with a mocked AWS
provider only (provider from a local filesystem mirror).

## 11. Remaining owner actions before using the hardened Identity image

Each needs the owner's separate approval. None is authorized by this task.

1. **Create the MFA key ring in the bundle.** Add `MFA_ENCRYPTION_KEYS` to `munaxa-nonprod/identity`
   as `<kid>=<32 random bytes, base64url>`, generated where it is stored (munaxa-identity
   `docs/runbooks/mfa.md`), never the signing key or `IDENTITY_SIGNING_SECRET`. The new version must
   keep the five existing keys unchanged.
2. **Build and publish** the Identity `api` and `migrate` images from one munaxa-identity main commit
   at or after `cb11a66`, by digest.
3. **One reviewed platform PR** that pins both digests, moves `secret_version_ids.identity` to the
   new version, sets `identity_security_config = { mfa_primary_kid = "<kid>", mfa_policy = "off" }`,
   and declares the changed task definitions (Identity, identity-migrate, db_admin) in
   `envs/nonprod.expected-changes.json`; then the owner-approved plan and apply.
4. **Run migration `20261111130000_identity_mfa`** (the `identity-migrate` task with the new migrate
   image) before the new API image starts. Readiness answers `503 schema` until both MFA tables exist.
5. Only after that, start Identity. Keep `IDENTITY_PASSWORD_RESET=disabled` (fixed in code) until a
   production email transport exists in Identity.
6. Later: enrol the privileged accounts, establish their recovery procedure, then switch to
   `privileged` with the real role keys.

Follow-up (documentation only, not done here): munaxa-identity `docs/runbooks/aws.md` still says the
stack "does not set any of them yet"; it can now point at `identity_security_config`.

## 12. Final status

- **AW-01:** fixed in repository code (platform#102, `964cbaa`).
- **Identity current main is now infrastructure-compatible**: the stack can render exactly the
  configuration it needs (verified against its own loader), once `identity_security_config` is set.
- **Nothing changes for the current non-production deployment:** release `5277d71` and the Stage
  B, C and D plans are unchanged.
- **Still required before a non-production deployment of the hardened image:** section 11, steps 1
  to 5, each separately approved by the owner, plus the existing Stages B, C and D.

## Supporting files

- `supporting/harness.mjs`, `supporting/harness-output.txt`: offline configuration harness and its output
- `supporting/dump.tftest.hcl`: the mocked test used to render container definitions
- `supporting/rendered-main-nonprod.txt`, `supporting/rendered-branch-nonprod-null.txt`,
  `supporting/rendered-branch-nonprod-hardened.txt`: rendered Identity container definitions (ARNs
  with a placeholder suffix; no secret values)
- `supporting/checks.txt`, `supporting/mutations.txt`: local check and mutation results
