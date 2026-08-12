import { createRequire } from 'node:module';
import { type Page } from 'playwright';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** WCAG 1.4.3: large text is ≥24px, or ≥18.66px when bold. Everything else needs 4.5:1. */
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;

export interface Measured {
  readonly found: boolean;
  readonly text: string;
  readonly classes: string;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly colour: string;
  readonly background: readonly string[];
  readonly opacity: number;
  readonly ratio: number;
  readonly threshold: number;
  readonly passes: boolean;
}

/**
 * Measure the composited contrast of the first element matching `selector`.
 *
 * Carried over from Phase 8.3's Docs instrument, and wrong twice before it was right. Colours are
 * composited through a 1×1 canvas rather than parsed: a faded colour resolves to `oklab(… / 0.7)`,
 * and an `rgba()` regex silently yields black and reports 21:1. The background is the whole
 * painting stack up to the first opaque layer, because a `Badge` sits on `bg-primary/15` over a
 * card and painting that translucent layer alone reports a luminance no reader ever sees.
 */
export async function measure(page: Page, selector: string): Promise<Measured> {
  return page.evaluate(
    ({ sel, largePx, largeBoldPx }) => {
      const empty = {
        found: false,
        text: '',
        classes: '',
        fontSizePx: 0,
        fontWeight: 0,
        colour: '',
        background: [] as string[],
        opacity: 1,
        ratio: 0,
        threshold: 4.5,
        passes: false,
      };
      const element = document.querySelector(sel);
      if (element === null) return empty;

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');

      const pixel = (layers: readonly string[], fg?: string, alpha = 1): readonly number[] => {
        if (ctx === null) return [0, 0, 0];
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, 1, 1);
        for (const layer of layers) {
          ctx.fillStyle = layer;
          ctx.fillRect(0, 0, 1, 1);
        }
        if (fg !== undefined) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = fg;
          ctx.fillRect(0, 0, 1, 1);
          ctx.globalAlpha = 1;
        }
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
      };

      const luminance = (rgb: readonly number[]): number => {
        const ch = (v: number): number => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * ch(rgb[0] ?? 0) + 0.7152 * ch(rgb[1] ?? 0) + 0.0722 * ch(rgb[2] ?? 0);
      };

      const translucent = (value: string): boolean =>
        /\/\s*0?\.\d+\s*\)|rgba\([^)]*,\s*0?\.\d+\s*\)|color-mix\(/.test(value);

      const layers: string[] = [];
      let node: Element | null = element;
      while (node !== null) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') {
          layers.push(colour);
          if (!translucent(colour)) break;
        }
        node = node.parentElement;
      }
      layers.push(getComputedStyle(document.body).backgroundColor);
      const background = layers.reverse();

      let opacity = 1;
      let walk: Element | null = element;
      while (walk !== null) {
        opacity *= Number(getComputedStyle(walk).opacity);
        walk = walk.parentElement;
      }

      const style = getComputedStyle(element);
      const back = luminance(pixel(background));
      const front = luminance(pixel(background, style.color, opacity));
      const [hi, lo] = front > back ? [front, back] : [back, front];
      const ratio = Number((((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)).toFixed(2));

      const fontSizePx = Number.parseFloat(style.fontSize);
      const fontWeight = Number(style.fontWeight);
      const large = fontSizePx >= largePx || (fontSizePx >= largeBoldPx && fontWeight >= 700);
      const threshold = large ? 3 : 4.5;

      return {
        found: true,
        text: (element.textContent ?? '').trim().slice(0, 40),
        classes: element.className.toString().slice(0, 200),
        fontSizePx,
        fontWeight,
        colour: style.color,
        background,
        opacity: Number(opacity.toFixed(3)),
        ratio,
        threshold,
        passes: ratio >= threshold,
      };
    },
    { sel: selector, largePx: LARGE_PX, largeBoldPx: LARGE_BOLD_PX },
  );
}

export interface AxeOutcome {
  readonly violations: readonly string[];
  readonly incomplete: readonly string[];
}

/**
 * Run axe over the rendered story with `color-contrast` **enabled**.
 *
 * `incomplete` is returned alongside `violations` deliberately. axe computes a ratio only where it
 * can resolve an opaque background and files everything else as "needs review"; Phase 8.3 found an
 * `Avatar` failing at 4.16:1 that axe reported as incomplete rather than as a violation. A harness
 * that watched only `violations` would have called that page clean.
 */
export async function axeOn(page: Page, selector = 'document'): Promise<AxeOutcome> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (sel) => {
    /*
     * The whole document, not `#storybook-root` — Phase 8.4.
     *
     * Scoping to the story root looked tidy and silently skipped every portalled layer: dialogs,
     * popovers, dropdowns and the command palette all render outside it. The `Command` group
     * heading measured 2.79:1 by direct measurement while a root-scoped axe run reported the same
     * story clean, which is the same shape of false confidence Phase 8.3 found in a suppression.
     */
    const target = sel === 'document' ? document : (document.querySelector(sel) ?? document);
    const result = await (
      window as unknown as {
        axe: {
          run: (
            ctx: Element | Document,
            options: unknown,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { target: string[] }[] }[];
            incomplete: { id: string; nodes: { target: string[] }[] }[];
          }>;
        };
      }
    ).axe.run(target, { runOnly: ['color-contrast'] });
    return {
      violations: result.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.impact}: ${v.id} ${n.target.join(' ')}`.slice(0, 140)),
      ),
      incomplete: result.incomplete.flatMap((i) =>
        i.nodes.map((n) => `${i.id} ${n.target.join(' ')}`.slice(0, 140)),
      ),
    };
  }, selector);
}
