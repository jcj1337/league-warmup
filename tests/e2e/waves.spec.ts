import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('waves: stage/wave progression, finite rosters, breathers, stage transitions, run end, restart', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    run: window.__balance.RUN,
    stages: window.__balance.STAGES,
    basicHp: window.__balance.TARGETS.maxHp,
    pursuerHp: window.__balance.TARGETS.maxHp * window.__balance.PURSUER.baseHpMultiplier,
  }));
  const wavesTotal = cfg.stages.reduce((sum, s) => sum + s.waves.length, 0);

  /**
   * Authoritative progression snapshot. Every enemy object gets a stable test id
   * the first time it is seen, so "the same enemy" can be told apart from "a
   * replacement standing in the same place".
   */
  const S = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const w = window as any;
    w.__nextEnemyId ??= 1;
    const hud = g.getHudState();
    return {
      stage: hud.stage, wave: hud.wave, phase: hud.wavePhase, next: hud.nextTransition,
      remaining: hud.enemiesRemaining, stageCount: hud.stageCount, wavesInStage: hud.wavesInStage,
      runTime: hud.runTime, clock: g.clock.now, hp: g.player.hp,
      baseCd: g.attacks.baseCooldownMs, shots: g.enemyProjectiles.activeCount,
      result: g.getRoundResult(),
      banner: ui.stageText.visible ? ui.stageText.text : null,
      roster: g.director.enemies.map((e) => ({
        id: (e.__testId ??= w.__nextEnemyId++),
        type: e.archetype, active: e.active, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, r: e.radius,
      })),
    };
  });

  /** Sample progression every frame for `ms` of GAME time. */
  const observe = (ms) => page.evaluate((ms) => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const w = window as any;
    w.__nextEnemyId ??= 1;
    const t0 = g.clock.now;
    const frames = [];
    const tick = () => {
      const hud = g.getHudState();
      frames.push({
        clock: g.clock.now, stage: hud.stage, wave: hud.wave, phase: hud.wavePhase,
        alive: hud.enemiesRemaining, shots: g.enemyProjectiles.activeCount,
        hp: g.player.hp, moving: g.player.isMoving,
        banner: ui.stageText.visible ? ui.stageText.text : null,
        ids: g.director.enemies.map((e) => (e.__testId ??= w.__nextEnemyId++)),
      });
      if (g.clock.now - t0 >= ms) res(frames); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);

  /** Keep the player healthy at the centre and edge fire off, so only progression is under test. */
  const calm = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
    g.player.x = 640; g.player.y = 360; g.player.stop();
  });

  /**
   * Kill living enemies through the real kill path — Enemy.takeDamage() and then
   * the scene's damage funnel, which scores the kill and reports it to the
   * director, exactly as an auto, Q or E bolt does. Optionally put a couple of
   * hostile volleys in the air first. `count` limits how many die.
   */
  const kill = (count = Number.POSITIVE_INFINITY, volleysFirst = 0) => page.evaluate(({ count, volleysFirst }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = 100;
    for (let i = 0; i < volleysFirst; i++) g.enemyProjectiles.spawnVolley();
    const shots = g.enemyProjectiles.activeCount;
    let killed = 0;
    for (const e of g.director.enemies) {
      if (!e.active || killed >= count) continue;
      const damage = e.hp;
      g.onTargetDamaged(e, damage, e.takeDamage(damage));
      killed++;
    }
    const hud = g.getHudState();
    return { killed, shots, clock: g.clock.now, phase: hud.wavePhase, next: hud.nextTransition, remaining: hud.enemiesRemaining };
  }, { count, volleysFirst });

  const waitFor = (fn, arg = null, timeout = 5000) =>
    page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
  const waitForWave = (stage, wave) => waitFor(([s, w]) => {
    const h = window.__warmup.scene.getScene('GameScene').getHudState();
    return h.stage === s && h.wave === w && h.wavePhase === 'wave';
  }, [stage, wave]);

  const countTypes = (roster) =>
    roster.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {});
  const matches = (roster, def) => {
    const got = countTypes(roster);
    return [...new Set([...Object.keys(got), ...Object.keys(def)])].every((k) => (got[k] ?? 0) === (def[k] ?? 0));
  };
  /** Smallest edge-to-edge gap between any two enemies (negative = overlapping). */
  const minGap = (roster) => {
    let gap = Infinity;
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const a = roster[i], b = roster[j];
        gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
      }
    }
    return gap;
  };
  const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

  // === 1. A fresh run =========================================================
  section('1. A fresh run');
  await calm();
  const fresh = await S();
  fresh.stage === 1 && fresh.wave === 1 && fresh.phase === 'wave' && fresh.result === null
    ? pass('run starts at Stage 1 Wave 1, fighting, not over')
    : fail(`fresh run: stage ${fresh.stage} wave ${fresh.wave} phase ${fresh.phase} result ${JSON.stringify(fresh.result)}`);
  fresh.stageCount === 10 && cfg.stages.length === 10 && cfg.stages.every((s) => s.waves.length === 3) && fresh.wavesInStage === 3
    ? pass('the run is 10 stages of 3 waves')
    : fail(`structure: ${fresh.stageCount} stages, waves per stage ${JSON.stringify(cfg.stages.map((s) => s.waves.length))}`);
  matches(fresh.roster, cfg.stages[0].waves[0]) && fresh.roster.every((e) => e.active) && fresh.remaining === fresh.roster.length
    ? pass(`Stage 1 Wave 1 spawns exactly its authored roster ${JSON.stringify(countTypes(fresh.roster))}`)
    : fail(`Stage 1 Wave 1 roster ${JSON.stringify(countTypes(fresh.roster))} vs ${JSON.stringify(cfg.stages[0].waves[0])}`);
  fresh.roster.length < cfg.run.maxAliveEnemies
    ? pass(`a ${fresh.roster.length}-enemy wave leaves ${cfg.run.maxAliveEnemies - fresh.roster.length} of ${cfg.run.maxAliveEnemies} spots unused`)
    : fail(`Stage 1 Wave 1 fielded ${fresh.roster.length} enemies`);
  minGap(fresh.roster) > 0
    ? pass(`every enemy spawns in its own spot (closest gap ${minGap(fresh.roster).toFixed(0)}px)`)
    : fail(`enemies overlap at spawn (gap ${minGap(fresh.roster).toFixed(0)}px)`);

  // === 2. Time alone never advances progression ===============================
  section('2. Time alone never advances progression');
  await calm();
  const idle = await observe(2500);
  idle.every((f) => f.stage === 1 && f.wave === 1 && f.phase === 'wave' && sameIds(f.ids, idle[0].ids))
    ? pass(`${((idle[idle.length - 1].clock - idle[0].clock) / 1000).toFixed(1)}s of play: still Stage 1 Wave 1, same ${idle[0].ids.length} enemies`)
    : fail(`progression moved without kills: ${JSON.stringify(idle.find((f) => f.stage !== 1 || f.wave !== 1 || f.phase !== 'wave' || !sameIds(f.ids, idle[0].ids)))}`);
  // Jump the run clock two minutes ahead — far past the old 60s round.
  const beforeJump = await S();
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').clock.ms += 120_000; });
  await waitFor((c) => window.__warmup.scene.getScene('GameScene').clock.now > c + 100, beforeJump.clock + 120_000);
  const afterJump = await S();
  afterJump.result === null && afterJump.runTime > 60
    ? pass(`the run does not end on a timer (run time ${afterJump.runTime.toFixed(0)}s, still running)`)
    : fail(`run ended or clock did not jump: runTime ${afterJump.runTime}, result ${JSON.stringify(afterJump.result)}`);
  afterJump.stage === 1 && afterJump.wave === 1 && sameIds(afterJump.roster.map((e) => e.id), beforeJump.roster.map((e) => e.id))
    ? pass('two minutes of run time later: still Stage 1 Wave 1 with the same enemies')
    : fail(`after the clock jump: stage ${afterJump.stage} wave ${afterJump.wave}`);
  afterJump.baseCd === cfg.stages[0].baseAttackCooldownMs
    ? pass(`base auto cycle is still Stage 1's ${afterJump.baseCd}ms — time spent does not speed autos`)
    : fail(`base auto cycle drifted with time: ${afterJump.baseCd}ms`);

  // === 3. A kill never respawns a replacement =================================
  section('3. A kill never respawns a replacement');
  await calm();
  const k0 = await S();
  const firstKill = await kill(1);
  firstKill.killed === 1 && firstKill.remaining === k0.remaining - 1 && firstKill.phase === 'wave'
    ? pass(`one kill: ${firstKill.remaining} of ${k0.roster.length} left, wave still in progress`)
    : fail(`after one kill: ${JSON.stringify(firstKill)}`);
  // Watch for longer than the old 1200ms respawn delay and either breather.
  const afterKill = await observe(Math.max(1200, cfg.run.interStageDelayMs) + 600);
  afterKill.every((f) => sameIds(f.ids, afterKill[0].ids) && f.alive === k0.remaining - 1 && f.wave === 1 && f.phase === 'wave')
    ? pass(`no replacement spawned over ${((afterKill[afterKill.length - 1].clock - afterKill[0].clock) / 1000).toFixed(1)}s — the dead slot stays empty`)
    : fail(`roster changed after a single kill: ${JSON.stringify(afterKill.find((f) => !sameIds(f.ids, afterKill[0].ids) || f.alive !== k0.remaining - 1))}`);

  // === 4. The next wave waits for the whole wave, then a breather =============
  section('4. The next wave waits for the whole wave, then a breather');
  await calm();
  const w0 = await S();
  await kill(w0.remaining - 1);                       // leave exactly one alive
  const oneLeft = await observe(1200);
  oneLeft.every((f) => f.wave === 1 && f.phase === 'wave' && f.alive === 1)
    ? pass('with one enemy still alive the wave never advances (1.2s observed)')
    : fail(`wave advanced with an enemy alive: ${JSON.stringify(oneLeft.find((f) => f.wave !== 1 || f.phase !== 'wave'))}`);

  const wave1Ids = (await S()).roster.map((e) => e.id);
  const clear1 = await kill(Number.POSITIVE_INFINITY, 2); // hostile shots in the air, then the last kill
  clear1.shots > 0 && clear1.phase === 'intermission' && clear1.next === 'wave' && clear1.remaining === 0
    ? pass(`the last kill clears the wave on the spot (${clear1.shots} hostile shots were in flight)`)
    : fail(`after the last kill: ${JSON.stringify(clear1)}`);
  // Issue a real move order during the breather while sampling it.
  const breatherP = observe(cfg.run.interWaveDelayMs + 400);
  await page.mouse.click(420, 360, { button: 'right' });
  const breather = await breatherP;
  const during = breather.filter((f) => f.clock > clear1.clock && f.phase === 'intermission');
  const firstW2 = breather.find((f) => f.wave === 2);
  during.length > 0 && during.every((f) => f.shots === 0 && f.alive === 0 && sameIds(f.ids, wave1Ids))
    ? pass(`breather: the old wave's shots are gone and no enemy appears (${during.length} frames)`)
    : fail(`breather state: ${JSON.stringify(during.find((f) => f.shots !== 0 || f.alive !== 0 || !sameIds(f.ids, wave1Ids)) ?? during.length)}`);
  breather.every((f) => f.hp === 100)
    ? pass('a cleared wave never damages the player during the breather')
    : fail(`player took damage during the breather: ${JSON.stringify(breather.find((f) => f.hp !== 100))}`);
  firstW2 && firstW2.clock - clear1.clock >= cfg.run.interWaveDelayMs && firstW2.clock - clear1.clock <= cfg.run.interWaveDelayMs + 60
    ? pass(`Wave 2 spawns ${Math.round(firstW2.clock - clear1.clock)}ms after the clear (interWaveDelayMs ${cfg.run.interWaveDelayMs})`)
    : fail(`Wave 2 timing: ${firstW2 ? Math.round(firstW2.clock - clear1.clock) : 'never'}ms vs ${cfg.run.interWaveDelayMs}`);
  during.some((f) => f.moving)
    ? pass('the player stays controllable during the breather (move order obeyed)')
    : fail('player did not move during the breather');
  during.some((f) => f.banner === 'WAVE CLEAR') && breather.some((f) => f.wave === 2 && f.banner === 'WAVE 2')
    ? pass('"WAVE CLEAR" shows during the breather, then "WAVE 2"')
    : fail(`banners: ${JSON.stringify([...new Set(breather.map((f) => f.banner))])}`);

  const w2 = await S();
  w2.stage === 1 && w2.wave === 2 && matches(w2.roster, cfg.stages[0].waves[1]) && w2.roster.every((e) => e.active && !wave1Ids.includes(e.id))
    ? pass(`Wave 2 is a fresh authored roster ${JSON.stringify(countTypes(w2.roster))} — none of Wave 1's enemies`)
    : fail(`Wave 2 roster: ${JSON.stringify(w2.roster.map((e) => ({ id: e.id, type: e.type, active: e.active })))}`);
  const w2Watch = await observe(1500);
  w2Watch.every((f) => f.wave === 2 && sameIds(f.ids, w2Watch[0].ids) && f.ids.every((id) => !wave1Ids.includes(id)))
    ? pass('nothing from Wave 1 respawns after the transition (1.5s observed)')
    : fail(`roster changed after Wave 2 began: ${JSON.stringify(w2Watch.find((f) => !sameIds(f.ids, w2Watch[0].ids)))}`);

  // === 5. Clearing Wave 3 advances the stage ==================================
  section('5. A breather freezes with the pause; clearing Wave 3 advances the stage');
  await calm();
  const clear2 = await kill();
  await page.keyboard.press('Escape');
  const breatherState = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    return { paused: g.isPaused, remaining: g.director.intermissionRemainingMs, wave: hud.wave, phase: hud.wavePhase };
  });
  const pausedAt = await breatherState();
  // Real time passing while paused IS the behaviour under test here.
  await page.waitForTimeout(cfg.run.interWaveDelayMs + 700);
  const stillPaused = await breatherState();
  clear2.phase === 'intermission' && pausedAt.paused && pausedAt.remaining > 0
    && stillPaused.paused && stillPaused.phase === 'intermission' && stillPaused.wave === 2
    && Math.abs(stillPaused.remaining - pausedAt.remaining) < 1e-6
    ? pass(`the breather freezes while paused (${Math.round(pausedAt.remaining)}ms left, unchanged after ${cfg.run.interWaveDelayMs + 700}ms of real time)`)
    : fail(`breather while paused: ${JSON.stringify({ clear2, pausedAt, stillPaused })}`);
  await page.keyboard.press('Escape');
  const reached3 = await waitForWave(1, 3);
  const w3 = await S();
  reached3 && matches(w3.roster, cfg.stages[0].waves[2])
    ? pass(`Wave 3 spawns its authored roster ${JSON.stringify(countTypes(w3.roster))}`)
    : fail(`Wave 3: reached=${reached3} roster ${JSON.stringify(countTypes(w3.roster))}`);
  await calm();
  const clear3 = await kill();
  clear3.phase === 'intermission' && clear3.next === 'stage'
    ? pass('clearing Wave 3 starts the stage breather')
    : fail(`after clearing Wave 3: ${JSON.stringify(clear3)}`);
  const stageBreather = await observe(cfg.run.interStageDelayMs + 400);
  const firstS2 = stageBreather.find((f) => f.stage === 2);
  firstS2 && firstS2.wave === 1
    && firstS2.clock - clear3.clock >= cfg.run.interStageDelayMs && firstS2.clock - clear3.clock <= cfg.run.interStageDelayMs + 60
    ? pass(`Stage 2 Wave 1 begins ${Math.round(firstS2.clock - clear3.clock)}ms after the clear (interStageDelayMs ${cfg.run.interStageDelayMs})`)
    : fail(`stage transition: ${firstS2 ? `stage 2 wave ${firstS2.wave} at ${Math.round(firstS2.clock - clear3.clock)}ms` : 'never'}`);
  stageBreather.some((f) => f.stage === 1 && f.phase === 'intermission' && f.banner === 'STAGE CLEAR')
    && stageBreather.some((f) => f.stage === 2 && f.banner === 'STAGE 2')
    ? pass('"STAGE CLEAR" shows during the breather, then the "STAGE 2" banner')
    : fail(`stage banners: ${JSON.stringify([...new Set(stageBreather.map((f) => f.banner))])}`);
  const s2 = await S();
  s2.stage === 2 && s2.wave === 1 && matches(s2.roster, cfg.stages[1].waves[0]) && s2.baseCd === cfg.stages[1].baseAttackCooldownMs
    ? pass(`Stage 2 starts at Wave 1 with its roster ${JSON.stringify(countTypes(s2.roster))} and ${s2.baseCd}ms base autos`)
    : fail(`Stage 2 start: wave ${s2.wave}, roster ${JSON.stringify(countTypes(s2.roster))}, base ${s2.baseCd}ms`);

  // === 6. Every authored wave spawns exactly its roster =======================
  section('6. Every authored wave spawns exactly its roster');
  const table = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const out = [];
    for (let s = 0; s < window.__balance.STAGES.length; s++) {
      for (let w = 0; w < window.__balance.STAGES[s].waves.length; w++) {
        d.stageIndex = s; d.waveIndex = w;
        d.spawnWave();
        const hud = g.getHudState();
        out.push({
          s, w, stage: hud.stage, wave: hud.wave, phase: hud.wavePhase, baseCd: g.attacks.baseCooldownMs,
          roster: d.enemies.map((e) => ({ type: e.archetype, active: e.active, maxHp: e.maxHp, x: e.x, y: e.y, r: e.radius })),
        });
      }
    }
    return out;
  });
  const hpOf = (type, s) => Math.round((type === 'basic' ? cfg.basicHp : cfg.pursuerHp) * cfg.stages[s].enemyHpMultiplier);
  const badRoster = table.find((t) => !matches(t.roster, cfg.stages[t.s].waves[t.w]) || t.stage !== t.s + 1 || t.wave !== t.w + 1 || t.phase !== 'wave');
  table.length === wavesTotal && !badRoster
    ? pass(`all ${table.length} authored waves spawn exactly their rosters`)
    : fail(`wave table mismatch: ${JSON.stringify(badRoster ?? table.length)}`);
  table.every((t) => t.roster.length >= 1 && t.roster.length <= cfg.run.maxAliveEnemies && t.roster.every((e) => e.active))
    ? pass(`no wave fields more than ${cfg.run.maxAliveEnemies} enemies`)
    : fail('a wave exceeded the enemy cap');
  const overlapping = table.find((t) => minGap(t.roster) <= 0);
  !overlapping
    ? pass('every enemy in every wave spawns in its own spot')
    : fail(`overlapping spawn in stage ${overlapping?.s + 1} wave ${overlapping?.w + 1}`);
  const badHp = table.find((t) => t.roster.some((e) => e.maxHp !== hpOf(e.type, t.s)));
  !badHp
    ? pass('enemy HP = archetype base × the stage HP multiplier in every wave')
    : fail(`HP mismatch: ${JSON.stringify(badHp)}`);
  const mults = cfg.stages.map((s) => s.enemyHpMultiplier);
  const cds = cfg.stages.map((s) => s.baseAttackCooldownMs);
  mults.every((m, i) => i === 0 || m >= mults[i - 1]) && mults[mults.length - 1] > mults[0]
    && cds.every((c, i) => i === 0 || c < cds[i - 1])
    && table.every((t) => t.baseCd === cds[t.s])
    ? pass(`later stages: tougher enemies (×${mults[0]} → ×${mults[mults.length - 1]}) and faster base autos (${cds[0]} → ${cds[cds.length - 1]}ms)`)
    : fail(`stage scaling: hp ${JSON.stringify(mults)}, base autos ${JSON.stringify(cds)}`);

  // === 7. Clearing Stage 10 Wave 3 completes the run ==========================
  section('7. Clearing Stage 10 Wave 3 completes the run');
  await calm();
  const finale = await S();                 // section 6 left the final wave freshly spawned
  finale.stage === 10 && finale.wave === 3
    ? pass('on Stage 10 Wave 3')
    : fail(`expected Stage 10 Wave 3, on stage ${finale.stage} wave ${finale.wave}`);
  await kill();
  const completed = await waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
  const done = await S();
  completed && done.result?.outcome === 'completed'
    && done.result.stageReached === 10 && done.result.waveReached === 3
    && done.result.wavesCleared === wavesTotal && done.result.wavesTotal === wavesTotal
    ? pass(`run ends as COMPLETED at Stage 10 Wave 3 (${done.result.wavesCleared}/${done.result.wavesTotal} waves cleared)`)
    : fail(`completion result: ${JSON.stringify(done.result)}`);
  const completeScreen = await waitFor(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.overlay.visible && ui.overlay.getByName('title').text === 'RUN COMPLETE';
  });
  completeScreen ? pass('end screen reads RUN COMPLETE') : fail('end screen did not show RUN COMPLETE');

  // === 8. Restart returns to a clean Stage 1 Wave 1 ===========================
  section('8. Restart returns to a clean Stage 1 Wave 1');
  const oldIds = done.roster.map((e) => e.id);
  await page.keyboard.press('r');
  const restarted = await waitFor(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return g.getRoundResult() === null && g.getHudState().runTime > 0.2;
  });
  const again = await S();
  restarted && again.stage === 1 && again.wave === 1 && again.phase === 'wave' && again.result === null && again.hp === 100
    ? pass('restart: Stage 1 Wave 1, fighting, full HP, no result')
    : fail(`after restart: ${JSON.stringify({ stage: again.stage, wave: again.wave, phase: again.phase, hp: again.hp, result: again.result })}`);
  matches(again.roster, cfg.stages[0].waves[0]) && again.roster.every((e) => e.active && !oldIds.includes(e.id))
    && again.shots === 0 && again.banner === null && again.runTime < 1
    ? pass('restart leaves no old enemies, shots, breather or banner behind')
    : fail(`restart leftovers: roster ${JSON.stringify(again.roster.map((e) => e.id))}, shots ${again.shots}, banner ${again.banner}, runTime ${again.runTime}`);

  // === 9. Player death still ends the run =====================================
  section('9. Player death still ends the run');
  await calm();
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 0; });
  const died = await waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult()?.outcome === 'defeated');
  const dead = await S();
  died && dead.result.stageReached === 1 && dead.result.waveReached === 1 && dead.result.wavesCleared === 0
    ? pass('death ends the run as DEFEATED at Stage 1 Wave 1 with 0 waves cleared')
    : fail(`death result: ${JSON.stringify(dead.result)}`);
  const defeatScreen = await waitFor(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.overlay.visible && ui.overlay.getByName('title').text === 'DEFEATED';
  });
  defeatScreen ? pass('end screen reads DEFEATED') : fail('end screen did not show DEFEATED');

  await finish();
});
