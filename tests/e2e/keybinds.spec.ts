import { test } from '@playwright/test';
import { startSuite, waitForGame } from './support/harness';

test('keybinds: rebind from the pause menu, swaps, Escape cancels, ability bar labels, saved across tabs, reset', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const binds = () => page.evaluate(() => window.__keybinds.all());
  const slotKeys = () => page.evaluate(() =>
    window.__warmup.scene.getScene('UIScene').abilityBar.slots.map((s) => ({ text: s.keyText.text, size: s.keyText.fontSize })));
  const menu = () => page.evaluate(() => {
    const m = window.__warmup.scene.getScene('UIScene').pauseMenu;
    return {
      visible: m.visible,
      paused: window.__warmup.scene.getScene('GameScene').isPaused,
      status: m.status.text,
      rows: Object.fromEntries(m.bindRows.map((r) => [r.action, r.value.text])),
    };
  });
  /** Click a key row in the open pause menu. */
  const clickRow = async (action: string) => {
    const at = await page.evaluate((action) => {
      const r = window.__warmup.scene.getScene('UIScene').pauseMenu.bindRows.find((b) => b.action === action);
      return { x: r.value.x - 40, y: r.value.y };
    }, action);
    await page.mouse.click(at.x, at.y);
  };
  /** Player parked mid-arena, every ability ready, nothing mid-cast, cursor off to the right. */
  const ready = async () => {
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.player.x = 640; g.player.y = 360; g.player.stop();
      g.cast.cancel(); g.cooldowns.reset();
    });
    await page.mouse.move(900, 360);
  };
  const cooldowns = () => page.evaluate(() => {
    const c = window.__warmup.scene.getScene('GameScene').cooldowns;
    return { q: c.remainingMs('q'), w: c.remainingMs('w'), e: c.remainingMs('e'), flash: c.remainingMs('flash') };
  });

  // === 1. Defaults ===========================================================
  section('1. Defaults');
  {
    const b = await binds();
    b.skillshotQ === 'KeyQ' && b.skillshotW === 'KeyW' && b.blinkE === 'KeyE' && b.flash === 'KeyF' &&
      b.attackMoveClick === 'KeyT' && b.attackMove === 'KeyA' && b.stop === 'KeyS' && b.chatMode === 'KeyZ'
      ? pass('defaults: Q W E F, T / A attack-move, S stop, Z chat')
      : fail(`defaults: ${JSON.stringify(b)}`);
    const slots = await slotKeys();
    slots.map((s) => s.text).join('') === 'QWEF' ? pass('ability bar shows Q W E F') : fail(`slots: ${JSON.stringify(slots)}`);
  }
  await page.keyboard.press('Escape');
  {
    const m = await menu();
    m.visible && Object.values(m.rows).join(',') === 'Q,W,E,F,T,A,S,Z'
      ? pass('the pause menu lists all eight bindings')
      : fail(`menu rows: ${JSON.stringify(m)}`);
  }

  // === 2. Rebind Q to Y =======================================================
  section('2. Rebind');
  await clickRow('skillshotQ');
  {
    const m = await menu();
    m.rows.skillshotQ === 'PRESS A KEY' && /PRESS A KEY/.test(m.status)
      ? pass('clicking a row waits for a key')
      : fail(`waiting: ${JSON.stringify(m)}`);
  }
  await page.keyboard.press('y');
  {
    const [b, m, slots] = [await binds(), await menu(), await slotKeys()];
    b.skillshotQ === 'KeyY' && m.rows.skillshotQ === 'Y' && slots[0].text === 'Y' && m.visible && m.paused
      ? pass('pressing Y binds Q to Y: menu row and ability bar both say Y, menu stays open')
      : fail(`rebind: ${JSON.stringify({ b, m, slots })}`);
  }

  // Escape while waiting cancels the rebind, not the menu.
  await clickRow('skillshotW');
  await page.keyboard.press('Escape');
  {
    const [b, m] = [await binds(), await menu()];
    b.skillshotW === 'KeyW' && m.rows.skillshotW === 'W' && m.visible && m.paused && m.status === ''
      ? pass('Escape while waiting cancels the rebind and keeps the menu open')
      : fail(`escape cancel: ${JSON.stringify({ b, m })}`);
  }

  // A key already in use swaps.
  await clickRow('skillshotW');
  await page.keyboard.press('e');
  {
    const [b, m] = [await binds(), await menu()];
    b.skillshotW === 'KeyE' && b.blinkE === 'KeyW' && m.status === 'E MOVED TO W'
      ? pass(`a taken key swaps: W on E, E moved to W ("${m.status}")`)
      : fail(`swap: ${JSON.stringify({ b, m })}`);
  }

  // Flash on Caps Lock: a long name drops to the small font in the slot.
  await clickRow('flash');
  await page.keyboard.press('CapsLock');
  {
    const [b, slots] = [await binds(), await slotKeys()];
    b.flash === 'CapsLock' && slots[3].text === 'CAPS' && slots[3].size < slots[0].size
      ? pass('Flash on Caps Lock: the slot reads CAPS in the small font')
      : fail(`caps: ${JSON.stringify({ b, slots })}`);
  }

  // === 3. The new keys play ===================================================
  section('3. In play');
  await page.keyboard.press('Escape');
  {
    const m = await menu();
    !m.visible && !m.paused ? pass('Escape (not waiting) closes the menu') : fail(`close: ${JSON.stringify(m)}`);
  }
  await ready();
  await page.keyboard.press('q');
  const afterQ = await cooldowns();
  await page.keyboard.press('y');
  const afterY = await cooldowns();
  afterQ.q === 0 && afterY.q > 0
    ? pass('Q no longer casts the skillshot; Y does')
    : fail(`q/y: ${JSON.stringify({ afterQ, afterY })}`);
  await ready();
  await page.keyboard.press('e');
  const afterE = await cooldowns();
  afterE.w > 0 && afterE.e === 0
    ? pass('E now casts the W mark, not the E blink')
    : fail(`e: ${JSON.stringify(afterE)}`);
  await ready();
  await page.keyboard.press('f');
  const afterF = await cooldowns();
  await page.keyboard.press('CapsLock');
  const afterCaps = await cooldowns();
  afterF.flash === 0 && afterCaps.flash > 0
    ? pass('F no longer flashes; Caps Lock does')
    : fail(`flash: ${JSON.stringify({ afterF, afterCaps })}`);

  // The chat toggle follows its binding too.
  await page.evaluate(() => window.__keybinds.set('chatMode', 'KeyX'));
  const dark0 = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').chat.dark);
  await page.keyboard.press('z');
  const darkZ = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').chat.dark);
  await page.keyboard.press('x');
  const darkX = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').chat.dark);
  darkZ === dark0 && darkX !== dark0
    ? pass('chat light / dark moves to its new key (X), Z does nothing')
    : fail(`chat: ${JSON.stringify({ dark0, darkZ, darkX })}`);

  // === 4. Saved in the browser ==============================================
  section('4. Saved');
  {
    // A brand-new tab shares localStorage but not sessionStorage: this is "closed the tab, came back later".
    const other = await page.context().newPage();
    await other.goto('/', { waitUntil: 'load' });
    await waitForGame(other, 100);
    const b = await other.evaluate(() => window.__keybinds.all());
    await other.close();
    b.skillshotQ === 'KeyY' && b.flash === 'CapsLock' && b.chatMode === 'KeyX'
      ? pass('bindings carry over to a new tab (localStorage)')
      : fail(`new tab: ${JSON.stringify(b)}`);
  }
  await page.bringToFront();
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 300);
  {
    const [b, slots] = [await binds(), await slotKeys()];
    b.skillshotQ === 'KeyY' && b.flash === 'CapsLock' && b.chatMode === 'KeyX' && slots[0].text === 'Y' && slots[3].text === 'CAPS'
      ? pass('bindings survive a reload, ability bar included')
      : fail(`after reload: ${JSON.stringify({ b, slots })}`);
  }

  // === 5. Reset ===============================================================
  section('5. Reset');
  await page.keyboard.press('Escape');
  const resetAt = await page.evaluate(() => {
    const t = window.__warmup.scene.getScene('UIScene').pauseMenu.container.list
      .find((o) => /Text$/.test(o.type) && o.text === 'RESET KEYS');
    return t ? { x: t.x, y: t.y } : null;
  });
  if (resetAt) await page.mouse.click(resetAt.x, resetAt.y);
  {
    const [b, m, slots] = [await binds(), await menu(), await slotKeys()];
    b.skillshotQ === 'KeyQ' && b.flash === 'KeyF' && b.chatMode === 'KeyZ' && slots.map((s) => s.text).join('') === 'QWEF' &&
      m.status === 'KEYS RESET TO DEFAULTS'
      ? pass('RESET KEYS restores the defaults, menu and ability bar')
      : fail(`reset: ${JSON.stringify({ resetAt, b, m, slots })}`);
  }
  await page.keyboard.press('Escape');

  // Broken saved bindings (two actions on one key) fall back to the defaults.
  await page.evaluate(() => localStorage.setItem('warmup.keybinds.v1', JSON.stringify({ skillshotQ: 'KeyW' })));
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 300);
  {
    const b = await binds();
    b.skillshotQ === 'KeyQ' && b.skillshotW === 'KeyW'
      ? pass('inconsistent saved bindings are ignored: defaults load')
      : fail(`corrupt: ${JSON.stringify(b)}`);
  }
  // Escape can never be bound.
  const escape = await page.evaluate(() => window.__keybinds.set('stop', 'Escape'));
  !escape.ok && (await binds()).stop === 'KeyS' ? pass('Escape is reserved') : fail(`escape bind: ${JSON.stringify(escape)}`);

  await finish();
});
