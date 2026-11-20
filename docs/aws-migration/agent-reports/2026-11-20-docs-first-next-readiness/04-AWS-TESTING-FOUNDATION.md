# 04. AWS Testing foundation

Read-only checks with the root connector on 20 Nov 2026 about 09:20 to 09:35 UTC [V]. No Terraform plan was run against the shared backend, so no state lock was taken.

| Item | Observed | Status |
| --- | --- | --- |
| ECS cluster `munaxa-nonprod` | 0 services, 0 tasks | VERIFIED COMPLETE (idle) |
| Load balancers, NAT gateways, Elastic IPs | none | idle, no hourly cost |
| VPC endpoints | 1 S3 gateway endpoint (free) | as designed |
| RDS `munaxa-test-pg` | stopped; auto-restart 20 Nov 21:07:07 UTC | see file 03 |
| Cleanup state machine R | last execution `1a6aff64` SUCCEEDED (19 Nov 21:05 UTC) | VERIFIED COMPLETE |
| EventBridge Scheduler | 12 schedules ENABLED | as designed |
| CloudWatch alarms | all OK | as designed |
| Scheduled `aws-session` workflow runs | 44652788103 (01:19 UTC), 44708913156 (09:13 UTC) | read-only scheduled checks with the session role, not deployments |
| Identity task definition (latest ACTIVE, revision 2) | api image `9a8c6ebd…` with the Valkey sidecar; secrets pinned to bundle version `80914756…`, including `MFA_ENCRYPTION_KEYS` | matches `envs/nonprod.tfvars` |
| Log groups identity, identity-migrate, ops | 14-day retention, 0 bytes | nothing has run |
| ACM `*.test.munaxa.com` | ISSUED, valid to 22 May 2027, InUse false, RenewalEligibility INELIGIBLE | S-3: renewal needs the certificate in use; not a blocker before April 2027 |
| KMS | 3 keys enabled (`45eda044`, `679d1b6b`, `c11c7689`); `9758d15e` PendingDeletion | no licence key yet (C-1 creates it) |
| ECR, Identity | api and migrate at `2db6ed9`; scan clean | VERIFIED COMPLETE |
| ECR, Control | api / migrate / portal at `a24c568` | **HIGH 7, MEDIUM 2, LOW 3** each (file 09) |
| ECR, Work | api / admin / migrate at `b490b25` | **CRITICAL 1** (CVE-2026-4738, zlib) |
| ECR, Docs | api / web / antivirus at `f8a8bea` and older; **no `munaxa-docs/migrate` repository** | blocker 1 open |
| ECR, School | repositories empty | NOT STARTED |
| ECR settings | every repository IMMUTABLE and scan_on_push; registry BASIC scanning | as designed |
| RDS snapshot | `munaxa-docs-eu-prod-pg-final` (4 Nov) | delete around 4 Dec (earlier owner decision) |
| Legacy task-definition families `munaxa-docs-eu-prod-*` | still ACTIVE (no services) | housekeeping only; no cost |

## Secrets Manager bundles (metadata only)

| Bundle | Versions |
| --- | --- |
| `munaxa-nonprod/identity` | `80914756…` AWSCURRENT, `ad02f18e…` AWSPREVIOUS |
| `munaxa-nonprod/identity-migrate` | `a3cc6622…` |
| `munaxa-nonprod/docs-api`, `docs-migrate`, `docs-operator` | none (blocker 3 open) |
| `munaxa-nonprod/control-api`, `control-migrate` | **none**: new gap, closed in code by `control-testing-secrets.sh` (file 06 §4) |
| other products | none |

No secret value was read.
