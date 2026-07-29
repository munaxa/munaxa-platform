import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Combobox, MultiSelect, type ComboboxOption } from './combobox.js';
import { Autocomplete } from './autocomplete.js';
import { EntityPicker } from './entity-picker.js';
import { Field } from './field.js';
import {
  CommandPalette,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './command.js';
import { Button } from '../primitives/button.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';

const OPTIONS: ComboboxOption[] = [
  { value: '1', label: 'Alpha Industries', description: 'ORG-001', group: 'Active' },
  { value: '2', label: 'Beta Logistics', description: 'ORG-002', group: 'Active' },
  { value: '3', label: 'Gamma Retail', description: 'ORG-003', group: 'Active' },
  { value: '4', label: 'Delta Freight', description: 'ORG-004', group: 'Archived' },
  { value: '5', label: 'Epsilon Group', description: 'ORG-005', group: 'Archived' },
];

const meta = {
  title: 'Forms/Selection',
  parameters: {
    docs: {
      description: {
        component:
          'The selection family, all built on one `Command` (cmdk) foundation.\n\n' +
          '`Combobox` and `Autocomplete` are two genuinely different interactions, not two skins. ' +
          'A **Combobox** is a button that opens a panel with its own search box — right for a long ' +
          'list the user browses. An **Autocomplete** *is* the field: focus it and type, and the ' +
          'value can often be typed rather than chosen.\n\n' +
          '**Keyboard:** Enter or Space opens, arrows move, Enter selects, Escape closes and ' +
          'returns focus. In Autocomplete focus never leaves the input — the arrows move ' +
          '`aria-activedescendant`, so the caret stays put and typing keeps working.\n\n' +
          '**Async:** supplying `onSearch` switches local filtering off and hands the debounced ' +
          'query to the caller, so one component serves a fixed list and a server-side search.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Controls: Story = {
  render: function Controls() {
    const [single, setSingle] = useState('');
    const [many, setMany] = useState<string[]>(['1']);
    const [typed, setTyped] = useState('');
    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Organisation" hint="Grouped, searchable, clearable.">
            <Combobox options={OPTIONS} value={single} onChange={setSingle} clearable />
          </Field>

          <Field label="Departments" hint="Selection stays open; tokens remove individually.">
            <MultiSelect options={OPTIONS} value={many} onChange={setMany} />
          </Field>

          <Field label="Search organisations" hint="The field is the search box.">
            <Autocomplete options={OPTIONS} value={typed} onChange={setTyped} />
          </Field>
        </Stack>
      </Container>
    );
  },
};

/** Every state a product actually renders — not just the happy path. */
export const States: Story = {
  render: function States() {
    const [value, setValue] = useState('');
    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Loading">
            <Combobox options={[]} value="" onChange={() => {}} loading />
          </Field>
          <Field label="Empty">
            <Combobox options={[]} value="" onChange={() => {}} />
          </Field>
          <Field label="Invalid" required error="Choose an organisation.">
            <Combobox options={OPTIONS} value={value} onChange={setValue} />
          </Field>
          <Field label="Disabled">
            <Combobox options={OPTIONS} value="1" onChange={() => {}} disabled />
          </Field>
          <Field label="Read only" hint="Still focusable and copyable — it just will not open.">
            <Combobox options={OPTIONS} value="1" onChange={() => {}} readOnly />
          </Field>
          <Field label="Capped at two" hint="At the limit only deselection stays available.">
            <MultiSelect options={OPTIONS} value={['1', '2']} onChange={() => {}} maxSelected={2} />
          </Field>
        </Stack>
      </Container>
    );
  },
};

/** Server-side search: `onSearch` receives the debounced query and the caller supplies the results. */
export const Async: Story = {
  render: function Async() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [value, setValue] = useState('');

    const results = useMemo(
      () =>
        query
          ? OPTIONS.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
          : OPTIONS,
      [query],
    );

    return (
      <Container width="content" className="py-6">
        <Field label="Organisation" hint={`Last query: “${query}”`}>
          <Combobox
            options={results}
            value={value}
            onChange={setValue}
            loading={loading}
            onSearch={(q) => {
              setLoading(true);
              // Stand-in for a request; the debounce is the component's.
              setTimeout(() => {
                setQuery(q);
                setLoading(false);
              }, 300);
            }}
          />
        </Field>
      </Container>
    );
  },
};

/**
 * `EntityPicker` is now a thin adapter over `Autocomplete` — it owns loading the list and the
 * fallback to manual id entry, and delegates every bit of interaction. Its thirteen original tests
 * pass unchanged against the new implementation.
 */
export const EntityPickerStory: Story = {
  name: 'EntityPicker (migrated)',
  render: function Picker() {
    const [value, setValue] = useState('');
    return (
      <Container width="content" className="py-6">
        <Stack gap={6}>
          <Field label="Organisation" hint="Backed by a list API.">
            <EntityPicker
              value={value}
              onChange={setValue}
              load={() =>
                Promise.resolve(
                  OPTIONS.map((o) => ({
                    id: o.value,
                    label: o.label,
                    ...(o.description === undefined ? {} : { sublabel: o.description }),
                  })),
                )
              }
            />
          </Field>
          <Field
            label="Fallback"
            hint="Degrades to manual id entry when the list cannot be loaded."
          >
            <EntityPicker
              value=""
              onChange={() => {}}
              load={() => Promise.reject(new Error('forbidden'))}
            />
          </Field>
        </Stack>
      </Container>
    );
  },
};

/** The palette is a `Command` inside the platform `Dialog`, inheriting its focus trap and Escape. */
export const Palette: Story = {
  render: function Palette() {
    const [open, setOpen] = useState(false);
    return (
      <Container width="content" className="py-6">
        <Section title="Command palette" description="Opens with the button; Escape closes.">
          <Button onClick={() => setOpen(true)}>Open palette</Button>
          <CommandPalette
            open={open}
            onClose={() => setOpen(false)}
            title="Search"
            description="Search across records and actions."
          >
            <CommandInput placeholder="Type a command or search…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => setOpen(false)}>
                  New student
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setOpen(false)}>Import records</CommandItem>
              </CommandGroup>
              <CommandGroup heading="Organisations">
                {OPTIONS.map((option) => (
                  <CommandItem key={option.value} onSelect={() => setOpen(false)}>
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandPalette>
        </Section>
      </Container>
    );
  },
};
