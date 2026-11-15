# BE-3: the pinned probe and the throwaway-account MFA checks

Status: **BUILT IN THE REPOSITORY, NOT PINNED, NOT RUN.** The probe has no task definition until a
separate pin PR sets `identity_probe_source`; nothing in this PR changes a plan.

## 1. Pieces

| Piece | File | Role |
| --- | --- | --- |
| Probe | `infra/aws/stack/supporting/identity-session-probe.mjs` | The checks; Node built-ins only (`crypto`, no `fs`); prints only `PASS <check>`, `FAIL <check> <code>`, `INFO …` and a summary |
| Loader | `infra/aws/stack/scripts/identity-probe-loader.mjs` | The program of both probe-task containers (`PROBE_STAGE`): `account` creates the throwaway account and hands the credential over; `probe` downloads the probe at the pinned commit, verifies its SHA-256, reads the hand-off and imports the probe |
| Task definition | `infra/aws/stack/identity-probe.tf` | `munaxa-nonprod-identity-probe`; exists only when `identity_probe_source` is pinned; throwaway mode has two containers (below); read-only root filesystems, no capabilities, no task role, no shared PID namespace |
| Variables | `variables.tf` | `identity_probe_source {commit, sha256}` (empty = no task definition), `identity_probe_account` (`throwaway` default, or `operator`) |
| Tests | `identity-session-probe.test.mjs` (73), `identity-probe-loader.test.mjs` (41), `tests/stack.tftest.hcl` (throwaway, operator and validation runs) | Against a mock Identity built from the 2db6ed9 source; offline |

## 2. Checks

Both modes run the original fifteen, in this order: `tls-certificate`, `health-live`,
`health-ready`, `session-unauthenticated`, `login`, `session-authenticated`, `jwt-verification`
(signature against JWKS, `iss`, `aud`, `exp`), `refresh` (rotation), `logout`,
`refresh-replay-after-logout`, `invalid-password` (exactly one wrong attempt), `operator-host`,
`control-admin-path`, `control-other-path`, `unknown-host`.

Throwaway mode then runs thirteen more (28 in all), lockout last because it locks the account:

| Check | Expected (Identity 2db6ed9) |
| --- | --- |
| `origin-enforced` | a state-changing request with `Origin: https://foreign-origin.invalid`, and one with no `Origin`, are refused (403 `SECURITY_CSRF_INVALID`). Verified in `@munaxa/security` (`csrf.ts` `isTrustedOrigin`: an absent Origin is untrusted; `middleware.ts` answers 403 with that code) |
| `refresh-reuse-detected` | presenting a rotated-away refresh token is refused and revokes the lineage (the newest token stops working too) |
| `mfa-enrollment` | after reauthentication, `POST mfa/enrollment` returns a secret and an `otpauth` URI; confirm with a TOTP returns the recovery codes; `mfa/status` says enrolled |
| `mfa-challenge-required` | a password login now returns 401 `AUTH_MFA_REQUIRED` with the `__Host-mx_mfa` cookie (Path=/, SameSite Strict), no session |
| `mfa-invalid-code` | a wrong six-digit code gives 401 `AUTH_MFA_INVALID` |
| `mfa-totp-replay` | the same TOTP step used twice is refused the second time |
| `mfa-totp` | the next step's TOTP completes the sign-in (the probe waits for a new 30-second step) |
| `mfa-status` | enrolled, and `recoveryCodesRemaining` equals the codes returned |
| `mfa-recovery-code` | one recovery code completes a challenge |
| `mfa-recovery-code-reuse` | the same recovery code is refused |
| `mfa-recovery-code-count` | the remaining count dropped by exactly the codes used |
| `mfa-disable` | after reauthentication, `DELETE /api/auth/mfa` removes the factor; the next login needs no challenge |
| `lockout` | wrong passwords until 429 `AUTH_RATE_LIMITED` (at most 22 attempts); a correct password is then refused too, with the same code. The edge's per-identifier limit (429 `SECURITY_RATE_LIMITED`) fails the check instead of passing it (review finding C-6) |

The probe never prints the password, the TOTP secret, a code, a recovery code, a cookie or a
token: each is registered as sensitive when it is created, and any output line containing one is
replaced by `FAIL probe redacted-output` (tested).

## 3. The throwaway account

Throwaway mode gives the probe task two containers (security review finding S-1):

