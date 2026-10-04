import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('progression: contact damage, levels from kills (haste, attack speed, Q rank-up), HUD + run log', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    enemies: window.__balance.ENEMIES,
    contact: window.__balance.CONTACT,
    levels: window.__balance.LEVELS,
    q: window.__balance.SKILLSHOT_Q,
    flash: window.__balance.FLASH,
  }));

  /** Quiet arena on a stage, healthy player at (640, 360), level 1, no enemies. */
  const calm = (stage = 1) => page.evaluate((stage) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = stage - 1; d.waveIndex = 0;
    d.currentPhase = 'wave';   // a test kill may have started a breather; stay put
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    d.enemies.forEach((e) => e.destroy()); d.enemies.length = 0; d.pending.length = 0;
    g.enemies = d.enemies;
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.x = 640; g.player.y = 360; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.skillshot.clear();
    g.cooldowns.reset();
    g.progression.level = 1; g.progression.xp = 0; g.progression.totalXp = 0;
  }, stage);
  /** Add one parked, harmless (no spit, no dash, no swing) enemy. */
  const add = (type, x, y, hp?) => page.evaluate(({ type, x, y, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const e = d.spawnEnemy(type);
    e.x = x; e.y = y; if (hp) e.hp = hp;
    e.goalX = x; e.goalY = y; e.nextPlanAt = Number.POSITIVE_INFINITY;
    if ('canSpit' in e) e.canSpit = false;
    if ('canDash' in e) e.canDash = false;
    if ('nextAttackAt' in e) e.nextAttackAt = Number.POSITIVE_INFINITY;
    if ('nextCastAt' in e) { e.nextCastAt = Number.POSITIVE_INFINITY; e.riteUsed = true; }
    d.enemies.push(e);
    g.enemies = d.enemies;
    return d.enemies.length - 1;
  }, { type, x, y, hp });
  const sample = (ms) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const out = [];
    const tick = () => {
      out.push({ t: g.clock.now - t0, hp: g.player.hp, taken: { ...g.scoring.damageTaken } });
      if (g.clock.now - t0 >= ms) res(out); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);

  // === 1. Contact damage ======================================================
  section('1. Contact damage');
  await calm(1);
  await add('basic', 640 + 30, 360);           // bodies overlap (radii 18 + 14 = 32)
  const touch = await sample(cfg.contact.cooldownMs + 250);
  {
    // From the known 100 HP: the first bump can land before the first sample.
    const series = [{ t: -1, hp: 100 }, ...touch];
    const drops = series.slice(1).map((f, i) => ({ t: f.t, d: series[i].hp - f.hp })).filter((x) => x.d > 0);
    const base = cfg.enemies.basic.contactDamage;
    drops.length >= 2 && drops[0].d === base && drops[1].t - Math.max(0, drops[0].t) >= cfg.contact.cooldownMs - 40
      ? pass(`a touching basic bumps for ${base} (Stage 1), then again after its ${cfg.contact.cooldownMs}ms cooldown`)
      : fail(`contact drops: ${JSON.stringify(drops)}`);
    touch.at(-1).taken.basicContact > 0 && touch.at(-1).taken.basic === undefined
      ? pass('contact is logged as its own source (basicContact), apart from spit')
      : fail(`sources: ${JSON.stringify(touch.at(-1).taken)}`);
  }
  await calm(1);
  await add('basic', 640 + 40, 360);           // 40px apart: not touching
  const apart = await sample(600);
  apart.every((f) => f.hp === 100) ? pass('a body that is not touching deals nothing') : fail('damage without contact');
  await calm(10);
  await add('pursuer', 640 + 30, 360);
  const late = await sample(200);
  {
    const mult = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.difficulty.contactDamage);
    const want = Math.round(cfg.enemies.pursuer.contactDamage * mult);
    100 - late.at(-1).hp === want
      ? pass(`at Stage 10 a Pursuer bump costs ${want} (${cfg.enemies.pursuer.contactDamage} × ${mult.toFixed(2)})`)
      : fail(`stage 10 contact: took ${100 - late.at(-1).hp}, want ${want}`);
  }
  // An arriving enemy is inert: no contact.
  await calm(1);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.spawnEnemy('basic', 5000);
    e.x = 660; e.y = 360;
    g.director.enemies.push(e);
  });
  const arriving = await sample(500);
  arriving.every((f) => f.hp === 100) ? pass('an enemy still arriving never bumps you') : fail('arriving enemy dealt contact damage');

  // === 2. Levels from kills ===================================================
  section('2. Levels from kills');
  await calm(1);
  const kills = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const out = [];
    for (const type of ['basic', 'pursuer', 'magus']) {
      const e = g.director.spawnEnemy(type);
      e.x = 1100; e.y = 100;
      g.director.enemies.push(e);
      const before = g.progression.totalXp;
      while (e.active) g.onTargetHit(e, e.takeHit());
      out.push({ type, xp: g.progression.totalXp - before });
    }
    return out;
  });
  kills.every((k) => k.xp === cfg.enemies[k.type].xp)
    ? pass(`kills give XP: ${kills.map((k) => `${k.type} ${k.xp}`).join(', ')}`)
    : fail(`kill XP: ${JSON.stringify(kills)}`);
  const climb = await page.evaluate(() => {
    const p = window.__warmup.scene.getScene('GameScene').progression;
    p.level = 1; p.xp = 0;
    const needs = [];
    for (let l = 1; l < 18; l++) needs.push(p.xpToNext), p.addXp(p.xpToNext, 0);
    const at18 = { level: p.level, progress: p.progress, gained: p.addXp(999, 0) };
    return { needs, at18 };
  });
  climb.needs[0] === cfg.levels.xp.first && climb.needs.every((n, i) => i === 0 || n >= climb.needs[i - 1])
    && climb.at18.level === cfg.levels.max && climb.at18.progress === 1 && climb.at18.gained === 0
    ? pass(`XP per level ${climb.needs.join(' ')} (${climb.needs.reduce((a, b) => a + b, 0)} to reach ${cfg.levels.max}); capped at ${cfg.levels.max}`)
    : fail(`level climb: ${JSON.stringify(climb)}`);

  // === 3. What a level buys ====================================================
  section('3. What a level buys');
  const kit = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const out = {};
    for (const l of [1, 9, 18]) {
      g.progression.level = l;
      out[l] = { q: g.cooldowns.totalMs('q'), w: g.cooldowns.totalMs('w'), e: g.cooldowns.totalMs('e'), flash: g.cooldowns.totalMs('flash'), base: g.attacks.baseCooldownMs, qPips: g.progression.qPips };
    }
    g.progression.level = 1;
    return out;
  });
  {
    const haste = (l) => 100 / (100 + cfg.levels.abilityHastePerLevel * (l - 1));
    const base = (l) => cfg.levels.baseAttackCooldownMs / (1 + cfg.levels.attackSpeedPerLevel * (l - 1));
    Math.abs(kit[18].q - cfg.q.cooldownMs * haste(18)) < 1e-6 && kit[1].q === cfg.q.cooldownMs && kit[9].w < kit[1].w && kit[18].e < kit[9].e
      ? pass(`ability haste: Q ${kit[1].q} → ${Math.round(kit[9].q)} (level 9) → ${Math.round(kit[18].q)}ms (level 18)`)
      : fail(`cooldowns by level: ${JSON.stringify(kit)}`);
    kit[1].flash === cfg.flash.cooldownMs && kit[18].flash === cfg.flash.cooldownMs
      ? pass('Flash is a summoner: levels never touch it')
      : fail(`flash by level: ${kit[1].flash} / ${kit[18].flash}`);
    [1, 9, 18].every((l) => Math.abs(kit[l].base - base(l)) < 1e-6)
      ? pass(`attack speed: base auto cycle ${Math.round(kit[1].base)} → ${Math.round(kit[9].base)} → ${Math.round(kit[18].base)}ms`)
      : fail(`auto cycle by level: ${JSON.stringify(kit)}`);
    kit[1].qPips === 1 && kit[9].qPips === cfg.levels.qRankUp.pips
      ? pass(`Q ranks up at level ${cfg.levels.qRankUp.level}: ${cfg.levels.qRankUp.pips} pips per hit`)
      : fail(`q pips: ${kit[1].qPips} / ${kit[9].qPips}`);
  }
  // A real ranked Q on a 3-pip Pursuer.
  const qHit = async (level) => {
    await calm(11);                             // Stage 11: Pursuers have 3 pips
    await add('pursuer', 900, 360);
    await page.evaluate((l) => { window.__warmup.scene.getScene('GameScene').progression.level = l; }, level);
    await page.mouse.move(900, 360);
    await page.keyboard.press('q');
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').skillshot.shotsHit > 0
      || window.__warmup.scene.getScene('GameScene').director.enemies[0].hp < 3, null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(100);
    return page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].hp);
  };
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').skillshot.shotsHit = 0; });
  const lowQ = await qHit(cfg.levels.qRankUp.level - 1);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').skillshot.shotsHit = 0; });
  const highQ = await qHit(cfg.levels.qRankUp.level);
  lowQ === 2 && highQ === 1
    ? pass(`a real Q hit on a 3-pip Pursuer leaves ${lowQ} at level ${cfg.levels.qRankUp.level - 1}, ${highQ} at level ${cfg.levels.qRankUp.level}`)
    : fail(`ranked Q: level ${cfg.levels.qRankUp.level - 1} left ${lowQ}, level ${cfg.levels.qRankUp.level} left ${highQ}`);

  // === 4. HUD, end screen, run log ============================================
  section('4. HUD, end screen, run log');
  await calm(1);
  const hud = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    g.progression.addXp(15, g.clock.now);       // level 2 with 5 of 12 toward level 3
    requestAnimationFrame(() => requestAnimationFrame(() => res({
      text: ui.levelText.text, hudLevel: g.getHudState().level, progress: g.getHudState().levelProgress,
    })));
  }));
  hud.text === 'LV 2' && hud.hudLevel === 2 && Math.abs(hud.progress - 5 / 12) < 1e-6
    ? pass(`the vitals plate reads "${hud.text}" with the XP bar ${Math.round(hud.progress * 100)}% to level 3`)
    : fail(`hud: ${JSON.stringify(hud)}`);
  await page.evaluate(() => {
    window.__runs.clear();
    // An older-version run on the same growth: must not count.
    window.__profile.update((d) => d.runs.push({ at: new Date().toISOString(), outcome: 'defeated', stage: 30, wave: 1, runTimeSeconds: 1, growth: window.__balance.DIFFICULTY.growth, killedBy: null, damageTaken: {} }));
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = 1; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.onPlayerHit(5, 'edgeFire');
  });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
  await page.waitForTimeout(100);
  const end = await page.evaluate(() => ({
    result: window.__warmup.scene.getScene('GameScene').getRoundResult(),
    screen: window.__warmup.scene.getScene('UIScene').resultText.text,
    last: window.__runs.list().at(-1),
    summary: window.__runs.summary(),
  }));
  end.result.level === 2 && /STAGE REACHED\s+1\s+\(wave 1\/\d+\)\s+LV 2/.test(end.screen) && end.last.level === 2
    ? pass('the end screen and the run log record the level reached')
    : fail(`end: ${JSON.stringify({ level: end.result.level, last: end.last })}\n${end.screen}`);
  end.summary.runs === 1 && end.summary.best === 1 && end.last.balanceVersion === end.summary.balanceVersion
    ? pass(`runs are tagged with BALANCE_VERSION ${end.summary.balanceVersion}; an older version's Stage 30 run is left out of the summary`)
    : fail(`summary: ${JSON.stringify(end.summary)}`);

  await finish();
});
