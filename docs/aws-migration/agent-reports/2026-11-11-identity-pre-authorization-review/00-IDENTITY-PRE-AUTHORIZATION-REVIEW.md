# Identity non-production: final review before a deployment authorization request

- Date: 11 Nov 2026, 09:55 to 10:20 UTC
- Account `229251310592`, region `eu-central-1`, target Munaxa Identity non-production
- Scope: read-only review and preparation, on the owner's request of 09:54 UTC.
- Review method: repository files, PRs and CI read through the GitHub integration and the local
  clones.
- **No AWS call was made for this review.** The AWS facts below come from the 11 Nov Phase 1
  evidence (PR #88) and the log-filter evidence (PR #87). No dispatch, Terraform, ECS task,
  secret, IAM, DNS, merge or GitHub App action was taken.

**This report is a recommendation for ChatGPT review. It is not deployment authorization, and it
does not ask for one.**

## A. Executive decision

**NOT READY — BLOCKERS REMAIN**

The AWS account, the roles, the network and the log filter are ready. The application probe that
the plan relies on for steps 18 to 20 has **not been written** (blocker BL-1), so there is nothing
to review against the nine probe criteria. Three more items block a precise authorization
request:

- BL-2: HTTP-to-HTTPS cannot be tested from inside AWS;
- BL-3: the operator email and the password-custody choice are still open;
- BL-4: the probe would run with database-owner credentials in its environment.

Section H sets out each blocker. None needs an AWS change to resolve.

## B. Evidence reviewed

| Item | Value |
| --- | --- |
| `munaxa-platform` `main` | `49c51f36fb53d1e450c9cf8af58a969897d00623` (PR #86, 11 Nov 08:41 UTC) |
| `munaxa-identity` `main` | `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (PR #6, 5 Nov). No open PRs |
| Infrastructure changes since the Config A1 apply | `git diff 67904bc..49c51f3 -- infra .github scripts`: **none** |
| Open PRs in `munaxa-platform` | #87 (head `3b2e088`, docs and evidence only) and #88 (head `9e3cf41`, docs and evidence only). Neither touches `infra/`, `.github/` or `scripts/` |
| CI on #88 at `9e3cf41` | All six checks green (Terraform plan and apply jobs skipped, as on every docs PR) |
| CI on #87 at `3b2e088` | Five checks done (four success, two skipped); Accessibility was in progress at 09:52 UTC |
| `aws-session.yml` | At `main` `49c51f3` (unchanged since #78) |
| Task definitions | `infra/aws/stack/ops.tf`: db-admin, identity-migrate and identity-bootstrap, all at `:1` (P-3, 11 Nov 09:18 UTC) |
| Edge | `infra/aws/stack/edge.tf`, `services.tf`, `envs/nonprod.tfvars` |
| Identity source | `apps/api/src/auth/auth.controller.ts`, `auth.service.ts`, `health/health.controller.ts`, `observability/logger.ts`, `security/edge.middleware.ts`, `apps/api/Dockerfile` (`node:22-alpine` runtime) |
| Phase 1 evidence (PR #88) | `2026-11-11-identity-phase1-readonly-assessment/evidence/*`, AWS calls 09:14 to 09:27 UTC |
| Log-filter evidence (PR #87) | `2026-11-11-identity-claude-executed-deployment-plan/evidence/log-filter-revision/*`, 09:36 and 09:43 to 09:46 UTC |
| Plan and checklist | PR #87: `00-IDENTITY-CLAUDE-EXECUTED-DEPLOYMENT-PLAN.md`, `02-LOG-FILTER-CORRECTION.md`, checklist sections 4 to 6 |

Accepted starting position, not repeated here:

- P-1 to P-11 and P-13 PASS; P-11b 20 of 20.
- P-12: 12 denials, all matching S-1 to S-8. No IAM change.
- G-1 to G-5 PASS. They were re-checked above: same heads, and no new PRs apart from #87 and
  #88.
- Simulation: 30 of 30 allows and 27 of 27 denies. It does not prove that the live calls succeed
  or cover resource policies.
- Log filter: 47 of 47 on `TestMetricFilter`; `FilterLogEvents` accepted the pattern and counted
  24. L-F1 to L-F10 and L-FV1 to L-FV3 apply. **The filter is a spot check, not secret
  scanning.**

**The organisation value.** `munaxa-group` is correct:

- the bootstrap task runs `--organisation munaxa-group` (`ops.tf:272`, from
  `variables.tf:401`, `identity_operator_organisation.slug`);
- `identity_default_organisation` is `""` (`variables.tf:241-245`), so Identity has no default;
- `auth.service.ts:103-106` therefore returns `unknown-organisation` whenever a request names none.

So **login as well as refresh** must send `"organisation":"munaxa-group"`. The checklist's login
body does (section 6, `{identifier, password, organisation}`). The plan's probe list names it for
refresh only, and that must be corrected (BL-1).

## C. Deployment probe

**Status: not written.** No `identity-session-probe.mjs` exists on any branch of
`munaxa-platform`; a search of `main` and of the #87 and #88 branches found none. Phase P of the
plan (P-1 to P-3) has not started. Every runtime result below is **not verified**. The table
assesses the design in plan part 4 against the source code.

### C.1 The nine criteria

| # | Criterion | Status | Design as planned, and what is missing |
| --- | --- | --- | --- |
| 1 | Pinned, reviewed source commit | **Not met** (no code) | Plan P-2: download from `raw.githubusercontent.com` at a commit SHA on `main`, after review and merge |
| 2 | Checksum checked | **Not met** | Plan P-2: SHA256 in the override, compared before running. The helper `verify-identity-jwt.mjs` must be pinned and checked the same way |
| 3 | No moving branch | **Not met** | The design names a commit SHA, never `main` |
| 4 | Node 22 runtime | Ready in the image | The probe runs in the `identity-bootstrap` task, image `munaxa-identity/api@sha256:71d01fdf…` (`node:22-alpine`, Dockerfile line 111): 0.25 vCPU, 512 MB, `readonlyRootFilesystem = true`, `NODE_ENV=production`. **The read-only root filesystem means the loader must run the program in memory** (for example by importing a `data:` URL); it cannot write to disk |
| 5 | SNI and Host `id.test.munaxa.com` | Design only | Global `fetch` cannot set a different SNI. The program must use `node:https` with `host` set to the ALB's AWS DNS name, `servername` and `Host` set to `id.test.munaxa.com`, and certificate checking left on. Or it can use a `lookup` that maps the name to the ALB's addresses |
| 6 | No public DNS for the name | Design only | The ALB's own `*.elb.amazonaws.com` name resolves through the VPC resolver. No `id.test` record is needed |
| 7 | Never prints secrets | Design only | Required: a fixed allow-list of output lines. Never print a header, a cookie, a body or the environment. Errors are reduced to a code. See BL-4 for the environment |
| 8 | Sanitised results only | Design only | One `PASS <check>` or `FAIL <check> <status>` line per check, then a summary |
| 9 | `organisation: munaxa-group` | Design incomplete | It must be in the login body as well as in refresh (section B) |

### C.2 Test by test

The status column records what can be said today.

| Test | Endpoint and method | Expected | Source fact | Automated? | Gap |
| --- | --- | --- | --- | --- | --- |
| Health live | `GET /api/auth/health/live` | 200 | `health.controller.ts:31` | Planned | None |
| Health ready | `GET /api/auth/health/ready` | 200, `cache: redis`, kid `identity-nonprod-2026-11` | `health.controller.ts:41`; the target group uses the same path (`services.tf`) | Planned | The probe must check the kid value exactly |
| TLS certificate | TLS handshake to the ALB with SNI `id.test.munaxa.com` | Chain valid, name matches, SANs `*.test.munaxa.com`, `operator-test.munaxa.com`, not expired; listener policy `ELBSecurityPolicy-TLS13-1-2-2021-06` | `edge.tf:104-121`; certificate ISSUED (P-9) | Planned, plus read-only ACM and listener calls (C-13) | The probe must fail on any certificate error and never set `rejectUnauthorized: false` |
| Valid login | `POST /api/auth/login`, JSON `{identifier, password, organisation:"munaxa-group"}`, `Origin: https://id.test.munaxa.com` | 200 `{"ok":true}`; cookies set | `auth.controller.ts:77-118`. The token is only in httpOnly cookies. Origin checking is the CSRF control (`edge.middleware.ts:26-52`) | Planned | Origin and organisation missing from the plan's list. Without Origin the call is refused, and without organisation it gets `unknown-organisation` |
| Invalid password | Same, wrong password | 401 `AUTH_INVALID_CREDENTIALS` | Refusal is generic (`auth.service.ts` 23-50) | Planned | Exactly **one** attempt. Lockout and rate limiting are keyed by the identifier (`auth.service.ts:333-339`), so repeats risk a 429 and a locked account |
| Unauthenticated session | `GET /api/auth/session`, no cookie | 200 `{"signedIn":false}` | `auth.controller.ts:173` | Planned | Identity has no protected resource route. This is the only unauthenticated check available |
| Authenticated session | `GET /api/auth/session` with the cookie | 200, `signedIn: true` | Same | Planned | Assert the field only; never print the body |
| JWT verification | Access-token cookie, checked offline in the probe | alg ES256, kid, signature against the committed public key, `iss`, `aud` includes `munaxa-work` and `munaxa-control`, `exp − iat = 900` | Helper `verify-identity-jwt.mjs` (26 tests, PR #76) | Planned | The helper must be pinned and checksummed (criterion 2). The public key must come from `identity_public_keys` in `nonprod.tfvars`, not from the server |
| Refresh | `POST /api/auth/refresh`, cookie `__Secure-mx_refresh`, body `{"organisation":"munaxa-group"}`, Origin | 200; cookies rotated | `auth.controller.ts:120-151` | Planned | Keep a copy of the pre-refresh and pre-logout refresh cookie in memory only |
| Logout | `POST /api/auth/logout`, Origin | 200 | `auth.controller.ts:153` | Planned | None |
| Refresh after logout | `POST /api/auth/refresh` with the pre-logout refresh cookie | 401 | Logout revokes the token and session; refresh of a revoked one gives `invalid-credentials` (traced 11 Nov, plan L-9). **Runtime not verified** | Planned | 200 is a security finding (H-12) |
| Operator host | `GET /` and `GET /api/auth/login` with Host and SNI `operator-test.munaxa.com` | 403 `Forbidden` | Rule 39 refuses the whole host while `operator_cidrs = []` and `operator_access` is unset (`edge.tf:173-195`, `services.tf:22,90`) | Planned | None |
| Control admin path | `GET /api/v1/admin/x` with Host `control-api.test.munaxa.com` | 403 | Rule 10 (`edge.tf:123-148`), and rule 21 refuses the rest of that host | Planned | Also check another path on the host, for rule 21 |
| Unknown host | `GET /` with Host and SNI `unknown.test.munaxa.com` | 404 `Not found` | HTTPS listener default action (`edge.tf:113-120`) | Planned | The certificate covers `*.test.munaxa.com`, so TLS succeeds; that is expected |
| HTTP to HTTPS | `GET http://<ALB>/` | 301 to `https://…:443` | HTTP listener default redirect (`edge.tf:87-102`) | **Cannot run from the task** | **BL-2.** Both groups the task could use allow egress only on 443 and 5432 (`sgs.json` in PR #88): `munaxa-nonprod-db-admin` and `munaxa-nonprod-identity`. Port 80 is blocked, and changing a security group is out of scope |

## D. Execution plan

The identities used:

- **GH**: the GitHub integration. It authenticates as `tam2om` and can dispatch.
- **WF**: the workflow's roles `munaxa-shared-ci-nonprod-session` and
  `munaxa-shared-deployer-nonprod-session`.
- **ROOT**: the AWS connector, which is the root user. Root has no permission boundary or
  guardrail, so the session-role denies in section 5 of PR #88 do **not** protect ROOT actions.
  The controls for those are this plan, CloudTrail review, and the owner's scoped approval.

| # | Operation | Resource and definition | Identity and permissions | Expected | On failure | Reversible |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Final readiness checks | P-1 to P-13, G-1 to G-5 | ROOT reads; GH reads | As in PR #88 | No dispatch | Yes (read) |
| 2 | Dispatch `session=up` | `aws-session.yml` at `main`; environment `aws-nonprod-session` | GH dispatches; WF runs plan, check, DB start, apply | Plan = the 11 session addresses; the job refuses other types or placements before the DB starts | Workflow stops the DB itself on a failed `up` (`aws-session.yml` "Stop the database") | Yes, through `down` |
| 3 | RDS startup | `munaxa-nonprod-pg` | WF (`rds:StartDBInstance`, allowed, S-12) inside the job; ROOT reads | `available` | H-4: `down` | Yes |
| 4 | ALB, listeners, rules, target group | 1 ALB, listeners 80 and 443, rules 10/21/39/40/50, target group `munaxa-nonprod-identity` | WF applies; ROOT reads | All present, HTTPS policy TLS13 | H-3, H-14: `down` | Yes |
| 5 | ECS service | Service `identity` in cluster `munaxa-nonprod`, task definition `munaxa-nonprod-identity:1` | WF creates; ROOT reads | Valkey HEALTHY; Identity exits on a **database** error before migrations (expected) | H-9: `down` | Yes |
| 6 | Database-admin task | `munaxa-nonprod-db-admin:1`, sg db-admin, public subnet, public IP | **ROOT `ecs:RunTask`**. The session deployer cannot (D-13, implicit deny) | Exit 0, roles line | H-4: `down` | **No** (creates the database and roles) |
| 7 | Migrations | `munaxa-nonprod-identity-migrate:1`, sg identity-migrate | **ROOT `ecs:RunTask`** | Exit 0, "All migrations have been successfully applied." | H-5: `down`; no fix-forward | **No** (schema) |
| 8 | Bootstrap credential | Secret `munaxa-nonprod/identity-bootstrap`, keys `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD`, key `alias/munaxa-nonprod-data` | Depends on custody (section E). Under option C the **owner** creates it in the console; ROOT then reads **metadata only** (`DescribeSecret`) | Name, ARN, 1 version, data key | Wrong name or key: delete and recreate | Yes (delete) |
| 9 | Bootstrap | `munaxa-nonprod-identity-bootstrap:1`: the default command, then the `seed-control-roles.mjs` override, then `bootstrap-account.mjs --role control-operator-admin` | **ROOT `ecs:RunTask`** (3 runs) | "Created … in organisation munaxa-group.", organisation and `sub` ids, roles, "Assigned control-operator-admin" | H-6: delete the secret, then `down` | **No** (creates the account) |
| 10 | Operator and Control roles | Results of the runs in step 9 | ROOT reads the ops log | Same `OPERATOR_ORGANISATION_ID`; the role line | Same | Yes (read) |
| 11 | Force a new deployment | Service `identity` | ROOT `ecs:UpdateService --force-new-deployment` (the plan requires it: the first tasks exited before migrations) | One deployment COMPLETED | H-10: `down` | Yes |
| 12 | Healthy targets | Target group | ROOT reads | 1 healthy, stable within 15 minutes | H-10 | Yes (read) |
| 13 | In-AWS probe | `munaxa-nonprod-identity-bootstrap:1` with the probe command override | **ROOT `ecs:RunTask`** | All PASS lines | H-11, H-12, H-13: delete the secret, then `down` | Yes (reads only; one login session created) |
| 14 | Count-only log check | `FilterLogEvents` on `/munaxa/nonprod/identity`, 3-hour window, revised pattern | ROOT | Count 0 | Non-zero or an error: H-17 stop | Yes (read) |
| 15 | Certificate and TLS | ACM and `DescribeListeners`; the probe's TLS check; the HTTP listener redirect read from configuration (BL-2) | ROOT reads | ISSUED, in use by this ALB, policy as set, redirect 301 to HTTPS:443 | H-11: `down` | Yes |
| 16 | Delete bootstrap material | The secret from step 8 | ROOT `DeleteSecret --force-delete-without-recovery`, then `ListSecrets` count | 0 | Retry. Never `down` with it present (checklist step 16) | **No** (by design) |
| 17 | Dispatch `session=down` | `aws-session.yml` | GH dispatches; WF runs | Both jobs green; 11 deletes; DB stopping | Dispatch again (the DB job is separate). Then the backstop (section G) | Yes |
| 18 | Shutdown verified | 0 ALB, 0 target groups, 0 services, 0 tasks, 0 public ENIs, 0 NAT; DB `stopped`; backstop 11 enabled; secret count 0; CloudTrail denials only S-1 to S-8 | ROOT reads | All 0; stopped | `down` again; report | Yes (read) |

Order change from the operator checklist: the checklist deletes the secret at step 16, **before**
the restart. The plan keeps it until after the probe (step 13), because the probe takes the
operator password from that secret. The H-15 time rule therefore covers the secret too: delete it
first, then `down`.

**Rollback.** Infrastructure goes back through `down`. Steps 6, 7 and 9 change data and cannot be
undone in the session. The Testing database is then repaired by a separately reviewed procedure,
never fixed forward.

## E. Secret custody

The rules hold for every option:

- no `GetSecretValue`, `BatchGetSecretValue` or Secrets Manager Agent call by Claude;
- output is metadata only;
- the ECS execution role `munaxa-nonprod-identity-bootstrap-execution` is the only reader
  (`ops.tf:216-245`, `GetSecretValue` on `…/identity-bootstrap-??????` and the migrate secret).

| | A. Persistent copy, generated in AWS by Claude | B. No persistent copy | C. Owner creates the secret |
| --- | --- | --- | --- |
| Who knows the password | Nobody directly. The owner can open `munaxa-nonprod/identity-operator` in the console later | Nobody, ever | The owner, from their password manager |
| Path the value takes | `GetRandomPassword` returns it to the connector's sandbox, and the same script passes it to `CreateSecret`. It never reaches Claude's context, but it does pass through the connector's server, whose audit logging cannot be checked (L-A0) | Same path as A | Console to Secrets Manager. It never passes through Claude's tooling |
| Later use (Control session) | Works | Needs a reviewed repair: there is no password reset (U-9), and bootstrap never rewrites a password | Works |
| Cost | US$0.40 a month | None | None (deleted after the session) |
| Owner effort | None | None | One console form, about 10 fields and clicks |
| Matches the code's design | Partly | Partly | **Yes.** `ops.tf:195-198` says the owner creates the one-run secret before the runs and deletes it after them |

**Recommendation: option C.** It is the only option in which the operator password never passes
through Claude's tools or the connector, so L-A0 does not apply. It matches the design in
`ops.tf`, and it gives the owner a password they can use later. After the probe, Claude deletes
the secret through the connector; that call needs no value. Option A remains acceptable if the
owner prefers no console step and accepts L-A0 in writing.

**Is the bootstrap secret removed on every path?**

| Path | Removal |
| --- | --- |
| Success | Step 16, before `down`, with a count-0 check |
| Hard stop H-1 to H-17 | Plan: "delete the bootstrap secret if it exists", then `down` |
| Time limit H-15 | Same |
| **Claude's session ends or the connector signs out mid-session** | **Not removed.** `down`, the scheduled runs and the backstop do not touch secrets. P-6 on the next check finds it, and the owner deletes it in the console. **Residual risk R-1** |
| Task failure inside step 9 | H-6: secret first, then `down` |

## F. Security limitations

| # | Limitation | Source |
| --- | --- | --- |
| F-L1 | **No MFA enrolment or verification.** An MFA-enrolled account is refused with `AUTH_MFA_REQUIRED` (`auth.controller.ts:189`) | Identity `5277d71` |
| F-L2 | **No password-reset HTTP route.** Only the token store exists | Same |
| F-L3 | Operator access is therefore **password only** | Follows from F-L1 and F-L2 |
| F-L4 | The operator host is closed by rule 39 for now. Opening it later needs Cloudflare Access, a separate decision | `edge.tf`, `cloudflare-access.md` |
| F-L5 | ROOT runs the one-off tasks. No guardrail limits it | ACCESS-POLICY D-4 |
| F-L6 | The log filter is a spot check (L-F1 to L-F10, L-FV1 to L-FV3) | PR #87 |
| F-L7 | The bootstrap task logs the operator email to `/munaxa/nonprod/ops`, which has 14-day retention. That is personal data, not a secret. Claude reads that log only through a filter that returns PASS/FAIL lines and ids | Checklist section 8.3 |
| F-L8 | The probe would run with the migration-owner database URL in its environment (BL-4) | `ops.tf:274-278` |
| F-L9 | Simulation does not cover resource policies or prove live calls | PR #88 |

**This exercise does not make Identity ready for unrestricted public production use.**

Before production, at least these are needed:

- MFA enrolment and verification, enforced for operators;
- a password-reset flow, or a reviewed recovery procedure;
- operator access only through Cloudflare Access, the second factor at the edge;
- non-root deployment identities (deferred under ACCESS-POLICY);
- alarms on authentication failures and lockouts;
- an external penetration test;
- a production log and secret-scanning control beyond this spot filter.

Without MFA, one leaked password gives full operator access. Without reset, a lost password needs
a database-level repair.

## G. Cost and shutdown

**Starts during `up`:**

- 1 ALB with 2 public IPv4 addresses;
- listeners 80 and 443;
- rules 10, 21, 39, 40 and 50;
- the certificate validation;
- target group `munaxa-nonprod-identity`;
- service `identity` with 1 task (Identity and Valkey, 1 public IPv4);
- the database start.

Run-to-exit tasks: db-admin 1, migrate 1, bootstrap 3, probe 1. The secret is temporary.

**Must be gone after `down`:**

- all of the 11 addresses above;
- the database stopped;
- the bootstrap secret deleted (by Claude, before `down`);
- no tasks.

What remains by design:

- task definitions;
- log groups and their 14-day logs;
- the certificate;
- the database's data.

**Cost.** The rates from first-session section 8 are unchanged. They were not re-priced today.

| Item | Rate |
| --- | --- |
| Fargate Identity task | US$0.028 an hour |
| ALB | US$0.027 to 0.035 an hour |
| 3 public IPv4 addresses | US$0.015 an hour |
| RDS while running | US$0.019 an hour |
| **Total while running** | **about US$0.09 to 0.10 an hour** |
| One-off tasks | under US$0.02 |
| Secret | under US$0.01 |

That gives **US$0.20 expected for 2 hours**, and the **US$0.35 ceiling holds for 3 hours with
`down` on time**. Option C adds no monthly cost.

**Shutdown layers and what each cannot guarantee:**

| Layer | Does | Cannot guarantee |
| --- | --- | --- |
| 1. Claude's `down` (step 17, or at T0 + 3 h) | Removes the 11 addresses and stops the DB, verified in step 18 | Runs only while this session is alive and the connector is signed in |
| 2. Scheduled `down` at 19:17 and 01:47 UTC | Same as `down` | GitHub starts it late: 6 h 40 min was observed today (run 42987103535), and it can drop the run |
| 3. AWS backstop, EventBridge at 21:00 UTC (`backstop.tf`) | `StopDBInstance`; every service to 0 | **Cannot delete the ALB**, about US$0.037 an hour until the next `down`. It does not delete the secret |

**The 3-hour hard stop and failure handling.**

- Enforcement is by Claude: a wake scheduled at T0 + 2 h 45 min through this session's scheduler,
  then `down` at T0 + 3 h whatever the state.
- **The wake is not configured today and has not been verified.** It is created at step 2 and
  recorded in the session report.
- A failed `down` shows as a red run or a database that is not stopping. Claude dispatches it
  again; the database job runs on its own. If it still fails, Claude reports it at once, and
  layer 3 stops the database and service at 21:00.

**Worst case if Claude loses control right after `up` at 15:30.**

| Period | Cost |
| --- | --- |
| Full running cost until 21:00 (5.5 h) | about US$0.55 |
| The ALB until the next working scheduled `down` (up to about 08:30 the next day if both runs are late) | about US$0.43 |
| **Total** | **about US$1.00, above the US$0.35 ceiling** |

**Residual risk R-2.** The ceiling depends on layer 1.

## H. Outstanding blockers

| # | Severity | Evidence | Why it matters | Action | Owner action? |
| --- | --- | --- | --- | --- | --- |
| **BL-1** | High | No probe file on any branch (section C) | Steps 18 to 20 (sign-in, JWT, refresh and logout, edge rules) have no executable test. Criteria 1 to 3 and 5 to 9 cannot be checked | Claude writes `identity-session-probe.mjs` and its tests (offline, mocked server) to C.1 and C.2, including Origin, organisation in login and refresh, one wrong password, `node:https` with SNI, in-memory loading, and an output allow-list. Docs PR, then ChatGPT review, then merge, then pin the SHA256 | **Yes:** a one-word go-ahead for that repository change, then the merge word |
| **BL-2** | Medium | Task security groups allow egress only on 443 and 5432 (`sgs.json`, PR #88) | HTTP-to-HTTPS cannot be a runtime test from AWS | Replace it with a read-only `DescribeListeners` check (default action redirect, HTTPS, 443, 301), recorded as **configuration evidence, not a runtime test** | Accept in review (no action) |
| **BL-3** | High | Plan O-2 (Testing email) and O-4 (custody) are open | Step 8 cannot run without them | Owner gives a Testing email address and picks C (recommended) or A | **Yes** |
| **BL-4** | Medium | The bootstrap task injects `DIRECT_DATABASE_URL` (the migration owner), `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` (`ops.tf:274-278`) | Probe code would hold database-owner credentials it does not need | In the probe: copy the two operator values, then delete all three from `process.env` before any network code; never read the database URL. A separate probe task definition would need Terraform, which is out of scope. ChatGPT judges whether that is enough | Accept in review |
| BL-5 | Low | #87 and #88 are open, and both add a "Latest" README row | The probe and plan must be on `main` at a pinned commit before the session | Merge order #88, then #87, then the probe PR. Claude resolves the README conflict | **Yes:** the merge words |

Residual risks, not blockers, to be accepted in the authorization:

- **R-1:** the secret is left behind if Claude's session dies (section E).
- **R-2:** cost above the ceiling if Claude's session dies (section G).
- **L-A0**, for option A only.
- **F-L1 to F-L9.**

## I. Owner actions

Only these:

1. Say go for Claude to write the probe PR (BL-1).
2. Give a Testing email address, and choose C or A (BL-3). Under C, create the one secret in the
   console when Claude says, using the field list Claude gives you.
3. Give the merge words for #88, #87 and the probe PR after ChatGPT's review (BL-5).
4. Separately, give the deployment authorization (section J, once ready).

## J. Explicit approval request

**Not prepared.** The package is not ready (section A). After BL-1 to BL-5 are closed, Claude
will prepare a separate authorization request. It will name:

- account `229251310592` and region `eu-central-1`;
- the exact operations in section D;
- the expected resources in section G;
- the US$0.35 ceiling and the 3-hour limit;
- the start window;
- the shutdown proof;
- the prohibited actions.

Nothing in this report, and no earlier approval, authorizes a deployment.
