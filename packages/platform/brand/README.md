# Brand

Product identity: which product a surface belongs to, what it is called, and which approved lockup
represents it.

Colour lives next door in [`../themes/`](../themes) and artwork in [`../assets/`](../assets). This
module is what binds the two to a product id and hands them to a component, so that "show the
product's logo" is one import rather than a path, a ratio and a dark-mode rule repeated per
application.

## Using it

A product declares itself once, in its root layout, beside the theme import:

```tsx
import { BrandProvider } from '@munaxa/platform';

<BrandProvider product="docs">{children}</BrandProvider>;
```

Every logo below reads that:

```tsx
import { ProductLogo } from '@munaxa/platform';

<ProductLogo height={30} />                      // horizontal lockup, both schemes
<ProductLogo variant="symbol" height={28} />     // collapsed rail
<ProductLogo variant="stacked" height={72} />    // login, hero
<ProductLogo height={30} compactBelow="md" />    // symbol instead of a squeezed wordmark
```

Browser metadata comes from the same place, so a favicon cannot drift from a logo:

```ts
import { brandIcons, brandOpenGraphImage, productBrands } from '@munaxa/platform';

export const metadata: Metadata = {
  title: productBrands.docs.name,
  icons: brandIcons('docs'),
  openGraph: { images: [brandOpenGraphImage('docs')] },
};
```

## Getting the artwork into `public/`

The platform is the source of the artwork, not a runtime CDN — nothing resolves a PNG out of
`node_modules` at runtime. A product copies what it needs in its `prebuild`:

```jsonc
"prebuild": "munaxa-sync-brand docs apps/web/public"
```

That writes `public/branding/docs/{logos,favicon,social}/…`, which is exactly where
`DEFAULT_ASSET_BASE` points. An application serving from somewhere else — a CDN prefix, a Next
`basePath` — passes `assetBase` to `BrandProvider`.

## Why the component takes no file path

Every rule the brand has about *not mixing products* is enforceable in one place or unenforceable
everywhere. `ProductLogo` has no `src`: the product comes from context, the file comes from the
registry, and the only way to render a sibling product's mark is to name it explicitly — which is
what a product switcher legitimately does and what nothing else should.

The same reasoning covers colour schemes. The lockups are drawn with a neutral-ink `munaxa.`
wordmark; on a dark ground it has to be white while the symbol and the product word keep their
approved colours. No CSS filter does that, so the dark scheme loads the approved `-on-dark` export.
Both files are in the DOM and the scheme hides one with `display: none`, which also takes it out of
the accessibility tree — so the product is announced once, not twice.

## What is not here

- **No colour.** `productBrands.<id>.color` is a read-through to the theme registry, for surfaces
  that cannot read a custom property at all: a manifest's `theme_color`, an HTML email, an OG image
  renderer. Anything rendered in a browser uses `bg-primary` / `text-primary-strong`.
- **No `group` entry.** Group is the corporate identity — the company rather than a product — and
  has no product lockup. Corporate surfaces keep corporate branding.
- **No descriptor by default.** `tagline` ("School Management System" and its siblings) is a
  marketing asset. Putting it in a sidebar would make it part of the core identity, which it is not.
