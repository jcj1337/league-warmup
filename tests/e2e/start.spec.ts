import { test } from '@playwright/test';
import { startSuite, waitForGame } from './support/harness';

test('start screen, saved pause-menu settings, pause on focus loss', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 200);

  const game = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    return {
      awaiting: g.isAwaitingStart as boolean,
      startVisible: ui.startScreen.visible as boolean,
      startTexts: ui.startScreen.list.filter((o: { text?: string }) => typeof o.text === 'string').map((o: { text: string }) => o.text) as string[],
      now: g.clock.now as number,
      paused: g.isPaused as boolean,
      menu: ui.pauseMenu.visible as boolean,
      player: { x: g.player.x as number, y: g.player.y as number, moving: g.player.isMoving as boolean },
      qCooldown: g.cooldowns.remainingMs('q') as number,
    };
  });
  /** The pause menu's cycling rows, label → shown value. */
  const menuRows = () => page.evaluate(() =>
    Object.fromEntries(window.__warmup.scene.getScene('UIScene').pauseMenu.rows
      .map((r: { row: { label: string }; value: { text: string } }) => [r.row.label, r.value.text])) as Record<string, string>);
  const clickRow = async (label: string) => {
    const at = await page.evaluate((label) => {
      const r = window.__warmup.scene.getScene('UIScene').pauseMenu.rows.find((r: { row: { label: string } }) => r.row.label === label);
      return { x: r.value.x - r.value.width / 2, y: r.value.y };
    }, label);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(30);
  };

  // === 1. A page load waits on the start screen ===============================
  section('1. Start screen');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__warmup?.scene?.getScene('UIScene')?.startScreen?.visible);
  await page.waitForTimeout(300);
  {
    const s = await game();
    s.awaiting && s.startVisible && s.now === 0
      ? pass('the first round holds at time 0 behind the start screen')
      : fail(`held: ${JSON.stringify(s)}`);
    s.startTexts.includes("QWER'S BACKYARD") && s.startTexts.includes('CLICK OR PRESS ANY KEY') &&
      s.startTexts.includes('DESIGNED BY QWER') && s.startTexts.length === 3
      ? pass("start screen shows QWER'S BACKYARD, the prompt and the credit, nothing else")
      : fail(`texts: ${JSON.stringify(s.startTexts)}`);
  }
  // The release of a key pressed before the card (the F5 that reloaded the page) doesn't count.
  await page.keyboard.up('F5');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(100);
  {
    const s = await game();
    s.awaiting && !s.paused && !s.menu
      ? pass('a stray key release and focus loss do nothing on the start screen')
      : fail(`stray inputs: ${JSON.stringify(s)}`);
  }
  // Holding a game key: nothing yet, and no cast.
  await page.mouse.move(900, 500);
  await page.keyboard.down('q');
  await page.waitForTimeout(100);
  {
    const s = await game();
    s.awaiting && s.qCooldown === 0 ? pass('pressing a key holds on the card, no cast') : fail(`key down: ${JSON.stringify(s)}`);
  }
  await page.keyboard.up('q');
  await page.waitForTimeout(300);
  {
    const s = await game();
    !s.awaiting && !s.startVisible && s.now > 100 && s.qCooldown === 0
      ? pass('releasing any key starts the run, and the key is not also a cast')
      : fail(`key up: ${JSON.stringify(s)}`);
  }

  // Escape is a key too: it starts the run and never opens the pause menu on the way.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__warmup?.scene?.getScene('UIScene')?.startScreen?.visible);
  await page.keyboard.down('Escape');
  await page.waitForTimeout(80);
  const escHeld = await game();
  await page.keyboard.up('Escape');
  await page.waitForTimeout(200);
  {
    const s = await game();
    escHeld.awaiting && !escHeld.menu && !s.awaiting && !s.paused && !s.menu
      ? pass('Escape starts the run without opening the pause menu')
      : fail(`escape: ${JSON.stringify({ escHeld, s })}`);
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__warmup?.scene?.getScene('UIScene')?.startScreen?.visible);
  await page.waitForTimeout(100);
  // A right-click would be a move order in play: the starting click must not be one.
  const before = await game();
  await page.mouse.click(1100, 600, { button: 'right' });
  await page.waitForTimeout(300);
  {
    const s = await game();
    const moved = Math.hypot(s.player.x - before.player.x, s.player.y - before.player.y);
    !s.awaiting && !s.startVisible && s.now > 100
      ? pass('a click starts the run and the clock')
      : fail(`after click: ${JSON.stringify(s)}`);
    moved < 2 && !s.player.moving
      ? pass('the starting click is not also a move order')
      : fail(`player moved ${moved.toFixed(1)}px`);
  }

  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').restartRound());
  await page.waitForTimeout(200);
  {
    const s = await game();
    !s.awaiting && !s.startVisible && s.now > 0
      ? pass('a restart goes straight into play, no start screen')
      : fail(`after restart: ${JSON.stringify(s)}`);
  }

  // === 2. Settings are saved ==================================================
  section('2. Saved settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const defaults = await menuRows();
  defaults['Range Indicator'] === 'CONTEXTUAL' && defaults['Damage Numbers'] === 'ON' && defaults['Pause on Focus Loss'] === 'ON'
    ? pass('defaults: CONTEXTUAL / ON / ON')
    : fail(`defaults: ${JSON.stringify(defaults)}`);
  await clickRow('Range Indicator');
  await clickRow('Damage Numbers');
  await clickRow('Pause on Focus Loss');
  const changed = await menuRows();
  changed['Range Indicator'] === 'ALWAYS' && changed['Damage Numbers'] === 'OFF' && changed['Pause on Focus Loss'] === 'OFF'
    ? pass('clicking cycles each setting')
    : fail(`changed: ${JSON.stringify(changed)}`);

  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 100);
  {
    const live = await page.evaluate(() => ({
      range: window.__balance.DEBUG.attackRangeDisplay,
      numbers: window.__balance.DEBUG.showDamageNumbers,
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const rows = await menuRows();
    live.range === 'always' && live.numbers === false &&
      rows['Range Indicator'] === 'ALWAYS' && rows['Damage Numbers'] === 'OFF' && rows['Pause on Focus Loss'] === 'OFF'
      ? pass('all three settings survive a reload, in the game and the menu')
      : fail(`after reload: ${JSON.stringify({ live, rows })}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }

  // Garbage in storage falls back to the defaults, setting by setting.
  await page.evaluate(() => localStorage.setItem('warmup.settings.v1', JSON.stringify({ attackRangeDisplay: 'sometimes', showDamageNumbers: false, pauseOnFocusLoss: 'yes' })));
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 100);
  {
    const s = await page.evaluate(() => window.__settings.all());
    s.attackRangeDisplay === 'contextual' && s.showDamageNumbers === false && s.pauseOnFocusLoss === true
      ? pass('invalid saved values are ignored one by one; valid ones load')
      : fail(`partial load: ${JSON.stringify(s)}`);
  }

  // === 3. Pause on focus loss =================================================
  section('3. Focus loss');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(50);
  {
    const s = await game();
    s.paused && s.menu ? pass('ON: losing window focus opens the pause menu') : fail(`blur, on: ${JSON.stringify(s)}`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__settings.pauseOnFocusLoss = false;
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(50);
  {
    const s = await game();
    !s.paused && !s.menu ? pass('OFF: losing focus leaves the run playing') : fail(`blur, off: ${JSON.stringify(s)}`);
  }

  await finish();
});
