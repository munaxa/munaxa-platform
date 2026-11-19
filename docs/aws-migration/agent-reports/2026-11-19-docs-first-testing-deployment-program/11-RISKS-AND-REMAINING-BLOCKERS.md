# 11. Risks, remaining blockers, and what was not done

## 1. Blockers to the first Docs Testing deployment

| Id | Blocker | Owner of the next step |
| --- | --- | --- |
| B-E | Identity Stage E not run | owner yes (A-1) |
| G-D1 | no `munaxa-docs/migrate` repository | owner yes (A-3) |
| G-D2 | no current Docs image | owner yes (A-5) |
| G-D3 | Docs bundles empty | owner runs the script (A-4) |
| G-D4 | no Resend key | owner decision (A-6) |
| B-CF | no Cloudflare Access application for the operator host | owner (A-7) |
| G-D5 | no Control credential | steps C-1 to C-4 |

## 2. Blockers to production

AW-02 (separate production account decision), AW-06 (egress: NAT or endpoints), AW-07, AW-09, AW-10, DC-02, DC-03, DC-04, the production Identity cache deployment, production Cloudflare Access and DNS (`docs.munaxa.com`), Resend with a verified domain, School findings SC-04 to SC-07 (School only), Work product gaps (Work only).

## 3. Risks

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| RDS rotation fails on 20 Nov | low / medium | rotation thread checks at 00:30 UTC 21 Nov; Stage E waits for it |
| Session left running | low / low cost | R at 21:05, backstop at 21:00, alarms |
| Stale expected-changes declaration (R-7) | certain / low | the next config PR replaces it; the plan is compared to it |
| Account budget over its limit (B-1) | certain / noise | owner decision D-N1 pending |
| ACM renewal (S-3) | low before April 2027 | sessions use the certificate |
| Two script runs at the same time | low / manual repair | one tab, one run (A-4); detected by the script |
| Operator password only in the console (Option A) | certain / small friction | owner opens it as root at A-9 |
| Control credential shown once (CT-01) | low | revoke and mint again |

## 4. What was not done

No Terraform apply, destroy, import, state change, or plan against the live backend. No AWS write of any kind. No RDS start or stop, no ECS service or task, no `up` or `down`, no Stage E, no Step Functions execution, no schedule change, no IAM change, no secret created, rotated, changed or read. No production deployment, no migration against a live database, no DNS or certificate change, no workflow dispatch, no PR merged. No completion percentage is given.
