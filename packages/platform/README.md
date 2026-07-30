# @axa/platform

The shared engineering foundation for every Munaxa product — School, Work, Docs and whatever
comes next. Design tokens, product themes, typography, icons, UI components and patterns, plus
the standards and machine-checked contracts that keep them coherent as the ecosystem grows.

It is **product-agnostic by construction**: no school, HR, finance or any other domain
terminology, no business rules, and no product names outside the `themes/` and `assets/` layers,
where naming a product is the entire point.

| Start here                                                          | For                                          |
| ------------------------------------------------------------------- | -------------------------------------------- |
| [`/PLATFORM_ENGINEERING_STANDARDS.md`](../PLATFORM_ENGINEERING_STANDARDS.md) | **The mandatory rulebook.** Read it first. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                              | The checklist for changing the platform       |
| [`VERSIONING.md`](./VERSIONING.md)                                  | What a version number promises                |
| [`MIGRATION.md`](./MIGRATION.md)                                    | Moving across a major version                 |
| [`CHANGELOG.md`](./CHANGELOG.md)                                    | What changed, release by release              |
| [`architecture/`](./architecture/README.md)                         | Why the platform is shaped this way           |
| [`/docs/README.md`](../docs/README.md)                              | Every document in the repository              |
| §3 below                                                            | Consuming it from a product                   |
| §4 below                                                            | The layout and responsive system              |
| §5 below                                                            | The application shell                         |
| §6 below                                                            | The calendar and date system                  |
| §7 below                                                            | Data presentation: grid, charts, dashboards   |
| §8 below                                                            | Enterprise workspace components               |
| §9 below                                                            | Brand colour: when to use fill vs text        |

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
│   ├── spacing/ radius/ elevation/ borders/ motion/ opacity/
│   ├── transitions/ z-index/ breakpoints/
│   └── css/primitives.css    the same scales as CSS custom properties (--axa-*)
├── typography/index.ts       families, sizes, weights, line-heights
├── themes/
│   ├── index.ts              typed registry of every product theme
│   ├── base/base.css         THE CONTRACT: @theme mapping + dark variant + utilities
│   ├── base/neutrals.css     the shared greyscale — themes override branding only
│   ├── group/                palette.css · brand.ts · index.css
│   ├── school/               palette.css · brand.ts · index.css
│   ├── work/                 palette.css · brand.ts · index.css
│   └── docs/                 palette.css · brand.ts · index.css
├── icons/index.ts            the curated lucide re-export
├── ui/
│   ├── lib/                  cn (clsx + tailwind-merge) · isRtlElement
│   ├── hooks/                use-theme · use-media-query · use-breakpoint · use-focus-trap
│   ├── date/                 the date engine: CalendarAdapter · DateParser · DateFormatter ·
│   │                         TimeFormatter · LocaleProvider (no components — see §6)
│   ├── charts/               Chart · LineChart · AreaChart · BarChart · PieChart, on ECharts
│   ├── components/
│   │   ├── primitives/       Button, Badge, Tag
│   │   ├── forms/            Input, Select, Textarea, Checkbox, Radio, Switch, Label, Field,
│   │   │                     Command, Combobox, MultiSelect, Autocomplete, TokenInput,
│   │   │                     EntityPicker
│   │   ├── feedback/         Spinner, EmptyState, ErrorState, Tooltip, Dialog, Drawer, Toast
│   │   ├── overlays/         Popover, DropdownMenu, ContextMenu, HoverCard
│   │   ├── date/             Calendar, DatePicker, DateRangePicker, TimePicker, DateTimePicker
│   │   ├── data-grid/        DataGrid, useDataGrid, useVirtualRows
│   │   ├── board/            Kanban, Gantt, OrgChart, DragDropProvider
│   │   ├── files/            Dropzone, FileManager
│   │   ├── flow/             WorkflowCanvas, ApprovalFlow
│   │   ├── query/            FilterBuilder, SearchBuilder, the condition model
│   │   ├── navigation/       Tabs, Pagination
│   │   ├── layout/           Card
│   │   └── data-display/     Table, Timeline, Accordion, Avatar, Sparkline
│   ├── layouts/              Stack · Inline · Cluster · Container · Grid · Center · Cover ·
│   │                         Surface · Page · PageHeader · Section · Split · SidebarLayout ·
│   │                         InspectorLayout · Panel · Toolbar · Workspace · ResizablePanels
│   ├── shell/                AppShellProvider · AppShell · Sidebar · SidebarNav ·
│   │                         TopBar · SidebarTrigger · NavigationDrawer · SkipLink
│   ├── patterns/             StatCard, KpiGrid, ChartCard, Stepper, Progress, TokenReference,
│   │                         motion/
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
@import '@axa/platform/css/themes/school'; /* or group / work / docs */

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
| `@axa/platform/date`            | the date engine, without any components      |
| `@axa/platform/charts`          | ECharts wrappers (loaded lazily)             |
| `@axa/platform/patterns`        | patterns only                                |
| `@axa/platform/css/themes/<id>` | a theme (contract + palette)                 |
| `@axa/platform/css/tokens`      | the structural scales as CSS variables       |
| `@axa/platform/css/motion`      | styles for the motion patterns               |

