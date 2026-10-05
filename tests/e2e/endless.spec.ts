import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('endless: generated stages, budgets + caps, first appearances, packs, pip caps, personal best, damaged-only bars', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    enemies: window.__balance.ENEMIES,
    endless: window.__balance.ENDLESS,
    authored: window.__balance.STAGES.length,
    gapMs: window.__balance.RUN.spawn.packMemberGapMs,
  }));
  const ids = Object.keys(cfg.enemies);

  // === 1. Generated stages ===================================================
  section('1. Generated stages');
  const gen = await page.evaluate((n) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = [];
    for (let s = n; s < 30; s++) {
      const prev = d.stageIndex;
      d.stageIndex = s;
      const diff = d.difficulty;
      d.stageIndex = prev;
      out.push({ stage: s + 1, waves: d.describeStage(s).waves, again: d.rosterFor(s, 0), budget: diff.waveSize });
    }
    return out;
  }, cfg.authored);
  gen.every((g) => g.waves.length === cfg.endless.wavesPerStage)
    ? pass(`every stage past the hand-written ${cfg.authored} has ${cfg.endless.wavesPerStage} waves (checked to Stage 30)`)
    : fail(`wave counts: ${gen.map((g) => g.waves.length).join(',')}`);
  gen.every((g) => JSON.stringify(g.again) === JSON.stringify(g.waves[0]))
    ? pass('a generated wave is fixed once rolled: asking again gives the same roster')
    : fail('generated rosters are not stable');
  {
    const costOf = (r) => Object.entries(r).reduce((n, [id, c]) => n + (c as number) * cfg.enemies[id].cost, 0);
    const over = gen.flatMap((g) => g.waves.map((r) => ({ stage: g.stage, cost: costOf(r), budget: g.budget }))).find((b) => b.cost > b.budget + 1e-9);
    !over
      ? pass(`no generated wave spends more than its budget (Stage 30 Wave 1: ${JSON.stringify(gen.at(-1).waves[0])})`)
      : fail(`over budget: ${JSON.stringify(over)}`);
    const shareBreak = gen.flatMap((g) => g.waves.map((r) => ({ stage: g.stage, r, budget: g.budget })))
      .find((w) => ids.some((id) => w.r[id] > Math.max(1, Math.floor(cfg.enemies[id].maxShare * w.budget / cfg.enemies[id].cost))));
    !shareBreak
      ? pass('every mob stays within its maxShare of the budget')
      : fail(`share broken: ${JSON.stringify(shareBreak)}`);
    const magi = gen.map((g) => Math.max(...g.waves.map((r) => r.magus)));
    magi.every((m) => m <= 3) && magi.some((m) => m >= 2)
      ? pass(`Magi per wave follow their cap: ${magi.join(' ')} (Stages ${cfg.authored + 1}-30)`)
      : fail(`magi per wave: ${magi.join(' ')}`);
    const mixes = new Set(gen.slice(0, 10).flatMap((g) => g.waves.map((r) => ids.map((id) => r[id]).join('/'))));
    mixes.size >= 8
      ? pass(`generated waves vary (${mixes.size} different mixes over 10 stages)`)
      : fail(`too little variety: ${[...mixes].join(' | ')}`);
  }

  // === 2. First appearances ==================================================
  section('2. First appearances');
  // Make the Magus unlock on a generated stage, on a fresh run, and look at its rosters.
  const debut = await page.evaluate(() => {
    window.__balance.ENEMIES.magus.unlockStage = 8;
    const g = window.__warmup.scene.getScene('GameScene');
    g.restartRound();
    return new Promise<any>((res) => setTimeout(() => {
      const d = window.__warmup.scene.getScene('GameScene').director;
      const out = { s7: d.describeStage(6).waves.map((r) => r.magus), s8: d.describeStage(7).waves.map((r) => r.magus) };
      window.__balance.ENEMIES.magus.unlockStage = 5;
      res(out);
    }, 300));
  });
  debut.s7.every((m) => m === 0) && debut.s8[0] === 1
    ? pass(`a mob never appears before its unlock stage, and Wave 1 of that stage fields exactly one (Stage 8 Magi: ${debut.s8.join(', ')})`)
    : fail(`debut: ${JSON.stringify(debut)}`);
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').restartRound());
  await page.waitForTimeout(300);

  // === 3. Packs ==============================================================
  section('3. Packs');
  const packs = await page.evaluate((gapMs) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 9999;
    d.stageIndex = 14; d.waveIndex = 0;      // Stage 15: packs of 2
    d.spawnWave();
    const size = d.difficulty.packSize;
    const queued = [...d.enemies.map(() => null), ...d.pending.map((p) => ({ pack: p.pack, startsAt: p.startsAt }))];
    const firstPending = d.enemies.length;
    d.arriveAllNow();
    const spots = d.enemies.map((e) => ({ x: e.x, y: e.y }));
    // Group arrivals by pack (the first arrival is pack 0).
    const byPack = new Map();
    queued.forEach((q, i) => {
      const pack = q ? q.pack : 0;
      if (!byPack.has(pack)) byPack.set(pack, []);
      byPack.get(pack).push({ ...spots[i], startsAt: q?.startsAt ?? null });
    });
    const groups = [...byPack.values()];
    const spread = groups.map((m) => Math.max(...m.map((a) => Math.hypot(a.x - m[0].x, a.y - m[0].y))));
    const timing = groups.filter((m) => m.every((a) => a.startsAt !== null))
      .map((m) => Math.max(...m.map((a) => a.startsAt)) - Math.min(...m.map((a) => a.startsAt)));
    return { size, groups: groups.map((m) => m.length), spread, timing, gapMs, firstPending };
  }, cfg.gapMs);
  packs.size >= 2 && packs.groups.slice(0, -1).every((n) => n === packs.size)
    ? pass(`Stage 15 arrivals come in packs of ${packs.size} (${packs.groups.join(' ')})`)
    : fail(`packs: ${JSON.stringify(packs)}`);
  packs.timing.every((t) => t <= packs.gapMs * (packs.size - 1) + 1)
    ? pass(`a pack's members arrive within ${packs.gapMs * (packs.size - 1)}ms of each other`)
    : fail(`pack timing: ${JSON.stringify(packs.timing)}`);
  packs.spread.filter((d) => d <= 140).length >= packs.spread.length * 0.8
    ? pass(`and land together: most packs within 140px of their first member (${packs.spread.map((d) => Math.round(d)).join(' ')})`)
    : fail(`pack spread: ${JSON.stringify(packs.spread)}`);

  // === 4. Pip caps ===========================================================
  section('4. Pip caps');
  const pips = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    return [1, 4, 7, 10, 30].map((s) => ({ s, basic: d.pipsFor('basic', s), pursuer: d.pipsFor('pursuer', s), magus: d.pipsFor('magus', s) }));
  });
  pips.map((p) => `${p.basic}/${p.pursuer}/${p.magus}`).join(' ') === '1/2/1 1/2/1 1/2/1 1/2/1 1/3/2'
    ? pass('basics are 1 pip forever; Pursuer 2 → 3 and Magus 1 → 2 from Stage 11, then capped (Stage 30 included)')
    : fail(`pips: ${JSON.stringify(pips)}`);

  // === 5. Damaged-only health bars ===========================================
  section('5. Damaged-only health bars');
  const bars = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = 6; d.waveIndex = 0; d.spawnWave(); d.arriveAllNow();
    // A mob with more than one pip, so it survives the first hit.
    const e = d.enemies.find((x) => x.maxHp > 1);
    requestAnimationFrame(() => {
      const before = e.view.hpBar.visible;
      e.takeHit();
      requestAnimationFrame(() => res({ before, after: e.view.hpBar.visible, hp: e.hp, max: e.maxHp }));
    });
  }));
  !bars.before && bars.after && bars.hp < bars.max
    ? pass(`a full-health enemy shows no bar; it appears with the first pip lost (${bars.hp}/${bars.max})`)
    : fail(`bars: ${JSON.stringify(bars)}`);

  // === 6. Personal best ======================================================
  section('6. Personal best');
  const dieAt = async (stage) => {
    await page.evaluate(() => window.__warmup.scene.getScene('GameScene').restartRound());
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() === null);
    await page.waitForTimeout(200);
    await page.evaluate((st) => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.director.stageIndex = st - 1;
      g.player.hp = 1; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
      g.onPlayerHit(5, 'edgeFire');
    }, stage);
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
    await page.waitForTimeout(100);
    return page.evaluate(() => ({
      result: window.__warmup.scene.getScene('GameScene').getRoundResult(),
      screen: window.__warmup.scene.getScene('UIScene').endScreen.text,
    }));
  };
  await page.evaluate(() => window.__runs.clear());
  const first = await dieAt(6);
  const lower = await dieAt(4);
  const higher = await dieAt(9);
  first.result.newBest && first.result.previousBest === null && /STAGE REACHED\s+6.*NEW BEST/.test(first.screen)
    ? pass('the first logged run is a new best (shown on the end screen)')
    : fail(`first: ${JSON.stringify(first.result)}\n${first.screen}`);
  !lower.result.newBest && lower.result.previousBest === 6 && !/NEW BEST/.test(lower.screen)
    ? pass('a worse run is not')
    : fail(`lower: ${JSON.stringify(lower.result)}`);
  higher.result.newBest && higher.result.previousBest === 6 && /NEW BEST/.test(higher.screen) && /YOUR BEST\s+STAGE 9\b/.test(higher.screen)
    ? pass('beating it is, and your best updates (STAGE 9)')
    : fail(`higher: ${JSON.stringify(higher.result)}\n${higher.screen}`);
  /DEFEATED/.test(await page.evaluate(() => window.__warmup.scene.getScene('UIScene').endScreen.container.getByName('title').text))
    ? pass('the end screen always reads DEFEATED: the run only ends on death')
    : fail('end screen title');

  await finish();
});
