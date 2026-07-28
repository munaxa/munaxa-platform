# @axa/platform

The shared engineering foundation for every AXA product — Munaxa, Workaxa, Inkaxa and whatever
comes next. Design tokens, product themes, typography, icons, UI components and patterns, plus
the standards and machine-checked contracts that keep them coherent as the ecosystem grows.

It is **product-agnostic by construction**: no school, HR, finance or any other domain
terminology, no business rules, and no product names outside the `themes/` and `assets/` layers,
where naming a product is the entire point.

| Start here                                                          | For                                          |
| ------------------------------------------------------------------- | -------------------------------------------- |
| [`/PLATFORM_ENGINEERING_STANDARDS.md`](../PLATFORM_ENGINEERING_STANDARDS.md) | **The mandatory rulebook.** Read it first. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                              | The checklist for changing the platform       |
| [`architecture/`](./architecture/README.md)                         | Why the platform is shaped this way           |
| [`/docs/README.md`](../docs/README.md)                              | Every document in the repository              |
| §3 below                                                            | Consuming it from a product                   |

> **The platform is frozen.** It changes only when a genuine cross-product need is proven — see
> the rulebook, §3.

---

## 1. Architecture

Six layers. Each may depend only on the ones above it, and the dependency graph never cycles.

```
tokens        the values          spacing · radius · elevation · motion · borders · z-index · breakpoints
typography    the type scale      families · sizes · weights · line-heights
themes        the colour          base/ declares the contract; <product>/ answers it
icons         the iconography     one library, one version, whole ecosystem
ui            the code            lib → hooks → components → patterns → templates
assets        the artwork         per-product logos, favicons, social, illustrations
```

The load-bearing idea is the **theme contract**. `themes/base/base.css` declares *which*
semantic roles exist (`--primary`, `--background`, `--border`, …) and maps them onto Tailwind's
token namespaces. It never says what colour any of them is. A product palette
(`themes/<product>/palette.css`) supplies a complete set of values for that contract.

Because every component styles itself only through the contract (`bg-primary`,
`text-muted-foreground`, `border-border`), **a component written once renders correctly in every
product, in light and dark, with no per-product branch anywhere in component code.**

That property is not maintained by discipline alone — `pnpm validate` fails CI when a palette
misses a role, invents one, or forks a shared scale.

### Folder structure

```
platform/
├── index.ts                  public barrel — what `@axa/platform` exports
├── package.json              entry points (see §3)
├── CONTRIBUTING.md           the mandatory standard
├── architecture/             component-principles · theming · responsive · motion ·
│                             accessibility · naming-conventions · import-rules
├── tokens/
│   ├── index.ts              typed token aggregate
│   ├── spacing/ radius/ elevation/ borders/ motion/
│   ├── transitions/ z-index/ breakpoints/
│   └── css/primitives.css    the same scales as CSS custom properties (--axa-*)
├── typography/index.ts       families, sizes, weights, line-heights
├── themes/
│   ├── index.ts              typed registry of every product theme
│   ├── base/base.css         THE CONTRACT: @theme mapping + dark variant + utilities
│   ├── munaxa/               palette.css · brand.ts · index.css
│   ├── workaxa/              palette.css · brand.ts · index.css
│   └── inkaxa/               palette.css · brand.ts · index.css
├── icons/index.ts            the curated lucide re-export
├── ui/
│   ├── lib/cn.ts             clsx + tailwind-merge
│   ├── hooks/use-theme.ts    light/dark switching
│   ├── components/
│   │   ├── primitives/       Button, Badge
│   │   ├── forms/            Input, Select, Textarea, Checkbox, Radio, Switch, Label,
│   │   │                     Field, EntityPicker
│   │   ├── feedback/         Spinner, EmptyState, ErrorState, Tooltip, Dialog, Drawer, Toast
│   │   ├── navigation/       Tabs, Pagination
│   │   ├── layout/           Card
│   │   └── data-display/     Table, Timeline
│   ├── patterns/             StatCard, Stepper, Progress, TokenReference, motion/
│   └── templates/            reserved — see ui/templates/README.md
├── assets/<product>/         logos · favicon · social · illustrations
└── scripts/                  validate-contract.mjs · validate-tokens.mjs
```

## 2. The rules, in one screen

Each links to the document that explains it.

