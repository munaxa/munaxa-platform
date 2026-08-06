# Configuring a product on `@munaxa/config`

How a product with existing deployments adopts the platform schema — without renaming a variable in
every environment, flattening every consumer, or moving its cross-field rules out of the schema.

---

## The boundary

`@munaxa/config` owns *platform* settings: session timeouts, password policy, CSP, lockout,
plus tenant overrides, secrets and feature flags. It is not a general-purpose application-config
framework, and treating it as one is the mistake to avoid.

The end state is a split, not a replacement. The platform owns its ~25 settings; the product keeps
its own — storage, OCR, retention, search — in the same schema, validated in the same pass, failing
once at startup with every problem listed.

---

## Extension schemas

```ts
import { extendConfig, parseConfig, string, boolean, PLATFORM_SCHEMA } from '@munaxa/config';

export const APP_SCHEMA = extendConfig(PLATFORM_SCHEMA, {
  DOCS_STORAGE_BUCKET: string(),
  DOCS_OCR_ENABLED: boolean({ default: false }),
});

export const config = parseConfig(APP_SCHEMA, process.env);
```

Platform and product problems are reported together, so a deployment missing four variables learns
all four in one restart.

**Redefining a platform field is refused.** A product overriding the platform's definition of a
session timeout or a password policy is how a security setting quietly stops meaning what the
platform documents it to mean. To change *where* a field is read from, use `remapSchema`; to hold a
different value, use a different key.

---

## Environment aliases

An existing deployment has `LOG_LEVEL`, not `MUNAXA_LOG_LEVEL`. Renaming it means changing Helm
values, App Service settings, `.env` files and CI secrets simultaneously — which no product will do,
so without aliases every product simply declines to adopt the schema.

Per field:

```ts
oneOf(['debug', 'info', 'warn'], { default: 'info', env: 'LOG_LEVEL' })
string({ env: ['DATABASE_URL', 'POSTGRES_URL'] })
```

Or over a schema you do not own — the usual case, since `PLATFORM_SCHEMA` is the platform's:

```ts
const SCHEMA = remapSchema(PLATFORM_SCHEMA, {
  MUNAXA_ENV: { env: 'NODE_ENV' },
  MUNAXA_LOG_LEVEL: { env: 'LOG_LEVEL' },
});
```

`remapSchema` changes only where a field is read from and where it lands — types, defaults and
secret flags stay the platform's. Prefer it to forking the schema, or fields the platform adds later
will never reach you. A name that does not exist is refused rather than ignored: a typo would
otherwise leave the field under its original name, failing on a variable the operator believes they
set.

### When the legacy value is encoded differently

An alias maps a *name*, and a name is not always the whole difference. A deployment holding
`JWT_ACCESS_TTL_SECONDS=900` cannot feed a field that parses durations — `900` is not `15m`, and the
field rejects it. Without a way to say "this source counts in seconds", the product is back to
renaming a variable everywhere, which is what aliases exist to avoid.

```ts
const SCHEMA = remapSchema(PLATFORM_SCHEMA, {
  MUNAXA_ACCESS_TOKEN_TTL: { env: fromSeconds('JWT_ACCESS_TTL_SECONDS') },
  MUNAXA_REFRESH_TOKEN_TTL: { env: fromSeconds('JWT_REFRESH_TTL_SECONDS') },
});
```

`fromSeconds` and `fromMilliseconds` cover the common case; for anything else, write the alias
longhand with your own `decode`:

```ts
{ name: 'LEGACY_ORIGINS', decode: (raw) => raw.split(';').join(',') }
```

Three properties are deliberate:

- **String to string, before the field parses.** The platform's own validation still runs on the
  result, so a product can restate how its legacy value is encoded but cannot widen what the field
  accepts. A transform returning a parsed value would be a hole straight through the schema.
- **The transform belongs to the source, not the field.** The canonical name keeps platform
  semantics untouched, so a deployment already writing `MUNAXA_ACCESS_TOKEN_TTL=15m` is unaffected
  while each legacy name declares its own encoding.
- **A failing decode is a config issue, not a crash.** It joins the other problems in one message,
  named against the variable the operator actually set.

Semantics worth knowing:

- The canonical name wins when both are set, so a rename actually completes.
- An empty value is "not set" and falls through to the next alias — a Helm value that renders to
  `DATABASE_URL=` should not fail as an empty required string.
- Errors name which variable held the bad value; the value itself never appears, because half of
  these are secrets.

---

## Nested output

The platform's resolved record is flat. An application that reads `config.app.name` and
`config.acl.cacheTtlSeconds` should not have to be rewritten.

```ts
const SCHEMA = {
  APP_NAME: string({ path: 'app.name' }),
  APP_PORT: integer({ default: 3000, path: 'app.port' }),
  ACL_TTL: integer({ default: 60, path: 'acl.cacheTtlSeconds' }),
};

const config = nestConfig(SCHEMA, parseConfig(SCHEMA, process.env));
// { app: { name: …, port: 3000 }, acl: { cacheTtlSeconds: 60 } }
```

`nestConfig` is additive — the flat record is unchanged, and both are available. Prototype-polluting
segments (`__proto__`, `constructor`, `prototype`) and conflicting paths (`a.b` alongside `a.b.c`)
are refused rather than silently producing a config object missing a value.

---

## Cross-field rules

`FieldDefinition` parses one variable and cannot express "required only under this deployment
profile" or "these two sources are mutually exclusive". Putting those rules elsewhere means they
stop being part of the schema: they run later, on another code path, and the startup failure they
were meant to cause becomes a runtime failure.

```ts
export const APP_SCHEMA = defineConfig(
  {
    PROFILE: oneOf(['local', 'hosted'], { default: 'local' }),
    TENANT_CATALOGUE_URL: string({ default: '' }),
    TENANT_CATALOGUE_FILE: string({ default: '' }),
  },
  {
    refine: [
      (c) =>
        c.PROFILE === 'hosted' && c.TENANT_CATALOGUE_URL === ''
          ? { key: 'TENANT_CATALOGUE_URL', problem: 'required when PROFILE is hosted' }
          : undefined,
      (c) =>
        c.TENANT_CATALOGUE_URL !== '' && c.TENANT_CATALOGUE_FILE !== ''
          ? { key: 'TENANT_CATALOGUE_FILE', problem: 'mutually exclusive with the URL source' }
          : undefined,
    ],
  },
);
```

Return nothing when the rule holds; return an issue or several when it does not. Issues join the
field issues in one message.

**Refinements do not run when a field failed to parse.** A rule reading a value that never parsed
reports a second, misleading problem for the same cause, and the operator chases the wrong one.

Refinements survive `extendConfig`: extending a schema is not a way to drop its rules.

---

## Migrating an existing product

1. **Alias first, rename never.** `remapSchema(PLATFORM_SCHEMA, …)` so today's deployments keep
   working unchanged. A rename, if wanted at all, is a separate change with its own rollout.
2. **Extend, don't fork.** `extendConfig` keeps you receiving platform fields added later.
3. **Move refinements in, not out.** Whatever cross-field rules the product's old schema had belong
   in `refine`, where they still fail at startup.
4. **Add paths last.** `nestConfig` lets the existing consumers keep their shape, so no call site
   changes in the same commit as the schema swap.

Nothing above requires a deployment change, which is the point: a configuration migration that
demands a simultaneous environment rename is not a migration anyone can ship.

---

## Compatibility

`parseConfig` and `redactConfig` still accept a bare field map. Everything here is additive; a
2.0.0 schema behaves exactly as it did.
