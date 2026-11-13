# 01. Merge verification (decision M)

The owner authorized the merge at 21:18 UTC.

## Before the merge (checked at 21:19 UTC) [V]

| Check | Result |
| --- | --- |
| State | open, draft, not merged; `mergeable_state` clean |
| Head | `30de48542f3c16653d30a6d4fa891ca215e10ad2` (reviewed head, unchanged); base `d4864b4` = main |
| Scope | exactly `infra/aws/stack/envs/nonprod.tfvars` and `infra/aws/stack/envs/nonprod.expected-changes.json` |
| Pin | `secret_version_ids.identity = "80914756-68cd-420d-8094-0fd49afe3492"` (line 102); `identity-migrate = "a3cc6622-…"` |
| Images | api `@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b`, migrate `@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874` |
| MFA | `mfa_primary_kid = "mfa-nonprod-2026-11"`, `mfa_policy = "off"` |
| Declaration | `nonprod.expected-changes.json` SHA-256 `05aafdae…ce33b81`, identical at `3ca18ce`, `268eebe` and `30de485` (six changes, unchanged) |
| CI | Format, validate, mocked plan tests: success. Lint · Typecheck · Test · Build: success. Accessibility: success. Façades: success. Plan and Apply jobs: skipped (pull request event) |
| Reviews | no review threads and no comments; independent review APPROVE (stage D preparation report 01) |

## Merge

- The PR was marked ready for review; only the title's "do not merge" marker was removed.
- Squash merge with `expectedHeadSha = 30de485`; the repository allows squash merges only.
- Merge commit **`68fa6f93fd55c2480f3a8e6e486b5957539eaafa`**, 21:19 UTC.

## After the merge [V]

| Check | Result |
| --- | --- |
| main | `68fa6f9` (parent `d4864b4`) |
| Tree | `git diff 30de485 68fa6f9` is empty: main is exactly the reviewed configuration |
| Workflow | `.github/workflows/aws-terraform.yml` identical to the reviewed one (SHA-256 `a44ab304…`) |
| Backend | `envs/nonprod.backend.hcl`: bucket `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate` |
