# Munaxa AWS migration: agent reports index

This folder is **the single place for every agent report** on the Munaxa AWS migration, so that a
reviewer (human or ChatGPT) can read all of them from one link:
`https://github.com/munaxa/munaxa-platform/tree/main/docs/aws-migration/agent-reports`.
New reports go into a new dated folder here (never overwrite an older one), and get a line in this index.

Labels used in the reports: **[V]** verified, **[E]** estimated, **[R]** recommended,
**[U]** unverified, **[O]** owner action required. Start each folder at `00-lead-orchestrator.md`.

## Reports, newest first

| Folder | Date | Summary |
| --- | --- | --- |
| [2026-11-04-phase5/](2026-11-04-phase5/) | 4 Nov 2026 | **Phase 5: G3 plan preparation, G3 not applied.** Six parallel agents incl. an independent reviewer. Merged platform#37 (session guard, DB always stopped, no plan values in logs), platform#38 (B2/TD-14 allow-list deployers, per-env boundaries, state key protection, session-only roles: **code only, root re-apply pending**), identity#5 and work#28 (RDS CA bundle). Mocked G3 plan 64 creates. Real plan run 41820815532: OIDC to CI role works, then stopped: `AWS_DEPLOYER_ROLE_ARN` lacks the role path [O]. Testing cost about US$14 idle, about 117 session hours under US$50 |
| [2026-10-31-phase4/OLD-DOCS-RETIREMENT.md](2026-10-31-phase4/OLD-DOCS-RETIREMENT.md) | 4 Nov 2026 | **Old Docs eu-prod fully retired** (G9 for Docs, approved 31 Oct): service (26), data and core (59) roots emptied via munaxa-docs `terraform-eu-prod.yml`, docs#171 to #174, final run 41797685617 at 08:21 UTC. Docs bootstrap kept; ≈ US$48 a month saved; delete the final snapshot around 4 Dec. Reported by the separate retirement thread, not independently verified |
| [2026-10-31-phase4/](2026-10-31-phase4/) | 31 Oct to 4 Nov 2026 | **G2 executed.** Shared bootstrap applied as root in CloudShell (49 created), state in S3, deployer N-2 over-deny found and fixed (platform#33, 2 changed), all simulations as intended, cost tags active, GitHub environments and variables reported done (platform#34, #35). G3 not executed |
| [2026-10-31-phase3/](2026-10-31-phase3/) | 31 Oct 2026 | Pre-G2 verification: OIDC subjects verified from issued tokens (P11), N-2 project deny (platform#31), G2 runbook with the 49-resource inventory; READY FOR G2 |
| [2026-10-30-phase2/](2026-10-30-phase2/) | 30 Oct 2026 | Phase 2 execution: per-environment CI and deployer roles, Docs Production denies (P9/R-17, platform#29), Work OpenAPI off and School bootstrap (platform#27), docs#168, Control ADR-0008 (KMS) |
| [2026-10-30/](2026-10-30/) | 30 Oct 2026 | AWS Testing platform planning: seven specialist agent reports (platform, Control, Identity, Docs, Work, School, independent security/cost review), shared contract and consolidated plan |

## Related material outside this folder

- `infra/aws/README.md` and `infra/aws/CONTRACT.md` (this repository): the architecture, gates G1 to G9 and the shared contract.
- Earlier working files (29 to 30 Oct: AWS foundation, licensing, status brief, Testing drafts) live in the project's shared files folder. The Testing agent reports there were copied byte for byte into `2026-10-30/`.
- munaxa-docs: the retirement PRs (#169, #171 to #174) and the `terraform-eu-prod.yml` workflow runs listed in the retirement report.
