# 07 - School operator console removal, school:provision, teacher app sign-in (round 3)

Date: 26 Nov 2026 (requested 21:10 UTC). This was a review only; nothing was pushed to, merged or deployed from the reviewed PRs.

## Verdict

**No Critical, High or Medium findings.**

| PR | Head reviewed | Critical/High/Medium | Low | Info |
|---|---|---|---|---|
| munaxa-school#34 (console removed, `school:provision`, teacher app "Sign in with Munaxa") | `61e98d6` | 0 | 1 | 4 |
| munaxa-docs#193 re-check | `dc0ba84` / `afa9904` | 0 | 0 (round-2 L-1, L-2 fixed) | 0 |

## munaxa-school#34

### Operator console removal

What was removed:
- The platform console controllers and pages.
- Billing, tenant provisioning and the public billing webhooks.
- The admin middleware and the `admin.munaxa.com` host.
- The platform-owner password seed.

Control now owns customers, plans and licences. This is a net reduction in attack surface. No route references the deleted modules, and platform roles are still covered by the MFA and emergency checks.

### `school:provision`

- **Input:** read from the environment only and validated (slug, name, email). The seed workflow passes it through `env`, so there is no shell injection.
- **Safety:** a dry run unless `APPLY=yes`, done in one transaction, idempotent, and it never changes an existing user.
- **First administrator:**
  - created with no password (`passwordHash: null`);
  - signs in only through Identity, linked by the address Identity checked (identity#34);
  - needs `acr=mfa` at the link and at every sign-in after it.

### Teacher app hand-off (RFC 8252)

**Server side**
- **Start:** the challenge must be S256 (43 base64url characters) and travels in the binding cookie. The return address is the configured `IDENTITY_APP_REDIRECT_URI`, never one from the request. In production that address must be https, with no query or fragment; a custom scheme is allowed outside production only.
- **Seal:** AES-256-GCM with a random IV, an AAD and a 16-byte tag. The key is derived with HKDF from `JWT_REFRESH_SECRET` under its own info string. The hand-off expires after 2 minutes and its size is capped.
- **Redeem:** a constant-time verifier check, then `refresh()`, which rotates the token and detects reuse. A second redemption therefore revokes the session. The endpoint is throttled.

**Mobile app**
- The verifier comes from `Random.secure`.
- The sign-in runs in the system browser via `flutter_web_auth_2` (ASWebAuthenticationSession or Custom Tabs), not in a web view.
- The app checks the scheme, host and path of the address it is sent back to.

**L-1 (Low): the hand-off is returned in the query string of an https return address.** PKCE stops interception, but not an injected request:
1. An attacker starts a sign-in with their own verifier and gets a victim to open the start link.
2. Identity signs the victim in silently.
3. On the victim's device the https link is not claimed by the app, so the browser loads it with `?handoff=`.
4. The hand-off lands in server logs, analytics or browser history.
5. Anyone who reads it within 2 minutes and holds the verifier can redeem the victim's session.

Fix: return the hand-off in the fragment, and serve the fallback page with no logging and `Referrer-Policy: no-referrer`. A nonce binding chosen by the app is optional. This should be done before the app ships with an https return address.

Informational:
- **I-1:** An unredeemed hand-off leaves its refresh session alive until the refresh TTL.
- **I-2:** The production app build must set `MUNAXA_SIGN_IN_RETURN` to the verified https link (the default is a custom scheme, which production School refuses). The iOS https callback needs iOS 17.4 or later.
- **I-3:** `school:provision` writes no School audit row.
- **I-4:** The platform owner is no longer seeded. Confirm that nothing still expects a platform-role user to exist.

## munaxa-docs#193 re-check

- **Round-2 L-1 is fixed:** the race winner is now checked with `needsSecondFactor` before the link, with an integration test.
- **Round-2 L-2 is fixed:** emergency mode requires `TENANT_ADMIN` and a confirmed Docs authenticator that answered this sign-in, with a unit test and updated docs.
- `afa9904` is a lint-only test change.

## Open follow-ups

- school#34 L-1 (hand-off in the fragment) before an https app release.
- school#33 L-1 from file 06 (emergency runbook and alert).
- The rollout steps from file 06.
