import { themes, type ThemeId } from '../themes/index.js';

/**
 * The official Munaxa brand definitions, as issued by the brand owner.
 *
 * This is *reference* data for the documentation site: the values a designer is handed, next to
 * which the live theme can be read. It is deliberately not wired into any component and is not
 * exported from the package — the runtime source of truth for every colour a product renders
 * remains `themes/<id>/palette.css`, and nothing here can change what an application paints.
 *
 * Keeping both visible is the honest presentation. The palettes derive a full perceptual ramp
 * from each brand primary, so a generated step will not always equal the brand book's single
 * `secondary` or `dark` swatch; the theme pages show the two side by side rather than implying
 * they are the same number.
 */

export interface BrandBookEntry {
  /** Theme id in the platform registry — the value the `data-brand` attribute takes. */
  id: ThemeId;
  /** Full product name, as written in the brand book. */
  product: string;
  /** What the brand is for, in one line. */
  purpose: string;
  /** The three words the brand is meant to convey. */
  personality: readonly [string, string, string];
  primary: string;
  secondary: string;
  /** Lightest brand surface — a tinted page or panel background. */
  light: string;
  /** Deepest brand ink — dark-scheme surfaces and high-contrast type. */
  dark: string;
  /** The two-stop brand gradient, from → to. */
  gradient: readonly [string, string];
}

export const BRAND_BOOK: readonly BrandBookEntry[] = [
  {
    id: 'group',
    product: 'Munaxa Group',
    purpose: 'The corporate identity — the group that owns and operates every product.',
    personality: ['Executive', 'Trust', 'Leadership'],
    primary: '#2B3A67',
    secondary: '#5A74B8',
    light: '#EEF2F8',
    dark: '#101729',
    gradient: ['#2B3A67', '#576EA8'],
  },
  {
    id: 'school',
    product: 'Munaxa School',
    purpose: 'The school operating system — administration, people, attendance and finance.',
    personality: ['Learning', 'Growth', 'Innovation'],
    primary: '#00CFC1',
    secondary: '#26D6DA',
    light: '#E8FFFD',
    dark: '#003B39',
    gradient: ['#00CFC1', '#7FF4EC'],
  },
  {
    id: 'work',
    product: 'Munaxa Work',
    purpose: 'The human-capital platform — people, culture and performance.',
    personality: ['People', 'Culture', 'Performance'],
    primary: '#6E1E43',
    secondary: '#A63D64',
    light: '#FDF2F6',
    dark: '#1A0710',
    gradient: ['#6E1E43', '#A63D64'],
  },
  {
    id: 'docs',
    product: 'Munaxa Docs',
    purpose: 'The document and knowledge platform — filing, retrieval and clarity.',
    personality: ['Knowledge', 'Organization', 'Clarity'],
    primary: '#6B8E62',
    secondary: '#8FBC8F',
    light: '#F6F9F4',
    dark: '#192119',
    gradient: ['#6B8E62', '#AFC5A7'],
  },
];

export const BRAND_BY_ID: Record<ThemeId, BrandBookEntry> = Object.fromEntries(
  BRAND_BOOK.map((entry) => [entry.id, entry]),
) as Record<ThemeId, BrandBookEntry>;

/**
 * The neutral ramp, shared by all four brands.
 *
 * Neutrals are the reason four brands can share one component library: structure, text and
 * dividers are brand-independent, so only the accent surfaces change when the brand does.
 */
export const NEUTRALS: readonly { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Neutral 50', hex: '#FAFBFC' },
  { name: 'Neutral 100', hex: '#F4F6F8' },
  { name: 'Neutral 200', hex: '#EEF1F5' },
  { name: 'Neutral 300', hex: '#E4E7EC' },
  { name: 'Neutral 400', hex: '#D0D5DD' },
  { name: 'Neutral 500', hex: '#98A2B3' },
  { name: 'Neutral 600', hex: '#667085' },
  { name: 'Neutral 700', hex: '#475467' },
  { name: 'Neutral 800', hex: '#344054' },
  { name: 'Neutral 900', hex: '#18212B' },
  { name: 'Black', hex: '#111827' },
];

/** The platform's own description of each theme, for cross-referencing the registry. */
export const registryDescription = (id: ThemeId): string => themes[id].description;
