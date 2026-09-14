import { defineConfig } from '@playwright/test';

const PORT = 5173;
const baseURL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './tests/e2e',

  // The suites drive a real-time game: input and waits run on wall-clock time
  // while gameplay advances on GameClock frames. One suite at a time keeps the
  // page's frame pacing steady.
  fullyParallel: false,
  workers: 1,

  // A flaky check should be seen, not retried away.
  retries: 0,
  forbidOnly: !!process.env.CI,

  // Each suite is one long sequential scenario; the longest runs ~40s.
  timeout: 120_000,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    headless: true,
    // Microsoft Edge is what these suites were proven against. Set
    // PW_CHANNEL=chromium (after `npx playwright install chromium`) to use
    // Playwright's own Chromium build instead.
    channel: process.env.PW_CHANNEL || 'msedge',
    screenshot: 'only-on-failure',
    // Tracing adds per-action overhead to a timing-sensitive page; opt in with
    // `npx playwright test --trace on` when debugging.
    trace: 'off',
  },

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // vite.config.ts auto-opens a browser tab unless this is set.
    env: { VITE_NO_OPEN: '1' },
  },
});
