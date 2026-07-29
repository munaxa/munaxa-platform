import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import './preview.css';

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
  decorators: [withDirection, withScheme],
  globalTypes: {
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
        order: [
          'Foundations',
          'Primitives',
          'Forms',
          'Feedback',
          'Navigation',
          'Layout',
          'Data Display',
          'Patterns',
        ],
      },
    },
  },
};

export default preview;
