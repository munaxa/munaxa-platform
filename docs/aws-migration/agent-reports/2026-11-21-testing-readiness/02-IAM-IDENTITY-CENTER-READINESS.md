# 02. IAM Identity Center readiness

**Nothing was created in AWS.** Owner steps, verification and rollback:
[`infra/aws/identity-center/README.md`](../../../../infra/aws/identity-center/README.md).

## 1. What was inspected

- The 29 Oct drafts (project files `aws-foundation/proposed-2026-10-29/iam/`, three JSON files).
- `infra/aws/OPERATOR-ACCESS.md`, `ACCESS-POLICY.md` (F-3, F-6).
- The live account layout as written in Terraform: role and policy paths in `infra/aws/bootstrap/`
  (`/munaxa-shared/bootstrap/` for every GitHub OIDC role, `/munaxa-shared/` for boundaries and
  every workload role in `stack/`), the nonprod data key (`stack/data.tf`, key
  `45eda044-…`, alias `munaxa-nonprod-data`, `Environment=nonprod`), secret names
  (`munaxa-nonprod/<bundle>`), the state buckets, and the Docs bootstrap (munaxa-docs, all tagged
  `Environment=Production`).
- What each owner step actually calls: the custody scripts use only `sts:GetCallerIdentity`,
  `secretsmanager:DescribeSecret`, `ListSecretVersionIds`, `GetSecretValue` (read-back inside the
  script), `PutSecretValue`, `CreateSecret`/`DeleteSecret` (Docs one-run provision secret, tagged),
  and `rds:DescribeDBInstances` [V, grep of the three scripts].

## 2. Findings

| # | Severity | Finding | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| IC-1 | **High** | The draft `MunaxaEngineering` allows `iam:UpdateAssumeRolePolicy`, `PutRolePolicy`, `AttachRolePolicy` on `role/munaxa-*/*`, which matches `role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod`, and `iam:CreatePolicyVersion` on `policy/munaxa-*/*`, which matches the workload boundary. An Engineering session could make the prod deployer trust itself (privilege escalation to Production) or widen every boundary. Its own "boundaries read-only" deny names `policy/munaxa-boundaries/*`, a path that does not exist | [supporting/engineering-draft-vs-interim-evidence.txt](supporting/engineering-draft-vs-interim-evidence.txt): draft `allow` ×4, new policy `deny` ×4 (offline model) | New policy has **no IAM write at all** |
| IC-2 | **High** | The draft relies on `PowerUserAccess`: in the management account that reaches every Production-tagged resource, every secret (Production, the Identity operator password, MFA keys), both Terraform state buckets and the org trail bucket | Policy text | `ViewOnlyAccess` + 6 narrow allows; explicit denies on Production tags, other secrets, other keys, key administration, state/trail buckets, ECS Exec, Session Manager, other Regions |
| IC-3 | Medium | Draft `MunaxaReadOnly` misses log streaming and query results, `logs:Unmask`, RDS log downloads, `BatchGetSecretValue`, `kms:GenerateDataKey*`, image layers, `sts:AssumeRole`/`AssumeRoot`, CloudShell | Policy text | Added to the deny |
| IC-4 | Low | Custody scripts accepted any identity in the account and printed the full caller ARN (an Identity Center session name may be an e-mail address) | Script text | Caller allow-list and masked session name (file 03) |
| IC-5 | Info | `AWSMCPSignInOAuthAccessPolicy` (for the connector on ReadOnly) | AWS documentation, "AWS managed policies for AWS MCP Server" (new policy 8 Jul 2026: `signin:AuthorizeOAuth2Access`, `signin:CreateOAuth2Token`) [V] | Kept |

## 3. The three permission sets as prepared

