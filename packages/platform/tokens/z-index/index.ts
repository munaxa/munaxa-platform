/**
 * Named z-index layering scale — keeps overlay stacking consistent and ad-hoc-free.
 *
 * The steps are spaced an order of magnitude apart so an application can slot something between
 * two layers without renumbering the scale or inventing a raw `z-[9999]`.
 */
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 1100,
  modal: 1200,
  popover: 1300,
  toast: 1400,
  max: 1500,
} as const;

export type ZIndex = typeof zIndex;
export type ZIndexToken = keyof typeof zIndex;
