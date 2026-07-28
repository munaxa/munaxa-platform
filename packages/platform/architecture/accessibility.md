# Accessibility

Target: **WCAG 2.2 Level AA**, on every component, at merge time. Accessibility is not a prop
the consumer can forget to pass and not a follow-up ticket — a component that needs an
accessibility fix later shipped broken.

The platform carries this floor for the whole ecosystem: every product inherits it for free from
every component, which is most of the argument for having a platform at all.

## The floor

### 1. Semantic HTML first

A `<button>` before a `<div role="button">`; a `<table>` before a grid of divs; `<nav>`,
`<main>`, `<ul>` where they apply. Native elements bring focus, keyboard behaviour, form
participation and screen-reader semantics that no amount of ARIA fully replaces.

**ARIA is for what HTML cannot express.** The first rule of ARIA is not to use ARIA.

### 2. Keyboard

Everything usable with a mouse is usable with a keyboard.

- Tab order follows visual order. No positive `tabIndex`.
- `Enter` / `Space` activate; `Escape` closes any dismissible layer.
- Arrow keys move within a composite widget (tabs, radio group, listbox, menu) — and the widget
  is **one** tab stop, not one per item.
- Focus is never trapped except in a modal, and a modal always restores focus to the element
  that opened it on close.
- Nothing is reachable by keyboard while visually hidden.

`EntityPicker` is the reference implementation: a full combobox with `aria-expanded`,
`aria-controls`, `aria-activedescendant` and arrow/enter/escape handling.

### 3. Focus is always visible

Never remove an outline without replacing it. Use `focus-visible` so keyboard users get a ring
and mouse users do not, and use the theme's `--ring` role so it adapts per product and per
colour scheme.

### 4. Everything has an accessible name

- Every form control has a real `<label>` — use `Field`, which wires it up.
- An icon-only button has `aria-label`.
- Decorative icons are `aria-hidden`; meaningful ones have a text alternative.
- Images have `alt`; decorative images have `alt=""`.
- Table headers use `<th scope="col|row">`.

### 5. Contrast

4.5:1 for body text, 3:1 for large text (≥18.66px bold or ≥24px) and for the visual boundary of
UI controls. Both colour schemes. This constrains **palettes**, not components — a component
that uses `text-muted-foreground` on `bg-card` is correct by construction, and it is the
palette's job to keep that pair legible. Check any new palette against both schemes before
shipping it.

### 6. Colour is never the only signal

Status needs a label, an icon or a shape as well as a hue. `Badge` pairs its tone with text;
a chart series needs a legend, not just a colour.

### 7. Motion respects `prefers-reduced-motion`

See [motion.md](./motion.md). The end state is always reachable without animation.

### 8. Live regions for asynchronous change

Anything that appears without user action announces itself: `Toast` uses `role="status"`. Use
`aria-live="polite"` for informational updates, `assertive` only for errors that block progress.

### 9. Target size

At least 44×44 CSS pixels on touch pointers. Keep the visual size and extend the hit area with
padding rather than shrinking the target.

### 10. Bidirectional and zoom-safe

Logical properties only (see [responsive.md](./responsive.md)) so RTL works without a second
stylesheet. Layouts survive 200% zoom and a 320px viewport without horizontal page scroll.

## How to check, in order of cost

1. **Tab through it.** Can you reach and operate everything? Can you see where you are?
2. **`dir="rtl"` on a parent.** Does anything invert or collide?
3. **Zoom to 200%.** Does the page scroll horizontally?
4. **Toggle `.dark`.** Is every contrast pair still legible?
5. **Screen reader.** VoiceOver (macOS/iOS) or NVDA (Windows) on the interactive parts.
6. **Automated.** axe DevTools catches roughly a third of issues — necessary, never sufficient.

## Product responsibilities

The platform cannot supply these; every product must:

- Set `lang` and `dir` on `<html>` and keep them in sync with the active locale.
- Provide a skip link to main content.
- Manage focus across route changes.
- Write meaningful labels and error messages — the platform ships no copy.
- Maintain a sensible heading hierarchy across a page.
