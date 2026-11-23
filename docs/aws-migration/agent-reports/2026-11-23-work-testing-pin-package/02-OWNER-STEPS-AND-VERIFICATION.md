# 02. Owner steps and verification

Each **[O]** step is a separate owner approval under the platform's existing rules. Claude verifies
with the read-only connector (`MunaxaReadOnly`) and the public GitHub API only. Claude never reads a
secret value or applies anything.

| # | Who | Step | Claude verifies after it |
| --- | --- | --- | --- |
| W-1 | **[O]** | Choose the MW-001 scan basis: wait for OpenSSL 3.5.10 (work#35 merged), or decide D-SSL-W (file 01 §4) | The decision is recorded in the thread |
| W-2 | Repository | Merge munaxa-work MW-009, so `publish-images-ecr.yml` refuses a commit without a green `CI` push run on `main` | The `source` job of the next release shows "CI is green for <sha>" |
| W-3 | **[O]** | Create the tag `image/<40-hex sha>` on a `main` commit whose `CI` push run is green, then approve `image-release` for the run | The run succeeded. Three digests come from the Push step summaries. ECR `DescribeImages`: tags `<short>` and `sha-<full>` only, no `latest`. The scan basis from the logs is the permanent gate or D-SSL-W |
| W-4 | **[O]** | In AWS CloudShell, eu-central-1: check `sha256sum work-testing-secrets.sh` is `183e5723e80cde3949496cf05bb58883b3542fc8713c2becdc99600805723a02` (main at d2e6fcf), run `/bin/bash -p ./work-testing-secrets.sh bundles` and type `FILL`. Press Enter for `CONTROL_PLANE_TOKEN` (marked placeholder) until Control has issued Work's credential. Then run `status` | The script printed the two version ids, and the owner pastes only those ids. `DescribeSecret` / `ListSecretVersionIds` (metadata): exactly one version per bundle, `AWSCURRENT` |
| W-5 | Claude | Pin PR from file 01 with the real digests and ids | CI green, declaration valid, mocked plan 28 + 1 |
| W-5a | **[O]** | Merge the pin PR | `main` head |
| W-6 | **[O]** | Dispatch `aws-terraform.yml` → `plan`, `nonprod`, with the session down | The plan job states "The plan matches the declared changes exactly (29 resource action(s))". The count is 28 to add, 0 to change, 1 to replace, 0 to destroy. There is no Terraform warning, and no `aws_ecs_service` or `aws_lb*` address |
| W-7 | **[O]** | Dispatch `apply` (the plan runs again in `--enforce`), and approve the `aws-nonprod` gate after Claude has checked the plan | See "After the apply" below |

## After the apply (read-only) [V when done]

| Check | Expected |
| --- | --- |
| `ecs:ListTaskDefinitionFamilies` prefix `munaxa-nonprod-work` | `munaxa-nonprod-work-api`, `-work-admin`, `-work-migrate`, revision 1 each |
| `ecs:DescribeTaskDefinition` for each | Image `…@sha256:<digest>` equals tfvars. Each `secrets[].valueFrom` ends with `::<pinned version id>`. work-api environment has `LICENSING_MODE=CONTROL_PLANE`, `OPENAPI_ENABLED=false`, and `PLATFORM_AUTH_ISSUER=https://id.test.munaxa.com` |
| `munaxa-nonprod-db-admin` | A new revision whose secrets include `WORK_APP_URL` and `WORK_OWNER_URL` at the two pinned versions |
| `ecs:ListServices` / `ListTasks` (cluster `munaxa-nonprod`) | 0 / 0 |
| `rds:DescribeDBInstances` `munaxa-nonprod-pg` | `stopped` |
| `elasticloadbalancing:DescribeLoadBalancers` | none |
| E-1 `discover` (if #166 merged and the family unpended) | `PASS`, with `munaxa-nonprod-work-migrate` among the families |

## What comes after (not part of MW-002)

The next session follows `AWS_TESTING_READINESS.md` steps 6 to 10 of the audit:

- `up` with Identity, Control and Work.
- db-admin.
- `work-migrate` through E-1 (exit 0).
- Identity roles and accounts.
- `bootstrap-tenant-dry-run`, then `bootstrap-tenant` through E-1 (MW-005).
- Control deployment and credential, then `replace-key CONTROL_PLANE_TOKEN` and a work-api-only pin
  PR (1 replacement).
- Smoke test, then `down`.
