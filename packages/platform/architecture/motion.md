# Motion

Motion exists to explain a change of state — where something came from, what just appeared,
what is still loading. Motion that decorates without explaining is noise, and noise is a
usability cost paid by everyone on every visit.

## The scale

`tokens/motion/index.ts`, mirrored as `--axa-duration-*` / `--axa-easing-*`. One scale for
every product; a product may not add a step.

| Duration  | Value   | For                                                          |
| --------- | ------- | ------------------------------------------------------------ |
| `instant` | `0ms`   | No transition. State that must feel direct.                   |
| `fast`    | `120ms` | Hover, focus, small colour and opacity changes                |
| `normal`  | `200ms` | Most things: dropdowns, tooltips, tab switches, accordions     |
| `slow`    | `300ms` | Large surfaces entering: dialogs, drawers, sheets              |

| Easing     | Curve                          | For                                          |
| ---------- | ------------------------------ | -------------------------------------------- |
| `standard` | `cubic-bezier(0.2, 0, 0, 1)`   | Anything that moves within the viewport       |
| `enter`    | `cubic-bezier(0, 0, 0, 1)`     | Something arriving — decelerates into place   |
| `exit`     | `cubic-bezier(0.3, 0, 1, 1)`   | Something leaving — accelerates away          |

Nothing in the platform animates for longer than 300ms. If a transition needs more time to read,
it is moving too far.

## What to animate

Only **`transform`** and **`opacity`**. Both are composited by the GPU and cost nothing per
frame.

Animating `width`, `height`, `top`, `left`, `margin` or `padding` forces layout on every frame
and drops frames on exactly the low-end devices where the experience is already worst. When a
size change must animate, do it with `transform: scale()` or animate a `grid-template-rows`
`0fr → 1fr`, never a pixel height.

## Reduced motion is a floor, not a feature

`prefers-reduced-motion: reduce` is an accessibility setting: for some people, motion causes
nausea, dizziness or migraine. Honouring it is not optional.

**The rule: when reduced motion is requested, the end state must still be reached — instantly.**
Never gate content or a state change behind an animation that a reduced-motion user will not
receive.

```css
/* The pattern used by ui/patterns/motion/motion.css. */
.reveal {
  opacity: 1;
  transform: none;
} /* end state is the default */

@media (prefers-reduced-motion: no-preference) {
  .js .reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: …;
  }
  .js .reveal[data-shown='true'] {
    opacity: 1;
    transform: none;
  }
}
```

Two properties of that pattern are what make it correct, and both are required of any new
motion:

1. **The visible state is the default.** The animation opts *in* on top of it.
2. **It also requires JavaScript** (`.js`, set by the app's boot script). No JS, no hidden
   content.

`CountUp` follows the same rule from the other direction: it renders its final value first and
only counts up if motion is welcome.

## Where motion lives

- **Component-internal transitions** (a hover colour, a focus ring, an open/close) are written
  in the component with Tailwind's `transition-*` utilities and the duration scale.
- **Reusable motion behaviours** are patterns: `ui/patterns/motion/`. `Reveal` and `CountUp`
  live there with their stylesheet, `ui/patterns/motion/motion.css`, exported as
  `@axa/platform/css/motion` — a product that uses the pattern imports the stylesheet.
- **Page transitions and route animations belong to the product.** They depend on the router,
  which the platform does not know about.

## Loading

Prefer showing structure to showing a spinner: a skeleton that matches the shape of the content
reduces perceived wait and prevents layout shift. Use `Spinner` for indeterminate waits under
about a second, and for inline states inside a button.

Never animate a layout shift. Content arriving must not push what the user is already reading.
