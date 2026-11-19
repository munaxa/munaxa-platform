# 03 IAM and CloudTrail verification

## Live IAM policies (21:22 UTC, 00:22 Amman)

These were read with `iam:ListPolicies` (Scope Local) and `GetPolicyVersion` on each default version.

| Policy | Default | Versions stored | Last update (UTC) | Same as 11:29 UTC table |
| --- | --- | --- | --- | --- |
| munaxa-shared-deployer-nonprod-session-read | **v4** | 4 | 19 Nov 11:28:43 | yes |
| munaxa-shared-deployer-prod-allow | v3 | 3 | 6 Nov 16:03:11 | yes |
| munaxa-shared-deployer-prod-allow-tagged | v1 | 1 | 5 Nov 05:12:52 | yes |
| munaxa-shared-workload-boundary-prod | v2 | 2 | 5 Nov 09:55:28 | yes |
| munaxa-shared-deployer-read | v1 | 1 | 5 Nov 05:12:52 | yes |
| munaxa-shared-workload-boundary | v4 | 4 | 16 Nov 12:40:33 | yes |
| munaxa-shared-deployer-nonprod-allow | v3 | 3 | 6 Nov 16:03:11 | yes |
| munaxa-shared-deployer-nonprod-allow-tagged | v1 | 1 | 5 Nov 05:12:52 | yes |
| munaxa-shared-deployer-nonprod-session-cleanup | v1 | 1 | 16 Nov 12:40:33 | yes |

The 13 legacy `munaxa-docs-eu-prod-*` policies are unchanged since 21 to 22 Oct; they all date from the retired Docs eu-prod setup.

## Content check against the approved code

Each live default document was normalised with `norm.jq`, which sorts statements by Sid and sorts the action and resource lists. The result was compared with `h20_expected.json`, which was rendered from `main` at `0f06836` for the H-20 plan review (PR #141). That file has sha256 `c6e6941e…d023`, and `norm.jq` has `c8d3aacd…a9f3`.

| Live policy | Expected key | Statements | Result |
| --- | --- | --- | --- |
| nonprod-session-read v4 | `session_read_after` | 6 / 6 | identical |
| workload-boundary v4 | `boundary` | 18 / 18 | identical |
| nonprod-session-cleanup v1 | `cleanup` | 4 / 4 | identical |

The session-read document is 1,798 characters, which is the value the plan predicted.

The live GateSessionCleanup statement is:

```json
{"Sid":"GateSessionCleanup","Effect":"Allow",
 "Action":["states:DescribeExecution","states:ListExecutions"],
 "Resource":["arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*",
             "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"]}
```

- It has only the two read actions.
- It names only the one Testing state machine and its executions.
- It has no wildcard service and no write action.

No production policy changed: prod-allow, prod-allow-tagged and workload-boundary-prod keep their November versions.

Historical reference: the plan sha256 `11173079…6f09` and the 0/1/0 result on `aws_iam_policy.deployer_session_read["nonprod"]` were taken from PR #141 files 05 and 06. The live checks above confirm them independently.

## CloudTrail

### Windows searched

`LookupEvents` with `ReadOnly=false` was run in us-east-1, where IAM, sign-in and AWS MCP events are recorded, and in eu-central-1, for all regional services:

| Window (UTC) | Amman | Query time (UTC) |
| --- | --- | --- |
| 19 Nov 00:00 to 11:00 | 03:00 to 14:00 | 21:23:10 |
| 19 Nov 11:00 to 21:21:30 | 14:00 to 00:21:30 | 21:21:30 |
| 18 Nov 20:00 to 19 Nov 21:21 (StartExecution only) | 18 Nov 23:00 to 20 Nov 00:21 | 21:21:30 |

A final re-query of 21:00 to 21:25:53 UTC is recorded in 06.

### IAM writes

There was exactly one IAM write:

| Field | Value |
| --- | --- |
| Event | `CreatePolicyVersion` |
| Event ID | `1857c2ff-7e65-403d-bde7-780279247e04` |
| Time | 19 Nov 11:28:43 UTC (14:28:43 Amman) |
| Actor | `arn:aws:iam::229251310592:root`, user agent "AWS Internal" (owner CloudShell) |
| Policy | `arn:aws:iam::229251310592:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read` |
| Result | v4, default |

There was no `CreateRole`, `UpdateAssumeRolePolicy`, `PutRolePermissionsBoundary`, `DeleteRolePermissionsBoundary`, `AttachRolePolicy`, `PutRolePolicy`, `CreateAccessKey`, `CreateUser` or `SetDefaultPolicyVersion` event anywhere in the windows.

The live trust policy of the backstop role allows only `scheduler.amazonaws.com`, with `aws:SourceAccount` set to 229251310592.

### Every non-read event 00:00 to 21:21 UTC, 19 Nov

| Time (UTC) | Who | What | Expected? |
| --- | --- | --- | --- |
| 03:40 to 03:43 | root (owner, console and CloudShell) | ConsoleLogin, CloudShell sessions, `sns:Subscribe` (D-B5) | yes (approved D-B5) |
| 03:45:34 | root via AWS MCP | `states:StartExecution` dry-run-idle-20261119T0345 | yes (approved D-B4) |
| 08:56 to 08:57, 11:08, 11:29, 11:38, 17:32 | root via AWS MCP | `CallReadWriteTool` (this connector's read-only scripts; AWS logs every `run_script` call under this name) | yes |
| 10:09 to 10:11 | root (owner) | ConsoleLogin, CloudShell sessions (H-20 plan run) | yes |
| 11:27 to 11:28 | root (owner) | ConsoleLogin, CloudShell sessions, the IAM write above (H-20 apply) | yes (approved 11:08) |
| 17:31:48 | root (owner, iPhone) | ConsoleLogin (connector re-sign-in) | yes |
| 21:00:04 to 21:00:49 | backstop role via Scheduler | 10× `ecs:UpdateService` (ServiceNotFound), 1× `rds:StopDBInstance` (InvalidDBInstanceState) | yes (daily backstops, no effect) |
| 21:05:22 | backstop role via Scheduler | `states:StartExecution` 1a6aff64-… | yes (R) |

The cleanup role (`munaxa-nonprod-session-cleanup`) made no non-read call: its 14 calls, listed in 01, are reads.

After 21:06 UTC, the only events are AWS service activity, all read-only: Resource Explorer indexing, ECR lifecycle `PolicyExecutionEvent`s and CloudTrail bucket ACL checks.

### Delivery delay

CloudTrail usually delivers within about 5 minutes and can take up to about 15. At 21:23 UTC, the newest event found was 21:16:13, so delivery covered up to about 7 minutes before the query. The 21:05 run, and the backstops before it, were fully covered (18 to 23 minutes old). The final re-query at 21:25:53 UTC (see 06) found the newest event at 21:23:22 and no new non-read event.
