# Phase 5: next execution plan

Date: 4 Nov 2026. Lead orchestrator. Labels: [V] verified, [E] estimated, [R] recommended, [U] unverified, [O] owner action required.

Each step needs the approval noted. Nothing here is authorized by Phase 5.

## Phase 6 (recommended): bootstrap re-apply and G3 apply, one sitting

| Step | What | Who | Approval | Stop condition |
| --- | --- | --- | --- | --- |
| 6.1 | Root re-applies `infra/aws/bootstrap` at main 46dfbd9 (platform#38) in CloudShell: `terraform init -reconfigure` (new backend `kms_key_id`), `plan`, review, `apply` | Owner (root), Claude prepares the runbook and checks outputs | **Separate approval** (IAM change to AWS) | The plan must be 19 to add and only in-place updates on the 4 expected addresses (nonprod boundary after its `moved`, the two deployer inline policies, `ci["nonprod"]` trust). Up to 8 changes may show: 2 budget artifacts and 2 identical deployer trust re-reads are harmless. Any destroy, replace or other address: stop |
| 6.2 | Same sitting: set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` as **environment** variables on `aws-nonprod-session`, using the new session role outputs | Owner (GitHub settings) | Part of 6.1 | Until set, the nightly session run cannot assume a role |
| 6.3 | Run `b2-owner-simulation.sh` (214 read-only `simulate-principal-policy` calls, all with `aws:RequestedRegion=eu-central-1`) | Owner (root, read-only) | Part of 6.1 | Any mismatch: stop, fix by PR, re-apply |
| 6.4 | Formally accept residuals R1 to R10, or confirm there are no untagged KMS keys, ACM certificates, Cloud Map resources or foreign security groups in eu-central-1 that matter | Owner | Decision | - |
| 6.5 | Fresh nonprod plan on main (lead dispatches; owner approves in `aws-nonprod`) | Lead + owner | Already covered by the Phase 5 style plan authorization | Must be exactly the 64 creates in `supporting/PROPOSED-nonprod.expected-changes.json`; any update, delete, replace, read failure or permission error: stop |
| 6.6 | G3 declaration PR: copy the proposed declaration into `infra/aws/stack/envs/nonprod.expected-changes.json` | Lead (code), owner approves | **G3 approval** | `check-plan-intent --validate` passes in CI |
| 6.7 | Dispatch `aws-terraform.yml` nonprod **apply** on main; the plan job must pass `--enforce`; the owner approves the apply job in `aws-nonprod` | Lead + owner | **G3 approval** | Enforce mismatch, plan older than 4 h, or commit mismatch: the job refuses |
| 6.8 | Immediately after: dispatch `aws-session.yml` **down** (stops the database the apply created running) | Lead | Part of G3 | The run must end with the database stopped |
| 6.9 | Within 72 h of 6.7: G6 Cloudflare DNS validation records for `*.test.munaxa.com` and `operator-test.munaxa.com` | Owner | **G6 approval** | ACM gives up after 72 h |
| 6.10 | Report: new dated folder under `docs/aws-migration/agent-reports/` plus an index line | Lead | Standing rule | - |

Estimated cost after G3 [E]: about US$8.64 to 11.14 a month idle for the stack, about US$14.34 a month for the account at idle including both bootstraps and the Docs final snapshot; about US$0.29 to 0.34 per Testing session hour; about 117 session hours a month fit under US$50 (range 90 to 134). See `04-COST-AND-BUDGET.md`.

## Before G5 and G7 (later phases)

- [R] Platform runbook and code gaps found by Agent 5 (`05-CROSS-PRODUCT-READINESS.md`):
  1. Control start order: a first services-off apply that sets `operator_access`, `identity_public_keys`, the Control operator organisation and subjects (from Identity bootstrap steps 1 to 3), `control_licence_public_key` and `control_licence_kid` (readable only once the licence key exists).
  2. Add Identity `seed-work-roles.mjs` to the identity-bootstrap overrides.
  3. `CONTROL_PLANE_TOKEN` in the Work, School and Docs bundles before their tasks start (Work requires at least 20 characters).
  4. Set `valkey_image` and `postgres_image` in `nonprod.tfvars`.
  5. CONTRACT.md: database URL hosts must be the RDS endpoint name (verification is on).
- [R] Agent 3 / Agent 6 follow-ups: move `TF_VAR_deployer_role_arn` to step-level `env` in `aws-session.yml` (N-2); make `from_alb` independent of `edge_enabled` so the session deployer needs no security-group writes (R10); narrow `SessionDiscoveryWithOwnTags` to `service/*`; KMS-encrypt the ops log group; per-environment boundary ARN in the stack before any prod plan; README G3 step 2 to say "read the job summary".
- [O] Branch and tag protection in identity, control, work and school, and a confirmed reviewer on `image-release` (before any image publish, G5).
- [O] Docs: a fresh image from main (the last one, f8a8bea of 25 Oct, predates CONTROL_PLANE licensing).
- [O] About 4 Dec 2026: decide the Docs final snapshot and its pending-deletion key. Keep the Docs bootstrap (new Docs pulls from its ECR repositories).

## Production

Out of scope. H-1 (shared boundary) is fixed in code by #38; it must be re-applied and simulated before any prod plan.
