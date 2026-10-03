import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('score: no points for time alive, kills × stage, wave speed bonus vs par, stage HP + flawless bonus, breakdown + high score', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({ S: window.__balance.SCORE, P: window.__balance.PURSUER }));
  const mult = (stage) => 1 + cfg.S.stageMultiplierPerStage * (stage - 1);

  /** Put the run on a fresh stage / wave with its whole roster arrived, arena quiet. */
  const jumpTo = (stage, wave) => page.evaluate(({ stage, wave }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.x = 640; g.player.y = 360; g.player.stop();
    d.stageIndex = stage - 1; d.waveIndex = wave - 1; d.currentPhase = 'wave';
    d.spawnWave(); d.arriveAllNow();
    for (const e of d.enemies) {
      e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
      if ('canSpit' in e) e.canSpit = false;
      if ('canDash' in e) e.canDash = false;
      if ('nextAttackAt' in e) e.nextAttackAt = Number.POSITIVE_INFINITY;
      if ('nextCastAt' in e) e.nextCastAt = Number.POSITIVE_INFINITY;
      // Park them away from the player so nothing bumps.
      if (Math.hypot(e.x - 640, e.y - 360) < 120) { e.x = 1100; e.y = 120; }
    }
    g.scoring.startStage();
    return { enemies: d.enemies.length, par: d.waveParMs };
  }, { stage, wave });
  /** Kill the whole wave through the real hit funnel; returns the score parts afterwards. */
  const clearWave = (backdateMs = 0) => page.evaluate((backdateMs) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.director.waveStartedAt -= backdateMs;      // pretend the wave took this much longer
    for (const e of g.director.enemies) while (e.active) g.onTargetHit(e, e.takeHit());
    return { score: g.scoring.score, from: { ...g.scoring.scoreFrom } };
  }, backdateMs);
  const score = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { score: g.scoring.score, from: { ...g.scoring.scoreFrom } };
  });

  // === 1. No points for time alive ===========================================
  section('1. No points for time alive');
  await jumpTo(1, 1);
  const idle0 = await score();
  await page.waitForTimeout(2500);
  const idle1 = await score();
  idle1.score === idle0.score
    ? pass('2.5s of standing around (or kiting) earns nothing')
    : fail(`score grew with time: ${idle0.score} -> ${idle1.score}`);

  // === 2. Kills ===============================================================
  section('2. Kills');
  const kills = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const out = [];
    for (const [stage, type] of [[1, 'basic'], [5, 'basic'], [5, 'pursuer']] as const) {
      d.stageIndex = stage - 1; d.currentPhase = 'intermission';   // no wave bookkeeping
      const e = d.spawnEnemy(type);
      e.x = 1100; e.y = 600;
      d.enemies.push(e);
      const before = g.scoring.scoreFrom.kills;
      while (e.active) g.onTargetHit(e, e.takeHit());
      out.push({ stage, type, points: g.scoring.scoreFrom.kills - before });
    }
    return out;
  });
  const wantKill = (k) => Math.round(cfg.S.pointsPerKill * (k.type === 'pursuer' ? cfg.P.scoreMultiplier : 1) * mult(k.stage));
  kills.every((k) => k.points === wantKill(k))
    ? pass(`kills: ${kills.map((k) => `S${k.stage} ${k.type} ${k.points}`).join(', ')} (×${mult(5)} on Stage 5)`)
    : fail(`kill points: ${JSON.stringify(kills)}`);

  // === 3. Wave speed bonus =====================================================
  section('3. Wave speed bonus');
  const fast = await jumpTo(4, 1);              // Stage 4 Wave 1: not the stage's last wave
  const beforeFast = await score();
  const afterFast = await clearWave(0);
  const wantFast = Math.round(cfg.S.waveClear.pointsPerEnemy * fast.enemies * mult(4));
  afterFast.from.speed - beforeFast.from.speed === wantFast && afterFast.from.hp === beforeFast.from.hp
    ? pass(`clearing a ${fast.enemies}-enemy wave inside its ${(fast.par / 1000).toFixed(1)}s par: +${wantFast} (full bonus, no HP bonus mid-stage)`)
    : fail(`fast clear: ${JSON.stringify({ beforeFast, afterFast, wantFast })}`);
  const half = await jumpTo(4, 1);
  const beforeHalf = await score();
  const afterHalf = await clearWave(half.par * 1.5);   // halfway from par to 2× par
  const wantHalf = Math.round(cfg.S.waveClear.pointsPerEnemy * half.enemies * 0.5 * mult(4));
  // The test's own round trip adds a few ms on top of the backdated time.
  Math.abs(afterHalf.from.speed - beforeHalf.from.speed - wantHalf) <= Math.max(3, wantHalf * 0.05)
    ? pass(`at 1.5× par the bonus is halved: +${afterHalf.from.speed - beforeHalf.from.speed}`)
    : fail(`half clear: got ${afterHalf.from.speed - beforeHalf.from.speed}, want ~${wantHalf}`);
  const slow = await jumpTo(4, 1);
  const beforeSlow = await score();
  const afterSlow = await clearWave(slow.par * 2.5);
  afterSlow.from.speed === beforeSlow.from.speed
    ? pass('past 2× par there is no speed bonus at all')
    : fail(`slow clear still paid ${afterSlow.from.speed - beforeSlow.from.speed}`);

  // === 4. Stage HP bonus =======================================================
  section('4. Stage HP bonus');
  await jumpTo(4, 2);                           // the stage's last wave
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.onPlayerHit(20, 'edgeFire');             // finish on 80 HP, not flawless
  });
  const beforeHp = await score();
  const afterHp = await clearWave(0);
  const hpBonus = afterHp.from.hp - beforeHp.from.hp;
  hpBonus === Math.round(80 * cfg.S.stageClear.pointsPerHp * mult(4))
    ? pass(`finishing Stage 4 on 80 HP: +${hpBonus}`)
    : fail(`hp bonus ${hpBonus}`);
  const hpAfterHeal = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.hp);
  hpAfterHeal === 100 ? pass('the bonus counts the HP before the full heal') : fail(`hp after clear ${hpAfterHeal}`);
  await jumpTo(4, 2);
  const beforeFlawless = await score();
  const afterFlawless = await clearWave(0);
  const flawless = afterFlawless.from.hp - beforeFlawless.from.hp;
  flawless === Math.round(100 * cfg.S.stageClear.pointsPerHp * (1 + cfg.S.stageClear.flawlessBonus) * mult(4))
    ? pass(`a flawless stage (no damage taken): +${flawless}`)
    : fail(`flawless bonus ${flawless}`);

  // === 5. Breakdown, end screen, high score ====================================
  section('5. Breakdown, end screen, high score');
  await page.evaluate(() => window.__runs.clear());
  const total = await score();
  total.score === total.from.kills + total.from.speed + total.from.hp
    ? pass(`the score is exactly its parts: kills ${total.from.kills} + speed ${total.from.speed} + hp ${total.from.hp}`)
    : fail(`score ${total.score} vs parts ${JSON.stringify(total.from)}`);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = 1; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.onPlayerHit(5, 'edgeFire');
  });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
  await page.waitForTimeout(100);
  const end = await page.evaluate(() => ({
    result: window.__warmup.scene.getScene('GameScene').getRoundResult(),
    screen: window.__warmup.scene.getScene('UIScene').resultText.text,
    summary: window.__runs.summary(),
  }));
  const f = end.result.scoreFrom;
  new RegExp(`SCORE\\s+${end.result.score}\\n`).test(end.screen) && f.kills + f.speed + f.hp === end.result.score && !/SCORE FROM/.test(end.screen)
    ? pass('the end screen shows the score; its breakdown stays in the result, off the screen')
    : fail(`end screen:\n${end.screen}`);
  end.summary.bestScore === end.result.score && new RegExp(`YOUR BEST\\s+STAGE \\d+\\s+SCORE ${end.result.score}`).test(end.screen)
    ? pass(`the run log keeps the score: high score ${end.summary.bestScore}`)
    : fail(`summary: ${JSON.stringify(end.summary)}`);

  await finish();
});
