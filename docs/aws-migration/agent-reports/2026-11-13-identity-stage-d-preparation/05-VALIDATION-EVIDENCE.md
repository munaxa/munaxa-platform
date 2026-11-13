# 05. Validation evidence

## Commit SHAs

| Item | SHA |
| --- | --- |
| main | `d4864b4` (infra identical to `b2d93aa`) |
| PR #121 head | `30de485` (parents `268eebe`, `d4864b4`) |
| Stage C revision 2 script | SHA-256 `e857c0447b8dc23b87a0b62b0472f53bac08eaf50f1022d0152e1bcd44508c70` (PR #125, `d4864b4`) |

## Commands (local, offline, no AWS)

| Command | Where | Result |
| --- | --- | --- |
| `terraform fmt -check -recursive` | `infra/aws` | pass |
| `terraform init -backend=false && terraform validate` | bootstrap, stack | valid |
| `terraform test` | bootstrap / stack / modules/service | 12/12, 67/67, 17/17 |
| `scripts/terraform/check-plan-intent.sh --validate` | nonprod, prod declarations | valid, 6 and 0 changes |
| `check-plan-intent.sh --enforce` on 4 synthetic plans | `supporting/check-plan-intent-enforce-synthetic-30de485.txt` | 1 pass, 3 refused as designed |
| mocked render, `3ca18ce` vs `268eebe` | `supporting/mocked-render-3ca18ce-vs-268eebe.txt` | only the pins move; migrate and bootstrap identical |
| reviewer's own mocked plan test + negative control | review copy, not committed | pass; control fails as intended |

## CI on `30de485`

| Check | Result |
| --- | --- |
| Format, validate, mocked plan tests | success (run 43499978183) |
| Lint · Typecheck · Test · Build | success (run 43499978256) |
| Façades match the platform surface | success |
| Plan / Apply jobs | skipped (pull request event, as designed) |

## AWS read-only evidence (AWS connector, root, about 20:15 UTC)

- `sts:GetCallerIdentity`: account 229251310592.
- `secretsmanager:DescribeSecret`, `ListSecretVersionIds` on `munaxa-nonprod/identity` and `DescribeSecret` on the RDS master secret (metadata only).
- `cloudtrail:LookupEvents` (Secrets Manager since 19:00; all writes since 12:00 UTC: only CloudShell session events, the stage C `PutSecretValue`, RDS rotation and auto-start events).
- `ecs:ListTaskDefinitionFamilies`, `DescribeTaskDefinition` (images, secret reference ARNs and environment variable **names** only), `ListClusters`.
- `rds:DescribeDBInstances`, `DescribeEvents`.
- `scheduler:ListSchedules`, `GetSchedule`; `acm:ListCertificates`, `DescribeCertificate`.
- `budgets:DescribeBudgets`, `DescribeNotificationsForBudget`, `DescribeBudgetActionsForAccount`; `ce:GetCostAndUsage` (`GetCostForecast` returned no data).
- GitHub: run 43396042072 job log (plan summary of the real 08:48 plan).

No `GetSecretValue`, no secret value, no plan file, no state file was read.

## Not performed

No merge of #121 or of any PR; no Terraform plan or apply against AWS; no workflow dispatch; no deployment, service or database start or stop; no migration; no secret create, rotate, update or delete; no IAM, security group, network, schedule, budget or account change; no MFA policy change; no production or management-account change; no safety check disabled. The only repository writes were the merge of `main` into the PR #121 branch (documentation only) and this report's branch.
