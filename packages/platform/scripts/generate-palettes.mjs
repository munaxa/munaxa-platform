import { ramp, toLch, fromLch } from './color-ramp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];

/* Shared neutral ramp — greyscale is product-agnostic, so all four themes share it. */
const NEUTRAL = {
  50:'#FAFBFC',100:'#F2F4F7',200:'#E4E7EC',300:'#D0D5DD',400:'#98A2B3',500:'#667085',
  600:'#475467',700:'#344054',800:'#1D2939',900:'#101828',950:'#0A0F1A',
};

/* Relative luminance / WCAG contrast, for picking a legible foreground. */
const lin=(c)=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
const lum=(hex)=>{const[r,g,b]=[0,2,4].map(i=>lin(parseInt(hex.slice(1+i,3+i),16)/255));
  return 0.2126*r+0.7152*g+0.0722*b;};
const contrast=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const bestFg=(bg,cands)=>cands.map(c=>[contrast(bg,c),c]).sort((a,b)=>b[0]-a[0])[0];
const rgbChannels=(hex)=>[0,2,4].map(i=>parseInt(hex.slice(1+i,3+i),16)).join(' ');

const THEMES = [
  { id:'group', name:'Group', anchor:800, brand:'#2B3A67',
    gradient:['#2B3A67','#5768AB'], ring:'#6366F1',
    semantic:{success:'#22C55E',warning:'#F59E0B',error:'#EF4444',info:'#0EA5E9'},
    description:'Deep slate-blue corporate brand — the group-level identity.' },
  { id:'school', name:'School', anchor:400, brand:'#00CFC1',
    gradient:['#00CFC1','#7FF4EC'], ring:'#6366F1',
    semantic:{success:'#22C55E',warning:'#F59E0B',error:'#EF4444',info:'#0EA5E9'},
    description:'Bright teal brand for the education platform.' },
  { id:'work', name:'Work', anchor:800, brand:'#6E1E43',
    gradient:['#6E1E43','#B44F73'], ring:'#C026D3',
    semantic:{success:'#22C55E',warning:'#F59E0B',error:'#EF4444',info:'#0EA5E9'},
    description:'Raspberry brand for the human-capital platform.' },
  { id:'docs', name:'Docs', anchor:500, brand:'#6B8E62',
    gradient:['#6B8E62','#8FBC8F'], ring:'#6B8E62',
    semantic:{success:'#2E7D32',warning:'#F59E0B',error:'#E53935',info:'#0284C7'},
    description:'Olive-green brand for the document and knowledge platform.' },
];

const INK = NEUTRAL[900], WHITE = '#FFFFFF';

