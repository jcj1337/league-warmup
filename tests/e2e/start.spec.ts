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
      s.startTexts.includes('CHOOSE YOUR CHAMPION') && s.startTexts.includes('DESIGNED BY QWER') && s.startTexts.includes('TOP 50') && s.startTexts.length === 5
      ? pass("start screen shows QWER'S BACKYARD, the champion row, the prompt and the credit with its TOP 50 badge, nothing else")
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

  // === 1b. Champion select ====================================================
  section('1b. Champion select');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__warmup?.scene?.getScene('UIScene')?.startScreen?.visible);
  await page.waitForTimeout(100);
  const row = () => page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    const tile = ui.championRow.tiles.get('ezreal');
    return {
      selected: ui.championRow.selectedId as string,
      tiles: [...ui.championRow.tiles.keys()] as string[],
      champions: Object.keys(window.__champions) as string[],
      tile: tile ? { x: tile.cx as number, y: tile.cy as number } : null,
      profile: window.__profile.data.champion as string,
      hudChampion: window.__warmup.scene.getScene('GameScene').getHudState().champion as string,
    };
  });
  {
    const r = await row();
    r.selected === 'ezreal' && r.profile === 'ezreal' && r.hudChampion === 'ezreal' && r.tiles.join() === r.champions.join()
      ? pass(`the row shows every champion (${r.tiles.join(', ')}) with the profile's pick framed`)
      : fail(`row: ${JSON.stringify(r)}`);
    // A click on a tile picks; it never starts the run.
    if (r.tile) await page.mouse.click(r.tile.x, r.tile.y);
    await page.waitForTimeout(150);
    const s = await game();
    s.awaiting && s.now === 0 ? pass('clicking a champion tile does not start the run') : fail(`tile click: ${JSON.stringify(s)}`);
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  {
    const [r, s] = [await row(), await game()];
    s.awaiting && r.selected === 'ezreal'
      ? pass('the arrow keys browse the row without starting the run')
      : fail(`arrows: ${JSON.stringify({ r, s })}`);
  }
  // "Change champion" from the pause menu: back to the start screen with a fresh, held round.
  await page.mouse.click(1100, 650);
  await page.waitForTimeout(400);
  const roundBefore = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').getHudState().round);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const changeAt = await page.evaluate(() => {
    const t = window.__warmup.scene.getScene('UIScene').pauseMenu.container.list
      .find((o: { type: string; text?: string }) => /Text$/.test(o.type) && o.text === 'CHANGE CHAMPION');
    return t ? { x: t.x, y: t.y } : null;
  });
  // Held like a person's click: the button acts on the press, and the release
  // lands on the start screen a moment later. It must not start the run.
  if (changeAt) {
    await page.mouse.move(changeAt.x, changeAt.y);
    await page.mouse.down();
    await page.waitForFunction((r) => window.__warmup.scene.getScene('GameScene').getHudState().round !== r, roundBefore);
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
  {
    const s = await game();
    changeAt && s.awaiting && s.startVisible && s.now === 0 && !s.paused && !s.menu
      ? pass('Change Champion in the pause menu returns to the start screen with a fresh held round')
      : fail(`change champion: ${JSON.stringify({ changeAt, s })}`);
  }
  await page.mouse.click(1100, 650);
  await page.waitForTimeout(300);

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

  // Garbage in the saved profile falls back to the defaults, setting by setting.
  await page.evaluate(() => localStorage.setItem('warmup.profile.v1', JSON.stringify({
    version: 1, settings: { attackRangeDisplay: 'sometimes', showDamageNumbers: false, pauseOnFocusLoss: 'yes' }, mouseSpeed: 'fast', runs: 'none',
  })));
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 100);
  {
    const s = await page.evaluate(() => ({ ...window.__settings.all(), mouseSpeed: window.__mouseSpeed.value, runs: window.__runs.list().length }));
    s.attackRangeDisplay === 'contextual' && s.showDamageNumbers === false && s.pauseOnFocusLoss === true && s.mouseSpeed === 1 && s.runs === 0
      ? pass('invalid saved values are ignored one by one; valid ones load')
      : fail(`partial load: ${JSON.stringify(s)}`);
  }

  // === 2b. The profile folds in the keys from before it existed ===============
  section('2b. Migration');
  await page.evaluate(() => {
    localStorage.removeItem('warmup.profile.v1');
    localStorage.setItem('warmup.keybinds.v1', JSON.stringify({ skillshotQ: 'KeyY', flash: 'CapsLock' }));
    localStorage.setItem('warmup.mouseSpeed.v1', '2.5');
    localStorage.setItem('warmup.settings.v1', JSON.stringify({ attackRangeDisplay: 'off', showDamageNumbers: true, pauseOnFocusLoss: false }));
    localStorage.setItem('warmup.runHistory.v1', JSON.stringify([
      { at: '2026-10-01T10:00:00.000Z', outcome: 'defeated', stage: 4, wave: 2, runTimeSeconds: 90, growth: 1.15, killedBy: 'magus', damageTaken: { magus: 100 } },
      { broken: true },
    ]));
  });
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 100);
  {
    const m = await page.evaluate(() => ({
      binds: window.__keybinds.all(),
      speed: window.__mouseSpeed.value,
      settings: window.__settings.all(),
      runs: window.__runs.list(),
      profile: window.__profile.data,
      legacyLeft: ['warmup.keybinds.v1', 'warmup.mouseSpeed.v1', 'warmup.settings.v1', 'warmup.runHistory.v1'].filter((k) => localStorage.getItem(k) !== null),
      saved: localStorage.getItem('warmup.profile.v1') !== null,
    }));
    m.binds.abilityQ === 'KeyY' && m.binds.flash === 'CapsLock' && m.speed === 2.5 && m.settings.attackRangeDisplay === 'off' &&
      m.settings.pauseOnFocusLoss === false && m.runs.length === 1 && m.runs[0].stage === 4
      ? pass('old bindings, Mouse Speed, settings and run log all carry into the profile (a broken run is dropped)')
      : fail(`migrated: ${JSON.stringify(m)}`);
    m.legacyLeft.length === 0 && m.saved && m.profile.version === 2 && m.profile.champion === 'ezreal' && m.profile.currency === 0
      ? pass('the profile is saved and the old keys are removed')
      : fail(`cleanup: ${JSON.stringify({ legacyLeft: m.legacyLeft, saved: m.saved, profile: m.profile })}`);
  }
  await page.evaluate(() => window.__profile.reset());
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 100);

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
