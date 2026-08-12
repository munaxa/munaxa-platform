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
| **group**  | 1     | 4       | —      | —             |
| **school** | 9     | 4       | 1      | —             |
| **work**   | 9     | 4       | 1      | —             |
| **docs**   | 9     | 4       | 1      | —             |

Group has the mark and the icons, and deliberately no lockup. Every lockup in the supplied
artwork carries a product word — even the file named "wordmark" sets `school` beneath `munaxa.` —
so a corporate lockup would have to be composed, and composing one is redrawing the logo. What
the M *is* is product-independent, so recolouring it to the corporate navy is honest; anything
more is not. Empty buckets carry a `.gitkeep` — delete it when you add the first real file.

## Provenance

**Two sources, and they answer different questions.**

| Question | Answer comes from |
| --- | --- |
| What does the logo *look* like — geometry, proportions, lockup, spacing, negative space, typography, the square punctuation mark | the approved logo exports |
| What *colour* is it | [`../themes/<id>/brand.ts`](../themes), and nothing else |

The colour baked into a supplied export is **not** consulted. Those files were drawn against
values that no longer match the palettes this package ships, and a logo whose teal disagrees with
`--primary` on the same screen is a logo that makes the product look broken. So the artwork is
**recoloured** on the way in: the mark keeps its shape and gets the platform's colour.

Nothing is redrawn, retraced, re-spaced or rescaled non-uniformly. A pixel that was inside the
mark is still inside the mark, in the same place, with the same alpha. Five operations, and only
these:

- **Trim.** The empty margin around the artboard was cropped away. Only padding was removed; the
  aspect ratio of the artwork itself is untouched.
- **Key.** Exports delivered without an alpha channel had their flat white ground made
  transparent, with the antialiased rim feathered so the mark keeps a clean edge.
- **Recolour.** A flat-colour logo has two inks: the product colour and a neutral — the wordmark's
  black, the white knocked out of the app icon, the paper. Every chromatic pixel is therefore the
  product ink blended with one of those neutrals at some coverage, and an antialiased curve is
  nothing but a run of pixels at intermediate coverage. That coverage is *recovered*, by
  projecting the pixel onto the segment from the neutral to the source ink in **linear light** —
  the space the blend physically happened in; averaging gamma-encoded values would thicken or thin
  every edge — and the canonical colour is laid back down at the same coverage against the same
  neutral. The source ink is measured for this and only this: it is the reference length for
  recovering geometry, and it never reaches the output.
- **On-dark.** The `munaxa.` wordmark is set in neutral ink, and on a dark ground it has to be
  white. The `-on-dark` lockups apply exactly that: the neutral ink is remapped to white pixel for
  pixel, alpha preserved. **The product colour does not change between schemes** — only the
  neutral does. There is no separate dark-mode brand colour and none was invented.
- **Compose.** Finished artwork centred, unscaled in aspect, on a flat canvas for the icons and
  the share image.

Measured after: every one of the 47 files carries its product's canonical hex exactly, `recolour`
changes **zero** alpha values and **zero** neutral pixels, and every lockup's aspect ratio is
unchanged.

## Brand usage

- **Same family, one variable.** All three products share the M symbol, the `munaxa.` wordmark,
  the square punctuation mark, the typography and the proportions. Only the product colour and the
  product name change.

  | Product   | Canonical colour | Defined in                    |
  | --------- | ---------------- | ----------------------------- |
  | Corporate | `#2B3A67`        | `themes/group/brand.ts`       |
  | School    | `#00CFC1`        | `themes/school/brand.ts`      |
  | Work      | `#6E1E43`        | `themes/work/brand.ts`        |
  | Docs      | `#6B8E62`        | `themes/docs/brand.ts`        |

  These are the same values `--primary` resolves to, which is the point: the mark in the sidebar
  and the fill on the button beside it are one colour, not two that nearly match. The supplied
  exports arrived in different values; those were replaced rather than adopted.

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
