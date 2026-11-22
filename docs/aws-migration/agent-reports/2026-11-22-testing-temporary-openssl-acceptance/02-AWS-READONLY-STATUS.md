# 02. AWS read-only status, 22 Nov 2026 ~14:20 UTC

**All reads were done through the Claude AWS connector, which is still signed in as ROOT of
229251310592** (O-IAM-6 not done yet; `sts:GetCallerIdentity` = `arn:aws:iam::229251310592:root`).
Metadata only: no `GetSecretValue`, no decrypt, no log contents, no S3 object reads, no write of any
kind. Once O-IAM-6 is done, the same reads run as `MunaxaReadOnly`.

## 1. Account guard rails [V]

| Check | Value |
| --- | --- |
| Root MFA | enabled (`AccountMFAEnabled` 1) |
| Root access keys | 0 |
| IAM users | 0 |

## 2. IAM Identity Center [V]

| Item | Value |
| --- | --- |
| Instance | `ssoins-69875eaef0e8dbe8`, identity store `d-9967b3db9b`, **ACTIVE**, eu-central-1 |
| Access portal | https://d-9967b3db9b.awsapps.com/start (owner signed in successfully 14:04 UTC, previous thread) |
| `MunaxaAdministrator` | session PT1H; 1 USER assignment; provisioned to 229251310592 |
| `MunaxaEngineering` | session PT4H; 1 USER assignment; provisioned |
| `MunaxaReadOnly` | session PT8H; 1 USER assignment; provisioned |

Nothing was changed. Owner checks O-IAM-5 and the connector switch O-IAM-6 remain (file 06).

## 3. Secret bundles, metadata only [V]

| Secret | Single version (AWSCURRENT) | Last changed (UTC) | KMS key |
| --- | --- | --- | --- |
| `munaxa-nonprod/control-migrate` | `ee66de8e-9ab8-4f72-8db8-11c631c1e0e0` | 2026-11-22 13:00:44 | `45eda044-…` |
| `munaxa-nonprod/control-api` | `655501d8-19f2-4190-9460-960b6464a1a2` | 2026-11-22 13:00:47 | same |
| `munaxa-nonprod/docs-operator` | `85c17e64-1cec-4edd-80a2-59c5c06306d5` | 2026-11-22 13:01:11 | same |
| `munaxa-nonprod/docs-migrate` | `b9b569c4-c9d7-49ae-935f-a59ee4da6a14` | 2026-11-22 13:01:14 | same |
| `munaxa-nonprod/docs-api` | `b6ea4c3a-31ae-4d01-a4b7-7941f01e53a7` | 2026-11-22 13:01:17 | same |

Identical to the version ids recorded by the owner run (report 2026-11-21-testing-owner-preparation,
file 10). No version added since. The custody scripts were not re-run. The Docs mail value and the
Control token in `docs-api` are still the documented placeholders (the token is replaced in Stage
5g of the runbook).

## 4. ECR [V]

| Repository | Tags | Scan on push | Encryption | Lifecycle | Images | `latest` |
| --- | --- | --- | --- | --- | --- | --- |
| `munaxa-docs/migrate` (created 2026-11-22 13:46:24) | IMMUTABLE | on | AES256 | present | **0** | none |
| `munaxa-docs/api`, `/web`, `/antivirus` | IMMUTABLE | on | AES256 | present | 3 each | none |
| `munaxa-identity/api`, `/migrate` | IMMUTABLE | on | AES256 | present | 3 each | none |
| `munaxa-control/api`, `/migrate`, `/portal` | IMMUTABLE | on | AES256 | present | 1 each (a24c568, withdrawn) | none |

No image was pushed by this work. Nothing is tagged `latest` in any of the nine repositories.

## 5. Publisher roles (GitHub OIDC, no long-lived credential) [V]

| Role | Trust (sub / ref) | Inline policy resources |
| --- | --- | --- |
| `munaxa-docs-eu-prod-image-publisher` (name is historical; boundary `…-eu-prod-image-publisher-boundary`) | `repo:munaxa@311481412/munaxa-docs@1318346271:environment:image-release`, ref `refs/tags/image/*`, `job_workflow_ref` = `publish-images.yml@refs/tags/image/*`, repository id/owner id pinned | `munaxa-docs/{antivirus,api,migrate,web}` (+ `*` for `ecr:GetAuthorizationToken`) |
| `munaxa-identity-image-publisher` | `…/munaxa-identity@1354378376:environment:image-release`, ref `image/*` | `munaxa-identity/{api,migrate}` |
| `munaxa-control-image-publisher` | `…/munaxa-control@1434295290:environment:image-release`, ref `image/*` | `munaxa-control/{api,migrate,portal}` |

Each push needs the protected `image-release` environment (owner approval) and an `image/<sha>` tag.
Observation [R], not changed: the Identity and Control publisher roles show no permissions boundary
in `GetRole` (the Docs one has one). Their inline policies are repository-scoped, so this is not
an exposure; it is noted for the deployment-IAM review that is already deferred.

## 6. Idle state [V]

ECS cluster `munaxa-nonprod`: 0 services, 0 running tasks. RDS `munaxa-nonprod-pg`: **stopped**.
Load balancers: none. Nothing is running.

## 7. Terraform state [not re-read]

The Docs bootstrap apply (2/3/0) was verified live in the previous thread (file 11 there); its
results are consistent with §4 and §5 here (repository present with the right settings; migrate ARN
in the publisher policy). The stack state was not read in this thread; the next nonprod `plan`
(Apply 1) reads it with a lock and is reviewed before any apply.
