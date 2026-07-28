# Import rules

Two directions, two different rules. Products import *from* the platform through one public
door; the platform imports *nothing* from any product, ever.

## Products importing the platform

**Always from a public entry point. Never a file path.**

```tsx
// Right
import { Button, Card, useToast, cn } from '@axa/platform';
import { Search } from '@axa/platform/icons';
import { tokens } from '@axa/platform/tokens';
import { themes } from '@axa/platform/themes';

// Wrong — reaches past the public API into the internal tree
import { Button } from '@axa/platform/ui/components/primitives/button';
import { cn } from '../../../platform/ui/lib/cn';
```

The internal taxonomy (`ui/components/<category>/`) exists so files can be re-filed without
breaking anyone. A deep import forfeits that and pins the product to a folder layout it does not
own.

### The entry points

| Import                              | Contains                                        |
| ----------------------------------- | ----------------------------------------------- |
| `@axa/platform`                     | components, patterns, hooks, `cn`, `themes`      |
| `@axa/platform/tokens`              | typed structural tokens                          |
| `@axa/platform/typography`          | the type scale                                   |
| `@axa/platform/themes`              | the typed theme registry + brand hexes           |
| `@axa/platform/icons`               | the shared icon set                              |
| `@axa/platform/hooks`               | UI hooks                                         |
| `@axa/platform/patterns`            | patterns only                                    |
| `@axa/platform/css/themes/<id>`     | a theme (contract + palette)                     |
| `@axa/platform/css/tokens`          | the structural scales as CSS variables           |
| `@axa/platform/css/motion`          | stylesheet for the motion patterns               |

The root barrel is the default. The narrower entries exist for consumers that want one slice —
a Node script reading tokens, an email template reading brand hexes — not as an optimisation.

### No app-local re-export barrels

A `src/components/ui/index.ts` that re-exports the platform looks harmless and is not: it makes
`@axa/platform` invisible in the product's imports, so nobody can see what the product actually
depends on, and it becomes the obvious place to "just add one local override". Both app-local
barrels were deleted in the Phase 1 refactor. Do not reintroduce them.

## The platform importing anything

**The platform imports nothing from any product. There is no exception.**

An import of `@munaxa/*` — or any relative path that climbs out of `platform/` — makes the
platform unbuildable for the next product and is the single failure that would undo this
architecture. If a component seems to need something from a product, it needs a prop instead.

### Also forbidden inside the platform

| Forbidden                                      | Why                                                       |
| ---------------------------------------------- | --------------------------------------------------------- |
| `next/*` — `next/link`, `next/navigation`, …    | Ties the platform to one framework; take `href`/`onClick`  |
| Any router, any data-fetching client            | Products own navigation and data                           |
| Any i18n library                                | The platform ships no copy; strings are props              |
| `lucide-react` directly, outside `icons/`       | One icon source at one version — import from `icons/`      |
| A second `clsx`/`tailwind-merge` wrapper        | `cn()` is the one class combiner                           |

`react` and `react-dom` are **peer** dependencies so a product's React is the only React in the
tree. Do not promote them to `dependencies`.

## Inside the platform

Dependencies run strictly downward, and never cycle:

```
templates → patterns → components → hooks/lib → icons → typography/tokens
```

- A **component** may import `lib/`, `hooks/`, `icons/`, `tokens/` and other components in its
  own or a lower category. It may **not** import a pattern or a template.
- A **pattern** may import anything a component may, plus components.
- A **template** may import anything, plus patterns.
- `tokens/`, `typography/` and `themes/` import nothing from `ui/` and have no React dependency.
- Cross-category component imports are fine (`forms/entity-picker.tsx` imports
  `forms/input.tsx`); cross-*layer* upward imports are not.

### Internal specifiers

Relative, with the `.js` extension — the package is ESM under `NodeNext`-style resolution and
TypeScript requires the emitted extension:

```ts
import { cn } from '../../lib/cn.js'; // from ui/components/<category>/
import { cn } from '../lib/cn.js'; // from ui/patterns/
import type { Tone } from '../components/primitives/badge.js';
```

Import from a sibling's **file**, not from its category barrel, inside the same layer — barrels
are the public edge, and routing internal imports through them creates cycles.

## Barrels

Every category has an `index.ts` that **only re-exports**. No logic, no constants, no types
declared inline. Each barrel feeds the root `index.ts`, which is the package's public surface.

Adding a component means two edits: the category barrel, then the root barrel. A component that
is not in the root barrel does not exist as far as products are concerned.

## Enforcement

- ESLint runs type-aware across `platform/` and fails on a hex literal in `ui/` or `tokens/`.
- `pnpm validate` fails when a theme breaks the contract or a token mirror drifts.
- The `@munaxa/*` packages are not dependencies of `@axa/platform`, so a product import fails at
  install and resolution time, not just review.
- Everything else here is a review responsibility — see
  [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
