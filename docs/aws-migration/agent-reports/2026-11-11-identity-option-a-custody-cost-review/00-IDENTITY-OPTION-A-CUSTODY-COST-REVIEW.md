# Identity non-production: Option A secret custody, cost and security risk review

- Date: 11 Nov 2026, from 10:08 UTC
- Workstream 5 of the owner's "five parallel preparation workstreams" brief (11 Nov 2026)
- Account `229251310592`, region `eu-central-1`, target Munaxa Identity non-production
- Base: `munaxa-platform` `main` `49c51f36fb53d1e450c9cf8af58a969897d00623`,
  `munaxa-identity` `main` `5277d7190b3dda496443c4bd7d80c78bd4d9174e`
- Inputs: the pre-authorization review (PR #89, section E "Secret custody", section G "Cost and
  shutdown"), the Phase 1 evidence (PR #88, A-0 and L-A0), the operator checklist (`main`,
  #86), and the source files cited below.

**This is a review document for ChatGPT. It is not deployment authorization and does not ask
for one.**

What was done:

- **No AWS account call.** No secret was created, read, described or deleted. No
  `GetRandomPassword`, `GetSecretValue`, `BatchGetSecretValue` or Secrets Manager Agent call.
- The only AWS tool use was the public AWS documentation search (Secrets Manager pricing and
  API pages). It does not touch the account.
- No Terraform, dispatch, ECS task, IAM, KMS, DNS, Cloudflare or production action. No merge.

## A. Verdict

**OPTION A IS IMPLEMENTABLE WITH THE CURRENT CODE AND IAM. IT IS NOT YET EXECUTABLE.**

Option A works as the owner chose it:

- no Terraform change;
- no IAM change;
- no new KMS key.

It cannot run until two things exist:

- the Testing operator email (O-2: **confirmed by the owner on 11 Nov 2026**; referred to here as `IDENTITY_OPERATOR_EMAIL`, value kept out of this repository);
- the separate deployment authorization.

Five findings change how the session must be run. Each is a condition on the runbook, not a
change of option:

| # | Finding | Condition |
| --- | --- | --- |
| **OA-1** | Both secrets must be created **in one connector call**. Once that call returns, nobody can copy the password from the persistent secret into the bootstrap secret without `GetSecretValue`, which Claude must never call | One script, C-8 (section D). If the second create fails, the script deletes the first. No account exists at that point |
| **OA-2** | AWS validation messages and botocore parameter errors can **echo a parameter value**. An uncaught error in a call that carries the password could put it in the script's return to Claude | Every value-bearing call is wrapped. Only an error **code** is returned, never a message. Tested offline (section D.3) |
| **OA-3** | The bootstrap script is **idempotent and never rewrites a password** (`bootstrap-account.mjs:10-11, 142-143`). Identity has **no password-reset route** (F-L2) | The persistent secret is the only recovery copy. Losing it after bootstrap means a database-level repair. Deleting it later needs a 30-day recovery window, never force-delete |
| **OA-4** | The two secret names share the `munaxa-nonprod/identity-` prefix. The session deployer may `DeleteSecret` on `munaxa-nonprod/*` (`iam_allow.tf:291-298`) | Clean-up deletes by **exact name and ARN** only (C-16). Workstream 3 cleanup designs must never use a wildcard on this prefix |
| **OA-5** | The operator checklist says "never `down` with the secret present" (checklist step 16, `main`). If the delete keeps failing, that rule keeps the ALB running | Proposed rule for Workstream 4: at the hard stop, run `down` **whatever the secret's state**, then report the secret as R-1. Leaving the secret costs about US$0.013 a day; leaving the ALB costs about US$0.89 a day |

The one limit Option A cannot remove is **L-A0** (section C). The owner chose Option A knowing
that limit. **This report does not claim that the connector's server-side audit logging has been
verified, and it has not been.**

## B. The intended flow, step by step

| Step | Intended behaviour | Review | Status |
| --- | --- | --- | --- |
| 1 | Generate a strong random password inside AWS | `secretsmanager:GetRandomPassword`, 40 characters, all four character types, excluding `"` `'` `` ` `` `\`. The script also screens the result against the Identity password policy and regenerates up to 3 times (section D.2) | Design checked offline. **Not run** |
| 2 | Store it in a persistent secret `munaxa-nonprod/identity-operator` | Same call as step 3 (OA-1). Encrypted with `alias/munaxa-nonprod-data`, tagged `Environment = nonprod` so it counts in the Testing budget. Holds the email, the password and the organisation slug | Design. **Not created** |
| 3 | Use the same value for the temporary bootstrap secret | `munaxa-nonprod/identity-bootstrap` with exactly the two keys the task definition reads: `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` (`ops.tf:278-279`) | Design. **Not created** |
| 4 | Return metadata only | The return holds names, ARNs, version ids, counts and booleans. The email is personal data and is not returned either | Tested offline with a synthetic value (D.3) |
| 5 | The password never reaches Claude's context | Holds for what Claude sees: the script text has no value; the return has no value; the call record shows service, operation, status and item counts only (A-0, PR #88). **It does pass through the connector's sandbox**, whose server-side logging is unknown (L-A0) | Partly verified (A-0 used a non-secret parameter) |
| 6 | Delete the bootstrap secret after the probe | C-16: exact-name guard, `ForceDeleteWithoutRecovery`, then two checks: `DescribeSecret` returns not-found, and `ListSecrets` with `IncludePlannedDeletion` finds 0 exact matches. It also checks the persistent secret is still there | Design. The probe (Workstream 2) reads this secret, so the delete comes after the probe |
| 7 | Keep the persistent secret for later Control work | No role can read it today (section E). A later Control task that reads it needs a new IAM grant, which needs its own authorization. Until then only root can read it, in the console | Design |

Precondition (owner rule): **no secret is created** until the owner has supplied the email and
the separate deployment authorization exists. C-8 refuses to run while the email placeholder is
still in it (`EMAIL_NOT_SET`).

## C. Connector audit limitation L-A0 and related limits

| # | Limitation | What is known | What is not known |
| --- | --- | --- | --- |
| **L-A0** | The connector's server-side audit log cannot be inspected | The AWS connector runs the script in a sandbox outside this session. The value exists there in memory between `GetRandomPassword` and the two `CreateSecret` calls. What Claude receives is the return value, plus a call record of service, operation, status and item count. On 11 Nov 09:14 UTC that record did not echo a non-secret parameter (`a0-caller-and-logging.json`, PR #88) | Whether the connector logs the script's API **responses** (and so the `RandomPassword` field) or **request parameters** (and so the `SecretString`) on its own side. Who can read such a log, and for how long it is kept. **Not verified, and cannot be verified from this session** |
| L-A1 | The A-0 test used `DescribeDBInstances`, not a value-bearing call | The record format seen for that call | That the record has the same shape for `GetRandomPassword` and `CreateSecret`. `RandomPassword` is a string, not a list, so an item count should not apply, but this is not verified |
| L-A2 | CloudTrail cannot tell Claude's root calls from the owner's root console calls by identity | Both are `Root`. They differ by `userAgent` and `sourceIPAddress` | Whether those fields reliably mark connector calls. A future `GetSecretValue` by root on the persistent secret could be either party |
| L-A3 | What CloudTrail keeps for the two value-bearing calls | Secrets Manager records all its API calls as management events, including `GetRandomPassword` (AWS API reference) | Whether `GetRandomPassword` keeps `responseElements`, and whether `CreateSecret` keeps a `secretString` request field. C-24 checks this after the session. It returns **two booleans only**, never the fields, so the check itself cannot expose a value |
| L-A4 | Claude can read the secret, technically | Root has `secretsmanager:GetSecretValue` on every secret, and no guardrail applies to root (ACCESS-POLICY D-4) | Nothing technical stops a `GetSecretValue` call. The controls are the project rule (CLAUDE.md "Secret Safety"), the scripts in section D, and the CloudTrail check C-24. C-24 can show a breach only after it has happened |

How each limit is handled in the session:

- L-A0 is accepted by the owner's choice of Option A. It stays in the residual-risk list of the
  authorization request.
- L-A1 is narrowed by the script design: no exception text, no echo, nothing returned but
  metadata.
- L-A2 and L-A4 are covered by C-24. **Expected: zero** `GetSecretValue` events on
  `munaxa-nonprod/identity-operator`.
- L-A3 is answered by C-24 as two booleans.

## D. Connector scripts (draft, not run)

The full drafts are in
[`supporting/option-a-connector-scripts.DRAFT.py`](supporting/option-a-connector-scripts.DRAFT.py)
(SHA256 `3d7abb8e044d6a5e84192be5e04c42c8840c33bcecf2214b79c279fbb9234ab2`). Workstream 4's
runbook cites this file as the source of the secret-creation step.

| Script | When | Calls | Returns |
| --- | --- | --- | --- |
| **C-8** | Replaces checklist step 12. After the database-admin and migration tasks, before bootstrap | `DescribeSecret` ×2 (both names must be absent); `GetRandomPassword` (up to 3); `CreateSecret` ×2; `DeleteSecret` only on rollback | `CREATED` with the names, ARNs and version ids, or `ABORT` with a code |
| C-8v | Straight after C-8 | `DescribeSecret`, `ListSecretVersionIds` per name | KMS key, rotation off, not deleted, the tags, 1 version, `AWSCURRENT` |
| **C-16** | After the probe, before `down` | `DescribeSecret`, `DeleteSecret` (force, by ARN), `DescribeSecret` polled, `ListSecrets` with `IncludePlannedDeletion`, `DescribeSecret` of the persistent secret | `PASS` when the bootstrap secret is gone and the persistent secret is present |
| C-24 | After shutdown | CloudTrail `LookupEvents` for `secretsmanager.amazonaws.com` since C-8 (50 per page, 45 s guard) | Counts by event, principal and secret name; the two L-A3 booleans |

### D.1 Rules every script follows

- The password is held in one variable inside C-8 and set to `None` before every return.
- No value is put into a string, a print, a log or an exception.
- `except Exception` around every value-bearing call. Only `e.response["Error"]["Code"]` or the
  exception class name is returned. Never the message, never `str(e)`.
- No `GetSecretValue`, `BatchGetSecretValue`, or Secrets Manager Agent call.
- The email is passed in and never returned.
- Persistent-secret description and tags carry no email and no password.

### D.2 Password generation and the Identity policy

`bootstrap-account.mjs:102-108` validates the password against the real policy before it writes
anything. The policy comes from `@munaxa/auth` `password-policy.ts`:

- length 12 to 128, NFKC-normalised;
- no single repeated character;
- no run of six from `0123456789`, the alphabet, or a keyboard row, forwards or backwards;
- no short unit (1 to 4 characters) repeated over the whole length;
- no email local part of four or more characters inside it;
- breach check against `StaticBreachRegistry`.

C-8 screens the generated value against the first five rules before it creates anything. In
200,000 offline draws of 40 characters from the same character set, 1 was refused. Three
attempts make a refusal at bootstrap effectively impossible. If bootstrap refuses the password
anyway, nothing has been written to the database: delete the bootstrap secret with C-16, then
run C-8R, which rotates the persistent secret's value in place and creates a new bootstrap secret
(section F row 5). The persistent secret is never force-deleted.

Excluding `"`, `'`, `` ` `` and `\` keeps the value safe to paste from the console into a
login form. It changes nothing for JSON (the script uses `json.dumps`) or for ECS (it injects the
JSON key's value as-is).

### D.3 Offline test of C-8

[`supporting/option-a-c8-offline-harness.py`](supporting/option-a-c8-offline-harness.py) runs the
C-8 block from the draft file unchanged against a mocked `call_boto3`. The mock returns a
synthetic value. In the failing cases the mock's `ValidationException` message **contains the
full `SecretString`**, to show that no message reaches the return. Run with `python3 -I`; the
output is in
[`supporting/option-a-c8-offline-harness-output.txt`](supporting/option-a-c8-offline-harness-output.txt).

| Case | Result | Value or email in return | Secrets left |
| --- | --- | --- | --- |
| Normal | `CREATED`; both secrets have the same password; the bootstrap secret has exactly the two keys | No | Both |
| Persistent create fails | `ABORT CREATE_PERSISTENT_AWS_ValidationException` | No | None |
| Bootstrap create fails | `ABORT CREATE_BOOTSTRAP_AWS_ValidationException`; persistent rolled back | No | None |
| A name already exists | `ABORT NAME_EXISTS` before any value is generated | No | Unchanged |
| Two policy refusals, then a good value | `CREATED` after 3 generations | No | Both |
| Three policy refusals | `ABORT GENERATE_POLICY_RETRIES` | No | None |
| Email placeholder left in | `ABORT EMAIL_NOT_SET` before any call | No | None |

**This tests the script's logic. It does not test the connector, AWS, or L-A0.**

## E. Who can read each secret

From the code on `main`. Live IAM was not re-read for this review. It matched the code on
11 Nov 09:24 UTC (P-11b, PR #88).

| Principal | `identity-bootstrap` | `identity-operator` (persistent) | Source |
| --- | --- | --- | --- |
| `munaxa-nonprod-identity-bootstrap-execution` (ECS pulls secrets for the bootstrap task, and for the Workstream 2 probe task) | **Yes**: `…/identity-bootstrap-??????` | **No**: the pattern is `identity-bootstrap-` plus six characters, which `identity-operator-…` never matches | `ops.tf:224-232` |
| Other service execution roles | No: each reads only its own bundle ARN | No | `modules/service/main.tf:89-96` |
| Workload permission boundary `munaxa-shared-workload-boundary` (nonprod) | Allows up to `munaxa-nonprod/*` | Allows up to `munaxa-nonprod/*` | `bootstrap/iam.tf:64-68`. A boundary is a ceiling, not a grant. A future role that is granted `munaxa-nonprod/*` could read the persistent secret |
| Session deployer and CI roles | Never the value (explicit deny on `GetSecretValue`); **may delete** it | Never the value; **may delete** it | `bootstrap/iam.tf:483-491`, `iam_allow.tf:291-298` (OA-4) |
| Root: the owner in the console, and Claude through the connector | Yes, technically | Yes, technically | No guardrail on root (L-A4) |

The container side, for Workstream 2: ECS resolves `secrets` with the execution role and passes
only the named values into the container. The container never gets the execution role's
credentials, and the probe gets no task role. `enable_execute_command` is `false` for every
service (`modules/service/main.tf:344`), and run-task calls must not set it. While a task runs,
the password sits in that container's environment. The probe and bootstrap code must never print
their environment.

## F. Secret clean-up failure scenarios

| # | Scenario | Effect | Handling | Cost |
| --- | --- | --- | --- | --- |
| 1 | Normal | Bootstrap secret deleted by C-16 after the probe | C-16 `PASS`; C-24 later | About US$0.002 for 3 hours |
| 2 | `DeleteSecret` throttled or failing | Secret still present | C-16 retries; then OA-5: `down` anyway at the hard stop and report R-1 | About US$0.013 a day |
| 3 | **Claude's session ends, or the connector signs out, after C-8** | Bootstrap secret stays. `down`, the scheduled runs and the EventBridge backstop never touch secrets (R-1, PR #89) | Owner deletes it in the console (exact name). The next preflight P-6 finds it. Workstream 3 designs an independent clean-up | US$0.40 a month until deleted |
| 4 | Script times out after the first `CreateSecret` (the connector timed out at 60 s on 11 Nov) | State unknown to Claude | C-8v reads metadata. Persistent only: run **C-8R** (rotate the persistent value in place with `PutSecretValue`, create the bootstrap secret, one call). Both present: carry on. The persistent secret is never force-deleted | None |
| 5 | Bootstrap task refuses the password (policy) | Nothing written to the database | C-16 deletes the bootstrap secret (exact name and ARN), then **C-8R** rotates the persistent value in place and creates a new bootstrap secret. The persistent secret is **never** force-deleted (owner rule, 11 Nov 2026) | None |
| 6 | Bootstrap succeeded, then the persistent secret is deleted or lost | The account works, but nobody can learn its password. There is no reset route (F-L2). Bootstrap never rewrites a password (OA-3) | Restore within the recovery window (`RestoreSecret`). After the window, a reviewed database repair | — |
| 7 | Wrong secret deleted by a wildcard clean-up | As in row 6 | OA-4: exact name and ARN only, and C-16 checks that the persistent secret is still present afterwards | — |
| 8 | Bootstrap secret deleted **before** the probe | The probe task fails to start (`ResourceInitializationError`); no value is exposed | The session's sign-in tests do not run. Re-creating the secret needs the password, which only `GetSecretValue` gives, so **the sign-in tests are lost for this session**. Order: probe, then C-16 | — |
| 9 | Secret scheduled for deletion instead of force-deleted | `ListSecrets` hides it by default and the name stays taken for 7 to 30 days; the next C-8 aborts with `NAME_EXISTS` | C-16 always forces, and checks with `IncludePlannedDeletion` | None while scheduled |
| 10 | Bootstrap secret left after a session (rows 2 or 3) | A working operator password sits in a second place. Only root and the bootstrap execution role can read it, and only root can run a task with that role (the deployer has no `ecs:RunTask`, D-13) | Delete at the next opportunity. The extra exposure is small, because the persistent secret holds the same value | US$0.40 a month |

## G. Cost

Rates: from the first-session preparation (section 8) and PR #89 section G. **Not re-priced
today.** The Secrets Manager figures were checked today against the AWS pricing page: US$0.40
per secret per month, charged by the hour (about US$0.00056 an hour); US$0.05 per 10,000 API
calls; no charge for a secret scheduled for deletion. The data key already exists, so Option A
adds no KMS key charge.

### G.1 Expected session cost

| Item | Rate | 2 h session |
| --- | --- | --- |
| Running resources (ALB, 3 public IPv4, Identity task, RDS) | about US$0.09 to 0.10 an hour | about US$0.20 |
| One-off tasks (db-admin, migrate, bootstrap ×3, probe ×1) | under US$0.02 in total | under US$0.02 |
| Bootstrap secret, about 3 h | US$0.00056 an hour | about US$0.002 |
| Persistent secret during the session | US$0.00056 an hour | about US$0.001 |
| API calls (fewer than 100) | US$0.05 per 10,000 | under US$0.001 |
| **Expected** | | **about US$0.20 to 0.22** |

### G.2 The US$0.35 ceiling is conditional

**US$0.35 is not guaranteed.** It holds only if all of these are true:

1. `down` runs and succeeds by T0 + 3 h. That depends on Claude's session staying alive and the
   connector staying signed in (layer 1, PR #89 section G).
2. The session follows the plan: no repeated `up`, and no more than a few task retries.
3. The rates above are still current. They were not re-priced today.
4. The probe task definition adds no running resource. Task definitions are free, and a probe run
   is a few minutes of 0.25 vCPU.

### G.3 The three-hour hard stop

- It is enforced by Claude: a wake at T0 + 2 h 45 min, then `down` at T0 + 3 h whatever the
  state.
- **It is not an AWS-side control.** If Claude is gone, nothing in AWS enforces it.
- OA-5 belongs here: the hard stop must not wait for the secret delete.

### G.4 Worst case if Claude disconnects

The figures are from PR #89 section G, which assumes loss of control right after `up` at 15:30
UTC.

| Case | What keeps running | Cost |
| --- | --- | --- |
| Both scheduled `down` runs late but working | Everything until the 21:00 UTC backstop (about US$0.55), then the ALB and its addresses until the next working `down` (up to about US$0.43) | **about US$1.00**, about three times the ceiling |
| **Every scheduled `down` dropped** | After 21:00 the backstop stops the database and scales services to 0, but **cannot delete the ALB** | About US$0.037 an hour: **US$0.89 a day, about US$27 a month, with no limit in time** until a person or another `down` acts |
| Plus the bootstrap secret left behind (row 3 of section F) | | Plus US$0.013 a day |

The Testing budget (`bootstrap/budget.tf`, US$50 a month) is not a timely control here:

- it alerts at 80 % actual and 100 % forecast;
- it counts only resources tagged `Environment = nonprod`, and only after the owner has activated
  that cost-allocation tag. Activation was not re-checked for this review.

An ALB left alone would take weeks to reach the 80 % alert. Independent clean-up is Workstream 3.

### G.5 Persistent secret, monthly

| Item | Cost |
| --- | --- |
| `munaxa-nonprod/identity-operator` | **US$0.40 a month** (US$4.80 a year), prorated by the hour |
| Reads | US$0.05 per 10,000. Expected near zero: no role can read it (section E) |
| KMS | None extra (existing data key) |

This is a standing charge outside the per-session ceiling. With the `Environment = nonprod`
tag it counts in the Testing budget. Context: the existing nonprod bundles in `data.tf`
(`local.secret_keys`) already cost US$0.40 each per month.

## H. MFA and password-reset limitations

These are in Identity `5277d71` and are not changed by any custody option.

| # | Limitation | Effect under Option A |
| --- | --- | --- |
| F-L1 | No MFA enrolment or verification route. An enrolled account gets `AUTH_MFA_REQUIRED` (`auth.controller.ts:188-189`). Bootstrap writes `mfa_enrolled = false` | The persistent secret alone is a full operator credential. Anyone who reads it can sign in as the operator wherever the operator host is reachable |
| F-L2 | No password-reset HTTP route | The password can never be changed through the product. The persistent secret cannot be rotated in step with Identity. Rotation would need a reviewed database procedure |
| F-L3 | Operator access is password only | Confidentiality of one Secrets Manager secret is the whole control |
| F-L4 | The operator host is closed by rule 39 while `operator_cidrs = []` | Today a leaked password cannot reach operator routes from the internet. Opening that host (Cloudflare Access) must come **before** any use of the operator account from outside AWS |
| — | `must_change_password = false` at bootstrap (`bootstrap-account.mjs:160-161`) | The generated password stays the working password |
| — | Root MFA | The secret is readable by root. Root MFA is on (owner decision of 8 Nov), so console access to the value is behind MFA. Root through the connector is behind the connector's sign-in, not MFA per call |

## I. Production restrictions

- Option A is approved for **non-production only**. No `munaxa-prod/` secret, and no production
  operator account, may be created this way.
- The deployer guardrail `NeverTheOtherEnvironmentByName` (`bootstrap/iam.tf:416-429`) applies to
  the deployer roles. It does **not** apply to root. Keeping C-8 to `munaxa-nonprod/` names is a
  script rule; nothing in AWS enforces it.
- Before Identity serves production, PR #89 section F lists the minimum: MFA enforced for
  operators; a reset or reviewed recovery flow; operator access only through Cloudflare Access;
  non-root deployment identities; alarms on authentication failures; an external penetration
  test; production secret scanning.
- The Testing operator password must never be reused for production.

## J. What other workstreams need from this review

| Workstream | Item |
| --- | --- |
| 2 (probe task definition) | The probe's `secrets` must reference exactly `…/identity-bootstrap:IDENTITY_OWNER_EMAIL::` and `…/identity-bootstrap:IDENTITY_OWNER_PASSWORD::`, the same partial-ARN form as `ops.tf:278-279`, so that the existing execution-role grant `identity-bootstrap-??????` covers them. Never reference `identity-operator`: that role cannot read it, and the task would fail to start |
| 3 (independent clean-up) | Delete `munaxa-nonprod/identity-bootstrap` by exact name only, never a prefix (OA-4). Any clean-up role must never be granted `secretsmanager:DeleteSecret` on `munaxa-nonprod/identity-operator`. Verification must use `IncludePlannedDeletion` |
| 4 (runbook) | Step 12 becomes C-8 plus C-8v. Step 16 becomes C-16, after the probe. Add C-24 to the shutdown verification. OA-5 changes the step 16 rule |
| Integration | Resource count: Option A adds 1 persistent secret (kept) and 1 temporary secret (deleted). Neither is a Terraform address, so the 11 session addresses and the `down` plan do not change |

## J.1 Update, 11 Nov 2026 (fast-track package, PR #95)

- **O-2 resolved:** the owner confirmed the operator email at 10:30 UTC. It is authorized for the Identity non-production operator account only, not for publication (owner, 11:18 UTC), so this repository calls it `IDENTITY_OPERATOR_EMAIL` and holds no literal value.
- **Owner rule: the persistent secret is never force-deleted.** C-8 no longer rolls back by
  force-deleting `munaxa-nonprod/identity-operator` when the bootstrap create fails. The new
  recovery script **C-8R** (one call: `GetRandomPassword`, `PutSecretValue` on the persistent
  secret, `CreateSecret` for the bootstrap secret, metadata only) replaces every force-delete of
  the persistent secret (section F rows 4 and 5, section D.2). C-8R may run only while no account
  has been created (OA-3).
- The offline harness covers C-8R (4 new cases) and checks that no script before C-16 contains a
  force delete. Output: `supporting/option-a-c8-offline-harness-output.txt`, all cases leak=False.

## K. Outstanding owner inputs

1. **O-2: the Testing operator email (`IDENTITY_OPERATOR_EMAIL`). Confirmed by the owner on 11 Nov 2026.** The value is kept only in the project's private runtime input, never in this public repository, a PR or a committed script. Claude sets it in the session copy of C-8 (and C-8R) only; the committed draft keeps the placeholder `<IDENTITY_OPERATOR_EMAIL>`, so an unedited copy aborts with `EMAIL_NOT_SET`.
2. **The separate deployment authorization.** It must name C-8 and C-16, the residual risks
   L-A0, R-1 and R-2, and the conditional US$0.35 ceiling.
3. A ruling on **OA-5**: `down` at the hard stop even if the secret delete has failed.
4. After the session: whether the owner opens the persistent secret in the console. That is
   allowed. It shows up in CloudTrail as a root `GetSecretValue` (L-A2).

## L. Files

| File | What |
| --- | --- |
| `00-IDENTITY-OPTION-A-CUSTODY-COST-REVIEW.md` | This report |
| `supporting/option-a-connector-scripts.DRAFT.py` | C-8, C-8R, C-8v, C-16 and C-24 as drafts. **Not run** |
| `supporting/option-a-c8-offline-harness.py` | Offline harness for C-8 with a mocked `call_boto3` and a synthetic value |
| `supporting/option-a-c8-offline-harness-output.txt` | Its output, 11 Nov 2026 |

The index row in `agent-reports/README.md` is not added by this PR. Workstream 4 adds the rows
of all five workstreams in one index PR, to avoid conflicting "Latest" rows.
