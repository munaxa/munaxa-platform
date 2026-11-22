# 09. Identity Center execution (22 Nov 2026)

Executed by Claude through the AWS connector, signed in as account root, after the owner's yes (21 Nov 20:49 UTC, "Yes for all three and you do them"). The owner did O-IAM-1 to O-IAM-3 in the console and confirmed at 12:47 UTC.

## Owner console steps (O-IAM-1 to 3)
- Instance: `arn:aws:sso:::instance/ssoins-69875eaef0e8dbe8`, identity store `d-9967b3db9b`, status ACTIVE.
- Single-Region, Frankfurt (eu-central-1). Owner account 229251310592.
- One user, the owner (username and user id kept out of this public repository). The e-mail was not read or returned.
- MFA always-on was set by the owner (O-IAM-2). There is no API to read this setting, so it was not machine-verified.

## O-IAM-4 (Claude, about 12:50 UTC)
Each permission set's inline policy is the minified JSON of the file in munaxa-platform `infra/aws/identity-center/` at main `00a7f64`. The inline length read back from AWS equals the length of the minified repository file.

| Permission set | Session | Managed policies | Inline (chars / statements) | Assignment to the owner on 229251310592 |
| --- | --- | --- | --- | --- |
| MunaxaAdministrator | PT1H | none | 3478 / 11 | SUCCEEDED (c2661f9c) |
| MunaxaEngineering | PT4H | ViewOnlyAccess | 5823 / 15 | SUCCEEDED (98f3de4d) |
| MunaxaReadOnly | PT8H | ViewOnlyAccess, SecurityAudit, AWSMCPSignInOAuthAccessPolicy | 1506 / 2 | SUCCEEDED (0df7dcc7) |

Provisioned roles:
- `AWSReservedSSO_MunaxaAdministrator_d161ac2b6ce219f7`
- `AWSReservedSSO_MunaxaEngineering_f26af522c91dbdf3`
- `AWSReservedSSO_MunaxaReadOnly_96f6bee034a2e5c3`

## Live checks (IAM policy simulator, read-only)
**MunaxaEngineering, explicitDeny:** iam:CreateUser, iam:CreateAccessKey, iam:AttachRolePolicy, iam:PutRolePolicy, iam:UpdateAssumeRolePolicy, iam:PassRole, sts:AssumeRole, sso:CreateAccountAssignment, secretsmanager:GetSecretValue on `*`.

**MunaxaEngineering, other results:**
- PutSecretValue on `munaxa-nonprod/docs-api-*` is allowed (custody).
- GetSecretValue on `munaxa-nonprod/identity-*` is implicitDeny (not a custody bundle).

**MunaxaReadOnly:**
- GetSecretValue is explicitDeny.
- CreateUser and CreateAccessKey are implicitDeny.
- ecs:ListClusters is allowed.

## Account hygiene (owner's restriction history)
Checked before and after the change:
- IAM users: 0.
- Root access keys: 0.
- Root MFA: on.

Identity Center users are not IAM users and cannot hold access keys.

## Not done
- O-IAM-5: the owner's sign-in checks A and B from the access portal.
- O-IAM-6: switching the connector to MunaxaReadOnly.

Both are deferred until after Part 2 (CloudShell). Rollback is in README section 6.
