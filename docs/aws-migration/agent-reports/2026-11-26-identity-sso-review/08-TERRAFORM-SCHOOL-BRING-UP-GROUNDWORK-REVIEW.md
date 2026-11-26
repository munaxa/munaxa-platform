# 08 - Terraform School bring-up groundwork (munaxa-platform#207)

Date: 26 Nov 2026 (requested 21:27 UTC). This was a review only; nothing was pushed, merged or applied. The PR comes from the thread "Bring Munaxa School to Testing like Docs".

## Verdict

**Nothing above informational.** The PR (head `b2d47b6`) is mergeable from a security standpoint once CI is green. Applying it is a separate owner decision.

## What changed and what I checked

### `extra_secrets` in modules/service
- The execution role's `ReadOwnSecretBundle` statement is built from the exact ARNs the task uses, de-duplicated. That is the bundle when bundle keys are used, plus each extra secret's ARN.
  - A task with only extra secrets gets no bundle access.
  - There are no wildcards.
- `kms:Decrypt` is unchanged: `secrets_kms_key_arn`, through Secrets Manager only. The new secret uses the same data key.
- Each extra secret is pinned to its own version.

### `<env>/identity-oidc-clients`
- It holds IDENTITY_OIDC_CLIENT_SECRETS, moved out of the identity bundle.
- It is a container only (Terraform writes no value), KMS-encrypted with a 30-day recovery window, and created only when `identity_oidc_clients` is non-empty.
- It falls inside the deployer's `munaxa-<env>/*` CreateSecret scope, so no IAM change is needed.
- Moving it is a custody improvement: adding a relying party no longer means writing a new version of a bundle whose values nobody can read back.

### `school-provision` (replaces the unregistered school-bootstrap)
- **Execution role:**
  - keeps the permissions boundary;
  - can pull only from ECR `munaxa-school/api`;
  - can call GetSecretValue only on the school-api bundle and `<prefix>/school-provision/<slug>-??????`. The slug is validated against School's pattern, so it cannot widen the ARN.
  - can use KMS only through Secrets Manager, and can write logs only to the ops log group.
- **Task:**
  - has no task role, so the container has no AWS permissions;
  - runs as `school_app`, not `school_owner`, which is less privilege than before;
  - has a read-only root filesystem and drops all capabilities.
- **Inputs:** ADMIN_EMAIL comes from a one-run secret, never from the repository or a run-task override. The slug and name are plain environment values.
- The platform-owner password path is removed entirely.

## Informational

- **I-1 (rollout):** After apply, the Identity task reads the new secret. Give it a value before the next up, or the Identity task fails to start (fail closed, but an outage). Drop the old identity bundle key at the next bundle version.
- **I-2:** Secrets Manager grants access per secret, so the school-provision execution role can read the whole school-api bundle, although only DATABASE_URL is injected. Only the ECS agent uses that role. A dedicated URL-only secret would be tighter.
- **I-3:** `school_app` can set `app.is_platform` to write across tenants. This is the existing School seed design, not new here.
- **I-4:** Teach the H-20 declaration and custody scripts the new `identity-oidc-clients` version key and the `school-provision/<slug>` one-run secret.

## Re-review of `0042203` (identity-oidc-clients created by the operator)

**Still nothing above informational.**

What changed:
- `identity-oidc-clients` is no longer a Terraform resource. Identity reads it by a name-only (partial) ARN.
- `extra_secrets` gains an optional `policy_arn`, which falls back to `secret_arn`, so existing callers are unchanged.
- The execution role gets `…/identity-oidc-clients-??????`. This is the standard pattern for an operator-created secret, the same as identity-operator. Exactly six characters must match, so a differently named secret cannot match.
- If the secret does not exist yet, the task fails to start (fail closed).
- The stated reason holds. Terraform could only create the secret empty, after the bundle version it must match. One operator step inside AWS writes both the secret and the school-api bundle.

Informational:
- **I-5:** The operator procedure must create the secret with the stack's data KMS key (`aws_kms_key.data`) and a 30-day recovery window. The default `aws/secretsmanager` key would work, but loses the key separation.
- **I-6:** The name is reserved by convention only. Anyone with CreateSecret in `munaxa-<env>/*` could create it first. That is the same trust as identity-operator.
