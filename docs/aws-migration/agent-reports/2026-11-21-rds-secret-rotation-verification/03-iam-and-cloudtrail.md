# 03. IAM and CloudTrail

Observed 21 Nov 2026 04:23 to 04:24 UTC (07:23 to 07:24 Amman).

## IAM (`iam:GetAccountSummary`, `ListUsers`, `ListRoles`, `ListPolicies`, `GetPolicyVersion`)

| Check | Result |
| --- | --- |
| IAM users | **0** |
| AccountAccessKeysPresent (root) | **0** |
| AccountMFAEnabled | 1 |
| Roles | 28 |
| Customer managed policies | 22 |
| 9 shared `munaxa-shared` policies | unchanged; `session-read` at **v4**, created 19 Nov 11:28:43 UTC (the H-20 apply) |
| 13 Docs policies | latest change 22 Oct 2026 |

## Policy comparison against the reviewed H-20 set

The live default versions of the nonprod boundary (18 statements), the session cleanup policy
(4 statements) and the session-read policy (6 statements) were normalized (sorted actions,
resources and statements, single values as lists) and compared with `h20_expected.json` from the
20 Nov report (`2026-11-20-identity-post-r-h20-verification/evidence/`).

Result: **all three MATCH** **[V]**.

Scope: this proves those three policy documents equal the reviewed text. It does **not** prove
that all infrastructure matches Terraform, and it is **not** a Terraform plan (none was run, so
the S3 backend lock was never touched).

## CloudTrail write events since 19 Nov 21:25 UTC (`cloudtrail:LookupEvents`, `ReadOnly=false`)

**us-east-1 (global services):**

- `ConsoleLogin` by root from an iPhone: 20 Nov 09:15 and 09:17, 21 Nov 04:20 and 04:22 UTC
  (owner sign-ins for the connector).
- `CallReadWriteTool` events: the connector's own calls (the tool wrapper is classed as write;
  the underlying calls were reads).
- **No IAM write.**

**eu-central-1:**

- Secrets Manager rotation events (file 01), by the RDS service.
- 21:00 UTC backstops: 10 `UpdateService` (`ServiceNotFound`) and 1 `StopDBInstance`
  (`InvalidDBInstanceState`), by the backstop role through EventBridge Scheduler.
- Cleanup R `StartExecution` and its reads (file 04).
- RDS automatic start side effects: KMS grants, ENI create/attach, by AWS service principals.
- `StopDBInstance` 21 Nov 00:51:11 by the GitHub scheduled `down` session.
- **No write by the connector identity, no IAM, security group, schedule, budget or secret change.**

## CloudTrail lag

The newest delivered event at query time (04:23 UTC) was 04:20:55 UTC. Events from the last few
minutes before the query may not yet have been visible (CloudTrail typically delivers within
about 5 to 15 minutes). Events from before 04:08 UTC can be considered complete.

## Direct, indirect, inferred

- Direct: IAM counts, policy versions and documents, CloudTrail events listed.
- Indirect: "no prohibited writes" relies on CloudTrail completeness up to the lag above.
- Inferred: `CallReadWriteTool` entries are connector reads (consistent with the scripts run,
  which used only Describe/List/Get-metadata/Lookup calls).
