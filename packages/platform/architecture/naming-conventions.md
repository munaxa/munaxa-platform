# Naming conventions

Names describe **role**, never appearance, never domain. A name that describes how something
looks becomes a lie at the first rebrand; a name that describes a business entity makes the
thing unusable by the next product. Both failures have already happened here once —
`--coral` and `--aqua` were renamed to `--accent-warm` and `--accent-cool` for exactly this
reason.

## Files and folders

| Thing              | Convention                    | Example                          |
| ------------------ | ----------------------------- | -------------------------------- |
| Folder             | `kebab-case`, plural for sets | `ui/components/data-display/`    |
| Component file     | `kebab-case`, singular        | `stat-card.tsx`                  |
| Hook file          | `use-` prefix                 | `use-theme.ts`                   |
| Barrel             | `index.ts`, exports only      | `ui/components/forms/index.ts`   |
| Stylesheet         | `kebab-case.css`              | `motion.css`, `primitives.css`   |
| Doc                | `kebab-case.md`               | `naming-conventions.md`          |
| Script             | `verb-noun.mjs`               | `validate-contract.mjs`          |

One component per file; the file is named after the component it exports. A file exporting
`StatCard` is `stat-card.tsx` — no exceptions, because the mapping is what makes the tree
navigable without search.

## Code

| Thing               | Convention                      | Example                                |
| ------------------- | ------------------------------- | -------------------------------------- |
| Component           | `PascalCase`                    | `EntityPicker`                          |
| Props type          | `<Component>Props`, exported    | `EntityPickerProps`                     |
| Hook                | `useThing`                      | `useTheme`                              |
| Hook options/result | `UseThingOptions` / `…Result`   | `UseThemeOptions`                       |
| Variant union       | Singular noun                   | `type Tone = 'success' \| 'warning'`    |
| Boolean prop        | `is` / `has` / `can`, or plain  | `disabled`, `isLoading`                 |
| Handler prop        | `on<Event>`                     | `onChange`, `onDismiss`                 |
| Constant            | `SCREAMING_SNAKE`               | `ACTIVITY_EVENTS`                       |

Subcomponents are namespaced by their parent: `Card`, `CardHeader`, `CardTitle`,
`CardContent` — not `Header`, `Title`, `Content`, which collide the moment two families are
imported together.

## Props

Name the **intent**, not the rendering:

| Good              | Bad                | Why                                            |
| ----------------- | ------------------ | ---------------------------------------------- |
| `tone="danger"`   | `color="red"`      | Survives a rebrand and dark mode                |
| `size="sm"`       | `height={32}`      | Stays on the scale                              |
| `items`           | `students`         | Product vocabulary makes it single-use          |
| `emptyLabel`      | `noStudentsText`   | Same                                            |
| `load`            | `fetchStudents`    | The component must not know what it loads       |

## CSS variables

| Kind                | Pattern                    | Example                    | Lives in                    |
| ------------------- | -------------------------- | -------------------------- | --------------------------- |
| Semantic role       | `--<role>`                 | `--primary`, `--border`    | `themes/base/base.css` (contract) → `themes/<product>/palette.css` (value) |
| Paired foreground   | `--<role>-foreground`      | `--card-foreground`        | same                        |
| Tailwind binding    | `--color-<role>`           | `--color-primary`          | `themes/base/base.css`      |
| Structural token    | `--axa-<scale>-<step>`     | `--axa-space-4`            | `tokens/css/primitives.css` |
| Brand tint          | `--<name>-tint`            | `--shadow-tint`            | `themes/<product>/palette.css` |

Rules:

- **Roles have no brand and no hue in the name.** `--destructive`, not `--red`.
  `--accent-warm`, not `--coral`.
- **Every surface role has a matching `-foreground`**, so a legible pair is always available.
- **Only structural tokens carry the `--axa-` prefix**, because only they are global constants.
  A `--axa-` variable inside a palette is a validation failure.

## Themes and assets

- Theme folder = the product id, lowercase, matching `themes/index.ts`: `themes/workaxa/`.
- Asset folders mirror it: `assets/<product>/{logos,favicon,social,illustrations}/`.
- Asset files are `kebab-case`, describing the artwork's role:
  `logos/horizontal-lockup.png`, `favicon/app-icon.png`, `social/og-default.png`.
  Not `Primary_logo.png`, not `logo2.png`.

## Naming smells

| Smell                                | What it usually means                                  |
| ------------------------------------ | ------------------------------------------------------ |
| A colour word in a role name          | The token will be wrong after a rebrand                 |
| A business noun in a platform name    | The component belongs in a product                      |
| `Wrapper`, `Container`, `Helper`      | The thing has no identified responsibility yet          |
| `data`, `info`, `item` as a prop      | The prop's meaning lives only in the caller's head      |
| `<Component>V2`                       | A breaking change that was avoided instead of made      |
| A product name anywhere in `ui/`      | A layering violation; CI and review should reject it    |
