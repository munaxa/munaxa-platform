# Contributing to `@axa/platform`

**This document is the mandatory standard for all work in `platform/`, human or AI-assisted.**

The platform is consumed by every AXA product. A mistake here is a mistake in Munaxa, Workaxa,
Inkaxa and everything that follows, so the bar is deliberately higher than in a product folder.
When this document and a habit disagree, this document wins.

This file is the operational checklist for changing the platform. It sits underneath the
repository-wide rulebook, [`/PLATFORM_ENGINEERING_STANDARDS.md`](../PLATFORM_ENGINEERING_STANDARDS.md),
which governs all contribution and wins on any conflict. The reasoning behind the rules lives in
[`architecture/`](./architecture/README.md); every document in the repository is indexed at
[`/docs/README.md`](../docs/README.md).

---

## 0. Before you write anything

Answer these three, in order. A "no" at any step means stop.

1. **Does it already exist?** Search `ui/` first. Extending a component beats adding one.
2. **Do two products need it?** One consumer means it belongs in that product. See the
   [component lifecycle](./architecture/README.md#component-lifecycle).
3. **Can you describe its API without naming a business entity?** If the natural prop name is
   `students`, `invoices` or `tenants`, it is a product component.

Most good contributions to the platform are *edits*, not new files.

---

## 1. Folder conventions

```
platform/
├── tokens/<scale>/index.ts   structural values (+ CSS mirror in tokens/css/primitives.css)
├── typography/index.ts       the type scale
├── themes/base/base.css      the contract — roles only, never colour, never a product name
├── themes/<product>/         palette.css · brand.ts · index.css
├── icons/index.ts            the single icon source
├── ui/lib/                   cn() and framework-agnostic helpers
├── ui/hooks/                 UI-only React hooks
├── ui/components/<category>/ one control per file
├── ui/patterns/              compositions of components
├── ui/templates/             whole-screen skeletons (empty by design)
├── assets/<product>/         logos · favicon · social · illustrations
├── architecture/             the reasoning
└── scripts/                  the validators CI runs
```

- Put a component in the category that matches **what it is for the user**, not what it is made
  of: a searchable picker is `forms/`, even though it renders a listbox.
- New categories need a discussion. Six is enough for a long time.
- Never add a folder outside this tree without updating `tsconfig.json`, `package.json`
  `exports`/`files`, and this document.

## 2. Naming conventions

Full reference: [`architecture/naming-conventions.md`](./architecture/naming-conventions.md).

- Files `kebab-case`, one component each, named after their export: `stat-card.tsx` → `StatCard`.
- Hooks `use-thing.ts` → `useThing`, with `UseThingOptions` / `UseThingResult`.
- Props type is `<Component>Props` and is **exported**.
- Subcomponents are namespaced: `CardHeader`, never `Header`.
- Names describe **role**, never appearance and never domain. `--destructive` not `--red`,
  `EntityPicker` not `StudentPicker`.
- CSS: semantic roles are `--<role>`; structural tokens are `--axa-<scale>-<step>`. A palette
  containing an `--axa-` variable fails CI.

## 3. Component conventions

Full reference: [`architecture/component-principles.md`](./architecture/component-principles.md).

Every component:

- [ ] Contains no product vocabulary in its name, props, types, defaults or comments.
- [ ] Contains no business logic, validation, permission check or workflow state.
- [ ] Fetches nothing. Data arrives as props; loaders are injected as functions.
- [ ] Imports no router and no framework navigation. It takes `href` / `onClick`.
- [ ] Ships no copy. Every user-visible string is a prop.
- [ ] Uses **only** theme-contract classes for colour — no hex, `rgb()` or `hsl()` anywhere.
- [ ] Uses token-backed utilities for spacing, radius, z-index and duration — no magic numbers.
- [ ] Forwards `className` and merges it with `cn()`.
- [ ] Extends the underlying element's props so `aria-*`, `data-*`, `type` and refs work.
- [ ] Declares `'use client'` if it has state, effects or handlers.
- [ ] Is exported from its category barrel **and** the root `index.ts`.

Prefer composition to configuration. A boolean prop that switches on a whole second behaviour
is two components.

## 4. Accessibility requirements

Full reference: [`architecture/accessibility.md`](./architecture/accessibility.md).
Target is **WCAG 2.2 AA at merge time** — not as a follow-up.

- [ ] Semantic HTML first; ARIA only for what HTML cannot express.
- [ ] Fully keyboard operable. Composite widgets are one tab stop with arrow-key navigation.
- [ ] `Escape` closes any dismissible layer; modals trap focus and restore it on close.
- [ ] Visible `focus-visible` ring using the theme's `--ring`. Never remove an outline without
      replacing it.
- [ ] Everything has an accessible name — `<label>` via `Field`, `aria-label` on icon buttons,
      `scope` on `<th>`, `alt` on images, `aria-hidden` on decorative icons.
- [ ] Colour is never the only signal for status.
- [ ] Contrast ≥ 4.5:1 body / 3:1 large text and control boundaries, in **both** schemes.
- [ ] Motion respects `prefers-reduced-motion`, and the end state is reachable without it.
- [ ] Touch targets ≥ 44×44 CSS px.
- [ ] Logical properties only (`ps-`/`pe-`/`ms-`/`me-`/`text-start`/`border-s`), so RTL works.

Manual check before opening a PR: tab through it, set `dir="rtl"` on a parent, zoom to 200%,
toggle `.dark`.

## 5. Testing requirements

The platform is a UI library with no product data, so tests are targeted rather than broad.

**Required:**

- [ ] `pnpm validate` passes — the theme contract and token mirrors are machine-checked and are
      non-negotiable. Adding a role to `base.css` without supplying it in every palette fails.
- [ ] `pnpm turbo run build lint typecheck --filter=@axa/platform` passes.
- [ ] Every consuming product still builds: `pnpm build`.
- [ ] For any change that touches CSS output, diff the emitted stylesheet before and after:

      ```bash
      cd munaxa/apps/admin && npx @tailwindcss/cli -i src/app/globals.css -o /tmp/after.css
      diff <(sort /tmp/before.css) <(sort /tmp/after.css)
      ```

      An empty diff is proof of no visual change. Attach it to the PR for any refactor that
      claims to be non-visual.

**Required for behaviour:** a component with non-trivial logic — keyboard handling, focus
management, state machines — ships unit tests for that logic. `EntityPicker`'s arrow/enter/escape
handling is the canonical example of code that must not regress silently.

**Not required:** snapshot tests of markup. They fail on every legitimate change and pass on
every broken one.

## 6. Import rules

Full reference: [`architecture/import-rules.md`](./architecture/import-rules.md).

- [ ] Products import from a public entry point (`@axa/platform`, `@axa/platform/icons`, …) —
      **never** a deep file path, never a relative path into `platform/`.
- [ ] The platform imports **nothing** from any product. No `@munaxa/*`, no path climbing out
      of `platform/`.
- [ ] No `next/*`, no router, no data client, no i18n library inside the platform.
- [ ] `lucide-react` is imported only by `icons/index.ts`.
- [ ] Internal imports are relative with a `.js` extension, and run strictly downward:
      `templates → patterns → components → hooks/lib → icons → typography/tokens`.
- [ ] Barrels re-export only. No app-local re-export barrels in products.

## 7. Theming rules

Full reference: [`architecture/theming.md`](./architecture/theming.md).

- [ ] `themes/base/base.css` declares roles and binds them to Tailwind. It contains **no colour
      value and no product name**. CI checks both.
- [ ] Adding a role means adding it to `base.css` **and** to every palette, in the same commit.
- [ ] `:root` in a palette supplies every role; `.dark` overrides the subset that changes.
- [ ] A palette may not invent a role and may not redefine a structural scale.
- [ ] Structural tokens change in **both** mirrors — `tokens/<scale>/index.ts` and
      `tokens/css/primitives.css` — or in neither.
- [ ] Raw hexes live only in `themes/<product>/brand.ts`, for surfaces that cannot read CSS
      variables (email, OG images, favicons, PDF).
- [ ] No component reads `themes.<product>` or branches on a product.

## 8. Review checklist

The reviewer's job, in order. Anything unchecked blocks the merge.

**Placement**

- [ ] Two real consumers justify this being in the platform.
- [ ] It is in the right layer (component / pattern / template) and the right category.
- [ ] Nothing product-specific came along with it.

**Contract**

- [ ] No product vocabulary anywhere, including comments.
- [ ] No hardcoded colour; no magic spacing/radius/z-index.
- [ ] No router, no fetch, no i18n, no product import.
- [ ] `className` forwarded; underlying element props extended; props type exported.

**Accessibility** — the §4 list, verified by actually using it, not by reading it.

**Theming** — the §7 list; `pnpm validate` green.

**Blast radius**

- [ ] Every consuming product was checked, and any behavioural change is called out explicitly
      in the PR description.
- [ ] A breaking prop change updates all consumers in the same commit.
- [ ] No component was forked to avoid a breaking change.

**Hygiene**

- [ ] Exported from the category barrel and the root barrel.
- [ ] Dead code deleted, not commented out or left "for later".
- [ ] No placeholder implementations, no `TODO` standing in for a decision.
- [ ] Docs updated when a rule, folder or entry point changed.

## 9. Definition of Done

A change is done when **all** of the following are true. Not most.

1. `pnpm validate` — theme contract and token mirrors green.
2. `pnpm build` — every workspace package and every product builds.
3. `pnpm typecheck` — clean.
4. `pnpm lint` — clean, with no new suppressions.
5. `pnpm test` — passing.
6. `pnpm format:check` — clean.
7. The accessibility floor (§4) is met and was manually verified.
8. RTL and dark mode were manually verified.
9. Every consuming product was built and visually checked, or a stylesheet diff proves no
   visual change.
10. The component is reachable from `@axa/platform` and its props type is exported.
11. Documentation reflects reality — `architecture/`, this file and `README.md` if a rule,
    folder, entry point or token changed.
12. Nothing product-specific was added to `platform/`, and nothing shared was left behind in a
    product.

> If you cannot tick all twelve, the change is not done. Ship less, completely, rather than more,
> partially — a half-migrated shared layer is worse than no shared layer, because it is the one
> state nobody can reason about.