Never deep-import a file path. See [import-rules.md](./architecture/import-rules.md).

**4. Verify your theme.** Render `<TokenReference />` on an internal page — it reads the live
custom properties off the document, so every swatch is the value your app is actually serving.

## 4. Layout and the responsive system

Applications compose screens from layout primitives rather than hand-assembling `flex`, `max-w-*`
and `space-y-*` on every page. That is not a style preference — before this existed, the school
admin app carried **fourteen different page measures**, **283 hand-written responsive grids** and
the same `<h1 className="font-display text-2xl font-semibold">` on **61 screens**, with no way to
change any of them centrally.

| Reach for            | When                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `Stack`              | One axis, one gap step. Most layouts are this                       |
| `Inline` / `Cluster` | A row that wraps — chips, filters, action groups                    |
| `Grid`               | Two dimensions, with a responsive column count                      |
| `Container`          | A named page measure and the responsive gutter                      |
| `Center` / `Cover`   | Empty states, loading screens, sign-in pages                        |
| `Surface`            | A themed background with border, elevation and padding              |
| `Page` / `Section`   | The page frame and its labelled regions                             |
| `Split`              | Two panes at a ratio, stacking on narrow viewports                  |
| `SidebarLayout`      | Fixed navigation column beside fluid content                        |
| `InspectorLayout`    | Content with a contextual detail panel                              |
| `Panel` / `Toolbar`  | A bordered region; a row of controls acting on what is below        |
| `Workspace`          | The scrolling content region, and the `main` landmark               |
| `ResizablePanels`    | A draggable — and keyboard-operable — separator                     |

Three properties hold across all of them:

- **Spacing is a token, not a number.** `gap` accepts only steps that exist on the shared scale,
  so `gap={5}` does not compile.
- **RTL is free.** Horizontal arrangements use flex row and logical properties, and the pane props
  are `start` / `end` rather than `left` / `right`, so nothing needs a second code path.
- **Class names are literals.** Tailwind finds classes by scanning source text, so a class built at
  runtime is never emitted and the layout silently collapses. Every scale is written out in
  `ui/layouts/scales.ts` for exactly that reason.

### Breakpoints

`useBreakpoint`, `useViewport`, `useIsMobile` and `usePrefersReducedMotion` build their queries
from `tokens/breakpoints`, so JS and CSS cannot disagree about where a breakpoint sits.

```tsx
const compact = useIsMobile();          // below md — navigation becomes a drawer
const viewport = useViewport();         // 'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
```

They report `false` until mount so server and client markup agree. Use them for **behaviour**
— whether to render a drawer or a rail — and CSS for **appearance**, which has to be right in the
first paint.

> `Grid`'s responsive `cols` prop stops at `xl`. Tailwind's scanner will not extract a candidate
> whose variant starts with a digit, so `2xl:grid-cols-*` is never emitted — from a map, from a
> literal, or from `@source inline(...)`. Offering the key would typecheck and do nothing.

## 5. The application shell

The frame a product's screens sit inside, decomposed rather than monolithic. `AppShellProvider`
owns the state its parts share — collapsed, drawer, breakpoint, the main region's id — and
`AppShell`, `Sidebar`, `SidebarNav`, `TopBar`, `SidebarTrigger`, `NavigationDrawer` and `SkipLink`
each do one thing. A product composes them, replaces any one, or uses the provider's state to build
its own; none of that is possible with a single 800-line component.

