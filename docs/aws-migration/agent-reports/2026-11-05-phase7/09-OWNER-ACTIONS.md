# Phase 7: owner actions

Date: 5 Nov 2026. Lead. Only decisions or approvals that need Tamer are listed, in order. Nothing here has been done.

| # | Action | Type | Details | Stop condition |
| --- | --- | --- | --- | --- |
| 1 | **Approve the second bootstrap re-apply** at `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` | Decision, then root in CloudShell | `08-SECOND-BOOTSTRAP-RUNBOOK.md`, stages 1 to 3. Expected `0 to add, 5 to change, 0 to destroy`, then simulation revision 3 `RESULT total=481 expected_match=481 unexpected_mismatch=0 …`, exit 0 | Anything else in the plan; simulation exit other than 0 |
| 2 | **GitHub protection, phase A** (D-5) | GitHub settings, owner only | `05` §6, steps O-2 to O-6. These steps create tag rulesets for `image/*` in identity, control, work and school, the `image-release` environments with tam2om as reviewer, and the main rulesets in the four product repositories. They also add "Format, validate, mocked plan tests" to platform ruleset 20906222. The JSON is in `supporting/rulesets/` | - |
| 3 | **Decide the bot identity** (D-5, R14) | Decision | Recommended: machine user `munaxa-bot`, Write role, connected to Claude; then phase B rulesets (1 approval). This ends Claude merging its own PRs: you approve each one | - |
| 4 | **Approve G3** (64 creates) and G6 DNS within 72 h | Separate approvals | A G3 declaration PR comes first, then a fresh plan (it must be 64 with the same addresses), then the apply, then `down` | Any difference from `07` |
| 5 | **Approve the backstop apply** right after G3 (D-4 = B) | Separate approval | `supporting/backstop/backstop-separate-apply.md`: one tfvars line, a 13-create declaration, a plan and an apply. It needs item 1 done first | Anything other than the 13 addresses |
| 6 | **Verify the backstop and P4 before the first session** | Owner read-only checks | After the first 21:00 UTC run, the Scheduler metrics show no target errors. The session plan check refuses security-group rule and placement changes. Agent 7's M-3 checks are in `10` §5 | Any target error |
| 7 | **Product prerequisites** | Owner secrets, images, Cloudflare Access | `06` §8. This covers publishing images by digest with `image-release` approval, the secret values, `operator_access`, the Identity keys, and the two-step Control bring-up | - |
| 8 | **Confirm the R4 scope** (review I-3) | Decision | R4 was accepted "for G3". The default-group adoption permission stays live through Testing. Confirm that the acceptance covers Testing sessions too, or ask for the stack change earlier | - |

## Follow-up code work (no owner approval needed; next phase)

- **06 F-1 to F-4:** fix the README G7 order, state that each config PR needs a services-off apply, and add the Work role assignment step. Also update stale text.
- **Review L-1:** replace the enumerated logs deny with a broader one.
- **Review L-2:** scope `TestingBackstop` to the backstop role with `aws:PrincipalArn`.
- **Review L-3:** add `aws:SourceArn` to the backstop trust.

All three review items change the bootstrap or the stack, so they need another re-apply.

## Carried over

- **About 4 Dec 2026:** delete the old Docs final snapshot, or cancel its key deletion.
- **TD-13:** the US$10 `munaxa-account-monthly` budget will alert every month after G3.
