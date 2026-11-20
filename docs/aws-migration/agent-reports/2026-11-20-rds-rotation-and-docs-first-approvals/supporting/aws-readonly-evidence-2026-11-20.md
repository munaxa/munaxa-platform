# Read-only AWS evidence, 20 Nov 2026 about 18:22 to 18:45 UTC

Caller `arn:aws:iam::229251310592:root` (root connector, approved development access, read-only calls only). No secret value was read.

| Call | Result |
| --- | --- |
| `rds DescribeDBInstances munaxa-test-pg` | DBInstanceNotFound |
| `rds DescribeDBInstances` (all) | 1 instance: `munaxa-nonprod-pg`, stopped, AutomaticRestartTime 2026-11-20T21:07:07.262Z, db.t4g.micro, postgres 16.13, master secret `rds!db-c3ef5041-…-71cbjT`; 0 clusters; manual snapshot `munaxa-docs-eu-prod-pg-final` (4 Nov) |
| `rds DescribeEvents` since 20 Nov 00:00 UTC | 0 |
| `secretsmanager DescribeSecret rds!db-c3ef5041-…` | RotationEnabled true (7 days); LastRotated 2026-11-13T17:26:19.777Z; LastChanged 2026-11-20T17:25:28.143Z; NextRotation 2026-11-21T00:59:59Z; stages: 5f35b6a0 AWSPENDING, b04015a3 AWSCURRENT, c7f38eac AWSPREVIOUS |
| `secretsmanager ListSecretVersionIds` | c7f38eac (AWSPREVIOUS, 2026-11-06T16:09:51Z), b04015a3 (AWSCURRENT, 2026-11-13T17:25:18Z) |
| `cloudtrail LookupEvents` RotationStarted / Failed / Succeeded / Abandoned since 20 Nov 00:00 | 13 / 13 / 0 / 0; failures 05:08:21, 06:25:35, 07:25:34, 08:25:31, 09:25:30, 10:25:32, 11:25:30, 12:25:30, 13:25:29, 14:25:29, 15:25:32, 16:25:27, 17:25:28 UTC, each "Failed for secret version 5f35b6a0-ba38-4e7a-b3f1-efbba96ee864." |
| `ecs ListServices` / `ListTasks` `munaxa-nonprod` | 0 / 0 |
| `elbv2 DescribeLoadBalancers` | 0 |
| `ec2 DescribeNatGateways` (pending, available) / `DescribeAddresses` | 0 / 0 |
| `ec2 DescribeVpcEndpoints` | 1 Gateway `com.amazonaws.eu-central-1.s3` |
| `stepfunctions ListExecutions munaxa-nonprod-session-cleanup` | 1a6aff64 SUCCEEDED 2026-11-19T21:05:22Z; dry-run-idle SUCCEEDED 2026-11-19T03:45:34Z; 1a6afe12 SUCCEEDED 2026-11-18T21:05:22Z |
| `cloudwatch DescribeAlarms` | 2 metric alarms, both OK |
| `secretsmanager ListSecrets` (with planned deletion) | 14: `munaxa-nonprod/{identity (2 versions), identity-migrate (1), docs-api, docs-migrate, docs-operator, control-api, control-migrate, work-api, work-migrate, school-api, school-migrate}` (0 versions each), the RDS secret (3), and `munaxa-docs-eu-prod/{app,operator}` scheduled for deletion since 4 Nov. No `munaxa-nonprod/identity-operator` |
| `secretsmanager DescribeSecret` on control-api, control-migrate, docs-api, docs-migrate, docs-operator, identity | KMS `45eda044-092a-4f31-9243-3f9548636e37`, no rotation, not deleted, not replicated |
| `ecs ListTaskDefinitions` + `DescribeTaskDefinition` (latest ACTIVE) | db-admin rev 2, identity-migrate rev 2, identity-bootstrap rev 3, identity-probe rev 1, identity rev 2; images and secret pins listed in file 05 P-5 |
| `ecr DescribeImages` / `DescribeImageScanFindings` | Control a24c568 api `d6bf8c3c…`, migrate `203079c9…`, portal `5a76933c…`: HIGH 7, MEDIUM 2, LOW 3 each (scan 8 Nov). Work api b490b25 `39a89a6f…`: CRITICAL 1. Identity 2db6ed9 api `9a8c6ebd…`, migrate `5f3bdcce…`: no findings (13 Nov). Docs api and web f8a8bea: MEDIUM 1, LOW 2 (glibc 2.36-9+deb12u14), antivirus: none (25 Oct). `munaxa-docs/migrate`: RepositoryNotFoundException |
| `ce GetCostAndUsage` 1 to 21 Nov | file 08 |
| `budgets DescribeBudgets` | file 08 |

Docker Hub (anonymous registry API, no daemon): `node:22-bookworm-slim@sha256:e9f565d3…` amd64 manifest `47725aca…`, five layers downloaded and SHA-256 checked; top-layer `/var/lib/dpkg/status`: apt 2.6.2, util-linux 2.38.1-5+deb12u3 (and libuuid1, libblkid1, libmount1), zlib1g 1:1.2.13.dfsg-1, libc6 and libc-bin 2.36-9+deb12u14.

GitHub Actions logs: control#10 run 44711137266 image job and docs#179 run 44711063184 image job: every `apt-get upgrade` step logged `0 upgraded, 0 newly installed`.
