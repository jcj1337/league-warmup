import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Load-time benchmark: how long a first-time visitor waits for the start screen.
 *
 * Builds the game for production, serves it brotli-compressed the way Cloudflare does, and
 * times cold loads (fresh context, no cache) on three networks. The headline per network is
 * the median time to the first painted start screen.
 *
 *   npm run perf               7 loads per network
 *   PERF_RUNS=15 npm run perf  more loads, steadier medians
 */

const RUNS = Number(process.env.PERF_RUNS ?? 7);

/** Lighthouse's throttling presets. CDP takes throughput in bytes per second. */
const NETWORKS = {
  none: null,
  desktop: { latency: 40, downloadThroughput: (10_240 * 1024) / 8, uploadThroughput: (10_240 * 1024) / 8 },
  slow4g: { latency: 150, downloadThroughput: (1_638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
} as const;

/**
 * Budgets with room over the numbers measured on the machine that set them (RTX 3060, Edge:
 * 227 KB, 499 ms), so a slower machine passes and a real regression does not. The bundle
 * size does not depend on the machine, so its room is small.
 */
const BUDGET = {
  bundleBrotliBytes: 245_000,
  desktopStartScreenMs: 750,
};

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };

/** Static server for the build: brotli for text, the game for any unknown path (as the Worker does). */
function serve(dir: string): Promise<http.Server> {
  const files = new Map<string, { type: string; body: Buffer; br?: Buffer }>();
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const type = TYPES[path.extname(full)] ?? 'application/octet-stream';
      const body = fs.readFileSync(full);
      // Compressed up front so no load pays for it.
      const br = type.startsWith('text/') ? zlib.brotliCompressSync(body) : undefined;
      files.set('/' + path.relative(dir, full).split(path.sep).join('/'), { type, body, br });
    }
  };
  walk(dir);
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const file = files.get(url) ?? files.get('/index.html')!;
    const br = file.br && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, {
      'content-type': file.type,
      'cache-control': 'no-store',
      ...(br ? { 'content-encoding': 'br' } : {}),
    });
    res.end(br ? file.br : file.body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Runs in the page before any script: stamps when main.ts ran and when the start screen first painted. */
function instrument(): void {
  const perf: Record<string, number> = {};
  (window as any).__perf = perf;
  // main.ts removes the HTML loading line once the bundle has run.
  new MutationObserver((_, observer) => {
    if (document.body && !document.getElementById('loading')) {
      perf.scriptRan = performance.now();
      observer.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
  const poll = (): void => {
    const scenes = (window as any).__warmup?.scene;
    if (scenes?.getScene('GameScene')?.clock && scenes?.getScene('UIScene')?.pauseMenu) {
      perf.scenesReady = performance.now();
      // The second frame after ready is the first that shows the start screen.
      requestAnimationFrame(() => requestAnimationFrame(() => { perf.startScreen = performance.now(); }));
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

interface Load { downloaded: number; scriptRan: number; scenesReady: number; startScreen: number }

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (x: number): string => `${Math.round(x)} ms`.padStart(8);

test('load time: cold loads of a production build reach the start screen within budget', async ({ browser }, testInfo) => {
  const root = path.dirname(testInfo.config.configFile!);
  const dist = testInfo.outputPath('dist');
  execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });

  const scripts = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
  const scriptBytes = scripts.reduce((n, f) => n + fs.statSync(path.join(dist, 'assets', f)).size, 0);
  const scriptBrotli = scripts.reduce((n, f) => n + zlib.brotliCompressSync(fs.readFileSync(path.join(dist, 'assets', f))).length, 0);

  const server = await serve(dist);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const results: Record<string, Load[]> = {};
  const errors: string[] = [];

  try {
    for (const [name, network] of Object.entries(NETWORKS)) {
      results[name] = [];
      for (let i = 0; i < RUNS; i++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`${name} #${i + 1}: ${e.message}`));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        if (network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });
        await page.addInitScript(instrument);
        await page.goto(url);
        await page.waitForFunction(() => (window as any).__perf?.startScreen !== undefined, null, { timeout: 60_000 });
        results[name].push(await page.evaluate(() => {
          const perf = (window as any).__perf;
          const scripts = performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')) as PerformanceResourceTiming[];
          return {
            downloaded: Math.max(...scripts.map((e) => e.responseEnd)),
            scriptRan: perf.scriptRan,
            scenesReady: perf.scenesReady,
            startScreen: perf.startScreen,
          };
        }));
        await context.close();
      }
    }
  } finally {
    server.close();
  }

  const summary = Object.fromEntries(Object.entries(results).map(([name, loads]) => [name, {
    downloaded: median(loads.map((l) => l.downloaded)),
    scriptRan: median(loads.map((l) => l.scriptRan)),
    scenesReady: median(loads.map((l) => l.scenesReady)),
    startScreen: median(loads.map((l) => l.startScreen)),
    fastest: Math.min(...loads.map((l) => l.startScreen)),
    slowest: Math.max(...loads.map((l) => l.startScreen)),
  }]));

  const lines = [
    `bundle: ${(scriptBytes / 1000).toFixed(0)} KB raw, ${(scriptBrotli / 1000).toFixed(0)} KB brotli · median of ${RUNS} cold loads`,
    'network  downloaded  script ran  scenes ready  START SCREEN   (fastest – slowest)',
    ...Object.entries(summary).map(([name, s]) =>
      `${name.padEnd(8)} ${ms(s.downloaded)}    ${ms(s.scriptRan)}    ${ms(s.scenesReady)}      ${ms(s.startScreen)}   (${Math.round(s.fastest)} – ${Math.round(s.slowest)})`),
  ];
  console.log(lines.join('\n'));
  await testInfo.attach('load-time.json', {
    body: JSON.stringify({ runs: RUNS, scriptBytes, scriptBrotli, summary, loads: results }, null, 2),
    contentType: 'application/json',
  });

  expect(errors, 'no page errors while loading').toEqual([]);
  expect.soft(scriptBrotli, `bundle within ${BUDGET.bundleBrotliBytes} bytes brotli`).toBeLessThanOrEqual(BUDGET.bundleBrotliBytes);
  expect.soft(summary.desktop.startScreen, `desktop start screen within ${BUDGET.desktopStartScreenMs} ms`).toBeLessThanOrEqual(BUDGET.desktopStartScreenMs);
});
