# Security findings and remediation: phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Ids are unchanged from phase 2
([`../2026-10-30-phase2/SECURITY-FINDINGS-AND-REMEDIATION.md`](../2026-10-30-phase2/SECURITY-FINDINGS-AND-REMEDIATION.md)).
No finding is marked resolved without the evidence in its row. **No critical finding is open.**

## 1. AWS access (brief §5A)

| Item | Finding | Label |
| --- | --- | --- |
| Connector state | At 04:2x UTC a read-only `sts:GetCallerIdentity` returned "needs you to sign in again". When signed in, it is **root** of 229251310592 (phase 2, project memory) | [V] sign-in state; [V, earlier phases] root |
| Use this phase | **No AWS call was made.** Even after a sign-in, the connector would be root, and the brief allows root only for read-only checks; with no session, none were possible | [V] |
| Non-root identity available? | **None.** By the owner's decision of 29 Oct there is no IAM user, no Identity Center and no access key until launch. Root also cannot call `sts:AssumeRole` (phase 1 finding F1), so no role can be assumed from the root session | [V] decision record; F1 [V, 29 Oct] |
| What a non-root operator identity needs [O] | Any of these is an IAM or account-security change and needs Tamer's explicit approval, and each departs from the 29 Oct decision: (a) **IAM Identity Center** in the management account, a user for Tamer with MFA, and a permission set (read-only for checks; a scoped one for bootstrap applies). (b) An **IAM user** with console access only (no keys), MFA, and a role it assumes. Phase 0 drafted the permission sets (`/mnt/project-files/aws-foundation/proposed-2026-10-29/iam/`). Until one exists: Tamer runs G2 as root in CloudShell (the design), signs the connector out, and the lead does no AWS reads | [O] |
| S-ROOT | A root session in a tool is the highest-impact credential in the account | **High (operational), open.** [R] Keep the connector signed out; G2's read-only checks are in CloudShell (G2-BOOTSTRAP-READINESS §3 step 1) |

## 2. GitHub OIDC subject (P11, brief §5B): **verified**

