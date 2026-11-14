# 07. Validation evidence

## Sources read

| Source | What |
| --- | --- |
| PR #128 (head `61c909d` before, `9578664` after) | all seven files of `2026-11-13-identity-stage-d-execution/`, the index row, the description |
| PR #121 | merged `68fa6f9` from reviewed head `30de485` (stage D report 01) |
| Run 43509702203 | plan job success, apply job skipped (stage D report 02) |
| Run 43513076111 | plan job `--enforce` 6, saved plan applied (stage D report 06) |
| PRs #126, #127 | stage C execution and stage D preparation reports (not merged) |
| `aws-session.yml` runs 43396042072, 43533662116, 43574175677 | jobs, step conclusions, the "Testing down" job logs (plan summary, apply line, stop line) |
| `aws-terraform.yml` dispatches | none after 43513076111 |
| platform `main` `68fa6f9` | `envs/nonprod.tfvars`, `identity-probe.tf`, `variables.tf` (`identity_probe_source`), `aws-session.yml` ("Start the database" only on `up`), the 11 Nov checklist, the 11 Nov operator runbook, runbook 03 (12 Nov), the Option A draft scripts |
| Identity `main` `2db6ed9` | `password-recovery.controller.ts` (disabled → 404), `health.controller.ts`, `packages/config/src/environment.ts` (`mfaKeyIssues`, production refusal) |

## AWS

`sts:GetCallerIdentity` and the 02 script were refused by the connector ("needs you to sign in again") at about 12:10, 12:16, 17:0x and 20:3x UTC. No AWS response was received. Nothing in this report is presented as a 14 Nov AWS read.

## Labels

**[V]** verified directly; **[G]** from GitHub workflow logs (AWS seen through the workflow's own roles); **NOT VERIFIED** not read; **[E]** estimate.

## Documentation checks

A local checker (Python, run with `-I`) on all files of this folder, the stage D folder and the index:

- table rows have the same number of columns as their header;
- code fences are closed; files end with a newline;
- relative links resolve;
- no sensitive pattern: AWS access key ids, private-key headers, database URLs with a password, `SecretString`, `aws_secret_access_key`, the operator email.

Result: 0 problems (stage D folder, 8 files, before commit `9578664`; this folder, 8 files, 0 problems before commit).

`*.md` files are excluded from the repository's Prettier check (`.prettierignore`), so `pnpm format:check` does not cover them.

## Consistency checks

- 00 of the stage D folder, the PR #128 description, 06 of the stage D folder and the index row all say: applied and verified 13 Nov 21:45 UTC; nothing running; stage E next.
- No file in either folder says an Identity service or task is running. "Registered" and "ACTIVE revision" are used only for task definitions.
- No secret value, key material, token, password or email appears.
