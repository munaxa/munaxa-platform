# 08. Remaining deployment gates and owner actions

Nothing here is requested now. This task does not ask for deployment authorization.

## Owner actions [O]

| # | Action | Why | Blocks |
| --- | --- | --- | --- |
| O-1 | **DONE 15:49 UTC.** Sign in to the AWS MCP connector again (claude.ai, Settings, Connectors), then send any message in the thread | it failed to connect (HTTP 502), then refused calls with "needs you to sign in again"; Stage R needs it | Stage R |
| O-2 | **Choose the stage C route**: M-1 (owner pastes one reviewed script in CloudShell, recommended) or M-3 (Claude through the connector, needs an explicit exception to the "no get-secret-value" rule) | adding a key to the JSON bundle needs a read-merge-write; `asm-exec` is unavailable (04 §2) | stage C |
| O-3 | Approve stage C (after Stage R) | secret write, irreversible in effect | P-5 completion |
| O-4 | Grant each `@munaxa` package **Read** access for munaxa-identity, munaxa-work and munaxa-control (package settings, "Manage Actions access") | the package-token hardening PRs identity#19, work#32, control#9 stay draft until then (thread "Secure package tokens and publish Identity images") | not this deployment; `PLATFORM_PACKAGES_TOKEN` removal |
| O-5 | Optional: make the identity CI job `Images (runtime and migrate)` a required check (CVE report 08) | keeps image checks mandatory | nothing |

## Deployment gates, in order

| Gate | State | Owner yes needed |
| --- | --- | --- |
| A. Platform 2.5.0 published | **done** (12 Nov) | — |
| B. Identity images from `2db6ed9` | **done** (13 Nov, scans clean) | — |
| R. Read-only prechecks (02, 02a) | **done**, 12/12 PASS | — |
| C. `MFA_ENCRYPTION_KEYS` bundle version (04) | not run | O-2, O-3 |
| P-5. Pin the stage C version in PR #121, re-run checks, review, merge | draft; everything else ready | merge under the standing rule once checks are green and the version is pinned |
| D. At-rest plan + apply (expected 6 changes, 06), post-apply plan "No changes" | not run. Also clears finding S-1 (scheduled `down` failing since 12 Nov) | yes: dispatch and `aws-nonprod` approval |
| E. Session: `up`, the `id.test` DNS update (owner, Cloudflare), db-admin and identity-migrate, Identity rollout, verification, `down` | not run. Also needs the throwaway-account MFA test helper (runbook 03 §13, a repository task not done yet) | yes: separate stage E approval |

## Known open items not blocking P-5

- **S-1 (Medium, operational):** scheduled Testing `down` fails at "Plan the switches" since platform#105; its database stop still works (01). Cleared by stage D.
- **Platform `main` CI:** red on a wall-clock bound in `@munaxa/rbac` `performance.test.ts` (7513 ms vs 7500 ms) on a documentation-only commit. Needs a separate fix (wider or no wall-clock bound); not part of this task.
- **S-2 (Low):** RDS master secret rotation fails while the database is stopped; check its stages before stage E (02a R-12).
- **S-3 (Low):** test certificate not auto-renewable while unused, valid to 22 May 2027 (02a R-10).
- **Budget:** the old `munaxa-account-monthly` $10 budget is at 96 % this month and will alert; the $50 budgets are the binding ones (02a R-11).
- **Old images:** `5277d71` and `5a5994f` stay in ECR; never deploy them.
- **Production MFA policy and key escrow:** separate decisions (04 §6, §7).