for (const t of THEMES) {
  const p = ramp(t.brand, t.anchor);
  // Light scheme uses the brand as-is; dark lifts to a lighter step so it reads on a dark ground.
  const primaryDark = p[t.anchor <= 400 ? 300 : 400];
  const [fgRatio, primaryFg] = bestFg(t.brand, [WHITE, INK]);
  /*
   * `--primary` is a *fill*: it is paired with `--primary-foreground` and always sits behind
   * something. Used as text on a page background it is a different question, and for a light,
   * high-chroma brand the answer is different too — #00CFC1 on white is 1.96:1. `--primary-strong`
   * is the darkest-but-nearest step on the same ramp that clears WCAG AA for body text, so
   * `text-primary-strong` is safe everywhere `text-primary` was not.
   */
  const STEPS_DARKWARD = [400, 500, 600, 700, 800, 900, 950];
  const STEPS_LIGHTWARD = [400, 300, 200, 100, 50];
  const firstPassing = (order, bg) =>
    order.map((s) => p[s]).find((c) => contrast(c, bg) >= 4.5) ?? bestFg(bg, [WHITE, INK])[1];
  const primaryStrong = contrast(t.brand, WHITE) >= 4.5
    ? t.brand
    : firstPassing(STEPS_DARKWARD, WHITE);
  const primaryStrongDark = firstPassing(STEPS_LIGHTWARD, NEUTRAL[950]);

  /*
   * Decorative accent pair. "Warm" and "cool" are absolute temperatures, not offsets from the
   * brand — rotating a blue brand's hue by -60 degrees lands in cyan, which is not warm. Each
   * accent is therefore pinned inside its own hue arc (amber for warm, azure for cool) and only
   * nudged by the brand hue, so the four themes differ without either name becoming a lie.
   *
   * They must not be aliased to --warning / --info either: a status colour carries meaning, an
   * accent is ornament, and one value for two roles makes them indistinguishable on screen.
   */
  const RAD = Math.PI / 180;
  const brandDeg = ((toLch(t.brand).h / RAD) % 360 + 360) % 360;
  const nudge = ((brandDeg / 360) * 30 - 15); // deterministic per brand, within +/-15 degrees
  const at = (deg, L, C) => fromLch({ L, C, h: (deg + nudge) * RAD });
  const accentWarm = at(65, 0.72, 0.15);
  const accentCool = at(220, 0.70, 0.13);
  const accentWarmDark = at(65, 0.84, 0.12);
  const accentCoolDark = at(220, 0.82, 0.11);
  const [, primaryFgDark]    = bestFg(primaryDark, [WHITE, INK]);
  const [, destructiveFg]    = bestFg(t.semantic.error, [WHITE, INK]);

  const scale = Object.entries(p).map(([k,v]) => `  --primary-${k}: ${v};`).join('\n');
  // Ten-step categorical chart ramp: brand-led, then evenly-spaced distinct hues.
  const charts = [p[t.anchor], p[Math.max(200, t.anchor-400)], t.semantic.info, t.semantic.warning,
                  t.semantic.success, '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
  const chartVars = (arr) => arr.map((c,i)=>`  --chart-${i+1}: ${c};`).join('\n');

  const css = `/**
 * ${t.name} palette — the complete set of values for the theme contract.
 *
 * THE single physical colour file for the ${t.name} brand. Never imported on its own: the theme
 * entry point (\`themes/${t.id}/index.css\`) pairs it with the contract in \`themes/base/base.css\`
 * and the shared neutral ramp in \`themes/base/neutrals.css\`.
 *
 * Only branding lives here. Structure — spacing, radius, elevation, motion, the neutral ramp —
 * is shared by every theme and must never be forked into this file. Light = :root, dark = .dark.
 *
 * GENERATED from the brand hex ${t.brand} by scripts/generate-palettes.mjs. Re-run that script
 * rather than hand-editing a scale step, so the ramp stays perceptually even.
 */

:root {
  /* Brand tints consumed by the shared elevation geometry in base.css (R G B channels). */
  --shadow-tint: ${rgbChannels(p[900])};
  --glow-tint: ${rgbChannels(t.brand)};

  /* Primary scale */
${scale}

  /* Semantic roles — light */
  --background: ${WHITE};
  --foreground: ${NEUTRAL[900]};
  --card: ${WHITE};
  --card-foreground: ${NEUTRAL[900]};
  --popover: ${WHITE};
  --popover-foreground: ${NEUTRAL[900]};
  --primary: ${t.brand};
  --primary-foreground: ${primaryFg};
  --primary-strong: ${primaryStrong};
  --secondary: ${NEUTRAL[100]};
  --secondary-foreground: ${NEUTRAL[800]};
  --muted: ${NEUTRAL[100]};
  --muted-foreground: ${NEUTRAL[500]};
  --accent: ${p[50]};
  --accent-foreground: ${p[800]};
  --destructive: ${t.semantic.error};
  --destructive-foreground: ${destructiveFg};
  --border: ${NEUTRAL[200]};
  --input: ${NEUTRAL[200]};
  --ring: ${t.ring};
  --accent-warm: ${accentWarm};
  --accent-cool: ${accentCool};
  --success: ${t.semantic.success};
  --warning: ${t.semantic.warning};
  --info: ${t.semantic.info};

  /* Data-visualisation ramp */
${chartVars(charts)}
}

.dark {
  --shadow-tint: 0 0 0;

  --background: ${NEUTRAL[950]};
  --foreground: ${NEUTRAL[50]};
  --card: ${NEUTRAL[900]};
  --card-foreground: ${NEUTRAL[50]};
  --popover: ${NEUTRAL[900]};
  --popover-foreground: ${NEUTRAL[50]};
  --primary: ${primaryDark};
  --primary-foreground: ${primaryFgDark};
  --primary-strong: ${primaryStrongDark};
  --secondary: ${NEUTRAL[800]};
  --secondary-foreground: ${NEUTRAL[50]};
  --muted: ${NEUTRAL[800]};
  --muted-foreground: ${NEUTRAL[400]};
  --accent: ${NEUTRAL[800]};
  --accent-foreground: ${NEUTRAL[50]};
  --destructive: ${p[300] && t.semantic.error};
  --border: rgb(255 255 255 / 0.12);
  --input: rgb(255 255 255 / 0.16);
  --ring: ${t.ring};
  --accent-warm: ${accentWarmDark};
  --accent-cool: ${accentCoolDark};
}
`;
  mkdirSync(`${OUT}/${t.id}`, { recursive: true });
  writeFileSync(`${OUT}/${t.id}/palette.css`, css);

  const brandTs = `/**
 * ${t.name} brand swatches — the fixed hexes that the CSS palette cannot express.
 *
 * The runtime palette (\`palette.css\`) is the single source of truth for every *semantic*
 * colour. This module carries only what a semantic palette has no slot for: the raw brand
 * hexes and gradient stops, for surfaces that cannot read CSS custom properties at all —
 * HTML email, OG images, favicons, PDF output.
 */
export const brand = {
  /** Primary brand hue, light and deep variants. */
  color: {
    DEFAULT: '${t.brand}',
    light: '${p[t.anchor <= 400 ? 200 : 400]}',
    dark: '${p[950]}',
  },
  /** Gradient stops used by brand surfaces (light → primary → deep). */
  gradientStops: {
    from: '${t.gradient[1]}',
    via: '${t.brand}',
    to: '${p[950]}',
  },
  /** Static neutral scale, for surfaces that cannot read CSS variables (email, OG images). */
  neutral: {
    0: '${WHITE}',
    bg: '${NEUTRAL[50]}',
    surface: '${NEUTRAL[100]}',
    border: '${NEUTRAL[200]}',
    input: '${NEUTRAL[200]}',
    mutedText: '${NEUTRAL[500]}',
    ink: '${NEUTRAL[900]}',
  },
} as const;
`;
  writeFileSync(`${OUT}/${t.id}/brand.ts`, brandTs);

  writeFileSync(`${OUT}/${t.id}/index.css`, `/**
 * ${t.name} theme entry point.
 *
 *   @import 'tailwindcss';
 *   @import '@axa/platform/css/themes/${t.id}';
 */
@import '../base/base.css';
@import './palette.css';
`);

  console.log(
    `${t.id.padEnd(7)} fill=${t.brand} on=${primaryFg} (${fgRatio.toFixed(2)}:1)  ` +
    `text=${primaryStrong} (${contrast(primaryStrong, WHITE).toFixed(2)}:1)  ` +
    `dark text=${primaryStrongDark} (${contrast(primaryStrongDark, NEUTRAL[950]).toFixed(2)}:1)`);
}

const neutrals = `/**
 * The shared neutral ramp.
 *
 * Greyscale is *structure*, not branding: every product renders the same surfaces, borders and
 * text greys, and only the brand hue changes between themes. Keeping the ramp here — rather than
 * copying it into each palette — is what makes "a theme overrides only branding" true.
 *
 * Imported by \`base.css\`; never imported directly by an application.
 */
:root {
${Object.entries(NEUTRAL).map(([k,v])=>`  --neutral-${k}: ${v};`).join('\n')}
}
`;
writeFileSync(`${OUT}/base/neutrals.css`, neutrals);
console.log('wrote base/neutrals.css');
