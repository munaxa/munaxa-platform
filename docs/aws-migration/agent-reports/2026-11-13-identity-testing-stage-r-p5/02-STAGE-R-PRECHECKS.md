# 02. Stage R: read-only prechecks

Legend: **[V]** verified by Claude, **[W]** reported by a workflow run, **[AWS]** needs the AWS read-only check, **[O]** owner action.

## Status: NOT RUN against AWS. Every AWS check below is explicitly unavailable.

**Exact connection requirement.** The only approved read-only AWS identity is the owner's AWS MCP connector (root of `229251310592`, ACCESS-POLICY 8 Nov). In this session it **failed to connect**: the session start reported `AWS_MCP (502)`, an HTTP error from the connector proxy, and no `aws___*` tool was loaded. The connector directory lists it as installed and connected at the organisation level, so this is a connection failure, not a missing sign-in or a missing permission. There is no other approved route:

- the AWS CLI is not installed in this session, and no AWS credentials exist in it (by design: no access keys);
- `asm-exec` is not installed (checked 13 Nov: not on `PATH`), so the `aws-secrets-manager` resolve pattern is also unavailable;
- the CLAUDE.md `retrieve_skill` call for the `aws-secrets-manager` skill is a connector tool, so it was not available either.

**Update 15:17 UTC.** The connector came back briefly and its tools loaded. The first read-only Stage R script (`sts:GetCallerIdentity`, state bucket metadata) was refused before any AWS call with "needs you to sign in again", and the connector disconnected. The connector directory still lists the sign-in as not expired, so no Reconnect card could be posted. **No AWS call ran in this task.** (The CLAUDE.md `aws-secrets-manager` skill was looked up in the connector's skill registry while it was up: no skill of that name exists; the nearest is `creating-secrets-using-best-practices`, which is for creating secrets and not used here.)

**What clears it [O]:** the owner signs in to the AWS MCP connector again on claude.ai (Settings, Connectors; in Claude Code, `/mcp`) and sends any message in this thread. Claude then runs exactly the calls below, read-only, and adds the results as `02a-STAGE-R-RESULTS.md` in a follow-up report PR. No assumption was substituted for any result.

## Evidence that does not need AWS

| Check | Evidence | Kind |
| --- | --- | --- |
| Account and region in code | `allowed_account_ids = [var.account_id]` in both provider configurations; `nonprod.tfvars` `account_id = "229251310592"`; backend region `eu-central-1` | [V] repository |
| Backend and state identity | bucket `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate`, KMS alias `munaxa-shared-tfstate`, S3 lockfile (`envs/nonprod.backend.hcl`, `backend.tf`); there are no workspaces (default only) | [V] repository |
| State versus main | the 13 Nov 08:48 scheduled real plan (run 43396042072, deployer `munaxa-shared-deployer-nonprod-session`, account `229251310592`) planned only the known docs-migrate delta, 1 add and 1 change (01) | [W] |
| Database stopped | the same run's "Stop the database" step: `database munaxa-nonprod-pg: stopped` | [W] |
| Image digests | run 43359947421 job logs (01); 13 Nov 03:40 ECR verification in the CVE report 06 | [W], [V] earlier today by the CVE thread |

## The read-only checks to run (exact list, nothing else)

Every call is a `Describe*`, `List*` or `Get*` that returns metadata. **No `secretsmanager:GetSecretValue`, `BatchGetSecretValue`, `GetRandomPassword`, `kms:Decrypt`, `ssm:GetParameter*` or `s3:GetObject` on the state file.** The state file's object metadata is read with `HeadObject` only (version id, size, last modified), never its body.

| # | Area | Calls | Pass when |
| --- | --- | --- | --- |
| R-1 | Caller and account | `sts:GetCallerIdentity`; `organizations:DescribeOrganization` | account `229251310592`, region `eu-central-1`; management account of `o-6i2zz7t70i` (the only account today) |
| R-2 | Backend | `s3:GetBucketVersioning`, `GetBucketEncryption`, `GetPublicAccessBlock` on `munaxa-shared-tfstate-229251310592`; `s3:HeadObject` and `ListObjectVersions` (prefix `nonprod/stack.tfstate`, max 3) ; `kms:DescribeKey alias/munaxa-shared-tfstate` | versioning on, SSE-KMS with that key, public access blocked; state object present; no lock object `nonprod/stack.tfstate.tflock` (no plan in progress) |
| R-3 | Nothing running | `ecs:DescribeClusters munaxa-nonprod`; `ecs:ListServices`; `ecs:ListTasks` (RUNNING); `elbv2:DescribeLoadBalancers`; `ec2:DescribeNatGateways` (state available); `rds:DescribeDBInstances munaxa-nonprod-pg` | 0 services, 0 tasks, no ALB, no NAT, database `stopped` |
| R-4 | Task definitions | `ecs:ListTaskDefinitionFamilies` (prefix `munaxa-nonprod`), then `ecs:ListTaskDefinitions` per exact family; `ecs:DescribeTaskDefinition` for the ACTIVE revisions of `munaxa-nonprod-identity`, `munaxa-nonprod-identity-migrate`, `munaxa-nonprod-identity-bootstrap`, `munaxa-nonprod-db-admin` | each Identity family's latest revision references the 5277d71 digests (`71d01fdf…`, `d175ef37…`) and `ad02f18e` / `a3cc6622`; no other family carries an Identity image; no secret value in any definition (definitions hold only ARNs) |
| R-5 | ECR | `ecr:DescribeRepositories munaxa-identity/api, munaxa-identity/migrate`; `ecr:DescribeImages` by digest `9a8c6ebd…` and `5f3bdcce…`; `ecr:DescribeImageScanFindings` for both | tags `2db6ed9`, `sha-2db6ed9bb2eec55a38a1d9808b4a51f6258662d8`; `IMMUTABLE`; scan COMPLETE, 0 findings |
| R-6 | Secrets (metadata only) | `secretsmanager:DescribeSecret` and `ListSecretVersionIds` for `munaxa-nonprod/identity`, `munaxa-nonprod/identity-migrate`, `munaxa-nonprod/identity-operator`; `ListSecrets` filtered by name prefix `munaxa-nonprod/` (names only) | `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` is `AWSCURRENT` of `identity`; `a3cc6622-df66-4787-bae7-83ccfec56ff4` of `identity-migrate`; KMS key = the stack's data key; no rotation configured; no `docs-migrate` secret yet (it is the pending create). The JSON **key names** inside a bundle cannot be listed without the value, so "the bundle has no MFA_ENCRYPTION_KEYS yet" stays an inference from the 10 Nov owner input |
| R-7 | IAM (read, no change) | `iam:GetRole` and `ListRolePolicies` / `GetRolePolicy` / `ListAttachedRolePolicies` for `munaxa-nonprod-identity-execution`, `munaxa-nonprod-identity-migrate-execution`, `munaxa-nonprod-identity-bootstrap-execution`; `iam:GetPolicy` + `GetPolicyVersion` for `munaxa-shared-workload-boundary`; `iam:SimulatePrincipalPolicy` for each execution role: `secretsmanager:GetSecretValue` on its own bundle (allowed), on `munaxa-nonprod/identity-operator` (denied), `secretsmanager:PutSecretValue` (denied), `ecr:BatchGetImage` on its own repository (allowed) and on another (denied) | effective permissions equal the code (`modules/service/main.tf` `execution`, `ops.tf`), boundary attached, no task role for Identity |
| R-8 | Network | `ec2:DescribeVpcs` (`10.130.0.0/16`), `DescribeSubnets`, `DescribeRouteTables`, `DescribeSecurityGroups` and `DescribeSecurityGroupRules` for the Identity, ALB and database groups, `DescribeVpcEndpoints` | Identity SG: ingress only from the ALB SG on 4001, egress 443 and to the database SG on 5432; database SG ingress only from the service SGs; no `0.0.0.0/0` ingress except the ALB's 443 (the ALB does not exist at rest) |
| R-9 | Load balancer and target groups | `elbv2:DescribeTargetGroups`, `DescribeLoadBalancers` | none at rest (they are session resources) |
| R-10 | Certificate and DNS (read-only) | `acm:ListCertificates` / `DescribeCertificate` for `*.test.munaxa.com`; `route53:ListHostedZones` (expect none: DNS is Cloudflare); public resolution of `id.test.munaxa.com` with `getent hosts` from this session | certificate `ISSUED`, in use by nothing at rest, not near expiry; the `id.test` record is a Cloudflare CNAME that still points at a deleted session ALB or is absent (it is updated in stage E, owner action) |
| R-11 | Backstop and cost | `scheduler:ListSchedules` (group of the backstop) and `GetSchedule`; `logs:DescribeLogGroups` prefix `/munaxa/nonprod/`; `budgets:DescribeBudgets` | the 21:00 UTC schedule ENABLED with its target; budgets present |
| R-12 | CloudTrail of the check itself | `cloudtrail:LookupEvents` for this session's window, read-only events only | only the calls above, all read-only, no `AccessDenied` other than the known `s3:ListTagsForResource` pair |

## DNS check that does not need AWS [V]

```
$ getent hosts id.test.munaxa.com
```

Not run as evidence: a public lookup from this session's proxy only shows Cloudflare's answer, and the record is expected to be stale between sessions (runbook 03 §7, DNS-H1). It is listed so the stage E operator does it at the right time.

## Result

Stage R is **fully specified and not executed**. The only reason is the AWS connector connection failure. The checks that a GitHub workflow already performed (state versus main, the database stopped) are recorded above with their run ids.
