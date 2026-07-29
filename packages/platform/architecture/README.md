# Platform architecture

The reference for *why* the platform is shaped the way it is, and the rules that keep it that
way. [`../CONTRIBUTING.md`](../CONTRIBUTING.md) is the checklist you follow when writing code;
these documents are the reasoning behind it.

| Document                                                | Answers                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| [component-principles.md](./component-principles.md)     | What a platform component is, and its lifecycle                 |
| [theming.md](./theming.md)                               | Tokens, the theme contract, product palettes                    |
| [responsive.md](./responsive.md)                         | Breakpoints, layout ownership, density                          |
| [motion.md](./motion.md)                                 | Duration/easing scales, reduced motion                          |
| [accessibility.md](./accessibility.md)                   | The non-negotiable a11y floor                                   |
| [naming-conventions.md](./naming-conventions.md)         | Files, exports, props, CSS variables                            |
| [import-rules.md](./import-rules.md)                     | What may import what, in both directions                        |

---

## Folder responsibilities

```
platform/
├── tokens/         VALUES.    Structural scales. No colour, no product, no component.
├── typography/     VALUES.    The type scale.
├── themes/         COLOUR.    base/ declares the contract; <product>/ answers it.
├── icons/          ASSETS.    One icon library, one version, for the whole ecosystem.
├── ui/             CODE.      Everything that renders.
│   ├── lib/        cn() and framework-agnostic helpers.
│   ├── hooks/      UI-only React hooks.
│   ├── components/ Single-purpose controls, grouped by category.
│   ├── patterns/   Compositions of components.
│   └── templates/  Whole-screen skeletons.
├── assets/         Per-product brand artwork.
├── architecture/   This folder.
└── scripts/        The validators CI runs.
```

The dependency direction is strictly downward and never cycles:

```
templates → patterns → components → hooks/lib → icons → typography/tokens
                                                              ↑
                                          themes (CSS only; components
                                          consume it through class names,
                                          never through an import)
```

A component **never** imports a pattern. A pattern **never** imports a template. Nothing in
`tokens/`, `typography/` or `themes/` imports anything from `ui/`. This is enforced by review
and by the fact that `tokens/` and `themes/` have no React dependency at all.

## Component lifecycle

```
1. PRODUCT-LOCAL     Built inside the product that needs it. Lives in the product repo folder.
                     Most components stay here forever, and that is correct.

2. CANDIDATE         A second product needs the same thing. Note the duplication; do not
                     promote yet — build the second copy and let the two diverge honestly for
                     one cycle. Premature promotion produces a component with a product-shaped
                     API and a config flag for every difference.

3. PROMOTED          Both consumers agree on the shape. Move it into ui/, strip every trace
                     of product vocabulary, replace product data with props, add the a11y
                     floor, export it from the barrel, and rewrite both products to consume it.
                     The product-local copies are DELETED in the same change.

4. STABLE            Changes are additive. Breaking a prop means updating every consumer in the
                     same commit — the workspace is one repo precisely so this is possible.

5. DEPRECATED        Marked with a JSDoc `@deprecated` naming the replacement, kept for one
                     release cycle, then deleted. Nothing is left "just in case".
```

The trigger for step 3 is always **two real consumers**, never anticipation of a second one.
A component designed for a hypothetical second product is a component designed for nobody.

## What belongs inside the platform

Something belongs here when **all** of these are true:

- It renders UI, or it is a value/helper that renders UI depends on.
- Its API can be described without naming a business entity, a role, a workflow or a product.
- It has no opinion about where its data came from and no opinion about where a click goes.
- Two or more products need it, or it is a token/theme (which are shared by definition).

## What belongs inside a product

Everything else, and specifically:

- Anything that knows what a student, employee, invoice, tenant, school or academic year is.
- Business rules, validation, permission checks, workflows, state machines.
- Data fetching, API clients, caching, routing, middleware.
- Navigation models and app shells — the set of destinations *is* the product.
- Authentication and session UI.
- Marketing and landing pages.
- Copy, translations, and anything that reads from an i18n catalogue.

Munaxa's `AppShell`, `Shell`, `PrivacyProvider`, `StatusBadge`, `GlobalSearch`, `Logo`,
`NavIcon`, `I18nProvider` and every `components/domain/*` are correct where they are and must
not move. If a change would make one of them shared, the change is wrong.

- [`completion-audit.md`](./completion-audit.md) — the Platform Completion Audit:
  what the legacy design system still holds, what has been superseded, and what
  remains before it can be deleted.