```tsx
<AppShellProvider collapsed={collapsed} onCollapsedChange={persist}>
  <AppShell
    skipLinkLabel="Skip to content"
    sidebar={<Sidebar brand={brand} footer={session}><SidebarNav groups={groups} label="Main" renderLink={link} /></Sidebar>}
    drawer={<NavigationDrawer label="Navigation"><SidebarNav groups={groups} label="Main" renderLink={link} collapsed={false} /></NavigationDrawer>}
    topBar={<TopBar actions={<UserMenu />}><SidebarTrigger /><Search /></TopBar>}
  >
    {children}
  </AppShell>
</AppShellProvider>
```

Three boundaries make it product-agnostic, and all three are load-bearing:

- **Navigation arrives resolved.** `NavigationGroup[]` carries labels, icons and `active` flags that
  the application has already worked out. Whether an item is visible depends on permissions and
  feature flags; what its label says depends on the locale. Those are business rules, and a shell
  that evaluated them would need editing before the second product could use it.
- **It persists nothing.** The provider holds `collapsed` but never writes it. Where a preference
  lives — `localStorage`, a cookie, a user record — is an application decision, and a shared package
  storing it would have to invent a key name or bake a product's name into code four products share.
  Pass `collapsed` + `onCollapsedChange` to own it.
- **It imports no router.** `renderLink` supplies the element, so `next/link`, `react-router`,
  `wouter` and a plain `<a>` all work.

Below `md` the rail is not rendered at all and the same navigation appears in `NavigationDrawer` —
a real modal, sharing `useFocusTrap` with `Dialog`, so focus moves in, Tab is trapped, Escape and
the scrim close it, and focus returns to the trigger. Both read the shell context, so there is no
width at which both are mounted, and widening past the breakpoint closes an open drawer rather than
leaving its focus trap armed over a visible rail.

## 6. The date system

Dates are not one utility module. They are five layers, and each one changes for a different reason:

```
LocaleProvider          which locale, calendar, zone and hour cycle the product is in
     ├── CalendarAdapter    the calendar system itself — Gregorian by default
     ├── DateParser         what the user typed → a date
     ├── DateFormatter      a date → what the user reads
     └── TimeFormatter      a wall-clock time → what the user reads
```

They live in `ui/date/` and ship separately as `@axa/platform/date`, because a table cell that
formats a date should not have to import a calendar.

**The rule that holds it together: every value crossing a public API is an ISO-8601 Gregorian
string.** `DatePicker` emits `"2026-04-15"`. `Calendar` emits `"2026-04-15"`. What the user is
*looking at* is presentation, decided by the adapter. That is the whole reason an alternative
calendar is additive rather than breaking:

```tsx
<LocaleProvider locale="ar-JO" calendar={hijriAdapter} timeZone="Asia/Amman">
  <DatePicker value={enrolledOn} onChange={setEnrolledOn} />
</LocaleProvider>
```

Nothing in `DatePicker`, `Calendar` or the parser knows what a month is called or how many days it
has — that is asked of the adapter every time. The Storybook story *A different calendar system*
proves it with a hand-written thirteen-month calendar, and no component was changed to support it.

A few consequences worth knowing:

- **`CalendarDate` is a triple, not an instant.** No time, no zone. `Date` is used for `today()`
  and for `Intl`, never for arithmetic — a local-midnight instant shifts a day across a timezone,
  which is where most date bugs come from.
- **Typing is a first-class path**, not a fallback. The parser reads the field order out of `Intl`,
  so `3/4/2026` is April in `en-GB` and March in `en-US` without the platform choosing for anyone.
  It also reads Eastern Arabic digits, and accepts ISO in every locale.
- **The week starts where the locale says.** Saturday in `ar-JO`, Sunday in `en-US`, Monday in
  `en-GB`, resolved from `Intl.Locale`. Getting this wrong is not cosmetic.
- **Displayed hour cycle never changes the stored value.** `TimePicker` shows `9:05 PM` or `21:05`
  and reports `"21:05"` either way.

## 7. Data presentation

Three pieces, and the boundary between them is the interesting part.

### `DataGrid` — and why `Table` stays