| Area                                                 | The rule that matters most                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| [Components](./architecture/component-principles.md) | Promote on the **second** real consumer, never in anticipation of one       |
| [Theming](./architecture/theming.md)                 | Roles are named for their **role**, and a palette is a complete answer       |
| [Naming](./architecture/naming-conventions.md)       | Never name a thing after how it looks or what business it serves            |
| [Imports](./architecture/import-rules.md)            | Products import public entry points; the platform imports **nothing** upward |
| [Accessibility](./architecture/accessibility.md)     | WCAG 2.2 AA at merge time — it is part of the component, not a prop          |
| [Responsive](./architecture/responsive.md)           | A component owns its own box and never its place on a page                   |
| [Motion](./architecture/motion.md)                   | The end state is always reachable without animation                          |

### What must never enter this package

| Not allowed                                   | Why                                           |
| --------------------------------------------- | --------------------------------------------- |
| School / HR / finance terminology              | Ties the layer to one product                  |
| Business rules, validation, permissions        | Product logic, not UI                          |
| Data fetching, API clients, routing            | Product infrastructure                         |
| i18n libraries or literal user-facing copy     | Translation is the product's job               |
| Product names outside `themes/` and `assets/`  | Branding is scoped; everything else is shared  |
| A hardcoded hex outside `themes/`              | Breaks theming; ESLint enforces this           |

Munaxa keeps, and must keep, everything domain-shaped: `AppShell`, `Shell`, `PrivacyProvider`,
`StatusBadge`, `ConfirmProvider`, `GlobalSearch`, `Logo`/`Wordmark`/`Monogram`, `NavIcon`,
`I18nProvider`, landing pages and every `components/domain/*`.

## 3. Consuming the platform from a product

**1. Depend on it.**

```json
{ "dependencies": { "@axa/platform": "workspace:*" } }
```

**2. Activate exactly one theme** in `globals.css`:

```css
@import 'tailwindcss';
@import '@axa/platform/css/themes/munaxa'; /* or workaxa / inkaxa */

/* Tailwind v4 must scan the platform's sources to emit the classes its components use. */
@source '../../../../../platform/ui';

/* Only if the product uses the motion patterns. */
@import '@axa/platform/css/motion';

@layer base {
  :root {
    --radius: 0.5rem; /* the product's own radius base */
    /* --font-display / --font-body / --font-mono come from the app's font loader */
  }
}
```

**3. Import from a public entry point.**

```tsx
import { Button, Card, CardContent, Table, useToast, cn } from '@axa/platform';
import { Search } from '@axa/platform/icons';
import { tokens } from '@axa/platform/tokens';
import { themes } from '@axa/platform/themes';
```

| Import                          | Gives you                                   |
| ------------------------------- | ------------------------------------------- |
| `@axa/platform`                 | components, patterns, hooks, `cn`, `themes` |
| `@axa/platform/tokens`          | typed structural tokens                      |
| `@axa/platform/typography`      | the type scale                               |
| `@axa/platform/themes`          | the typed theme registry + brand hexes       |
| `@axa/platform/icons`           | the shared icon set                          |
| `@axa/platform/hooks`           | UI hooks                                     |
| `@axa/platform/patterns`        | patterns only                                |
| `@axa/platform/css/themes/<id>` | a theme (contract + palette)                 |
| `@axa/platform/css/tokens`      | the structural scales as CSS variables       |
| `@axa/platform/css/motion`      | styles for the motion patterns               |

Never deep-import a file path. See [import-rules.md](./architecture/import-rules.md).

**4. Verify your theme.** Render `<TokenReference />` on an internal page — it reads the live
custom properties off the document, so every swatch is the value your app is actually serving.

## 4. Adding a product theme

```
themes/newproduct/
├── palette.css   copy an existing palette, replace every value
├── brand.ts      brand hexes, gradient stops, static neutral scale
└── index.css     @import '../base/base.css';  @import './palette.css';
```

Then one entry in `themes/index.ts` and one line in `package.json` `exports`. **No component
changes** — that is the test of whether the layering is intact. `pnpm validate` will tell you
immediately if the palette is incomplete.

## 5. Validation

```bash
pnpm validate                          # both validators, via turbo
pnpm --filter @axa/platform validate:contract
pnpm --filter @axa/platform validate:tokens
```

`validate-contract.mjs` derives the required role set from the `@theme inline` block of
`themes/base/base.css` — the contract is never written down twice — and fails when a palette
misses a role, invents one, redefines a structural scale, declares a role twice, skips a colour
scheme, redeclares the contract in its entry point, or exists on disk without being registered
in `themes/index.ts`. It also fails when `base.css` itself contains a literal colour or a
product name.

`validate-tokens.mjs` asserts the typed token modules and their CSS mirrors in
`tokens/css/primitives.css` are value-identical in both directions, so spacing, radius, shadow,
motion, z-index and breakpoint scales cannot drift apart.

Both run in CI on every pull request, before lint and typecheck.
