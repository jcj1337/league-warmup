import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('chat: system messages, missions from STAGES, Z light/dark toggle, bottom-edge drag + input isolation, restart', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    stages: window.__balance.STAGES,
    run: window.__balance.RUN,
    arena: window.__balance.ARENA,
    chat: window.__theme.chat,
  }));
  // Expected wording, built from the stage table the test reads itself.
  const WELCOME = "Welcome to qwer's Backyard!";
  const waves = (n) => `${n} wave${n === 1 ? '' : 's'}`;
  const briefing = (stage) => {
    const n = cfg.stages[stage - 1].waves.length;
    return stage === cfg.stages.length
      ? `Mission ${stage}: Final mission — clear ${waves(n)}.`
      : `Mission ${stage}: Clear ${waves(n)}.`;
  };

  const chat = () => page.evaluate(() => {
    const c = window.__warmup.scene.getScene('UIScene').chat;
    return {
      messages: [...c.messages], x: c.x, y: c.y, w: c.width, h: c.height,
      dark: c.dark, fill: c.drawnFillAlpha, frame: c.panel.alpha, dragging: c.dragging,
    };
  });
  const game = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return {
      px: g.player.x, py: g.player.y, moving: g.player.isMoving,
      target: !!g.attacks.currentTarget, aMove: g.attacks.hasAttackMoveOrder, atk: g.attacks.state,
      apm: g.apm.total,
    };
  });
  const waitFor = (fn, arg: any = null, timeout = 5000) =>
    page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
  const hasMessage = (text, timeout = 5000) =>
    waitFor((t) => window.__warmup.scene.getScene('UIScene').chat.messages.includes(t), text, timeout);
  /** Test-only setup: a stage/wave with a fresh roster, arena quiet. */
  const jumpTo = (stage, wave) => page.evaluate(([st, wv]) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
    g.director.stageIndex = st - 1;
    g.director.waveIndex = wv - 1;
    g.director.spawnWave();
  }, [stage, wave]);
  /** Kill every living enemy through the scene's real hit funnel. */
  const killAll = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = 100;
    for (const e of g.director.enemies) while (e.active) g.onTargetHit(e, e.takeHit());
  });
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  };
  /** A point on the drawn bottom border (the drag handle), and one in the message body. */
  const edgeOf = (c, dx = 40) => ({ x: c.x + dx, y: c.y + c.h - 1 });
  const bodyOf = (c, dx = 40) => ({ x: c.x + dx, y: c.y + 30 });
  /**
   * Press Z and wait until the requested mode is actually DRAWN. Reports how
   * many game frames passed between the keydown reaching the page and that.
   */
  const pressZ = async (wantDark) => {
    await page.evaluate(() => {
      const w = window as any;
      w.__zFrame = null;
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'z') w.__zFrame = window.__warmup.loop.frame;
      }, { capture: true, once: true });
    });
    await page.keyboard.press('z');
    return page.waitForFunction((want) => {
      const w = window as any;
      const c = window.__warmup.scene.getScene('UIScene').chat;
      const t = window.__theme.chat;
      const drawn = c.dark === want
        && c.drawnFillAlpha === (want ? t.darkFillAlpha : t.lightFillAlpha)
        && c.panel.alpha === (want ? t.darkFrameAlpha : t.lightFrameAlpha);
      return drawn && w.__zFrame !== null ? { frames: window.__warmup.loop.frame - w.__zFrame } : null;
    }, wantDark, { polling: 'raf', timeout: 1000 }).then((h) => h.jsonValue()).catch(() => null);
  };

  // === 1. Fresh run ==========================================================
  section('1. Fresh run');
  await waitFor(() => window.__warmup.scene.getScene('UIScene').chat.messages.length >= 2);
  const fresh = await chat();
  fresh.messages[0] === WELCOME ? pass(`opens with "${WELCOME}"`) : fail(`first message: ${JSON.stringify(fresh.messages)}`);
  fresh.messages[1] === briefing(1) && fresh.messages.length === 2
    ? pass(`then "${fresh.messages[1]}" — wave count from STAGES[0]`)
    : fail(`opening messages: ${JSON.stringify(fresh.messages)}, want "${briefing(1)}"`);
  fresh.x <= 60 && fresh.y > cfg.arena.height / 2 && fresh.y + fresh.h <= cfg.arena.height - 96
    ? pass(`default spot is bottom-left, above the HP plate (${fresh.x},${fresh.y} ${fresh.w}x${fresh.h})`)
    : fail(`default chat rect ${JSON.stringify(fresh)}`);
  !fresh.dark && fresh.fill === cfg.chat.lightFillAlpha
    ? pass('starts in light mode')
    : fail(`initial mode: dark=${fresh.dark} fill=${fresh.fill}`);

  // === 2. Z toggles light / dark =============================================
  section('2. Z toggles light / dark');
  cfg.chat.darkFillAlpha > 0.88 && cfg.chat.darkFillAlpha > cfg.chat.lightFillAlpha && cfg.chat.darkFrameAlpha > cfg.chat.lightFrameAlpha
    ? pass(`dark plate ${cfg.chat.darkFillAlpha} vs light ${cfg.chat.lightFillAlpha} (darker than the old 0.88 focus)`)
    : fail(`mode alphas: ${JSON.stringify(cfg.chat)}`);
  const apm0 = (await game()).apm;
  const toDark = await pressZ(true);
  toDark && toDark.frames <= 2
    ? pass(`first Z enters dark mode immediately (drawn ${toDark.frames} frame(s) after the keydown)`)
    : fail(`first Z: ${JSON.stringify(toDark)}`);
  const d1 = await chat();
  d1.x === fresh.x && d1.y === fresh.y && d1.w === fresh.w && d1.h === fresh.h
    && JSON.stringify(d1.messages) === JSON.stringify(fresh.messages)
    ? pass('toggling keeps position, size and messages')
    : fail(`toggle changed the panel: ${JSON.stringify(d1)}`);
  await page.waitForTimeout(2500);            // well past the old 1.7s focus hold
  const d2 = await chat();
  d2.dark && d2.fill === cfg.chat.darkFillAlpha
    ? pass('dark mode persists — no timeout resets it (2.5s later)')
    : fail(`dark mode reset on its own: ${JSON.stringify(d2)}`);
  const toLight = await pressZ(false);
  toLight && toLight.frames <= 2
    ? pass(`second Z returns to light mode immediately (${toLight.frames} frame(s))`)
    : fail(`second Z: ${JSON.stringify(toLight)}`);
  await page.waitForTimeout(600);
  const l2 = await chat();
  !l2.dark && l2.fill === cfg.chat.lightFillAlpha ? pass('light mode also holds until the next Z') : fail(`light mode changed: ${JSON.stringify(l2)}`);
  const apm1 = (await game()).apm;
  apm1 - apm0 === 2 ? pass('each Z press still counts as one raw APM action') : fail(`Z presses added ${apm1 - apm0} APM actions, want 2`);

  // === 3. Bottom-edge drag and input isolation ===============================
  section('3. Bottom-edge drag and input isolation');
  const panel0 = await chat();
  const under = { x: panel0.x + Math.round(panel0.w / 2), y: panel0.y + Math.round(panel0.h / 2) };
  const outside = { x: 1000, y: 250 };
  // One enemy parked under the panel body, one outside it; the player idle far away.
  await page.evaluate(({ under, outside }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100; g.player.x = 900; g.player.y = 180; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.inputs.cancelPending();
    g.enemies.forEach((t, i) => {
      const spot = i === 0 ? under : i === 1 ? outside : null;
      if (spot) { t.x = spot.x; t.y = spot.y; t.hp = 99; t.active = true; } else { t.active = false; }
      t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
    });
  }, { under, outside });
  const g0 = await game();
  await page.mouse.click(under.x, under.y);                        // left-click the enemy through the panel
  await page.mouse.click(under.x, under.y, { button: 'right' });   // right-click it
  await page.mouse.click(under.x - 80, under.y + 20, { button: 'right' }); // right-click empty body
  await page.keyboard.press('a');
  await page.mouse.click(under.x + 60, under.y);                   // A + left-click on the body
  const edge0 = edgeOf(panel0, 120);
  await page.mouse.click(edge0.x, edge0.y);                        // left-click on the handle, no drag
  await page.waitForTimeout(150);
  const g1 = await game();
  const c1 = await chat();
  !g1.target && !g1.aMove && !g1.moving && g1.atk === 'idle' && g1.px === g0.px && g1.py === g0.py
    ? pass('clicks on the panel body or handle issue no attack, attack-move or move — even with an enemy underneath')
    : fail(`panel clicks leaked into gameplay: ${JSON.stringify({ g0, g1 })}`);
  c1.x === panel0.x && c1.y === panel0.y ? pass('plain clicks never move the panel') : fail(`panel moved on click: ${c1.x},${c1.y}`);
  g1.apm - g0.apm === 6 ? pass('each press on the panel still counts as a raw APM action (+6)') : fail(`panel presses counted +${g1.apm - g0.apm}`);
  await page.keyboard.press('Escape');                              // back out of the armed A-mode

  // The body is not a handle.
  const bodyGrab = bodyOf(panel0, 120);
  await drag(bodyGrab, { x: bodyGrab.x + 300, y: bodyGrab.y - 200 });
  const still = await chat();
  still.x === panel0.x && still.y === panel0.y && !still.dragging
    ? pass('left-drag from the message body does not move the panel')
    : fail(`body drag moved the panel: ${JSON.stringify(still)}`);

  // The bottom border is.
  const grab = edgeOf(panel0);
  await drag(grab, { x: grab.x + 400, y: grab.y - 250 });
  const moved = await chat();
  const g2 = await game();
  moved.x === panel0.x + 400 && moved.y === panel0.y - 250 && !moved.dragging
    ? pass(`left-drag from the bottom border moves the panel (${panel0.x},${panel0.y} -> ${moved.x},${moved.y}); release ends it`)
    : fail(`edge drag result: ${JSON.stringify(moved)}`);
  !g2.target && !g2.aMove && !g2.moving && g2.px === g0.px && g2.py === g0.py
    ? pass('body and edge drags issue no gameplay command')
    : fail(`drag leaked into gameplay: ${JSON.stringify(g2)}`);
  g2.apm - g1.apm === 3 ? pass('Esc + two drags count one APM action per press, none for the movement') : fail(`counted +${g2.apm - g1.apm}, want +3`);

  // The handle's hit strip reaches a little past the drawn line.
  await drag({ x: moved.x + 40, y: moved.y + moved.h + 2 }, { x: moved.x - 60, y: moved.y + moved.h + 52 });
  const strip = await chat();
  strip.x === moved.x - 100 && strip.y === moved.y + 50
    ? pass('grabbing just below the border (inside the handle strip) also drags')
    : fail(`strip drag: ${strip.x},${strip.y}`);

  // Left-click outside the panel is unchanged: it still attacks.
  await page.mouse.click(outside.x, outside.y);
  const attacked = await waitFor(() => !!window.__warmup.scene.getScene('GameScene').attacks.currentTarget, null, 1500);
  attacked ? pass('a left-click on an enemy outside the panel still issues its attack order') : fail('left-click outside the panel no longer attacks');
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.attacks.cancel(); g.player.stop();
  });

  // Clamped to the viewport in both directions.
  let c = await chat();
  let from = edgeOf(c, 20);
  await drag(from, { x: 1, y: 1 });
  c = await chat();
  c.x === 0 && c.y === 0 ? pass('dragging past the top-left clamps the panel to (0,0)') : fail(`top-left clamp: ${c.x},${c.y}`);
  from = edgeOf(c, 20);
  await drag(from, { x: cfg.arena.width - 1, y: cfg.arena.height - 1 });
  c = await chat();
  c.x === cfg.arena.width - c.w && c.y === cfg.arena.height - c.h
    ? pass(`dragging past the bottom-right clamps the panel inside the viewport (${c.x},${c.y})`)
    : fail(`bottom-right clamp: ${c.x},${c.y}`);

  // Park it somewhere custom for the restart check.
  const custom = { x: 600, y: 150 };
  from = edgeOf(c, 20);
  await drag(from, { x: custom.x + 20, y: custom.y + c.h - 1 });
  c = await chat();
  c.x === custom.x && c.y === custom.y ? pass(`panel parked at ${custom.x},${custom.y}`) : fail(`park: ${c.x},${c.y}`);

  // === 4. Mission messages ===================================================
  section('4. Mission messages');
  await jumpTo(1, 1);                       // fresh Stage 1 roster — same stage, no new briefing
  await page.waitForTimeout(100);
  const beforeKill = (await chat()).messages.length;
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((en) => en.active);
    while (e.active) g.onTargetHit(e, e.takeHit());
  });
  await page.waitForTimeout(150);
  (await chat()).messages.length === beforeKill
    ? pass('stage re-roster, hits and a kill add no chat messages')
    : fail(`messages grew without a mission change: ${JSON.stringify((await chat()).messages)}`);

  await killAll();
  (await hasMessage('Mission 1 complete!'))
    ? pass('clearing Stage 1 posts "Mission 1 complete!"')
    : fail(`no completion message: ${JSON.stringify((await chat()).messages)}`);
  (await hasMessage(briefing(2), cfg.run.interStageDelayMs + 3000))
    ? pass(`Stage 2 beginning appends "${briefing(2)}"`)
    : fail(`no Mission 2 briefing: ${JSON.stringify((await chat()).messages)}`);
  const m2 = (await chat()).messages;
  m2.slice(-2).join(' | ') === `Mission 1 complete! | ${briefing(2)}`
    ? pass('completion then briefing, in order')
    : fail(`order: ${JSON.stringify(m2)}`);

  const multi = cfg.stages.findIndex((s) => s.waves.length > 1) + 1;
  await jumpTo(multi, 1);
  (await hasMessage(briefing(multi)))
    ? pass(`a multi-wave stage uses its configured count: "${briefing(multi)}"`)
    : fail(`no Mission ${multi} briefing: ${JSON.stringify((await chat()).messages)}`);
  await killAll();
  await waitFor(() => window.__warmup.scene.getScene('GameScene').director.phase === 'intermission');
  await page.waitForTimeout(100);
  !(await chat()).messages.includes(`Mission ${multi} complete!`)
    ? pass(`clearing wave 1 of ${cfg.stages[multi - 1].waves.length} is not a mission completion`)
    : fail('a mid-stage wave clear posted a mission completion');

  const last = cfg.stages.length;
  await jumpTo(last, cfg.stages[last - 1].waves.length);
  (await hasMessage(briefing(last))) && briefing(last).includes('Final mission')
    ? pass(`Stage ${last} is briefed as the final mission: "${briefing(last)}"`)
    : fail(`final briefing missing: ${JSON.stringify((await chat()).messages)}`);
  await killAll();
  (await hasMessage(`Mission ${last} complete!`))
    ? pass(`completing the run posts "Mission ${last} complete!"`)
    : fail(`no final completion: ${JSON.stringify((await chat()).messages)}`);
  const finalMsgs = (await chat()).messages;
  finalMsgs.filter((m) => m === briefing(last)).length === 1 && finalMsgs.filter((m) => m === `Mission ${last} complete!`).length === 1
    ? pass('each mission message is posted exactly once')
    : fail(`duplicates: ${JSON.stringify(finalMsgs)}`);

  // === 5. Restart ============================================================
  section('5. Restart');
  const ended = await waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
  const darkBefore = await pressZ(true);     // choose dark mode before restarting
  const round0 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').getHudState().round);
  await page.keyboard.press('r');
  const restarted = await waitFor((r) => {
    const ui = window.__warmup.scene.getScene('UIScene');
    const g = window.__warmup.scene.getScene('GameScene');
    return g.getHudState().round === r + 1 && ui.observedRound === r + 1;
  }, round0);
  await page.waitForTimeout(100);
  const after = await chat();
  ended && restarted && after.messages.length === 2 && after.messages[0] === WELCOME && after.messages[1] === briefing(1)
    ? pass('a new run starts a fresh history: welcome + Mission 1 only')
    : fail(`after restart: ended=${ended} restarted=${restarted} ${JSON.stringify(after.messages)}`);
  after.x === custom.x && after.y === custom.y
    ? pass(`the dragged position survives the restart (${after.x},${after.y})`)
    : fail(`position after restart: ${after.x},${after.y}, want ${custom.x},${custom.y}`);
  darkBefore && after.dark && after.fill === cfg.chat.darkFillAlpha
    ? pass('the selected dark mode survives the restart')
    : fail(`mode after restart: dark=${after.dark} fill=${after.fill} (set before: ${JSON.stringify(darkBefore)})`);

  await finish();
});
