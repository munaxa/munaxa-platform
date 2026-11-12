# 06. Production IAM decision: how the ElastiCache AUTH token reaches the cache

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required, **[V-doc]** stated in AWS or Terraform documentation, not observed.

**Nothing in IAM was changed.** This is a decision paper. The owner's answer is needed only before
Phase E (the first production apply with `identity_cache` set). Testing does not need it.

## The question

The merged design (platform#110) has Terraform read the token at plan and apply time:
- `module.identity_cache_auth` (an ephemeral read through provider alias `aws.ephemeral_secrets`)
  reads `REDIS_PASSWORD` from the pinned version of `munaxa-prod/identity` **[V]** (`stack/identity-cache.tf`);
- it feeds `auth_token_wo`, which is write-only and never stored in state or plan **[V]**.

That cannot work today **[V]**:
- the deployer role's own policy (`bootstrap/iam.tf`, statement `NoSecretValuesNoUsersNoKeys`) denies
  `secretsmanager:GetSecretValue`, `PutSecretValue` and `BatchGetSecretValue` on `*`;
- an explicit Deny cannot be overridden by an Allow, so an exception means editing the Deny itself.

Phase A recorded this as T-1 and left it as an owner decision.

## Facts that matter for the choice

1. **One production deployer role does both plan and apply** **[V]**: `munaxa-shared-deployer-prod`.
   There is no separate plan role, so "plan and apply roles only" means one role.
2. **Only CI can reach it, and only from `main` in a deploy environment** **[V]** (`bootstrap/iam.tf`):
   the CI role's OIDC trust requires `ref = refs/heads/main` and an `environment:<env>` subject, and the
   deployer trusts only that CI role with source identity `github-actions`. A pull-request branch cannot
   assume it, so whatever the deployer may read, only code already merged to `main` can read it.
3. **The bundle is not just the token** **[V]**. `munaxa-prod/identity` holds `DATABASE_URL`,
   `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_PASSWORD`, `REDIS_URL`, and
   `MFA_ENCRYPTION_KEYS` once the hardened image runs. `GetSecretValue` returns the whole secret string:
   there is no per-key permission. **An exception on that secret gives the deployer the access-token
   signing key and the database password.**
4. **Ephemeral does not mean confined** **[V-doc, Terraform]**. An ephemeral value cannot be stored in
   state or plan, but it can flow into provider configuration, provisioners and other ephemeral
   contexts. A merged change to `main` could send it to a `local-exec` or an HTTP data source.
   The protection is review on `main`, not Terraform.
5. **ElastiCache can take the token outside Terraform** **[V-doc]**:
   - `ModifyReplicationGroup` with `AuthToken` and `AuthTokenUpdateStrategy=ROTATE` adds a token to a
     TLS group, and both old and new are accepted (or, with no old token, passwordless clients still
     connect) until a second call with `SET` makes the new token the only one.
   - The token must be 16 to 128 printable characters; Munaxa requires `[A-Za-z0-9-]{32,128}` (platform#114).
   - AUTH requires `transit_encryption_enabled`, which the design already sets.
   - **[U]** Whether CloudTrail redacts `AuthToken` in `ModifyReplicationGroup` request parameters is not
     stated in the pages read. Assume it might be logged until checked.
6. **A write-only argument does not drift** **[V]**. Terraform never reads `auth_token_wo` back, so a token
   set outside Terraform causes no plan difference.

## The options

| | **A. Exception on the bundle** | **A'. Exception on a token-only secret** | **B. Operator-set token (recommended)** | **C. GitHub environment secret** |
| --- | --- | --- | --- | --- |
| What changes | Deny gains `NotResource` for `munaxa-prod/identity`; Allow on it for the prod deployer | New secret `munaxa-prod/identity-cache-auth` with only the token. Deny excepts that ARN only. Identity's task definition reads `REDIS_PASSWORD` and `REDIS_URL` from it | Remove `module.identity_cache_auth` and the `aws.ephemeral_secrets` alias. Terraform creates the group with transit encryption and a throwaway token, or none. The operator rotates to the real token | `ephemeral` input variable from an `aws-prod` GitHub environment secret |
| What the deployer can read | **Signing key, DB password, MFA keys, token** | The token only | Nothing (Deny stays on `*`) | Nothing in AWS; the CI job holds the token |
| Copies of the token | 1 (bundle) | 1 (dedicated secret) | 1 (bundle) | 2 (bundle and GitHub), kept in sync by hand |
| Blast radius of a malicious merge to `main` | Exfiltrate the signing key: forge any Identity token for every product | Exfiltrate the cache token: read or reset rate limits, lockouts, MFA challenges, replay markers. Still needs network reach to the private subnets | None through Terraform | Same as A' |
| Rotation | Terraform: new bundle version, bump `auth_token_version` (ROTATE), roll Identity, SET | Same, on the dedicated secret | Operator: ROTATE, roll Identity, SET (2 API calls) | Terraform, plus a GitHub secret update |
| Repository work | IAM only | IAM, a second secret in `storage.tf`, task definition secret references, Identity config unchanged | Terraform: remove module and alias, keep the precondition idea as a runbook check; a new runbook section | Workflow, variable, IAM unchanged |
| Guardrail change | Weakens the deliberate Deny on the most sensitive secret | Narrow exception on a low-value secret | **None** | None in AWS; widens GitHub custody |

## How Option B would work

**[R]** Proposed design. Not implemented; it is a separate repository change if the owner picks it.

1. **Terraform** creates the replication group with `transit_encryption_enabled = true`.
   - Preferred: an `ephemeral "random_password"` (hashicorp/random 3.7 or later) as the initial
     `auth_token_wo`, so the group never exists without AUTH. Nobody knows that value, and it is never
     stored. **[U]** Not tested here: the random provider is not in the local mirror, and its ephemeral
     resource has not been run against this configuration.
   - Fallback: no token at create. The group is then passwordless until step 3, but only the Identity
     service security group can reach it and Identity is not running yet.
   - `auth_token_wo_version` stays constant, so Terraform never sends a token again.
2. **The operator** writes the bundle version with `REDIS_PASSWORD` and `REDIS_URL` (as today) and pins it.
3. **The operator** sets the token on the group without seeing it:
   - `ModifyReplicationGroup --auth-token-update-strategy ROTATE --apply-immediately` with the token
     taken from the pinned bundle version;
   - on this project's tooling that is the `{{resolve:secretsmanager:munaxa-prod/identity:SecretString:REDIS_PASSWORD}}`
     pattern through `asm-exec`, so the value never enters a session **[U]** (whether `asm-exec`
     resolves inside an AWS CLI argument is not verified here);
   - or the owner runs it once in CloudShell. That is an owner action, not a Claude action.
4. Deploy Identity on that bundle version and check readiness.
5. `ModifyReplicationGroup ... SET` with the same token, so passwordless (or the throwaway token) stops working.
6. Rotation repeats 2 to 5.

What B costs:
- two manual, owner-authorized API calls at first setup and at each rotation;
- the plan no longer proves that the token in the bundle is valid for ElastiCache, so the format
  check moves to the runbook (or to a CI-side check of the bundle that runs as the task's own role);
- and it removes the extra `sts:AssumeRole` through the alias in every plan (05, D4), which also closes
  the "provider configured for a count-0 module" question.

## Recommendation

**[R] Option B.** It keeps the deliberate "no secret values for the deployer" guardrail exactly as it is,
and the price is two owner-run calls per rotation in an environment where rotation is rare.

**[R] If the owner prefers full automation: A', never A.** A' limits what the deployer can read to the
cache token. A as worded gives the deployer the access-token signing key, which is the most valuable
secret in the system: anyone who can merge to `main` could then mint tokens for every product.

**Not recommended: C.** It creates a second copy of the token outside AWS, and the CI job sees it.

## The owner's decision **[O]**

> For the production cache password, choose one:
> **B** (recommended): Terraform never reads it; it is set by two manual calls at setup and rotation.
> **A'**: Terraform reads it from a separate secret that holds only that password.

Either answer leads to a repository-only PR before Phase E. Neither changes IAM until the owner
separately authorizes the bootstrap re-apply (A') or the production apply (B).
