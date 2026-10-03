import { test } from '@playwright/test';
import { startSuite, waitForGame } from './support/harness';

test('runs: damage by source, killing blow, local run log, end-screen summary, clear', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  /** Quiet arena, healthy player: no edge fire, enemies parked far away and harmless. */
  const calm = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
  });
  /** Land one hit from `source` through the real damage path, i-frames reset first. */
  const hit = (amount, source) => page.evaluate(({ amount, source }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    if (source === 'edgeFire') g.onPlayerHit(amount, 'edgeFire');
    else g.onEnemyHit(amount, source);
    return { hp: g.player.hp, taken: { ...g.scoring.damageTaken }, killedBy: g.scoring.killedBy };
  }, { amount, source });
  /** Finish the run with a lethal hit from `source`; resolves once the end screen is up. */
  const dieTo = async (source) => {
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.player.hp = 5; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    });
    await hit(25, source);
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null, null, { timeout: 3000 });
    await page.waitForTimeout(100);
    return page.evaluate(() => ({
      result: window.__warmup.scene.getScene('GameScene').getRoundResult(),
      screen: window.__warmup.scene.getScene('UIScene').resultText.text,
      runs: window.__runs.list(),
    }));
  };
  const restart = async () => {
    await page.evaluate(() => window.__warmup.scene.getScene('GameScene').restartRound());
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() === null, null, { timeout: 3000 });
    await page.waitForTimeout(200);
  };

  // === 1. Damage by source ===================================================
  section('1. Damage by source');
  const empty = await page.evaluate(() => window.__runs.list());
  empty.length === 0 ? pass('a fresh browser has an empty run log') : fail(`log not empty: ${empty.length}`);
  await calm();
  await hit(10, 'pursuer');
  await hit(4, 'basic');
  const tagged = await hit(8, 'edgeFire');
  tagged.taken.pursuer === 10 && tagged.taken.basic === 4 && tagged.taken.edgeFire === 8 && tagged.killedBy === null
    ? pass(`damage is tallied per source: ${JSON.stringify(tagged.taken)} (Stage 1, unscaled)`)
    : fail(`tally: ${JSON.stringify(tagged)}`);
  const eaten = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.onEnemyHit(10, 'magus');            // inside the i-frames of the last hit
    return { ...g.scoring.damageTaken };
  });
  eaten.magus === undefined
    ? pass('a hit eaten by i-frames is not counted')
    : fail(`i-frame hit counted: ${JSON.stringify(eaten)}`);

  // === 2. A death is logged =================================================
  section('2. A death is logged');
  const death = await dieTo('magus');
  const r = death.result;
  r.outcome === 'defeated' && r.killedBy === 'magus' && r.damageTaken.magus === 5
    ? pass('the killing blow is credited to its source (magus), counting only the HP it actually took')
    : fail(`result: ${JSON.stringify({ outcome: r.outcome, killedBy: r.killedBy, taken: r.damageTaken })}`);
  const logged = death.runs.at(-1);
  death.runs.length === 1 && logged.outcome === 'defeated' && logged.killedBy === 'magus' && logged.stage === r.stageReached
    && logged.wave === r.waveReached && logged.growth === r.growth && logged.damageTaken.pursuer === 10 && !Number.isNaN(Date.parse(logged.at))
    ? pass(`the run is saved locally: ${JSON.stringify(logged)}`)
    : fail(`log: ${JSON.stringify(death.runs)}`);
  /KILLED BY\s+magus/.test(death.screen) && /DAMAGE, FINAL STAGE\s+pursuer 10 fire 8 magus 5 spit 4/.test(death.screen) && /YOUR RUNS \(V\d+ G[\d.]+\)\s+1 RUN\s+MEDIAN S1\s+BEST S1/.test(death.screen)
    ? pass('the end screen shows the killer, the damage breakdown and your logged runs')
    : fail(`end screen:\n${death.screen}`);

  // === 3. The log persists, per growth setting =============================
  section('3. The log persists, per growth setting');
  await page.reload({ waitUntil: 'load' });
  await waitForGame(page, 300);
  const afterReload = await page.evaluate(() => window.__runs.list().length);
  afterReload === 1 ? pass('the log survives a page reload') : fail(`after reload: ${afterReload}`);
  await calm();
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 2; });
  await dieTo('pursuer');
  await restart();
  await restart();                              // a restart mid-run is not a finished run
  const midRestart = await page.evaluate(() => window.__runs.list().length);
  midRestart === 2 ? pass('restarting mid-run logs nothing') : fail(`runs after a mid-run restart: ${midRestart}`);
  const growth = await page.evaluate(() => window.__balance.DIFFICULTY.growth);
  await page.evaluate(() => { window.__balance.DIFFICULTY.growth = 1.12; });
  await calm();
  await dieTo('basic');
  const sums = await page.evaluate((g) => ({ base: window.__runs.summary(g), other: window.__runs.summary(1.12), current: window.__runs.summary() }), growth);
  await page.evaluate((g) => { window.__balance.DIFFICULTY.growth = g; }, growth);
  sums.base.runs === 2 && sums.base.median === 2 && sums.base.best === 3 && sums.base.recent.join() === '1,3'
    && sums.base.killedBy.magus === 1 && sums.base.killedBy.pursuer === 1
    ? pass(`runs on growth ${growth}: ${sums.base.runs}, median S${sums.base.median}, best S${sums.base.best}, killers ${JSON.stringify(sums.base.killedBy)}`)
    : fail(`summary ${growth}: ${JSON.stringify(sums.base)}`);
  sums.other.runs === 1 && sums.other.killedBy.basic === 1 && sums.current.growth === 1.12
    ? pass('a run on another growth setting is kept separate (summary defaults to the current setting)')
    : fail(`summary 1.12: ${JSON.stringify(sums)}`);

  // === 4. Discarding and blocked storage =====================================
  section('4. Discarding and blocked storage');
  const cleared = await page.evaluate(() => { window.__runs.clear(); return window.__runs.list().length; });
  cleared === 0 ? pass('__runs.clear() deletes the whole log') : fail(`after clear: ${cleared}`);
  await restart();
  await calm();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
  });
  const blocked = await dieTo('pursuer');
  blocked.result?.outcome === 'defeated' && blocked.runs.length === 0 && /YOUR RUNS.*not logged/.test(blocked.screen)
    ? pass('with storage blocked the run still ends normally; it just is not logged')
    : fail(`blocked storage: ${JSON.stringify({ outcome: blocked.result?.outcome, runs: blocked.runs.length })}\n${blocked.screen}`);

  await finish();
});
