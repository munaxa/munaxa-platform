'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts';
import { readChartTheme, toEChartsTheme } from './theme.js';

/**
 * Owning an ECharts instance from React.
 *
 * ECharts is imperative and React is not, so the interesting part of a wrapper is the lifecycle,
 * not the rendering. Four things have to be right or a chart misbehaves in ways that look like a
 * styling bug:
 *
 * 1. **It cannot exist on the server.** ECharts measures a DOM node to size itself, so it is
 *    created in an effect, never during render.
 * 2. **It has to be told when its box changes.** ECharts sizes once at init and never again on its
 *    own — a sidebar collapsing or a tab becoming visible leaves the chart at its old width with
 *    the series clipped. A `ResizeObserver` is the fix, and it is the single most common thing
 *    missing from a hand-rolled wrapper.
 * 3. **It has to be told when the theme changes.** A theme is baked in at `init`, so switching to
 *    dark mode has to dispose and recreate. Watching the root element's attributes catches the
 *    product's own toggle without the product having to tell us.
 * 4. **It has to be disposed.** Every instance holds a canvas or an SVG root and its own resize
 *    bookkeeping; not disposing is a genuine leak in a single-page app.
 */

export type ChartRenderer = 'svg' | 'canvas';

export interface UseChartOptions {
  containerRef: RefObject<HTMLElement | null>;
  option: EChartsCoreOption;
  /**
   * SVG by default. It stays crisp at any pixel density, prints, and can be inspected; canvas is
   * the right call only once a series has tens of thousands of points.
   */
  renderer?: ChartRenderer;
  loading?: boolean;
  /**
   * Merge the option into the existing one rather than replacing it. Off by default: a replace is
   * predictable, and a merge silently keeps series a caller thought they had removed.
   */
  merge?: boolean;
  onInit?: (instance: ECharts) => void;
}

export function useChart({
  containerRef,
  option,
  renderer = 'svg',
  loading = false,
  merge = false,
  onInit,
}: UseChartOptions): RefObject<ECharts | null> {
  const instanceRef = useRef<ECharts | null>(null);
  const [themeKey, setThemeKey] = useState(0);
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;

  // The instance arrives asynchronously, one or more commits after the effects below have already
  // run. Without these the very first `setOption` would land on a null instance and be dropped —
  // and a chart whose option never changes again (most of them) would stay blank forever. The refs
  // are what the init callback replays from.
  const latest = useRef({ option, merge, loading });
  latest.current = { option, merge, loading };

  // Recreate on a theme change. `init` bakes the theme in, so there is nothing to update in place.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setThemeKey((key) => key + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let instance: ECharts | null = null;
    let observer: ResizeObserver | null = null;

    // Imported lazily so that ECharts — which is large, and which touches the DOM — never lands in
    // a server bundle or in the initial payload of a page that has no chart on it.
    void import('echarts').then((echarts) => {
      if (disposed || !containerRef.current) return;
      const themeName = `axa-${themeKey}`;
      echarts.registerTheme(themeName, toEChartsTheme(readChartTheme(containerRef.current)));
      instance = echarts.init(containerRef.current, themeName, { renderer });
      instanceRef.current = instance;

      // Replay the current props onto the fresh instance before anything else touches it.
      instance.setOption(latest.current.option, { notMerge: !latest.current.merge });
      if (latest.current.loading) {
        instance.showLoading('default', { showSpinner: false, maskColor: 'transparent' });
      }
      onInitRef.current?.(instance);

      observer =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => instance?.resize());
      observer?.observe(containerRef.current);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      instance?.dispose();
      instanceRef.current = null;
    };
  }, [containerRef, renderer, themeKey]);

  useEffect(() => {
    // `notMerge` is inverted from `merge` deliberately — the prop reads the way a caller thinks.
    instanceRef.current?.setOption(option, { notMerge: !merge });
  }, [option, merge]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (loading) instance.showLoading('default', { showSpinner: false, maskColor: 'transparent' });
    else instance.hideLoading();
  }, [loading]);

  return instanceRef;
}
