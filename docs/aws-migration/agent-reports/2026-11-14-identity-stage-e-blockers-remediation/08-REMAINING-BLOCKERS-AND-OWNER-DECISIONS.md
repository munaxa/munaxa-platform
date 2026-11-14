# Remaining blockers and owner decisions

Everything below is outside the repository. This PR performed none of it. Each needs the owner's
explicit approval, in this order.

## 1. Owner decisions (yes or no)

| # | Decision | Recommendation | Detail |
| --- | --- | --- | --- |
| D-BE4 | Skip operator sign-in in Stage E; one throwaway account per probe run; disable it afterwards | **Yes** | file 04 |
| D-PR | Merge this PR (after ChatGPT review) | Yes, once reviewed | changes no plan (Terraform tests) |
| D-B2 | Root bootstrap apply with `testing_session_cleanup = true` (CloudShell, owner) | Yes | file 02 §7: 2 updates, 2 creates, nonprod boundary only |
| D-B3 | Stack nonprod configuration PR and apply: `session_cleanup_enabled = true` | Yes | file 02 §7: 8 creates, 1 update; session down |
| D-B4 | One dry-run execution `{"dryRun": true}` through the connector | Yes | validates the [U] items; changes nothing |
| D-B5 | Subscribe an email address to `munaxa-nonprod-session-cleanup-alerts` | Yes | owner, outside the repository |
| D-PIN | Probe pin PR (`identity_probe_source` + manifest `probePin`) and its apply | Yes | file 03 §4: 1 create (the probe task definition) |
| D-LA0 | Before C-8: one connector call that shows what the connector records for a script's AWS calls (a harmless read, then a check of the returned `api_calls`), to size the L-A0 residual | Yes | file 06, section 5; if parameters or responses are recorded, C-8 must change before it runs |
| D-E | Stage E itself (session up, C-8, bootstrap, probe, clean-up, C-16, C-24, down) | After all above | separate approval, per the corrected runbook |

## 2. Remaining blockers before Stage E

| Blocker | Closed by |
| --- | --- |
| The cleanup is built but not deployed (no protection yet against an unbounded ALB) | D-B2, D-B3, then D-B4 passing, then D-B5, then one real run of R (the gate needs a real success within 26 h); H-20 `gate` must pass before every `up`, and `disarm` runs after every verified `down` |
| The probe has no task definition | D-PIN |
| The [U] items: Step Functions SDK error names and response casing (file 02 §9), `RunTask` `clientToken` and `DescribeTaskDefinition` field shapes through the connector (file 01 §6), the probe hand-off volume and `dependsOn SUCCESS` (file 03 §5), the sandbox's exact behaviour (file 05 §5) | the B-4 dry run; the first E-1 `discover` and `run`; the first probe run (each fails closed if wrong) |
| The connector's own record of call parameters (L-A0 size unknown) | D-LA0 |
| `discover` must report all five families `valid: true` on the live account | first step of Stage E; any `valid: false` stops it (file 01 §4) |

## 3. Not a blocker, recorded

- Accepted Low review findings: file 06.
- Untested in Stage E by design (operator sign-in, privileged MFA policy, password reset, lockout
  expiry, token revocation at relying parties): file 04 §7.
- Residue: one tenant row and one disabled throwaway account per probe run in the Testing
  database (file 04 §6).
- L-A0 (operator password in the connector's sandbox memory during C-8) stays accepted as on
  11 Nov.
