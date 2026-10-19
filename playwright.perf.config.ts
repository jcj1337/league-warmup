import { defineConfig } from '@playwright/test';

/**
 * `npm run perf`: the load-time benchmark in tests/perf/. Apart from `npm test` because it
 * measures a production build (it makes its own), not the dev server the suites use.
 */
export default defineConfig({
  testDir: './tests/perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // One build plus 21 cold loads, three of them on a 1.6 Mbps connection.
  timeout: 300_000,
  reporter: [['list']],
  use: {
    headless: true,
    channel: process.env.PW_CHANNEL || 'msedge',
    trace: 'off',
  },
});