Method: a temporary workflow (`oidc-subject-probe.yml`, on a push to this phase's branch only)
requested an OIDC token for the audience `munaxa-oidc-subject-probe` (which no AWS trust accepts),
masked it, and printed only the decoded claims. No AWS call, no environment, no secret. The probe
commits were removed from every branch right after (each branch reset to its `main`).

| Repository | Probe run / job | `sub` GitHub issued | Trust in bootstrap | Match |
| --- | --- | --- | --- | --- |
| munaxa-platform | [41168348185](https://github.com/munaxa/munaxa-platform/actions/runs/41168348185) / 124440682760 | `repo:munaxa@311481412/munaxa-platform@1318353961:ref:…` | `repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-*` | **Yes** [V] |
| munaxa-identity | [41168351504](https://github.com/munaxa/munaxa-identity/actions/runs/41168351504) / 124440692446 | `repo:munaxa@311481412/munaxa-identity@1354378376:…` | `…/munaxa-identity@1354378376:environment:image-release` | **Yes** [V] |
| munaxa-control | [41168353163](https://github.com/munaxa/munaxa-control/actions/runs/41168353163) / 124440697729 | `repo:munaxa@311481412/munaxa-control@1434295290:…` | `…/munaxa-control@1434295290:…` | **Yes** [V] |
| munaxa-work | [41168355717](https://github.com/munaxa/munaxa-work/actions/runs/41168355717) / 124440705460 | `repo:munaxa@311481412/munaxa-work@1318345640:…` | `…/munaxa-work@1318345640:…` | **Yes** [V] |
| munaxa-school | [41168358457](https://github.com/munaxa/munaxa-school/actions/runs/41168358457) / 124440713907 | `repo:munaxa@311481412/munaxa-school@1318345275:…` | `…/munaxa-school@1318345275:…` | **Yes** [V] |
| munaxa-docs | not probed | Docs' own trust, `repo:munaxa@311481412/munaxa-docs@1318346271:environment:production`, assumed successfully in run [40456924209](https://github.com/munaxa/munaxa-docs/actions/runs/40456924209) | Not in the shared bootstrap (Docs has its own) | **Yes** [V, phase 2] |

- `repository_owner_id` = 311481412 and each `repository_id` equal `bootstrap/variables.tf` [V].
- The probe could not show the `:environment:<name>` suffix: a job naming an environment would
  create it, which the brief forbids. The suffix is GitHub's documented form and is what Docs'
  role matches in production [V, Docs].
- `GET /repos/…/actions/oidc/customization/sub` is refused by this session's proxy (403) [V], so the
  setting itself was not read; the issued tokens are the stronger evidence.
- Nothing in the trusts was changed or widened.

## 3. Findings by gate (brief §5D)

### Must resolve before G2

| Id | Finding | Severity | Status | Evidence |
| --- | --- | --- | --- | --- |
| P11 | Subject form | Low | **Resolved [V]** | §2 |
| N-2 | Deployer's account-wide reach over other workloads' **tagged** resources | Medium | **Fixed in code**: platform#31 (`NeverAnotherProjectByTag`, `NeverTagForAnotherProject`), test + mutation check. Merge state: MASTER-EXECUTION-STATUS | platform#31 |
| G2 README count | Runbook said "about 46" resources; the configuration has 49 | Low (process) | **Fixed** in platform#31 | §4 of G2-BOOTSTRAP-READINESS |
| G2 environment order | A job naming a missing environment creates it unprotected; the session schedule starts once `AWS_CI_ROLE_ARN` is set | Low | **Documented** in README G2 step 4 (platform#31); owner follows the order [O] | |
| S-ROOT | Root session in the connector | High (operational) | **Open, mitigated for G2**: G2 is run by the owner in CloudShell, not through the connector; the lead used no AWS access | §1 |

### Must resolve before G3 (first deployer write)

| Id | Finding | Severity | Required action |
| --- | --- | --- | --- |
| P9 / N-2 residual | Resources **without** a `Project` tag are not covered by any tag deny. For Docs Production that is hand-made or AWS-managed resources; for the rest of the account, anything untagged | Medium (until shown otherwise) | [O] Read-only, owner in CloudShell: tag inventory **of the old Docs VPC only** (`aws ec2 describe-security-groups/subnets/route-tables/network-interfaces --filters Name=vpc-id,Values=<docs vpc>`; ALB, target groups, listeners via `elbv2 describe-tags`) and confirm `Project = MunaxaDocs` on everything not AWS-managed. For workloads that are not Munaxa's, the brief rules out identifying them; the owner confirms that every non-Munaxa resource in 229251310592 carries a `Project` tag, or approves a positive (allow-list) tag condition on the deployer's mutating actions, which needs a real plan to validate [R] |
| P10 | `kms:GetKeyRotationStatus` on the licence key policy | Low | Fixed in code (`stack/services.tf:230`) [V]; confirm at the first plan after the key exists |
| C8 | munaxa-control `main` has no branch protection | Low | [O] GitHub settings (TD-9). control#7 merged with no ruleset gate |
| Live P9 check | Simulation of the deployer against `Project = MunaxaDocs` | — | G2 step 4 (`simulate-principal-policy` expects `explicitDeny`) |

### Can safely remain open during Testing

| Id | Finding | Severity | Why acceptable |
| --- | --- | --- | --- |
| I2 / R-06 | One Identity token for both audiences | Medium | Testing data only; Control's operator surface also behind Cloudflare Access (TD-2) |
| I3 / C6 | `mfaSatisfied` always false | Medium | Access policy requires MFA (`infra/aws/cloudflare-access.md:35-40` [V]); applied by the owner at G6 |
| R-17 residual | One workload boundary for both environments | Low | Ceiling only; task-role policies name their own environment |
| R-05, R-15 | School Firebase off; mobile upload without Content-Length | Medium/Low | Optional / outside Testing (TD-7) |
| W3 | Work GHCR publish on `image/**` without a protected environment | Low | Retires with Render (TD-10) |
| R-13 | No check on an empty operator allow-list | Info | Operator host refused (rule 39) when empty |
| CI flake | `@munaxa/rbac` and `@munaxa/security` timing tests fail intermittently on hosted runners (main run 41147461520) | Low (process) | Not security; see MASTER-EXECUTION-STATUS |

### Production-only requirements

TD-2 per-product audiences; TD-3 real MFA claim and `OPERATOR_REQUIRE_MFA=true`; a split workload
boundary if Production shares the account; a non-root operator identity (Identity Center, post-launch
hardening by the 29 Oct decision); security monitoring (deferred by the brief).

## 4. Verification of the merged fixes the brief named (brief §4)

| Claim | Where | Label |
| --- | --- | --- |
| P9 denies old Docs Production by name **and** by `Project = MunaxaDocs` tag (resource and request) | `bootstrap/iam.tf` `NeverMunaxaDocsOrBootstrap`, `NeverMunaxaDocsProductionByTag`, `NeverTagAsMunaxaDocs`; Docs roots tag `Project = MunaxaDocs` | [V] code; [U] live tags |
| R-17 separates nonprod and prod CI/deployer roles | `for_each` roles; trusts; state prefix; tag and name denies; test | [V] |
| P10 includes `kms:GetKeyRotationStatus` | `stack/services.tf:230` | [V] |
| Work API OpenAPI disabled on AWS | `stack/services.tf:536` `OPENAPI_ENABLED = "false"` | [V] |
| School bootstrap task | `stack/ops.tf:298-369`: migrate image, `school_owner`, secret `munaxa-<env>/school-bootstrap-??????` required, stack test checks registration | [V] |
| Docs publishing: package token and pinned actions | munaxa-docs `publish-images.yml:152,606` `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN`; every `uses:` pinned to a 40-hex SHA (grep finds none unpinned) | [V] |
| F-3 hash check on both sides | Docs `ci.yml:103` `sha256sum --check --strict`; platform `aws-terraform.yml` header-hash step; both `a6cf9e9625715074b8ce4a6e76b5f30240f20b2db6a711d4128bb25b21989968`; body of the platform copy byte-identical to Docs' file | [V] |
| Cloudflare Access instructions require MFA | `infra/aws/cloudflare-access.md:35-40` ("Require … Authentication method: MFA"; OTP alone does not count) | [V] |

## 5. Actions not performed

No AWS call. No Terraform apply or AWS plan. No KMS key, secret, IAM, ECR, budget or other AWS change.
No GitHub environment, variable or setting change. No image published, no deployment, no remote
migration. No Cloudflare, Render or Supabase change. Old Docs untouched. No CanteenHub repository,
resource or configuration accessed, and no attempt to find where it is hosted.
