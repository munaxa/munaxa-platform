# Blockers and owner actions: Munaxa AWS Testing

Agent 7 (independent reviewer), 30 Oct 2026, 14:10 UTC. Inputs: owner reports agent2 to agent6,
`agent7-independent-review.md`, and GitHub state checked at 14:05 UTC. Agent 1 (platform) filed no report. `SHARED-CONTRACT.md` landed at 14:01 UTC (Agent 1). It designs Docs into the stack (`stack/docs.tf`), the School and Docs buckets with S3 endpoint admission, and pull-only access to the `munaxa-docs/*` repos. **No munaxa-platform PR implements it yet** (checked 14:10 UTC), so those items stay open until a PR lands and is reviewed. Live AWS was not checked because
the AWS connector's sign-in has expired.

Nothing in this file has been done. Every item below changes AWS, Cloudflare, GitHub settings or
secrets, so each one waits for Tamer.

## Blockers

| ID | Blocks | What | Who decides or fixes |
| -- | ------ | ---- | -------------------- |
| B1 | Docs on Testing | **Resolved in code** by platform#26 (`stack/docs.tf`). Docs still needs a fresh image from main (G5). Also, the workload boundary and the deployer explicitly deny `munaxa-docs*` secrets and `munaxa-docs/*` ECR, which are the repos Agent 4 wants to reuse. Docs also needs a DB-per-tenant admin task with `CREATEDB`. | The contract chose pull-only access to the existing repos. The boundary must change to allow that, and the reviewer checks the change when the PR lands. |
| B2 | The US$50 target (the contract §10 confirms it is for the whole account) | The old Docs stack costs about US$47.8 a month idle (29 Oct evidence) in the same account. Testing adds about US$11 a month idle and about US$0.30 per session hour with Docs. That gives about US$71 a month at 40 session hours. | **Tamer:** does US$50 cover Testing only, or the whole account? Retiring the old stack is G9 and stays closed. |
| B3 | School uploads | **Resolved in code:** school#21 and #23 plus platform#26 (bucket, task role, env, endpoint). | done |
| B4 | Platform work as a whole | **Resolved:** platform#26 merged as `c4a1ad0` (Docs stack, buckets, S3 endpoint, boundary pull-only, licence key `prevent_destroy`, Identity `TRUST_PROXY_HOPS`, budget, Control public-path allow list, identity-bootstrap task). Reviewed by Agent 7 at each commit. Its open items are B1, B3, R-04 (licence key `prevent_destroy`), `TRUST_PROXY_HOPS=1` for Identity, `OPENAPI_ENABLED=false` for Work, and a budget alert. | Agent 1 |
| B5 | Control release job | **Resolved:** control#6 merged as `739be21` (portal downloads carry the Access token; migrate runs pnpm offline). | done |

## The four owner gates on the path to Testing

These come from munaxa-platform `infra/aws/README.md`. G1 is decided (account 229251310592,
eu-central-1, testing hostnames, KMS, Cloudflare Access), and G3 and G7 are workflow approvals that
follow these four. The reviewer reads the kickoff's "four owner gates" as these four.

| Gate | Owner action | Prerequisite |
| ---- | ------------ | ------------ |
| **G2** | Apply `bootstrap/` as root in CloudShell (state bucket, ECR, OIDC roles, boundary). Set repo variables `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN`, `AWS_IMAGE_PUBLISHER_ROLE_ARN`. Create GitHub environments `aws-nonprod`, `aws-prod` (reviewer), `aws-nonprod-session` (main only), and `image-release` in each product repo. | B1 decision first, because the boundary is in bootstrap |
| **G4** | Write secret values into each bundle (console or CloudShell, never chat or git), then pin `secret_version_ids` by PR | G3 applied; Identity signing key generated; Control credentials issued after Control runs |
| **G5** | Push `image/<sha>` tags and approve `image-release` for Identity, Control, Work, School and Docs, then set digests by PR | G2; control#6, school#21, docs#167 merged first |
| **G6** | Cloudflare: ACM validation records, DNS-only CNAMEs for `*.test` hosts, and the Access application for `operator-test.munaxa.com` with an MFA-backed policy | G3 (certificate exists); first session (ALB name) |

**G9 (retire Render, Supabase and the old Docs stack) stays CLOSED.** Nothing here proposes it.

## Other owner actions

- Sign in to the AWS connector again on claude.ai so live cost and resource checks can resume.
- **Tamer: protect `main` on munaxa-control** (GitHub branch protection; Agent 2 C8 found `protected: false`). Every other review assumes merges go through PRs with required checks.
- **Identity operator organisation and Control roles** (identity#3, `docs/runbooks/aws.md`, "Operator
  organisation and Control roles"). After `identity-migrate`, run each step as `identity_owner`
  (`DIRECT_DATABASE_URL` = the `identity-migrate` bundle's URL), from `apps/api` in the runtime image:
  1. `bootstrap-account.mjs --organisation munaxa-group --organisation-name "Munaxa Group"` creates the
     operator org and first operator, and prints `organisation` and `sub`.
  2. `seed-control-roles.mjs --organisation munaxa-group` creates `control-operator-admin` and
     `control-operator-viewer`, and prints `OPERATOR_ORGANISATION_ID`. It is idempotent.
  3. Repeat step 1 with `--role control-operator-admin` (or `-viewer`) for each operator.
  4. Restart the `identity` service, because roles are cached.
  5. Set `control_operator_organisation_id` and `control_operator_subjects` by PR, then apply.
  Seed in the operator organisation only, never in a customer org. Also grant `work:*` roles for Work users.
  **Reviewer caution (R-16):** step 1 takes `IDENTITY_OWNER_PASSWORD` as an environment variable. Do not
  pass it as an ECS run-task container override, because overrides are visible in `DescribeTasks` and
  CloudTrail. Feed it from a one-run secret bundle (as `docs-provision` does), then delete the bundle.
- Optional: put Firebase keys in the `school-api` bundle only if Firebase login must be tested.

## Platform notes sent to Agent 1

- **ALB path matching is case-sensitive (Control C4).** Rule 10 refuses `/api/v1/admin/*` on the public
  `control-api` host, but `/API/v1/Admin/...` passes the ALB, because Express routing ignores case. Nothing is exposed:
  the API still requires the Access JWT, Identity token, org, allow-list and permission. Defence in depth only (T15, Low).
  Testing acceptance checks that a mixed-case path gets 401 from the API.

## Task ledger

See `AWS-EXECUTION-BACKLOG.md` for the complete ledger. Open PRs as of 14:05 UTC:

| PR | State | Review |
| -- | ----- | ------ |
| school#21 storage via task role | **merged** `c6ddd5a` | Reviewed by Agent 7, no blocking issue |
| school#22 R-07 pins, R-10 SVG as attachment | merged | Verified on main |
| school#23 SSE header not signed | merged `54cf3eb` | Reviewed, no hold |
| identity#3 operator roles, pins, stray files | merged `594003f` | R-16 raised on its runbook |
| control#6 Access header on downloads, offline pnpm | **merged** `739be21` | Reviewed by Agent 7, sound |
| docs#167 packages token in publish | open | Not yet reviewed |
| work#27 pin actions by SHA (R-07) | merged | Verified on main |
