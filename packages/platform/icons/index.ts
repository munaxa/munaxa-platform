/**
 * Icons — the single icon source for every AXA product.
 *
 * Applications and design-system components import icons from here so the whole ecosystem
 * shares one icon library at one version. This stops each product pinning its own
 * lucide-react version and drifting apart visually.
 *
 *   import { Search, type IconProps } from '@axa/platform/icons';
 *
 * The full lucide set is re-exported (so any icon is available), plus a typed `IconProps`
 * and `Icon` type alias for props and component typing.
 */
export * from 'lucide-react';
export type { LucideIcon as Icon, LucideProps as IconProps } from 'lucide-react';
