# Templates

Page-level compositions: whole-screen skeletons (a list screen, a record screen, a settings
screen) that a product fills in with its own data.

**This layer is intentionally empty today.** No template has been promoted yet, because every
page-level shell currently in the codebase is product-specific — Munaxa's `AppShell` carries its
navigation model, its permission gating and its academic-year switcher, none of which is
reusable. Publishing a stripped-down copy of it would be a placeholder, not a template.

## When to add one

Promote a template only once **two products** need the same screen skeleton. Until then a
page shell belongs to the product that owns it. The trigger is real duplication, not
anticipation of it.

## Rules for a template

- Same rules as `ui/components/` and `ui/patterns/`: no product terminology, no business logic, no
  data fetching, no routing library.
- Everything variable arrives through props or slots (`ReactNode`), including every string.
- Compose from `ui/components/` and `ui/patterns/`; a template never re-implements a primitive.
- Export it from `ui/templates/index.ts` and re-export from the package root barrel.
