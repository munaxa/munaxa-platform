# Assets

Binary brand material, one folder per product.

```
assets/
└── <product>/
    ├── logos/          lockups and marks
    ├── favicon/        browser and app icons
    ├── social/         Open Graph / share images
    └── illustrations/  spot illustrations and empty-state art
```

The product folder name matches its theme id in [`../themes/`](../themes) and its entry in
`themes/index.ts`. Adding a product means adding both, together.

## Naming

`kebab-case`, describing the artwork's **role** — not its order of creation, not its colour.

| Bucket           | Expected names                                                         |
| ---------------- | ---------------------------------------------------------------------- |
| `logos/`         | `primary`, `horizontal-lockup`, `stacked-lockup`, `wordmark`, `symbol`  |
| `favicon/`       | `favicon`, `app-icon`, `maskable`                                       |
| `social/`        | `og-default`, `og-<surface>`                                            |
| `illustrations/` | `empty-<context>`, `error-<code>`                                       |

`logo2.png` and `Primary_logo.png` are both wrong: the first says nothing, the second breaks the
casing convention.

## How products use these

The platform is the **source** of the artwork, not a runtime CDN. A product copies what it needs
into its own `public/` directory at build time, so the app controls caching, sizing and format
conversion. Nothing imports a PNG from `@axa/platform`.

## What is deliberately NOT here

**No `colors/` folder.** Colour has exactly one source of truth — the theme palettes in
[`../themes/`](../themes) — and exporting a second, hand-maintained copy into `assets/` is how
palettes drift. Anything that needs a raw hex reads the typed registry:

```ts
import { themes } from '@axa/platform/themes';
themes.munaxa.brand.color.DEFAULT; // '#007595'
themes.munaxa.brand.neutral.ink; //   '#090B0C'
```

**No shared/unbranded bucket.** An asset that is not product-specific is either an icon (it
belongs in [`../icons/`](../icons)) or it is drawn in code with theme classes so it follows the
active palette.

## Current state

| Product     | Logos | Favicon | Social | Illustrations |
| ----------- | ----- | ------- | ------ | ------------- |
| **munaxa**  | 4     | 2       | —      | —             |
| **workaxa** | —     | —       | —      | —             |
| **inkaxa**  | —     | —       | —      | —             |

Workaxa and Inkaxa have authored palettes but no artwork yet; their folders are reserved so the
structure is settled before the work lands. Empty buckets carry a `.gitkeep` — delete it when
you add the first real file.

## Brand usage

### Munaxa

- Brand hue: teal `#007595`, light `#00B8DB`, deep `#005066`.
- Clear space: at least the height of the symbol on every side of a lockup.
- Never recolour a lockup. The symbol may be rendered in a single flat colour (brand, white or
  ink) when the full lockup does not fit.
- On screen, never hardcode the brand hex — use `bg-primary` / `text-primary`, which follow the
  active theme and both colour schemes. The hexes exist for surfaces with no CSS at all.
