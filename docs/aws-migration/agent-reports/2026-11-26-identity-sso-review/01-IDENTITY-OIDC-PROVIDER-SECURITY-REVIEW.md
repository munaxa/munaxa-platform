# Independent security review: Identity as OpenID Connect provider (munaxa-identity#33)

Date: 26 Nov 2026. Review only: nothing pushed to the PR branch, nothing merged, nothing deployed.
PR: https://github.com/munaxa/munaxa-identity/pull/33, head `4eeeedc06f37c4d1e40db9f2c101c1e9c1b9bbf1` (ADR-0008, for Docs and School). Posted as a GitHub review (COMMENT) with three inline findings.

## Verdict

**No Critical and no High findings.** 3 Low, 3 informational. The feature is off by default (`IDENTITY_OIDC_PROVIDER`).

## Findings

| Id | Severity | Where | Finding | Recommendation |
|---|---|---|---|---|
| L-1 | Low | `oidc-provider.service.ts` 282-290 | A malformed `client_secret_basic` header makes `decodeURIComponent` throw, so the endpoint returns 500 instead of `invalid_client`. `+` is not decoded as a space (RFC 6749 §2.3.1). | try/catch, return 401 `invalid_client`, decode `+`. |
| L-2 | Low | same file 356-357 | `email_verified: true` is asserted for any account identifier, which is operator-entered and not verified. | Assert it only for verified/federated addresses, or have ADR-0008 require clients to key on `sub` + `tid`, and confirm Docs and School do. |
| L-3 | Low | same file 201-208 | PKCE is optional (downgrade correctly refused). | Require S256 for all (first-party) clients, per RFC 9700. |
| I-1 | Info | edge limits | Token endpoint per-IP budget is shared by all Docs instances behind one egress IP. | Per-client limit. |
| I-2 | Info | token design | Id and access tokens share issuer, key and `typ`; separation relies on `aud` checks (enforced in Identity and Work). | Confirm Control and School verifiers set an audience; consider `typ: at+jwt`. |
| I-3 | Info | authorize | `prompt=login` and `max_age` are ignored; `auth_time` is provided. | Note it in ADR-0008. |

## Requested focus areas: checked and correct

- Open redirect: client and exact redirect URI are checked before any redirect; unknown values get an error page; https is required in production; the login hop goes through `safeReturnTo`; the organisation prefill is validated and escaped.
- Code lifecycle: random, stored as a digest, TTL, single `DEL` before comparisons, bound to client, redirect URI, nonce, PKCE (when sent) and session; account and session are re-checked at redemption.
- Organisation binding: a session from another organisation gets `access_denied` (audited).
- Token confusion: id token `aud` = client id, with no `sid`/`ver`/`perms`; startup refuses overlap with `IDENTITY_AUTH_AUDIENCE` and requires that audience to be set; Platform verifier checks `aud`; Identity also requires `sid`.
- Edge middleware: the canonical route is compared; only the origin step is dropped for `POST /api/auth/oidc/token` (Platform skips it for an empty list); rate limit and body scanning remain; the endpoint reads no cookies.
- Client authentication: basic xor post; digest + `timingSafeEqual`; secrets of 32+ characters, unique and not reused; a wrong secret leaves the code unspent.
