# 07. H-20 gate re-evaluation

**Overall status: BLOCKED.** H-20 has not passed. At least one condition cannot be true yet: a
real cleanup success within 26 h needs R to run first, at 18 Nov 21:05 UTC at the earliest. The
live conditions were not read today (connector sign-in, file 03 §5). H-20 was not run, bypassed
or changed.

**Gate implementation:** `scripts/aws/connector/h20-session-cleanup-gate-and-arm.py` on `main`
(`3453f13`), mode `gate`. It is read-only, and it is tested by
`scripts/aws/connector/test_session_cleanup_arm.py` (20 tests, all passing in this task's run of
the connector suite).

| # | Condition (as coded) | From code | From live evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | State machine `munaxa-nonprod-session-cleanup` exists, `ACTIVE`, `STANDARD` | Checked by `gate` (`DescribeStateMachine`) | Created by the D-B3 apply (run 44267788619). On 18 Nov 09:15 the session plan's `DescribeStateMachine` refresh succeeded; the error came at the next call. `status` not read | **NOT VERIFIED** live. The resource exists per the apply record |
| 2 | Its latest SUCCEEDED execution ended within 26 h | `ListExecutions(SUCCEEDED, max 1)` | No execution can exist from the repository's side before R at 21:05 UTC on 18 Nov | **NOT YET SATISFIED** |
| 3 | That latest success was a real run (`{"dryRun": false}`) | `DescribeExecution` input | Same as row 2. A later dry run would hide it (file 06 §4) | **NOT YET SATISFIED** |
| 4 | No execution RUNNING | `ListExecutions(RUNNING)` | Not read | **NOT VERIFIED** |
| 5 | Schedule R is ENABLED, targets the state machine with the backstop role and `{"dryRun": false}` | `GetSchedule` | Code: `cron(5 21 * * ? *)` UTC, `{"dryRun":false}`, role `session_backstop`. Created by the D-B3 apply. Not read live | **VERIFIED in code**. NOT VERIFIED live |
| 6 | Both alarms exist | `DescribeAlarms` | Created by the D-B3 apply. Not read | **NOT VERIFIED** live |
| 7 | Neither alarm is in ALARM | same | `not-run` may well be in ALARM now: missing data is breaching over 26 h, and there is no success yet. If R fails tonight, `failed` goes to ALARM | **NOT VERIFIED**. Likely not satisfied until R succeeds |
| 8 | No leftover P/S schedule of an earlier session | `ListSchedules(NamePrefix)` + the exact name pattern | No session has ever been armed (the `arm` mode was never run), so none should exist. Not read | **NOT VERIFIED** live. Expected to pass |
| 9 | The gate is enforced before every `up` | — | `aws-session.yml` `up` does **not** call H-20. The gate is a **procedural** step in the Stage E operator procedure (2026-11-14 report file 02 §8; 2026-11-15 file 09). `up` is a `workflow_dispatch` on `main`. The `aws-nonprod-session` environment has no required reviewer, so that the evening `down` can run unattended | **NOT ENFORCED BY CODE**. Procedural only (see below) |

## Categories

| Category | Conditions |
| --- | --- |
| Verified from live evidence (today) | none (connector blocked). Indirectly: the state machine resource exists (1) |
| Verified only from code | 5 (R target and input), 8 (only the `arm` mode creates P/S, and it never ran), the gate logic itself (20 tests) |
| Not yet satisfied | 2, 3 (no real success yet); 7 likely |
| Cannot be checked without an authorized operation | None strictly. Every gate read is read-only and already approved for this task, but blocked by the connector sign-in. Row 3 becomes checkable only after R has run, and R is already authorized by the D-B3 design |

## Row 9: H-20 is not enforced by code

- **Risk.** Today nothing technical stops a `workflow_dispatch` of `aws-session.yml` with `up`
  without H-20. Until D-B2R is applied, such a run fails anyway, at the same refresh error.
- **Current mitigations:**
  - only repository writers can dispatch;
  - Stage E is not authorized (D-E NO);
  - the backstop at 21:00 UTC, R at 21:05 UTC and the scheduled `down` limit any session to the same day.
- **Not done here.** This task does not change it, because H-20 must not be modified. A future,
  separately approved option is a read-only gate step in the `up` path of `aws-session.yml`. It
  would need the session role to gain `states:ListExecutions` and `states:DescribeExecution` on the
  cleanup state machine (`scheduler:ListSchedules`, `scheduler:GetSchedule` and
  `cloudwatch:DescribeAlarms` are already in `deployer_read`). That would be a bootstrap change with
  its own plan and apply. It is recorded as risk R-4 in file 09.

## Earliest possible PASS (not a prediction)

1. R runs at 18 Nov 21:05 UTC and SUCCEEDS.
2. No dry run happens after it.
3. Both alarms are OK.
4. Then `gate` can pass from about 21:20 UTC on 18 Nov until 23:05 UTC on 19 Nov, and again after each successful R.

`arm` additionally refuses any session whose S time would cross 21:00 UTC. Even then, H-20 is
only one of the Stage E preconditions, and Stage E is NOT AUTHORIZED.
