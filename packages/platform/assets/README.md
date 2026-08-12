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

| Bucket           | Expected names                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `logos/`         | `horizontal-lockup`, `stacked-lockup`, `wordmark`, `symbol`, `tagline-lockup` |
| `favicon/`       | `favicon`, `favicon-32`, `app-icon`, `apple-touch-icon`                |
| `social/`        | `og-default`, `og-<surface>`                                           |
| `illustrations/` | `empty-<context>`, `error-<code>`                                      |

A lockup that is drawn for a dark background takes the same name with an `-on-dark` suffix:
`horizontal-lockup.png` and `horizontal-lockup-on-dark.png` are the same artwork, one per colour
scheme. The symbol has no suffix — it is a single flat product-colour mark that reads on both.

`logo2.png` and `Primary_logo.png` are both wrong: the first says nothing, the second breaks the
casing convention.

## How products use these

The platform is the **source** of the artwork, not a runtime CDN. A product copies what it needs
into its own `public/branding/<product>/` directory, so the app controls caching, sizing and format
conversion. Nothing imports a PNG from `@munaxa/platform`.

Copying is not a manual step. [`../scripts/sync-brand-assets.mjs`](../scripts/sync-brand-assets.mjs)
is published with the package, and a product runs it from its own `prebuild`:

```jsonc
"prebuild": "munaxa-sync-brand docs apps/web/public"
```

The [`brand/`](../brand) module is the matching TypeScript side: it names the same files as typed
paths, so no component ever writes an asset filename as a string literal.

## What is deliberately NOT here

**No `colors/` folder.** Colour has exactly one source of truth — the theme palettes in
[`../themes/`](../themes) — and exporting a second, hand-maintained copy into `assets/` is how
palettes drift. Anything that needs a raw hex reads the typed registry:

```ts
import { themes } from '@munaxa/platform/themes';
themes.school.brand.color.DEFAULT; // '#00CFC1'
themes.school.brand.neutral.ink; //   '#101828'
```

**No shared/unbranded bucket.** An asset that is not product-specific is either an icon (it
belongs in [`../icons/`](../icons)) or it is drawn in code with theme classes so it follows the
active palette.

## Current state

| Product    | Logos | Favicon | Social | Illustrations |
| ---------- | ----- | ------- | ------ | ------------- |
| **group**  | —     | —       | —      | —             |
| **school** | 8     | 4       | 1      | —             |
| **work**   | 8     | 4       | 1      | —             |
| **docs**   | 8     | 4       | 1      | —             |

Group is the corporate identity and still has no artwork; its folders are reserved so the
structure is settled before the work lands. Empty buckets carry a `.gitkeep` — delete it when you
add the first real file.

## Provenance

School, Work and Docs artwork comes from the approved product logo exports. The originals are the
authority and were **not** redrawn: the `munaxa.` wordmark, the M symbol, the square punctuation
mark, the type treatment and the proportions are the approved ones for all three products, and the
only thing that differs between them is the product colour and the product name.

Three transformations were applied when the exports were brought into this folder, and only three:

- **Trim.** The empty margin around the artboard was cropped away. Only padding was removed; the
  aspect ratio of the artwork itself is untouched.
- **Key.** Exports delivered without an alpha channel had their flat white ground made
  transparent, with the antialiased rim feathered so the mark keeps a clean edge.
- **On-dark.** The `munaxa.` wordmark is set in neutral ink, and on a dark ground it has to be
  white — which is what the approved dark-background export already does. The `-on-dark` lockups
  apply exactly that: the neutral ink is remapped to white pixel for pixel, alpha preserved, and
  nothing else moves. The product-colour symbol, the product name and the square mark keep their
  approved values.

Nothing else was recoloured, rescaled non-uniformly, re-spaced or redrawn, and no logo was traced
into vector — the exports are raster and are shipped as raster.

## Brand usage

- **Same family, one variable.** All three products share the M symbol, the `munaxa.` wordmark,
  the square punctuation mark, the typography and the proportions. Only the product colour and the
  product name change.

  | Product | Product colour | Sampled from                     |
  | ------- | -------------- | -------------------------------- |
  | School  | `#00CFC1`      | teal symbol and app icon         |
  | Work    | `#80133D`      | burgundy symbol and app icon     |
  | Docs    | `#60661C`      | olive symbol in the lockups      |

  The Docs mark ships in two greens — olive in the lockups, a lighter sage in the standalone
  symbol and the app icon. The lockup is the canonical logo, so the olive is the product colour;
  the Docs palette's dark-scheme step lands in the sage range, so both approved greens are
  reachable from the one hue.

- **Never mix products.** A School surface never shows the Work or Docs mark, and the reverse.
  `ProductLogo` takes the product from context precisely so this cannot be got wrong by hand.
- **Clear space:** at least the height of the symbol on every side of a lockup.
- **Never recolour a lockup.** Use the supplied `-on-dark` variant on a dark ground rather than a
  CSS filter. The symbol may be rendered in a single flat colour (brand, white or ink) when the
  full lockup does not fit.
- **The descriptor lockups are marketing assets.** `tagline-lockup` carries "School Management
  System", "Human Capital Management" and "Intelligent Document Management". It is for marketing
  surfaces that want it, never the default application logo.
- On screen, never hardcode the brand hex — use `bg-primary` / `text-primary-strong`, which follow
  the active theme and both colour schemes. The hexes exist for surfaces with no CSS at all.
