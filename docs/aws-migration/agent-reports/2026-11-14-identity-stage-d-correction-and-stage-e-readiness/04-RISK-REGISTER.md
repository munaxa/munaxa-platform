# 04. Risk register (14 Nov 2026)

Status reflects the direct read-only AWS checks of 14 Nov 20:36–20:40 UTC (02) and the GitHub evidence (03).

| Id | Risk | Status | Evidence | Next |
| --- | --- | --- | --- | --- |
| S-1 | Scheduled `down` failed at "Plan the switches" | **Resolved** | runs 43533662116 and 43574175677: "No changes", success (03) | none |
| S-2 | RDS-managed master-secret rotation fails while the database is stopped | **Open, Low, non-blocking** | rotation succeeded 13 Nov 17:26 while the database ran; next due about 20 Nov 23:59 when it is likely stopped; 14 Nov: rotation enabled, last rotated 13 Nov 17:26, next 20 Nov 23:59, **`AWSPENDING` still present** alongside `AWSCURRENT` and `AWSPREVIOUS` (02 C) | check the secret's stages on stage E day; review the Testing rotation period later |
| S-3 | `*.test.munaxa.com` certificate not auto-renewable while unused | **Open, Low, non-blocking** | ISSUED, not after 2027-05-22, renewal INELIGIBLE, in use by 0 (re-read 14 Nov) | attach it in a session or re-request before about April 2027 |
| B-1 | US$10 account budget alert-only | **Open, non-blocking; now exceeded** | **US$10.21 of 10** on 14 Nov (US$9.67 on 13 Nov) (03) | owner: keep as early warning or retire (06, D-N1) |
| B-2 | US$50 Testing budget | **Resolved** for stage D | US$2.38 of 50 on 14 Nov; stage D added no running resource (0 ALB, NAT, EIP, task) | re-read on stage E day |
| N-1 | RDS automatic restart after 7 days stopped; backstop must stop it | **Resolved for now** | stopped by the backstop 13 Nov 21:00–21:07; still `stopped` 14 Nov 20:36 with no RDS event since; 11 backstop schedules ENABLED (02 B) | next automatic start about 20 Nov; the 21:00 backstop and scheduled runs stop it |
| N-3 | Plan freshness | **Closed** | the apply used a plan made in its own dispatch | — |
| V-1 (new) | AWS connector refused calls from this thread for most of 14 Nov | **Resolved 20:35 UTC** | owner reconnected; reads succeeded 20:36–20:40 (02) | expect it again: the stage E plan needs a reconnect step (operator runbook C-1) |
| BE-1 (new) | Runbooks name revision `:1` (old 5277d71 image) for db-admin, migrate and bootstrap | **Open, High for stage E** | checklist lines 144–147, 285–310; operator runbook §4.3 | reconciled stage E runbook naming `:2` (05 §3) |
| BE-2 | Independent cleanup not built (unbounded ALB cost if control is lost) | **Open, blocks stage E** | PR #90 design only; no state machine in `infra/aws/stack` | owner decision D-E2 |
| BE-3 | No verification tool ready (probe not pinned or registered; throwaway helper not written) | **Open, blocks stage E** | `identity_probe_source` empty; runbook 03 §13 | D-E3 |
| BE-4 | Operator sign-in route undecided | **Open, blocks stage E** | runbook 03 §13 | D-E4 |
| BE-6 | Throwaway account left in the Testing database | **Open, needs acceptance** | runbook 03 §13 | D-E5 |
| BE-8 (new) | Option A connector scripts are unrun drafts and use `__name__`, which the connector sandbox refused on 13 Nov | **Open, blocks stage E** | `2026-11-11-identity-option-a-custody-cost-review/supporting/option-a-connector-scripts.DRAFT.py` | revise, test, review (D-E6) |

No risk was removed or downgraded without evidence. S-2, S-3 and B-1 are preserved as open.
