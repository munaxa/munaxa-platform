# 01. Repository and state baseline

## 1. Commit

- `main` = `9752146f48f56972c72fd1808ce240300c2f1196` (PR #129, 15 Nov 10:38 UTC), a clean
  detached checkout, full history (not shallow).
- Ancestors verified: `2f6d443` (#130), `ac0ae60` (#131), `3ea00f9` (#132), `09b44ac` (#133).

## 2. Bootstrap root

| Item | Value (from source) |
| --- | --- |
| Backend | S3 `munaxa-shared-tfstate-229251310592`, key `bootstrap/terraform.tfstate`, `eu-central-1`, `encrypt = true`, KMS `alias/munaxa-shared-tfstate`, `use_lockfile = true` |
| Terraform | `required_version ~> 1.16.5`; release 1.16.5 linux_amd64 SHA-256 `2bc2fcff…aab5e4`, checked again today against HashiCorp's published `terraform_1.16.5_SHA256SUMS` |
| Provider | `hashicorp/aws` 6.67.0, lock hash `h1:EB9ixYOZrSlYD7wtJxf88qwoyyWrlKDKxhzaCLIb3t4=` (unchanged since the 6 Nov apply) |
| Provider config | `region = var.region` (`eu-central-1`), `allowed_account_ids = [229251310592]` |
| Variable | `testing_session_cleanup`, bool, **default `false`** (`variables.tf:96`) |

## 3. What changed since the last bootstrap apply

The last bootstrap apply was the owner's stage B2 run on 6 Nov 2026 at `9e45133` (0 added,
2 changed; post-apply plan clean; 68 resources in state; report
`2026-11-06-g3-recovery-execution`). `git log` shows exactly one later commit touching
`infra/aws/bootstrap`: `2f6d443` (#130). Files: `iam.tf`, `iam_session.tf`,
`iam_session_cleanup.tf` (new), `tests/bootstrap.tftest.hcl`, `variables.tf`.

Every change is behind `testing_session_cleanup`:

| Resource | Gate | Change when true |
| --- | --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` | `each.key == "nonprod" && var.testing_session_cleanup` | 2 statements appended: `TestingSessionCleanup`, `TestingSessionCleanupLookups` |
| `aws_iam_policy.deployer_session_read["nonprod"]` | `dynamic` block, same condition | 1 statement appended: `RefreshSessionCleanup` |
| `aws_iam_policy.deployer_session_cleanup[0]` | `count`, `local.session_cleanup_deployer` | created |
| `aws_iam_role_policy_attachment.deployer_session_cleanup[0]` | same | created, on `aws_iam_role.deployer["nonprod"]` |

With the flag false, the rendered policies equal the 6 Nov code (offline render, file 03), so a
plan without the flag shows no change.

## 4. Matches the approved report

The addresses, actions and statements equal `2026-11-15-identity-stage-e-owner-decisions/04` §1
and `2026-11-14-identity-stage-e-blockers-remediation/02` §7. No contradiction found.

## 5. State, drift, locks, imports (what can and cannot be known here)

- Not readable from this session: the AWS connector refused with a sign-in error, and the session
  has no AWS credentials. So state, live policies and locks are checked by the owner script before
  the plan (file 02 §3, steps 1, 4, 5):
  - no `bootstrap/terraform.tfstate.tflock`;
  - 68 resources in state;
  - the live nonprod boundary and session-read policies equal the code without the flag
    (statement by statement, normalized), which would reveal drift;
  - `munaxa-shared-deployer-nonprod-session-cleanup` does not already exist (else an import, not a
    create, would be needed);
  - the nonprod deployer has fewer than 10 managed policies (code: 3 today, 4 after).
- No provider change, no import, no state move is needed by the source.

## 6. Scheduled shutdown after the merges (operational risk)

- The `AWS Testing session` workflow last ran at 08:28 UTC on 15 Nov (scheduled `down`, success,
  on `68fa6f9`), before #131 and #132 merged. No run after the merges exists yet (checked
  19:52 UTC; schedules `17 19` and `47 1` UTC, which GitHub starts hours late).
- `aws-session.yml` refuses any plan with changes beyond the session switches. `main` now plans 12
  nonprod changes (#131 and #132), so the next `down` is expected to fail at its switch-plan step,
  while its separate `Stop the database` job still runs. The AWS backstop (21:00 UTC) and the
  database stop are unaffected. Nothing is running (last verified 14 Nov 20:40).
- This clears only after D-B2 and then the D-B3/D-PIN nonprod apply.
