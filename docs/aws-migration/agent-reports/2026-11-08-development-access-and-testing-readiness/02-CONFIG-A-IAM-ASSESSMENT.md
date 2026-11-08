# Config A deployer IAM assessment (8 Nov 2026)

- **Continues:** `../2026-11-07-release-readiness-verification/00-RELEASE-READINESS-VERIFICATION.md` §4 (U-1 to U-5).
- **Method:** code inspection of `infra/aws/bootstrap/{iam,iam_allow,iam_session}.tf`, `infra/aws/stack/{services,ops,providers}.tf` and `infra/aws/modules/service/main.tf` at platform `main` = `8c7c282`; AWS documentation read through the AWS documentation tool on 8 Nov ~06:32 UTC; live IAM metadata from the read-only check in [`00-...md`](00-DEVELOPMENT-ACCESS-AND-TESTING-READINESS.md) §4 (where it ran). **No IAM resource was created or changed, no simulation was run, no Terraform was run.**
- **Why this is still needed under root access:** root bypasses identity policies. Config A is applied by the Terraform deployer role through GitHub Actions, not by root, so the deployer's own permissions decide whether it succeeds (`infra/aws/ACCESS-POLICY.md` §1.2).

Status categories used below: **Verified**, **Likely but unverified**, **Not verified**, **Requires a real apply to prove**.

## 1. Who applies Config A

| Item | Value | Status |
|---|---|---|
| Executing role | `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod` (`bootstrap/iam.tf` `aws_iam_role.deployer`) | Verified in code |
| Chain | `aws-terraform.yml` → GitHub OIDC → `munaxa-shared-ci-nonprod` (environment `aws-nonprod`) → `sts:AssumeRole` + `sts:SetSourceIdentity` = `github-actions` → deployer (`iam.tf` `deployer_trust`) | Verified in code; exercised by G3, recovery and backstop applies (6 Nov) |
| Identity policies | inline `deployer` (state, guardrail denies); managed `munaxa-shared-deployer-read` (v1), `munaxa-shared-deployer-nonprod-allow-tagged` (v1), `munaxa-shared-deployer-nonprod-allow` (v3) | **Verified** in code and live [V-aws 8 Nov 06:55]: attachments, inline name and every statement used below read from AWS and compared with the code statement by statement (Sids, actions, resources, conditions) |
| Permissions boundary on the deployer | None in code | **Verified** live: none [V-aws 06:55] |
| SCPs | Do not apply: `229251310592` is the Organizations management account and SCPs do not affect principals in it | Verified (AWS Organizations user guide, recorded 7 Nov) |
| Not Config A | ECS services, Cloud Map service, target groups, listener rules (session deployer `munaxa-shared-deployer-nonprod-session`, at the first `up`) | Out of scope here; same unexercised risk class |

## 2. Requirement by requirement

