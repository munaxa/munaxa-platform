# Independent security review: Terraform wiring for company sign-in and Identity as OIDC provider (munaxa-platform#202)

Date: 26 Nov 2026. Review only. PR https://github.com/munaxa/munaxa-platform/pull/202, head `1ae40bc68c1925082e0d272c3b54b54af1757566`. Posted as a GitHub review (COMMENT). Nothing planned or applied.

## Verdict

**No Critical, High, Medium or Low findings.** 3 informational. Both new variables default to off (`identity_sso_config = null`, `identity_oidc_clients = []`), so the environment and the identity bundle contract are unchanged until a reviewed PR sets them and the owner approves a plan and apply.

## Checked and correct

- Secrets: `IDENTITY_SSO_MICROSOFT_CLIENT_SECRET`, `IDENTITY_SSO_GOOGLE_CLIENT_SECRET` and `IDENTITY_OIDC_CLIENT_SECRETS` are bundle keys referenced through ECS `secrets`, each added only when configured; nothing secret is in tfvars or plain environment.
- Environment format: `id|organisation|uri uri;...` matches Identity's parser. Validations exclude `|`, `;`, spaces, queries and fragments in redirect URIs, require https, shape-check client id and organisation key, and refuse duplicates. Entra/Google client-id shapes are validated, and both features require `identity_security_config`.
- Docs outbound allow-list gains exactly `hosts.identity`, only when OIDC clients exist.
- Terraform tests cover defaults, conditional keys and validation failures.

## Informational

| Id | Finding | Recommendation |
|---|---|---|
| I-1 | No plan-time check that an OIDC client id differs from the Identity access-token audience (Identity refuses it at boot). | Add a validation. |
| I-2 | The same client secret must also be stored in the Docs organisation's identity-provider record; its custody there is outside this PR. | One runbook line on storage and access. |
| I-3 | nonprod.tfvars example still has the `<hosts.docs>` placeholder; the https regex would reject it as is (a safe failure). | Fill in when enabling. |
