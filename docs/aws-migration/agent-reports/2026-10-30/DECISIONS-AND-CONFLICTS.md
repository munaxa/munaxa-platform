# Decisions and conflicts: AWS Testing, 30 Oct 2026

Nothing here is resolved silently. Where agents disagree, both positions are recorded and the item
is left for Tamer or for the owning agent, as marked.

## 1. Decisions already implemented

| #   | Decision                                                                                                                                                           | Where it shows                                                                 | Implemented by                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| D1  | Account `229251310592`, region `eu-central-1`, Testing hostnames `*.test.munaxa.com` (G1)                                                                          | contract §1                                                                    | platform#24 to #26                                                    |
| D2  | Owner works as root until launch; no IAM users or access keys; no Identity Center                                                                                  | project rule                                                                   | No agent created IAM users or keys                                    |
| D3  | Licences signed with an AWS KMS asymmetric key                                                                                                                     | control#4, platform `services.tf`                                              | Control and platform. **But see X9:** ADR-0008 still reads "Proposed" |
| D4  | Operator access through Cloudflare Access on `operator-test.munaxa.com`; Control verifies the Access JWT                                                           | control#5, #6; `edge.tf`                                                       | Control, platform                                                     |
| D5  | Public ECS tasks with public IPv4, no NAT, isolated DB subnets                                                                                                     | `network.tf`                                                                   | platform (validated by Agent 1, 01 §3)                                |
| D6  | Testing runs on demand only, with a 20:00 UTC session-down cron and a budget alert as backstop                                                                     | `aws-session.yml`, `bootstrap/budget.tf`                                       | platform#26                                                           |
| D7  | Docs reuses its existing ECR repos, pull only, inside the shared stack (`stack/docs.tf`)                                                                           | platform#26                                                                    | Agent 1, resolving R-01 / X2                                          |
| D8  | Docs keeps database per tenant on the shared RDS, with a fail-closed CONNECT check on `edms_backup`                                                                | platform#26                                                                    | Agent 1 (R-14 / X5)                                                   |
| D9  | School and Docs keep their own sign-in for Testing; only Work and Control verify Identity tokens                                                                   | contract §7                                                                    | all                                                                   |
| D10 | Identity bootstrap password via a one-run secret, never an ECS override                                                                                            | identity#4, platform#26 `cfb01ee`                                              | Agents 3 and 1 (R-16)                                                 |
| D11 | Standing rule (30 Oct): merge eligible PRs automatically when every required check is green, no critical or high finding, and nothing deploys or migrates on merge | every merge listed in [MASTER-EXECUTION-STATUS.md](MASTER-EXECUTION-STATUS.md) | all owner agents                                                      |
| D12 | G9 closed: Render, Supabase and the old Docs Production stack stay                                                                                                 | all reports                                                                    | —                                                                     |

## 2. Decisions still pending (Tamer)

