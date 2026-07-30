import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card.js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../data-display/accordion.js';
import { Avatar, AvatarFallback, AvatarGroup } from '../data-display/avatar.js';
import { Alert } from '../feedback/alert.js';
import { Skeleton } from '../feedback/skeleton.js';
import { Tag } from '../primitives/tag.js';
import { Breadcrumb } from '../navigation/breadcrumb.js';
import { Separator, ScrollArea } from '../layout/separator.js';
import { Button } from '../primitives/button.js';
import { Input } from '../forms/input.js';
import { Field } from '../forms/field.js';
import { Stack, Inline } from '../../layouts/stack.js';
import { Container } from '../../layouts/container.js';
import { Section } from '../../layouts/page.js';
import { Surface } from '../../layouts/surface.js';

const meta = {
  title: 'Foundation/Primitives',
  parameters: {
    docs: {
      description: {
        component:
          'The interaction primitives higher-level components are built from.\n\n' +
          "The behaviour is Radix's, deliberately. Collision-aware positioning, roving focus, " +
          'typeahead, submenu intent, dismissal and focus restoration are thousands of lines of ' +
          'subtlety that a hand-rolled version gets wrong in ways only some users notice. The ' +
          'platform supplies the surface, the theme and the motion — `axa-overlay-motion` lives ' +
          'in the theme contract, so overlays work from a theme import alone with no extra ' +
          'animation package.\n\n' +
          '**Keyboard:** every menu opens with Enter or Space, moves with the arrows, jumps by ' +
          'typeahead, and closes on Escape with focus returning to the trigger. **RTL:** switch ' +
          'the Direction control — submenus open the other way and every chevron mirrors.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overlays: Story = {
  render: () => (
    <Container className="py-6">
      <Stack gap={8}>
        <Section title="Popover" description="Opens on click and moves focus. Holds real controls.">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Filters</Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Filters">
              <Stack gap={3}>
                <Field label="Search" hint="Matches name and id.">
                  <Input placeholder="Search…" />
                </Field>
                <Inline justify="end">
                  <Button size="sm">Apply</Button>
                </Inline>
              </Stack>
            </PopoverContent>
          </Popover>
        </Section>

        <Section
          title="Dropdown menu"
          description="Enter to open, arrows to move, type to jump, Escape to close."
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Record</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                Edit
                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked>Pinned</DropdownMenuCheckboxItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>Archive</DropdownMenuItem>
                  <DropdownMenuItem>Drafts</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section
          title="Context menu"
          description="Right-click the panel. Never the only route to an action — right-click is undiscoverable."
        >
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <Surface padding={6} tone="muted" className="text-center text-sm">
                Right-click here
              </Surface>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Open</ContextMenuItem>
              <ContextMenuItem>Duplicate</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem destructive>Delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </Section>

        <Section
          title="Hover card"
          description="Supplementary preview. Holds nothing focusable — anything actionable belongs in a Popover."
        >
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="ghost">Olivia Rhye</Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <Inline gap={3} align="start">
                <Avatar size="md">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <Stack gap={1}>
                  <p className="text-sm font-medium">Olivia Rhye</p>
                  <p className="text-xs text-muted-foreground">Senior Product Designer</p>
                </Stack>
              </Inline>
            </HoverCardContent>
          </HoverCard>
        </Section>
      </Stack>
    </Container>
  ),
};

export const Disclosure: Story = {
  render: function Disclosure() {
    const [open, setOpen] = useState(false);
    return (
      <Container className="py-6">
        <Stack gap={8}>
          <Section title="Accordion" description="Arrow keys move between headers.">
            <Accordion type="single" collapsible>
              {['General', 'Permissions', 'Advanced'].map((title) => (
                <AccordionItem key={title} value={title}>
                  <AccordionTrigger level={3}>{title}</AccordionTrigger>
                  <AccordionContent>Settings for {title.toLowerCase()} live here.</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          <Section title="Collapsible" description="One region, no grouping.">
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  {open ? 'Hide' : 'Show'} advanced options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Surface padding={4} tone="muted" className="mt-2 text-sm">
                  Advanced options.
                </Surface>
              </CollapsibleContent>
            </Collapsible>
          </Section>
        </Stack>
      </Container>
    );
  },
};

export const Display: Story = {
  render: () => (
    <Container className="py-6">
      <Stack gap={8}>
        <Section title="Alert" description="Tone is never the only signal — the text carries it.">
          <Stack gap={3}>
            <Alert tone="info" title="Scheduled maintenance">
              The service will be unavailable on Sunday between 02:00 and 04:00.
            </Alert>
            <Alert tone="success" title="Saved" />
            <Alert tone="warning" title="Approaching your plan limit">
              You have used 92% of your storage.
            </Alert>
            <Alert
              tone="danger"
              title="Import failed"
              live="alert"
              actions={
                <Button size="sm" variant="outline">
                  Retry
                </Button>
              }
            >
              Three rows could not be parsed.
            </Alert>
          </Stack>
        </Section>

        <Section
          title="Tag"
          description="A value the user chose. Badge is status the system reports."
        >
          <Inline>
            <Tag>Neutral</Tag>
            <Tag tone="primary">Primary</Tag>
            <Tag tone="success">Active</Tag>
            <Tag tone="warning">Pending</Tag>
            <Tag tone="danger" onRemove={() => {}} removeLabel="Remove Overdue">
              Overdue
            </Tag>
          </Inline>
        </Section>

        <Section title="Avatar">
          <Inline gap={4}>
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <Avatar key={size} size={size}>
                <AvatarFallback>OR</AvatarFallback>
              </Avatar>
            ))}
            <AvatarGroup max={3}>
              {['OR', 'PB', 'LS', 'DW', 'CW'].map((initials) => (
                <Avatar key={initials} size="sm" className="border-2 border-background">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          </Inline>
        </Section>

        <Section
          title="Breadcrumb"
          description="The last crumb is not a link — it is aria-current."
        >
          <Stack gap={3}>
            <Breadcrumb
              items={[
                { label: 'Home', href: '/' },
                { label: 'People', href: '/people' },
                { label: 'Students', href: '/people/students' },
                { label: 'Olivia Rhye' },
              ]}
            />
            <Breadcrumb
              maxItems={3}
              items={[
                { label: 'Home', href: '/' },
                { label: 'People', href: '/people' },
                { label: 'Students', href: '/people/students' },
                { label: 'Grade 6', href: '/people/students/g6' },
                { label: 'Olivia Rhye' },
              ]}
            />
          </Stack>
        </Section>

        <Section
          title="Skeleton"
          description="aria-hidden — the loading state is announced once, by the region."
        >
          <Stack gap={3}>
            <Inline gap={3} align="start">
              <Skeleton shape="circle" className="size-10" />
              <Skeleton shape="text" lines={3} className="flex-1" />
            </Inline>
          </Stack>
        </Section>

        <Section title="Separator and ScrollArea">
          <Stack gap={3}>
            <Inline gap={3}>
              <span className="text-sm">Draft</span>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-sm">Edited 2h ago</span>
            </Inline>
            <Separator />
            <Surface className="h-36">
              <ScrollArea className="h-full p-3">
                <Stack gap={2}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <p key={i} className="text-sm">
                      Scrollable row {i + 1}
                    </p>
                  ))}
                </Stack>
              </ScrollArea>
            </Surface>
          </Stack>
        </Section>
      </Stack>
    </Container>
  ),
};
