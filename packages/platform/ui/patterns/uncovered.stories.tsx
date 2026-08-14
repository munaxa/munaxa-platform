import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progress, ReadinessRing } from './progress.js';
import { Stepper } from './stepper.js';
import { CountUp } from './motion/count-up.js';
import { Reveal } from './motion/reveal.js';
import { Label } from '../components/forms/label.js';
import { Radio, RadioGroup } from '../components/forms/radio.js';
import { Input } from '../components/forms/input.js';
import { Card } from '../components/layout/card.js';
import { Stack } from '../layouts/stack.js';
import { Table, THead, TBody, TR, TH, TD } from '../components/data-display/table.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/overlays/dropdown-menu.js';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '../components/overlays/popover.js';
import { Button } from '../components/primitives/button.js';

/**
 * The components the accessibility matrix could not see — Phase 8.13.
 *
 * The matrix reports "100 stories, 0 excluded" and has done since Phase 8.5. That is true of
 * *stories*, and it says nothing about a component that has none: discovery reads
 * `storybook-static/index.json`, so a component nobody wrote a story for is not excluded, it is
 * invisible. Eighteen public components were in that state — rendered by no story and by no other
 * component, so none of the 800 combinations had ever touched them.
 *
 * The first one measured, `Progress`, turned out to be shipping a `progressbar` with no accessible
 * name. That is the argument for this file: coverage that grows with the component list rather than
 * with somebody's memory.
 *
 * `story-coverage.test.ts` is the ratchet that keeps it that way, and carries the seven that
 * remain uncovered together with the reason they cannot be rendered from a story at all.
 *
 * Each story renders the states a product actually uses, because a story that renders only the
 * happy default measures only the happy default.
 *
 * `Reveal`'s companion stylesheet (`css/motion`) is deliberately not loaded here, as it is not in
 * any other story: without it `.reveal` is unstyled and the content is simply visible. That is the
 * state a reader ends up in either way — the stylesheet only hides content while `html.js` is set
 * and motion is welcome — so the matrix measures the text a person actually reads.
 */
const meta = {
  title: 'Patterns/Previously Uncovered',
  parameters: {
    docs: {
      description: {
        component:
          'Public components that had no story until Phase 8.13, and were therefore absent from ' +
          'the accessibility matrix entirely. Each renders the states a product uses.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProgressAndRings: Story = {
  render: () => (
    <Stack gap={4}>
      <Card className="p-4">
        <Stack gap={3}>
          {/* Named explicitly, which is what a product should do. */}
          <Progress value={40} label="Upload" />
          <Progress value={72} tone="success" label="Storage used" />
          <Progress value={91} tone="warning" size="sm" label="Quota" />
          <Progress value={12} tone="danger" label="Failed items" />
          {/* No label passed — the default keeps it named rather than anonymous. */}
          <Progress value={55} />
        </Stack>
      </Card>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-6">
          <ReadinessRing value={92} caption="Ready" />
          <ReadinessRing value={64} caption="In progress" />
          <ReadinessRing value={23} caption="Blocked" />
        </div>
      </Card>
    </Stack>
  ),
};

export const Steps: Story = {
  render: () => (
    <Card className="p-4">
      <Stepper
        current={1}
        steps={[
          { key: 'scope', title: 'Scope', description: 'Choose what to close' },
          { key: 'review', title: 'Review', description: 'Check the exceptions' },
          { key: 'confirm', title: 'Confirm', description: 'Sign and archive' },
        ]}
      />
    </Card>
  ),
};

export const LabelsAndRadios: Story = {
  render: () => (
    <Card className="p-4">
      <Stack gap={4}>
        <div>
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" placeholder="Why is this being closed?" />
        </div>
        <RadioGroup label="Retention">
          <Radio name="retention" value="year" label="One year" defaultChecked />
          <Radio name="retention" value="seven" label="Seven years" />
          <Radio name="retention" value="forever" label="Indefinitely" />
        </RadioGroup>
      </Stack>
    </Card>
  ),
};

/**
 * The plain semantic table. `DataGrid` is the virtualised, sortable, keyboard-navigable component
 * and it has its own stories — these six are the low-level primitives a product reaches for when
 * it wants a table and not a grid, and nothing rendered them.
 */
export const TablePrimitives: Story = {
  render: () => (
    <Table>
      <THead>
        <TR>
          <TH>Library</TH>
          <TH>Owner</TH>
          <TH scope="col">Documents</TH>
        </TR>
      </THead>
      <TBody>
        <TR>
          <TH scope="row">Contracts</TH>
          <TD>Legal</TD>
          <TD className="tabular-nums">1,204</TD>
        </TR>
        <TR>
          <TH scope="row">Policies</TH>
          <TD>Compliance</TD>
          <TD className="tabular-nums">318</TD>
        </TR>
        <TR>
          <TH scope="row">Archive</TH>
          <TD>Records</TD>
          <TD className="tabular-nums">27,940</TD>
        </TR>
      </TBody>
    </Table>
  ),
};

/**
 * Menu and popover parts that only exist while their layer is open.
 *
 * A story that mounts a *closed* menu satisfies a "has a story" check and measures nothing, which
 * is the failure mode this whole file exists to avoid. Both layers are therefore open on arrival.
 *
 * Two details are load-bearing, and both were found by the matrix rejecting the first version:
 *
 * - `defaultOpen`, not `open`. `open` is the *controlled* prop, and with no `onOpenChange` it pins
 *   the layer open — Escape then genuinely does nothing, and the keyboard contract failed on all
 *   eight combinations. That was a defect in this story, and turning it into a reported defect in
 *   `DropdownMenu` would have been worse than not covering the component at all.
 * - `modal={false}` on the dropdown, so it does not `aria-hidden` the page behind it and take the
 *   rest of the story out of the matrix along with it.
 *
 * `CommandSeparator` is deliberately *not* here. It belongs in a palette, `Selection/Palette`
 * already opens one under the matrix, and that is where it now sits.
 */
export const OpenLayerParts: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-8 p-2">
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Sort and filter</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>Export</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="name">
            <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="modified">Last modified</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="outline">Share</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Share this document" align="start">
          <Stack gap={3}>
            <p className="text-sm text-foreground">Anyone with the link can comment.</p>
            <PopoverClose asChild>
              <Button variant="secondary" size="sm">
                Done
              </Button>
            </PopoverClose>
          </Stack>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const Motion: Story = {
  render: () => (
    <Card className="p-4">
      <Reveal>
        <Stack gap={2}>
          <p className="text-sm text-muted-foreground">Documents processed</p>
          <p className="text-3xl font-semibold text-foreground">
            <CountUp value={12480} />
          </p>
        </Stack>
      </Reveal>
    </Card>
  ),
};
