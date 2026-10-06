import { test } from '@playwright/test';
import { startSuite, waitForGame } from './support/harness';

// Off unless PW_POINTER_LOCK=1. This suite takes a real pointer lock, and even
// in headless Edge, Windows applies it to the OS cursor: it yanks your mouse
// to the browser's centre while it runs, and your own mouse movement leaks
// into the locked page and fails the checks. Run it on a machine you aren't using.
test.skip(!process.env.PW_POINTER_LOCK, 'takes the real OS cursor; set PW_POINTER_LOCK=1 to run');

test('mouse speed: pause-menu slider, League-style cursor multiplier under pointer lock, Escape, saved across reloads', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const state = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const p = window.__warmup.input.activePointer;
    const s = ui.pauseMenu.sliders[0];
    return {
      speed: window.__mouseSpeed.value as number,
      shown: s.value.text as string,
      locked: document.pointerLockElement === window.__warmup.canvas,
      paused: g.isPaused as boolean,
      menu: ui.pauseMenu.visible as boolean,
      pending: g.inputs.attackMovePending as boolean,
      px: p.x as number,
      py: p.y as number,
      dest: { x: g.player.destX as number | null, y: g.player.destY as number | null },
    };
  });
  const slider = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('UIScene').pauseMenu.sliders[0];
    return { x0: s.x0 as number, width: s.width as number, y: s.knob.y as number };
  });
  const resumeButton = () => page.evaluate(() => {
    const menu = window.__warmup.scene.getScene('UIScene').pauseMenu;
    const t = menu.container.list.find((o: { text?: string }) => o.text === 'RESUME');
    return { x: t.x as number, y: t.y as number };
  });
  /** Enemies out of the way of the cursor checks, player parked low mid-arena. */
  const clearField = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    for (const e of g.enemies) { e.x = 80; e.y = 640; }
    g.player.x = 640; g.player.y = 500; g.player.stop();
  });

  // === 1. Default: 1.0, the plain OS cursor ===================================
  section('1. Default');
  await page.mouse.move(640, 300);
  await page.mouse.click(640, 300, { button: 'right' });
  await page.waitForTimeout(150);
  {
    const s = await state();
    s.speed === 1 && s.shown === '1.0' ? pass('Mouse Speed defaults to 1.0') : fail(`default: ${JSON.stringify(s)}`);
    !s.locked ? pass('at 1.0 a click in play takes no pointer lock') : fail('locked at speed 1');
  }

  // === 2. The slider ==========================================================
  section('2. Slider');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  {
    const sl = await slider();
    await page.mouse.click(sl.x0 - 4, sl.y);
    let s = await state();
    s.speed === 0.1 && s.shown === '0.1' ? pass('clicking the track start sets 0.1 (MOUSE.minSpeed)') : fail(`min: ${JSON.stringify(s)}`);
    await page.mouse.click(sl.x0 + sl.width + 4, sl.y);
    s = await state();
    s.speed === 10 && s.shown === '10.0' ? pass('clicking the track end sets 10.0') : fail(`max: ${JSON.stringify(s)}`);
    // Drag from the start to the middle, ending off the track.
    await page.mouse.move(sl.x0, sl.y);
    await page.mouse.down();
    await page.mouse.move(sl.x0 + sl.width / 2, sl.y + 40, { steps: 6 });
    await page.mouse.up();
    s = await state();
    s.speed === 5 && s.shown === '5.0' ? pass('dragging to the middle sets 5.0') : fail(`drag: ${JSON.stringify(s)}`);
    await page.mouse.move(sl.x0 + 20, sl.y);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(80);
    s = await state();
    s.speed === 5.1 ? pass('scrolling up over the slider nudges +0.1') : fail(`wheel: ${JSON.stringify(s)}`);
    s.paused && s.menu ? pass('the menu stays open throughout') : fail(`menu closed: ${JSON.stringify(s)}`);
  }

  // === 3. Speed 2: locked, the cursor moves twice as far ======================
  section('3. Speed 2');
  await page.evaluate(() => window.__mouseSpeed.set(2));
  await page.waitForTimeout(50);
  {
    const s = await state();
    s.shown === '2.0' ? pass('a console change shows on the open slider') : fail(`shown: ${s.shown}`);
  }
  await clearField();
  const resume = await resumeButton();
  await page.mouse.click(resume.x, resume.y);
  await page.waitForTimeout(150);
  {
    const s = await state();
    !s.paused && s.locked ? pass('Resume takes the pointer lock with no extra click') : fail(`resume: ${JSON.stringify(s)}`);
  }
  await clearField();
  const start = await state();
  await page.mouse.move(resume.x + 50, resume.y + 30, { steps: 5 });
  await page.waitForTimeout(80);
  {
    const s = await state();
    const dx = s.px - start.px;
    const dy = s.py - start.py;
    Math.abs(dx - 100) < 1 && Math.abs(dy - 60) < 1
      ? pass(`moving the mouse (+50, +30) moves the cursor (+${dx.toFixed(0)}, +${dy.toFixed(0)})`)
      : fail(`2x: start ${start.px},${start.py} now ${s.px},${s.py}`);
  }
  {
    const before = await state();
    await page.mouse.click(resume.x + 50, resume.y + 30, { button: 'right' });
    await page.waitForTimeout(80);
    const s = await state();
    s.dest.x !== null && Math.abs(s.dest.x - before.px) < 1 && Math.abs((s.dest.y ?? 0) - before.py) < 1
      ? pass('right-click moves to the game cursor, not the OS cursor')
      : fail(`move order at ${JSON.stringify(s.dest)}, cursor ${before.px},${before.py}`);
  }
  await page.mouse.move(1279, 719, { steps: 4 });
  await page.waitForTimeout(80);
  {
    const s = await state();
    s.px < 1280 && s.py < 720 && s.px > 1270 && s.py > 710
      ? pass(`the cursor stops at the game's edge (${s.px.toFixed(0)}, ${s.py.toFixed(0)})`)
      : fail(`clamp: ${s.px},${s.py}`);
  }

  // === 4. Escape while locked =================================================
  section('4. Escape');
  await page.keyboard.press('a');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  {
    const s = await state();
    !s.pending && !s.paused ? pass('Escape with A armed backs out of A-targeting, no pause') : fail(`A + Esc: ${JSON.stringify(s)}`);
  }
  // The browser refuses a new lock for about a second after the player exits one.
  await page.waitForTimeout(1200);
  await page.mouse.click(640, 300, { button: 'right' });
  await page.waitForTimeout(150);
  {
    const s = await state();
    s.locked ? pass('a click in play takes the lock back') : fail('no relock after a click');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  {
    const s = await state();
    s.paused && s.menu && !s.locked ? pass('Escape releases the lock and opens the menu (and it stays open)') : fail(`Esc: ${JSON.stringify(s)}`);
  }

  // === 5. Speed 0.5 ===========================================================
  section('5. Speed 0.5');
  await page.evaluate(() => window.__mouseSpeed.set(0.5));
  await page.waitForTimeout(1200);
  await page.mouse.click(resume.x, resume.y);
  await page.waitForTimeout(150);
  {
    const a = await state();
    await page.mouse.move(resume.x + 100, resume.y, { steps: 5 });
    await page.waitForTimeout(80);
    const b = await state();
    a.locked && Math.abs(b.px - a.px - 50) < 1
      ? pass('at 0.5, +100 of mouse moves the cursor +50')
      : fail(`0.5x: ${JSON.stringify({ a, b })}`);
  }

  // === 6. The setting outlives a reload; back at 1 it is the OS cursor again ==
  section('6. Reload, back to 1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__mouseSpeed.set(3.7));
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 0);
  {
    const v = await page.evaluate(() => window.__mouseSpeed.value);
    v === 3.7 ? pass('Mouse Speed survives a reload (localStorage)') : fail(`after reload: ${v}`);
  }
  await page.evaluate(() => window.__mouseSpeed.set(1));
  await page.mouse.click(640, 300, { button: 'right' });
  await page.waitForTimeout(150);
  {
    const s = await state();
    !s.locked ? pass('back at 1.0, no lock') : fail('locked at 1.0');
  }

  await finish();
});
