# Identity session probe (Workstream 1)

Date: 11 November 2026, 10:08 to 10:40 UTC. Owner authorization: 11 November 2026 (five preparation
workstreams; PR creation yes, merge no, AWS no).

Base: `munaxa-platform` main `49c51f36fb53d1e450c9cf8af58a969897d00623`; Identity source read at
`munaxa-identity` main `5277d7190b3dda496443c4bd7d80c78bd4d9174e`.

**Verdict: WRITTEN AND TESTED OFFLINE, NOT RUN IN AWS.** This closes the code half of blocker BL-1
in the pre-authorization review (PR #89). No AWS call, no Terraform apply, no DNS change, no secret
was made or read. The probe has never met the real ALB or Identity.

## 1. Files

| File | What |
| --- | --- |
| `infra/aws/stack/supporting/identity-session-probe.mjs` | The probe: one ES module, Node 22, `node:` built-ins only (`crypto`, `https`, `tls`, `url`) |
| `infra/aws/stack/supporting/identity-session-probe.test.mjs` | 54 unit tests (`node --test`), offline |
| `.github/workflows/aws-terraform.yml` | One new step in the PR job "Format, validate, mocked plan tests": Node 22, then the probe tests |
| This report | |

SHA256 of the probe at this PR's head: see section 7. **The pin for a session must be taken from
the merged commit on `main`, not from this branch**, because the file's bytes decide the hash.

`docs/aws-migration/agent-reports/README.md` is deliberately not edited: Workstream 4 adds every
workstream's row in one index PR that merges last, so the five PRs do not conflict.

## 2. How it runs

1. The probe task definition (Workstream 2, `infra/aws/stack/identity-probe.tf`) runs the loader
   `infra/aws/stack/scripts/identity-probe-loader.mjs` as its command. The commit and SHA256 are
   written into the loader by Terraform, so a RunTask override cannot change the pin. The loader
   downloads this file from `https://raw.githubusercontent.com/munaxa/munaxa-platform/<commit>/infra/aws/stack/supporting/identity-session-probe.mjs`,
   refuses a redirect, caps the size, checks the hash, imports the bytes from a `data:` URL (the root
   filesystem is read-only) and runs `process.exitCode = await m.default(process.env)`.
2. The probe reads its environment once (`readConfig`). It copies `IDENTITY_OWNER_EMAIL` and
   `IDENTITY_OWNER_PASSWORD`, then deletes them and `DIRECT_DATABASE_URL`, `DATABASE_URL`,
   `DATABASE_MIGRATION_URL` from `process.env` before any connection. The database URLs are never
   read. It refuses to start if `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. `PROBE_ALB_DNS` (the only RunTask override) must be an `eu-central-1` ELB name. The optional
   baked values (`PROBE_HOST`, `PROBE_ORGANISATION`, `PROBE_SIGNING_KID`, `PROBE_ISSUER`,
   `PROBE_AUDIENCES`, `PROBE_OPERATOR_HOST`, `PROBE_CONTROL_API_HOST`, `PROBE_UNKNOWN_HOST`,
   `PROBE_PUBLIC_KEYS`) must equal the reviewed constants in the file, or the run stops with
   `FAIL config <code>`. The checks always use the constants, so a changed task definition cannot
   point the probe at another host, issuer or key.
4. Every request goes to the ALB's AWS name with `servername` (SNI) and `Host` set to the host being
   tested. Certificate checking is Node's default against the system trust store, with the name
   checked against the SNI name. The file contains no `rejectUnauthorized` and no
   `checkServerIdentity` (a test enforces this).
5. Output: one `PASS <check>` or `FAIL <check> <code>` per check, then
   `SUMMARY pass=<n> fail=<n> total=15 result=PASS|FAIL`. Exit 0 only if all 15 pass; 1 if any fail;
   2 for a configuration error. The loader uses 3 for its own failures.

Interface agreed with Workstream 2 (task definition and loader) and Workstream 4 (runbook) during
this work.

## 3. The checks

Expected values come from configuration on main, not from the probe (sources in the file header).

| # | Check | Request (host is SNI and Host) | PASS when |
| --- | --- | --- | --- |
| 1 | `tls-certificate` | TLS handshake, `id.test.munaxa.com` | Chain trusted, name matches, TLS 1.2 or 1.3, inside the validity window |
| 2 | `health-live` | `GET /api/auth/health/live` | 200, `status: ok` |
| 3 | `health-ready` | `GET /api/auth/health/ready` | 200, `status: ok`, `cache: redis`, `signingKid: identity-nonprod-2026-11` |
| 4 | `session-unauthenticated` | `GET /api/auth/session`, no cookie | 200, `signedIn: false` |
| 5 | `login` | `POST /api/auth/login`, `Origin: https://id.test.munaxa.com`, `{identifier, password, organisation: "munaxa-group"}` | 200 `{ok:true}`; `__Host-mx_session` (Path=/, Secure, HttpOnly) and `__Secure-mx_refresh` (Path=/api/auth/refresh, Secure, HttpOnly) set |
| 6 | `session-authenticated` | `GET /api/auth/session` with the session cookie | 200, `signedIn: true`, numeric `expiresAt` |
| 7 | `jwt-verification` | Offline, the access-token cookie | alg ES256, kid `identity-nonprod-2026-11`, signature against the committed public key, `iss https://id.test.munaxa.com`, `aud` exactly `munaxa-work` and `munaxa-control`, not expired, `iat` not in the future (30 s skew), `exp - iat = 900` |
| 8 | `refresh` | `POST /api/auth/refresh`, Origin, refresh cookie, `{organisation: "munaxa-group"}` | 200 `{ok:true}`; a new, different refresh token; the new access token also verifies |
| 9 | `logout` | `POST /api/auth/logout`, Origin, the cookies a browser sends to that path | 200 `{ok:true}`; both cookies cleared |
| 10 | `refresh-replay-after-logout` | `POST /api/auth/refresh` with the last refresh token held before logout | 401 `AUTH_INVALID_CREDENTIALS`. A 200 prints `FAIL ... replay-accepted` (plan H-12) |
| 11 | `invalid-password` | One `POST /api/auth/login` with a random wrong password | 401 `AUTH_INVALID_CREDENTIALS`, no session cookie. Exactly one attempt, after the valid login |
| 12 | `operator-host` | `GET /` and `GET /api/auth/login`, `operator-test.munaxa.com` | 403 `Forbidden` both (rule 39) |
| 13 | `control-admin-path` | `GET /api/v1/admin/probe`, `control-api.test.munaxa.com` | 403 `Forbidden` (rule 10) |
| 14 | `control-other-path` | `GET /`, `/api/v1/health`, `/API/V1/ADMIN/probe`, same host | 403 `Forbidden` each (rule 21) |
| 15 | `unknown-host` | `GET /`, `unknown.test.munaxa.com` | 404 `Not found` (HTTPS default action) |

A check whose prerequisite failed prints `FAIL <check> blocked`, so the summary always has 15 lines.

**HTTP to HTTPS is not a probe check.** The task's security groups allow no outbound port 80. It is
configuration evidence from `DescribeListeners`: the port 80 listener's default action must be
`redirect` to `HTTPS` port `443` with `HTTP_301` (`edge.tf:87-102`). Workstream 4's runbook owns
that read.

## 4. Decisions worth reviewing

- **D-1 Logout cookies.** The probe sends logout only what a browser would: the session cookie. The
  refresh cookie's Path (`/api/auth/refresh`) keeps it away from `/api/auth/logout`. Identity's
  logout then revokes the session named by the access token's `sid` (`auth.service.ts:253-257`), and
  a later refresh fails session validation and revokes the family (`auth.service.ts:198-208`). So
  check 10 tests the path a real browser takes. Sending the refresh cookie to logout as well would
  test the token-revocation branch instead; it is a one-line change if the reviewer prefers it.
- **D-2 Replay token.** Check 10 replays the refresh token issued by check 8 (the newest valid one
  before logout). Replaying the token from login would test reuse detection, which is a different
  property.
- **D-3 The wrong password runs after the valid login**, so a lockout (keyed by the identifier,
  `auth.service.ts:333-339`) cannot block the real sign-in. It is still exactly one attempt.
- **D-4 Public key.** The committed key is a constant in the probe, and a test proves it equals
  `identity_public_keys` in `envs/nonprod.tfvars`. A `PROBE_PUBLIC_KEYS` value, if baked, must be
  the same key (compared as DER) or the run stops.
- **D-5 The loader is not in this file.** Workstream 2 holds the only loader, with the pin written in
  by Terraform. A loader that read the commit from the environment could be redirected by a RunTask
  override. This file's tests prove only that the bytes load from a `data:` URL and run once.
- **D-6 Output guard.** Besides the allow-list formatter, `main` drops any line that contains the
  email, the password, the wrong password or any cookie value seen during the run, printing
  `FAIL probe redacted-output` instead.

## 5. Tests

`node --test infra/aws/stack/supporting/identity-session-probe.test.mjs` on Node v22.23.4: **54 of
54 pass** (9 suites, about 0.8 s). The test suite makes a throwaway CA and leaf certificates with
`openssl` in a temporary folder, runs a local HTTPS server on 127.0.0.1 that mimics the ALB rules and
Identity's routes, and signs tokens with a throwaway ES256 key.

| Area | What is covered |
| --- | --- |
| Cookie extraction | Attributes, URI decoding, malformed entries, cleared cookies, RFC 6265 path matching, the Cookie header per path |
| JWT verification | Valid token; the committed key equals `nonprod.tfvars`; invalid signatures (other key, forged payload, zero and short signature); invalid key ids; `none`/HS256/RS256; expired; future `iat`; wrong lifetime; invalid audiences (missing, string, extra, duplicate, absent); wrong issuer; malformed input; no claim value returned |
| Safe output | PASS/FAIL format, unknown check names and unsafe codes replaced, summary, allow-list regex |
| Error sanitisation | Messages, extra properties and unknown codes reduced to `error`; known network and TLS codes mapped |
| Configuration | Credentials and database URLs deleted (also on a refused run); `NODE_TLS_REJECT_UNAUTHORIZED=0` refused; ALB name pattern; every baked value pinned; public key comparison |
| End to end (mock) | All 15 pass in order; Origin and organisation on login and refresh; no refresh cookie sent to logout; SNI equals Host; exactly one wrong password; output has no email, password, token or cookie; failures: replay accepted, memory cache, other kid, bad token, no rotation, 429 lockout, open Control host, operator login refused (dependents `blocked`) |
| TLS | Wrong-name certificate fails every check `tls-name-mismatch`; untrusted CA fails; refused connection |
| Source | `node:` imports only, no relative import or `require`; no `rejectUnauthorized`, `checkServerIdentity`, `console` or `stderr`; no AWS SDK; size under the loader cap; import runs nothing |
| `data:` loading | Fresh process: default export runs once, exit 2 without env, credentials of a refused run never printed, TLS-off refused |

Mutation spot checks (each reverted): removing the replay check, the expiry check, the Organisation
field on login, sending the refresh cookie to logout, or adding `rejectUnauthorized: false` each
makes at least one test fail.

CI: the PR's "Format, validate, mocked plan tests" job now runs these tests on Node 22. Result: see
the PR checks.

## 6. Risks and open items

| # | Risk | Effect | Mitigation or owner action |
| --- | --- | --- | --- |
| R-1 | Never run against the real ALB and Identity | A mismatch with production behaviour shows only in the session | The mock follows Identity 5277d71 source line by line (cookies, routes, refusals); a FAIL line stops the session per the plan's hard stops |
| R-2 | Identity's Origin check, rate limiter and lockout are mocked, not exercised | A 403 or 429 on login would show as `FAIL login status-403` or `status-429-rate-limited` | Two logins and one wrong password per run; the codes are fixed and safe |
| R-3 | The Amazon-issued ALB certificate must chain to Node 22's bundled roots | If not, every check fails `tls-untrusted` and nothing is sent | Expected to chain to Amazon Root CA 1, which Node bundles; never worked around by disabling checks |
| R-4 | The pin changes with any edit | A stale SHA256 makes the loader stop with `checksum` | Take commit and SHA256 from the merged `main` commit; Workstream 4's runbook gives the procedure |
| R-5 | `aws-terraform.yml` is also likely edited by Workstream 2 | A merge conflict in one workflow file | Resolve at merge time; the step is self-contained |
| R-6 | The operator email is still pending | The probe cannot run until the bootstrap secret exists | Owner input; outside this workstream |
| R-7 | One session row is created in Identity and then revoked; one failed-login audit event | Expected side effects in a non-production database | Recorded here so the reviewer is not surprised |

## 7. Evidence

- Branch `claude/project-thread-2omefu`, PR to `main` (link in the PR list; not merged).
- Probe SHA256 at the PR head commit: recorded in the PR description after the final push.
- No AWS, GitHub environment, DNS or Cloudflare action was taken.

Not merged. Merge needs the owner's word after ChatGPT's review, in the order Workstream 4 proposes.
