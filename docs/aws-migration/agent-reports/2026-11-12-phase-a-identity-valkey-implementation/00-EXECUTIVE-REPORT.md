# Phase A executed, Phase B prepared: Identity shared Valkey and Platform 2.5.0

Date: 12 Nov 2026. Repository-only work. Continues the plan in
[`2026-11-12-identity-shared-valkey-platform-release/`](../2026-11-12-identity-shared-valkey-platform-release/)
(platform#109 `e2aea5e`).

Tags used in every file of this folder:

| Tag | Meaning |
| --- | --- |
| **[V]** | Verified fact: read in the repository, in GitHub, or in a command's output in this session |
| **[L]** | Local test result: run in this session's container, mocked or against local servers |
| **[E]** | Estimate |
| **[R]** | Recommendation |
| **[U]** | Unverified assumption (says what would verify it) |
| **[O]** | Needs the owner's authorization before it can happen |

## Result

**Phase A is implemented in code and Phase B is prepared. Nothing was deployed, applied, published or
dispatched.** Four implementation PRs, each reviewed in three independent security rounds and
merged after green CI on the approved head (owner: "Merge when finish"). A1 and A2 share one PR,
#110, because A2 depends on A1's module inputs ([07](07-PR-AND-CI-STATUS.md)):

| PR | Scope | Status |
| --- | --- | --- |
| [munaxa-platform#110](https://github.com/munaxa/munaxa-platform/pull/110) | A1 to A4: ECS deployment percentages (Identity Testing stop-first 0/100), production ElastiCache for Valkey 8.1 in Terraform, write-only AUTH token | merged |
| [munaxa-identity#17](https://github.com/munaxa/munaxa-identity/pull/17) | A5: READONLY reconnect, production TLS and URL rules, readiness on a primary only | merged |
| [munaxa-platform#111](https://github.com/munaxa/munaxa-platform/pull/111) | B1: release workflow publishes exactly the 13 lockstep packages, only from main, dry run in a job without packages: write | merged |
| [munaxa-platform#112](https://github.com/munaxa/munaxa-platform/pull/112) | B2: version PR, the 13 packages 2.4.1 to 2.5.0 (#107 and #100), licensing stays 0.2.0 | merged |

- **[L]** Terraform: stack 66, service module 14 (new), bootstrap 12 mocked tests pass; 14 mutations of the
  new rules are all caught. Real `nonprod.tfvars` and `prod.tfvars` pass every new validation.
- **[L]** Identity: config 59 and integration 291 tests pass against the local **2.5.0 candidate**
  (B3), including a real primary/replica failover, a replica-stuck endpoint and a TLS-only server with
  a per-run CA. Also green on 2.4.1 in CI.
- **[L]** 2.5.0 candidate: `release:check` and `verify-release --since 54bbf46` pass; every package test passes.
- **[V]** Testing (nonprod) at rest plans zero changes by construction: every new resource is `count = 0`
  without `identity_cache`, the KMS key policy JSON is unchanged, and the Identity service exists only
  during sessions. **[U]** Confirmed by the next real nonprod plan.

## Security review

Three rounds by independent reviewers ([06](06-INDEPENDENT-SECURITY-REVIEW.md)). Round 1 found two
Medium findings, both fixed and verified:

1. **Release workflow:** a failing package-list script inside `echo "$(...)"` escaped `set -e`; an empty
   list would have made `pnpm -r publish` publish the whole workspace. Fixed: the list is assigned
   first and both Pack and Publish refuse anything but exactly 13 filters (tested in bash).
2. **Identity cache:** `reconnectOnError` returning 2 resent a refused write without limit while the
   endpoint named a replica, and applied it after the caller had been told it failed. Fixed: returns 1
   (fail closed, reconnect, next write reaches the primary), plus a stuck-replica test.

Lows fixed as well: dry run without packages: write, SHA pin, readiness on `ROLE`, blank
`REDIS_URL`, redacted `describeEnvironment`, no slow log (it would copy MFA and session values to
CloudWatch), account-only KMS condition. Remaining Lows and Infos are recorded with rationale.
No Critical or High finding was raised.

## Blockers and owner decisions before anything runs

- **[O]** Production deployer IAM: the ephemeral token read needs a **narrow exception to the explicit
  `NoSecretValuesNoUsersNoKeys` Deny** (only `munaxa-prod/identity`, only the prod plan and apply
  roles). Without it every prod plan with `identity_cache` fails AccessDenied. See [02](02-TERRAFORM-SECURITY-REVIEW.md).
- **[O]** Platform 2.5.0 publication: dispatch `release.yml` on main (dry run, then publish). Merging #111
  and #112 publishes nothing ([04](04-PLATFORM-RELEASE-READINESS.md)).
- **[O]** Identity image rebuild from main after #17 and the 2.5.0 adoption PR; Testing session with a forced
  deployment to observe the stop-first behaviour.
- **[O]** Production: `munaxa-prod/identity` bundle with `REDIS_PASSWORD`, `identity_cache` in `prod.tfvars`,
  plan and apply.

## What did not happen

No AWS API call or console use, no Terraform against a real backend, no apply, no secret read or
change, no package publish, no workflow dispatch, no tag, no image, no deployment, no migration, no
DNS, Cloudflare or GitHub App change. See [08](08-NEXT-PHASE-PLAN.md) for the next steps.

## Files

- [01 Implementation details](01-IMPLEMENTATION-DETAILS.md)
- [02 Terraform security review](02-TERRAFORM-SECURITY-REVIEW.md)
- [03 Identity compatibility tests](03-IDENTITY-COMPATIBILITY-TESTS.md)
- [04 Platform release readiness](04-PLATFORM-RELEASE-READINESS.md)
- [05 Cross-product assessment](05-CROSS-PRODUCT-ASSESSMENT.md)
- [06 Independent security review](06-INDEPENDENT-SECURITY-REVIEW.md)
- [07 PR and CI status](07-PR-AND-CI-STATUS.md)
- [08 Next phase plan](08-NEXT-PHASE-PLAN.md)