`Table` is the right answer for a dozen rows of static content and is not going anywhere.
`DataGrid` is the one that windows fifty thousand rows, sorts with a collator, resizes columns and
has to be driven from a keyboard. Keeping both means neither has to apologise for the other's cost:
a settings page does not load a grid engine, and a payroll screen does not hand-roll pagination.

It is a real `<table role="grid">`, not the div soup grids usually become. ARIA has exactly the pair
virtualization needs — `aria-rowcount` describes the *dataset* and `aria-rowindex` the row's place
in it — so a screen reader announces "row 4,201 of 50,000" while forty rows exist in the DOM.

```tsx
<DataGrid
  aria-label="Employees"
  rows={rows}
  columns={columns}
  getRowId={(row) => row.id}
  height="60vh"          // a bounded viewport is what turns virtualization on
  paginated={false}
/>
```

A few decisions worth knowing:

- **`value` and `cell` are different things.** `cell` is what a column *looks like* — a badge, a
  formatted currency. `value` is what it *is*, and it is what sorting, searching and export use. A
  status column renders a coloured pill and sorts by the word behind it.
- **Virtualization is tied to `height`, not to a boolean.** Windowing needs a viewport to window
  against; a `virtualized` flag with no bounded height would typecheck and silently do nothing.
- **`mode="server"` changes one word.** It turns off every bit of local sorting, searching and
  slicing, and reports state changes for the caller to put in a query. The rest of the props are
  identical.
- **`useDataGrid` is exported.** The state and derivation have no DOM in them, so a product can
  drive saved views, mirror state into the URL, or render the same data as cards on a phone.

### Charts — ECharts, and no colours

`@axa/platform/charts` is a separate entry point, and `Chart` imports ECharts with a dynamic
`import()`, so a page with no chart on it never loads the library.

**No chart file contains a colour.** The ECharts theme is built by reading `--chart-1` … `--chart-10`
and the semantic roles off the live document, which is the whole reason the platform owns charting:
a chart has to match the badge beside it, flip with dark mode, and change when a different product
imports a different palette. A hex list in a chart config breaks at least one of those.

**The picture is not the content.** Every chart renders its numbers as a visually-hidden table
alongside the graphic, and the wrappers derive it from the same `categories` and `series` the chart
was drawn from, so nobody has to remember. `aria-label` can say "revenue by month"; only a table can
say what the numbers are.

`LineChart`, `AreaChart`, `BarChart` and `PieChart` cover what a business application draws.
Anything else goes to `Chart` with a raw option and still gets the theme, the resizing, the states
and the table — a wrapper is never a bottleneck.

**Sparklines are deliberately not ECharts.** An instance for a sixty-pixel line, twenty to a
dashboard, is an order of magnitude more machinery than the drawing needs. `Sparkline` is plain SVG.

### KPI cards and dashboards

`StatCard` gained `delta` and `trend` rather than a parallel `KpiCard` appearing beside it. The
field that matters is `delta.goodWhen`:

```tsx
<StatCard label="Absences" value="31" delta={{ value: 4, goodWhen: 'down' }} />
```

A rise is not inherently good news. Attendance going up is good; absences going up is not, and
colouring every increase green tells half the dashboard the opposite of the truth.

`KpiGrid` and `ChartCard` fix the two decisions every dashboard re-makes slightly differently — how
many tiles fit at each breakpoint, and where a chart's title, controls and footnote go. `ChartCard`
is a `<section>` with a real heading, because a dashboard is a dozen panels and the headings are how
a screen-reader user moves between them.

## 8. Enterprise workspace components

The surfaces where work is *arranged* rather than listed: `Kanban`, `Gantt`, `OrgChart`.

### One drag-and-drop foundation

`DragDropProvider` wraps dnd-kit with the platform's sensors and — the part dnd-kit does not ship
— live announcements for the whole drag lifecycle. Without them a screen-reader user hears nothing
at all through a drag, and every board in every product would otherwise write its own set, or more
likely none. Supplying them once makes an accessible drag the path of least resistance.

`ui/components/board/dnd.tsx` is the only file allowed to import `@dnd-kit/*`. A second drag
implementation means a second set of keyboard behaviours, and that is how a product ends up with
one board a keyboard user can reorder and one they cannot.

### Arrangement here, meaning in the product

