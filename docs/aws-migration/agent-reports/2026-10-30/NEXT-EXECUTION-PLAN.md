# Next execution plan: AWS Testing

Recommended sequence after 30 Oct 2026. **[R]** throughout. Each phase says who acts and what gate
applies. "Code" steps fall under the standing merge rule; every step that touches AWS, Cloudflare,
secrets, images or GitHub settings waits for Tamer.

## Phase A: no infrastructure, can start now (all in parallel)

| #   | Task                                                                                                                                                                                                                                                                | Owner                            | Gate                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| A1  | Decide the US$50 scope (TD-1). If Testing only, Agent 1 changes `budget_limit_usd` or the budget filter by PR **before G2**, because the budget is in bootstrap                                                                                                     | Tamer, then Agent 1              | Decision                                                  |
| A2  | Press "Update branch" on docs#167; once GitHub shows head `a53852d` and the pull_request checks are green there, Agent 4 merges it                                                                                                                                  | Tamer, then Agent 4              | Standing merge rule                                       |
| A3  | Platform PR: `OPENAPI_ENABLED=false` on work-api (T13 / W4), in progress on [platform#27](https://github.com/munaxa/munaxa-platform/pull/27)                                                                                                                        | Agent 1                          | Standing merge rule                                       |
| A4  | Platform PR: a CI diff check for `docs-cluster-roles.sql` against Docs (F-3)                                                                                                                                                                                        | Agent 1                          | Standing merge rule                                       |
| A5  | Protect munaxa-control `main`                                                                                                                                                                                                                                       | Tamer                            | GitHub settings                                           |
| A6  | Mark ADR-0008 accepted (one-line doc PR after Tamer confirms)                                                                                                                                                                                                       | Tamer, then Agent 2              | Decision                                                  |
| A7  | Decide TD-4 (deployer reach over Docs Production, P9: Agent 7 says fix **before G3**), TD-5 (per-environment deployers, R-17: before Production), TD-7 (School Firebase), TD-10 (Work GHCR)                                                                         | Tamer                            | Decision                                                  |
| A8  | Platform PR adding a `school-bootstrap` run-only task for the first School owner (TD-8; in progress on [platform#27](https://github.com/munaxa/munaxa-platform/pull/27))                                                                                            | Agent 1                          | Standing merge rule; Tamer confirms P7                    |
| A9  | Re-audit `prod.tfvars` for the new Docs and storage resources                                                                                                                                                                                                       | Agent 1                          | Code review only                                          |
| A11 | Read-only check of the GitHub org and repo OIDC subject customisation (P11), and of the KMS licence key policy against `kms:GetKeyRotationStatus` (P10), **before G2** as Agent 7 recommends (L6)                                                                   | Tamer (GitHub settings), Agent 1 | Read only                                                 |
| A12 | Platform PR(s) for P9 (deny on `Project = MunaxaDocs` resources) and R-17 (per-environment CI and deployer roles), which Agent 1 reports as written but which were not on GitHub at 18:56 UTC; Agent 7 reviews; merge **before G2**, because both live in bootstrap | Agent 1, Agent 7                 | Standing merge rule; Tamer accepts the P9 residual (TD-4) |
| A10 | Sign in to the AWS connector again, then a read-only Pricing check to settle L2                                                                                                                                                                                     | Tamer, then Agent 7              | Read only                                                 |

A1 must finish before G2 if it changes the budget. A2 must finish before the Docs part of G5.
Everything else in Phase A is independent.

## Phase B: bootstrap and plan (sequential, owner gates)

| #   | Task                                                                                                                                                                                            | Owner   | Gate      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- |
| B1  | Apply `infra/aws/bootstrap` (a first apply: nothing exists yet, per Agent 1) as root in CloudShell (state, ECR, OIDC roles, boundary, budget)                                                   | Tamer   | **G2**    |
| B2  | Set `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN`, `AWS_IMAGE_PUBLISHER_ROLE_ARN`; create `aws-nonprod`, `aws-prod`, `aws-nonprod-session`, and `image-release` in each product repo               | Tamer   | G2        |
| B3  | Dispatch `aws-terraform.yml` `nonprod`/`plan`; record the addresses in `envs/nonprod.expected-changes.json` by PR; confirm **P10** (KMS `GetKeyRotationStatus`) and **P11** (OIDC subject form) | Agent 1 | Plan only |

## Phase C: persistent layer, secrets and images (partly parallel)

| #   | Task                                                                                                                                                                                         | Owner              | Gate          | Parallel with |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------- | ------------- |
| C1  | Apply the nonprod persistent layer (VPC, RDS, KMS, bundles, buckets, cluster, ACM)                                                                                                           | Tamer              | **G3**        | —             |
| C2  | ACM validation records in Cloudflare, DNS only                                                                                                                                               | Tamer              | **G6** part 1 | C3, C4        |
| C3  | Generate the Identity signing key; write Identity, migrate and DB URL values; pin `secret_version_ids` by PR                                                                                 | Tamer, Agent 1 PR  | **G4** part 1 | C2, C4        |
| C4  | Tag `image/<sha>` and approve `image-release` for Identity (`b97b3ab` or later), Control (`739be21`+), Work (`da84612`+), School (`54cf3eb`+), Docs (main after docs#167); set digests by PR | Tamer, agents' PRs | **G5**        | C2, C3        |
| C5  | Cloudflare Access application for `operator-test.munaxa.com` with an **MFA** policy; team domain and AUD into `operator_access` by PR                                                        | Tamer, Agent 1 PR  | **G6** part 2 | C2 to C4      |

## Phase D: first session (sequential, G7)

Follow [supporting/DEPLOYMENT-SEQUENCE.md](supporting/DEPLOYMENT-SEQUENCE.md) steps 8 to 16:

1. Session up; CNAMEs to the ALB (DNS only for `*.test`, proxied for `operator-test`).
2. `db-admin`, then `docs-db-admin`, then `identity-migrate`; Identity ready.
3. Create the one-run secret `munaxa-nonprod/identity-bootstrap`; run the Identity operator-org and
   Control-role steps; delete the secret **after** steps 2 and 3; restart Identity; set
   `control_operator_organisation_id` and `control_operator_subjects` by PR. Confirm the partial ARN
   resolves.
4. Export the KMS licence public key; set `control_licence_public_key` and `control_licence_kid` by PR;
   `control-migrate`; start control-api (watch for a restart loop, C9 and C10) and the portal; sign in
   through Access.
5. Issue `mxc_` credentials for Work, School and Docs; write them into the bundles (G4 part 2).
6. In parallel once step 5 is done: Work (`work-migrate`, first-tenant override, link the tenant in
   Control, grant `work:*`), School (`school-migrate`, then the `school-bootstrap` task from platform#27), Docs
   (`docs-provision`, then services; Resend domain verified for mail).
7. Run [supporting/TESTING-ACCEPTANCE.md](supporting/TESTING-ACCEPTANCE.md), including: a mixed-case
   `/API/v1/Admin/...` path refused, a second client not rate-limited by a first client's bad logins
   (I1), a School upload end to end, a Docs entitlement lookup against Control.
8. Session down.

## Before Production (not part of Testing)

- Per-product token audiences (TD-2) and an Identity MFA claim (TD-3).
- Separate deployer roles per environment, or a source-environment condition on the deployer trust (R-17 / TD-5), before G8.
- Decide G9 (retire Render, Supabase, the old Docs stack); then W3 and the School GHCR/Render path.
- Mobile receipt upload device test (R-15 / S9).
- Re-run `pnpm audit` and refresh action SHAs on a schedule (Agent 3).
- Turn on Control's hourly sweep schedule (created only for `prod`).

## Hard boundaries that stay in force

No Terraform apply, AWS write, KMS or secret change, image publication, deployment, remote migration,
Cloudflare, Render or Supabase change, or retirement happens without Tamer's explicit approval at the
gate named above. G9 stays closed.
