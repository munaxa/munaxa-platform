# Control session (Y-6), Docs credential pin (Y-7) and Docs session (Y-8): 24 Nov 2026

Runbook: `2026-11-22-testing-temporary-openssl-acceptance/05-DOCS-TESTING-RUNBOOK.md`, steps 13 to 25.
Labels: **[V]** verified, **[E]** estimated, **[O]** owner action, **[U]** unverified.

## Verdict

- **Y-6 Control session: DONE [V].** Control is migrated and its grants are applied. Operator
  sign-in to the portal works with MFA (the owner enrolled TOTP at 10:54 UTC). The Docs
  deployment `docs-nonprod` exists in Control.
- **Y-7 credential pin: DONE twice, but the stored credential is still wrong [V].** Both credentials
  the owner stored had a 42-character secret. Control mints 43 characters (base64url of 32 bytes).
  The portal shows the token in a narrow, scrolling read-only box, and a mouse selection dropped the
  last character both times.
- **Y-8 Docs session: PARTIAL [V].** docs-db-admin, docs-migrate and docs-provision all exited 0.
  The tenant `munaxa-internal` (`d75d9645-d2da-48c3-af91-ab6f36e789a8`) is provisioned, and the
  one-run provision secret is deleted. All 5 services passed their load-balancer health checks, and
  the owner signed in to Docs. Licensed pages fail: every Docs to Control entitlements call got 401,
  so Docs reports SUBSCRIPTION_REQUIRED / "service unavailable".
- **Owner decision 13:52 UTC: stop for today.** Everything is shut down and verified (section 6).
  The next session starts with a third credential reissue (section 7).

## 1. What ran (UTC)

