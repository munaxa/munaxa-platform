# Next execution plan: after phase 4 (G2), 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

> **G3 requires separate, explicit approval from Tamer.** Nothing in this phase authorises it.

## 1. The next permitted activity

1. [O] Finish the G2 GitHub owner actions (§2), in order.
2. Lead, after (1): dispatch `aws-terraform.yml` with `nonprod` / `plan` (read only). This proves
   the OIDC → CI role → deployer chain end to end with the fixed deployer policy, and lists every
   address for `stack/envs/nonprod.expected-changes.json` (by PR, standing merge rule). **No apply.**

## 2. GitHub owner actions (exact order) [O]

1. **munaxa-platform → Settings → Environments**, create before any variable:
   - `aws-nonprod`: required reviewer `tam2om`; deployment branches: `main` only.
   - `aws-prod`: required reviewer `tam2om`; deployment branches: `main` only.
   - `aws-nonprod-session`: deployment branches: `main` only.
2. **munaxa-platform → Settings → Secrets and variables → Actions → Variables**:
   - Repository: `AWS_CI_ROLE_ARN` = `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod`;
     `AWS_DEPLOYER_ROLE_ARN` = `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`.
   - Environment `aws-prod`: `AWS_CI_ROLE_ARN` = `…/munaxa-shared-ci-prod`;
     `AWS_DEPLOYER_ROLE_ARN` = `…/munaxa-shared-deployer-prod`.
3. **munaxa-identity, munaxa-control, munaxa-work, munaxa-school**: environment `image-release`
   (required reviewer `tam2om`; deployment tags `image/*` only), then repository variable
   `AWS_IMAGE_PUBLISHER_ROLE_ARN` = `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-<product>-image-publisher`.

These are role names, not credentials. Never widen a trust or drop a protection to make a job pass.

## 3. G3 prerequisites

| # | Prerequisite | Who |
| --- | --- | --- |
| 1 | §2 complete | Owner |
| 2 | First nonprod **plan** run green and read; expected-changes file merged | Lead |
| 3 | **B2 / TD-14**: Docs VPC tag inventory (read only, CloudShell) and the owner's confirmation that non-Munaxa resources carry a `Project` tag (or an approved allow-list condition) | Owner |
| 4 | Simulations in any future runbook include `aws:RequestedRegion` (G2-2) | Lead |
| 5 | **Explicit G3 approval** | Tamer |

## 4. Not next

G3 to G7, G9, production, image publication, secrets, Cloudflare/DNS, Render, Supabase, remote
migrations. CanteenHub is out of scope entirely.
