# 02 AWS resource verification

The current checks ran at 19 Nov 2026 21:21:30 to 21:23:10 UTC (00:21 to 00:23 Amman, 20 Nov). They used read-only API calls through the AWS MCP connector, signed in as root. The pre-run baseline at 17:33 UTC (20:33 Amman) is in the preparation note and agrees with every row below.

| Resource | Expected | Observed | Source | Result |
| --- | --- | --- | --- | --- |
| RDS `munaxa-nonprod-pg` | stopped | `stopped`; db.t4g.micro, 20 GB, encrypted, not public, single-AZ, deletion protection on, backup retention 7 days | `rds:DescribeDBInstances` | PASS |
| Other RDS instances / Aurora clusters | none | none (1 instance in total, 0 clusters) | `DescribeDBInstances`, `DescribeDBClusters` | PASS |
| RDS snapshots | unchanged | 2 automated snapshots (6 Nov 16:13 and 13 Nov 16:31 UTC), no new snapshot; latest restorable time 13 Nov 20:55 UTC (the instance has been stopped since then) | `DescribeDBSnapshots` | PASS |
| ECS cluster `munaxa-nonprod` | ACTIVE, 0 services, 0 tasks | ACTIVE; 0 active services, 0 running tasks, 0 pending tasks; `ListServices` 0, `ListTasks` 0 | `ecs:DescribeClusters`, `ListServices`, `ListTasks` | PASS |
| Application/network load balancers | none | none | `elbv2:DescribeLoadBalancers` | PASS |
| NAT gateways | none | none | `ec2:DescribeNatGateways` | PASS |
| Elastic IPs | none | 0 | `ec2:DescribeAddresses` | PASS |
| EC2 instances | none | 0 reservations | `ec2:DescribeInstances` | PASS |
| ElastiCache | none (Testing uses a sidecar) | 0 clusters | `elasticache:DescribeCacheClusters` | PASS |
| VPC endpoints | S3 gateway only | 1: `com.amazonaws.eu-central-1.s3`, available (a gateway endpoint, no hourly charge) | `ec2:DescribeVpcEndpoints` | PASS |
| Network interfaces | RDS only | 1: `RDSNetworkInterface`, available | `ec2:DescribeNetworkInterfaces` | PASS |
| VPCs | Testing VPC and the default VPC | 2 | `ec2:DescribeVpcs` | PASS |
| Security groups | unchanged | 7 groups. The only internet ingress is `munaxa-nonprod-alb` on 80 and 443. No load balancer exists, so nothing is reachable. No security group write appears in CloudTrail since 00:00 UTC 19 Nov | `ec2:DescribeSecurityGroups`, CloudTrail | WARNING (by design, unchanged; see note) |
| Public-facing endpoints | none | no load balancer, no EIP, no instance, database not public | as above | PASS |
| Session operator secret | absent | absent (the R output `secret: absent`; no secret was created per CloudTrail) | execution output, CloudTrail | PASS |

## Note on the ALB security group

`munaxa-nonprod-alb` permits ingress from 0.0.0.0/0 on ports 80 and 443. This is part of the Config A1 design: the security group is created once, and the session load balancer attaches to it. With no load balancer present, the rule exposes nothing and costs nothing.

It is recorded as WARNING only so that it is visible. It is not a new finding, and no change is proposed.

## Cost view

At the time of the check, the only billable Testing resources were:

- stopped RDS storage: 20 GB gp3 plus 2 automated snapshots;
- the alarms and the schedules;
- the secrets.

These are the same as before R. Nothing is running.