| # | Config A need | Allowing statement (code) | Denies checked | Status | Reason |
|---|---|---|---|---|---|
| 1 | `ecs:RegisterTaskDefinition` for 7 families `munaxa-nonprod-{identity,identity-migrate,identity-bootstrap,control-api,control-migrate,control-portal,db-admin}` | `OwnNames`: `ecs:*` on `task-definition/munaxa-nonprod-*` (no condition) | `CreatesCarryProjectTag/EnvironmentTag` (satisfied: provider `default_tags` Project = munaxa, Environment = nonprod, `stack/providers.tf`); `NeverAnotherProjectByTag`, `NeverTheOtherEnvironment*` (not matched) | **Likely but unverified** | Works if ECS authorizes `RegisterTaskDefinition` against the task-definition ARN. The ECS developer guide (read 8 Nov) documents task-definition ARNs with family and revision as policy resources and lists `RegisterTaskDefinition` as a tag-on-create action; the Service Authorization Reference table that names the resource type per action could not be read (the tool redirected to the index page). If ECS authorizes on `*`, this allow does not match and the apply fails at the first task definition. Never exercised: no task definition has ever been registered |
| 1b | `ecs:TagResource` during `RegisterTaskDefinition` (tags present) | `OwnNames` `ecs:*` on the same ARN | as above | **Likely but unverified** | ECS evaluates `ecs:TagResource` when tags are passed on create (ECS developer guide, "Grant permission to tag resources on creation", read 8 Nov). Same resource question as #1 |
| 2 | `iam:PassRole` of `munaxa-nonprod-<svc>-execution`, `munaxa-nonprod-control-api-task`, `munaxa-nonprod-identity-bootstrap-execution` to ECS | `PassOwnRoles`: `role/munaxa-shared/munaxa-nonprod-*`, `iam:PassedToService` in `ecs-tasks.amazonaws.com`, `ecs.amazonaws.com`, `scheduler.amazonaws.com` | `NeverMunaxaDocsOrBootstrap` covers only `role/munaxa-shared/bootstrap/*` and `role/munaxa-docs/*`: not matched | **Likely but unverified** | Verified in code that every role is created with path `/munaxa-shared/` and a name starting `munaxa-nonprod-` (`modules/service/main.tf` 65 to 68 and 120 to 123; `stack/ops.tf` 57 to 59, 203 to 205), so the ARN pattern matches. Unverified that ECS sends `ecs-tasks.amazonaws.com` as `iam:PassedToService` at registration (expected). PassRole to ECS has never been exercised |
| 3 | `iam:CreateRole` with boundary for those roles | `OwnRolesWithOwnBoundary`: requires `iam:PermissionsBoundary` = `policy/munaxa-shared/munaxa-shared-workload-boundary` | as #2 | **Verified in code; exercised** | Every Config A role sets exactly that boundary ARN (`boundary_name.nonprod` in `iam.tf` 21 equals the stack's string). Same statement created the db-admin and backstop roles in real applies (5 to 6 Nov) |
| 4 | `kms:CreateKey` for `aws_kms_key.licence` (`ECC_NIST_P256`, `SIGN_VERIFY`, no `policy` argument, no bypass of the lockout check) | `CreateWithOwnTags`: `kms:CreateKey`, `kms:TagResource` on `*` with request tags Project = munaxa, Environment = nonprod | `CreatesCarry*` (satisfied by `default_tags`); `NoSecretValuesNoUsersNoKeys` (denies `kms:Sign`, not `CreateKey`) | **Likely but unverified** | The same statement created the symmetric data key in G3. Key spec and usage are not constrained by any statement, so an asymmetric key is allowed in policy terms. Asymmetric creation never exercised |
| 5 | `kms:PutKeyPolicy` by `aws_kms_key_policy.licence` | `OwnTagged`: `kms:PutKeyPolicy` on `*` where the key carries `aws:ResourceTag/Project` = munaxa and `Environment` = nonprod | none | **Requires a real apply to prove** | Identity-policy side: likely (the key is tagged at creation). KMS side: the key starts with the default key policy (no `policy` argument), which delegates to IAM, so the IAM allow applies [E]. **Lockout safety check:** the new policy grants the account principal `kms:PutKeyPolicy` (`AccountAdministersNotSigns`), which delegates to IAM, so the deployer keeps the right to change the policy again [E]. **Principal check:** `ControlApiSignsLicences` names the new control-api task role; Terraform orders the role first through the module output reference, but IAM propagation can make KMS reject a just-created principal (`MalformedPolicyDocumentException`). Whether the provider retries long enough is not verified. The simulator does not run the lockout or principal checks |
| 6 | Refresh reads on the licence key: `kms:DescribeKey`, `GetKeyPolicy`, `GetKeyRotationStatus`, `ListResourceTags`, `GetPublicKey` | `OwnTagged` (IAM) and `AccountAdministersNotSigns` (key policy lists all five) | none | **Likely but unverified** | Both layers allow them in code. Provider behaviour of `GetKeyRotationStatus` on an asymmetric key (AWS does not support rotation for asymmetric keys) is not verified (U-5); the policy allows the call either way |
| 7 | `kms:CreateAlias` `alias/munaxa-nonprod-control-licence` | `OwnNames` (alias) and `OwnTagged` (key) | `NeverSharedAliases` covers `alias/munaxa-shared-*` only | **Likely but unverified** | Same pattern created `alias/munaxa-nonprod-data` in G3 (exercised for a symmetric key) |
| 8 | Log groups `/munaxa/nonprod/{identity,identity-migrate,control-api,control-migrate,control-portal}` | `OwnNames` `logs:*` on `log-group:/munaxa/nonprod/*` | `CreatesCarry*` (satisfied) | **Likely but unverified** | Exercised for `/munaxa/nonprod/ops` in G3 |
| 9 | Security groups and rules for the new services; ingress on the DB security group | `Ec2CreateSecurityGroup`, `Ec2CreateRule`, `Ec2TagOnCreate`, `OwnTagged` | `CreatesCarry*` excludes the parent types since platform #55 | **Likely but unverified** | Exercised in the G3 recovery (6 Nov) |
| 10 | Live policies equal code (U-1) | — | — | **Verified** [V-aws 06:55] | Read-only `GetRole`, `GetRolePolicy`, `GetPolicyVersion` (configuration documents, not credentials). Live `OwnNames` includes `task-definition/munaxa-nonprod-*`; `PassOwnRoles`, `OwnRolesWithOwnBoundary`, `CreateWithOwnTags`, `OwnTagged` (with `kms:PutKeyPolicy`) and both `CreatesCarry*` (with the four EC2 parent types as `NotResource`) are as in code. This is a statement comparison, not a byte comparison of the rendered JSON |

