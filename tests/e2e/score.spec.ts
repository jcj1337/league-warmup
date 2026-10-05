import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('score: no points for time alive, kills × stage, wave speed bonus vs par, stage HP + flawless + clear bonus, breakdown + high score', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    S: window.__balance.SCORE, P: window.__balance.PURSUER, M: window.__balance.MAGUS, V: window.__balance.SOVEREIGN,
    B: window.__balance.BULWARK, clearBonus: window.__balance.MODES.normal.stageClearBonus,
  }));
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
    for (const [stage, type] of [[1, 'basic'], [5, 'basic'], [5, 'pursuer'], [5, 'magus'], [5, 'sovereign'], [8, 'bulwark']] as const) {
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
  const killMult = { basic: 1, pursuer: cfg.P.scoreMultiplier, magus: cfg.M.scoreMultiplier, sovereign: cfg.V.scoreMultiplier, bulwark: cfg.B.scoreMultiplier };
  const wantKill = (k) => Math.round(cfg.S.pointsPerKill * killMult[k.type] * mult(k.stage));
  kills.every((k) => k.points === wantKill(k))
    ? pass(`kills: ${kills.map((k) => `S${k.stage} ${k.type} ${k.points}`).join(', ')} (×${mult(5)} on Stage 5)`)
    : fail(`kill points: ${JSON.stringify(kills)}`);
  killMult.pursuer === 2.25 && killMult.magus === 2.5 && killMult.sovereign === 3 && killMult.bulwark === 8
    ? pass('a special is worth more than a Pursuer: Magus ×2.5, Sovereign ×3, Bulwark ×8')
    : fail(`kill multipliers: ${JSON.stringify(killMult)}`);

  // Kill gold: League-style "+N" with a coin over the slime, exactly what the kill scored.
  await page.waitForTimeout(1000);                // let the popups above expire
  const killOne = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = 4; d.currentPhase = 'intermission';
    const e = d.spawnEnemy('basic');
    e.x = 1100; e.y = 600;
    d.enemies.push(e);
    const before = g.scoring.scoreFrom.kills;
    while (e.active) g.onTargetHit(e, e.takeHit());
    return { points: g.scoring.scoreFrom.kills - before, gold: g.fx.activeGold, player: { x: g.player.x, y: g.player.y, r: g.player.radius } };
  });
  const one = await killOne();
  const g1 = one.gold.at(-1);
  one.gold.length === 1 && g1.amount === one.points && g1.text === `+${one.points}` && g1.x === one.player.x && g1.y < one.player.y - one.player.r - 18
    ? pass(`a kill shows "+${one.points}" over the slime`)
    : fail(`kill gold: ${JSON.stringify(one)}`);
  const two = await killOne();
  two.gold.length === 1 && two.gold[0].amount === one.points + two.points
    ? pass(`a kill right after adds into the same popup (+${two.gold[0].amount})`)
    : fail(`merge: ${JSON.stringify(two.gold)}`);
  await page.waitForTimeout(400);
  const three = await killOne();
  three.gold.length === 2 && three.gold.at(-1).amount === three.points
    ? pass('a later kill gets a popup of its own')
    : fail(`separate: ${JSON.stringify(three.gold)}`);

  // It rides on the slime's head: move the slime and the popup comes along.
  await page.waitForTimeout(1000);
  const before = await killOne();
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.x -= 200; g.player.y -= 120;
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { gold: g.fx.activeGold.at(-1), player: { x: g.player.x, y: g.player.y } };
  });
  const followed = after.gold && after.gold.x === after.player.x &&
    after.gold.y < after.player.y - before.player.r - 18 && after.gold.y > after.player.y - 120;
  followed
    ? pass('the gold follows the slime: it stays over its head as it moves')
    : fail(`follow: ${JSON.stringify({ before: before.gold, after })}`);

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
  const clearBonus = afterHp.from.clear - beforeHp.from.clear;
  clearBonus === Math.round(cfg.clearBonus * mult(4)) && clearBonus > 0
    ? pass(`clearing Stage 4 on Normal also pays the mode's flat bonus: +${clearBonus}`)
    : fail(`clear bonus ${clearBonus}, want ${Math.round(cfg.clearBonus * mult(4))}`);
  const hpAfterHeal = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.hp);
  hpAfterHeal === 100 ? pass('the bonus counts the HP before the full heal') : fail(`hp after clear ${hpAfterHeal}`);
  // Scaled damage leaves HP fractional; the heal popup still reads as a whole number,
  // the jump the HUD makes (it shows HP rounded up): 79.37 shows 80, so +20.
  await jumpTo(4, 2);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.onPlayerHit(20.63, 'edgeFire');
  });
  await clearWave(0);
  const healTexts = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').children.list
    .filter((o: { text?: unknown }) => typeof o.text === 'string' && (o.text as string).startsWith('+') && !/[A-Z]/.test(o.text as string))
    .map((o: { text: string }) => o.text));
  healTexts.includes('+20') && healTexts.every((t) => /^\+\d+$/.test(t))
    ? pass(`a fractional heal pops as a whole number: ${healTexts.join(' ')}`)
    : fail(`heal popup: ${JSON.stringify(healTexts)}`);
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
  total.score === total.from.kills + total.from.speed + total.from.hp + total.from.clear
    ? pass(`the score is exactly its parts: kills ${total.from.kills} + speed ${total.from.speed} + hp ${total.from.hp} + clear ${total.from.clear}`)
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
    screen: window.__warmup.scene.getScene('UIScene').endScreen.text,
    summary: window.__runs.summary(),
  }));
  const f = end.result.scoreFrom;
  new RegExp(`SCORE\\s+${end.result.score}\\n`).test(end.screen) && f.kills + f.speed + f.hp + f.clear + f.kit === end.result.score
    && /SCORE FROM/.test(end.screen) && end.screen.includes(`KILLS ${f.kills}  CLEAR SPEED BONUS ${f.speed}  HP BONUS ${f.hp}  STAGE CLEAR BONUS ${f.clear}`)
    ? pass('the end screen shows the score and where it came from; the parts add up to it')
    : fail(`end screen:\n${end.screen}`);
  end.summary.bestScore === end.result.score && new RegExp(`YOUR BEST\\s+STAGE \\d+\\s+SCORE ${end.result.score}`).test(end.screen)
    ? pass(`the run log keeps the score: high score ${end.summary.bestScore}`)
    : fail(`summary: ${JSON.stringify(end.summary)}`);

  await finish();
});
