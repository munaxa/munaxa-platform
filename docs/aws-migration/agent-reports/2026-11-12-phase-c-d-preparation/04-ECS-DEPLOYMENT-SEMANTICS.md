# 04. ECS stop-first deployment semantics (Phase D2)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required, **[V-doc]** stated in AWS or Terraform documentation, not observed.

**Nothing here has been observed in AWS.** Every statement about ECS or ALB behaviour comes from one of two sources:
- AWS's public documentation, read on 12 Nov 2026 (quoted pages below);
- the repository.

## The configuration as merged (platform#110, main `47ffd08`)

| Setting | Value for Identity in Testing | Source |
| --- | --- | --- |
| Desired count | `desired_counts.identity` = 1 in `nonprod.tfvars`; `single_task_store` forces at most 1 | **[V]** `stack/services.tf`, `modules/service/variables.tf` |
| Deployment percentages | minimum healthy 0, maximum 100 (set only when `valkey_image` is set) | **[V]** |
| Other services | null, so ECS defaults 100/200; asserted by test | **[V]** **[L]** |
| Circuit breaker | enabled, rollback on | **[V]** |
| Sidecar | `valkey`, essential, `user 999:999`, binds 127.0.0.1:6379, `requirepass`, `noeviction`, no persistence, **no port mapping** (module validation) | **[V]** |
| Start order | Identity `dependsOn` valkey `HEALTHY` (valkey health check `ping` every 10 s, start period 10 s) | **[V]** |
| Identity container health | `node -e fetch(/api/auth/health/live)` every 15 s, 3 retries | **[V]** |
| Target group | `deregistration_delay = 15`; health `/api/auth/health/ready`, interval 15 s, healthy threshold 2, unhealthy 3 | **[V]** `modules/service/main.tf` |
| Stop timeout | not set, so the ECS default applies | **[V]**; default 30 s per the task definition parameters page **[V-doc]** |
| Health check grace period | not set | **[V]** |
| Paths to the task | ALB target group only. Identity is not in Cloud Map and has no `ingress_security_group_ids`. Its SG has one ingress rule: the ALB's group on 4001. The probe and bootstrap tasks run *in* that group, but the group has no self-referencing rule, so membership admits nothing | **[V]** `stack/services.tf` |

## What AWS documents (read 12 Nov 2026)

- `maximumPercent` is "an upper limit on the number of your service's tasks that are allowed in the **RUNNING or PENDING** state during a deployment". `minimumHealthyPercent` is "a lower limit on the number of your service's tasks that must remain in the RUNNING state". ([API_DeploymentConfiguration](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DeploymentConfiguration.html))
- Task lifecycle: in **DEACTIVATING** "the target group deregistration occurs". In **STOPPING** the agent sends the stop signal (SIGTERM), then SIGKILL after `stopTimeout`. ([task-lifecycle-explanation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-lifecycle-explanation.html))
- **Not stated anywhere:** whether a DEACTIVATING or STOPPING task counts toward `maximumPercent`, or whether the scheduler waits for an old task to reach STOPPED before launching its replacement.
- ALB: "Elastic Load Balancing stops sending requests to targets that are deregistering". In-flight requests get the deregistration delay to finish. ([target group attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html))
- ALB: "Before a target can receive requests from the load balancer, it must pass the initial health checks." Fail-open ("only unhealthy registered targets ... routes requests to all those targets") is stated for unhealthy targets. The docs do not say how it treats `initial` or `draining` targets. ([target group health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html))
- Circuit breaker: threshold = clamp(0.5 × desired, 3, 200), so **3 failed task launches** with one task. Rollback goes to the last COMPLETED deployment. The docs do not say whether the rollback honours the same percentages. ([deployment-circuit-breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html))

## Answer: does 0/100 prevent two Identity tasks with independent Valkeys from serving at once?

**Two tasks existing at once: not prevented.**
- The old task leaves RUNNING when it starts DEACTIVATING. On the documented counting, that frees the single slot.
- So ECS may launch the replacement while the old task is still draining (up to 15 s), then stopping (up to 30 s).
- **[U]** Whether it actually does is the observation to make in Testing.

**Two stores receiving new requests at once: prevented, as long as the ALB is the only way in.** **[V-doc]** + **[V]**:
1. The old target is deregistered first. The ALB sends it no new request from that moment.
2. The new target receives nothing before it passes its health check. **[E]** The earliest possible is about 30 to 60 s after launch: Fargate provisioning, image pull, Valkey healthy (≥ 10 s start period), Identity ready, then one or two health checks 15 s apart. That is later than the old target's 15 s drain.
3. Identity's only ingress is the ALB (table above). No discovery name resolves to the draining task, and no other security group may call it.

