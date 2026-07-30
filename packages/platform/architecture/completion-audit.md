# Platform Completion Audit

_Performed after Phase 9b, against three references: the original design specification, the legacy
design system (`school/munaxadesignsystem`), and the repository as a whole._

The question this answers is narrow and specific: **has every reusable capability in the legacy
design system been migrated into the Platform, or intentionally superseded?** It is a precondition
for deleting that package, and nothing is deleted on the strength of a summary — every claim below
is a count taken from the tree.

---

## 1. Verdict

| | |
| --- | --- |
| Legacy `ui/` components fully covered by Platform | **40 of 53** |
| Legacy `ui/` components deliberately not migrated | **13** — all dead, zero importers |
| Legacy school-domain components | **10 files, 608 lines** — business logic, must not move |
| Code coupling between the legacy package and anything else | **none** |
| **Component library superseded?** | **Yes** |
| **Deployed documentation site superseded?** | **No — see §5** |

The component library is finished. The **live documentation site is not yet replaced**, because the
Platform's Storybook has no deployment. That is the one open item, and it is a deployment decision
rather than an engineering gap.

---

## 2. Against the legacy component library

53 files in `school/munaxadesignsystem/client/src/components/ui/`.

### Covered (40)

`accordion` `alert` `alert-dialog`→`Dialog` `avatar` `badge` `breadcrumb` `button` `calendar` `card`
`chart` `checkbox` `collapsible` `command` `context-menu` `dialog` `drawer` `dropdown-menu`
`empty`→`EmptyState` `field` `hover-card` `input` `label` `pagination` `popover` `progress`
`radio-group` `resizable`→`ResizablePanels` `scroll-area` `select` `separator` `sheet`→`Drawer`
`sidebar` `skeleton` `sonner`→`Toast` `spinner` `switch` `table` `tabs` `textarea` `tooltip`

Every one of these resolves to a symbol exported from `@axa/platform`, verified against the built
barrel rather than against memory.

### Not migrated, deliberately (13)

`aspect-ratio` `button-group` `carousel` `form` `input-group` `input-otp` `item` `kbd` `menubar`
`navigation-menu` `slider` `toggle` `toggle-group`

**All thirteen have zero importers** anywhere in the repository, including inside the legacy package
itself. (`toggle` has exactly one: `toggle-group`, which has none.) They are what
`npx shadcn add` leaves behind — scaffolding that was installed and never used.

An unused component is not a reusable capability. Migrating them would move thirteen untested,
unproven components into a package whose whole premise is that everything in it is used, tested and
documented. If a product later needs a slider or an OTP input, it gets built then, against a real
requirement, with tests and a story — which is materially better than porting a file nobody has
ever rendered.

### School-domain components (10 files, 608 lines)

`attendance` `communication` `examples` `finance` `parents` `reports` `shared` `students` `teachers`
`transport`, plus `design-system/components/domain` and `workspace-architecture/`.

These are **business logic** — attendance registers, fee tables, report cards — and the standing
architectural rule is that business logic never enters the Platform. They also have zero importers
outside the legacy site's own pages, so nothing is losing a dependency.

They are, however, the only surviving record of some School UI decisions. Before the package is
deleted they should be read for anything worth carrying into School's own components; they must not
be carried into Platform.

---

## 3. Against the original design specification

Every element of the specification is enforced by CI rather than asserted here:

| Specification | Enforcement | Result |
| --- | --- | --- |
| Semantic colour contract | `scripts/validate-contract.mjs` derives the role set from `@theme inline` | 62 roles (51 per-brand + 11 shared neutral) × 4 themes × 2 schemes |
| Structural token scales | `scripts/validate-tokens.mjs` compares typed scales to their CSS mirrors | 49 values match exactly |
| Chart palette | 10 `--chart-*` roles per theme, part of the contract | Present in all four |
| Typography roles | Sora display · Inter body · JetBrains Mono numeric | Bound in `typography/` and the contract |
| Fill vs text separation | `-strong` roles computed by measured WCAG contrast | `primary` `success` `warning` `info` |

