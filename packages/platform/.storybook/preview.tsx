import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import './preview.css';
import {
  applyBrand,
  installBrandThemes,
  BRAND_ITEMS,
  DEFAULT_BRAND,
  type BrandId,
} from './brand-themes.js';

// Installed at module scope, before the first story paints: a brand applied from an effect would
// show one frame of unthemed colour on every page load.
installBrandThemes();
applyBrand(DEFAULT_BRAND);

/**
 * Brand, colour scheme and writing direction are global toolbar controls rather than per-story
 * props. Every component in the platform has to work under all four product brands, in dark mode
 * and in RTL, so each must be one click away in review — a requirement nobody checks is a
 * requirement nobody meets.
 *
 * The Brand control is the load-bearing one for this documentation site. There is one component
 * library and one set of stories; switching brand re-renders all of them purely by changing which
 * palette the semantic tokens resolve from. If a component looked "School-branded" before, that
 * was the docs lying about the architecture, not the component knowing about School.
 */
const withBrand: Decorator = (Story, context) => {
  const brand = context.globals.brand as BrandId;
  useEffect(() => {
    applyBrand(brand);
  }, [brand]);
  return <Story />;
};

/**
 * Colour scheme and writing direction are global toolbar controls rather than per-story props.
 * Every component in the platform has to work in dark mode and in RTL, so both must be one click
 * away in review — a requirement nobody checks is a requirement nobody meets.
 */
const withScheme: Decorator = (Story, context) => {
  const scheme = context.globals.scheme as 'light' | 'dark';
  useEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark');
  }, [scheme]);
  return <Story />;
};

const withDirection: Decorator = (Story, context) => {
  const dir = context.globals.direction as 'ltr' | 'rtl';
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
  }, [dir]);
  return (
    <div dir={dir} className="bg-background text-foreground p-6">
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withDirection, withScheme, withBrand],
  globalTypes: {
    brand: {
      description: 'Product brand theme',
      defaultValue: DEFAULT_BRAND,
      toolbar: {
        title: 'Brand',
        icon: 'paintbrush',
        items: BRAND_ITEMS,
        dynamicTitle: true,
      },
    },
    scheme: {
      description: 'Colour scheme',
      defaultValue: 'light',
      toolbar: {
        title: 'Scheme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    direction: {
      description: 'Writing direction',
      defaultValue: 'ltr',
      toolbar: {
        title: 'Direction',
        icon: 'transfer',
        items: [
          { value: 'ltr', title: 'LTR' },
          { value: 'rtl', title: 'RTL (العربية)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: { expanded: true, matchers: { color: /(background|colou?r)$/i } },
    a11y: {
      // Surface violations in the panel during review; `pnpm test` is what actually gates them.
      test: 'todo',
    },
    options: {
      storySort: {
        // Foundations reads as an argument, so it is ordered as one: what the system is, then the
        // four brands that prove it, then the values everything else is built from.
        order: [
          'Foundations',
          [
            'Overview',
            'Themes',
            'Tokens',
            'Typography',
            'Icons',
            'Spacing',
            'Radius',
            'Elevation',
            'Motion',
            'Breakpoints',
            'Responsive',
          ],
          'Primitives',
          'Forms',
          'Feedback',
          'Navigation',
          'Layout',
          'Data Display',
          'Data',
          'Date',
          'Workspace',
          'Shell',
          'Patterns',
        ],
      },
    },
  },
};

export default preview;