## 3. Explicit denies and boundaries reviewed

- `ThisRegionOnly`: Config A is all `eu-central-1` (IAM is excluded from the deny). No effect.
- `NeverMunaxaDocsOrBootstrap`: Config A creates nothing under `role/munaxa-shared/bootstrap/` or `policy/munaxa-shared/`. No effect.
- `NeverAnotherProjectByTag`, `NeverTagForAnotherProject`, `NeverTagAsMunaxaDocs`, `NeverMunaxaDocsProductionByTag`: `default_tags` sets Project = munaxa. No effect.
- `CreatesCarryProjectTag`, `CreatesCarryEnvironmentTag`: cover `ecs:RegisterTaskDefinition`, `logs:CreateLogGroup`, `kms:CreateKey`; tags present. No effect, provided each create sends its tags (the provider does for all three).
- `NeverTheOtherEnvironment*`: Config A names and tags are nonprod. No effect.
- `NoSecretValuesNoUsersNoKeys`: denies `kms:Sign` to the deployer. Correct by design; the deployer never signs.
- Workload boundary on created roles: allows `kms:Sign` only on keys tagged Project munaxa, Environment nonprod. The licence key carries those tags, so the control-api task role's signing fits inside the boundary (relevant at runtime, not at apply).
- No permissions boundary on the deployer in code.

## 4. Summary

| Category | Items |
|---|---|
| **Verified** | Executing role and chain (code; exercised); SCPs do not apply; no boundary on the deployer (live); live policies equal code for Config A statements (U-1); role names, paths and boundary ARN match the allows (#3, and the ARN side of #2); no deny matches a Config A request |
| **Likely but unverified** | #1 RegisterTaskDefinition scope (most likely single point of failure), #1b, #2 PassedToService value, #4 asymmetric CreateKey, #6, #7, #8, #9 |
| **Not verified** | U-5 provider handling of rotation status on an asymmetric key |
| **Requires a real apply to prove** | #5 PutKeyPolicy (lockout and principal-existence checks, IAM propagation); and, in the end, every unexercised item above |

**IAM verdict for Config A: NOT VERIFIED.** No policy change is proposed and none was made.

## 5. Prepared simulation (not run; needs separate owner authorization)

[`supporting/config-a-iam-simulation-PREPARED-NOT-RUN.sh`](supporting/config-a-iam-simulation-PREPARED-NOT-RUN.sh) runs `iam simulate-principal-policy` against the deployer for U-2 (both on the task-definition ARN and on `*`, because the simulator cannot say which resource ECS really authorizes), U-4, CreateRole with the boundary, asymmetric `CreateKey`, the identity-policy half of `PutKeyPolicy` and the refresh reads, the alias and a log group. Expected inputs are written in the script (request tags Project = munaxa, Environment = nonprod; `iam:PassedToService` = `ecs-tasks.amazonaws.com`; `kms:KeySpec` = `ECC_NIST_P256`, `kms:KeyUsage` = `SIGN_VERIFY`).

Expected results if the code is live: every case `allowed` except possibly U-2b (`*`), which is expected to be `implicitDeny`; that outcome is acceptable only if ECS authorizes on the task-definition ARN.

## 6. Recommended way to close it

1. Owner authorizes (or declines) the simulation in §5 as its own step.
2. Prefer the first Config A apply as the proof, with the G3 recovery discipline: stop at the first `AccessDenied`, decode it, fix in code, re-apply only after owner approval. Config A creates the licence key with `prevent_destroy`; a failed apply after key creation leaves a key in state that later applies reuse (no extra key).
3. Do not change any policy before a real denial shows what is needed.
