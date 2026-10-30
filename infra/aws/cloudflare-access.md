# Cloudflare Access for the Testing operator host

**Status: design. Nothing here has been configured in Cloudflare or AWS.** Every step below is an
owner action, behind the gates in [README.md](README.md). Production hostnames are not covered.

The operator host serves the Control portal and, under `/api/auth/*`, the Identity sign-in the
portal uses. It is the only host meant for Munaxa staff alone. The owner chose Cloudflare Access
(29 Oct 2026) to put a staff sign-in in front of it, in place of a fixed office IP range.

## Hostnames

| Host                          | Serves                                       | Cloudflare record                   |
| ----------------------------- | -------------------------------------------- | ----------------------------------- |
| `operator-test.munaxa.com`    | Control portal, Identity `/api/auth/*`       | CNAME to the ALB, **proxied**       |
| `id.test.munaxa.com`          | Identity                                     | CNAME to the ALB, DNS only          |
| `control-api.test.munaxa.com` | Control API (products), admin API refused    | CNAME to the ALB, DNS only          |
| `work.test.munaxa.com`        | Work                                         | CNAME to the ALB, DNS only          |
| `school.test.munaxa.com`      | School                                       | CNAME to the ALB, DNS only          |

Access works only on a proxied record, so the operator host is the one proxied name. The public
hosts stay DNS only: products and browsers reach them directly, and they are not behind Access.

The operator host is `operator-test.munaxa.com`, not `operator.test.munaxa.com`. Cloudflare's
free Universal SSL certificate covers `munaxa.com` and one level below it, so a proxied
second-level name would need Advanced Certificate Manager (a paid add-on, about US$10 a month) to
serve a certificate at the edge. The ALB's ACM certificate lists `operator-test.munaxa.com` beside
`*.test.munaxa.com`, so Cloudflare can connect to the origin with Full (strict) TLS.

## The Access application (owner, Cloudflare Zero Trust)

- Type: self-hosted. Domain: `operator-test.munaxa.com`, path empty, so the portal and
  `/api/auth/*` are both behind it.
- Policy: one **Allow** policy whose include rule lists the authorised staff email addresses one by
  one. No email-domain rule, no "Everyone", no Bypass or Service Auth policy.
- MFA (owner decision for Testing, TD-3): the same policy has a **Require** rule "Authentication
  method: MFA", so Access, not Identity, is the second factor for operators while Identity's
  `mfaSatisfied` is always false. One-time PIN alone is a single factor and does not satisfy it.
- Login method: an identity provider that enforces MFA and reports it to Access (or Cloudflare's
  own MFA for Access, where the account offers it). Before recording the AUD tag, sign in once
  and confirm in the Access logs that the MFA rule matched; if the provider does not report MFA,
  every login is refused, which is the safe failure.
- Session duration: 8 hours or less.
- CORS: not needed. The portal calls its API on the same host.
- Edge TLS for the hostname: Full (strict), set with a configuration rule for
  `operator-test.munaxa.com` so the zone's other records are untouched.

Record the application's AUD tag and the team domain (`https://<team>.cloudflareaccess.com`). They
are public identifiers, not secrets, and the origin check below needs them.

## Going round Access

Access protects requests that come through Cloudflare. The ALB is internet-facing, so a request
can also go straight to it with `Host: operator-test.munaxa.com`. Three things stop that from
reaching the portal, in this order:

1. **Without Access settings, the host is closed.** With `operator_access` unset and
   `operator_cidrs = []`, the stack creates no route for the operator host, and the ALB answers
   403 to every request on it (rule 39), from Cloudflare or anywhere else.
2. **Source ranges do not solve it.** An ALB rule takes five condition values, so `operator_cidrs`
   holds at most three ranges (Terraform refuses more). Cloudflare publishes about twenty ranges,
   and they are shared by every Cloudflare customer, so allowing them would not prove the request
   passed this Access application.
3. **The origin checks the Access token (munaxa-control#5).** Access adds a signed JWT to every
   request it lets through, in `Cf-Access-Jwt-Assertion`. The Control portal's middleware and every
   operator route of the Control API verify it: RS256 from the team domain's
   `/cdn-cgi/access/certs`, the team domain as issuer, the AUD tag as audience, expiry, and a person
   (email and subject). Anything else gets 401, and keys that cannot be read give 503. In
   production both refuse to run without the settings.

The stack takes the team domain and AUD tag as `operator_access` (public identifiers, in the
environment's tfvars). Set, it passes them to the Control API, the sweep (same task definition)
and the portal as `OPERATOR_ACCESS_TEAM_DOMAIN` and `OPERATOR_ACCESS_AUDIENCE`, and opens rules 30
and 31 to any source, because the token check now stands at the origin. Terraform refuses a
Control image without `operator_access`. The portal's load balancer health check is `/healthz`,
the one path that answers without a token.

Identity's `/api/auth/*` on the operator host needs no extra check: the same endpoints are public on
`id.test.munaxa.com`, so a request that goes round Access there gains nothing.

The operator API itself is not on the operator host. The portal calls Control's admin API over the
private Cloud Map name, and `/api/v1/admin/*` on `control-api.*` answers 403 (rule 10).

## What Access does not replace

Access decides who may load the operator host. It does not replace the sign-in behind it:

- The operator still signs in to Identity, and Control checks the Identity token's issuer,
  audience (`munaxa-control`) and organisation.
- `mfaSatisfied` is always false today (Identity ADR-0003), so Control runs with
  `OPERATOR_REQUIRE_MFA=false`. Access does not change that claim. The compensating controls are
  the Access sign-in in front of the host, the mandatory `OPERATOR_SUBJECT_ALLOWLIST` (Control
  refuses to start in production without it while MFA is off), and the audit log.
- Turn on `OPERATOR_REQUIRE_MFA` the day Identity issues an MFA claim.

## Owner decisions still open

1. Accept `operator-test.munaxa.com`, or keep `operator.test.munaxa.com` and buy Advanced
   Certificate Manager.
2. The list of staff addresses in the Access policy, and the login method.
3. Create the Access application, then set `operator_access` in `envs/nonprod.tfvars` in a
   reviewed PR. Applying it is a separate owner approval.
