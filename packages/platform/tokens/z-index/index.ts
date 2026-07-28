/** Munaxa named z-index layering scale — keeps overlay stacking consistent and ad-hoc-free. */
export const zIndex = {
  base: 0,
  sticky: 10,
  dropdown: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;

export type ZIndex = typeof zIndex;
export type ZIndexToken = keyof typeof zIndex;
