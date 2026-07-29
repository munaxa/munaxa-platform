import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

function Harness({ initial = 'one', disabled }: { initial?: string; disabled?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <TabsTrigger value="one" disabled={disabled === 'one'}>
          One
        </TabsTrigger>
        <TabsTrigger value="two" disabled={disabled === 'two'}>
          Two
        </TabsTrigger>
        <TabsTrigger value="three" disabled={disabled === 'three'}>
          Three
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel one</TabsContent>
      <TabsContent value="two">Panel two</TabsContent>
      <TabsContent value="three">Panel three</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('renders tablist / tab / tabpanel with wired-up ids', () => {
    render(<Harness />);
    const tab = screen.getByRole('tab', { name: 'One' });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('renders only the active panel', () => {
    render(<Harness />);
    expect(screen.getByText('Panel one')).toBeInTheDocument();
    expect(screen.queryByText('Panel two')).not.toBeInTheDocument();
  });

  it('is a single tab stop — only the selected tab is tabbable', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection with the arrow keys and wraps at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
    expect(screen.getByText('Panel two')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
  });

  it('reverses arrow direction in RTL', async () => {
    document.dir = 'rtl';
    try {
      const user = userEvent.setup();
      render(<Harness />);
      await user.tab();
      await user.keyboard('{ArrowRight}');
      // In RTL the visual "right" is the previous tab, so this wraps backwards to the last one.
      expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
    } finally {
      document.dir = 'ltr';
    }
  });

  it('skips disabled tabs during arrow navigation', async () => {
    const user = userEvent.setup();
    render(<Harness disabled="two" />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
  });

  it('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Three' }));
    expect(screen.getByText('Panel three')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true');
  });

  it('throws a useful error when a subcomponent is used outside Tabs', () => {
    // React logs the error boundary trace; silence it for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TabsTrigger value="x">X</TabsTrigger>)).toThrow(
      /must be used within <Tabs>/,
    );
    spy.mockRestore();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});
