# Next execution plan: after phase 3, 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required.

## The next step: **G2, the bootstrap apply, by Tamer, after explicit approval**

Everything G2 depends on is in `main` of munaxa-platform (after platform#31) and is verified locally
and in CI (MASTER-EXECUTION-STATUS). The exact sequence, commands, expected resources, costs,
rollback and success criteria are in [G2-BOOTSTRAP-READINESS.md](G2-BOOTSTRAP-READINESS.md) §3 to §9.
**None of it has been run.**

| # | Step | Who | Approval |
| --- | --- | --- | --- |
| 1 | G2 steps 0 to 4: pre-checks, plan (expect `{"create":49}`), apply the saved plan, migrate state, verify (including the deny simulations) | Tamer, root, CloudShell | **G2** |
| 2 | Billing: activate `Environment` and `Project` cost allocation tags (TD-12) | Tamer | Part of G2 |
| 3 | GitHub: environments first, then variables (G2 step 6) | Tamer | Part of G2 |
| 4 | Sign the AWS connector out (S-ROOT) | Tamer | — |
| 5 | Tell the lead the `main` SHA applied and the step 2 and 4 outputs (role ARNs are not secrets) | Tamer | — |
| 6 | Dispatch `aws-terraform.yml` `nonprod` / `plan` (read only); confirm the OIDC chain end to end; list every planned address into `stack/envs/nonprod.expected-changes.json` by PR (standing merge rule) | Lead | None beyond reading the plan |
| 7 | Before G3: Docs VPC tag inventory (read only, in CloudShell) and TD-14 | Tamer | — |
| 8 | **Stop.** G3 (persistent layer apply) is a separate approval | — | G3 |

## If G2 does not go as expected

- Step 1 shows any `munaxa-shared*` resource already present, or step 2 shows anything other than 49
  creates: stop, keep the output, do not apply. Report to the lead.
- Apply fails part way: see G2-BOOTSTRAP-READINESS §8.

## Not in the next phase

G3 to G7, Docs acceptance, G9 retirement, any production change, any Cloudflare, Render or Supabase
change. CanteenHub is out of scope entirely.
