import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('hud: contextual range ring, pause freeze + input gate, Q slot, settings menu, stage banners across restarts', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    return {
      paused: g.isPaused,
      clock: g.clock.now,
      runTime: g.getHudState().runTime,
      ringVisible: g.player.rangeRing.visible,
      ringAlpha: g.player.rangeRing.strokeAlpha,
      ringRadius: g.player.rangeRing.radius,
      aPending: g.inputs.attackMovePending,
      atkState: g.attacks.state,
      windupProgress: g.attacks.windupProgress,
      autoMissiles: g.attacks.missilesInFlight,
      qMissiles: g.skillshot.missilesInFlight,
      enemyShots: g.enemyProjectiles.missiles.length,
      qCd: g.skillshot.cooldownRemainingMs,
      px: g.player.x, py: g.player.y,
      menuVisible: ui.pauseMenu.visible,
      debugPanelVisible: ui.debugPanel.visible,
    };
  });
  const setup = (spots, opts: any = {}) => page.evaluate(({ spots, opts }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
    g.player.x = 640; g.player.y = 360; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.skillshot.clear();
    if (opts.qReady) g.cooldowns.reduce(999999, ['q']);
    g.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = opts.hp ?? 9999; t.ghostHp = t.hp; t.active = true; t.__tag = i + 1;
      } else { t.active = false; t.respawnAt = Number.POSITIVE_INFINITY; }
      t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
    });
  }, { spots, opts });
  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });

  const cfg = await page.evaluate(() => ({
    hold: window.__theme?.rangeHint?.holdMs ?? 320,
    atkRange: window.__balance.ATTACK.range,
    tRadius: window.__balance.TARGETS.radius,
    qCd: window.__balance.SKILLSHOT_Q.cooldownMs,
  }));

  // === 1. Attack-range circle is contextual ==================================
  section('1. Attack-range circle is contextual');
  await setup([{ x: 900, y: 360 }]);
  await page.waitForTimeout(120);
  let s = await G();
  !s.ringVisible ? pass('normal gameplay: no attack-range circle') : fail('range ring visible during normal play');

  await page.keyboard.press('a');
  await page.waitForTimeout(80);
  s = await G();
  s.ringVisible && s.aPending ? pass('A: range circle appears with targeting mode') : fail('A did not show the range ring');
  Math.abs(s.ringRadius - (cfg.atkRange + cfg.tRadius)) < 0.01
    ? pass(`ring still uses the real reach (${s.ringRadius}px)`)
    : fail(`ring radius ${s.ringRadius} != reach ${cfg.atkRange + cfg.tRadius}`);

  // Escape while A is armed cancels targeting (does NOT pause).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  s = await G();
  !s.aPending && !s.ringVisible && !s.paused
    ? pass('Escape backs out of A-targeting (and does not pause)')
    : fail(`Escape from A-mode: pending=${s.aPending} ring=${s.ringVisible} paused=${s.paused}`);

  // A then left-click issues the order and hides the ring.
  await page.keyboard.press('a');
  await page.waitForTimeout(60);
  await page.mouse.click(700, 300, { button: 'left' });
  await page.waitForTimeout(120);
  s = await G();
  !s.aPending && !s.ringVisible ? pass('A-click issues the order and hides the ring') : fail('ring lingered after A-click');

  // Right-click cancels A-mode and hides the ring.
  await page.keyboard.press('a');
  await page.waitForTimeout(60);
  await rclick(500, 500);
  await page.waitForTimeout(100);
  s = await G();
  !s.aPending && !s.ringVisible ? pass('right-click cancels A-mode and hides the ring') : fail('ring lingered after right-click cancel');

  // T: brief flash, then gone.
  await setup([{ x: 900, y: 360 }]);
  await page.mouse.move(820, 360);
  await page.waitForTimeout(60);
  await page.keyboard.press('t');
  await page.waitForTimeout(60);
  const during = await G();
  during.ringVisible ? pass('T: range circle appears briefly') : fail('T did not show the range ring');
  during.atkState === 'windup' || during.autoMissiles > 0
    ? pass('T still executes the attack-move immediately')
    : fail(`T did not attack (state ${during.atkState})`);
  await page.waitForTimeout(cfg.hold + 220);
  const after = await G();
  !after.ringVisible ? pass(`T: ring fades away after ~${cfg.hold}ms`) : fail('T ring never faded');

  // === 2. Pause freezes everything ===========================================
  section('2. Pause freezes everything');
  await setup([{ x: 900, y: 360 }], { qReady: true });
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');            // a Q bolt in flight
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.nextSpawnAt = 0;      // let a volley spawn
    g.enemyProjectiles.spawnVolley();
  });
  await rclick(400, 500);                    // and the player moving
  await page.waitForTimeout(60);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const p0 = await G();
  p0.paused ? pass('Escape pauses the game') : fail('Escape did not pause');
  p0.menuVisible ? pass('pause menu is shown') : fail('pause menu not visible');

  await page.waitForTimeout(700);            // let real time pass while paused
  const p1 = await G();
  p1.clock === p0.clock ? pass(`game clock frozen (${p0.clock.toFixed(0)}ms)`) : fail(`clock advanced ${p1.clock - p0.clock}ms while paused`);
  Math.abs(p1.runTime - p0.runTime) < 1e-6 ? pass('run timer frozen') : fail('run timer advanced while paused');
  p1.px === p0.px && p1.py === p0.py ? pass('player movement frozen') : fail('player moved while paused');
  p1.qMissiles === p0.qMissiles && p1.enemyShots === p0.enemyShots
    ? pass(`projectiles frozen (${p0.qMissiles} Q, ${p0.enemyShots} enemy)`)
    : fail('projectiles advanced while paused');
  Math.abs(p1.qCd - p0.qCd) < 1e-6 ? pass('Q cooldown frozen') : fail(`Q cooldown ticked ${p0.qCd - p1.qCd}ms while paused`);

  // Gameplay input is swallowed while paused.
  const beforeInput = await G();
  await rclick(200, 200);
  await page.keyboard.press('t');
  await page.keyboard.press('q');
  await page.keyboard.press('s');
  await page.keyboard.press('a');
  await page.waitForTimeout(120);
  const afterInput = await G();
  afterInput.px === beforeInput.px && afterInput.py === beforeInput.py
    && afterInput.qMissiles === beforeInput.qMissiles && !afterInput.aPending
    ? pass('gameplay input (RMB / T / Q / S / A) does nothing while paused')
    : fail(`input leaked while paused: ${JSON.stringify(afterInput)}`);

  // Resume.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const r1 = await G();
  !r1.paused && !r1.menuVisible ? pass('Escape again resumes and closes the menu') : fail('did not resume');
  r1.clock > p1.clock ? pass('clock resumes advancing') : fail('clock did not resume');

  // === 3. Pause mid-windup must not complete the attack ======================
  section('3. Pause mid-windup must not complete the attack');
  await setup([{ x: 800, y: 360 }]);
  await page.waitForTimeout(60);
  await rclick(800, 360);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const w0 = await G();
  await page.waitForTimeout(900);            // far longer than any windup
  const w1 = await G();
  w1.atkState === 'windup' && Math.abs(w1.windupProgress - w0.windupProgress) < 1e-6
    ? pass(`windup frozen mid-flight (progress ${w0.windupProgress.toFixed(2)})`)
    : fail(`windup advanced while paused: ${w0.windupProgress} -> ${w1.windupProgress} state ${w1.atkState}`);
  w1.autoMissiles === 0 ? pass('no missile released while paused') : fail('an attack fired while paused');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const w2 = await G();
  w2.autoMissiles > 0 || w2.atkState === 'recovery'
    ? pass('windup completes normally after resuming')
    : fail(`windup did not complete after resume (state ${w2.atkState})`);

  // === 4. Q ability HUD ======================================================
  section('4. Q ability HUD');
  await setup([{ x: 900, y: 360 }], { qReady: true });
  await page.waitForTimeout(100);
  const qReady = await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    const slot = ui.abilityBar.slots[0];
    return { cdVisible: slot.cooldownText.visible, cdText: slot.cooldownText.text, iconAlpha: slot.icon.alpha };
  });
  !qReady.cdVisible && qReady.iconAlpha === 1
    ? pass('Q ready: no cooldown number, icon at full strength')
    : fail(`ready state wrong: ${JSON.stringify(qReady)}`);

  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(120);
  const qCd = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const slot = ui.abilityBar.slots[0];
    return {
      cdVisible: slot.cooldownText.visible,
      cdText: slot.cooldownText.text,
      iconAlpha: slot.icon.alpha,
      realCd: g.skillshot.cooldownRemainingMs,
    };
  });
  qCd.cdVisible && qCd.iconAlpha < 1 ? pass('Q on cooldown: slot darkens, number shown') : fail(`cooldown state wrong: ${JSON.stringify(qCd)}`);
  Math.abs(Number(qCd.cdText) - Math.ceil(qCd.realCd / 1000)) <= 1
    ? pass(`cooldown number tracks the real cooldown (${qCd.cdText} vs ${(qCd.realCd / 1000).toFixed(1)}s)`)
    : fail(`number ${qCd.cdText} vs real ${(qCd.realCd / 1000).toFixed(1)}s`);

  // Sub-second shows one decimal.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']); g.cooldowns.start('q'); g.cooldowns.reduce(window.__balance.SKILLSHOT_Q.cooldownMs - 800, ['q']);
  });
  await page.waitForTimeout(120);
  const qSub = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').abilityBar.slots[0].cooldownText.text);
  /^0\.\d$/.test(qSub) ? pass(`sub-second cooldown shows one decimal (${qSub})`) : fail(`sub-second format: "${qSub}"`);

  // Returns to ready.
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').cooldowns.reduce(999999, ['q']); });
  await page.waitForTimeout(150);
  const qBack = await page.evaluate(() => {
    const slot = window.__warmup.scene.getScene('UIScene').abilityBar.slots[0];
    return { cdVisible: slot.cooldownText.visible, iconAlpha: slot.icon.alpha };
  });
  !qBack.cdVisible && qBack.iconAlpha === 1 ? pass('Q returns to the ready state') : fail('slot stuck on cooldown');

  // Old bottom-left Q text is gone.
  const oldQ = await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.children.list.filter((o) => o.type === 'Text' && /^Q\s/.test(o.text ?? '')).length;
  });
  oldQ === 0 ? pass('old "Q READY" text removed — one Q display only') : fail(`${oldQ} legacy Q text objects remain`);

  // === 5. Settings toggles ===================================================
  section('5. Settings toggles');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const dbgBefore = (await G()).debugPanelVisible;
  await page.evaluate(() => { window.__balance.DEBUG.showAttackState = false; });
  await page.waitForTimeout(120);
  const dbgAfter = (await G()).debugPanelVisible;
  dbgBefore && !dbgAfter ? pass('Debug Metrics toggle hides the top-right panel') : fail(`debug panel: ${dbgBefore} -> ${dbgAfter}`);
  await page.evaluate(() => { window.__balance.DEBUG.showAttackState = true; });

  // Damage numbers toggle is honoured by Target.
  const dmgOff = await page.evaluate(() => {
    window.__balance.DEBUG.showDamageNumbers = false;
    const g = window.__warmup.scene.getScene('GameScene');
    const before = g.children.list.filter((o) => o.type === 'Text').length;
    g.enemies.find((t) => t.active)?.takeDamage(1);
    const after = g.children.list.filter((o) => o.type === 'Text').length;
    window.__balance.DEBUG.showDamageNumbers = true;
    return { before, after };
  });
  dmgOff.after === dmgOff.before ? pass('Damage Numbers OFF suppresses floating numbers') : fail('damage numbers still spawned when off');

  // Menu buttons exist and are interactive.
  const menuBits = await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    const c = ui.pauseMenu.container ?? null;
    const list = c ? c.list : [];
    return {
      visible: ui.pauseMenu.visible,
      interactive: list.filter((o) => o.input && o.input.enabled).length,
      texts: list.filter((o) => o.type === 'Text').map((o) => o.text),
    };
  });
  menuBits.visible && menuBits.interactive >= 4
    ? pass(`menu has ${menuBits.interactive} interactive controls`)
    : fail(`menu controls: ${JSON.stringify(menuBits)}`);
  menuBits.texts.includes('PAUSED') && menuBits.texts.includes('RESUME') && menuBits.texts.includes('RESTART ROUND')
    ? pass('menu shows PAUSED / RESUME / RESTART ROUND')
    : fail(`menu texts: ${menuBits.texts.join(', ')}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // === 6. Stage banner state across round restarts ===========================
  section('6. Stage banner state across round restarts');
  // UIScene never restarts, so its stage/wave tracking must start over with
  // every new run. Each scenario leaves a run at a LATER stage, restarts through
  // a real supported input, then checks the new run's opening frames and a
  // genuine stage transition inside it.
  const cfg6 = await page.evaluate(() => ({ stages: window.__balance.STAGES, run: window.__balance.RUN }));
  const lastStage = cfg6.stages.length;
  const lastWaveOf = (stage) => cfg6.stages[stage - 1].waves.length;
  const firstWaveSize = Object.values(cfg6.stages[0].waves[0]).reduce((a: any, b: any) => a + b, 0);
  /** Test-only setup: put the director on a stage/wave with a fresh roster, arena quiet. */
  const jumpTo = (stage, wave) => page.evaluate(([st, wv]) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
    g.director.stageIndex = st - 1;
    g.director.waveIndex = wv - 1;
    g.director.spawnWave();
  }, [stage, wave]);
  /** Kill the current wave through the scene's real damage funnel. */
  const clearWave = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    for (const e of g.director.enemies) {
      if (!e.active) continue;
      const damage = e.hp;
      g.onTargetDamaged(e, damage, e.takeDamage(damage));
    }
  });
  const waitFor = (fn, arg = null, timeout = 5000) =>
    page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
  const bannerShows = (text, timeout = 3000) => waitFor((text) => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.stageText.visible && ui.stageText.text === text;
  }, text, timeout);
  const bannerNow = () => page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.stageText.visible ? `"${ui.stageText.text}"` : '(hidden)';
  });
  const uiTracks = (stage, wave) => waitFor(([st, wv]) => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.lastStage === st && ui.lastWave === wv;
  }, [stage, wave]);
  /**
   * Sample every frame from just before a restart input until the NEW run has
   * 0.6s of run time. The new run is recognised by GameScene.create() building a
   * new GameClock — independent of the HUD round id under test.
   */
  const watchRestart = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const oldClock = g.clock;
    const probe: any = { roundBefore: g.getHudState().round, frames: [], done: false };
    (window as any).__restartProbe = probe;
    const tick = () => {
      if (g.clock !== oldClock) {
        const hud = g.getHudState();
        probe.frames.push({
          round: hud.round, stage: hud.stage, wave: hud.wave, phase: hud.wavePhase, runTime: hud.runTime,
          over: g.getRoundResult() !== null, alive: hud.enemiesRemaining, shots: g.enemyProjectiles.activeCount,
          lastStage: ui.lastStage, lastWave: ui.lastWave,
          banner: ui.stageText.visible ? ui.stageText.text : null,
        });
        if (hud.runTime >= 0.6) { probe.done = true; return; }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  const restartProbe = async () => {
    await waitFor(() => (window as any).__restartProbe.done, null, 10000);
    return page.evaluate(() => (window as any).__restartProbe);
  };
  const checkFreshRound = (probe, label) => {
    const f = probe.frames;
    f.length > 0
      ? pass(`${label}: a new run started`)
      : fail(`${label}: no new run was observed after the restart input`);
    f.length > 0 && f.every((x) => x.round === probe.roundBefore + 1)
      ? pass(`${label}: HUD round id advanced ${probe.roundBefore} -> ${f[0].round}`)
      : fail(`${label}: HUD round id ${probe.roundBefore} -> ${JSON.stringify(f.slice(0, 3).map((x) => x.round))}`);
    f.length > 0 && f.every((x) => x.stage === 1 && x.wave === 1 && x.phase === 'wave' && !x.over && x.lastStage === 1 && x.lastWave === 1)
      ? pass(`${label}: new run opens at Stage 1 Wave 1 with the UI tracking Stage 1 Wave 1`)
      : fail(`${label}: wrong opening state: ${JSON.stringify(f.find((x) => x.stage !== 1 || x.wave !== 1 || x.phase !== 'wave' || x.over || x.lastStage !== 1 || x.lastWave !== 1) ?? f.length)}`);
    f.length > 0 && f.every((x) => x.alive === firstWaveSize && x.shots === 0)
      ? pass(`${label}: a fresh Stage 1 Wave 1 roster (${firstWaveSize} enemies), no hostile shots carried over`)
      : fail(`${label}: leftovers after restart: ${JSON.stringify(f.find((x) => x.alive !== firstWaveSize || x.shots !== 0) ?? f.length)}`);
    f.length > 0 && f.every((x) => x.banner === null)
      ? pass(`${label}: no stage banner in the new run's first ${f[f.length - 1].runTime.toFixed(1)}s (${f.length} frames)`)
      : fail(`${label}: false stage banner after restart: ${JSON.stringify(f.find((x) => x.banner !== null) ?? f.length)}`);
  };
  const checkGenuineTransition = async (label) => {
    await jumpTo(1, lastWaveOf(1));
    await clearWave();
    const shown = await bannerShows('STAGE 2', cfg6.run.interStageDelayMs + 2500);
    shown
      ? pass(`${label}: clearing Stage 1's last wave still brings up the real "STAGE 2" banner`)
      : fail(`${label}: no "STAGE 2" banner (stage text ${await bannerNow()})`);
  };

  // A: complete the run (the final stage's last wave cleared), then R on the end screen.
  await jumpTo(lastStage, lastWaveOf(lastStage));
  const trackedA = await uiTracks(lastStage, lastWaveOf(lastStage));
  await clearWave();
  const endedA = await waitFor(() =>
    window.__warmup.scene.getScene('GameScene').getRoundResult()?.outcome === 'completed'
    && window.__warmup.scene.getScene('UIScene').overlay.visible);
  trackedA && endedA
    ? pass(`A: run completed at Stage ${lastStage} with the UI tracking Stage ${lastStage}`)
    : fail(`A: setup — UI tracked=${trackedA}, completed=${endedA}`);
  await watchRestart();
  await page.keyboard.press('r');
  checkFreshRound(await restartProbe(), 'A: R on the end screen');
  await checkGenuineTransition('A');

  // B: mid-run at Stage 6, restart from the pause menu's RESTART ROUND button.
  await jumpTo(6, 1);
  const midB = (await uiTracks(6, 1)) && (await bannerShows('STAGE 6'));
  await page.keyboard.press('Escape');
  const pausedB = await waitFor(() =>
    window.__warmup.scene.getScene('GameScene').isPaused && window.__warmup.scene.getScene('UIScene').pauseMenu.visible);
  const restartButton = await page.evaluate(() => {
    const t = window.__warmup.scene.getScene('UIScene').pauseMenu.container.list
      .find((o) => o.type === 'Text' && o.text === 'RESTART ROUND');
    return t ? { x: t.x, y: t.y } : null;
  });
  midB && pausedB && restartButton
    ? pass('B: paused on Stage 6 (UI showing "STAGE 6") with RESTART ROUND available')
    : fail(`B: setup — stage text ${await bannerNow()}, paused=${pausedB}, button=${JSON.stringify(restartButton)}`);
  await watchRestart();
  if (restartButton) await page.mouse.click(restartButton.x, restartButton.y);
  checkFreshRound(await restartProbe(), 'B: pause menu RESTART ROUND');
  await checkGenuineTransition('B');

  // C: defeated on Stage 4 Wave 2, restart with the end screen's PLAY AGAIN button.
  await jumpTo(4, 2);
  const midC = await uiTracks(4, 2);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 0; });
  const endedC = await waitFor(() =>
    window.__warmup.scene.getScene('GameScene').getRoundResult()?.outcome === 'defeated'
    && window.__warmup.scene.getScene('UIScene').overlay.visible);
  const playAgain = await page.evaluate(() => {
    const t = window.__warmup.scene.getScene('UIScene').overlay.list
      .find((o) => o.type === 'Text' && /^PLAY AGAIN/.test(o.text));
    return t ? { x: t.x, y: t.y } : null;
  });
  midC && endedC && playAgain
    ? pass('C: defeated on Stage 4 Wave 2 (UI tracking it) with PLAY AGAIN available')
    : fail(`C: setup — UI tracked=${midC}, defeated=${endedC}, button=${JSON.stringify(playAgain)}`);
  await watchRestart();
  if (playAgain) await page.mouse.click(playAgain.x, playAgain.y);
  checkFreshRound(await restartProbe(), 'C: PLAY AGAIN button');
  await checkGenuineTransition('C');

  await finish();
});
