# Security findings and remediation: phase 2, 30 Oct 2026

The status of every finding the brief named, and every other open finding from the 30 Oct baseline
([`../2026-10-30/07-…`](../2026-10-30/07-independent-security-cost-integration-review.md) §10, lead
report §10), checked against the live repositories in this pass. Ids are unchanged from the
baseline. New ids start with N-.

**No critical finding is open.** No high finding is open. Every fix named "in code" below is a
change to Terraform, CI or documentation. Nothing has been applied to AWS.

## 1. Findings the brief asked for

| Id | Finding | Severity | Status before this pass [V] | What this pass did | Status now | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **P9** | The deployer's `ec2:*` and `elasticloadbalancing:*` on `*` could change Docs Production's VPC, security groups and ALB | Medium | **Open.** On main `fc393fc`, `bootstrap/iam.tf` denied Docs only by name (roles, secrets, RDS `db:munaxa-docs*`, cluster, S3). Agent 1's "follow-up PR" was never pushed: no such branch or PR exists | Added `NeverMunaxaDocsProductionByTag` (Deny `*` where `aws:ResourceTag/Project = MunaxaDocs`) and `NeverTagAsMunaxaDocs` (Deny `*` where `aws:RequestTag/Project = MunaxaDocs`). Every Docs root sets `Project = MunaxaDocs` in `default_tags` (munaxa-docs `infra/terraform/{bootstrap,eu-prod/core,data,service}/providers.tf`). The shared stack tags `Project = munaxa` | **Fixed in code**, **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29; bootstrap test `the_deployer_never_reaches_docs_production_or_the_other_environment`, with a mutation check |
| P9 residual | Docs resources without the `Project` tag (ENIs that AWS creates for the ALB and tasks, anything created by hand) | Low | n/a | ENIs that AWS manages cannot be changed by a caller. Hand-made resources are unknown | **Open, verify.** A read-only tag inventory of the Docs VPC is needed. It was not possible because the AWS connector's sign-in had expired | — |
| **R-17** | One CI role and one deployer for `aws-nonprod`, the unreviewed `aws-nonprod-session`, and `aws-prod` | Medium | **Open** on main `fc393fc` (`aws_iam_role.ci` trusted all three environments, one deployer had both state prefixes) | `for_each` over `deploy_environments`. CI role `munaxa-shared-ci-<env>` trusts only its own environments' subjects plus `ref = main`. Deployer `munaxa-shared-deployer-<env>` is trusted only by its own CI role. State access is limited to `<env>/*`. The deployer is denied the other environment by `Environment` tag (resource and request) and by name (roles, secrets, buckets, RDS, cluster, log groups, state prefix) | **Fixed in code**, **merged** as `c41f08d` (head `7af38e0` pinned) | platform#29; bootstrap tests `one_ci_role_and_one_deployer_per_environment`, `…other_environment` |
| R-17 residual | Both environments share one workload boundary policy | Low | — | The boundary is only a ceiling. Each task role's own policy names its environment's resources | Accepted [R]. Split it before Production if Production shares the account | — |
| **P10** | The licence key policy lacks `kms:GetKeyRotationStatus`, so a refresh after the key policy is set would fail | Low | **Open** on `fc393fc` (`services.tf`, `AccountAdministersNotSigns`) | Added `kms:GetKeyRotationStatus` | **Fixed in code**, **merged** as `c41f08d` (head `7af38e0` pinned). It can only be confirmed at the first real plan after G3 | platform#29 |
| **P11** | Do the trusts' subject form `repo:munaxa@311481412/<repo>@<id>:environment:<env>` and the ids match what GitHub issues? | Low (it would fail closed) | Unverified | Checked the ids against the GitHub API (search): munaxa-platform 1318353961, identity 1354378376, control 1434295290, work 1318345640, school 1318345275, all equal to `bootstrap/variables.tf`. The owner id 311481412 equals munaxa-docs' bootstrap. The same form works today: munaxa-docs `terraform-eu-prod.yml` run [40456924209](https://github.com/munaxa/munaxa-docs/actions/runs/40456924209) (27 Oct) assumed its OIDC role with `repo:munaxa@311481412/munaxa-docs@1318346271:…` | **Partly verified.** Not verified: whether munaxa-platform and the product repositories issue the immutable form, which is a per-repository or organisation OIDC subject setting. My tools cannot read it. If the form is wrong, the trust refuses the call, so it fails closed | Owner: read `GET /repos/munaxa/<repo>/actions/oidc/customization/sub` (or the organisation's) before the first workflow run (B3) |
| **W4** | work-api serves its OpenAPI document (`OPENAPI_ENABLED` defaults to true) | Low | Open; fix on platform#27, unmerged | Reviewed #27 (`services.tf` `OPENAPI_ENABLED = "false"`; Work reads it in `packages/config/src/environment.ts:88` and `apps/api/src/main.ts:17`) | **Fixed in code**, **merged** as `329a8b9` (head `811acf9` pinned) | platform#27 |
| School first owner | No AWS path to seed School's first platform owner | Medium (ops gap) | Open; fix on platform#27 | Reviewed #27's `school-bootstrap` task. The paths exist in School (`prisma/seed.ts`, `apps/api/scripts/seed-platform-owner.ts`, `tsx` in `apps/api/package.json`, migrate stage `WORKDIR /repo/apps/api`). The one-run secret is required, so the script's development default password (`ChangeMe123!`) can never apply | **Fixed in code**, **merged** as `329a8b9` (head `811acf9` pinned) | platform#27 |
| **ADR-0008** | KMS asymmetric licence signing is implemented but the ADR says "Proposed" | Governance | Open (`docs/adr/0008-…` line 3, README index, three operations pages) | Marked Accepted with the owner's 30 Oct decision | **merged** as `a24c568` (head `f530170` pinned, checks green) | control#7 |

## 2. Identity (brief §3)

| Id | Finding | Severity | Status [V] | Accepted for Testing? | Must change before Production |
| --- | --- | --- | --- | --- | --- |
| I2 / R-06 / C5 / W5 | Identity issues one token with `aud = munaxa-work,munaxa-control` (`stack/services.tf` `IDENTITY_AUTH_AUDIENCE`). Work checks `munaxa-work` (`PLATFORM_AUTH_AUDIENCE`) and Control checks `munaxa-control` (`OPERATOR_AUTH_AUDIENCE`), so a token for either is valid at both | Medium | Unchanged in code [V] | **Yes** (TD-2). Testing has test data only, and Control's operator surface is also behind Cloudflare Access | Per-product audiences: Identity issues a token per audience (or a token exchange). This is Identity code, then the stack |
| I3 / C6 | `mfaSatisfied` is always `false` (`munaxa-identity apps/api/src/auth/auth.service.ts:159`), so Control runs `OPERATOR_REQUIRE_MFA=false` | Medium | Unchanged in code [V] | **Yes, only with** Cloudflare Access enforcing MFA on `operator-test.munaxa.com` (TD-3) | Identity issues a real MFA claim, and `OPERATOR_REQUIRE_MFA=true` |
| N-3 | `cloudflare-access.md` told the owner to create the Access policy with "one-time PIN" as an allowed login method and **no MFA requirement**, which contradicted TD-3 | Medium | Found in this pass [V] (`infra/aws/cloudflare-access.md` lines 33 to 35 at `fc393fc`) | — | Fixed in the doc on platform#29: Require "Authentication method: MFA"; one-time PIN alone does not count; confirm the rule matched in the Access logs before recording the AUD tag. **Not applied**, because Cloudflare is out of scope. The owner applies it at G6 |

## 3. Docs

| Id | Finding | Severity | Status now |
| --- | --- | --- | --- |
| R-07b / F-1 | `publish-images.yml` actions were pinned by tag while the job holds an ECR-push OIDC session | Medium | Fix (`a53852d`) is on docs#168, **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green) |
| docs#167 head fault | GitHub's PR head stayed at `6f0ea79` while the branch was at `a53852d`, so no pull_request checks ran on the real head [V: `list_pull_requests` head sha `6f0ea798…`, branch `a53852d` at 20:05 UTC] | Process | Bypassed: the same commits were pushed to a new branch and opened as docs#168, whose checks ran on `53c44b5`. #167: **closed without merge** (superseded by #168, comment posted; branch kept) |
| F-2 | Docs release digests (`f8a8bea`, 25 Oct) predate Control licensing (#162 to #166), and the image workflow would have failed to install `@munaxa/*` | Medium | Open. It needs a new `image/<sha>` release from main after #168, at G5. No image was published in this pass |
| F-3 | The platform's copy of Docs `01-roles.sql` could drift | Low | **Fixed in code on both sides:** Docs CI pins the sha256 (`a6cf9e96…`, docs#168). Platform CI checks the copy against its header hash (platform#29). Both hashes verified equal locally |

## 4. Other open findings carried over [C] unless marked [V]

| Id | Finding | Severity | Owner, status |
| --- | --- | --- | --- |
| **S-ROOT** | The AWS connector, when signed in, is signed in as **root** of `229251310592` | High (operational) | Tamer. Root stays the only AWS access until launch (decision of 29 Oct), but a root session should not sit in a tool. [R] Sign the connector in only for read-only checks, and sign out afterwards |
| C8 | munaxa-control `main` has no branch protection | Low | Tamer (GitHub settings). Not changeable with this pass's tools; control#7 merged with no ruleset gate, which is consistent with `main` still being unprotected. |
| N-2 | The deployer's `ec2:*`, `elasticloadbalancing:*`, `ecs:*`, `rds:*` on `*` would also reach **any other workload in the account** that is neither tagged `Project = MunaxaDocs` nor `Environment = <other env>`. The brief says canteenhub-prod must not be touched; I could not verify where canteenhub-prod lives | Medium if canteenhub-prod is in `229251310592`; otherwise none | Owner or the next pass: confirm which account holds canteenhub-prod (read only). If it is this account, add its tag to the deployer deny by PR **before G3** |
| R-05 / S4 | School Firebase sign-in is off on AWS | Medium, optional | TD-7, Tamer |
| R-15 / S9 | School mobile upload without Content-Length | Medium/Low, outside Testing | School |
| W3 | Work GHCR publish shares the `image/**` tag and has no protected environment | Low | Work, when Render retires (TD-10) |
| R-13 | No Terraform check on an empty operator allow-list | Info | Platform |

## 5. Actions explicitly not performed

No Terraform apply or plan against AWS. No AWS API call succeeded (the one read-only attempt failed
because the connector needs a new sign-in). No KMS, Secrets Manager, IAM, ECR, ECS, RDS, Cloudflare,
Render or Supabase change. No image publication, deployment or remote migration. No GitHub settings
change (branch protection, environments, variables). The old Docs infrastructure was not touched.
