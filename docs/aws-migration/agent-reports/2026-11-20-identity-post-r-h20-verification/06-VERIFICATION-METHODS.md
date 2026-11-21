# 06 Verification methods

## Access

- **AWS:** the AWS MCP connector, signed in as root of 229251310592 (the approved development access method, 8 Nov decision). Every script was read-only (Describe/List/Get/Lookup). The connector disconnected at about 16:47 UTC; the owner re-signed in at 17:31 UTC (CloudTrail ConsoleLogin 17:31:48).
- **GitHub:** read access to munaxa/munaxa-platform (git fetch and the Actions API).
- No local AWS credentials, no Terraform run, no secret value read.

## Timeline (UTC, Amman in brackets)

| Time | Step |
| --- | --- |
| 19 Nov 16:45 (19:45) | Owner brief received |
| 16:48 (19:48) | Repository checks; preparation note written; verification reminder set for 21:20 |
| 17:33 (20:33) | Live baseline (preparation note) |
| 21:00 (00:00, 20 Nov) | Backstops fired (observed afterwards in CloudTrail) |
| 21:05:22 (00:05:22) | Scheduled execution 1a6aff64 started; succeeded 21:05:23 |
| 21:21:30 (00:21:30) | Execution and history read; CloudTrail 11:00 to 21:21 and StartExecution since 18 Nov 20:00 |
| 21:22 (00:22) | IAM, secrets metadata, ACM, budgets, RDS, ECS, network, alarms |
| 21:23:10 (00:23:10) | CloudTrail 00:00 to 11:00; latest events after 21:06 |
| 21:25:53 (00:25:53) | Final re-query of non-read events 21:00 to 21:25:53, both regions. The same 12 regional events (11 backstop, 1 StartExecution) and only this connector's own calls in us-east-1. Newest delivered event 21:23:22 (lag about 2.5 min). Executions still 3, newest 1a6aff64 SUCCEEDED; RDS still stopped |

## Read-only calls used

| Service | Calls |
| --- | --- |
| STS | GetCallerIdentity |
| EventBridge Scheduler | GetSchedule, ListSchedules |
| Step Functions | DescribeStateMachine, ListExecutions, DescribeExecution, GetExecutionHistory |
| RDS | DescribeDBInstances, DescribeDBClusters, DescribeDBSnapshots |
| ECS | ListClusters, DescribeClusters, ListServices, ListTasks |
| ELBv2 | DescribeLoadBalancers |
| EC2 | DescribeNatGateways, DescribeAddresses, DescribeInstances, DescribeVpcEndpoints, DescribeVpcs, DescribeSecurityGroups, DescribeNetworkInterfaces |
| ElastiCache | DescribeCacheClusters |
| CloudWatch | DescribeAlarms |
| SNS | ListTopics, ListSubscriptionsByTopic |
| IAM | ListPolicies (Local), GetPolicyVersion, ListPolicyVersions, GetRole |
| Secrets Manager | ListSecrets (name filter `rds!`), DescribeSecret (metadata only, never GetSecretValue) |
| ACM | ListCertificates, DescribeCertificate |
| Budgets | DescribeBudgets |
| CloudTrail | LookupEvents (us-east-1 and eu-central-1; filters ReadOnly=false and EventName=StartExecution) |

## Reproducing the verification

Another engineer with read access can reproduce the verification with the AWS CLI:

```sh
aws stepfunctions list-executions --region eu-central-1 \
  --state-machine-arn arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup
aws stepfunctions describe-execution --region eu-central-1 --execution-arn \
  arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:1a6aff64-7cc7-48a0-bad9-043f5c61bd30
aws stepfunctions get-execution-history --region eu-central-1 --execution-arn <same ARN> \
  --query 'events[?type==`TaskScheduled`].taskScheduledEventDetails.resource'
aws cloudtrail lookup-events --region eu-central-1 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StartExecution \
  --start-time 2026-11-19T21:00:00Z --end-time 2026-11-19T21:10:00Z
aws cloudtrail lookup-events --region us-east-1 \
  --lookup-attributes AttributeKey=ReadOnly,AttributeValue=false \
  --start-time 2026-11-19T00:00:00Z
aws scheduler get-schedule --region eu-central-1 --name munaxa-nonprod-session-cleanup-daily
aws iam get-policy-version --policy-arn \
  arn:aws:iam::229251310592:policy/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session-read \
  --version-id v4
```

To compare a policy, normalise it with `norm.jq`: sort statements by Sid and the Action/Resource lists, then compare with the document rendered from `main`. See PR #141 file 01 for how `h20_expected.json` was rendered.

## Evidence files (owner's shared reports folder, not committed)

The folder `reports/2026-11-20-identity-post-r-h20-verification/` holds:

- `PREPARATION-NOTE.md`
- `evidence/execution-2105-raw.json`: executions, describe, full history.
- `evidence/state-2121-raw.json`: IAM documents, secret metadata, ACM, budgets, RDS, network, alarms.
- `evidence/h20_expected.json`
- `evidence/norm.jq`
- `evidence/cloudtrail-1138.json`

They contain ARNs and resource names but no secret values. They are kept out of the repository to keep the PR small.

## Limitations

- **No Terraform plan.** The plan writes a state lock and there are no local credentials. See 04 for the indirect evidence used instead.
- **CloudTrail delivery.** Coverage is complete up to about 21:23 UTC (the newest event delivered at the final query). An event between 21:23 and 21:26 could still be in delivery; nothing in this verification depends on that interval.
- **Budgets.** The budget figures depend on AWS billing data, which refreshes up to 3 times a day. They were unchanged since 08:56 UTC.
- **H-20 gate.** Evaluated by reading, not by running the gate script; condition 10 needs a live session.
- **RDS rotation.** Whether the rotation completes on a stopped instance can only be checked after 23:59:59 UTC 20 Nov.
