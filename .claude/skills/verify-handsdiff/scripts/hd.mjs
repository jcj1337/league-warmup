#!/usr/bin/env node
/**
 * verify-handsdiff harness: drive the real game in a browser and keep the proof.
 *
 *   node .claude/skills/verify-handsdiff/scripts/hd.mjs serve           start a Vite dev server this harness owns
 *   node .claude/skills/verify-handsdiff/scripts/hd.mjs doctor          read-only: is that instance worth driving?
 *   node .claude/skills/verify-handsdiff/scripts/hd.mjs run <journey>   drive a journey module in a fresh headless Edge
 *   node .claude/skills/verify-handsdiff/scripts/hd.mjs stop            kill the server this harness started; keep evidence
 *   node .claude/skills/verify-handsdiff/scripts/hd.mjs runs            list evidence folders and their verdicts
 *
 * Flags: --port N (default 5180), --headed (run only), --channel msedge|chromium (default msedge).
 * State lives in <repo>/.verify/ (git-ignored by its own .gitignore). Evidence: <repo>/.verify/runs/.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const STATE_DIR = path.join(REPO, '.verify');
const RUNS_DIR = path.join(STATE_DIR, 'runs');
const VIEWPORT = { width: 1280, height: 720 };

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = { port: 5180, headed: false, channel: 'msedge' };
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--port') flags.port = Number(argv[++i]);
  else if (a === '--headed') flags.headed = true;
  else if (a === '--channel') flags.channel = argv[++i];
  else positional.push(a);
}
const PORT = flags.port;
const URL_ = `http://127.0.0.1:${PORT}/`;
const SERVER_FILE = path.join(STATE_DIR, `server-${PORT}.json`);
const SERVER_LOG = path.join(STATE_DIR, `server-${PORT}.log`);

// ---------------------------------------------------------------- os helpers

function sh(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch {
    return null;
  }
}

/** The pid listening on `port`, null when nothing listens. */
function listenerPid(port) {
  if (process.platform === 'win32') {
    const out = sh('netstat', ['-ano']) ?? '';
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      if (cols[0] === 'TCP' && cols[3] === 'LISTENING' && cols[1].endsWith(`:${port}`)) return Number(cols[4]);
    }
    return null;
  }
  const out = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return out && out.trim() ? Number(out.trim().split(/\s+/)[0]) : null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function commandLine(pid) {
  if (process.platform === 'win32') {
    return (sh('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`]) ?? '').trim();
  }
  return (sh('ps', ['-o', 'args=', '-p', String(pid)]) ?? '').trim();
}

/** True only for the Vite process this harness spawned for this port (guards against pid reuse). */
function isOurServer(s) {
  if (!s || !pidAlive(s.pid)) return false;
  const line = commandLine(s.pid);
  return line.includes('vite') && line.includes('--port') && line.includes(String(s.port));
}

function killTree(pid) {
  if (process.platform === 'win32') sh('taskkill', ['/PID', String(pid), '/T', '/F']);
  else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  }
}

function git(...args) {
  return (sh('git', ['-C', REPO, ...args]) ?? '').trim();
}

function ensureStateDir() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const ignore = path.join(STATE_DIR, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# verify-handsdiff scratch and evidence: never committed\n*\n');
}

function readServer() {
  try {
    return JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8'));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await res.text();
    return {
      status: res.status,
      title: /<title>([^<]*)<\/title>/.exec(body)?.[1] ?? null,
      dev: body.includes('/@vite/client') && body.includes('/src/main.ts'),
    };
  } catch (e) {
    return { status: 0, error: String(e.cause?.code ?? e.message) };
  }
}

// ---------------------------------------------------------------- browser

async function launchBrowser(headed) {
  const { chromium } = await import('@playwright/test');
  return chromium.launch({ channel: flags.channel, headless: !headed });
}

/** Both scenes created and the start screen up: the page is usable. */
const BOOTED = () => {
  try {
    const s = window.__warmup?.scene;
    const ui = s?.getScene('UIScene');
    return Boolean(s?.getScene('GameScene')?.clock && ui?.pauseMenu && ui.startScreen?.visible);
  } catch {
    return false;
  }
};

/** Load the game in a fresh browser to its start screen. Warms Vite's dep optimiser on the first call. */
async function bootProbe(url) {
  const browser = await launchBrowser(false);
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(BOOTED, null, { timeout: 60_000 });
    const info = await page.evaluate(() => ({
      title: document.title,
      champions: Object.keys(window.__champions),
      modes: Object.keys(window.__balance.MODES),
      held: window.__warmup.scene.getScene('GameScene').isAwaitingStart,
      mouseSpeed: window.__mouseSpeed.value,
    }));
    return { ok: errors.length === 0 && info.held, ms: Date.now() - t0, errors, info };
  } catch (e) {
    return { ok: false, errors: [String(e.message ?? e)], info: null };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- serve / stop / doctor

async function serve() {
  ensureStateDir();
  const existing = readServer();
  if (existing && isOurServer(existing) && listenerPid(PORT) === existing.pid) {
    console.log(`READY ${URL_} (already serving: pid ${existing.pid}, started ${existing.startedAt})`);
    return;
  }
  if (existing) fs.rmSync(SERVER_FILE, { force: true });
  const holder = listenerPid(PORT);
  if (holder) {
    console.error(`port ${PORT} is held by pid ${holder}, which this harness did not start. Use --port <other>; never kill it.`);
    process.exit(2);
  }
  const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) {
    console.error('node_modules/vite is missing: run `npm install` in the repo first.');
    process.exit(2);
  }

  const log = fs.openSync(SERVER_LOG, 'w');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, VITE_NO_OPEN: '1' },
    windowsHide: true,
  });
  child.unref();
  const server = { pid: child.pid, port: PORT, url: URL_, startedAt: new Date().toISOString(), commit: git('rev-parse', '--short', 'HEAD'), log: SERVER_LOG };
  fs.writeFileSync(SERVER_FILE, JSON.stringify(server, null, 2));

  const deadline = Date.now() + 60_000;
  let last = null;
  while (Date.now() < deadline) {
    if (!pidAlive(child.pid)) break;
    last = await probe(URL_);
    if (last.status === 200 && last.dev && /hands diff/.test(last.title ?? '')) break;
    await sleep(250);
  }
  if (!(last?.status === 200 && last.dev)) {
    console.error(`vite did not come up on ${URL_}: ${JSON.stringify(last)}\n--- ${SERVER_LOG}\n${fs.readFileSync(SERVER_LOG, 'utf8').slice(-2000)}`);
    if (pidAlive(child.pid)) killTree(child.pid);
    fs.rmSync(SERVER_FILE, { force: true });
    process.exit(1);
  }
  console.log(`http up on ${URL_} (pid ${child.pid}); booting the game in a browser...`);
  const boot = await bootProbe(URL_);
  if (!boot.ok) {
    console.error(`the page answers but the game did not reach its start screen cleanly:\n${boot.errors.join('\n')}`);
    process.exit(1);
  }
  console.log(`READY ${URL_} pid=${child.pid} boot=${boot.ms}ms champions=${boot.info.champions.join(',')} modes=${boot.info.modes.join(',')}`);
}

