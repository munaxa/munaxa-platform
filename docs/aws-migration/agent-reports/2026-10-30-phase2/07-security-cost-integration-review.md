# 07 · Security, cost and integration review of this pass's changes

**Not independent.** In the first pass, a separate reviewer session (Agent 7) did this review. In this
pass, the lead who wrote the changes reviewed them. Treat it as a self-review. An independent review of
platform#29 and of this report package (for example in ChatGPT, as the owner intends) is still
recommended **before G2**.

## 1. platform#29: bootstrap IAM

| Check | Result |
| --- | --- |
| Does any new Deny catch the shared stack's own resources? | No. The stack tags `Project = munaxa`, `Environment = <its env>`. The P9 denies match `Project = MunaxaDocs` only. The R-17 denies match only the **other** environment's tag and names |
| Can a plan break because the deployer reads a Docs resource? | No. The stack declares no data sources. ECR image references are digests in tfvars, pulled by task execution roles (the boundary), not by the deployer |
| Can the nonprod deployer reach prod state? | No: `State` allows `nonprod/*` only, and `NeverTheOtherEnvironmentByName` denies `<bucket>/prod/*`. Listing stays bucket-wide on purpose (the S3 backend lists workspaces at init; key names hold no secret) |
| Can it reach the bootstrap state or roles? | No: the state allow is per environment, and the existing `NeverMunaxaDocsOrBootstrap` denies `role/munaxa-shared/bootstrap/*` and `policy/munaxa-shared/*` |
| Can a nonprod job assume the prod CI role? | No: the prod CI trust's `sub` lists only `…:environment:aws-prod`, and `ref` must be `refs/heads/main` |
| Can the deployer strip the `Project` tag off a Docs resource first? | No: `ec2:DeleteTags`, `elasticloadbalancing:RemoveTags` and the like are evaluated against the resource, which still carries the tag, so they are denied |
| Untagged Docs resources | Not covered by the tag deny. AWS-managed ENIs cannot be changed by callers anyway. A read-only inventory is needed (P9 residual) |
| Other workloads in the account (canteenhub-prod) | **Not covered** unless they carry `Environment = <other env>`. N-2 needs a read-only check before G3 |
| Boundary shared between environments | Unchanged. A residual, accepted for Testing |
| Interface change | The outputs became maps. README step 4 explains the variables. The job-level `if` in `aws-session.yml` reads repository variables, so the nonprod pair must be repository variables, as documented |

## 2. P10, F-3, budget, Access

- P10: `kms:GetKeyRotationStatus` is a read on the key; it grants nothing else. That the provider calls it
  for this asymmetric key on refresh is taken from the baseline P10 finding [A]; the permission is
  harmless either way. It can only be confirmed at the first refresh after the key exists.
- F-3: the two checks pin the same hash, so a change on either side fails CI until both are updated.
  They do not prove the copy is the latest Docs version if both are updated wrongly. A reviewer sees
  both diffs.
- Budget: `TagKeyValue` `user:Environment$nonprod` reads US$0 until the tag is activated. That is
  documented. It never reduces protection, because the account budget stays.
- Access: the MFA rule fails closed (no MFA, no access). The lockout risk is a provider that does not
  report MFA. The instructions say to test a sign-in before recording the AUD tag.

## 3. platform#27, re-reviewed

The `school-bootstrap` execution role: ECR pull on `munaxa-school/migrate` only, `GetSecretValue` on
the `school-migrate` bundle and the one-run secret only, `kms:Decrypt` only via Secrets Manager, and
logs to the ops group. It carries the workload boundary. There is no task role, so the container has
no AWS permissions. Paths verified against School (06). `OPENAPI_ENABLED` verified against Work (05).
No objection.

## 4. docs#168 and control#7

docs#168: the same two commits as #167 (diff `git diff origin/main` = `publish-images.yml` only, plus
the new CI step and hash file). control#7: documentation only. No objection.

## 5. Cost

See COST-AND-TRANSITION-ANALYSIS. #29 adds no billable resource except a second AWS Budget. AWS
Budgets bills by budget-days for actions, and plain alert budgets have historically been free within
the first two per account [A, not verified]. After #29 the account has exactly two budgets.

## 6. Tests actually executed by the reviewer

The same as in 01: fmt, validate, stack test (14 passed), bootstrap test (3 passed), mutation check,
F-3 hash. CI results are in MASTER-EXECUTION-STATUS.
