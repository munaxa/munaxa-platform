# 08. Work and Control: do they need Platform 2.5.0? (Phase F)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

**Result: no change, no PR.** Nothing was upgraded. School and Docs were not touched.

## What they use **[V]**

| Repository (main) | `@munaxa` lockstep packages | Other `@munaxa` packages |
| --- | --- | --- |
| munaxa-work `eabcc47` | `auth` ^2.4.1, `crypto` ^2.4.1 | `licensing` ^0.2.0, `platform`, `theme`, `ui` (separate front-end packages) |
| munaxa-control `1f58c90` | `auth` ^2.4.1, `crypto` ^2.4.1 | `licensing` ^0.2.0, `platform`, `icons`, `theme`, `ui` |

From `@munaxa/auth` both use **only `TokenService`**, to verify Identity's access tokens
(Work: `identity/authentication-port.ts`, `platform-token-authentication.ts`; Control:
`auth/authentication.guard.ts`). Test fixtures also mint tokens with it. Neither uses the cache,
security, MFA or login code from Platform.

## What 2.5.0 would change for them

| 2.5.0 change | Reaches Work or Control? |
| --- | --- |
| `verifyAccessToken` refuses missing or non-finite `exp`, non-numeric `iat`, reads a string `aud` as one value | **Yes**, it is their verifier. Tightening only |
| `verifyRecoveryCode`, lockout key, `RedisCache.increment`, `RateLimiter` | No: not used |
| `crypto` | No: `dist` byte-identical to 2.4.1 **[L]** (01) |

Does the tightening break anything?
- **No for real tokens.** Identity always mints a numeric `exp` and `iat` and an **array** `aud` **[V]** (01, C1).
  These pass the 2.5.0 checks, as the control case of the new Identity test shows **[L]**.
- **Their own tests:** fixtures mint through `TokenService.issueAccessToken`, which sets both claims **[V]**.
  Unit specs that stub the verifier (for example `iat: 1` without `exp` in Work's `authentication-port.spec.ts`)
  replace `verifyAccessToken` entirely, so the Platform version does not affect them **[V]**.
- **The security gain is small for them.** A token that 2.5.0 refuses would have to be signed with
  Identity's private key. Identity never mints such a token (01, "Exploitability on 2.4.1").

## Recommendation **[R]**

- **No PR now.** There is no defect to fix, and a PR would have to point at an unpublished version,
  as identity#18 does.
- **After 2.5.0 is published**, upgrade both in an ordinary dependency PR with their own CI. Do it
  before 2.4.x leaves support, not as a deployment prerequisite. Expected diff: two specifiers and the
  lockfile.
- **`@munaxa/licensing` stays at 0.2.0** in both (it is not part of the lockstep release).
- **School and Docs** use only `crypto` among the lockstep packages **[V]** (their other `@munaxa`
  dependencies are `licensing` 0.2.0 and front-end packages). `crypto` is byte-identical; nothing to do.