| #      | Decision                                                                                    | Options as the agents state them                                                                                                                                                                                                                                                                             | Raised by                 |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **P1** | **B2 / R-02 / X1: does the US$50 target cover Testing only, or the whole account?**         | (a) Testing only: raise `budget_limit_usd` or scope the budget, since Testing alone fits (about 120 to 130 session hours). (b) Whole account: the account is above US$50 before any session while the old Docs stack (about US$47.8 a month idle) runs, and G9 is closed. Agent 7: the two cannot both hold. | Agent 7, Agent 1, Agent 4 |
| **P2** | **I2 / R-06 / C5 / W5: per-product token audiences before Production**                      | Today one token is valid for Work and Control. Accepted for Testing. Fix is Identity code work.                                                                                                                                                                                                              | Agents 3, 2, 5, 7         |
| **P3** | **I3 / C6: MFA claim from Identity before Production**                                      | Today `mfaSatisfied` is always false; Cloudflare Access is the operator's second factor, so the Access policy must require MFA (G6).                                                                                                                                                                         | Agents 3, 2, 7            |
| P4     | P9: restrict the deployer away from the Docs Production VPC, security groups and ALB        | Agent 1 recommends a deny by the Docs stack's `ManagedBy` tag.                                                                                                                                                                                                                                               | Agent 1                   |
| P5     | ADR-0008 (KMS licence signing): change status from "Proposed" to accepted                   | The code and stack already assume KMS (D3).                                                                                                                                                                                                                                                                  | Agent 2 (B8)              |
| P6     | R-05 / S4 / X4: Firebase sign-in for School on Testing                                      | Add three keys to the `school-api` bundle, or leave it off.                                                                                                                                                                                                                                                  | Agents 6, 7               |
| P7     | How to seed School's first platform-owner login on AWS                                      | No ECS task exists; `seed-environment.yml` runs from a CI runner that cannot reach private RDS. **In progress:** the coordinator asked Agent 1 for a `school-bootstrap` run-only task (no PR at 18:45 UTC). Tamer confirms the approach when that PR lands.                                                  | Agent 6                   |
| P8     | Protect munaxa-control `main` (C8)                                                          | Branch protection with required checks, as in the other repositories.                                                                                                                                                                                                                                        | Agents 2, 7               |
| P9     | W3: Work's GHCR publish workflow shares the `image/**` tag and has no protected environment | Retire with Render (G9 closed), or give it its own tag prefix.                                                                                                                                                                                                                                               | Agent 5                   |

## 3. Conflicting recommendations between agents

| #   | Topic                                                | Position A                                                                                          | Position B                                                                                                                        | State                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | Budget scope                                         | Kickoff: "testing budget target" about US$50                                                        | Contract §10 and `bootstrap/budget.tf`: US$50 for the **whole account**                                                           | **Unresolved; P1**                                                                                                                                                                                                                      |
| X2  | Docs images                                          | Agent 4: reuse `munaxa-docs/*` ECR                                                                  | Agent 7: the boundary's `NeverMunaxaDocs` deny blocks it (R-01)                                                                   | Resolved by Agent 1 (D7)                                                                                                                                                                                                                |
| X3  | Control and the platform                             | Agent 2 (first report): no platform change needed                                                   | Agent 7 and Agent 2's own C4: ALB admin deny was case-sensitive                                                                   | Resolved (platform#26 `875083a`)                                                                                                                                                                                                        |
| X4  | School Firebase severity                             | Agent 6: optional, owner choice (S4 Medium)                                                         | Agent 7: Medium, because the #20 fix cannot be accepted on AWS without it                                                         | **Open; P6**                                                                                                                                                                                                                            |
| X5  | Database model                                       | Shared stack: one database per product                                                              | Docs: database per tenant with a BYPASSRLS backup role                                                                            | Accepted with a fail-closed check (D8)                                                                                                                                                                                                  |
| X6  | Authentication model                                 | Work, Control: Identity ES256                                                                       | School: own HS256 JWT plus Firebase; Docs: own auth, MFA, OIDC/SAML; Identity has no OIDC                                         | Accepted for Testing; SSO later                                                                                                                                                                                                         |
| X7  | Severity of R-15 / S9 (School mobile Content-Length) | Agent 7: Medium                                                                                     | Agent 6: Low, outside Testing, not reproduced                                                                                     | **Open**; both agree it is outside Testing                                                                                                                                                                                              |
| X8  | Cost model                                           | Agent 1: idle about US$13, about US$0.30 per hour for all 10 services, about 120 hours within US$50 | Agent 7: idle about US$11, US$0.21 without Docs and US$0.30 with Docs, about 130 hours                                            | **Open**; both are list prices from memory [A]. Differences come from counting 10 bundles plus the RDS master secret (Agent 1) against 8 to 9 (Agent 7), and IPv4 counts (12 against 9 to 10). A live Pricing API check would settle it |
| X9  | KMS signing decision                                 | Project decision of 30 Oct: KMS asymmetric signing for Control                                      | `docs/adr/0008-licence-signing-key-in-aws-kms.md` on control `main`: "Status Proposed, Approval Pending the owner's decision" [V] | **Open; P5** (a documentation mismatch, not a code one)                                                                                                                                                                                 |
| X10 | Severity of R-14                                     | Agent 1: "Fixed: fails closed"                                                                      | Agent 7: "Mitigated, residual Low (the check runs only with that task)"                                                           | Recorded; no action asked                                                                                                                                                                                                               |

