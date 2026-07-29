/**
 * Opacity scale — the named alpha steps the system uses for disabled states, scrims, hover
 * washes and muted overlays.
 *
 * Values are unitless strings so they drop straight into `opacity`, `rgb(... / <alpha>)` and
 * Tailwind's `/<alpha>` colour modifier without conversion.
 */
export const opacity = {
  0: '0',
  5: '0.05',
  10: '0.1',
  20: '0.2',
  30: '0.3',
  40: '0.4',
  50: '0.5',
  60: '0.6',
  70: '0.7',
  80: '0.8',
  90: '0.9',
  95: '0.95',
  100: '1',
} as const;

export type Opacity = typeof opacity;
export type OpacityToken = keyof typeof opacity;
