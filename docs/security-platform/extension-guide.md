# Extension guide

How to add something to the platform, and what counts as a breaking change.

## Extension points

Almost everything a product needs is a port implementation, a registered strategy or a callback —
not a change to a platform package.

| I want to… | Do this | Change the platform? |
| --- | --- | --- |
| Use my database | Implement the relevant port | No |
| Use Redis / KV / D1 | Implement `CachePort` | No |
| Add an identity provider | Implement `IdentityProviderPort`, or configure `OidcProvider` | No |
| Add an email or SMS vendor | Implement `NotificationTransportPort` | No |
| Add a risk signal | Implement `RiskSignal`, pass it to `RiskEngine` | No |
| Add an authorization rule | Add a `Policy` to your `PolicyEngine` | No |
| Add a rate-limit rule | Add a `RateLimitRule` to your `RateLimiter` | No |
| Add a notification | Register a `NotificationTemplate` | No |
| Send audit records somewhere new | Implement `AuditSinkPort` or `AuditExporterPort` | No |
| Add a *security event name* | Add to `SECURITY_EVENTS` | Yes — minor |
| Add a port | Add to `@munaxa/interfaces` and `PORTS` | Yes — minor |
| Add a method to an existing port | — | Yes — **major** |

## Adding an identity provider

Most providers are OIDC and need only configuration:

```ts
registry.register(
  new OidcProvider(
    {
      id: 'okta',
      kind: 'oidc',
      issuer: 'https://acme.okta.com',
      authorizationEndpoint: 'https://acme.okta.com/oauth2/v1/authorize',
      tokenEndpoint: 'https://acme.okta.com/oauth2/v1/token',
      clientId: config.OKTA_CLIENT_ID,
      clientSecret: config.OKTA_CLIENT_SECRET,
      groupsClaim: 'groups',
    },
    httpClient,
  ),
);
```

Something genuinely different implements the port directly. Two methods, and four things the
implementation must do:

```ts
export class MyProvider implements IdentityProviderPort {
  readonly id = 'my-provider';
  readonly kind = 'custom' as const;

  async beginAuthorization(request: AuthorizationRequest): Promise<AuthorizationRedirect> {
    // 1. Generate `state` from a CSPRNG and return it. Never derive it from the request.
    // 2. Use PKCE where the protocol supports it.
  }

  async completeAuthorization(callback: AuthorizationCallback): Promise<ExternalIdentity> {
    // 3. Compare `state` in constant time (`constantTimeEqual`).
    // 4. Verify the assertion's signature, issuer and audience before trusting a single claim.
    //    `OidcProvider` skips signature verification only because the token comes straight from
    //    the token endpoint over TLS. Any other path must verify.
  }
}
```

**Groups are input, not authority.** Map a provider's groups to platform roles in your product;
never hand them to `Principal.permissions` directly. A misconfigured group in an external directory
should not be able to grant `tenant:delete`.

### SAML

The port fits SAML's POST binding, and `SamlProviderPlaceholder` fails loudly rather than pretending.
An implementation must use a vetted XML-signature library — `xml-crypto` or equivalent — and must:

- Verify the signature over the assertion, not merely over the response.
- Reject unsigned assertions, and reject a response whose signature covers a different element than
  the one being read (signature wrapping).
- Enforce `NotBefore`/`NotOnOrAfter`, `Destination`, `InResponseTo` and the audience.
- Consume each assertion id once, to prevent replay.

Ship it in a product first, prove it, then move it into the platform.

## Adding a risk signal

```ts
export const knownVpnSignal: RiskSignal = {
  name: 'known-vpn-exit',
  weight: 20, // bounded contribution to a 0–100 score
  evaluate: async (context) =>
    context.ipAddress && (await vpnRanges.contains(context.ipAddress)) ? 60 : 0,
};

const engine = new RiskEngine({ signals: [...DEFAULT_RISK_SIGNALS, knownVpnSignal] });
```

Signals raise suspicion; they never vouch. A negative return is clamped to zero, and a signal that
throws contributes zero and is recorded as such — a lookup service being down must not fail a login.

## Adding a policy

```ts
const policies = new PolicyEngine([
  ...BASELINE_POLICIES,
  {
    id: 'deny-bulk-export-without-mfa',
    effect: 'deny',
    permissions: ['data:export'],
    condition: (request) => !conditions.mfaSatisfied(request),
  },
]);
```

Prefer a deny to an allow. A deny cannot be undone by a grant added later, which is exactly the
property you want from a rule written in response to an incident.

## Adding a notification template

```ts
templates.register({
  id: 'security.api-key-created',
  channels: ['email'],
  subject: 'An API key was created for your {{productName}} account',
  body: 'A key named "{{keyName}}" was created on {{createdAt}}. If this was not you, revoke it at {{securityUrl}}.',
  required: ['productName', 'keyName', 'createdAt', 'securityUrl'],
});
```

The renderer substitutes names and nothing else — no expressions, no property access. A template
that needs raw HTML uses `{{{name}}}`, which is deliberately conspicuous in review. And the service
refuses any payload containing a credential-shaped field, so a template cannot be made to carry one.

## Adding a security event name

1. Add it to `SECURITY_EVENTS` in `@munaxa/types`, following `<domain>.<subject>.<past-tense-verb>`.
2. Give it a default severity in `DEFAULT_SEVERITY` if `info` is wrong.
3. If it must never be suppressed, add it to `NON_SUPPRESSIBLE_EVENTS` in `@munaxa/audit`.
4. Emit it from the package that owns the action.

Adding a name is a minor version. Renaming or removing one is major: event names live in SIEM rules
and dashboards this repository does not own, and a rename does not break them loudly — it makes them
silently return nothing.

## Adding a port

1. Declare the interface in `@munaxa/interfaces`, importing nothing but `@munaxa/types`.
2. Add a token to `PORTS`.
3. Ship a memory implementation in the consuming package, and let the platform's own tests use it.
4. Make it optional in the consumer if the consumer can work without it.

## What is a breaking change

**Major:**

- Removing or renaming an export, an event name, an error code, a port method or a `PORTS` key.
- Adding a *required* method to a port — every implementer breaks.
- Changing a format at rest: password hash encoding, ciphertext envelope, JWT claim names, cookie
  names, cache key layout, audit canonical form.
- Making a default stricter in a way that rejects existing data (a higher `minLength` blocks the
  next password change for users who are already below it — which may still be right, but it is a
  major).

**Minor:**

- A new export, a new optional port method, a new event name, a new error code.
- A new optional field on a record.
- A stricter default that only affects *new* values.

**Patch:**

- A fix that does not change any of the above.

Every package's `test/compat.test.ts` encodes its own version of this list. If a change makes one of
those tests fail, the failure is the design review: either the change is wrong, or the test needs a
deliberate edit and the change is a major.

## Contributing

- **No third-party runtime dependencies.** Node built-ins only. A capability that needs a library
  belongs behind a port.
- **No product terminology.** No `Course`, `Document`, `Invoice` — anywhere.
- **Comment the decision, not the mechanics.** Explain why the boring alternative was rejected;
  `// increment the counter` above `count++` is noise.
- **Five suites per package.** Unit, integration, security, performance, compat.
- **Security tests assert the attack fails**, not that the happy path works. "Rejects a token signed
  with another key" is a security test; "verifies a valid token" is a unit test.