None of these components decides whether a move is *allowed*. A Kanban column's `limit` is
displayed and flagged; it is never enforced. `onMove` reports what the user did and the product
updates its state — or declines to:

```tsx
<Kanban
  columns={columns}
  items={cards}
  onMove={(move) => { if (allowed(move)) setCards(apply(move)); }}
  renderCard={(card) => <Card {...card} />}
/>
```

That single boundary is why a WIP limit can be advisory in one product and hard in another without
a `strictLimits` prop ever appearing here.

### They are real markup, not pictures

Each of these is a component usually shipped as an opaque diagram, and a diagram conveys nothing to
a screen reader:

- **Kanban** is `<section>`s with real headings and `<ul>`s of cards, so it is navigable by heading
  and by list with nothing being dragged. Every card has a named drag handle rather than the whole
  card being draggable — a card is usually clickable too, and a whole-card drag makes opening a
  record a coin toss.
- **Gantt** is a `<table>`: one row per task, the task name as its row header, and every bar a
  button named "Fit out east wing, 3 April 2026 to 12 April 2026". Its axis is built with the date
  engine from §6, so a Gantt inside a `LocaleProvider` with a different calendar adapter is drawn
  against that calendar's months without the file knowing what a month is. Editing is optional and
  keyboard-first: arrows move a task, Shift with them changes its duration.
- **OrgChart** is the APG `tree` — nested lists with `aria-level`, `aria-setsize` and
  `aria-posinset`, connectors drawn in CSS on top. Each `treeitem` is named explicitly from
  `OrgNode.label`, because a name computed from content would announce the chief executive followed
  by everyone in the company. Full APG keyboard including typeahead.

Horizontal arrow keys mirror in a right-to-left layout throughout, via `isRtlElement` in `ui/lib`
— shared with `DataGrid`, so the grid and the tree agree about which way "forward" is.

### Files — storage-agnostic

`Dropzone` hands over raw `File` objects. `FileManager` renders the folder it was given and reports
navigation and selection by id. Neither fetches, uploads, signs a URL, or knows a storage backend:

```tsx
<FileManager items={items} path={path} onNavigate={open} onUpload={(files) => upload(files)} />
```

A file manager that assumed S3, or a signed upload, or a document API would be unusable for the next
product, so the boundary is drawn at `File` objects and ids and nothing crosses it in either
direction. The list view is the `DataGrid` from §7 and the path is the `Breadcrumb`, so sorting,
keyboard cell navigation and selection are the ones already tested rather than a second set.

The dropzone is a real `<button>` with a hidden input behind it. Drag is inherently a pointer
gesture, so the keyboard path has to be a genuine focusable control or there is no way in at all.

### Flow editors — presentation only

`WorkflowCanvas` is a graph; `ApprovalFlow` is an ordered chain. Two components, because there are
two problems: an approval *is* a list, and forcing it through a node canvas would make "move finance
before legal" a matter of dragging boxes and redrawing arrows.

Both own layout, selection and keyboard interaction, and nothing else. They do not know what a step
type means, cannot validate a workflow, will not add or delete a node, and have no idea how any of it
executes. That is not squeamishness about scope: a canvas that knew about approval steps would *be*
an approval editor, and the next product's process would need a fork of it.

**A diagram is not the content.** The only thing a workflow picture conveys is what leads to what —
exactly what a picture cannot say. So the nodes are a real list, each described by its outgoing
connections in text ("Manager approval leads to Finance review, Rejected"), and the SVG carrying the
lines is `aria-hidden`, because the lines are a redundant rendering of information already in words.

`ApprovalFlow` in `readOnly` with a `status` per step is how a live request renders — so the shape a
designer built is literally the shape a requester sees.

### Query builders — generic

`FilterBuilder` edits nested groups of `field operator value`. `SearchBuilder` is the bar above a
grid: free text, the editor in a popover, removable chips for what is applied. It **composes** the
builder rather than inventing a `status:active grade:>9` syntax — that would be a parser, an
autocomplete grammar, an error-reporting story and a language users have to learn, all to express
what a condition editor expresses without any of it.

`FilterField[]` is the only product-specific input and it is plain data, so School filtering students
and Work filtering timesheets are the same components with different fields:

```tsx
<SearchBuilder fields={fields} value={query} onChange={setQuery} />
```

