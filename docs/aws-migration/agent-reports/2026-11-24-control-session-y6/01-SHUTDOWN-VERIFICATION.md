# Shutdown verification: 24 Nov 2026, 13:57 UTC [V]

Final `down` was run 45407934056 (success, 13:57:36 UTC), after the owner chose "stop for today" (13:52 UTC).
These are root-connector reads at 13:57:59 UTC, metadata only:

| Check | Result |
| --- | --- |
| ECS services in `munaxa-nonprod` | 0 |
| ECS tasks | 0 |
| Load balancers / target groups | 0 / 0 |
| NAT gateways / Elastic IPs | 0 / 0 |
| RDS `munaxa-nonprod-pg` | `stopped` |
| One-run secret `munaxa-nonprod/docs-provision/*` | absent |
| H-20 P `…-p-20261124t1600` and S `…-s-20261124t1630` | deleted (disarmed); only `munaxa-nonprod-session-cleanup-daily` remains |
| Cleanup state machine running executions | 0 |

Independent of this session, the 21:00 UTC backstop and the 21:05 UTC daily cleanup still run.
The CNAMEs (`operator-test`, `id.test`, `control-api.test`, `docs.test`) point to a deleted load
balancer. They are harmless, and the next session needs them updated anyway.
