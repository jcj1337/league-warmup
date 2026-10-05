import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('waves: stage/wave progression, variable waves per stage, finite rosters, breathers, endless run, death, restart', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    // The first ten stages as played: the hand-written intro, then generated stages.
    const stages = Array.from({ length: 10 }, (_, s) => d.describeStage(s));
    return {
      run: window.__balance.RUN,
      endless: window.__balance.ENDLESS,
      enemies: window.__balance.ENEMIES,
      authored: window.__balance.STAGES,
      stages,
      // What each wave actually fields.
      rosters: stages.map((st) => st.waves),
    };
  });
  // Progression is under test here, not survival: Pursuer swings land for 0, so
  // banner and arrival waits beside a live Pursuer can never kill the player.
  await page.evaluate(() => { window.__balance.PURSUER.attackDamage = 0; });
  // Every count below comes from the stage table — nothing assumes a fixed number of waves.
  const waveCounts: number[] = cfg.stages.map((s) => s.waves.length);
  const wavesTotal = waveCounts.reduce((sum, n) => sum + n, 0);
  const lastStage = cfg.stages.length;
  const rosterOf = (stage, wave) => cfg.rosters[stage - 1][wave - 1];
  const sizeOf = (roster): number => Object.values(roster).reduce((a: any, b: any) => a + b, 0) as number;
  /** What a roster cost to field: bodies × each mob's budget cost (a heavy pick is fewer, dearer bodies). */
  const costOf = (roster): number => Object.entries(roster).reduce((sum, [type, n]) => sum + (n as number) * cfg.enemies[type].cost, 0);
  /** Where the run goes after clearing `wave` of `stage` (not the final wave), per the table. */
  const nextAfter = (stage, wave) => wave < waveCounts[stage - 1]
    ? { stage, wave: wave + 1, kind: 'wave', delay: cfg.run.interWaveDelayMs, clearText: 'WAVE CLEAR', banner: `WAVE ${wave + 1}` }
    : { stage: stage + 1, wave: 1, kind: 'stage', delay: cfg.run.interStageDelayMs, clearText: 'STAGE CLEAR', banner: `STAGE ${stage + 1}` };

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
      remaining: hud.enemiesRemaining, wavesInStage: hud.wavesInStage,
      runTime: hud.runTime, clock: g.clock.now, hp: g.player.hp,
      baseCd: g.attacks.baseCooldownMs, shots: g.enemyProjectiles.activeCount,
      result: g.getRoundResult(),
      banner: ui.stageText.visible ? ui.stageText.text : null,
      progress: ui.progressText.text,
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

  /** Test-only setup: put the director on a stage/wave with a freshly spawned roster. */
  const jumpTo = (stage, wave) => page.evaluate(([st, wv]) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = st - 1;
    d.waveIndex = wv - 1;
    d.spawnWave();
    d.arriveAllNow();                   // the whole roster, not just the first staggered arrival
  }, [stage, wave]);

  /**
   * Kill living enemies through the real kill path — Enemy.takeHit() and then
   * the scene's hit funnel, which scores the kill and reports it to the
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
      while (e.active) g.onTargetHit(e, e.takeHit());
      killed++;
    }
    const hud = g.getHudState();
    return { killed, shots, clock: g.clock.now, phase: hud.wavePhase, next: hud.nextTransition, remaining: hud.enemiesRemaining };
  }, { count, volleysFirst });

  /** Clear the current wave and sample its whole breather plus a moment of what follows. */
  const clearAndWatch = async ({ volleys = 0, clickDuring = false } = {}) => {
    const before = await S();
    const next = nextAfter(before.stage, before.wave);
    const cleared = await kill(Number.POSITIVE_INFINITY, volleys);
    const framesP = observe(next.delay + 400);
    if (clickDuring) await page.mouse.click(420, 360, { button: 'right' });
    const frames = await framesP;
    const during = frames.filter((f) => f.clock > cleared.clock && f.phase === 'intermission');
    const arrived = frames.find((f) => f.stage === next.stage && f.wave === next.wave && f.phase === 'wave');
    const gap = arrived ? arrived.clock - cleared.clock : null;
    return { before, next, cleared, frames, during, arrived, gap };
  };

  const waitFor = (fn, arg = null, timeout = 5000) =>
    page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
  const waitForWave = (stage, wave) => waitFor(([s, w]) => {
    const h = window.__warmup.scene.getScene('GameScene').getHudState();
    return h.stage === s && h.wave === w && h.wavePhase === 'wave';
  }, [stage, wave]);
  /** A wave's enemies arrive staggered: wait until nothing is pending or mid-arrival. */
  const waitForArrivals = () => waitFor(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    return d.phase === 'wave' && d.pendingCount === 0 && d.spawningCount === 0;
  }, null, 8000);

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
  const withinDelay = (gap, delay) => gap !== null && gap >= delay && gap <= delay + 60;

  // === 1. A fresh run, and the shape of the stage table ======================
  section('1. A fresh run, and the shape of the stage table');
  await calm();
  const fresh = await S();
  fresh.stage === 1 && fresh.wave === 1 && fresh.phase === 'wave' && fresh.result === null
    ? pass('run starts at Stage 1 Wave 1, fighting, not over')
    : fail(`fresh run: stage ${fresh.stage} wave ${fresh.wave} phase ${fresh.phase} result ${JSON.stringify(fresh.result)}`);
  fresh.wavesInStage === waveCounts[0]
    && fresh.progress.includes(`WAVE 1 / ${waveCounts[0]}`) && /STAGE 1\s/.test(fresh.progress) && !fresh.progress.includes('STAGE 1 /')
    ? pass(`HUD reads "${fresh.progress.replace(/\s+/g, ' ')}" — the stage has no total (the run is endless), the wave total comes from the stage`)
    : fail(`HUD progress "${fresh.progress}" vs ${waveCounts[0]} waves in Stage 1`);
  new Set(waveCounts).size > 1
    && waveCounts[lastStage - 1] === Math.max(...waveCounts) && waveCounts[lastStage - 1] > waveCounts[0]
    && waveCounts[0] === Math.min(...waveCounts)
    ? pass(`stages vary in length (${waveCounts.join(', ')} waves over the first ${lastStage}): the first is the shortest, generated ones the longest`)
    : fail(`wave counts per stage: ${waveCounts.join(', ')}`);
  const avgSize = (stages) => {
    const sizes = stages.flatMap((s) => s.waves.map(sizeOf));
    return sizes.reduce((a, b) => a + b, 0) / sizes.length;
  };
  const shortest = cfg.stages.filter((s) => s.waves.length === Math.min(...waveCounts));
  avgSize(shortest) <= avgSize([cfg.stages[lastStage - 1]])
    ? pass(`short stages are not padded with bigger waves (avg ${avgSize(shortest).toFixed(1)} enemies vs ${avgSize([cfg.stages[lastStage - 1]]).toFixed(1)} in the final stage)`)
    : fail(`short stages average ${avgSize(shortest).toFixed(2)} enemies per wave vs ${avgSize([cfg.stages[lastStage - 1]]).toFixed(2)} in the final stage`);
  matches(fresh.roster, rosterOf(1, 1)) && fresh.roster.every((e) => e.active) && fresh.remaining === fresh.roster.length
    ? pass(`Stage 1 Wave 1 spawns exactly its scaled roster ${JSON.stringify(countTypes(fresh.roster))}`)
    : fail(`Stage 1 Wave 1 roster ${JSON.stringify(countTypes(fresh.roster))} vs ${JSON.stringify(rosterOf(1, 1))}`);
  {
    const authored = sizeOf(cfg.authored[0].waves[0]);
    fresh.roster.length >= authored && fresh.roster.length <= 6
      ? pass(`Stage 1 Wave 1 fields ${fresh.roster.length} (authored ${authored}, grown by the difficulty curve)`)
      : fail(`Stage 1 Wave 1 fielded ${fresh.roster.length} enemies`);
  }
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
  afterJump.baseCd === beforeJump.baseCd
    ? pass(`base auto cycle is still ${afterJump.baseCd}ms — time spent does not speed autos (only levels do)`)
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

  // === 4. The wave waits for every enemy, then a breather to what comes next ===
  section('4. The wave waits for every enemy, then a breather to what comes next');
  await calm();
  const w0 = await S();
  await kill(w0.remaining - 1);                       // leave exactly one alive
  const oneLeft = await observe(1200);
  oneLeft.every((f) => f.stage === 1 && f.wave === 1 && f.phase === 'wave' && f.alive === 1)
    ? pass('with one enemy still alive the wave never advances (1.2s observed)')
    : fail(`wave advanced with an enemy alive: ${JSON.stringify(oneLeft.find((f) => f.wave !== 1 || f.phase !== 'wave'))}`);

  const c4 = await clearAndWatch({ volleys: 2, clickDuring: true });
  const c4Ids = c4.before.roster.map((e) => e.id);
  c4.cleared.shots > 0 && c4.cleared.phase === 'intermission' && c4.cleared.next === c4.next.kind && c4.cleared.remaining === 0
    ? pass(`the last kill clears Stage 1 Wave 1 on the spot; with ${waveCounts[0]} wave(s) in Stage 1 a ${c4.next.kind} breather follows (${c4.cleared.shots} hostile shots were in flight)`)
    : fail(`after the last kill: ${JSON.stringify(c4.cleared)} (expected a ${c4.next.kind} transition)`);
  c4.during.length > 0 && c4.during.every((f) => f.shots === 0 && f.alive === 0 && sameIds(f.ids, c4Ids))
    ? pass(`breather: the old wave's shots are gone and no enemy appears (${c4.during.length} frames)`)
    : fail(`breather state: ${JSON.stringify(c4.during.find((f) => f.shots !== 0 || f.alive !== 0 || !sameIds(f.ids, c4Ids)) ?? c4.during.length)}`);
  c4.frames.every((f) => f.hp === 100)
    ? pass('a cleared wave never damages the player during the breather')
    : fail(`player took damage during the breather: ${JSON.stringify(c4.frames.find((f) => f.hp !== 100))}`);
  withinDelay(c4.gap, c4.next.delay)
    ? pass(`Stage ${c4.next.stage} Wave ${c4.next.wave} begins ${Math.round(c4.gap)}ms after the clear (${c4.next.kind === 'stage' ? 'interStageDelayMs' : 'interWaveDelayMs'} ${c4.next.delay})`)
    : fail(`next wave timing: ${c4.gap === null ? 'never' : `${Math.round(c4.gap)}ms`} vs ${c4.next.delay}`);
  c4.during.some((f) => f.moving)
    ? pass('the player stays controllable during the breather (move order obeyed)')
    : fail('player did not move during the breather');
  c4.during.some((f) => f.banner === c4.next.clearText) && c4.frames.some((f) => f.stage === c4.next.stage && f.wave === c4.next.wave && f.banner === c4.next.banner)
    ? pass(`"${c4.next.clearText}" shows during the breather, then "${c4.next.banner}"`)
    : fail(`banners: ${JSON.stringify([...new Set(c4.frames.map((f) => f.banner))])}`);

  // The new wave arrives one enemy at a time; judge its roster once all of it is here.
  await waitForArrivals();
  await calm();
  const n4 = await S();
  n4.stage === c4.next.stage && n4.wave === c4.next.wave && matches(n4.roster, rosterOf(c4.next.stage, c4.next.wave))
    && n4.roster.every((e) => e.active && !c4Ids.includes(e.id)) && n4.wavesInStage === waveCounts[c4.next.stage - 1]
    ? pass(`Stage ${n4.stage} Wave ${n4.wave} is a fresh authored roster ${JSON.stringify(countTypes(n4.roster))}, HUD WAVE ${n4.wave} / ${n4.wavesInStage}`)
    : fail(`next roster: stage ${n4.stage} wave ${n4.wave} of ${n4.wavesInStage}, ${JSON.stringify(n4.roster.map((e) => ({ id: e.id, type: e.type, active: e.active })))}`);
  const n4Watch = await observe(1500);
  n4Watch.every((f) => f.stage === n4.stage && f.wave === n4.wave && sameIds(f.ids, n4Watch[0].ids) && f.ids.every((id) => !c4Ids.includes(id)))
    ? pass('nothing from the cleared wave respawns after the transition (1.5s observed)')
    : fail(`roster changed after the transition: ${JSON.stringify(n4Watch.find((f) => !sameIds(f.ids, n4Watch[0].ids)))}`);

  // === 5. A multi-wave stage fights every configured wave, then advances ======
  section('5. A multi-wave stage fights every configured wave, then advances');
  const multi = waveCounts.findIndex((n) => n >= 2) + 1;
  if (multi === 0 || multi === lastStage) {
    fail(`needs a multi-wave stage before the final one; wave counts ${waveCounts.join(', ')}`);
  } else {
    const n = waveCounts[multi - 1];
    await calm();
    await jumpTo(multi, 1);
    // The jump itself is a stage change, so the UI raises its "STAGE N" banner.
    // Let that finish first: an in-progress banner outranks "WAVE CLEAR". Wait
    // for it to appear before waiting for it to go — polled straight after the
    // jump, the UI may not have raised it yet, and "not visible" would pass early.
    await waitFor((text) => {
      const ui = window.__warmup.scene.getScene('UIScene');
      return ui.stageText.visible && ui.stageText.text === text;
    }, `STAGE ${multi}`, 2000);
    await waitFor((text) => {
      const ui = window.__warmup.scene.getScene('UIScene');
      return !(ui.stageText.visible && ui.stageText.text === text);
    }, `STAGE ${multi}`, 4000);
    const fought = [];
    for (let w = 1; w <= n; w++) {
      if (w > 1) await waitForWave(multi, w);
      await waitForArrivals();
      await calm();
      const here = await S();
      fought.push({ stage: here.stage, wave: here.wave, of: here.wavesInStage, roster: matches(here.roster, rosterOf(multi, w)) });
      const c = await clearAndWatch();
      if (w === 1) {
        c.cleared.next === 'wave' && withinDelay(c.gap, cfg.run.interWaveDelayMs)
          ? pass(`Stage ${multi}: clearing Wave 1 of ${n} brings Wave 2 after ${Math.round(c.gap)}ms (interWaveDelayMs ${cfg.run.interWaveDelayMs})`)
          : fail(`Stage ${multi} Wave 1 clear: next ${c.cleared.next}, gap ${c.gap}`);
        c.during.some((f) => f.banner === 'WAVE CLEAR') && c.frames.some((f) => f.wave === 2 && f.banner === 'WAVE 2')
          ? pass('"WAVE CLEAR" shows during a wave breather, then "WAVE 2"')
          : fail(`wave banners: ${JSON.stringify([...new Set(c.frames.map((f) => f.banner))])}`);
      }
      if (w === n) {
        c.cleared.next === 'stage' && withinDelay(c.gap, cfg.run.interStageDelayMs)
          ? pass(`clearing Wave ${n} of ${n} ends Stage ${multi}: Stage ${multi + 1} Wave 1 begins after ${Math.round(c.gap)}ms (interStageDelayMs ${cfg.run.interStageDelayMs})`)
          : fail(`Stage ${multi} last-wave clear: next ${c.cleared.next}, gap ${c.gap}`);
        c.during.some((f) => f.banner === 'STAGE CLEAR') && c.frames.some((f) => f.stage === multi + 1 && f.banner === `STAGE ${multi + 1}`)
          ? pass(`"STAGE CLEAR" shows during the stage breather, then "STAGE ${multi + 1}"`)
          : fail(`stage banners: ${JSON.stringify([...new Set(c.frames.map((f) => f.banner))])}`);
      }
    }
    fought.length === n && fought.every((f, i) => f.stage === multi && f.wave === i + 1 && f.of === n && f.roster)
      ? pass(`Stage ${multi} fought exactly its ${n} waves in order, each with its authored roster, HUD WAVE k / ${n}`)
      : fail(`Stage ${multi} waves fought: ${JSON.stringify(fought)}`);
    await waitForArrivals();
    const after = await S();
    after.stage === multi + 1 && after.wave === 1 && matches(after.roster, rosterOf(multi + 1, 1))
      && after.wavesInStage === waveCounts[multi]
      ? pass(`Stage ${multi + 1} starts at Wave 1 of ${after.wavesInStage} with its roster`)
      : fail(`Stage ${multi + 1} start: wave ${after.wave} of ${after.wavesInStage}, roster ${JSON.stringify(countTypes(after.roster))}, base ${after.baseCd}ms`);
  }

  // === 6. A breather freezes with the pause ===================================
  section('6. A breather freezes with the pause');
  await calm();
  const p0 = await S();
  const pNext = nextAfter(p0.stage, p0.wave);
  const pCleared = await kill();
  await page.keyboard.press('Escape');
  const breatherState = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    return { paused: g.isPaused, remaining: g.director.intermissionRemainingMs, stage: hud.stage, wave: hud.wave, phase: hud.wavePhase };
  });
  const pausedAt = await breatherState();
  // Real time passing while paused IS the behaviour under test here.
  await page.waitForTimeout(pNext.delay + 700);
  const stillPaused = await breatherState();
  pCleared.phase === 'intermission' && pausedAt.paused && pausedAt.remaining > 0
    && stillPaused.paused && stillPaused.phase === 'intermission' && stillPaused.stage === p0.stage && stillPaused.wave === p0.wave
    && Math.abs(stillPaused.remaining - pausedAt.remaining) < 1e-6
    ? pass(`the breather freezes while paused (${Math.round(pausedAt.remaining)}ms left, unchanged after ${pNext.delay + 700}ms of real time)`)
    : fail(`breather while paused: ${JSON.stringify({ pCleared, pausedAt, stillPaused })}`);
  await page.keyboard.press('Escape');
  (await waitForWave(pNext.stage, pNext.wave))
    ? pass(`after resuming, the breather finishes and Stage ${pNext.stage} Wave ${pNext.wave} begins`)
    : fail(`Stage ${pNext.stage} Wave ${pNext.wave} never began after resuming`);

  // === 7. Every authored wave spawns exactly its roster =======================
  section('7. Every wave (hand-written or generated) spawns exactly its roster');
  const table = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const out = [];
    for (let s = 0; s < 10; s++) {
      for (let w = 0; w < d.wavesIn(s); w++) {
        d.stageIndex = s; d.waveIndex = w;
        d.spawnWave();
        d.arriveAllNow();
        const hud = g.getHudState();
        out.push({
          s, w, stage: hud.stage, wave: hud.wave, of: hud.wavesInStage, phase: hud.wavePhase, baseCd: g.attacks.baseCooldownMs,
          roster: d.enemies.map((e) => ({ type: e.archetype, active: e.active, maxHp: e.maxHp, x: e.x, y: e.y, r: e.radius })),
        });
      }
    }
    return out;
  });
  const pipsOf = (type, s) => cfg.stages[s].enemyPips[type];
  const badRoster = table.find((t) => !matches(t.roster, cfg.rosters[t.s][t.w]) || t.stage !== t.s + 1 || t.wave !== t.w + 1 || t.phase !== 'wave');
  table.length === wavesTotal && !badRoster
    ? pass(`all ${table.length} waves spawn exactly their scaled rosters`)
    : fail(`wave table mismatch: ${JSON.stringify(badRoster ?? table.length)}`);
  const badTotal = table.find((t) => t.of !== waveCounts[t.s]);
  !badTotal
    ? pass(`HUD wave total follows each stage's own count on every wave (${waveCounts.join(', ')})`)
    : fail(`HUD wave total ${badTotal?.of} on stage ${badTotal?.s + 1}, table says ${waveCounts[badTotal?.s]}`);
  {
    // Each wave keeps its authored mix and never shrinks below it.
    const short = table.find((t) => (t.s < cfg.authored.length && t.roster.length < sizeOf(cfg.authored[t.s].waves[t.w])) || !t.roster.every((e) => e.active));
    // Generated waves buy mobs from a budget, so heavier picks mean fewer bodies
    // on any one roll: what grows with the stage is the budget spent, not the count.
    const firstSizes = cfg.rosters.map((st) => sizeOf(st[0]));
    const firstCosts = cfg.rosters.map((st) => costOf(st[0]));
    !short && firstCosts[firstCosts.length - 1] >= 2 * firstCosts[0]
      ? pass(`hand-written waves never shrink below their authored size, and waves grow with the stage (Wave 1 sizes ${firstSizes.join(' / ')}, budgets ${firstCosts.map((c) => c.toFixed(1)).join(' / ')})`)
      : fail(`wave growth: ${JSON.stringify(short ?? { sizes: firstSizes, costs: firstCosts })}`);
  }
  const overlapping = table.find((t) => minGap(t.roster) <= 0);
  !overlapping
    ? pass('every enemy in every wave spawns in its own spot')
    : fail(`overlapping spawn in stage ${overlapping?.s + 1} wave ${overlapping?.w + 1}`);
  const badPips = table.find((t) => t.roster.some((e) => e.maxHp !== pipsOf(e.type, t.s)));
  !badPips
    ? pass("every enemy in every wave spawns with its stage's enemyPips")
    : fail(`pip mismatch: ${JSON.stringify(badPips)}`);
  const pips = cfg.stages.map((s) => s.enemyPips.basic);
  pips.every((p) => p === 1) && table.every((t) => t.baseCd === table[0].baseCd)
    ? pass(`basics stay 1 pip on every stage (more of them, never tougher), and the stage alone never changes your autos (${table[0].baseCd}ms: they follow your level)`)
    : fail(`stage scaling: basic pips ${JSON.stringify(pips)}, base autos ${JSON.stringify(table.map((t) => t.baseCd))}`);

  // === 8. The run is endless: Stage 10 leads on to a generated Stage 11 ========
  section('8. The run is endless: Stage 10 leads on to a generated Stage 11');
  await calm();
  const tenth = await S();                  // section 7 left Stage 10's last wave freshly spawned
  tenth.stage === lastStage && tenth.wave === waveCounts[lastStage - 1]
    ? pass(`on Stage ${lastStage} Wave ${tenth.wave} of ${tenth.wavesInStage}`)
    : fail(`expected Stage ${lastStage} Wave ${waveCounts[lastStage - 1]}, on stage ${tenth.stage} wave ${tenth.wave} of ${tenth.wavesInStage}`);
  await kill();
  const onward = await waitFor(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    return d.stage === 11 && d.phase === 'wave';
  }, null, cfg.run.interStageDelayMs + 3000);
  // Generated waves can outnumber the stage's cap on enemies alive at once: bring it all in.
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.arriveAllNow());
  const eleventh = await S();
  const want11 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.rosterFor(10, 0));
  onward && eleventh.result === null && eleventh.wavesInStage === cfg.endless.wavesPerStage && matches(eleventh.roster, want11)
    ? pass(`no run end: a generated Stage 11 (${eleventh.wavesInStage} waves) begins, fielding ${JSON.stringify(countTypes(eleventh.roster))}`)
    : fail(`after Stage ${lastStage}: ${JSON.stringify({ onward, stage: eleventh.stage, result: eleventh.result, of: eleventh.wavesInStage, roster: countTypes(eleventh.roster), want11 })}`);
  // The run only ends on death.
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 0; });
  const ended = await waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult()?.outcome === 'defeated');
  const done = await S();
  ended && done.result.stageReached === 11 && done.result.wavesCleared === wavesTotal
    ? pass(`it ends on death: DEFEATED at Stage 11 with all ${wavesTotal} waves of Stages 1-${lastStage} cleared`)
    : fail(`death result: ${JSON.stringify(done.result)}`);

  // === 9. Restart returns to a clean Stage 1 Wave 1 ===========================
  section('9. Restart returns to a clean Stage 1 Wave 1');
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
  again.remaining === sizeOf(rosterOf(1, 1)) && again.roster.every((e) => !oldIds.includes(e.id))
    && again.shots === 0 && again.banner === null && again.runTime < 1
    ? pass(`restart leaves no old enemies, shots, breather or banner behind; all ${again.remaining} of Stage 1 Wave 1 still to come`)
    : fail(`restart leftovers: remaining ${again.remaining}, roster ${JSON.stringify(again.roster.map((e) => e.id))}, shots ${again.shots}, banner ${again.banner}, runTime ${again.runTime}`);
  await waitForArrivals();
  const arrivedAgain = await S();
  matches(arrivedAgain.roster, rosterOf(1, 1)) && arrivedAgain.roster.every((e) => e.active && !oldIds.includes(e.id))
    ? pass(`the new run's Stage 1 Wave 1 arrives in full: ${JSON.stringify(countTypes(arrivedAgain.roster))}`)
    : fail(`restarted roster after arrivals: ${JSON.stringify(arrivedAgain.roster.map((e) => ({ id: e.id, type: e.type, active: e.active })))}`);

  // === 10. Player death still ends the run ====================================
  section('10. Player death still ends the run');
  await calm();
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 0; });
  const died = await waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult()?.outcome === 'defeated');
  const dead = await S();
  died && dead.result.stageReached === 1 && dead.result.waveReached === 1
    && dead.result.wavesInStage === waveCounts[0] && dead.result.wavesCleared === 0
    ? pass(`death ends the run as DEFEATED at Stage 1 Wave 1 / ${waveCounts[0]} with 0 waves cleared`)
    : fail(`death result: ${JSON.stringify(dead.result)}`);
  const defeatScreen = await waitFor(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.endScreen.container.visible && ui.endScreen.container.getByName('title').text === 'DEFEATED';
  });
  defeatScreen ? pass('end screen reads DEFEATED') : fail('end screen did not show DEFEATED');

  await finish();
});
