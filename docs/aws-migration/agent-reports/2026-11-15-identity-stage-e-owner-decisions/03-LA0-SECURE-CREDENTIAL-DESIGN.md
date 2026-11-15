# 03. L-A0 secure credential design (owner decision D-LA0)

**Status: implemented in the repository on PR #131 (draft, NOT merged, NOT run).**
Branch `claude/project-thread-sdov0b`, head `03c809b` (commits `e5862dc` design, `391e1be` review A
and B fixes, `03c809b` review C test fixes), base `2f6d443` (main after PR #130).
<https://github.com/munaxa/munaxa-platform/pull/131>

## 1. The problem (L-A0)

The previous Option A scripts (C-8, C-8R) generated the operator password with
`secretsmanager:GetRandomPassword` and wrote it with `CreateSecret`/`PutSecretValue` through the AWS
connector. The connector records each request and response, and in some paths full AWS error
messages. Whether its server-side audit log keeps them is unknown (report
`2026-11-14-identity-stage-e-blockers-remediation/11`). The password therefore passed through a
system whose retention we cannot see. The owner refused the proposed `CreateSecret` canary and asked
for a redesign in which the connector never handles the password.

## 2. The design

The password is generated **inside Secrets Manager** by CloudFormation:

- Template: `infra/aws/cloudformation/identity-operator-secret.template.json` (the connector script
  embeds the identical JSON; a test keeps them equal).
- Stack `munaxa-nonprod-identity-operator-secret`, created with termination protection and
  `OnFailure ROLLBACK`.
- Resource `OperatorSecret` (`AWS::SecretsManager::Secret`):
  - Name `munaxa-nonprod/identity-operator`; KMS key `alias/munaxa-nonprod-data` (the nonprod data
    key the bootstrap execution role can already decrypt with).
  - `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`: deleting or replacing the stack never
    deletes the credential.
  - `GenerateSecretString`:
    - `SecretStringTemplate` (via `Fn::Sub`) holds only `IDENTITY_OWNER_EMAIL`,
      `IDENTITY_ORGANISATION` (`munaxa-group`) and `IDENTITY_SECRET_GENERATION`.
    - `GenerateStringKey: IDENTITY_OWNER_PASSWORD`, `PasswordLength: 40`,
      `RequireEachIncludedType: true`, `IncludeSpace: false`, `ExcludeCharacters` = double quote,
      single quote, backtick, backslash.
  - Tags `Project=munaxa`, `Stack=shared`, `Environment=nonprod`,
    `ManagedBy=cloudformation/munaxa-nonprod-identity-operator-secret`.
- Resource `OperatorSecretPolicy` (`AWS::SecretsManager::ResourcePolicy`, `BlockPublicPolicy: true`),
  four Deny statements (detail and reasoning in file 07):
  1. Value reads (`GetSecretValue`) are denied to everyone except root and, **only while the stack
     parameter `BootstrapReadWindow` is `open`**, the identity-bootstrap execution role
     `role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution`.
  2. Root may read the value **only through CloudFormation** (`aws:CalledVia`). A direct
     `GetSecretValue` by root, which is the connector's principal, or from the console, is denied.
  3. The execution role is denied after `WindowExpiresAt`, so a window closes itself even if the
     session is lost.
  4. Every write, rotation, policy, tag, replication, delete or restore call is denied unless the
     caller is root.
- Parameters:
  - `OperatorEmail` is `NoEcho`, has no default, and an `AllowedPattern` that refuses quotes,
    backslashes and spaces (so the email cannot break the generated JSON).
  - `Generation` (default `1`).
  - `BootstrapReadWindow` (`closed` or `open`, default `closed`).
  - `WindowExpiresAt` (ISO UTC, closed value `2000-01-01T00:00:00Z`).
- Docs check: AWS documents that a change to `GenerateSecretString` creates a new secret version,
  which is how `regenerate` works (bumping `Generation` changes the template string).

## 3. Requirement by requirement

| Requirement (instruction section 4) | How it is met | Evidence |
| --- | --- | --- |
| No password in connector requests or responses | C-8G sends only CloudFormation calls whose bodies hold the template and parameters (no password parameter exists); it reads only metadata (`DescribeStacks`, `DescribeSecret`, `ListSecretVersionIds`, `GetResourcePolicy`, `GetTemplate`). `sandbox_harness.FORBIDDEN_OPERATIONS` refuses `GetSecretValue`, `BatchGetSecretValue`, `GetRandomPassword`, `CreateSecret`, `PutSecretValue`, `UpdateSecret`, `RotateSecret`, `DeleteSecret`, `RestoreSecret`, `PutResourcePolicy`, `DeleteResourcePolicy` in every connector script | `test_connector_scripts.py`: every C-8G mode checked with `password_in_calls(fake) == False` and `leaks(result) == []` |
| No password in logs | C-8G returns names, ARNs, statuses, counts and codes; it never reads `ResourceStatusReason` or an AWS error message. The bootstrap task gets the password through ECS secret injection; its own policy check prints violation codes only (Identity `bootstrap-account.mjs`, platform `password-policy.ts`) | tests `test_an_unexpected_exception_returns_a_code_only`, `test_a_rolled_back_create_fails_without_the_reason` |
| No password in Terraform state or plans | Terraform does not manage the secret or its value. The stack's task definition holds only the `valueFrom` reference `…:identity-operator:IDENTITY_OWNER_PASSWORD::` | `ops.tf`; Terraform test asserts in `stage-e-manifest.tftest.hcl` |
| No password in workflows or the repository | No workflow touches the stack; the repository holds the template and a placeholder email only | grep and tests; `<IDENTITY_OPERATOR_EMAIL>` placeholder |
| Email and organisation separate from password material | The email is a `NoEcho` parameter sent only by `MODE create`; every other mode sends `UsePreviousValue`. The template never contains the email. The password key is not in the template string | `test_only_create_ever_sends_the_email`, `test_the_password_is_generated_by_secrets_manager_never_supplied` |
| JSON schema preserved | Same four keys the bootstrap task reads: `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD`, `IDENTITY_ORGANISATION`, `IDENTITY_SECRET_GENERATION` | `test_the_schema_matches_the_identity_bootstrap_task` |
| Least-privilege `GetSecretValue` | The execution role policy (`ops.tf`, Sid `ReadOwnerUrlAndOperatorSecret`) names exactly `identity-migrate` and `identity-operator-??????`; the secret's own policy adds the window and the expiry | Terraform asserts (mutation-tested), file 07 |
| No duplicate secret | One secret. The old one-run `identity-bootstrap` copy and C-16 deleted; `create` refuses if either secret already exists; C-24 flags `legacy-bootstrap-secret-created` | tests; `c24` findings |
| Password-policy validation in bootstrap | The Identity bootstrap (`apps/api/scripts/bootstrap-account.mjs`) validates the password against the real platform policy (`PasswordPolicyService`) before it writes anything and fails with violation codes only. A 40-character mixed password passes it except in a negligible case (a six-character keyboard or alphabet run, or the email's local part inside it); the recovery is `regenerate` | Identity source at `2db6ed9`; platform `packages/platform/auth/src/password-policy.ts` |
| Idempotency and recovery | `create` runs once (stack and both secrets must be absent; a client request token); waits are bounded to the connector's 60 s limit and return `IN_PROGRESS` to be re-run with `status`; `UPDATE_ROLLBACK_COMPLETE` is still usable; `remove-failed-create` handles `ROLLBACK_COMPLETE` | tests A-1, A-2, A-4, B-M2 |
| Rotation, recovery, disablement, cleanup documented | §4 below and the runbook (S-5, S-5b, S-6d) | runbook on PR #131 |
| Threat model and regression tests | File 07; 121 connector tests and 2 new Terraform asserts at `03c809b` | file 08 |
| Separate owner-reviewed execution procedure | §5 below; nothing runs until the owner approves Stage E | |

## 4. Lifecycle

- **Create (once, in Stage E):** `MODE create` with the private email typed into the session copy.
  Result: stack `CREATE_COMPLETE`, secret version 1, window closed. Then `status`.
- **Use:** just before the identity-bootstrap task, `open-window` (`WINDOW_MINUTES` 5 to 120,
  default 60). Run E-1 bootstrap. Immediately after, and on every exit path before `down`,
  `close-window`. If the session is lost, the window expires on its own at `WindowExpiresAt`.
- **Regenerate (rotation):** only while no Identity account exists for the email (after the account
  exists, the password lives in the Identity database as a hash, and a new secret value would not
  change it). Needs `NO_ACCOUNT_CONFIRMED = True` and `EXPECTED_GENERATION` = the current generation;
  the window must be closed; the script fails unless `AWSCURRENT` really changed.
- **Password change after the account exists:** done in Identity itself (the password change
  feature), not in the secret. The secret value is then stale, and is kept only as the bootstrap
  record; it is never used for sign-in (D-BE4 skips the operator sign-in).
- **Recovery:** a failed create (`ROLLBACK_COMPLETE`) → `remove-failed-create`; a retained orphan
  secret, if CloudFormation left one, is removed only by a separate owner-approved root step, never
  by the connector. A failed update (`UPDATE_ROLLBACK_COMPLETE`) → re-run the same mode.
- **Disablement:** keep the window closed (default). To block even root-through-CloudFormation reads,
  delete the stack: the secret is retained, and the policy resource is deleted with it, so this is
  only done together with the cleanup step below.
- **Cleanup at the end of Testing:** an owner-approved root step: `UpdateTerminationProtection`
  false, `DeleteStack` (secret retained), then `DeleteSecret` with a recovery window. Never through
  the connector (the harness refuses `DeleteSecret`).

## 5. Execution procedure (owner-reviewed, NOT authorized)

Only inside an authorized Stage E, each step with its own owner approval:

1. `c8g` `MODE status` (expects: stack absent, secrets absent).
2. `c8g` `MODE create` (private email in the session copy; the call record of this run is not kept as
   evidence).
3. `c8g` `MODE status` (expects PASS, generation 1, window closed, 1 version).
4. `c8g` `MODE open-window`, then E-1 bootstrap run, then `c8g` `MODE close-window`, then `status`.
5. C-24 CloudTrail custody check over the session window.

What this changes compared with the 14 Nov runbook: C-8, C-8R, C-8v and C-16 are retired; S-5 is
C-8G create, S-5b open-window, S-6d close-window (runbook updated on PR #131; the 11 Nov checklist
carries a 15 Nov banner pointing to it).
