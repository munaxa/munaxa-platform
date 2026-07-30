/**
 * Vite's `?raw` import suffix, typed for the Storybook config only.
 *
 * The brand-theme switcher reads the four product palettes as text so it can re-scope them at
 * runtime. Importing the real `palette.css` files — rather than restating their values here —
 * is what keeps the documentation honest: a palette edit shows up in Storybook automatically,
 * and there is no second copy to drift.
 */
declare module '*.css?raw' {
  const content: string;
  export default content;
}