## 4. Architectural inconsistencies

1. **Stale ledger statements.** `supporting/AWS-EXECUTION-BACKLOG.md` and
   `supporting/BLOCKERS-AND-OWNER-ACTIONS.md` say "Agent 1 filed no report" and, in B4, list R-04,
   `TRUST_PROXY_HOPS` and the budget alert as open items while also marking B4 resolved. Those items
   are fixed in platform#26. `DEPLOYMENT-SEQUENCE.md` step 0 lists PRs already merged and step 1 still
   asks for the T10 decision, made in platform#26.
2. **Finding ids differ between reports.** Agent 7 X8 cites Work's GHCR finding as "Agent 5 W2";
   in Agent 5's final report it is **W3** (W2 is the action pinning). The same Work OpenAPI item is
   W4 (Agent 5), T13 (ledger) and "W3 / T13" (Agent 7 register).
3. **docs#167 head mismatch.** GitHub's PR head is `6f0ea79`; the branch is at `a53852d`. Every
   green pull_request check is on `6f0ea79`. The R-07b fix is only on `a53852d`.
4. **Agent 1's final report is not cross-reviewed by Agent 7.** Agent 7's register has no entry for
   Agent 1's P9 (deployer scope), P10 or P11, and Agent 7 §5 does not mention the School seeding gap.
   Those items are recorded here from the owner reports only.
5. **F-3 drift risk.** Platform vendors Docs' cluster roles SQL (with a sha256). Agent 4 raised it;
   Agent 1's report does not list it.
6. **CI coverage differs.** Work CI runs only on `pull_request` and skips Markdown-only changes, so
   work#26 merged with no CI run (`mergeable_state: clean`). Platform CI runs every check on every PR,
   including Markdown-only ones, by design (`ci.yml` header).
7. **`prod.tfvars` not re-audited** (Agent 1 §2). Production values for the new Docs and storage
   resources are unchecked.
8. **ALB allow-list is case-sensitive** by design: clients must call Control with lowercase paths.
9. **Identity on the operator host sees the Cloudflare edge IP** with one trusted hop (I6), so the
   per-IP limit there is per edge node. Accepted because the host is behind Access.

## 5. Items requiring Tamer's decision or action

Decisions:

1. **P1:** the scope of the US$50 target (whole account or Testing only).
2. **P2:** per-product token audiences before Production (I2 / R-06).
3. **P3:** an Identity MFA claim before Production (I3); meanwhile the Access policy must require MFA.
4. P4: the deployer's reach over the Docs Production network (P9).
5. P5: mark ADR-0008 accepted.
6. P6: Firebase for School on Testing.
7. P7: how School's first platform owner is seeded on AWS.
8. P9: the Work GHCR workflow (W3).

Actions (no code change by an agent can replace them):

1. Press "Update branch" on [docs#167](https://github.com/munaxa/munaxa-docs/pull/167) or check
   githubstatus.com, so GitHub syncs the head to `a53852d`.
2. Protect munaxa-control `main` (P8).
3. G2: re-apply `infra/aws/bootstrap` as root in CloudShell; set the three role-ARN variables and the
   GitHub environments.
4. G3 approval, G4 secret values, G5 image publication, G6 Cloudflare.
5. Run the Identity operator-organisation and Control-role runbook steps after the first
   `identity-migrate`.
6. Sign in to the AWS connector again on claude.ai, so cost and resource state can be read live.
