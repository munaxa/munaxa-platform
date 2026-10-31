# 01 · munaxa-platform (shared AWS platform and Terraform): phase 2

Author: the lead orchestrator, working the platform workstream directly (no separate specialist
session was started in this pass).

## Verified facts [V]

- `main` was at `fc393fc` (#28) at the start of this pass. Open PRs: only #27 (head `8c2773b`, then
  `811acf9` after "Update branch").
- **P9 was not fixed on GitHub.** `infra/aws/bootstrap/iam.tf` at `fc393fc`: deployer `StackServices`
  allows `ec2:*` and `elasticloadbalancing:*` on `*`. `NeverMunaxaDocsOrBootstrap` denies only by
  name (`role/munaxa-docs/*`, `secret:munaxa-docs*`, `db:munaxa-docs*`, `cluster/munaxa-docs*`,
  `s3:::munaxa-docs*`). VPC, subnet, security group and ALB ARNs carry generated ids, so no name
  pattern matches them. There was no branch or PR with Agent 1's reported follow-up
  (`list_branches`: none besides the known thread branches; `list_pull_requests`: only #27).
- **R-17 was not fixed on GitHub.** One `aws_iam_role.ci` trusted `aws-nonprod`, `aws-nonprod-session`
  and `aws-prod`. One `aws_iam_role.deployer` read and wrote both `nonprod/*` and `prod/*` state.
- **P10 was open.** The licence key policy (`stack/services.tf`, `AccountAdministersNotSigns`) had no
  `kms:GetKeyRotationStatus`.
- **P11:** see SECURITY-FINDINGS §1. The repository ids match GitHub, and the subject form already
  works for munaxa-docs. Whether the platform and product repositories issue the immutable form is
  not readable with this pass's tools.
- **F-3:** the vendored `stack/scripts/docs-cluster-roles.sql` is byte-identical below its 4-line
  header to munaxa-docs `infra/sql/cluster/01-roles.sql` at `406eaee`. Both hash to `a6cf9e96…`.
- Docs production resources are tagged `Project = MunaxaDocs` by `default_tags` in every Docs root.
  The shared stack tags `Project = munaxa`, `Environment = nonprod|prod`, and declares **no data
  sources** (no `data "…"` block in `stack/*.tf`), so a tag deny cannot break a plan by reading Docs.
- The repository ruleset on `main` requires 3 status checks and an up-to-date branch. Merging #27
  first returned `405 Repository rule violations found: 3 of 3 required status checks are expected`
  until the branch was updated from `main`.

## Changes made

| PR | Branch / head | Contents |
| --- | --- | --- |
| [#27](https://github.com/munaxa/munaxa-platform/pull/27) (Agent 1's, from the first pass) | `claude/project-thread-qotnc6`, updated to `811acf9` | Reviewed: `OPENAPI_ENABLED = "false"` on work-api; `school-bootstrap` run-only task (execution role with the boundary, reads only the `school-migrate` bundle and the one-run secret, `kms:Decrypt` via Secrets Manager only); CONTRACT and README. Branch updated from main (no code change) |
| [#29](https://github.com/munaxa/munaxa-platform/pull/29) | `claude/project-thread-0f18qv`, `1cbd551` | R-17 per-environment CI and deployer roles; P9 tag denies; P10; F-3 CI check; the Testing budget; the Access MFA rule; `bootstrap/tests/bootstrap.tftest.hcl` (3 runs) wired into CI |

Files in #29: `.github/workflows/aws-terraform.yml`, `infra/aws/README.md`,
`infra/aws/bootstrap/{budget,iam,main,outputs,variables}.tf`, `infra/aws/bootstrap/tests/bootstrap.tftest.hcl`,
`infra/aws/cloudflare-access.md`, `infra/aws/stack/services.tf`.

Interface change for the owner at G2: the outputs `ci_role_arn` and `deployer_role_arn` become maps
`ci_role_arns` and `deployer_role_arns`. Set the nonprod ARNs as repository variables (the session
workflow reads them in a job-level `if`, where environment variables are not available), and the
prod ARNs as `aws-prod` environment variables. No workflow change was needed.

## Merged

- #27: **merged** as `329a8b9` (head `811acf9` pinned)
- #29: **merged** as `c41f08d` (head `7af38e0` pinned)

## Not merged

None

## Tests executed

| Test | Where | Result |
| --- | --- | --- |
| `terraform fmt -check -recursive infra/aws` | local, Terraform 1.16.5 | clean |
| `terraform validate` bootstrap, stack | local, aws provider 6.67.0 (the lock file's) from releases.hashicorp.com | both valid |
| `terraform test` stack | local | 14 passed, 0 failed (on main, and again with #29's changes) |
| `terraform test` bootstrap (new) | local | 3 passed, 0 failed |
| Mutation: rename the P9 deny sid | local | the bootstrap test fails, as it should |
| F-3 header-hash check | local | recorded = actual = `a6cf9e96…` |
| Prettier on the changed Markdown and workflow | local | clean |
| #27 CI on `811acf9` | GitHub | success on `811acf9`: Format/validate/mocked plan tests, Lint · Typecheck · Test · Build, Façades, Accessibility (runs 41120426983, 41120426980); Plan/Apply skipped (dispatch only) |
| #29 CI on its head | GitHub | success on `7af38e0`: Format, validate, mocked plan tests; Façades; Accessibility; Lint · Typecheck · Test · Build (runs 41146204039, 41146204027). Lint · Typecheck · Test · Build first failed on an unrelated timing test (`packages/platform/security` performance.test.ts:44, 0.1075 against a 0.1 limit; the same job passed on `1cbd551`), and passed on one re-run. Plan/Apply skipped (dispatch only) |

No Terraform plan against AWS was run. There are no credentials, and running one is out of scope.

## Outstanding blockers

- G2 (bootstrap apply as root) is unchanged and needs the owner. P11 subject-form read: owner, before B3.
- N-2: confirm whether canteenhub-prod lives in `229251310592`; if it does, add a deny for its tag before G3.
- P9 residual: a read-only tag inventory of the old Docs VPC once the AWS connector is signed in.

## Decisions still required

TD-7 (School Firebase) and TD-10 (Work GHCR). See DECISIONS-AND-CONFLICTS. TD-1, TD-4 and TD-5 are
settled by the brief or by #29.

## Actions explicitly not performed

No apply, no plan against AWS, no AWS call, no GitHub variables or environments created, no
budget created, no Cloudflare change.
