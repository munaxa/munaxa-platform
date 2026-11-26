# Independent security review: Docs web "Sign in with Munaxa" (munaxa-docs#192)

Date: 26 Nov 2026. Review only. PR https://github.com/munaxa/munaxa-docs/pull/192, head `ff45784007727694d0bd2468b8dfe16d7c43165c`. Posted as a GitHub review (COMMENT).

## Verdict

**No Critical, High or Medium findings.** 2 Low, 2 informational.

| Id | Severity | Finding | Recommendation |
|---|---|---|---|
| L-1 | Low | Binding cookie `edms_federation` is not `__Host-`-prefixed (path-scoped), so a sibling `*.munaxa.com` host could plant one and restore login CSRF. | `__Host-` name with `path=/`, or keep the binding server-side with the flow. |
| L-2 | Low | Callback redirects use `request.nextUrl.origin` (Host / X-Forwarded-Host derived). | Build from configured `WEB_BASE_URL`. |
| I-1 | Info | `?error=` path does not clear the binding cookie (expires in 10 min). | Clear it. |
| I-2 | Info | `authorizationUrl` from the API is followed without an origin allow-list. | Optional allow-list. |

## Checked and correct

- Login CSRF: the callback requires `sha256(state)` to equal the HttpOnly Lax cookie's digest; the cookie is spent on completion.
- Open redirect: `next` passes `safeDestination` (WHATWG parse twice, on-origin, no `//`) on the page, in the action and at the callback; it is stored in the server-set cookie; failures go to a fixed page.
- Cookie scope: `path=/auth/federation`, 10 min, HttpOnly, Lax, Secure in production; session cookies unchanged; middleware adds only the `/auth/federation/` prefix.
- Error handling: one generic message; no reason in the URL; no cookie is set when the API refuses to start.
