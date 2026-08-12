import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { type AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * The platform's real-browser accessibility harness — Phase 8.4.
 *
 * The platform's unit tests run under happy-dom, which applies no stylesheet, so `test/setup.ts`
 * disables axe's `color-contrast` rule. That is the correct call for that environment and it left
 * the platform structurally unable to detect a contrast defect in its own suite: Phases 8.2 and 8.3
 * each found one only after it had shipped and a product measured it.
 *
 * This closes that hole at the level that owns it. Storybook is already the platform's component
 * environment and already renders the real Tailwind build, the real theme contract and all four
 * brand palettes; what was missing was a browser to render it in. The built static site is served
 * and driven with Chromium, so every measurement here is of the same CSS a product receives.
 */

const BROWSERS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter((value): value is string => typeof value === 'string');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export interface Harness {
  readonly browser: Browser;
  readonly server: Server;
  readonly origin: string;
}

/** Serve `storybook-static` and open a browser against it. */
export async function startHarness(root: string): Promise<Harness> {
  if (!existsSync(join(root, 'iframe.html'))) {
    throw new Error(
      `No Storybook build at ${root}. This suite measures the built site rather than a dev server, ` +
        'so it depends on `pnpm build-storybook` having run.',
    );
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // `normalize` then reject `..` — the server only ever serves the build directory.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, relative);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(root) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const executablePath = BROWSERS.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });

  return { browser, server, origin: `http://127.0.0.1:${String(port)}` };
}

export async function stopHarness(harness: Harness | null): Promise<void> {
  if (harness === null) return;
  await harness.browser.close();
  await new Promise<void>((resolve) => harness.server.close(() => resolve()));
}

export type Brand = 'group' | 'school' | 'work' | 'docs';
export type Scheme = 'light' | 'dark';

/**
 * Open one story with a brand and a colour scheme, and wait until it has settled.
 *
 * Storybook's `globals` query parameter drives the same toolbar controls a person uses, so the
 * brand arrives through `applyBrand` and the scheme through the `dark` class — no CSS is injected
 * and no palette is restated here.
 */
export async function openStory(
  harness: Harness,
  id: string,
  brand: Brand,
  scheme: Scheme,
): Promise<Page> {
  const page = await harness.browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(
    `${harness.origin}/iframe.html?id=${id}&globals=brand:${brand};scheme:${scheme}`,
    {
      waitUntil: 'networkidle',
    },
  );
  await page.waitForFunction(() => {
    const root = document.querySelector('#storybook-root');
    return root !== null && root.children.length > 0;
  });
  await page.waitForFunction(
    (want) => document.documentElement.classList.contains('dark') === (want === 'dark'),
    scheme,
  );
  await settleColours(page);
  return page;
}

/**
 * Wait for colour transitions to finish before measuring one.
 *
 * Phase 7.9's lesson, carried across repositories: `getComputedStyle().color` returns the
 * interpolated value while a `transition-colors` is in flight, and one such reading became a
 * platform finding that was not real. Two samples that agree rather than a fixed sleep.
 */
export async function settleColours(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const sample = (): string =>
        [...document.querySelectorAll('#storybook-root *')]
          .slice(0, 60)
          .map(
            (node) => `${getComputedStyle(node).color}|${getComputedStyle(node).backgroundColor}`,
          )
          .join(';');
      const first = sample();
      return new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(() => resolve(first === sample()), 60);
        });
      });
    },
    undefined,
    { polling: 100, timeout: 15_000 },
  );
}
