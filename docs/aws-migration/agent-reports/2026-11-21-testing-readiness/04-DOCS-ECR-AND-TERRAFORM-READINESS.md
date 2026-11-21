# 04. Docs ECR and Terraform readiness

**Offline plans only. Nothing was applied.**

## 1. Docs bootstrap: the real delta (correction to the pack)

The pack (`2026-11-21-deployment-acceleration-sprint/05`, item 4, repeated in the operator-access
pack) declared: "+1 ECR repository, +1 lifecycle policy, an in-place update of the image publisher
policy, 0 destroy". The repository says otherwise.

| Evidence | Detail |
| --- | --- |
| Code history | munaxa-docs `infra/terraform/bootstrap` changed since the last applied bootstrap code (a04723a, #141 "Move Production images from GHCR to Amazon ECR") in **one file only**: `ecr.tf`, line 13, `ecr_repositories` gains `"migrate"` (0515667, DC-01 #176). No later bootstrap change up to `main` f1fca8f [V, `git diff --stat`] |
| Where that list is used | `aws_ecr_repository.images` and `aws_ecr_lifecycle_policy.images` (for_each), and `local.ecr_repository_arns`, which feeds **three** policies: `aws_iam_role_policy.image_publisher`, `aws_iam_policy.image_publisher_boundary` (same document) and `aws_iam_policy.workload_boundary` (`locals.tf` line 41 → `policies/workload-boundary.json.tftpl` line 80, ECR pull for the Docs execution roles) [V, grep] |
| Offline Terraform plan | Terraform 1.16.5, hashicorp/aws 6.67.0 (the lock file's version). `terraform test` with the a04723a bootstrap applied into a shared state (`state_key`), then `main` planned against it. Real provider for the local `aws_iam_policy_document` data sources (fake keys, all checks skipped), every resource overridden: no AWS call. Result: **`Plan: 2 to add, 3 to change, 0 to destroy.`** [V, [supporting/docs-bootstrap-delta-offline-output.txt](supporting/docs-bootstrap-delta-offline-output.txt), test file [supporting/docs-bootstrap-delta-offline.tftest.hcl](supporting/docs-bootstrap-delta-offline.tftest.hcl)] |
| The three updates | Each `policy` diff is the single added line `arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-docs/migrate` [V, plan text] |
| New repository | `munaxa-docs/migrate`, `IMMUTABLE`, scan on push, AES256; lifecycle: untagged after 7 days, newest 20 `sha-*` kept [V] |

**Corrected declaration for item 4: 2 add (repository, lifecycle policy), 3 change in place
(publisher role policy, publisher boundary, workload boundary; each only adds the migrate ARN),
0 destroy, 0 replace.**

Can the plan touch unrelated resources? Only through drift in the live state (for example a
budget or trail changed in the console) or if the live bootstrap was last applied at a different
commit. The owner script below refuses both: it stops on any drift, on any summary other than
`2 to add, 3 to change, 0 to destroy`, on any address or attribute outside the five, and on any
policy change that is not exactly the addition of the migrate ARN.

A live read-only check (does the bootstrap state already hold the three other repositories?) was
attempted through the AWS connector at ~16:27 UTC and refused before any AWS call: the connector's
sign-in has expired. Nothing depends on it; the script verifies the same thing in the owner's run.

## 2. Who runs it: root

The Docs bootstrap is tagged `Environment=Production` and manages the GitHub OIDC provider,
CloudTrail, budgets and the Docs deployer role. `MunaxaEngineering` is denied all of that by
design (file 02), so this is on the root break-glass list (`OPERATOR-ACCESS.md` §2.2, updated).
This corrects the operator-access pack's "from a `MunaxaEngineering` CloudShell".

## 3. Owner plan script (plan only)

[supporting/docs-bootstrap-migrate-plan-owner-cloudshell.sh](supporting/docs-bootstrap-migrate-plan-owner-cloudshell.sh),
sha256 `1dc70ce4115e225e837991e155eff7567047e8d1eb6cd875e8d4da7712303845` (this commit). Built on
the reviewed H-20 plan script pattern (`2026-11-19-identity-h20-iam-bootstrap-plan`).

```bash
# AWS console as root → Region Frankfurt → CloudShell
curl -fsSLO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-21-testing-readiness/supporting/docs-bootstrap-migrate-plan-owner-cloudshell.sh
sha256sum docs-bootstrap-migrate-plan-owner-cloudshell.sh   # must be 1dc70ce4…3845
bash docs-bootstrap-migrate-plan-owner-cloudshell.sh f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad
```

What it checks: root, account, Region, no state lock; Terraform 1.16.5 by HashiCorp's SHA-256; the
pinned munaxa-docs commit and the reviewed `ecr.tf` blob; provider lock; budget addresses read
read-only from the live budgets (never printed; no private tfvars needed); a saved plan; the exact
five addresses, actions and attributes; the policy delta (tested offline against a correct and two
wrong synthetic plans: accepted, refused, refused). Ends with `DOCS BOOTSTRAP PLAN VERIFIED, NOT
APPLIED` and the one apply command, which needs a separate owner yes.

Expected: `Plan: 2 to add, 3 to change, 0 to destroy.` Rollback: re-apply the a04723a bootstrap
(the new repository is empty, so removing it loses nothing; the three policies lose the ARN).
Cost: US$0 until an image is pushed (ECR storage about US$0.10 per GB-month [E]).

Limits of this check: `bash -n` passes; the script has no fake-AWS test harness like the H-20
scripts (it never writes, and every check fails closed). shellcheck was not available locally.

## 4. Shared stack (munaxa-platform `infra/aws/stack`)

| Item | State on `main` d01dfa1 |
| --- | --- |
| Services | `edge_enabled = false`, `services_enabled = false`; `desired_counts`: identity 1, everything else 0 (counts apply only during a session) [V `envs/nonprod.tfvars`] |
| Docs (D-1) | `docs.tf` complete; not yet enabled (needs digests and bundle version ids, Apply 2). 42 creates in the 19 Nov offline plan; the Apply 2 PR restates the exact number from a fresh offline plan |
| Identity MFA | `identity_security_config.mfa_policy = "off"` until Apply 1 (file 01 §2) |
| Operator access | `operator_cidrs = []` (closed); `OPERATOR_CIDRS` supplied per session from the GitHub environment variable |
| Hard stop and cleanup | EventBridge Scheduler backstop `cron(0 21 * * ? *)` (stops RDS, scales services to 0); GitHub scheduled `down` at 19:17 and 01:47 UTC; H-20 gate (`up` refused unless the session hard stop and cleanup are armed); session cleanup state machine `munaxa-nonprod-session-cleanup` [V, `aws-session.yml`, `backstop.tf`, `session-cleanup.tf`] |
| RDS restart stop | Package ready (sprint file 06 and `supporting/rds-restart-stop-enablement.md` there), **off** (`rds_restart_stop_enabled` default false). Enabling = root bootstrap (2/2/0) + stack (8/1/0). Not enabled, not needed for Docs first; RDS restarts itself after 7 days and the evening backstop/schedule stops it again. Next automatic restart about 28 Nov |

## 5. Cost (estimates, not measured billing)

Carried from the sprint report (file 06) and re-checked against the Terraform switches above; no
pricing API was called. [E]

| State | Estimate | Main drivers |
| --- | --- | --- |
| Between sessions (everything stopped) | about US$6 a month | RDS storage while stopped, KMS keys (US$1 each a month), Secrets Manager (US$0.40 per secret a month), log storage, ECR storage |
| After Apply 1 and 2 | +about US$1 a month | Control licence KMS key |
| Docs session running | about US$0.15 to 0.30 an hour | ALB, Fargate tasks (identity, control-api, docs-api, docs-web, docs-scanner, Redis), RDS running |
| Always-on, four products | about US$171 a month | Not planned; Testing stays on-demand |
