// Generates the published API-surface packages for munaxa-platform.
// Each façade is buildless: a hand-checked .js/.d.ts pair that re-exports a slice
// of @munaxa/platform. Products depend on these names; the implementation stays
// in packages/platform and can be physically split later without touching consumers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const VERSION = '1.0.0';

/** @type {Array<{name:string, dir:string, desc:string, entries:Array<[string,string]>, css?:Record<string,string>}>} */
const PACKAGES = [
  {
    name: '@munaxa/ui',
    dir: 'ui',
    desc: 'Munaxa UI — the shared component library: primitives, forms, feedback, navigation, layout, data display, overlays, data grid, patterns, layouts, shell, charts and UI hooks.',
    entries: [
      ['.', '@munaxa/platform'],
      ['./hooks', '@munaxa/platform/hooks'],
      ['./patterns', '@munaxa/platform/patterns'],
      ['./layouts', '@munaxa/platform/layouts'],
      ['./shell', '@munaxa/platform/shell'],
      ['./date', '@munaxa/platform/date'],
      ['./charts', '@munaxa/platform/charts'],
    ],
    css: { './css/motion': '@munaxa/platform/css/motion' },
  },
  {
    name: '@munaxa/tokens',
    dir: 'tokens',
    desc: 'Munaxa design tokens — the typed primitive scales (colour, space, radius, elevation, motion) and the CSS custom-property layer every theme is built from.',
    entries: [['.', '@munaxa/platform/tokens']],
    css: { './css': '@munaxa/platform/css/tokens' },
  },
  {
    name: '@munaxa/icons',
    dir: 'icons',
    desc: 'Munaxa icons — the shared icon set. The only sanctioned source of iconography for every Munaxa product.',
    entries: [['.', '@munaxa/platform/icons']],
  },
  {
    name: '@munaxa/theme',
    dir: 'theme',
    desc: 'Munaxa theme engine — the typed product-theme registry (Corporate, School, Work, Docs) and the CSS theme contract. Branding is configuration, never duplicated code.',
    entries: [['.', '@munaxa/platform/themes']],
    css: {
      './css/base': '@munaxa/platform/css/base',
      './css/corporate': '@munaxa/platform/css/themes/group',
      './css/school': '@munaxa/platform/css/themes/school',
      './css/work': '@munaxa/platform/css/themes/work',
      './css/docs': '@munaxa/platform/css/themes/docs',
    },
  },
  {
    name: '@munaxa/typography',
    dir: 'typography',
    desc: 'Munaxa typography — the shared type scale and font stacks.',
    entries: [['.', '@munaxa/platform/typography']],
  },
  {
    name: '@munaxa/utils',
    dir: 'utils',
    desc: 'Munaxa shared utilities — framework-agnostic helpers shared across products, including the `cn` class-name merger.',
    entries: [['.', '@munaxa/platform']],
    only: ['cn'],
  },
];

for (const pkg of PACKAGES) {
  const base = join(ROOT, 'packages', pkg.dir);
  const exportsField = {};

  for (const [sub, from] of pkg.entries) {
    const rel = sub === '.' ? 'index' : sub.slice(2);
    const dir = sub === '.' ? base : join(base, rel);
    mkdirSync(dir, { recursive: true });
    const file = sub === '.' ? join(base, 'index') : join(dir, 'index');

    const body = pkg.only
      ? `export { ${pkg.only.join(', ')} } from '${from}';\n`
      : `export * from '${from}';\n`;
    const banner =
      `// ${pkg.name}${sub === '.' ? '' : sub.slice(1)} — re-exports ${from}.\n` +
      `// Buildless façade: edit the implementation in packages/platform, never here.\n`;

    writeFileSync(`${file}.js`, banner + body);
    writeFileSync(`${file}.d.ts`, banner + body);

    exportsField[sub] = {
      types: `./${sub === '.' ? '' : rel + '/'}index.d.ts`,
      default: `./${sub === '.' ? '' : rel + '/'}index.js`,
    };
  }

  for (const [sub, from] of Object.entries(pkg.css ?? {})) {
    const rel = sub.slice(2);
    const dir = join(base, rel.split('/').slice(0, -1).join('/') || '.');
    mkdirSync(dir, { recursive: true });
    const file = join(base, `${rel}.css`);
    writeFileSync(file, `/* ${pkg.name}${sub.slice(1)} — re-exports ${from}. */\n@import '${from}';\n`);
    exportsField[sub] = `./${rel}.css`;
  }

  writeFileSync(
    join(base, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        version: VERSION,
        description: pkg.desc,
        license: 'UNLICENSED',
        type: 'module',
        sideEffects: ['**/*.css'],
        exports: exportsField,
        main: './index.js',
        types: './index.d.ts',
        files: ['**/*.js', '**/*.d.ts', '**/*.css'],
        repository: {
          type: 'git',
          url: 'git+https://github.com/munaxa/munaxa-platform.git',
          directory: `packages/${pkg.dir}`,
        },
        publishConfig: { registry: 'https://npm.pkg.github.com', access: 'restricted' },
        dependencies: { '@munaxa/platform': `workspace:^` },
        peerDependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
        peerDependenciesMeta: {
          react: { optional: true },
          'react-dom': { optional: true },
        },
        scripts: {
          build: "echo 'buildless façade — nothing to compile' >/dev/null",
          lint: "echo 'buildless façade — nothing to lint' >/dev/null",
          typecheck: "echo 'buildless façade — types re-exported from @munaxa/platform' >/dev/null",
        },
      },
      null,
      2,
    ) + '\n',
  );

  writeFileSync(
    join(base, 'README.md'),
    `# ${pkg.name}\n\n${pkg.desc}\n\n` +
      `This package is a **façade**. It contains no implementation — every export is\n` +
      `re-exported from [\`@munaxa/platform\`](../platform), which is the single source of\n` +
      `truth for the Munaxa design system. The façade exists so products depend on a stable,\n` +
      `intention-revealing package name while the platform's internal layout stays free to\n` +
      `change.\n\n## Install\n\n\`\`\`bash\npnpm add ${pkg.name}\n\`\`\`\n\n` +
      `## Entry points\n\n${Object.keys(exportsField)
        .map((e) => `- \`${pkg.name}${e.slice(1)}\``)
        .join('\n')}\n\n` +
      `## Changing something\n\nEdit \`packages/platform\`, not this directory. Files here are generated by\n` +
      `\`scripts/gen-facades.mjs\` and are overwritten on regeneration.\n`,
  );

  console.log(`generated ${pkg.name}`);
}
