# Identity Stage E session, 21 Nov 2026

**Result: STAGE E COMPLETED. Identity ran on Testing, the probe passed 28 of 28, the throwaway
account was disabled and the session was taken down. Cleanup: VERIFIED at 10:45 UTC (0 ALB, 0 target groups, 0 ECS services or tasks, database stopped, 0 EIP, NAT or public ENI, H-20 schedules removed).**

Labels: **[V]** verified live, **[R]** recommended, **[O]** owner action.

## 1. Authorization

- Owner approval: decision card "Approve Identity Stage E today, 13:00-18:30 Amman, if rotation
  verifies?", answer "Yes, if rotation verifies", 21 Nov 08:11 UTC. Its scope is Stage E only.
  C-1, C-2 and Docs are not covered.
- Rotation precondition: the RDS master secret rotation SUCCEEDED 20 Nov 21:26:28 UTC
  (report `2026-11-21-rds-secret-rotation-verification`, platform#148). [V]
- Things not done: no `GetSecretValue` or `BatchGetSecretValue` by Claude; no secret value
  printed, copied or returned; no manual rotation; RDS started and stopped only by the `up` and
  `down` workflows; no secret's staging labels changed; no Terraform outside the session
  workflow; no image release; no Cloudflare change; no production change.

## 2. Timeline (UTC)

| Step | Time | Evidence | Result |
| --- | --- | --- | --- |
| P-1 to P-10 preflight | 09:3x to 09:5x | file 05 of the 20 Nov report | PASS (P-9: morning scheduled down finished 08:52) [V] |
| E-1 discover | before `up` | guard `discover` | PASS: db-admin 2, identity 2, bootstrap 3, migrate 2, probe 1 [V] |
| H-20 gate and arm | before `up` | `h20-session-cleanup-gate-and-arm.py` | gate PASS; P at 13:25, S at 13:55 (H = 13:25) [V] |
| S-1 `up` | 09:56:04 to 10:05:47 | run [44891901758](https://github.com/munaxa/munaxa-platform/actions/runs/44891901758) | success [V] |
| S-3 db-admin | after `up` | E-1 run, allow-list log | exit 0, 4 of 4 expected lines, 0 others [V] |
| S-4 migrate | after S-3 | E-1 run | exit 0, 2 migrations [V] |
| S-5 C-8G create and open window | 10:15:42 (create), window to 11:18:22 | `c8g-operator-secret-stack.py` | stack created, template SHA-256 `4034d58b…5ee7` matches [V] |
| S-6a bootstrap (default) | 10:19 | task `c9cfb70d…`, rev 3 | exit 0, digest `9a8c6ebd`: "Created `<email>` in organisation munaxa-group.", organisation `071d3060-70ac-4017-9ff9-094ff715051e`, operator sub `ae62eef5-cf65-43c8-83e2-7786d2d5ae87` [V] |
| S-6b seed-control-roles | 10:24 | task `84e621af…` | exit 0: control-operator-admin 10 grants, control-operator-viewer 5 grants [V] |
| S-6c operator-admin-role | 10:27 | task `5e891ca0…` | exit 0: "Assigned control-operator-admin, unscoped." [V] |
| S-6d close window | about 10:28 | C-8G close-window | WINDOW_CLOSED (closed, expiry 2000-01-01T00:00:00Z, generation 1) [V] |
| S-7 restart Identity | about 10:29 | UpdateService forceNewDeployment | deployment COMPLETED, 1 running, target group `munaxa-nonprod-identity` 1 healthy [V] |
| S-8 listener checks | about 10:31 | runbook §9 script | all match: ALB active and internet-facing, 2 listeners, HTTP 301 to HTTPS 443, TLS13-1-2-2021-06, default 404, rules 10/21/39/40/50/default, certificate ISSUED `*.test.munaxa.com` + `operator-test.munaxa.com`, valid to 2027-05-22, in use [V] |
| S-9 probe (one run) | about 10:32 | task `f11c1ff5…`, rev 1, both containers exit 0 | **SUMMARY pass=28 fail=0 total=28 result=PASS**, 28 PASS lines, 0 lines outside the allow-list once the summary was matched; throwaway sub `6848dd6d-66cc-42b7-b76a-6c15168b85d3` [V] |
| S-9b disable plan | about 10:34 | task `25dcd1b9…` | "dry run: account … status=active; nothing changed" [V] |
| S-9b disable apply | about 10:35 | task `1e2184fd…` | "applied: account … disabled, 0 session(s) and 0 refresh token(s) revoked, reference stage-e-throwaway" [V] |
| S-10 count-only logs | about 10:37 | runbook §10.3 pattern, T0 − 5 min to now | identity 0, identity-migrate 0, ops 0 [V] |
| S-10 C-24 custody | about 10:37 | `c24-custody-cloudtrail-check.py`, T_CREATE 10:15:42 | **PASS**, complete (2 pages), 0 findings, no value recorded in CloudTrail [V] |
| S-11 secrets | about 10:37 | ListSecrets, GetResourcePolicy | only `identity`, `identity-migrate`, `identity-operator`; no `identity-bootstrap`; operator policy has the 4 deny statements [V] |
| S-12 `down` | 10:38:16 | run [44895287466](https://github.com/munaxa/munaxa-platform/actions/runs/44895287466) | success at 10:42:48 (database stop job and switch apply both green) [V] |
| S-13 cleanup verification | about 10:45 | read-only | ALB 0, target groups 0, ECS services 0, running tasks 0, `munaxa-nonprod-pg` stopped, EIPs 0, NAT 0, public ENIs 0, EC2 0, ElastiCache 0, no `identity-bootstrap` secret, C-8G stack UPDATE_COMPLETE with window closed, 11 backstop schedules and the daily R enabled [V] |
| H-20 disarm | about 10:46 | `h20 … MODE disarm` | DISARMED: P `…-p-20261121t1325` and S `…-s-20261121t1355` deleted; only `munaxa-nonprod-session-cleanup-daily` remains [V] |

The session ran about 42 minutes, from `up` to dispatching `down`, against a 3-hour limit.

## 3. C-24 custody counts (CloudTrail, Secrets Manager, from 10:15:42 UTC)

| Event, principal, secret | Count |
| --- | --- |
| CreateSecret, root via CloudFormation, identity-operator | 1 |
| GetRandomPassword, root via CloudFormation | 1 |
| PutResourcePolicy, root via CloudFormation, identity-operator | 3 |
| GetResourcePolicy, root via CloudFormation, identity-operator | 9 |
| DescribeSecret, root via CloudFormation, identity-operator | 7 |
| GetSecretValue, bootstrap execution role, identity-operator | 6 (3 bootstrap tasks × 2 keys) |
| GetSecretValue, bootstrap execution role, identity-migrate | 4 |
| GetSecretValue, identity execution role, identity | 21 |
| DescribeSecret / GetResourcePolicy / ListSecretVersionIds by root (connector metadata) | 7 |
| DescribeSecret, Resource Explorer service role | 1 |

No GetSecretValue by root or by any principal outside the allowed execution roles. CloudTrail
delivery lags by minutes, so the last few task reads may not be counted yet. The result does not
depend on them, because every one of them is an allowed execution role.

## 4. Findings

- **F-1 (Low, script defect).** C-8G `status` reports FAIL `secret-tags` because CloudFormation adds
  its own `aws:cloudformation:*` tags to the secret. The four non-`aws:` tags are exactly the
  expected ones [V]. Fix: compare only tags that do not start with `aws:`. A one-line PR with a
  test is proposed and not made.
- **F-2 (Low, timing).** H was set to 13:25 UTC, which is T0 + 3 h 29 min, not T0 + 3 h. Claude
  kept its own hard stop at 12:56 UTC (T0 + 3 h). `down` started at 10:38, well before either.
  [R] Set H from the actual `up` time in future sessions.
- **F-3 (Info, timing).** `up` was dispatched at 09:56:04 UTC, which is 4 minutes before the
  approved window opened (10:00 UTC, 13:00 Amman). The morning scheduled `down` had already
  finished (08:52), and that is the condition the window protects.
- **F-4 (Info, method).** The connector runs inline code only, so each E-1 and C-8G run used a
  session copy of the reviewed script. That copy carried the run family's full manifest entry and
  the same validation, override, guard and RunTask logic; the other families were reduced to
  `{"service": …}` stubs, and comments and docstrings were removed. For close-window, the copy
  had the same checks as the script: template SHA, generation and stable state. The copies are
  not committed.
- **F-5 (Info).** Before S-7, the identity service's earlier deployment showed FAILED with 0
  running. This is expected: Identity cannot start until db-admin and migrate have run, so the
  circuit breaker had tripped during `up`. The forced deployment completed normally.
- **Known risk carried (owner O-4 of 20 Nov).** The Identity pin `9a8c6ebd` very likely has the
  OpenSSL HIGHs that Grype found on 20 Nov. It is not republished yet. The owner approved Stage E
  with this pin.

## 5. Outcome for later stages

- The Testing Identity database now has organisation `munaxa-group`, the operator account (sub
  above) with the control-operator-admin role, and the seeded Control roles. It also has a
  disabled throwaway account in organisation `munaxa-stage-e-checks`.
- The persistent operator secret `munaxa-nonprod/identity-operator` stays (generation 1, window
  closed). Its value was never read by Claude.
- The operator sub is the value Munaxa Work and Control need for tenant binding.
- Next decisions are the owner's: C-1, C-2 and Docs-first are not authorized by this card.