| Time | Step | Evidence |
| --- | --- | --- |
| 06:37 | Owner card: root connector for the session; hard stop by 14:00 | thread |
| morning | H-20 armed (P 10:15, S 10:45); `up` | run 45347723581 |
| morning | db-admin rev 3 exit 0; control-migrate rev 2: 3 migrations applied, then the grants step crashed (pnpm missing in the image) | tasks ba3538b3, b8a5cd0e |
| morning | Grants applied with a one-off override on the same image (owner card "Yes, run it and continue"), exit 0 | task b8a5cd0e |
| morning | Operator sign-in failed with `security_csrf_invalid`: Identity's `Referrer-Policy: no-referrer` makes browsers send `Origin: null` on form posts. Fixed in identity#28 (`6dbf35d`, same-origin, 343 integration tests) | identity#28 |
| 09:05 | `down`, verified, P and S disarmed | run 45361230023 |
| ~09:40 | Owner published Identity 6dbf35d; pin platform#176 (`ef96abb`, 4 task-definition replacements); owner apply | runs 45359411701, 45365849071 |
| 10:0x | `up` again with H-20 P 13:10 / S 13:40; IP rule from the new environment secret (platform#174) | run 45371430846 |
| 10:54 | Owner: MFA done | thread |
| 10:58 | Owner created deployment `docs-nonprod` and issued credential 1; stored as docs-api `0250d083…` | Control DB, thread |
| 11:09 | `down`, verified, P and S disarmed | run 45380720995 |
| 11:33 | Pin platform#180 (`b9720d9`: docs-api `0250d083…` + Y-8 counts); owner apply, 2 replacements match the declaration exactly | run 45385418554 |
| 11:41 | Y-8 H-20 armed (P 16:00, S 16:30); `up` | run 45385922424 |
| 11:39-11:50 | **GitHub's 01:47 scheduled `down` fired ~10 h late** and took that session down | run 45386229719 |
| 12:01 | `up` again | run 45387994259 |
| 12:05-12:28 | docs-db-admin exit 0, docs-migrate exit 0, docs-provision exit 0 (owner provision-create, then provision-delete; `status` shows provision absent) | tasks 899c3339, 1e532edb, b37affd4 |
| 12:36 | Owner signed in to Docs; "service unavailable"; Control log shows 401 on every entitlements call | control-api log |
| 12:53 | platform#181 (`90e152a`, Control portal on); `up` applies it | run 45397815122 |
| 12:56 | Owner revoked credential 1 and issued credential 2; stored as docs-api `b313124e…` | Control DB |
| 13:05 | `down`, verified; pin platform#182 (`cf18aa9`); owner apply, 2 replacements match exactly | runs 45399130329, 45402382207 |
| 13:35 | `up`; still 401 | run 45403395187 |
| 13:50 | Diagnosis (section 3) | tasks 04c926c5, 0625b64f |
| 13:52 | Owner card: stop for today; `down` | section 6 |

## 2. Repository changes (all merged under the standing rule; nothing auto-deploys)

| PR | Merge | What |
| --- | --- | --- |
| platform#173 | `93cca08` | Y-6 session counts |
| control#16 | `bf2e4b3` | `apply-grants.mjs` runs the local Prisma binary and prints only an error code (the crash printed the owner database URL into CloudWatch). Not yet in a published image. |
| identity#28 | `6dbf35d` | Same-origin referrer policy on the Identity edge and pages, plus a test that a browser form keeps its Origin |
| platform#174 | `9a40f06` | `OPERATOR_CIDRS` read from an environment secret, only on `up`, never printed |
| platform#176 | `ef96abb` | Identity re-pin to 6dbf35d under D-SSL-2026-11 |
| platform#180 | `b9720d9` | docs-api credential pin 1 and Y-8 counts |
| platform#181 | `90e152a` | Control portal on for the credential reissue |
| platform#182 | `cf18aa9` | docs-api credential pin 2 |

## 3. Root cause of the 401 [V]

Diagnosis used fingerprints only. No secret value entered this session or any log.

1. A one-off docs-api rev 3 task (`node -e` override) logged the token's shape: length 83, prefix
   `mxc_`, separator at 36, credential id `d32e02b4-05eb-4a1e-80dd-b2964ec85748`, **secret length
   42**, sha256 prefix `c968e80f363d`, no whitespace.
2. A one-off db-admin task logged Control's `service_credential` rows (id, sha256 prefix, revoked):
   `603a2164…` revoked; `d32e02b4…` active, hash prefix `cadc71ff20eb`, `last_used_at` null.
3. The ids match but the hashes differ, and Control's `mintServiceSecret` makes 43 characters. So
   the stored secret is missing its last character. The script's format check (`{32,128}`) accepts
   42, so it could not catch this.

Not the cause, also checked: Docs sends `Authorization: Bearer <token>` through the allow-listed
adapter; Control's guard and minting code are the same at the deployed commit `744765d` and on
main; the ALB forwards `/api/v1/products/*` on `control-api.test`; docs-api ran rev 3 with
`b313124e…`.

## 4. Findings

| # | Finding | Severity | Recommendation [R] |
| --- | --- | --- | --- |
| F-1 | Credential copy drops the last character (narrow scrolling read-only field) | High for operations | Owner copies by clicking the field (it selects all) and pressing Ctrl+C. Repo: a copy button in `action-form.tsx`, and `docs-testing-secrets.sh` should require exactly 43 secret characters |
| F-2 | GitHub scheduled `down` runs up to 10 h late (04:19, 09:51, 11:39 UTC observed), so it can end a daytime session | Medium | Scheduled `down` should skip while an armed P/S for a future hard stop exists |
| F-3 | A pin merged while a session is up makes `down` refuse (the session plan check refuses non-session changes) | Process | Shut down first, then merge the pin (done today) |
| F-4 | `docs.test.munaxa.com/api/health/live` is 404 by design: docs.test routes to docs-web, and only the target-group health checks reach the API | Runbook | Runbook step 22 should use the target-group health or `/login` |
| F-5 | docs-web logs `failed to get redirect response … ERR_SSL_WRONG_VERSION_NUMBER` after a sign-in server action (Next fetches its own redirect over https behind the TLS-terminating ALB). The browser still navigates | Low | Docs follow-up |
| F-6 | The control-migrate grants crash printed the owner URL into CloudWatch; the log stream was deleted (owner card) | High, contained | Rotate `control_owner` before Production (owner yes/no); publish a Control migrate image with control#16 |
| F-7 | The E-1 guard manifest is stale for db-admin and has no control-migrate entry, so the guard could not be used | Medium | Refresh `nonprod.stage-e-tasks.json` |
| F-8 | The Stage E probe set Origin by hand, so it missed the browser sign-in bug fixed in identity#28 | Process | Probes should not set Origin |
| F-9 | Each session creates a new ALB name, so the owner updates 4 CNAMEs every session | Operations | Known (DNS-H1) |

## 5. Owner actions today [O]

Approvals: Y-6 card, grants card, "Yes for all" (Identity image, pin, apply, rerun), log deletions
(2 GitHub run logs, 1 CloudWatch stream), Y-8 card, "Fix it today" card, "Stop for today" card.
Clicks and pastes: OPERATOR_CIDRS secret, DNS (5 times), MFA enrolment, credential issue x2,
replace-key x2, provision-create/-delete, 4 applies.

## 6. Shutdown verification

All clean at 13:57 UTC: see [01-SHUTDOWN-VERIFICATION.md](01-SHUTDOWN-VERIFICATION.md).

## 7. Next session (before 1 Dec 2026, the D-SSL expiry)

1. Claude: `up` with control-portal 1 (counts on main already include the Docs services and the
   portal), after a fresh H-20 arm. Owner: update the 4 CNAMEs.
2. Owner, in the portal: revoke `d32e02b4…`, issue a new credential, **click the field and press
   Ctrl+C**, then `replace-key CONTROL_PLANE_TOKEN`. Send only the version id.
3. Claude: `down`, pin PR (2 replacements); owner apply; `up`; owner DNS.
4. Checks: Control log shows 200 on entitlements; owner signs in, opens a page, uploads a file;
   Claude confirms the object in the Docs bucket. Then `down`, verify, disarm.

The database, migrations, Docs tenant and Control deployment persist, so none of those steps repeat.
