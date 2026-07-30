import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Columns3,
  Download,
  FileText,
  Filter,
  Folder,
  Inbox,
  Info,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  X,
} from '../icons/index.js';
import { Page, Section } from './doc-kit.js';

/**
 * Icons are one shared set, drawn in the current text colour.
 *
 * Every glyph is a `currentColor` stroke, so an icon inherits whatever the surrounding text
 * resolves to — which is why the same icon set works under four brands with no per-brand asset.
 * The platform re-exports the whole Lucide set from `@axa/platform/icons`; the sample below is the
 * subset the platform's own components use.
 */
const meta = {
  title: 'Foundations/Icons',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ICONS = {
  Search,
  Filter,
  Columns3,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Menu,
  User,
  Users,
  Settings,
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Clock,
  FileText,
  Folder,
  Inbox,
  Upload,
  Download,
  Info,
  CheckCircle2,
  TriangleAlert,
  AlertCircle,
};

export const Icons: Story = {
  render: () => (
    <Page
      title="Icons"
      lead={
        <>
          Imported from <code className="font-mono text-xs">@axa/platform/icons</code>, a single
          re-export of Lucide at one pinned version so no product drifts visually. Icons are sized
          with a utility (<code className="font-mono text-xs">size-4</code>) and coloured by their
          context — never given a hex.
        </>
      }
    >
      <Section
        title="In use"
        description="Inheriting the current text colour: the same glyph, four semantic roles."
      >
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-5">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Info className="size-4" aria-hidden="true" /> foreground
          </span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4" aria-hidden="true" /> muted
          </span>
          <span className="flex items-center gap-2 text-sm text-primary-strong">
            <Info className="size-4" aria-hidden="true" /> brand
          </span>
          <span className="flex items-center gap-2 text-sm text-destructive">
            <Info className="size-4" aria-hidden="true" /> destructive
          </span>
        </div>
      </Section>

      <Section title="Sizes">
        <div className="flex items-end gap-6 rounded-xl border border-border bg-card p-5">
          {(['size-3', 'size-4', 'size-5', 'size-6', 'size-8'] as const).map((cls) => (
            <span key={cls} className="flex flex-col items-center gap-2">
              <Search className={cls} aria-hidden="true" />
              <code className="font-mono text-[11px] text-muted-foreground">{cls}</code>
            </span>
          ))}
        </div>
      </Section>

      <Section title="The platform's working set">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Object.entries(ICONS).map(([name, Icon]) => (
            <div
              key={name}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center"
            >
              <Icon className="size-5" aria-hidden="true" />
              <code className="font-mono text-[10px] break-all text-muted-foreground">{name}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};
