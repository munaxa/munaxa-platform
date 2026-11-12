# 02. Terraform security review (platform#110)

## Controls checked

| Control | Evidence |
| --- | --- |
| TLS required, at-rest with the data KMS key | resource arguments + postcondition; test **[L]** |
| AUTH token write-only, never in state or plan | `auth_token_wo` (schema: `write_only`, `sensitive`) fed only by the ephemeral module output **[V]**; no output or variable carries it **[V]** |
| Token shape refused without echo | precondition; failure prints `error_message` only, checked in an unmocked scratch config **[L]** |
| Network | cache SG admits 6379 from the client SG only, no egress; client SG only on the Identity service; DB subnets **[L]** |
| No snapshots, noeviction | asserted **[L]** |
| Testing unchanged | KMS policy JSON identical without the cache; all new resources count 0; other services' deployment percentages null **[L]** |
| Alarms | four alarms per node (five with a replica), all to the ops topic **[L]**; **[U]** metric names and thresholds verified in the first prod session (`set-alarm-state` then email received) |

## Mutation testing

14 mutations of the new rules (each validation, the precondition, the SG rule, TLS mode, noeviction,
snapshot retention, the client SG attachment, the 0/100 setting) are all caught by the tests **[L]**.

## Findings and dispositions (rounds 1 to 3)

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| T-1 | Low | The documented plan/apply grant `secretsmanager:GetSecretValue` on `munaxa-prod/identity` cannot work while `bootstrap/iam.tf` keeps the explicit Deny `NoSecretValuesNoUsersNoKeys` on `*`; it is an exception to a deliberate guardrail, not a small widening | **Documented** in `infra/aws/README.md`: narrow exception (one secret, prod plan and apply roles only) is an **[O]** owner decision at the deployment-IAM stage; alternative if declined: operator-set token, Terraform ignores it (separate design change). Nothing breaks now: `prod.tfvars` gets `identity_cache` only in Phase E |
| T-2 | Low | The KMS statement for CloudWatch alarms had an `aws:SourceArn` condition whose presence in CloudWatch's KMS request is unverified; if absent, every alarm notification fails silently | **Fixed**: `aws:SourceAccount` only. **[R]** Phase E: `set-alarm-state` on one alarm, confirm history and email |
| T-3 | Low | Comment said the slow log holds key names only; Valkey's slow log records arguments, values included (MFA and session state) | **Fixed**: no engine log delivery, log group removed, test asserts none |
| T-4 | Low | Provider alias `aws.ephemeral_secrets` kept identical to the default by comment only | **Accepted** for now: both are in one 30-line file reviewed together; **[R]** a CI check comparing the two blocks with the next infra PR |
| T-5 | Low | `auth_token_update_strategy` defaults to ROTATE: a forgotten SET leaves the old token valid | **Documented**: rotation completes only with the SET apply; on the Phase E checklist |
| T-11 | Low | (round 3) the CloudWatch KMS statement is on the shared data key, which also encrypts RDS, logs and secrets | **Accepted** until Phase E: only with the cache, service principal, account condition; **[R]** own KMS key for the ops topic before Phase E |
| T-6 | Info | `apply_immediately = false`: a node-type change waits for the weekly window | Accepted: an emergency resize is a reviewed change that can set it |
| T-7 | Info | The precondition cannot see a bundle token changed without a version bump | Fails closed (Identity 503); documented rotation procedure |
| T-8 | Info | Draining-task overlap under 0/100 unverified | Phase D observation ([08](08-NEXT-PHASE-PLAN.md)) |
| T-9 | Info | No ElastiCache `notification_topic_arn` (engine events) | Deferred: alarms cover the failure modes; can be added with the replica |
| T-10 | Info | 503-rate log metric filter for Identity deferred | Deferred to the observability work |

No Critical, High or Medium finding was raised on #110.

## Cost

**[E]** cache.t4g.micro on demand in eu-central-1: about USD 12 to 14 per month for one node, double with
the replica; SNS and five alarms under USD 1. Nothing is created until Phase E.
