# 04. Tests and CI

All runs on 21 Nov 2026. "Local" means this session's container; "CI" means GitHub Actions on the
PR head.

## munaxa-platform (#154, head `8ccfec5` for code; the report commit follows)

| Check | Where | Result |
| --- | --- | --- |
| `terraform fmt -check -recursive` (infra/aws) | Local, Terraform 1.16.5 | Pass |
| `terraform validate` (stack) | Local | "The configuration is valid." |
| `terraform test` (stack, mocked provider, AWS provider 6.67.0 from the lock file via an offline mirror) | Local | **93 passed, 0 failed**, including the 3 new runs and `stage_e_task_definitions_match_the_manifest` |
| `test_session_cleanup_gate_workflow.py` (workflow structure, H-20 gate, new `OPERATOR_CIDRS` test) | Local, pytest | **21 passed**, 59 subtests |
| `OPERATOR_CIDRS` parsing (empty, spaces, one range, two ranges with spaces and a trailing comma) | Local, bash + jq | As designed: no `-var` when empty; JSON list otherwise |
| Prettier (changed Markdown and YAML) | Local | Clean |
| "Format, validate, mocked plan tests" (AWS Terraform workflow on PR) | CI run 44919504758 | **Success** |
| "Lint · Typecheck · Test · Build" | CI run 44919504766 | **Success** |
| "Accessibility · contrast and keyboard…" | CI run 44919504766 | **Success** |
| "Façades match the platform surface" | CI run 44919504766 | **Success** |
| Plan / Apply jobs | CI | Skipped (workflow_dispatch only), as designed |

ShellCheck: no shell script file was changed (the workflow's inline step was exercised directly
above). No Terraform plan or apply against AWS was run.

## munaxa-control (#14, head `a95dfa6`)

| Check | Where | Result |
| --- | --- | --- |
| `environment.spec.ts`, `access.spec.ts`, `middleware.spec.ts` | Local, isolated vitest 4.1.12 / zod 4.6.7 / next 15 (the `@munaxa/*` packages need a GitHub Packages token this container does not have) | **3 files, 47 tests passed** |
| Prettier (changed files) | Local | Clean |
| "Format · Lint · Typecheck · Test · Build" (full suite incl. e2e on PostgreSQL) | CI run 44918620776 | **Success** |
| "Build the images" | CI run 44918620776 | **Failure: D-SSL only.** Grype `--fail-on high` on `libssl3`/`libcrypto3`/`openssl` 3.5.9-r1 (CVE-2026-84786, -107493, -107494, -121482, -124709) in api, migrate and portal. The PR changes no Dockerfile or dependency. Required check, so the PR is **blocked**, not bypassed. Explained on the PR |

## munaxa-identity (#25, docs only)

| Check | Result |
| --- | --- |
| Prettier | Clean (local) |
| `verify` | **Success** (CI run 44919327473) |
| "Images (runtime and migrate)" | Failure, D-SSL only (not a required check: GitHub reported the PR `unstable`, not `blocked`) |
| Merge | **Squash-merged** `d6225ff` under the standing rule (required checks green, docs only, nothing deploys on merge) |

## Final reference search (after the changes)

Run over all six product repositories (agent reports excluded). Remaining matches are the optional
feature and documents that call it optional or historical (file 02 §4). No workflow in any
repository references a Cloudflare Access secret, variable or step.

## D-SSL re-check

| Source | Result |
| --- | --- |
| pkgs.alpinelinux.org `edge/main/x86_64/libssl3` | 3.5.9-r1, built 2026-11-11 |
| pkgs.alpinelinux.org `v3.22/main/x86_64/libssl3` | 3.5.9-r0, built 2026-09-30 |
| `dl-cdn.alpinelinux.org` APKINDEX | Not reachable from this container (proxy 403); the package site was read instead |
| Grype DB used by control#14 CI | built 2026-11-21 06:20 UTC; same 5 HIGH CVEs |
