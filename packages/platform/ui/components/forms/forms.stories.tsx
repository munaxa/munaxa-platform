import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field.js';
import { Input } from './input.js';
import { Textarea } from './textarea.js';
import { Checkbox } from './checkbox.js';
import { Radio } from './radio.js';
import { Switch } from './switch.js';
import { EntityPicker, type PickerOption } from './entity-picker.js';
import { Button } from '../primitives/button.js';

const meta = {
  title: 'Forms/Overview',
  parameters: {
    docs: {
      description: {
        component:
          'Form controls, shown in every state a product actually renders: default, filled, ' +
          'disabled, read-only and invalid. `Field` owns the label, the hint and the validation ' +
          'message; the control itself stays a plain input.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="grid max-w-xl gap-5">
      <Field label="Default" htmlFor="a">
        <Input id="a" placeholder="Placeholder" />
      </Field>
      <Field label="Filled" htmlFor="b">
        <Input id="b" defaultValue="Some value" />
      </Field>
      <Field label="With hint" htmlFor="c" hint="We never share this.">
        <Input id="c" type="email" placeholder="name@example.com" />
      </Field>
      <Field label="Invalid" htmlFor="d" required error="This field is required.">
        <Input id="d" aria-invalid="true" />
      </Field>
      <Field label="Disabled" htmlFor="e">
        <Input id="e" disabled defaultValue="Cannot edit" />
      </Field>
      <Field label="Read only" htmlFor="f">
        <Input id="f" readOnly defaultValue="Reference value" />
      </Field>
      <Field label="Notes" htmlFor="g" hint="Markdown is not supported.">
        <Textarea id="g" rows={3} placeholder="Add a note…" />
      </Field>
    </div>
  ),
};

export const Toggles: Story = {
  render: function Toggles() {
    const [checked, setChecked] = useState(true);
    const [on, setOn] = useState(true);
    const [choice, setChoice] = useState('one');
    return (
      <div className="grid max-w-xl gap-6">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            Checked
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox disabled />
            Disabled
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Radio group</legend>
          {['one', 'two', 'three'].map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <Radio
                name="demo"
                value={v}
                checked={choice === v}
                onChange={() => setChoice(v)}
                disabled={v === 'three'}
              />
              {v}
              {v === 'three' ? ' (disabled)' : ''}
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-3 text-sm">
          <Switch checked={on} onCheckedChange={setOn} aria-label="Notifications" />
          Notifications {on ? 'on' : 'off'}
        </label>
      </div>
    );
  },
};

const OPTIONS: PickerOption[] = [
  { id: '1', label: 'Alpha Industries', sublabel: 'ORG-001' },
  { id: '2', label: 'Beta Logistics', sublabel: 'ORG-002' },
  { id: '3', label: 'Gamma Retail', sublabel: 'ORG-003' },
];

/**
 * The picker is an ARIA combobox: focus stays on the input and moves through options via
 * `aria-activedescendant`. Arrow keys move, Enter selects, Escape closes. If the list cannot be
 * loaded it degrades to a plain id input rather than blocking the flow.
 */
export const EntityPickerStory: Story = {
  name: 'Entity picker',
  render: function Picker() {
    const [value, setValue] = useState('');
    return (
      <div className="grid max-w-md gap-5">
        <Field label="Organisation" hint="Type to filter. Arrow keys to move, Enter to select.">
          <EntityPicker
            value={value}
            onChange={setValue}
            load={() => Promise.resolve(OPTIONS)}
            placeholder="Search organisations…"
          />
        </Field>
        <Field label="Fallback (list unavailable)" hint="Degrades to manual id entry.">
          <EntityPicker
            value=""
            onChange={() => {}}
            load={() => Promise.reject(new Error('forbidden'))}
          />
        </Field>
        <div>
          <Button disabled={!value}>Continue</Button>
        </div>
      </div>
    );
  },
};