**The value is JSON.** A `FilterGroup` survives `JSON.stringify`, which is what makes a saved view, a
shareable URL and a server-side query all speak the same thing. `query/types.ts` imports no React, so
a product can build and validate a filter on a server without pulling in a component.

**Editing and applying are separate**, via `pruneFilter`. A half-typed clause — a field chosen with
no value yet — must stay visible so the user can finish it, and must never reach a query, where it
would silently filter everything away.

Each group is a `<fieldset>` with a `<legend>` carrying its combinator. Nesting is what makes these
unusable with a screen reader: a stack of divs gives no indication where one group ends, and "OR"
floating between two rows means nothing.

## 9. Brand colour: fill vs text

The brand exists twice in the contract, on purpose.

| Role                | Use it for                                   | Paired with            |
| ------------------- | -------------------------------------------- | ---------------------- |
| `--primary`         | **Fills** — button backgrounds, badges, bars | `--primary-foreground` |
| `--primary-strong`  | **Text**, links, icon strokes, focus borders | the page background    |

The two are not interchangeable, and the reason is contrast. A light, high-chroma brand works
beautifully as a fill — School's `#00CFC1` carries dark text at 9.0:1 — while the same hex used
as text on white is **1.96:1**, which fails WCAG AA by a wide margin. `--primary-strong` is the
nearest step on the same brand ramp that clears 4.5:1 against the page background, computed per
theme and per colour scheme:

| Theme  | Fill      | on fill   | Text (light) | Text (dark) |
| ------ | --------- | --------- | ------------ | ----------- |
| group  | `#2B3A67` | 11.03:1   | 11.03:1      | 6.30:1      |
| school | `#00CFC1` | 9.04:1    | 5.10:1       | 9.76:1      |
| work   | `#6E1E43` | 10.88:1   | 10.88:1      | 6.11:1      |
| docs   | `#6B8E62` | 4.79:1    | 5.07:1       | 6.88:1      |

For brands that are already dark enough — group and work — `--primary-strong` *is* the brand hex,
so nothing is lost by always reaching for it.

> Rule of thumb: if the colour is behind something, `bg-primary`. If it **is** the thing you
> read, `text-primary-strong`.

## 10. Adding a product theme

Palettes are **generated**, not hand-written, so every brand ramp is perceptually even and every
foreground is contrast-checked:

```bash
# add the brand to the THEMES array in scripts/generate-palettes.mjs, then
node scripts/generate-palettes.mjs themes
```

```
themes/newproduct/
├── palette.css   GENERATED — primary ramp, semantic roles, chart series
├── brand.ts      brand hexes, gradient stops, static neutral scale
└── index.css     @import '../base/base.css';  @import './palette.css';
```

The generator anchors the 50–950 ramp exactly on the brand hex, then picks `--primary-foreground`
and `--primary-strong` by measured WCAG contrast rather than by eye — see §9.

Then one entry in `themes/index.ts` and one line in `package.json` `exports`. **No component
changes** — that is the test of whether the layering is intact. `pnpm validate` will tell you
immediately if the palette is incomplete.

## 11. Validation

```bash
pnpm validate                          # both validators, via turbo
pnpm --filter @axa/platform validate:contract
pnpm --filter @axa/platform validate:tokens
```

`validate-contract.mjs` derives the required role set from the `@theme inline` block of
`themes/base/base.css` — the contract is never written down twice — and fails when a palette
misses a role, invents one, redefines a structural scale, forks the shared neutral ramp,
declares a role twice, skips a colour scheme, redeclares the contract in its entry point, or
exists on disk without being registered in `themes/index.ts`. It also fails when `base.css`
itself contains a literal colour or names a product (the product list is read off disk, so a
renamed theme cannot leave the check guarding a name that no longer exists).

The contract is **59 roles: 48 answered per brand, 11 shared**. The shared eleven are the
neutral ramp in `themes/base/neutrals.css` — greyscale is structure, and a theme that forked it
would stop being "branding only".

`validate-tokens.mjs` asserts the typed token modules and their CSS mirrors in
`tokens/css/primitives.css` are value-identical in both directions, so spacing, radius, shadow,
motion, z-index and breakpoint scales cannot drift apart.

Both run in CI on every pull request, before lint and typecheck.
