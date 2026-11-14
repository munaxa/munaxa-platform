# 02. Current AWS state, read-only verification

**Result: NOT VERIFIED. The AWS connector refused every call, so no AWS API was read on 14 Nov.**

## What happened

| Time (UTC, 14 Nov) | Event |
| --- | --- |
| about 12:10 | First attempt (one script: `sts:GetCallerIdentity`, ECS, RDS, Secrets Manager metadata). Refused: "AWS_MCP needs you to sign in again". The owner was asked to sign in |
| about 12:16 | Second attempt, same refusal |
| 17:01 | Owner: "Aws reconnected". The claude.ai connector listing showed AWS MCP as connected; the session still got the same refusal on the full script and on a one-call `GetCallerIdentity` |
| 17:05 | Owner asked to disconnect and reconnect the connector |
| 20:30 | Owner: "check aws". One `GetCallerIdentity` call: same refusal |

- The very first step, verifying the active identity and account (`229251310592`), could not run. As the task requires, the work stopped there for AWS. No credential, access configuration or alternative route (CLI, copied keys, workflow dispatch) was used to get around it.
- **No AWS call of any kind succeeded or was attempted beyond the identity check.** Nothing was read, nothing was written.

## Checks that remain NOT VERIFIED

| Area | Intended read-only calls |
| --- | --- |
| Identity | `sts:GetCallerIdentity` (expect account `229251310592`) |
| A. ECS | `DescribeClusters`, `ListServices`, `ListTasks` (RUNNING, STOPPED), `ListTaskDefinitionFamilies`, `ListTaskDefinitions`, `DescribeTaskDefinition` for the four families (revision, image digest prefix, secret version ids, MFA and reset env) |
| B. RDS | `DescribeDBInstances` (status), `DescribeEvents` since 13 Nov 12:00 |
| C. Secrets Manager | `DescribeSecret` and `ListSecretVersionIds` (metadata only) for `munaxa-nonprod/identity` and `munaxa-nonprod/docs-migrate`; `ListSecrets` for names starting `munaxa-nonprod/identity`; the RDS master secret's rotation dates and stages. Never `GetSecretValue` |
| D. CloudTrail | `LookupEvents` with `ReadOnly=false` since 13 Nov 21:40, eu-central-1 and us-east-1; names, times, callers and error codes only |
| F. Budgets and alarms | `budgets:DescribeBudgets`, `cloudwatch:DescribeAlarms`, `acm:DescribeCertificate` |

The script is ready and only needs a working connector.

## Indirect evidence (GitHub only, not an AWS read by Claude)

These come from workflow logs that ran against the real account with the workflow's own roles. They are labelled **[G]** and are weaker than a direct read.

| Fact | Source | What it shows | What it does not show |
| --- | --- | --- | --- |
| The nonprod stack matches `main` `68fa6f9` with sessions off | scheduled run 43574175677, 14 Nov 08:06, "Plan the switches": `Plan: 0 to add, 0 to change, 0 to replace, 0 to destroy. No changes.` (same at 00:22, run 43533662116) | Terraform refreshed the live state and found no difference: the four revision 2 task definitions, the docs-migrate secret and the policy are as applied; no ECS service exists (services are off at rest) | one-off tasks started outside Terraform (RunTask); secret version labels; CloudTrail |
| Database stopped | the same run, "Stop the database": `database munaxa-nonprod-pg: stopped` at 08:06:44 | status at 08:06 UTC | status after 08:06 |
| No other workflow touched AWS | GitHub: no `aws-terraform.yml` dispatch after run 43513076111 (13 Nov 21:45); no `aws-session.yml` run after 08:06 on 14 Nov | no Terraform change and no session through the pipelines | console or connector actions by anyone |

## Stage D post-apply facts (13 Nov, already verified directly)

The read-only checks made at 21:46–21:48 UTC on 13 Nov (stage D report 06) remain the latest direct AWS evidence: four revision 2 task definitions with the 2db6ed9 digests and bundle `80914756…`, revision 1 still ACTIVE, docs-migrate container without a version, exactly six CloudTrail writes, 0 services, 0 tasks, database stopped.
