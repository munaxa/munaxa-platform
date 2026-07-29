/**
 * Layout primitives — arrangement, measure and page structure.
 *
 * These own *where things sit*, never how they look. A layout sets spacing, direction and size and
 * leaves colour, border and typography to the components inside it, which is what lets the same
 * primitive serve four products without a single per-product branch.
 *
 * Every spacing value is a step on the shared scale, every breakpoint comes from
 * `tokens/breakpoints`, and every horizontal arrangement is direction-aware, so RTL needs no
 * separate code path.
 */
export {
  Stack,
  Inline,
  Cluster,
  type StackProps,
  type InlineProps,
  type ClusterProps,
} from './stack.js';
export { Container, type ContainerProps, type ContainerWidth } from './container.js';
export { Grid, type GridProps } from './grid.js';
export { Center, Cover, type CenterProps, type CoverProps } from './center.js';
export { Surface, type SurfaceProps, type SurfaceTone, type SurfaceElevation } from './surface.js';
export {
  Page,
  PageHeader,
  Section,
  type PageProps,
  type PageHeaderProps,
  type SectionProps,
} from './page.js';
export {
  Split,
  SidebarLayout,
  InspectorLayout,
  type SplitProps,
  type SplitRatio,
  type SidebarLayoutProps,
  type InspectorLayoutProps,
} from './split.js';
export { Panel, Toolbar, type PanelProps, type ToolbarProps } from './panel.js';
export { Workspace, type WorkspaceProps } from './workspace.js';
export { ResizablePanels, type ResizablePanelsProps } from './resizable.js';
export type { Align, Columns, Justify, Responsive, Space } from './scales.js';
