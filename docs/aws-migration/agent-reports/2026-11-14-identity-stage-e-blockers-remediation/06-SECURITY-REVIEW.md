# Security and correctness review

Two independent reviewers (subagents with no part in writing the code) read the branch diff
against `origin/main` 68fa6f9 at a82b160: one for **correctness**, one for **security**. Both
were read-only, ran the offline tests only, and made no AWS call. A third reviewer then checked
the fix commit 6fc37c4 (section 4).

Result: **no Critical.** One High and eight Medium findings, **all fixed** in 6fc37c4. Seven Low
findings: three fixed, four accepted below. The fix check found two more High defects, both fixed
in 8f28a61, and three Lows, accepted (section 4).

## 1. Findings and what was done

| ID | Sev. | Finding | Fix (6fc37c4) | Test that holds it |
| --- | --- | --- | --- | --- |
| C-1 | **High** | Throwaway mode could never create its account: the loader started `bootstrap-account.mjs` with a five-name environment, dropping the image-level `NODE_EXTRA_CA_CERTS` (RDS CA, Identity `apps/api/Dockerfile`), so every run would fail TLS to RDS. The loader test asserted that exact five-name environment | The child gets `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE` from the image when set | loader test "account container: creates the account …" asserts the six names incl. `NODE_EXTRA_CA_CERTS` |
| S-1 | Medium | The downloaded probe ran in the process that had held `DIRECT_DATABASE_URL`; `delete process.env` does not clear `/proc/self/environ`, so a bad probe commit could read the owner URL | Throwaway mode is two containers: a non-essential `throwaway-account` container (the only one with the URL) creates the account and writes a one-time hand-off file; the `identity-probe` container has **no secret**, starts after it exits 0, has its own PID namespace, refuses any database variable, reads and deletes the hand-off | `stack.tftest.hcl` throwaway run (secrets, dependsOn, volume, no pidMode); 15 loader tests for both stages; E-1 probe-task drift tests |
| S-2 / C-4 | Medium | E-1 validated only some fields: an added `entryPoint`, command, `NODE_OPTIONS`, capability, or a loader that kept the pin strings could pass as valid | E-1 compares the exact set of environment names, the shape fields (`shapeKeys`), the command (exact, or SHA-256 of db-admin's script and of the probe loader with the pin normalised, using a plain-Python SHA-256), task volumes, `pidMode`/`ipcMode` and environment files, for every container of every family | 12 bootstrap drifts, 10 cross-family drifts, 7 probe-task drifts; `stage-e-manifest.tftest.hcl` keeps the manifest equal to what Terraform renders (mutation-checked) |
| S-3 | Medium | A P or S schedule left from an earlier session could fire inside a new one (delete its ALB, stop its tasks, delete the bootstrap secret) | H-20 `gate` lists schedules and refuses any leftover P/S (its own pass when `HARD_STOP_UTC` is given); new `disarm` mode after `down` | `test_a_leftover_schedule_…`, `Disarm` tests |
| C-2 | Medium | E-1 called `ListTasks` with `startedBy` and `desiredStatus`; the ECS reference allows `startedBy` only alone | `ListTasks` by family and status, then `DescribeTasks` and the `startedBy` match in the script | the fake ECS asserts no `startedBy` filter is ever sent |
| C-3 | Medium | After about an hour ECS forgets stopped tasks, so `status` said `NOT_STARTED` for a task that ran | `NOT_FOUND` / `NOT_LISTED_MAY_HAVE_EXPIRED` with the instruction never to re-run on that basis; runbook text in file 01 | `test_not_started_and_bad_inputs` |
| C-5 | Medium | The normal between-sessions state (no ALB, no bootstrap secret) depended on unverified Step Functions "not found" error names; a wrong name would fail R every day and block the gate | Secret and ALB are listed and filtered (`ListSecrets` + exact name; `DescribeLoadBalancers` page of 400 + exact name); a second page is "unexpected", never guessed; `ListSecrets` added to the role and the nonprod boundary (on `*`, metadata only) | `test_no_not_found_error_name_is_needed_on_a_normal_day`, page and longer-name tests |
| C-6 | Medium | The lockout check accepted any 429, including the edge's per-identifier limit | Only 429 `AUTH_RATE_LIMITED` counts; the edge code fails the check | `edgeLimitInsteadOfLockout` mock case |
| C-7 | Low | `origin-enforced` expectations unverified | **Verified** in `packages/platform/security/src/csrf.ts` (absent Origin untrusted) and `middleware.ts` (403 `SECURITY_CSRF_INVALID`) | existing mock cases |
| C-8 | Low | The gate accepted a dry-run success; `arm` accepted a session crossing 21:00 UTC (R at 21:05 would delete a live ALB) | Gate requires the last success to be `dryRun false` (`DescribeExecution`); `arm` refuses `SESSION_CROSSES_21_UTC` | gate case `last_success_was_real`; 21:00 test with a fixed clock |
| C-9 | Low | A secret pending deletion failed R daily for 7 to 30 days | Reported `pending-deletion`, `ok: true` | updated secret test |
| C-10 | Low | The first-session checklist still showed `run_one` commands | Every task step now names the E-1 `run` inputs; the old function is marked superseded | `NoRevisionNumbers` lint still passes |

## 2. Accepted Low findings

| ID | Finding | Why accepted |
| --- | --- | --- |
| S-4 | Throwaway accounts can be left enabled if the account container is killed after the row is written, or the `sub` line cannot be parsed | The password is random and never leaves the task; the account is in its own tenant with no role; `operator-cli account-disable` is tenant-scoped (cannot reach the operator). The runbook's clean-up step records it. A periodic "disable everything in `munaxa-stage-e-checks`" command is a later improvement |
| S-5 | The shared nonprod workload boundary now admits `DeleteLoadBalancer` (nonprod ALB), `DeleteSecret` (bootstrap secret), `ecs:StopTask`, `states:StartExecution`, `secretsmanager:ListSecrets` | A boundary is a ceiling; only the deployer can grant these, and it already holds comparable rights. Nonprod key only; prod unchanged (bootstrap test) |
| S-6 | The account-disable run uses the `identity` service task definition, so it holds the signing key and Redis/MFA keys with a public IP | `operator-cli` needs that configuration; the run is allow-listed (`UUID` only) and S-2's stricter validation makes a tampered revision fail |
| E-V | E-1 compares environment **values** only where the manifest lists them | Names are exact, so no variable can be added; a changed value of an existing variable cannot add code to run. Values are pinned by Terraform review |

## 3. Checked and found sound (both reviewers)

- The state machine cannot delete the wrong ALB or secret (exact name, type, scheme, VPC, ARN
  pattern, delete by the captured ARN; IAM limits deletion to the nonprod ALB with tag conditions
  and to `identity-bootstrap-??????`, which cannot match `identity-operator`); explicit denies on
  every other secret delete, every secret value action and every `munaxa-prod*` resource; trust
  pinned to the account and the state machine ARN.
- The deployer gains no escalation path (`PassRole` only for the cleanup role, only to
  `states.amazonaws.com`).
- Inputs are not injectable (exec-form overrides, UUID-checked `ACCOUNT_ID`, shape-checked
  `PROBE_ALB_DNS` plus TLS host verification, schedule names from the validated hard stop).
- Nothing unsafe by default: `testing_session_cleanup`, `session_cleanup_enabled` and the probe pin
  are off or empty; the unpinned manifest makes E-1 refuse the probe.
- Option A scripts read no value and return neither the password nor the email; creates use a
  client token; C-16 deletes only the exact name with a six-character suffix.
- Identity 2db6ed9 behaviour the probe expects (routes, cookies, MFA, refresh lineage revocation,
  lockout code, `operator-cli` flags, `bootstrap-account.mjs` output) matches the source.
- No real email address, key or credential is in the diff (synthetic `.invalid`,
  `example.*` and `munaxa-synthetic.net` values only).

## 4. Fix verification (third reviewer, 6fc37c4)

| Finding | Verdict |
| --- | --- |
| C-1, S-2/C-4, C-2/C-3, S-3 + C-8, C-6, C-10 | Fixed (evidence by file and line in the review) |
| S-1 | Secure, but would not run: see N-1 |
| C-5/C-9 | List-based discovery and IAM right; see N-2 |

New findings from that review:

| ID | Sev. | Finding | Fix (8f28a61) |
| --- | --- | --- | --- |
| N-1 | **High** | A Fargate bind mount is created empty, root-owned, mode 0755 (the image declares no `VOLUME`), so the non-root account container could never write the hand-off: every throwaway probe run would stop at `handoff-not-writable` | The account container runs as uid 0 (read-only root filesystem, every capability dropped, no task role) and writes the file 0644 at `/stage-e`; the probe container stays non-root with the mount read-only. Manifest (`user`, mounts), E-1 and Terraform tests updated |
| N-2 | **High** | Step Functions `StringMatches` treats only `*` as a wildcard, so the secret ARN pattern `…identity-bootstrap-??????` would never match: the bootstrap secret would never be deleted, R would fail every day and the H-20 gate would never pass. The simulator used `fnmatch`, which hid it | Pattern `…identity-bootstrap-*` (the exact-name filter already applies); the simulator implements `StringMatches` with `*` and `\*` only; a regression test and a Terraform assertion that the definition contains no `??????` |
| N-3 | Low | A `ListSecrets` page with `NextToken` is treated as unexpected (fails closed) | Accepted: one exact-name filter cannot plausibly page; a false failure raises the alarm, never a false success |
| N-4 | Low | `guard_running` reads only the first `ListTasks` page (100 tasks) | Accepted: a Testing session runs a handful of tasks |
| N-5 | Low | Fields outside `shapeKeys` (`ulimits`, `dockerLabels`, task `cpu`/`memory`, …) and the probe's own environment values are not compared | Accepted: none changes which code runs or where a secret goes; a tampered probe value can only weaken the probe's own verdicts |

## 5. Open questions no offline review can settle

- **The connector's audit and `api_calls` record.** If the AWS connector logs call parameters or
  responses, C-8 and C-8R would put the generated password (the `GetRandomPassword` response and
  the `CreateSecret`/`PutSecretValue` `SecretString`) into a log no script controls. This is the
  L-A0 residual the owner accepted on 11 Nov, but its size is unknown. Recommended before C-8:
  run C-8 once against a dummy secret name and inspect what the connector returns (file 08).
- Whether CloudTrail records a `GetRandomPassword` response (C-24 checks after the fact).
- The [U] items in files 01, 02, 03 and 05; each fails closed if wrong.
