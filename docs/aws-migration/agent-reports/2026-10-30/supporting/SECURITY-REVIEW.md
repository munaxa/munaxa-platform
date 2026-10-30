# Security review: Munaxa AWS Testing

30 Oct 2026. Agent 7, independent: it owns none of the implementations reviewed. Read-only. Full
evidence and file lines for the R-findings are in `agent7-independent-review.md`; owner findings
are in `agent2` to `agent6` reports. AWS was not checked live (connector sign-in expired).

## Process risk

The AWS connector authenticates as the **root user** of 229251310592 (recorded 29 Oct). This
follows the owner's decision to use root until launch, but any tool session holds full account
power. Keep connector use read-only, and keep root MFA on.

## Risk register

| ID | Sev | Area | Finding | Status / owner |
| -- | --- | ---- | ------- | -------------- |
| R-01 | Blocker | Integration | Docs has no Testing home. The boundary denies `munaxa-docs*` | T10, T11 |
| R-02 | Blocker | Cost | US$50 cannot hold with the old Docs stack in the account | Tamer (B2) |
| R-03 / S1 | High | Storage | School needed static keys or silently stubbed uploads. The S3 endpoint denies non-ECR buckets | Code fixed in school#21 and #23 (merged); platform T07 in platform#26 |
| I1 | High | Auth | Identity per-IP lockout was global behind the ALB | Fixed identity#2; platform T02 |
| C1 | High | Control | Portal downloads lacked the Access token | control#6 (CI red) |
| R-04 | Medium | KMS | Licence key deleted if `images.control_api` is unset | T12 |
| R-06 / I2 / C5 | Medium | Auth | One token valid for Work and Control | Accepted for Testing; per-audience tokens before Production |
| I3 / C6 | Medium | Auth | No MFA claim from Identity; Access is the second factor | Accepted for Testing; Access policy must require MFA (G6) |
| R-07 | Medium | Supply chain | Tag-pinned actions in ECR publish jobs with OIDC credentials | **Closed** for Identity, Control, Work and School: every `uses:` in their ECR publish workflows is SHA-pinned on main (verified 14:25 UTC). **Extended to Docs (R-07b, open):** `munaxa-docs` `publish-images.yml` runs `docker/setup-buildx-action@v3`, `docker/build-push-action@v6`, `actions/checkout@v6`, `actions/setup-node@v6` and `actions/upload-artifact@v4` by tag, in `image-release` jobs that hold AWS OIDC credentials. Testing now runs those images. Owner: Agent 4 |
| R-08 / C2 | Medium | Release | Control migrate downloaded pnpm at run time | control#6 |
| S4 / R-05 | Medium | Auth | School Firebase disabled on AWS | Optional keys |
| W1 | Medium | Ops | Fresh Work DB has no tenant | Fixed work#26 |
| R-14 | Medium | Tenant isolation | The contract adds `edms_backup`, a read-only `BYPASSRLS` role, on the **shared** instance. Its rights must be `CONNECT` on `edms_*` databases only, never on other products' databases. **platform#26:** `edms_backup` gets `pg_read_all_data` plus BYPASSRLS, CONNECT only on `edms_*`. docs-db-admin fails closed if it can connect to any other database. Residual risk: the check runs only when docs-db-admin runs, so a future product database that skips `REVOKE CONNECT ... FROM PUBLIC` would be readable until then. | Mitigated in platform#26 |
| R-15 | Medium (outside Testing scope) | School mobile | Receipt upload uses Dio with no explicit `Content-Length`, but the presigned PUT signs `content-length`. A streamed or chunked body fails the signature, so mobile uploads can fail. Not a security weakness. Testing covers web admin only. | Agent 6, mobile app phase |
| R-16 | Medium | Secrets handling | The Identity bootstrap step takes `IDENTITY_OWNER_PASSWORD` from the environment. As an ECS container override it would be visible in DescribeTasks and CloudTrail. Use a one-run secret bundle. | Fixed in platform#26 `cfb01ee` (identity-bootstrap task reads ECS secrets; reviewed) |
| C4 | Low | Edge | ALB admin refusal is case-sensitive; the API still enforces | T15 optional |
| C8 | Low | Repo | munaxa-control `main` unprotected | Owner |
| R-09 | Low | Cost control | Schedule auto-disables in a public repo after 60 days | T14 |
| R-10 | Low | Storage | SVG allowed for branding | Closed: school#22 serves branding downloads with `Content-Disposition: attachment` |
| R-11, R-12, C3, W2, W3 | Low | Hygiene | Stray files, stale header, publish token, double publish, OpenAPI | T16, T18, control#6, –, T13 |

## Areas reviewed and found sound

- **IAM:** GitHub OIDC with immutable repo subject plus `ref` (AWS documents both keys). Publishers
  push only their own repos. A boundary is required on every stack role. The deployer cannot read
  secret values, create users or keys, or sign. No IAM user or access key anywhere.
- **Network:** only 80/443 to the ALB. Tasks admit only the ALB and named callers. RDS is in isolated
  subnets with no internet route. The default security group is empty.
- **KMS and licensing:** only the control-api task role can sign, ES256 digests only, grants denied.
  Control verifies each KMS signature before use. Product credentials are hashed and bound per deployment.
- **Tenant isolation:** each product has its own database. `REVOKE ALL FROM PUBLIC`. Runtime roles
  are `NOBYPASSRLS`, and Work refuses a bypassing role at startup. Work isolation was reproduced
  locally by Agent 5. School keys are tenant-prefixed and checked.
- **Secrets:** values are never in Terraform, git or logs. One bundle per service, read only by its
  execution role. Migrate credentials are separate from runtime.
- **Images:** pinned bases, BuildKit secrets, non-root, immutable ECR with scan on push, digest-only deploys.
- **Migrations:** explicit run-tasks, never on deploy. RDS final snapshot and 7-day backups.

## Deferred by owner decision

GuardDuty, Security Hub, Access Analyzer, CloudWatch alarms, WAF and Identity Center (post-launch hardening).
