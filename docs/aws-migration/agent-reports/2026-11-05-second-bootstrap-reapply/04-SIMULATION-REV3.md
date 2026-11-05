# Owner simulation revision 3: result

**Date:** 5 Nov 2026.
**Run by:** the owner, as root, in CloudShell, after the approved second bootstrap re-apply at `6b8997a4f9793989abfddae205b4dd6f4ed1d20c`.

**Script:** `2026-11-05-phase7/supporting/simulation/b2-owner-simulation.sh` (revision 3).
- sha256 `12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b`.
- 481 read-only calls.

This report was written by the lead. The lead made no AWS call.

## Result [O-ev]

```
RESULT total=481 expected_match=477 unexpected_mismatch=4 api_errors=0 harness_errors=0 expected_total=481 complete=yes results=/tmp/p7/simulation-rev3.tsv
```

**Required:**
- 481/481 expected_match;
- 0 unexpected_mismatch;
- 0 api_errors;
- 0 harness_errors.

**The simulation is NOT PASSED.** Script exit code 1, which means mismatches.

## The four mismatches [O-ev]

Every resource below begins with `arn:aws:logs:eu-central-1:229251310592:`.

| Case | Principal | Action | Resource | Expected | Actual | Description (script) |
| --- | --- | --- | --- | --- | --- | --- |
| D30.1 | `munaxa-shared-deployer-nonprod` | `logs:GetLogEvents` | `log-group:/aws/other:log-stream:x` | explicitDeny | implicitDeny | Read foreign log events: refused by NoLogOrDatabaseData |
| LD01.1 | `munaxa-shared-deployer-nonprod` | `logs:GetLogEvents` | `log-group:/munaxa/nonprod/identity:log-stream:ecs/identity/1` | explicitDeny | implicitDeny | Nonprod deployer: data read/export on OWN resource |
| LD30.1 | `munaxa-shared-deployer-prod` | `logs:GetLogEvents` | `log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` | explicitDeny | implicitDeny | Prod deployer: read own log events refused |
| LD50.1 | `munaxa-shared-deployer-nonprod` | `logs:GetLogEvents` | `log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` | explicitDeny | implicitDeny | Nonprod deployer: read PROD log events (cross-environment) |

**Context for all four:** `aws:RequestedRegion=eu-central-1` only [V-repo].

**Common pattern.** All four are the same action on a log-stream ARN, with the same wrong-direction result: no statement matched.

## What the result does and does not show

**What passed** [O-ev]:
- **Preflight.** The run would have stopped otherwise. It confirmed these platform#43 markers in the live policies:
  - `NoLogOrDatabaseData`, `NoExportableCertificates`, `NeverExportCertificates` and `iam:ListRoleTags` in both `-allow` policies;
  - `NeverFromADeployerSession` in both boundaries;
  - `TestingBackstop` in the nonprod boundary only;
  - `SessionNeverSecurityGroupRules` and `SessionNeverNetworkPlacement` in the session policy, and the old `SessionIngressOnOwnGroups` is gone.
- **The 477 other cases matched,** including:
  - every other R10 log, RDS and ECS Exec case;
  - every session security-group rule and network-placement case;
  - every boundary and backstop-boundary case.

**What is not shown:**
- **The `GetLogEvents` deny has not been observed in AWS.** This matters for own-environment logs (LD01.1, LD30.1).
- **`api_errors=0` proves only that the calls were well-formed.** It does not prove that the policies are secure.
- **The full TSV is still on the owner's CloudShell.** Only the four FAIL lines were supplied [U for the 477 rows' detail].

**Root causes and remediation:** see `06` and `07`.

**Status: NOT VERIFIED.** Verdict: `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` (`00`).
