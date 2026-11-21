# 02. Testing environment state

Observed 21 Nov 2026 04:23 to 04:24 UTC (07:23 to 07:24 Amman), eu-central-1.

## Database `munaxa-nonprod-pg` (`rds:DescribeDBInstances`, `rds:DescribeEvents`)

| Field | Value |
| --- | --- |
| Status | **stopped** |
| Class / storage | db.t4g.micro, 20 GB, encrypted |
| Publicly accessible | false |
| Multi-AZ | false |
| Deletion protection | true |
| Backup retention | 7 days |
| MasterUserSecret | active (KMS `45eda044…`) |
| LatestRestorableTime | 2026-11-21 00:44:45 UTC |
| AutomaticRestartTime | **2026-11-28 00:57:33 UTC** (03:57:33 Amman) |

Other DB instances: none. Aurora clusters: none.

Timeline (UTC, Amman in brackets), all **[V]** from RDS events and CloudTrail:

| Time | Event |
| --- | --- |
| 20 Nov 21:11:51 (00:11:51) | "DB instance is being started due to it exceeding the maximum allowed time being stopped" (predicted 21:07:07) |
| 20 Nov 21:14:57 (00:14:57) | DB instance started |
| 20 Nov 21:16:48 to 21:19:20 | automated backup |
| 20 Nov 21:26:28 (00:26:28) | Reset master credentials (rotation) |
| 21 Nov 00:51:11 (03:51:11) | `StopDBInstance` by `munaxa-shared-deployer-nonprod-session/gha-run-44846513554-db` |
| 21 Nov 00:57:33 (03:57:33) | DB instance stopped |

GitHub run 44846513554 is the scheduled `aws-session.yml` `down` (created 00:50:58 UTC, success,
at main `9fd0a3a`). It runs hours after its cron time, as seen before. The 21:00 UTC database
backstop ran before the automatic start and returned `InvalidDBInstanceState` (already stopped),
so it did not stop the database this time. The database ran for about 3 h 43 min.

KMS `CreateGrant`/`RetireGrant` and ENI events during start and stop came from RDS and EC2
service principals **[V]**.

## Compute and network

| Resource | API | Result |
| --- | --- | --- |
| ECS cluster `munaxa-nonprod` | `ecs:DescribeClusters`, `ListServices`, `ListTasks` | ACTIVE, 0 running, 0 pending, 0 services; only cluster |
| Load balancers | `elbv2:DescribeLoadBalancers` | none |
| NAT gateways | `ec2:DescribeNatGateways` | none (active) |
| Elastic IPs | `ec2:DescribeAddresses` | none |
| EC2 instances | `ec2:DescribeInstances` | none |
| ElastiCache | `elasticache:DescribeCacheClusters`, replication groups | none |
| VPC endpoints | `ec2:DescribeVpcEndpoints` | S3 gateway endpoint only |
| Network interfaces | `ec2:DescribeNetworkInterfaces` | 1, `RDSNetworkInterface` |

## Security groups (`ec2:DescribeSecurityGroups`), 7 in total

| Group | Ingress | Notes |
| --- | --- | --- |
| `munaxa-nonprod-alb` (`sg-063a81c72c7f3239f`) | tcp 80 and 443 from 0.0.0.0/0 | egress tcp 4001 only. **No network interface uses it** |
| `munaxa-nonprod-identity` | tcp 4001 from the ALB group only | |
| `munaxa-nonprod-database` | tcp 5432 from the db-admin, identity-migrate and identity groups only | |
| db-admin, identity-migrate | none | |
| 2 default groups | default | |

**Why the ALB group allows 80/443 from the internet.** It is the group Terraform attaches to the
public load balancer, which is created only while a Testing session is up (and removed by `down`
and cleanup). The group itself costs nothing and exposes nothing while no load balancer or other
network interface uses it: an empty security group accepts no traffic. When a session is up, the
load balancer must accept HTTPS from users, and port 80 only redirects to 443 (listener of type
`redirect`). Its egress is limited to the task port, tcp 4001 (Identity). Source:
`infra/aws/stack/edge.tf` (`aws_security_group.alb`, rule description "HTTP (redirected) from
the internet"). "No attachment" is direct evidence; the design intent comes from the Terraform
code. It is not a risk while idle.

## Result

**Idle.** Nothing billable is running except stopped-database storage and backups.