| Set | Can | Cannot (explicit deny or no allow) |
| --- | --- | --- |
| `MunaxaReadOnly` (8 h) | Describe/List/Get metadata (ViewOnly, SecurityAudit), cost, budgets, Organizations, Identity Center lists, CloudTrail `LookupEvents`, CloudWatch metrics/alarms, connector sign-in | Secret values, decrypt, S3 objects, log contents (events, queries, live tail, unmask), RDS logs, ECS Exec, SSM sessions/commands/parameters, image layers, assume any role, CloudShell, any write (no write allow exists) |
| `MunaxaEngineering` (4 h) | CloudShell; `Describe`/`ListVersions`/`Get`/`PutSecretValue` on exactly `munaxa-nonprod/{control-api,control-migrate,docs-api,docs-operator,docs-migrate,work-api,work-migrate}-??????`; create/delete/tag `munaxa-nonprod/docs-provision/*`; nonprod data key `GenerateDataKey`/`Decrypt` only via Secrets Manager; nonprod log contents (`/munaxa/nonprod/*`); everything ViewOnly shows | Any IAM, Identity Center, Organizations or account change; assume any role or root; other secrets (including `identity`, `identity-operator` and every Production secret); any other key; key administration; Production-tagged resources; state and trail buckets; ECS Exec, Session Manager, SSM parameters; Regions other than `eu-central-1`; workload writes (ECS, RDS, ALB, Route 53, S3: no allow exists) |
| `MunaxaAdministrator` (1 h) | Organizations, account, Identity Center, CloudTrail, billing, support; IAM reads; `sts:AssumeRoot` | Workload creation (EC2, VPC, NAT, ECS service/task, RDS, ElastiCache, Lambda, ALB), `GetSecretValue`, the Docs keys |

Who does what is stated in the README §2 table: custody scripts → Engineering; platform bootstrap
and Docs bootstrap → root; Terraform, publish and sessions → GitHub OIDC; Identity Center → Admin;
looking → ReadOnly.

## 4. Brief §4A checklist

| Item | Status |
| --- | --- |
| MFA requirements | Every sign-in, authenticator apps or security keys, register at sign-in (README O-IAM-2). No `aws:MultiFactorAuthPresent` (test `test_sizes_and_no_mfa_condition`) |
| Least privilege | Engineering reduced from PowerUser to 6 scoped allows; tests prove the custody operations still work |
| Management-account production exposure | IC-1, IC-2 fixed; residual limits in file 01 §1 |
| ReadOnly connector restrictions | Deny list extended (IC-3); tests |
| Secret-value and decryption denial | ReadOnly: all; Engineering: only the seven bundles + provision secret, decrypt only through Secrets Manager on the nonprod key |
| CloudWatch log-content boundaries | ReadOnly none; Engineering `/munaxa/nonprod/*` only |
| ECS Exec and SSM | Denied in all three; ECS Exec is also off in the task definitions (`modules/service`) |
| GitHub OIDC | Unchanged and untouched; Engineering cannot change the provider, the roles or their trust, and cannot assume them |

## 5. Tests

`python3 -I -W error -m unittest discover -s infra/aws/identity-center -p 'test_*.py' -v` →
**13 tests OK** (local, 21 Nov ~16:25 UTC), and in CI as the new step "Identity Center
permission-set policy tests" of `aws-terraform.yml`. The evaluator is a model of IAM (explicit deny
wins; wildcards; the condition operators used); the owner's section 5 verification, including the
IAM policy simulator escalation checks, is the proof in AWS.

## 6. Owner verification and expected identity

README §5: ReadOnly `get-caller-identity` →
`arn:aws:sts::229251310592:assumed-role/AWSReservedSSO_MunaxaReadOnly_<16 hex>/<user>`;
Engineering → `…AWSReservedSSO_MunaxaEngineering_<16 hex>/<user>`. Negative tests: ReadOnly
`get-secret-value` and `filter-log-events` denied; Engineering `get-secret-value` on
`identity-operator` denied and any Region but Frankfurt denied; simulator: `explicitDeny` for
`UpdateAssumeRolePolicy`, `PutRolePolicy`, `AttachRolePolicy`, `sts:AssumeRole`, `CreateUser`,
`CreateAccessKey` on the prod deployer and `CreatePolicyVersion` on the boundary; allowed for
`PutSecretValue`/`GetSecretValue` on `munaxa-nonprod/docs-api`.
