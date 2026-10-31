# Next execution plan: after phase 2, 30 Oct 2026

## The single next phase: **Phase 3, G2 bootstrap and the first nonprod plan**

Everything in code that G2 depends on is in the repositories, provided the PRs in
[MASTER-EXECUTION-STATUS.md](MASTER-EXECUTION-STATUS.md) are merged. The next step that moves the
migration forward is the owner's first apply of `infra/aws/bootstrap`. After it comes a plan-only
run of the nonprod stack, which needs no further approval beyond reading the plan. This phase
**needs explicit approval for AWS writes** (G2), and this pass did not give it.

### Prerequisites (all must be true before step 3)

| # | Prerequisite | Who | State now |
| --- | --- | --- | --- |
| P-1 | platform#27 and platform#29 merged | Lead (standing merge rule) | #27: **merged** as `329a8b9` (head `811acf9` pinned); #29: **merged** as `c41f08d` (head `7af38e0` pinned) |
| P-2 | docs#168 merged (needed for the Docs image, not for G2) | Lead | **merged** as `23139a7` (head `53c44b5` pinned, 11 checks green) |
| P-3 | AWS connector signed in again, for **read-only** checks only | Tamer | Expired |
| P-4 | Read-only check: no `munaxa-shared-*` roles, state bucket or budgets exist yet (confirms Agent 1's "nothing applied") | Lead, read only | Not done (P-3) |
| P-5 | Read-only check: which account holds canteenhub-prod (N-2); tag inventory of the old Docs VPC (P9 residual) | Lead, read only | Not done (P-3) |
| P-6 | Read-only check: Cost Explorer for 22 to 31 Oct, to replace the 29 Oct figure | Lead, read only | Not done (P-3) |
| P-7 | Owner reads the OIDC subject setting of munaxa-platform and the four product repositories (P11). The trusts expect `repo:munaxa@311481412/<repo>@<id>:…` | Tamer, GitHub | Not done |
| P-8 | Protect munaxa-control `main` (TD-9) | Tamer, GitHub | Not done (recommended, not blocking) |

### Exact actions of Phase 3

1. **(Read only, lead)** Steps P-4 to P-6. Record the evidence in a new report directory.
2. **(Owner, AWS write, G2)** In CloudShell, as root (the 29 Oct decision): `terraform init` with the
   backend block disabled, then `terraform plan` in `infra/aws/bootstrap`. Expect about 46 resources:
   the state bucket and key, 11 ECR repositories with lifecycle policies, the boundary policy,
   `munaxa-shared-ci-{nonprod,prod}`, `munaxa-shared-deployer-{nonprod,prod}`, four image publishers,
   their inline policies, and two budgets. **Nothing should be destroyed or changed.** If anything is
   (P-4 failed), stop. Then `terraform apply`, restore the backend block, and
   `terraform init -migrate-state`.
3. **(Owner, GitHub settings)**
   - munaxa-platform repository variables: `AWS_CI_ROLE_ARN = ci_role_arns.nonprod` and
     `AWS_DEPLOYER_ROLE_ARN = deployer_role_arns.nonprod`.
   - `aws-prod` environment variables: the `prod` pair.
   - Environments: `aws-nonprod` and `aws-prod` (required reviewer, `main` only), `aws-nonprod-session`
     (`main` only), and `image-release` in each product repository (required reviewer, `image/*` tags).
   - Each product repository: `AWS_IMAGE_PUBLISHER_ROLE_ARN`.
4. **(Owner, Billing)** Activate `Environment` (and `Project`) as cost allocation tags (TD-12).
5. **(Lead, plan only)** Dispatch `aws-terraform.yml` with `nonprod` / `plan`. Read the plan. Confirm
   the OIDC chain works (P11) and that refresh reads the licence key policy (P10, only once the key
   exists, so at the first plan after G3). Record every planned address in
   `envs/nonprod.expected-changes.json` by PR (standing merge rule).
6. **Stop.** G3 (persistent-layer apply) is a separate approval.

### Not in Phase 3

G3 to G7 (persistent layer, secrets, images, Cloudflare, the first session), the Docs acceptance
checks, and G9 retirement. They follow in that order, as in the baseline plan
([`../2026-10-30/NEXT-EXECUTION-PLAN.md`](../2026-10-30/NEXT-EXECUTION-PLAN.md) Phases C and D). The
Docs acceptance checks are now listed in [DOCS-REPLACEMENT-AND-RETIREMENT.md](DOCS-REPLACEMENT-AND-RETIREMENT.md) §4.

### Rollback

The bootstrap creates only new resources with `munaxa-shared` names. Rolling back is
`terraform destroy` of the bootstrap, as root. The state bucket and ECR repositories must be emptied
first. Docs Production and canteenhub-prod are outside the bootstrap's resources.
