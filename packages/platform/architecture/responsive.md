# Responsive design

## Breakpoints

One scale, shared by every product, defined in `tokens/breakpoints/index.ts` and mirrored as
`--axa-bp-*`. These are Tailwind's defaults, deliberately unchanged — a custom breakpoint scale
buys nothing and costs every developer their existing intuition.

| Token | Width    | The device class it actually means      |
| ----- | -------- | --------------------------------------- |
| `sm`  | 640px    | Large phone, landscape phone            |
| `md`  | 768px    | Tablet portrait                         |
| `lg`  | 1024px   | Tablet landscape, small laptop          |
| `xl`  | 1280px   | Laptop, desktop                         |
| `2xl` | 1536px   | Large desktop                           |

Never write a raw width. `sm:` … `2xl:`, or a container query. An arbitrary value like
`min-[880px]:` is a signal that the component is doing layout that belongs to its parent.

## Mobile-first, always

Unprefixed classes are the small-screen state; every prefixed class widens it. This is not a
style preference — it is the only direction that degrades safely, because an unstyled wide
viewport is usable and an unstyled narrow one is not.

```tsx
// Right: base is narrow, breakpoints widen.
<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" />

// Wrong: base assumes a desktop, breakpoints undo it.
<div className="grid grid-cols-4 gap-3 max-md:grid-cols-1" />
```

## Who owns layout

**A platform component owns its internal layout and nothing outside its own box.** It never
sets its own width, margin, grid placement or position in a page.

```tsx
// Right: the product places it.
<div className="grid gap-4 md:grid-cols-3">
  <StatCard … />
</div>

// Wrong: the component decides it is one third of something.
function StatCard() { return <div className="w-1/3 mb-6" …/> }
```

This is why every component forwards `className`: it is the seam through which the product does
its half of the job. A component that needs to know the page layout to look right has the wrong
API.

## Density

Density is a *product* decision — an admin console packs more into a row than a marketing page,
and both are correct. The platform therefore ships **one** comfortable default and lets the
product tighten it through `className`, rather than shipping a `density` prop that every
component would have to thread through.

The exception is tabular data, where density is a property of the table rather than the page;
if a `density` prop is ever added, it belongs on `Table` alone.

## RTL

Every AXA product is bidirectional. **Logical properties only:**

| Use                                          | Never                          |
| -------------------------------------------- | ------------------------------ |
| `ps-*` `pe-*` `ms-*` `me-*`                   | `pl-*` `pr-*` `ml-*` `mr-*`    |
| `text-start` `text-end`                       | `text-left` `text-right`       |
| `border-s` `border-e` `rounded-s-*`           | `border-l` `border-r`          |
| `start-*` `end-*`                             | `left-*` `right-*`             |

Flexbox and grid are direction-aware already, so `justify-between` and `gap-*` need no thought.
Icons that encode direction (chevrons, arrows) must flip: `rtl:rotate-180` or a mirrored icon.
Numbers, dates and code do **not** flip.

Test every new component with `dir="rtl"` on a parent before opening a PR. It takes ten seconds
and catches almost every violation.

## Overflow

Wide content — tables, code blocks, diagrams — scrolls inside its own container. The page body
must never scroll horizontally at any width.

```tsx
<div className="overflow-x-auto">
  <Table>…</Table>
</div>
```

## Touch targets

Interactive elements are at least 44×44 CSS pixels on touch pointers. Where a design needs a
visually smaller control, keep the visual size and extend the hit area with padding or an
`::after` overlay rather than shrinking the target.