The contract is *derived*, not written twice — a role cannot drift out of validation by being
forgotten in a list, because there is no list.

---

## 4. Against the repository as a whole

This is the leg of the audit with real findings, and they are not about the legacy package.

**The Platform has been built; School has largely not been migrated onto it.**

| Capability | Platform has it since | School's adoption |
| --- | --- | --- |
| Shell primitives (`AppShell`, `Sidebar`, `TopBar`, `NavigationDrawer`) | Phase 4 | `components/app-shell.tsx` is still 705 local lines |
| `PageHeader` | Phase 3 | 1 usage against **63** hand-rolled headers |
| `Grid` | Phase 3 | **0** usages; 12 responsive grid literals |
| `CommandPalette` | Phase 6a | `components/global-search.tsx` is still 270 bespoke lines |
| `DataGrid` | Phase 8 | Not adopted; pages use `Table` plus local sort/filter/paging |
| `SearchBuilder` | Phase 9b | Not adopted |

None of this blocks deleting the legacy package — the two are unrelated. It is the honest answer to
"compare the Platform against the repository", and it is the obvious next body of work: the Platform
is now ahead of its only real consumer, and the value of everything built in Phases 3–9 is unrealised
until School consumes it.

### Carried-forward Platform items

- **`Tooltip` is still hand-rolled** — 47 lines, no Radix, so no collision detection and no
  pointer-versus-keyboard intent handling. Every other overlay moved to Radix in Phase 5; this one
  did not. Migrating it would preserve the API and be a strict improvement.
- **v3-compatibility shims remain in `themes/base/base.css`** — `@utility shadow`, `shadow-sm`,
  `backdrop-blur-sm`. They exist because two consumers were authored against Tailwind v3. Removing
  them shifts card shadows in three applications, so it needs its own commit with a visual check.

---

## 5. The one thing that is not superseded

`school/munaxadesignsystem` is **not just a component library**. It is a Vite application with 27
documentation pages, its own pnpm root and lockfile, a CI job, and a `wrangler deploy` — a live
Cloudflare site.

The Platform's replacement for that surface is Storybook: it builds, it carries the component
documentation, the states, the RTL and dark-mode stories, the accessibility addon. **It is not
deployed anywhere.**

So the accurate statement is:

- The legacy **library** is fully superseded. Nothing imports it; 40 of 53 components have Platform
  equivalents and the other 13 are dead.
- The legacy **site** is not superseded until Storybook is published somewhere a colleague can open.

Deleting the package today removes a live documentation site and leaves nothing in its place. That is
a product decision, not an engineering one, which is why this audit stops here rather than deleting.

### Recommended sequence

1. Add a Storybook deployment (the same Cloudflare Pages project would do — `build-storybook`
   already produces a static `storybook-static/`).
2. Read the 10 domain-component files for anything worth carrying into School's own components.
3. Delete `school/munaxadesignsystem`, and with it: its CI job, its `.prettierignore` and
   `package.json` lint-staged globs, and the eight stale prose references listed below.
4. Then migrate School onto the Platform (§4) — which is where the remaining value is.

### Stale references to clean up at deletion time

All are comments or documentation prose. **No file imports the package.**

`package.json` (lint-staged glob) · `.github/workflows/ci.yml` (job + path filter) ·
`.prettierignore` · `school/apps/admin/eslint.config.mjs` (comment) ·
`school/apps/admin/src/app/styleguide/page.tsx` (comment) ·
`school/munaxademo/src/app/styleguide/page.tsx` (comment) ·
`school/munaxademo/src/app/globals.css` · `school/landing/src/app/globals.css` ·
`school/landing/src/app/layout.tsx` (comments) · plus `README.md`, `docs/README.md`,
`school/README.md`, `school/docs/*` and `pnpm-workspace.yaml`.
