# Shutdown verification: 25 Nov 2026, 13:33 UTC [V]

Final `down` was run 45623959468 (success, finished 13:33:14 UTC). These are root-connector reads at
13:33:44 UTC, metadata only:

| Check | Result |
| --- | --- |
| ECS services in `munaxa-nonprod` | 0 |
| ECS tasks | 0 |
| Load balancers / target groups | 0 / 0 |
| NAT gateways / Elastic IPs | 0 / 0 |
| RDS `munaxa-nonprod-pg` | `stopped` |
| One-run secret `munaxa-nonprod/docs-provision/*` | absent |
| H-20 P `…-p-20261125t1600` and S `…-s-20261125t1630` | deleted (disarmed) |
| Remaining schedules | the standing backstops (`munaxa-nonprod-backstop-*`) and `munaxa-nonprod-session-cleanup-daily` |
| Cleanup state machine running executions | 0 |

What persists for later sessions: the database (stopped), the Docs tenant `munaxa-internal`, the uploaded
test document in `munaxa-nonprod-docs-files-229251310592`, and in Control the deployment, credential 3,
plan `docs/internal`, customer, tenant link and subscription. The 4 CNAMEs point to a deleted load
balancer, which is harmless.
