import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('modes: the profile picks the mode, damage per mode, stage-clear bonus per mode, runs logged and compared per mode', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 200, { mode: 'hard' });

  /** Save a mode to the profile and restart into a fresh round on it, arena quiet. */
  const playOn = async (mode: string) => {
    const round = await page.evaluate((mode) => {
      window.__profile.update((d: { mode: string }) => { d.mode = mode; });
      const g = window.__warmup.scene.getScene('GameScene');
      const before = g.getHudState().round;
      g.restartRound();
      return before;
    }, mode);
    await page.waitForFunction((r) => {
      const g = window.__warmup.scene.getScene('GameScene');
      return g.getHudState().round !== r && g.clock.now > 50;
    }, round);
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
      g.director.arriveAllNow();
      for (const e of g.director.enemies) {
        e.x = 1150; e.y = 100; e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        if ('canSpit' in e) e.canSpit = false;
        if ('nextAttackAt' in e) e.nextAttackAt = Number.POSITIVE_INFINITY;
      }
      g.player.x = 300; g.player.y = 500; g.player.stop();
    });
  };
  /** HP lost to one scripted hit of `damage` from full health. */
  const hpLostTo = (damage: number, viaEnemy: boolean) => page.evaluate(({ damage, viaEnemy }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = g.player.maxHp; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    if (viaEnemy) g.onEnemyHit(damage, 'pursuer'); else g.onPlayerHit(damage, 'edgeFire');
    return g.player.maxHp - g.player.hp;
  }, { damage, viaEnemy });
  /** Die on the spot; returns the round result once the run is over. */
  const die = async () => {
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.player.hp = 1; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
      g.onPlayerHit(5, 'edgeFire');
    });
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
    return page.evaluate(() => window.__warmup.scene.getScene('GameScene').getRoundResult());
  };

  const cfg = await page.evaluate(() => ({ modes: window.__balance.MODES, defaultMode: window.__balance.DEFAULT_MODE }));

  // === 1. The mode is the profile's ===========================================
  section('1. The profile picks the mode');
  {
    const s = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      return { mode: g.mode.id, hud: g.getHudState().mode, profile: window.__profile.data.mode };
    });
    s.mode === 'hard' && s.hud === 'hard' && s.profile === 'hard'
      ? pass('a saved mode is the one the run plays on')
      : fail(`seeded mode: ${JSON.stringify(s)}`);
    cfg.defaultMode === 'normal' && Object.keys(cfg.modes).join() === 'easy,normal,hard'
      ? pass('three modes (easy, normal, hard); Normal is the default')
      : fail(`modes: ${JSON.stringify({ ids: Object.keys(cfg.modes), def: cfg.defaultMode })}`);
  }
  await playOn('nightmare');
  {
    const id = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').mode.id);
    id === 'normal' ? pass('an unknown saved mode plays as Normal') : fail(`unknown mode played as ${id}`);
  }

  // === 2. Damage ==============================================================
  section('2. Damage');
  for (const mode of ['easy', 'normal', 'hard']) {
    await playOn(mode);
    const want = cfg.modes[mode].damageMultiplier;
    const direct = await hpLostTo(10, false);
    const swing = await hpLostTo(10, true);       // Stage 1: the stage's own damage scaling is ×1
    direct === 10 * want && swing === 10 * want
      ? pass(`${mode}: a 10-damage hit costs ${direct} HP (edge fire and enemy attacks alike)`)
      : fail(`${mode}: lost ${direct} / ${swing}, want ${10 * want}`);
  }
  cfg.modes.hard.damageMultiplier === 2 && cfg.modes.normal.damageMultiplier === 1 && cfg.modes.easy.damageMultiplier === 1
    ? pass('Hard doubles damage; Easy and Normal leave it alone')
    : fail(`multipliers: ${JSON.stringify(cfg.modes)}`);

  // === 2b. Stage-clear bonus ==================================================
  section('2b. Stage-clear bonus');
  const perStage = await page.evaluate(() => window.__balance.SCORE.stageMultiplierPerStage);
  for (const mode of ['easy', 'normal', 'hard']) {
    await playOn(mode);
    // Clear Stage 3's last wave through the real hit funnel.
    const got = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const d = g.director;
      d.stageIndex = 2; d.waveIndex = d.wavesInStage - 1; d.currentPhase = 'wave';
      d.spawnWave(); d.arriveAllNow();
      const before = { ...g.scoring.scoreFrom };
      for (const e of d.enemies) while (e.active) g.onTargetHit(e, e.takeHit());
      const from = g.scoring.scoreFrom;
      const popups = g.children.list
        .filter((o: { text?: unknown }) => typeof o.text === 'string' && /CLEAR$/.test(o.text as string))
        .map((o: { text: string }) => o.text);
      return { clear: from.clear - before.clear, hp: from.hp - before.hp, score: g.scoring.score, parts: from.kills + from.speed + from.hp + from.clear, popups };
    });
    const want = Math.round(cfg.modes[mode].stageClearBonus * (1 + perStage * 2));
    got.clear === want && got.hp > 0 && got.score === got.parts
      ? pass(`${mode}: clearing Stage 3 pays +${got.clear} on top of the HP bonus`)
      : fail(`${mode}: ${JSON.stringify(got)}, want clear ${want}`);
    (want > 0 ? got.popups.join() === `+${want} CLEAR` : got.popups.length === 0)
      ? pass(`${mode}: ${want > 0 ? `it pops as "+${want} CLEAR"` : 'no bonus, no popup'}`)
      : fail(`${mode}: popups ${JSON.stringify(got.popups)}`);
  }
  cfg.modes.easy.stageClearBonus === 0 && cfg.modes.normal.stageClearBonus === 500 && cfg.modes.hard.stageClearBonus === 1500
    ? pass('the bonus is none on Easy, 500 on Normal, 1500 on Hard, × the stage multiplier')
    : fail(`bonuses: ${JSON.stringify(cfg.modes)}`);

  // === 3. The run log is per mode =============================================
  section('3. Run log');
  await page.evaluate(() => window.__runs.clear());
  await playOn('hard');
  const hardRun = await die();
  {
    const s = await page.evaluate(() => ({
      last: window.__runs.list().at(-1),
      hard: window.__runs.summary(),
      normal: window.__runs.summary(undefined, undefined, undefined, 'normal'),
    }));
    hardRun.mode === 'hard' && s.last.mode === 'hard'
      ? pass('a Hard run is logged as Hard')
      : fail(`logged: ${JSON.stringify({ result: hardRun.mode, last: s.last })}`);
    s.hard.runs === 1 && s.hard.mode === 'hard' && s.normal.runs === 0
      ? pass('it counts toward the Hard summary only (the console summary follows the current mode)')
      : fail(`summaries: ${JSON.stringify(s)}`);
    hardRun.newBest && hardRun.previousBest === null
      ? pass('the first run in a mode is that mode\'s best')
      : fail(`first hard run: ${JSON.stringify({ newBest: hardRun.newBest, previousBest: hardRun.previousBest })}`);
  }
  await playOn('normal');
  const normalRun = await die();
  {
    const s = await page.evaluate(() => ({ normal: window.__runs.summary(), screen: window.__warmup.scene.getScene('UIScene').resultText.text as string }));
    normalRun.mode === 'normal' && normalRun.previousBest === null && s.normal.runs === 1
      ? pass('a Normal run after it has no earlier best: bests never cross modes')
      : fail(`normal after hard: ${JSON.stringify({ normalRun: { mode: normalRun.mode, previousBest: normalRun.previousBest }, s })}`);
    /YOUR BEST\s+STAGE 1\s+SCORE \d+\s+\(1 RUN\)/.test(s.screen)
      ? pass('the end screen\'s YOUR BEST counts this mode\'s runs only')
      : fail(`end screen:\n${s.screen}`);
  }
  // A run logged before modes existed has no mode: it is a Normal run.
  {
    const s = await page.evaluate(() => {
      window.__profile.update((d: { runs: Record<string, unknown>[] }) => {
        const old = { ...d.runs[d.runs.length - 1] };
        delete old.mode;
        d.runs.push(old);
      });
      return window.__runs.summary(undefined, undefined, undefined, 'normal').runs;
    });
    s === 2 ? pass('a run logged without a mode counts as Normal') : fail(`normal runs with a legacy record: ${s}`);
  }

  await page.evaluate(() => window.__profile.reset());
  await finish();
});
