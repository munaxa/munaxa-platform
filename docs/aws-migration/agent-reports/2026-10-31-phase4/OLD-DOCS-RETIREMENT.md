# Old Docs Production retirement (G9 for Docs): status as of 4 Nov 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

**Source.** This work ran in a separate project thread ("Stop old Docs stack to save cost"), not
in the G2 execution. Everything below is **as reported by that thread [U]**. The AWS connector was
signed out, so this report has not checked any of it against AWS independently. The PR numbers and
workflow run ids can be checked on GitHub.

## 1. Decision

On 31 Oct 2026 (13:17 UTC), Tamer chose **full retirement** of the old Docs eu-prod stack
(munaxa-docs `infra/terraform/eu-prod/{service,data,core}`), approving G9 for Docs early, ahead of
Testing acceptance. The Docs **bootstrap** is kept. The route was munaxa-docs' reviewed
`terraform-eu-prod.yml` workflow, using saved plans, declared expected changes and the owner's
`production` environment approvals. CloudShell was not used, because root cannot assume the Docs
deployer.

## 2. What was done [U, reported]

| Step | PR / run | Result |
| --- | --- | --- |
| Stage 1: deletion protection off, backup plan removed | docs#169; service run 41205852343, data run 41786425002 (after docs#171 declared the backup policy update) | Applied |
| Stage 2 declarations | docs#172 (`1f47ba4`), docs#173 (`64c999c`), docs#174 | Merged |
| Service root teardown | run 41787804456 | 26 deleted; root empty |
| Data root teardown | run 41788878315 (15 deleted, including RDS with a final snapshot and the bucket), then final run **41797685617** at **08:21 UTC on 4 Nov** (KMS key) | Root empty |
| Core root teardown | run 41794933464 | 59 deleted; root empty |
| Backup vault `munaxa-docs-eu-prod` | Tamer deleted the 1 Nov recovery point manually, as root (the deployer cannot) | Vault removed |

PRs in munaxa-docs for this retirement: **#171, #172, #173, #174** (plus stage 1, #169).

## 3. What remains

| Item | State |
| --- | --- |
| Docs bootstrap: state bucket, GitHub OIDC provider, Docs ECR repositories, budgets (`munaxa-account-monthly`, `munaxa-docs-eu-prod-monthly`), CloudTrail | **Kept** [U]. The shared bootstrap reads the same OIDC provider (G2) |
| Final RDS snapshot `munaxa-docs-eu-prod-pg-final` | Kept. It is encrypted with the data KMS key, which is pending deletion until about **4 Dec 2026**. After that the snapshot can no longer be restored |
| **Owner action [O]** | Around **4 Dec 2026**, delete the snapshot `munaxa-docs-eu-prod-pg-final`, or cancel the key deletion if the snapshot should be kept |

## 4. Effect on the migration

- **Cost:** about **US$48 a month** of old Docs idle cost (the 29 Oct measurement: ALB, public IPv4,
  RDS, storage, KMS, secrets) is removed [E]. Until the key is deleted, the KMS key pending deletion
  and the snapshot storage cost a little [E]. After G2, the account is expected at roughly US$1 to 2.30
  a month plus the Docs bootstrap, until G3 [E] (COST-AND-TRANSITION-ANALYSIS).
- **Overlap removed:** the "Old Docs + Testing" overlap in the phase 2 to 4 cost tables no longer
  applies. Docs exists only as the clean recreation planned in the shared stack (`stack/docs.tf`,
  from G3), with a clean database and empty storage, as decided.
- **Security:** the deployer's Docs denies, by name and by `Project = MunaxaDocs`, stay in place.
  They are harmless now and still protect the kept Docs bootstrap. The P9 part of the untagged-resource
  residual shrinks, because the old Docs VPC no longer exists [U]. TD-14 still applies to any
  non-Munaxa resources.
- **Earlier statements:** the phase 4 statement "old Docs Production untouched" is true of **G2**,
  which never addressed a Docs resource. The retirement was a separate, owner-approved activity.
