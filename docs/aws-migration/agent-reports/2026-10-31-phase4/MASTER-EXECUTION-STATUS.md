# Master execution status: phase 4, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

## 1. Repositories

| Repository | `main` at start | `main` at end | PRs this phase | CI evidence |
| --- | --- | --- | --- | --- |
| munaxa-platform | `351352a` (#32) | `1331ef8` (#33), then this reports PR | **#33** merged → `1331ef8` (squash, head `7b2e1d1` pinned); this reports PR | #33 on `7b2e1d1`: CI run [41205740233](https://github.com/munaxa/munaxa-platform/actions/runs/41205740233) (Lint · Typecheck · Test · Build; Accessibility; Façades: success); AWS Terraform run [41205740236](https://github.com/munaxa/munaxa-platform/actions/runs/41205740236) (Format, validate, mocked plan tests: success; Plan/Apply skipped, dispatch only) [V] |
| munaxa-identity, -control, -work, -school, -docs | unchanged | unchanged | none | — |

## 2. Commits applied to AWS

| Commit | What | Applied | Result |
| --- | --- | --- | --- |
| `351352a8bdd20502c982f61a771f1f5939419040` | bootstrap as of platform#31 (+ docs) | 12:45:18 UTC | 49 added [V] |
| `1331ef89a7906b75292bb35554eac9659270c0f2` | platform#33 N-2 `Null` guards | 13:42:03 UTC | 2 changed [V] |

## 3. AWS resources (account 229251310592, eu-central-1)

| Resource | State | Label |
| --- | --- | --- |
| `munaxa-shared-tfstate-229251310592` (+ versioning, SSE-KMS, PAB, ownership, TLS-only policy) | Created, verified | [V] |
| KMS key `679d1b6b-…` / `alias/munaxa-shared-tfstate` | Created, rotation on | [V] |
| 11 ECR repositories + lifecycle policies | Created, immutable, scan on push, empty | [V] |
| `munaxa-shared-workload-boundary` policy | Created | [V] |
| `munaxa-shared-ci-{nonprod,prod}`, `munaxa-shared-deployer-{nonprod,prod}` | Created, trusts verified; deployer policies fixed (platform#33) | [V] |
| `munaxa-{identity,control,work,school}-image-publisher` | Created, trusts verified | [V] |
| Budgets `munaxa-shared-account-monthly`, `munaxa-shared-testing-monthly` | US$50 each | [V] |
| Terraform state | S3, current version 201,237 B (13:42:09); local copies removed | [V] |
| Cost allocation tags `Environment`, `Project` | Active (13:43:41) | [V] |
| VPC, RDS, ECS, ALB, secrets, services (G3+) | **Not created** | [V] (plans contained none) |

## 4. Owner actions after G2

| # | Action | Status |
| --- | --- | --- |
| 1 | munaxa-platform environments `aws-nonprod`, `aws-prod` (reviewer tam2om, `main` only), `aws-nonprod-session` (`main` only), created **before** any variable | **Pending [O]** (this session's GitHub access cannot create or read environments: the environments API returns 403 through the session proxy) |
| 2 | munaxa-platform repository variables `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN` (nonprod ARNs); `aws-prod` environment variables (prod ARNs) | **Pending [O]** |
| 3 | `image-release` environment (reviewer, tags `image/*` only) and `AWS_IMAGE_PUBLISHER_ROLE_ARN` in identity, control, work, school | **Pending [O]** |
| 4 | Keep the AWS connector signed out (S-ROOT) | Signed out throughout [V] |

Exact values: NEXT-EXECUTION-PLAN §2.

## 5. Gates

| Gate | State |
| --- | --- |
| G2 | **Done on AWS** [V]; GitHub part pending [O] |
| G3 to G7 | Closed. G3 needs separate approval and B2/TD-14 |
| G9 | Closed |