async function stop() {
  const s = readServer();
  if (!s) {
    console.log(`no server recorded for port ${PORT} (nothing to stop). Evidence stays in ${RUNS_DIR}`);
    return;
  }
  if (isOurServer(s)) {
    killTree(s.pid);
    for (let i = 0; i < 40 && listenerPid(PORT) === s.pid; i++) await sleep(250);
    console.log(`stopped vite pid ${s.pid} on port ${PORT}`);
  } else {
    console.log(`recorded pid ${s.pid} is gone or is no longer our vite: left it alone`);
  }
  fs.rmSync(SERVER_FILE, { force: true });
  fs.rmSync(SERVER_LOG, { force: true });
  const holder = listenerPid(PORT);
  if (holder) console.log(`WARNING: port ${PORT} is still held by pid ${holder} (not ours to kill)`);
  console.log(`evidence kept in ${RUNS_DIR}`);
}

async function doctor() {
  const rows = [];
  const row = (name, ok, detail) => rows.push({ name, ok, detail });

  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')); } catch { /* reported below */ }
  row('repo', pkg?.name === 'warmup', `${REPO} (package ${pkg?.name ?? 'missing'})`);
  row('deps', fs.existsSync(path.join(REPO, 'node_modules/vite')) && fs.existsSync(path.join(REPO, 'node_modules/@playwright/test')), 'node_modules has vite and @playwright/test');

  const s = readServer();
  row('server file', Boolean(s), s ? `${SERVER_FILE} pid ${s.pid}, started ${s.startedAt} at ${s.commit}` : `${SERVER_FILE} missing: run serve`);
  if (s) {
    const ours = isOurServer(s);
    row('process', ours, ours ? `pid ${s.pid} is our vite (${commandLine(s.pid).slice(0, 90)})` : `pid ${s.pid} is gone or is not our vite`);
    const holder = listenerPid(PORT);
    row('port owner', holder === s.pid, `port ${PORT} listener pid ${holder ?? 'none'}`);
    const p = await probe(URL_);
    row('http', p.status === 200 && p.dev && /hands diff/.test(p.title ?? ''), `${URL_} -> ${p.status} title "${p.title}" dev=${p.dev}${p.error ? ' ' + p.error : ''}`);
    const head = git('rev-parse', '--short', 'HEAD');
    const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
    row('build', true, `HEAD ${head}${head !== s.commit ? ` (served since ${s.commit}; vite serves the live tree)` : ''}, ${dirty} uncommitted path(s) are what you will drive`);
    if (p.status === 200) {
      const boot = await bootProbe(URL_);
      row('game boots', boot.ok, boot.info
        ? `start screen in ${boot.ms}ms, held=${boot.info.held}, champions ${boot.info.champions.join(',')}, modes ${boot.info.modes.join(',')}, page errors ${boot.errors.length}${boot.errors.length ? ': ' + boot.errors.join(' | ') : ''}`
        : boot.errors.join(' | '));
    }
  }
  for (const r of rows) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name.padEnd(12)} ${r.detail}`);
  const ok = rows.every((r) => r.ok);
  console.log(ok ? 'DOCTOR OK' : 'DOCTOR FAIL');
  process.exitCode = ok ? 0 : 1;
}

function runs() {
  if (!fs.existsSync(RUNS_DIR)) return console.log(`no runs in ${RUNS_DIR}`);
  for (const d of fs.readdirSync(RUNS_DIR).sort()) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, d, 'summary.json'), 'utf8'));
      console.log(`${s.verdict.padEnd(4)} ${d}  pass ${s.pass} fail ${s.fail} page errors ${s.pageErrors}`);
    } catch {
      console.log(`????  ${d}  (no summary.json: the run was interrupted)`);
    }
  }
}

// ---------------------------------------------------------------- run

/** Blocks the Mouse Speed pointer lock: on Windows it grabs the real OS cursor even headless. */
function blockPointerLock() {
  Element.prototype.requestPointerLock = function () {
    window.__hdPointerLockBlocked = (window.__hdPointerLockBlocked || 0) + 1;
    return Promise.reject(new DOMException('pointer lock blocked by verify-handsdiff', 'NotAllowedError'));
  };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function makeApi(page, dir, log) {
  const t0 = Date.now();
  let n = 0;
  let step = '';
  const counts = { pass: 0, fail: 0 };
  const seq = () => String(++n).padStart(2, '0');
  const line = (kind, msg) => {
    const l = `${((Date.now() - t0) / 1000).toFixed(2).padStart(7)}s ${kind.padEnd(5)} ${msg}`;
    log.push(l);
    console.log(l);
  };
  /** Every input helper takes (x, y, opts) or ({ x, y }, opts), so a locator's result passes straight in. */
  const pt = (a, b, c) => (typeof a === 'object' && a !== null ? [a.x, a.y, b ?? {}] : [a, b, c ?? {}]);
  const toPage = (x, y) => page.evaluate(([x, y]) => {
    const c = window.__warmup.canvas.getBoundingClientRect();
    const s = window.__warmup.scale.gameSize;
    return { x: c.left + (x * c.width) / s.width, y: c.top + (y * c.height) / s.height };
  }, [x, y]);
  const ui = (fn, arg) => page.evaluate(fn, arg);

  const hd = {
    page,
    dir,
    counts,

    // ---- lifecycle
    async open() {
      line('ACT', 'open /');
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForFunction(BOOTED, null, { timeout: 30_000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(150);
    },
    async reload() {
      line('ACT', 'reload');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(BOOTED, null, { timeout: 30_000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(150);
    },
    /** Leave the start screen the way a player does: a click on empty card space, or press-and-release `key`. */
    async startRun(key) {
      if (key) await hd.press(key);
      else await hd.click(1100, 650);
      return hd.waitFor(() => {
        const g = window.__warmup.scene.getScene('GameScene');
        return !g.isAwaitingStart && g.clock.now > 100;
      }, null, { label: 'run started and the clock is running' });
    },

    // ---- input (game coordinates: the 1280x720 arena; converted to page pixels here)
    async move(a, b) {
      const [x, y] = pt(a, b);
      line('ACT', `move (${Math.round(x)},${Math.round(y)})`);
      const p = await toPage(x, y);
      await page.mouse.move(p.x, p.y);
    },
    async click(a, b, c) {
      const [x, y, o] = pt(a, b, c);
      const button = o.button ?? 'left';
      line('ACT', `click ${button} (${Math.round(x)},${Math.round(y)})${o.hold ? ` held ${o.hold}ms` : ''}`);
      const p = await toPage(x, y);
      if (o.hold) {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down({ button });
        await page.waitForTimeout(o.hold);
        await page.mouse.up({ button });
      } else {
        await page.mouse.click(p.x, p.y, { button });
      }
    },
    async rclick(a, b) {
      const [x, y] = pt(a, b);
      return hd.click(x, y, { button: 'right' });
    },
    async press(key, o = {}) {
      line('ACT', `press ${key}${o.hold ? ` held ${o.hold}ms` : ''}`);
      if (o.hold) {
        await page.keyboard.down(key);
        await page.waitForTimeout(o.hold);
        await page.keyboard.up(key);
      } else {
        await page.keyboard.press(key);
      }
    },
    async down(key) { line('ACT', `keydown ${key}`); await page.keyboard.down(key); },
    async up(key) { line('ACT', `keyup ${key}`); await page.keyboard.up(key); },

    // ---- waiting
    /** Wall-clock wait. Prefer waitFor / waitGame: the headless page can tick at 300+ fps. */
    wait: (ms) => page.waitForTimeout(ms),
    /** Wait until `ms` of GAME time has passed (frozen while paused). */
    async waitGame(ms, timeout = 10_000) {
      const start = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').clock.now);
      return hd.waitFor((t) => window.__warmup.scene.getScene('GameScene').clock.now >= t, start + ms, { timeout, label: `${ms}ms of game time` });
    },
    /** Poll `fn` in the page until truthy. Never throws: logs WAIT ok / TIMEOUT and returns a boolean. */
    async waitFor(fn, arg, o = {}) {
      const label = o.label ?? 'condition';
      const ok = await page.waitForFunction((src) => {
        try { return new Function('arg', `return (${src.fn})(arg)`)(src.arg); } catch { return false; }
      }, { fn: fn.toString(), arg }, { timeout: o.timeout ?? 5000 }).then(() => true, () => false);
      line(ok ? 'WAIT' : 'TIMEOUT', label);
      return ok;
    },

    // ---- locators: game coordinates of real on-screen controls, or null
    tile: (id) => ui((id) => {
      const t = window.__warmup.scene.getScene('UIScene').championRow.tiles.get(id);
      return t ? { x: t.cx, y: t.cy } : null;
    }, id),
    modeButton: (id) => ui((id) => {
      const b = window.__warmup.scene.getScene('UIScene').modeRow.buttons.get(id);
      return b ? { x: b.cx, y: b.cy } : null;
    }, id),
    /** A text button by its exact label on 'pause' (pause menu), 'end' (end screen) or 'start' (start card). */
    button: (screen, label) => ui(({ screen, label }) => {
      const u = window.__warmup.scene.getScene('UIScene');
      const c = screen === 'pause' ? u.pauseMenu.container : screen === 'end' ? u.endScreen.container : u.startScreen;
      const t = c.list.find((o) => typeof o.text === 'string' && o.text === label);
      if (!t) return null;
      const b = t.getBounds();
      return { x: b.centerX, y: b.centerY };
    }, { screen, label }),
    /** A pause-menu setting's clickable value ('Damage Numbers', 'Pause on Focus Loss'). */
    settingRow: (label) => ui((label) => {
      const r = window.__warmup.scene.getScene('UIScene').pauseMenu.rows.find((r) => r.row.label === label);
      if (!r) return null;
      const b = r.value.getBounds();
      return { x: b.centerX, y: b.centerY };
    }, label),
    /** A pause-menu key row by action ('abilityQ', 'flash', 'stop', ...): the whole row takes the click. */
    bindRow: (action) => ui((action) => {
      const r = window.__warmup.scene.getScene('UIScene').pauseMenu.bindRows.find((b) => b.action === action);
      if (!r) return null;
      const b = r.value.getBounds();
      return { x: b.centerX - 40, y: b.centerY };
    }, action),

    // ---- readers (observation only)
    game: () => ui(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const u = window.__warmup.scene.getScene('UIScene');
      return {
        awaiting: g.isAwaitingStart,
        paused: g.isPaused,
        startScreen: u.startScreen.visible,
        pauseMenu: u.pauseMenu.visible,
        endScreen: u.endScreen.container.visible,
        clockMs: Math.round(g.clock.now),
        hud: g.getHudState(),
        player: { x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.hp, moving: g.player.isMoving, rooted: g.player.isRooted },
        attack: g.attacks.state,
        enemies: g.enemies.filter((e) => e.active).map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })),
        kit: g.kit.stats(),
        result: g.getRoundResult(),
        profile: { champion: window.__profile.data.champion, mode: window.__profile.data.mode },
        mouseSpeed: window.__mouseSpeed.value,
      };
    }),
    startScreen: () => ui(() => {
      const u = window.__warmup.scene.getScene('UIScene');
      return {
        visible: u.startScreen.visible,
        texts: u.startScreen.list.filter((o) => typeof o.text === 'string').map((o) => o.text),
        champion: u.championRow.selectedId,
        mode: u.modeRow.selectedId,
        championTip: u.championRow.tooltipText,
        modeTip: u.modeRow.tooltipText,
      };
    }),
    pauseMenu: () => ui(() => {
      const m = window.__warmup.scene.getScene('UIScene').pauseMenu;
      return {
        visible: m.visible,
        rows: Object.fromEntries(m.rows.map((r) => [r.row.label, r.value.text])),
        binds: Object.fromEntries(m.bindRows.map((r) => [r.action, r.value.text])),
        status: m.status.text,
      };
    }),
    endScreen: () => ui(() => {
      const e = window.__warmup.scene.getScene('UIScene').endScreen;
      return { visible: e.container.visible, title: e.container.getByName('title')?.text ?? null, lines: e.text ? e.text.split('\n') : [] };
    }),
    abilityBar: () => ui(() => (window.__warmup.scene.getScene('UIScene').abilityBar?.slots ?? []).map((s) => s.keyText.text)),
    /** Any other read: `fn` runs in the page. Reads only; use stage() to change state. */
    read: (fn, arg) => page.evaluate(fn, arg),

    // ---- staging: setting up a precondition through the console handles. Logged; never the action under test.
    async stage(label, fn, arg) {
      line('STAGE', label);
      return page.evaluate(fn, arg);
    },

    // ---- evidence
    step(title) { step = title; line('STEP', `== ${title}`); },
    note(msg) { line('NOTE', msg); },
    check(ok, label, detail) {
      const l = step ? `[${step}] ${label}` : label;
      if (ok) { counts.pass++; line('PASS', l); } else { counts.fail++; line('FAIL', `${l}${detail === undefined ? '' : ' :: ' + JSON.stringify(detail)}`); }
      return Boolean(ok);
    },
    /** Screenshot plus the game state at that moment, as NN-name.png / NN-name.json. */
    async shot(name) {
      const base = `${seq()}-${name}`;
      await page.screenshot({ path: path.join(dir, `${base}.png`) });
      const state = await hd.game().catch((e) => ({ error: String(e) }));
      fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(state, null, 2));
      line('SHOT', `${base}.png + .json`);
    },
    save(name, data) {
      const base = `${seq()}-${name}.json`;
      fs.writeFileSync(path.join(dir, base), JSON.stringify(data, null, 2));
      line('SAVE', base);
    },
  };
  return hd;
}

async function run() {
  const journey = positional[0];
  if (!journey) {
    console.error('usage: hd.mjs run <journey.mjs> [--headed] [--port N]');
    process.exit(2);
  }
  const s = readServer();
  if (!s || !isOurServer(s) || (await probe(s.url)).status !== 200) {
    console.error(`no live harness server on port ${PORT}: run \`hd.mjs serve\` (and \`hd.mjs doctor\` if it looks off).`);
    process.exit(2);
  }
  const abs = path.resolve(journey);
  const mod = await import(pathToFileURL(abs).href);
  const name = mod.name ?? path.basename(abs).replace(/\.m?js$/, '');
  ensureStateDir();
  const dir = path.join(RUNS_DIR, `${stamp()}-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  // The proof records exactly what was driven, even if the journey file changes later.
  fs.copyFileSync(abs, path.join(dir, 'journey.mjs'));

  const log = [];
  const consoleLines = [];
  const pageErrors = [];
  const startedAt = new Date().toISOString();
  const browser = await launchBrowser(flags.headed);
  let hd = null;
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, baseURL: s.url });
    await context.addInitScript(blockPointerLock);
    const page = await context.newPage();
    page.on('pageerror', (e) => { pageErrors.push(String(e)); consoleLines.push(`[pageerror] ${e}`); });
    page.on('console', (m) => {
      consoleLines.push(`[${m.type()}] ${m.text()}`);
      if (m.type() === 'error') pageErrors.push('console: ' + m.text());
    });
    hd = makeApi(page, dir, log);
    hd.note(`journey ${abs} -> ${s.url} (${flags.channel}${flags.headed ? ', headed' : ', headless'})`);
    try {
      await mod.default(hd);
    } catch (e) {
      hd.check(false, 'journey threw', String(e.stack ?? e));
      await hd.shot('crash').catch(() => {});
    }
    const blocked = await page.evaluate(() => window.__hdPointerLockBlocked ?? 0).catch(() => 0);
    if (blocked) hd.note(`blocked ${blocked} pointer lock request(s): Mouse Speed is not 1.0 in this run`);
  } finally {
    await browser.close();
  }

  const counts = hd?.counts ?? { pass: 0, fail: 1 };
  const verdict = counts.fail === 0 && pageErrors.length === 0 && counts.pass > 0 ? 'PASS' : 'FAIL';
  const summary = {
    journey: abs, name, verdict, pass: counts.pass, fail: counts.fail, pageErrors: pageErrors.length,
    url: s.url, channel: flags.channel, headed: flags.headed, commit: git('rev-parse', '--short', 'HEAD'),
    uncommitted: git('status', '--porcelain').split('\n').filter(Boolean).length, startedAt, finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'transcript.txt'), log.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'console.txt'), consoleLines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`${verdict} ${name}: ${counts.pass} passed, ${counts.fail} failed, ${pageErrors.length} page errors`);
  if (pageErrors.length) console.log(pageErrors.slice(0, 5).join('\n'));
  console.log(`evidence: ${dir}`);
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}

// ---------------------------------------------------------------- main

const commands = { serve, stop, doctor, run, runs };
if (!commands[cmd]) {
  console.error('usage: hd.mjs serve|doctor|run <journey.mjs>|stop|runs [--port N] [--headed] [--channel msedge|chromium]');
  process.exit(2);
}
await commands[cmd]();