**Remaining overlap (accepted):**
- A request already in flight on the old task when deregistration starts may finish there while the new task is not yet serving.
- **[E]** Identity requests take milliseconds, and the new task cannot be serving within the 15 s drain, so the window is practically empty.
- It is not a security gap: the new store starts **empty** anyway. The reset at replacement is the real effect, and it is accepted (below).

**Repository change made (platform#114, commit `3773c25`).** Point 3 was true but not enforced:
- `single_task_store` now refuses `register_discovery` and any `ingress_security_group_ids`.
- Two failing-case tests were added; mutations of either half are caught **[L]**.
- Review round 1 (B1) found that `extra_security_group_ids` could still carry ingress the module cannot see.
  Commit `6ab747d` refuses it too, with a third test, and corrects the last stop-first wording in a
  module comment and a stack test name.
- The README, the `services.tf` comment and the variable description no longer claim "stops the old task before starting the new one". They state the guarantee above.
- **[L]** Plans are unchanged: an offline plan with `nonprod.tfvars` at `3773c25` against main showed the same 100 resources with no attribute or expression difference (that output was not kept). The later commits only add validations, a precondition on a production-only resource, comments and tests; round 3 confirmed from the diff that they cannot change a plan.

**Safer alternatives considered, not implemented:**
- **ECS blue/green or a longer drain:** these increase overlap, not reduce it.
- **Scale to zero, wait for STOPPED, then scale to one (runbook option 03 §7b).** This is the only procedure that *guarantees* no second task exists.
  - It costs the same outage.
  - It is a manual, owner-authorized operation, so it is documented rather than automated.
  - **[R]** Use it if the observation shows the replacement launching during DEACTIVATING and the owner wants "never two tasks" literally.

## Failure scenarios during replacement

| Scenario | What happens | Effect |
| --- | --- | --- |
| New image crash-loops (e.g. migrations not run, missing MFA key secret) | Old task already gone; 3 failed launches; circuit breaker rolls back to the last COMPLETED deployment, also stop-first | **[E]** Identity down for roughly 3 × (launch to failure, 1 to 3 min) plus the rollback start: **about 5 to 12 minutes** |
| New task healthy in ECS but `/ready` fails (database stopped, Valkey not reachable) | ALB keeps the target unhealthy; ECS sees unhealthy ELB checks after 3 × 15 s and replaces it; repeats until the circuit breaker trips | Same as above |
| Valkey sidecar never healthy | Identity never starts (`dependsOn HEALTHY`); the task stops; counted as a failed launch | Same as above |
| Valkey dies while Identity runs | Sidecar is essential, so the task stops, and ECS starts a new one (not a deployment) | Outage of one replacement; state reset |
| No previous COMPLETED deployment (first deployment in a session fails) | Circuit breaker cannot roll back; "the deployment is stalled" **[V-doc]** | Identity stays down until `down`, or a fixed deployment |
| Two deployments queued | ECS replaces the in-progress one; same 0/100 rules | Extra outage |

## Expected outage and the ephemeral security state

**[E]** About 1 to 2 minutes per successful deployment in Testing: 15 s drain, up to 30 s stop, then new task launch, Valkey health, Identity readiness, and two ALB checks.

During the outage:
- Sign-in, refresh and Work's `/api/auth/*` return 502/503.
- **Survives** (PostgreSQL): accounts, sessions, refresh-token lineages, MFA factors and recovery codes, audit.
- **Lost** (sidecar memory), with its consequence:

| State | Consequence after replacement |
| --- | --- |
| Rate-limit counters and penalty blocks | Every subject gets a fresh allowance. An attacker can gain at most one extra allowance per replacement (Testing only) |
| Login lockout counters | A locked account is unlocked early |
| Pending MFA challenges | A user between password and code must sign in again |
| TOTP replay markers | A code used in the last ~90 s could be replayed once, inside its own time window, if an attacker holds it and the password-step challenge |
| Reauthentication markers, permission cache | Re-established on the next request |

**[R]** This is acceptable for Testing: it is ADR-0002 §1, accepted by the owner on 12 Nov. Production uses the shared ElastiCache and ECS defaults, so none of this applies there.

## What the Testing observation must capture

See runbook 03 §7 to §11:
- ECS service events;
- the `lastStatus`/`desiredStatus` and `stoppingAt`/`stoppedAt`/`startedAt`/`createdAt` of both task ARNs;
- target health transitions (`draining`, `initial`, `healthy`);
- ALB 5xx counts.

The single question to settle **[U]**: **is the new task's `createdAt` before the old task's `stoppedAt`?**
- If yes, ECS does not count DEACTIVATING/STOPPING tasks. The ALB argument above is then what protects the store.
- If no, ECS waits, and "never two tasks" also holds.
