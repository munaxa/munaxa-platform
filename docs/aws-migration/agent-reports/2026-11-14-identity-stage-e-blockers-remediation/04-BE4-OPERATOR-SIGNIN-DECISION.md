# BE-4: operator sign-in during Stage E (decision record)

Status: **PROPOSED, for owner approval with the Stage E package.** Recommendation: **skip operator
sign-in in Stage E; use one synthetic throwaway account.** Repository work only: no account,
credential or secret was created, read or changed for this record.

## 1. The question

The Stage E plan (report 2026-11-14-identity-stage-d-correction-and-stage-e-readiness, PR #129)
had the probe sign in as the Testing operator, using the Option A credential
(`munaxa-nonprod/identity-bootstrap`, created by C-8). BE-4 asked whether that is needed, who
enters which credential, what Claude can reach, how test accounts are isolated and cleaned up,
and what stays untested.

## 2. Decision (recommended)

| | Decision |
| --- | --- |
| Operator account | **Created** in Stage E exactly as planned (S-6a/S-6b/S-6c through E-1: `bootstrap-account.mjs` default command, `seed-control-roles`, `--role control-operator-admin`), because later Control work needs it. **Never signed in to** during Stage E, by anyone or anything. |
| Probe account | A **throwaway** account created inside AWS by the probe task's separate account container, per run: `stage-e-<16 random hex>@stage-e.invalid`, a random 36-character password, organisation **`munaxa-stage-e-checks`** (its own tenant), **no role**. |
| MFA and lockout tests | Throwaway account only. The probe refuses to run its MFA enrolment and lockout unless the identifier has the throwaway shape (`not-a-throwaway-account`), and refuses a throwaway identifier in operator mode. |
| Clean-up | MFA factor removed by the probe itself (check 27); account locked by check 28; then **disabled** with Identity's own `operator-cli account-disable --apply` through E-1 (`munaxa-nonprod-identity`, command `account-disable`, `ACCOUNT_ID` = the sub the loader printed). The tenant row and the disabled account remain in the Testing database (no delete tool exists; test data only). |
| Default in code | `identity_probe_account = "throwaway"` (variables.tf). `"operator"` keeps the original 15-check design for a later, separate owner decision. |

Why: an operator sign-in would put the one privileged Testing credential into a network-facing
task for no added coverage. Every Stage E check (health, sign-in, JWT, refresh rotation, replay,
logout, origin, host rules, MFA, lockout) behaves the same for any local account; the throwaway
account gives the MFA and lockout checks a target whose lockout or MFA state cannot block the
operator.

## 3. Who uses which account, and who enters what

| Step | Account | Credential source | Who enters it | Claude sees it? |
| --- | --- | --- | --- | --- |
| C-8 (create Option A secrets) | operator | `GetRandomPassword` inside the connector script; email is the owner-confirmed address, typed into the session copy's INPUT line | Claude (connector), email from the owner's 11 Nov message | Email: yes (already known, never published). Password: **no** (never returned) |
| S-6a/b/c (create the operator, seed roles, grant role) | operator | ECS injects `IDENTITY_OWNER_EMAIL`/`PASSWORD` from the one-run secret | nobody (ECS agent) | no |
| C-16 (delete the one-run secret) | none | | Claude (connector) | no |
| Probe (28 checks) | throwaway | The account container generates both inside the task (`DIRECT_DATABASE_URL` injected by ECS into that container only) and hands them to the probe container through the task's ephemeral volume | nobody | **no**: the account container prints only `INFO throwaway-sub <uuid>`; the probe prints PASS/FAIL lines |
| Throwaway disable | throwaway (by id) | none; operator-cli runs with the service task's own configuration | Claude (E-1 `run`, the sub as input) | the sub only (a public identifier) |
| Later Control work | operator | the persistent `munaxa-nonprod/identity-operator` secret | **the owner**, outside Stage E | no |

## 4. What Claude can and cannot access

- **Can:** run the reviewed connector scripts (E-1, H-20, C-8, C-8R, C-8v, C-16, C-24) as root
  through the connector, after the owner's Stage E approval; read their results (names, ARNs,
  revision numbers, statuses, codes, CloudWatch PASS/FAIL lines, the throwaway sub).
- **Cannot (by construction):** read any secret value (no script names `GetSecretValue` or
  `BatchGetSecretValue`; the harness refuses them); see the operator password (generated and
  stored inside one `CreateSecret` call); see the throwaway password or MFA secrets (generated and
  used inside the probe task; the output guard drops any line containing them); sign in to
  Identity as anyone (no browser, no credential).
- **Residual (L-A0, accepted by the owner on 11 Nov):** the operator password passes through the
  connector's sandbox memory during C-8, whose server-side log Claude cannot inspect.

## 5. Isolation of the throwaway account

- Its own organisation `munaxa-stage-e-checks`: a separate tenant row; Identity scopes accounts,
  sessions and roles by tenant, so it cannot see or affect `munaxa-group`.
- No role: no Control or Work permission; a session for it grants nothing in another product.
- Identifier under `.invalid` (RFC 6761): no email can ever be delivered for it, so password reset
  cannot reach anyone.
- Its credential exists only inside the probe task (the account container's memory, the hand-off
  file on the task's ephemeral volume, which only the two containers of that task mount, and the
  probe's memory) and dies with the task (read-only root filesystems, no task role, no AWS
  credentials). The probe container never holds the database URL (file 03, section 3).
- Every run makes a new random identifier, so two runs never share an account.

## 6. Clean-up procedure (part of Stage E, after the probe)

1. Record the sub from the probe's `INFO throwaway-sub <uuid>` line (CloudWatch, ops log group,
   stream prefix `identity-probe`).
2. E-1 `run`, family `munaxa-nonprod-identity`, `COMMAND = "account-disable-plan"` (no `--apply`:
   reports what it would do), then `COMMAND = "account-disable"`, `ACCOUNT_ID = <sub>`, a fresh
   `RUN_TOKEN` each. E-1 `status` must say SUCCEEDED.
3. If the probe failed before printing the sub, no account exists (the loader prints it before
   any check runs). If the loader printed `FAIL throwaway-account bootstrap-*` after a partial
   write, the account may exist without a known password: it is unusable; record it.
4. Accepted residue: one tenant row and one disabled account per probe run, in the Testing
   database only.

## 7. What stays untested in Stage E

| Not tested | Why | When |
| --- | --- | --- |
| Operator sign-in, the operator's MFA enrolment | by this decision | first Control session, owner-driven |
| Control and Work authorisation for the operator's roles | Control and Work are not deployed in Stage E | their sessions |
| Password reset by email | `IDENTITY_PASSWORD_RESET` disabled in nonprod; `.invalid` | later |
| The privileged MFA policy (`mfa_policy = "required"`) | nonprod runs `mfa_policy = "off"` (P-4) | after the enrolment procedure exists |
| Lockout expiry (900 s) | Stage E does not wait 15 minutes | accepted |
| Access-token revocation after disable at relying parties | 15-minute JWTs remain valid until expiry by design | accepted |

## 8. Owner decision needed

D-BE4: approve "skip operator sign-in; throwaway account per probe run; disable after" (this
record), or choose operator sign-in (set `identity_probe_account = "operator"` in the pin PR;
then the probe runs 15 checks and no MFA or lockout test happens in Stage E).
