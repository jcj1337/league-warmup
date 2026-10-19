import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Shared scaffolding for the browser regression suites.
 *
 * Each suite is a port of a characterization script: one long, sequential walk
 * through an area of the game that records PASS / FAIL / WARN lines. `fail` is a
 * soft assertion. As in the original scripts, one failed check
 * never hides the checks after it, but the test still fails at the end.
 */
export interface Suite {
  pass(message: string): void;
  fail(message: string): void;
  /** Informational: a scenario this run could not exercise. Never fails the test. */
  warn(message: string): void;
  /** Label the checks that follow, so a failure names the part of the suite it came from. */
  section(name: string): void;
  /** Uncaught page errors and console errors seen so far. */
  errors: string[];
  /** Check for page errors, attach the check log, print a one-line summary. */
  finish(): Promise<void>;
}

/**
 * Wait until both scenes have run create(), leave the start screen (a page
 * load holds the first round at time 0 until a click; start.spec.ts covers
 * that click), and wait until the simulation has advanced `settleMs` of GAME
 * time. (The original scripts slept a fixed few hundred wall-clock
 * milliseconds here instead.)
 */
export async function waitForGame(page: Page, settleMs: number): Promise<void> {
  await page.waitForFunction(() => {
    const scenes = window.__warmup?.scene;
    return Boolean(scenes?.getScene('GameScene')?.clock && scenes?.getScene('UIScene')?.pauseMenu);
  });
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').startRun());
  await page.waitForFunction((settle) => {
    const scenes = window.__warmup?.scene;
    const g = scenes?.getScene('GameScene');
    const ui = scenes?.getScene('UIScene');
    return Boolean(g?.clock && ui?.pauseMenu && g.clock.now >= settle);
  }, settleMs);
}

export interface SuiteOptions {
  /**
   * Waves arrive one enemy at a time. By default the opening wave is made to
   * arrive in full before the suite starts (WaveDirector.arriveAllNow), so
   * suites that stage the Stage 1 roster see all of it. Pass false to play the
   * real staggered opening.
   */
  arriveAll?: boolean;
  /** Play as this champion: the profile's pick is seeded before the page loads (default: Magic Boy). */
  champion?: string;
  /** Play on this difficulty mode, seeded the same way (default: Normal). */
  mode?: string;
}

export async function startSuite(page: Page, testInfo: TestInfo, settleMs = 400, opts: SuiteOptions = {}): Promise<Suite> {
  const log: string[] = [];
  const errors: string[] = [];
  let current = '';
  const label = (m: string) => (current ? `[${current}] ${m}` : m);

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  if (opts.champion || opts.mode) {
    await page.addInitScript((seed: { champion?: string; mode?: string }) => {
      try {
        const raw = localStorage.getItem('warmup.profile.v1');
        const data = raw ? JSON.parse(raw) : { version: 2 };
        if (seed.champion) data.champion = seed.champion;
        if (seed.mode) data.mode = seed.mode;
        localStorage.setItem('warmup.profile.v1', JSON.stringify(data));
      } catch {
        // Storage blocked: the defaults play.
      }
    }, { champion: opts.champion, mode: opts.mode });
  }
  await page.goto('/', { waitUntil: 'load' });
  await waitForGame(page, settleMs);
  if (opts.arriveAll ?? true) {
    await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.arriveAllNow());
  }

  const pass = (m: string) => {
    log.push('PASS ' + label(m));
  };
  const fail = (m: string) => {
    log.push('FAIL ' + label(m));
    expect.soft(false, label(m)).toBe(true);
  };
  const warn = (m: string) => {
    log.push('WARN ' + label(m));
    testInfo.annotations.push({ type: 'warning', description: label(m) });
  };

  return {
    pass,
    fail,
    warn,
    errors,
    section: (name) => {
      current = name;
    },
    finish: async () => {
      current = 'page errors';
      errors.length === 0 ? pass('none') : fail(errors.join('\n'));

      const count = (kind: string) => log.filter((l) => l.startsWith(kind)).length;
      await testInfo.attach('checks.txt', { body: log.join('\n'), contentType: 'text/plain' });
      console.log(
        `${testInfo.title.split(':')[0]}: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} warnings`,
      );
    },
  };
}
