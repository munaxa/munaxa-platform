# Test commands and results

All results are at code commit **8f28a61** on `claude/project-thread-edtxfe` (base `origin/main`
68fa6f9). The commit that adds this report changes documentation only (the report folder, the
README index row and the first-session checklist), so no result below depends on it.

Every command ran offline. Terraform ran through a wrapper that removes every AWS credential source
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE` unset;
`AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` set to `/dev/null`; instance metadata
disabled), with `init -backend=false` and mocked providers in every test file. No plan ran against
a backend.

Tool versions: Python 3.13.18, Node v22.23.4, Terraform v1.16.5.

## 1. Results

| Suite | Command (from the repository root) | Result |
| --- | --- | --- |
| Connector scripts (C-8, C-8R, C-8v, C-16, C-24, E-1, H-20, sandbox rules) | `python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'` | **112 OK** (56 Option A, 38 E-1, 18 H-20) |
| Cleanup state machine (ASL simulator) | `python3 -I -m unittest discover -s infra/aws/stack/session-cleanup -p 'test_*.py'` | **30 OK** |
| Probe and loader | `node --test infra/aws/stack/supporting/identity-session-probe.test.mjs infra/aws/stack/scripts/identity-probe-loader.test.mjs` | **114 pass, 0 fail** (probe 73, loader 41) |
| Terraform format | `terraform fmt -check -recursive infra/aws` | OK |
| Stack | `cd infra/aws/stack && terraform init -backend=false && terraform validate && terraform test` | valid; **75 passed, 0 failed** |
| Bootstrap | `cd infra/aws/bootstrap && terraform init -backend=false && terraform validate && terraform test` | valid; **14 passed, 0 failed** |
| Prettier (changed JS, JSON, YAML) | `npx prettier --check infra/aws/stack/scripts/identity-probe-loader.mjs infra/aws/stack/scripts/identity-probe-loader.test.mjs infra/aws/stack/envs/nonprod.stage-e-tasks.json .github/workflows/aws-terraform.yml` | all four pass |

## 2. What the Terraform tests prove (plan intent, synthetic)

- Defaults change nothing: with `session_cleanup_enabled = false`, `testing_session_cleanup = false`
  and an empty probe pin, the stack and bootstrap plans equal main's (no cleanup, no probe task
  definition, no new IAM).
- Enabled, the stack plans **8 creates and 1 update** for the cleanup, and the bootstrap
  **2 updates and 2 creates** (nonprod boundary only; the prod boundary is unchanged).
- With a pinned probe, **1 create** (the probe task definition), in either mode; the throwaway mode
  renders two containers with the secrets, `dependsOn`, volume, user and mount modes of file 03.
- `stage-e-manifest.tftest.hcl` keeps `envs/nonprod.stage-e-tasks.json` equal to what Terraform
  renders for all five families (images, secrets, environment names, shape fields, commands,
  hashes, volumes). A deliberate mutation (a mount set to read-write) made it fail, then it was
  reverted.
- `session-cleanup.tftest.hcl` renders the state machine definition and asserts the exact-name
  filters, `ListSecrets`, and that no `??????` pattern remains (N-2).

## 3. Prettier note

`*.md` is in `.prettierignore`. CI's `pnpm format:check` will still report
`infra/aws/stack/supporting/identity-session-probe.mjs` and its test, because **main's version of
that file already fails the same check** (checked by running prettier on `git show
origin/main:…`). This branch did not reformat those two files, to keep the diff reviewable; the
other four changed non-Terraform files pass.

## 4. Not run, by design

No `terraform plan` against the S3 backend, no apply, no workflow dispatch, no connector script run
against AWS. The [U] items that only a real run settles are listed in file 08.
