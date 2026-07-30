/**
 * The ECharts theme, read from the live theme contract.
 *
 * This is the whole reason the platform owns charting rather than each product wiring ECharts up
 * itself. A chart's colours are not decoration — they are the product's brand, and they have to
 * match the badge next to the chart, flip with dark mode, and change when a different product
 * imports a different palette. Hard-coding a hex list in a chart config guarantees that at least
 * one of those three stops being true.
 *
 * So nothing here contains a colour. Every value is read off the *document* at build time with
 * `getComputedStyle`, which means it is whatever the theme currently resolves `--chart-3` or
 * `--muted-foreground` to. Switch the theme, switch the scheme, and rebuilding the theme object
 * produces the right answer with no chart knowing anything happened.
 */

/** Semantic roles a chart needs from the theme contract. */
export interface ChartTheme {
  /** The categorical series palette, `--chart-1` through `--chart-10`. */
  palette: string[];
  foreground: string;
  mutedForeground: string;
  border: string;
  background: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  fontFamily: string;
}

const CHART_ROLE_COUNT = 10;

/**
 * `currentColor` is the fallback everywhere, and there is not a hex in this file.
 *
 * That is not just house style. A hardcoded fallback colour is a colour that ships: it looks
 * plausible in the one theme it was picked against and quietly wrong in the other three, and
 * nothing ever flags it because the chart still renders. Inheriting instead means a role that
 * somehow went missing from the contract shows up as obviously unstyled rather than as a slightly
 * wrong grey — and the contract validation in CI would have failed long before that anyway.
 */
const INHERIT = 'currentColor';

function readVar(styles: CSSStyleDeclaration, name: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value === '' ? INHERIT : value;
}

/**
 * Snapshot the theme currently applied to `element` (the document root by default).
 *
 * With no document there is nothing to read — and nothing to draw either, since ECharts only ever
 * initialises on the client. The empty palette makes that state explicit instead of inventing
 * colours that would never be seen.
 */
export function readChartTheme(element?: Element | null): ChartTheme {
  const target = element ?? (typeof document === 'undefined' ? null : document.documentElement);

  if (!target || typeof getComputedStyle === 'undefined') {
    return {
      palette: [],
      foreground: INHERIT,
      mutedForeground: INHERIT,
      border: INHERIT,
      background: 'transparent',
      popover: 'transparent',
      popoverForeground: INHERIT,
      primary: INHERIT,
      fontFamily: 'inherit',
    };
  }

  const styles = getComputedStyle(target);
  return {
    // A role the theme does not define is dropped rather than filled in: ECharts cycles whatever
    // palette it is given, so nine real colours beat ten with an impostor in the middle.
    palette: Array.from({ length: CHART_ROLE_COUNT }, (_, index) =>
      styles.getPropertyValue(`--chart-${index + 1}`).trim(),
    ).filter((color) => color !== ''),
    foreground: readVar(styles, '--foreground'),
    mutedForeground: readVar(styles, '--muted-foreground'),
    border: readVar(styles, '--border'),
    background: 'transparent',
    popover: readVar(styles, '--popover'),
    popoverForeground: readVar(styles, '--popover-foreground'),
    primary: readVar(styles, '--primary'),
    fontFamily: styles.getPropertyValue('--font-sans').trim() || 'inherit',
  };
}

/**
 * Turn a theme snapshot into the ECharts theme object.
 *
 * Typed loosely on purpose: ECharts' own theme shape is a deep partial of every option in the
 * library, and pinning it here would mean re-declaring hundreds of fields to describe the dozen
 * this cares about.
 */
export function toEChartsTheme(theme: ChartTheme): Record<string, unknown> {
  const axis = {
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { lineStyle: { color: theme.border } },
    axisLabel: { color: theme.mutedForeground },
    splitLine: { lineStyle: { color: theme.border, opacity: 0.5 } },
  };

  return {
    ...(theme.palette.length > 0 ? { color: theme.palette } : {}),
    backgroundColor: theme.background,
    textStyle: { fontFamily: theme.fontFamily, color: theme.foreground },
    title: {
      textStyle: { color: theme.foreground },
      subtextStyle: { color: theme.mutedForeground },
    },
    legend: { textStyle: { color: theme.mutedForeground } },
    tooltip: {
      backgroundColor: theme.popover,
      borderColor: theme.border,
      textStyle: { color: theme.popoverForeground },
      // The crosshair is a pointer, not a series: it must not take a palette colour.
      axisPointer: {
        lineStyle: { color: theme.border },
        crossStyle: { color: theme.border },
        label: { backgroundColor: theme.primary },
      },
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
  };
}
