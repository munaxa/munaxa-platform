# 08. Next phase plan

Every step below is **[O]**: it needs the owner's explicit authorization. Nothing here has started.

## Phase C: publish Platform 2.5.0

1. Dispatch `release.yml` on `main`, `dry_run = true`. Expect the 13 names at 2.5.0 in the summary and
   the pack list; no publish.
2. Dispatch `dry_run = false` on `main`. Irreversible: a version is published once.
3. **[R]** Before or after: owner settings for a real publish control (environment secret limited to
   main with a reviewer; package Actions access Read).

## Phase D: Identity on 2.5.0 in Testing

1. Repository PR in munaxa-identity: lockfile to 2.5.0 (Retry-After bound already adjusted in #17).
2. Image rebuild from main **[O]** (images built from main after identity#7 need the dedicated MFA key
   secret in production mode; Testing uses the pinned flow from earlier sessions).
3. Testing session **[O]**: forced new deployment of Identity; record ECS events to verify that the
   old task stops before the new one starts (0/100) and the observed outage (expected 1 to 2 min).
4. Nonprod plan: expected zero changes for this work (all new resources count 0). The plan will
   configure the `aws.ephemeral_secrets` alias provider (one extra AssumeRole, no secret read).

## Phase E: production cache

0. Repository PR: a dedicated KMS key for the ops topic (T-11), and a CI check that the alias provider matches the default (T-4).
1. Owner decision on the deployer IAM: narrow exception to `NoSecretValuesNoUsersNoKeys` for
   `munaxa-prod/identity` (prod plan and apply roles), or the operator-set token alternative.
2. Operator writes `munaxa-prod/identity` with `REDIS_PASSWORD` (32 to 128 of `[A-Za-z0-9_~.-]`), pins
   the version.
3. PR setting `identity_cache` in `prod.tfvars` (`cache.t4g.micro`, `replicas = 0`, `8.1`,
   `auth_token_version = 1`); plan reviewed (check the plan shows no token); apply.
4. Bundle version with `REDIS_URL = rediss://:<token>@<primary endpoint>:6379`; pin.
5. Verify: `set-alarm-state` on one alarm, history and ops email received (T-2); Identity ready
   (`ROLE` master); sign-in, lockout, MFA flows.
6. Later, in place: `replicas = 1` (Multi-AZ, automatic failover), then a planned failover test.

## Recommended next execution prompt

> Munaxa: Phase C and D preparation. Repository-only, autonomous. (1) Open the munaxa-identity PR
> that adopts Platform 2.5.0 once it is published, with tests on 2.5.0; until then prepare it against
> the local candidate and leave it as a draft. (2) Prepare the Testing session runbook for a forced
> Identity deployment that records ECS events (0/100 verification) and the expected nonprod plan
> (zero changes from platform#110). (3) Write the owner decision record for the production deployer
> IAM exception (narrow GetSecretValue on munaxa-prod/identity) with the alternative. Reports in
> docs/aws-migration/agent-reports/<date>-phase-c-d-preparation/. Not authorized: AWS calls,
> Terraform against a real backend, publish, dispatch, tags, images, deploys, secrets. Merge when
> finished after green CI and final-head review.

Separately, when the owner is ready: **"Dispatch the Platform release workflow on main: dry run,
then publish 2.5.0"** (Phase C, irreversible).
