# Component principles

## The one test

> Could this component be dropped into a product that has nothing to do with schools, and still
> make sense — in its name, its props, its defaults and its comments?

If no, it is a product component. That is not a lesser thing; most components are product
components. The platform is small on purpose.

## The ten rules

1. **No product vocabulary.** Not in the name, a prop, a type, a default value or a comment.
   `EntityPicker`, never `StudentPicker`. `items`, never `students`.

2. **No business logic.** No validation rules, no permission checks, no workflow state, no
   currency or date policy. A component may compute *layout* from its props; it may not decide
   what the props mean.

3. **No data fetching.** Data arrives as props. When a component genuinely needs to load
   (`EntityPicker`), the loader is injected as a function and the component has no idea what it
   is loading or where from.

4. **No routing.** No `next/link`, no `next/navigation`, no router import of any kind. Accept
   `href` and `onClick`; the product decides what navigation means.

5. **No copy.** Every user-visible string is a required or defaulted prop. The platform imports
   no i18n library and ships no translations — that boundary is what lets one component serve
   an English product and an Arabic-first product identically.

6. **No hardcoded colour.** Style through the theme contract (`bg-primary`,
   `text-muted-foreground`, `border-border`). ESLint fails the build on a hex literal anywhere
   in `ui/` or `tokens/`. See [theming.md](./theming.md).

7. **No magic numbers.** Spacing, radius, z-index and duration come from the token-backed
   utilities (`p-4`, `rounded-lg`, `z-modal`). A raw `px` value in a component is a bug report
   against the token scale, not a licence to inline one.

8. **Accessible by default, not by option.** The floor in
   [accessibility.md](./accessibility.md) is part of the component, never a prop the consumer
   can forget to pass.

9. **`className` is always forwarded and merged with `cn()`.** Consumers must be able to adjust
   layout and spacing without forking. Everything else about a component's appearance is the
   platform's to decide.

10. **`'use client'` on anything with state, effects or event handlers**, so React Server
    Component consumers work without wrapper files.

## Layer definitions

| Layer          | Definition                                                     | Examples                              |
| -------------- | -------------------------------------------------------------- | ------------------------------------- |
| **component**  | One control. Does one thing. Rarely composes another component. | `Button`, `Input`, `Card`, `Table`     |
| **pattern**    | Several components composed into a recognisable shape.          | `StatCard`, `Stepper`, `Reveal`        |
| **template**   | A whole-screen skeleton the product fills with data.            | *(none yet — deliberately; see below)* |

`ui/templates/` is empty and that is a decision, not an omission: every page shell in the
codebase today is product-specific. A stripped-down copy of Munaxa's `AppShell` would be a
placeholder, and placeholders rot. The first template gets written when two products need the
same screen skeleton.

### Categories inside `ui/components/`

| Category        | Holds                                                       |
| --------------- | ----------------------------------------------------------- |
| `primitives/`   | The atoms everything else is built from — `Button`, `Badge`  |
| `forms/`        | Anything that collects input, plus its labelling             |
| `feedback/`     | Anything that tells the user something — states, overlays    |
| `navigation/`   | Moving between views or pages within a view                  |
| `layout/`       | Containers that arrange other content                        |
| `data-display/` | Presenting structured, read-mostly data                      |
| `overlays/`     | Layers anchored to a trigger — popover, menu, hover card      |
| `date/`         | The calendar and date controls, built on the `ui/date` engine |
| `data-grid/`    | The enterprise grid and its headless state hook                |

Categories are an internal filing system. The public surface is the flat root barrel, so a
component can be re-filed without breaking a single consumer.

## API design

- **Props describe intent, not implementation.** `tone="success"`, not `color="green"`.
  Semantic props survive a rebrand; literal ones do not.
- **Prefer composition to configuration.** `<Card><CardHeader/><CardContent/></Card>` beats
  `<Card header={…} content={…} />`. When a consumer needs something you did not anticipate,
  composition lets them do it without a new prop.
- **A boolean prop that turns on a whole second behaviour is two components.**
- **Extend the underlying element's props** (`extends React.ButtonHTMLAttributes<…>`) so
  `type`, `aria-*`, `data-*` and refs all work without the platform enumerating them.
- **Export the props type** as `<Component>Props` — products need it to build wrappers.
- **Optional props get defaults inside the component**, never at every call site.

## Changing an existing component

The workspace is a monorepo so that breaking changes are *possible*, not so that they are cheap.

- **Additive** (a new optional prop, a new variant): go ahead.
- **Behavioural** (a default changes, a variant renders differently): every consuming product
  must be checked in the same commit, and the change belongs in its own commit with a note in
  the message about what visually changes.
- **Breaking** (a prop is removed or renamed): update every consumer in the same commit. If
  that is too large for one commit, deprecate first (rule 5 of the lifecycle), ship, then
  remove.

Never fork a component to avoid a breaking change. Two `Button`s is the failure state this
whole structure exists to prevent.
