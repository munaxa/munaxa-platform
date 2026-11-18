# Addendum: live read-only AWS check (18 Nov 2026, about 12:43 UTC)

The owner reconnected the AWS connector at 12:41 UTC and asked for the check. Claude ran read-only
calls only, as root of 229251310592 in eu-central-1. It read no secret value and made no write.

| Item | Live result | Meaning |
| --- | --- | --- |
| Account | 229251310592 | correct account |
| State machine `munaxa-nonprod-session-cleanup` | `ACTIVE`, `STANDARD`, created 18 Nov 08:34:03 UTC (the D-B3 apply) | D-B3 is live |
| Executions | **0** | no dry run, no real run, nothing has started the cleanup yet |
| Schedule R `munaxa-nonprod-session-cleanup-daily` | `ENABLED`, `cron(5 21 * * ? *)` UTC, input `{"dryRun":false}` | first real run due 18 Nov 21:05 UTC |
| Alarm `-failed` | `OK` since 08:35 UTC, actions enabled | no failed execution |
| Alarm `-not-run` | **`ALARM` since 09:19 UTC**, actions enabled | expected: no success yet; it should clear after R succeeds |
| SNS topic `munaxa-nonprod-session-cleanup-alerts` | 0 confirmed, 0 pending, 0 deleted, 0 subscriptions | D-B5 not done; alarms mail nobody yet. The D-B5 precheck conditions hold |
| ECS cluster `munaxa-nonprod` | 0 services, 0 tasks | nothing running |
| Load balancer `munaxa-nonprod` | `LoadBalancerNotFound` | no session ALB, no ALB cost |
| RDS `munaxa-nonprod-pg` | `stopped` | database stopped |
| Policy `/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read` | default `v2`, updated 16 Nov 12:40:33 UTC (the D-B2 apply); `RefreshSessionCleanup` = `cloudwatch:ListTagsForResource`, `sns:GetTopicAttributes`, `sns:ListTagsForResource`, `states:DescribeStateMachine`, `states:ListTagsForResource` | equals the D-B2 code (no drift) and **lacks `states:ListStateMachineVersions`**: confirms the cause in file 03 and the fix in PR #137 |

**Status changes from this addendum:**

- Live AWS check: was BLOCKED, now **VERIFIED** for the items above.
- D-B2R: cause **VERIFIED live**. The D-B2R plan script's drift check should pass on this policy.
- H-20: still **BLOCKED** (0 executions; first real success can only be R at 21:05 UTC).
- D-B5 and D-B4: still PREPARED — OWNER ACTION REQUIRED; their prechecks' idle and empty-topic conditions currently hold.