| Container | Essential | Secret | What it does |
| --- | --- | --- | --- |
| `throwaway-account` | no | `DIRECT_DATABASE_URL` only (identity-migrate owner URL, pinned version) | Never downloads the probe. Proves the hand-off volume is writable, then generates `stage-e-<16 random hex>@stage-e.invalid` and a password `Se7-` + base64url(24 random bytes) (36 characters), runs `node scripts/bootstrap-account.mjs --organisation munaxa-stage-e-checks --organisation-name "Stage E checks"` (Identity's own reviewed script, default command, so **no role**) with a minimal environment (`PATH`, `NODE_ENV`, the RDS CA bundle variables `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE` the image sets, `DIRECT_DATABASE_URL`, `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD`), prints `INFO throwaway-sub <uuid>`, writes the identifier, password and sub to `/stage-e/stage-e-account.json` (mode 0644, never overwritten) and exits 0. Runs as uid 0 (below), with a read-only root filesystem, every capability dropped and no task role |
| `identity-probe` | yes | none | Starts only after the account container exited 0 (`dependsOn SUCCESS`). Runs as the non-root identity user with the volume mounted read-only. Refuses if any database variable is present. Verifies the probe source, reads the hand-off file once, checks its shape, and passes the credential to the probe in an argument object, never through `process.env` |

The containers share only an ephemeral task volume at `/stage-e`. Fargate creates such a bind
mount empty, owned by root, mode 0755 (the image declares no `VOLUME` there), so only uid 0 can
write it: the account container runs as uid 0 and the probe container only reads (fix-check
finding N-1). The file stays on the task's volume until the task ends. They do not share a PID
namespace, and the account
container has exited before the probe starts, so the downloaded probe cannot read the database URL
from its environment, from `/proc`, or from the other container.

The RDS CA bundle (review finding C-1, High): Identity's image trusts RDS through an image-level
`NODE_EXTRA_CA_CERTS`, which Node reads only at process start, so the loader passes it to the
bootstrap child explicitly. Without it every account creation would fail with
`SELF_SIGNED_CERT_IN_CHAIN`.

Refusals: the probe refuses an identifier without the throwaway shape
(`not-a-throwaway-account`; the loader also refuses a hand-off of any other shape) and an organisation other than `munaxa-stage-e-checks`; operator mode
refuses a throwaway identifier (`throwaway-in-operator-mode`).

Clean-up, after the probe: the probe removes the MFA factor itself; the lockout check locks the
account; then E-1 `run` on `munaxa-nonprod-identity` with `account-disable-plan` and
`account-disable` (`ACCOUNT_ID` = the sub). See file 04, section 6.

## 4. Procedure (pin, run, read)

1. **Pin PR** (repository, then an owner-approved apply): set `identity_probe_source` in
   `envs/nonprod.tfvars` to the merge commit of this PR and the SHA-256 of
   `supporting/identity-session-probe.mjs` at it, and set `probePin` in
   `envs/nonprod.stage-e-tasks.json` to the same two values (`test_task_guard.py` keeps them
   equal). Declare the probe task definition create in `envs/nonprod.expected-changes.json`.
2. Apply it (owner-approved, the session down). E-1 `discover` must then report the probe family
   `valid: true`.
3. In the session, after the `identity` service is healthy: E-1 `run`, family
   `munaxa-nonprod-identity-probe`, `COMMAND = "default"`, `PROBE_ALB_DNS` = the session's ALB
   name, a fresh `RUN_TOKEN`. E-1 `status` must say SUCCEEDED (exit 0, the pinned image).
4. Read the CloudWatch stream `identity-probe/…` in the ops log group: 28 `PASS` lines and the
   summary `28/28 passed`. Any `FAIL` stops Stage E; the code names the check.
5. Clean up the throwaway account (file 04, section 6).

## 5. Limits

- [U] The hand-off volume: a Fargate bind mount is expected to be empty, root-owned and 0755 (AWS
  documentation; not exercised offline). If uid 0 cannot write it, the account container stops
  with `FAIL throwaway-account handoff-not-writable` **before** creating anything, and the probe
  container never starts.
- [U] `dependsOn SUCCESS` on a non-essential container: if the account container fails, the probe
  container does not start and E-1 `status` reports FAILED (a container without an exit code 0).

- The mock Identity follows the 2db6ed9 source as read; a behaviour the source reading missed
  would show up only as a `FAIL` in the real run (fails closed, never a false `PASS`).
- `mfa-totp` waits for a fresh 30-second TOTP step, so the throwaway run takes up to about two
  minutes longer than the operator run.
- The probe trusts the ALB's public certificate chain (no pinning beyond the hostname).
