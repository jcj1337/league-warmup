import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('difficulty: threat curve, scaled stage numbers, scaled mob stats, heal on stage clear', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    D: window.__balance.DIFFICULTY,
    targets: window.__balance.TARGETS,
    pursuer: window.__balance.PURSUER,
    magus: window.__balance.MAGUS,
    stages: 10,
  }));
  const T = (s) => Math.pow(cfg.D.growth, s - 1);
  const curve = (c, s, base = c.base ?? 1) => Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, base * Math.pow(T(s), c.k)));
  const close = (a, b) => Math.abs(a - b) < 1e-6;

  // === 1. The curve ==========================================================
  section('1. The curve');
  const per = await page.evaluate((n) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = [];
    for (let s = 0; s < n; s++) { d.stageIndex = s; out.push(d.difficulty); }
    d.stageIndex = 0;
    return out;
  }, cfg.stages);
  per.every((p) => close(p.threat, T(p.stage)))
    ? pass(`threat = ${cfg.D.growth}^(stage-1): ${per.map((p) => p.threat.toFixed(2)).join(' / ')}`)
    : fail(`threat: ${per.map((p) => p.threat).join(', ')}`);
  per.every((p) => p.waveSize === Math.round(curve(cfg.D.waveSize, p.stage))
    && p.maxAlive === Math.round(curve(cfg.D.maxAlive, p.stage))
    && close(p.arrivalGapMs, curve(cfg.D.arrivalGapMs, p.stage))
    && close(p.moveSpeed, curve(cfg.D.moveSpeed, p.stage))
    && close(p.projectileSpeed, curve(cfg.D.projectileSpeed, p.stage))
    && close(p.damage, curve(cfg.D.damage, p.stage))
    && p.attackTokens === Math.round(curve(cfg.D.attackTokens, p.stage)))
    ? pass('every stage number is clamp(base × T^k, min, max) of its DIFFICULTY curve')
    : fail(`stage numbers: ${JSON.stringify(per[9])}`);
  const s1 = per[0];
  s1.moveSpeed === 1 && s1.projectileSpeed === 1 && s1.damage === 1
    ? pass('Stage 1 is the baseline: speed, projectile speed and damage all ×1')
    : fail(`stage 1: ${JSON.stringify(s1)}`);
  const rising = ['waveSize', 'maxAlive', 'moveSpeed', 'projectileSpeed', 'damage', 'attackTokens'];
  rising.every((k) => per.every((p, i) => i === 0 || p[k] >= per[i - 1][k])) && per.every((p, i) => i === 0 || p.arrivalGapMs < per[i - 1].arrivalGapMs)
    ? pass(`every stage is at least as hard as the last (Stage 10: ${per[9].waveSize} per wave, ${per[9].maxAlive} at once, ${Math.round(per[9].arrivalGapMs)}ms gaps, damage ×${per[9].damage.toFixed(2)})`)
    : fail('a scaled number moved the wrong way between stages');

  // === 2. Scaled mob stats ===================================================
  section('2. Scaled mob stats');
  const mobs = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = {};
    for (const s of [1, 10]) {
      d.stageIndex = s - 1;
      const b = d.spawnEnemy('basic');
      const p = d.spawnEnemy('pursuer');
      const m = d.spawnEnemy('magus');
      out[s] = {
        moveScale: b.moveScale, spitCd: b.spitCooldownMs, spitSpeed: b.spitSpeed,
        pursuerFrac: p.speedFraction, dashCd: p.dashCooldownMs, swingCd: p.attackCooldownMs,
        gap: m.spellGapMs, orbSpeed: m.orbSpeed,
      };
      b.destroy(); p.destroy(); m.destroy();
    }
    d.stageIndex = 0;
    return out;
  });
  {
    const a = mobs[1];
    const b = mobs[10];
    a.spitCd === cfg.targets.spit.cooldownMs && a.dashCd === cfg.pursuer.dash.cooldownMs && a.gap === cfg.magus.spellGapMs
      && a.pursuerFrac === cfg.pursuer.moveSpeedFraction && a.spitSpeed === cfg.targets.spit.speed
      ? pass('Stage 1 mobs use their base numbers unchanged')
      : fail(`stage 1 mobs: ${JSON.stringify(a)}`);
    close(b.moveScale, per[9].moveSpeed) && close(b.pursuerFrac, Math.min(cfg.pursuer.maxSpeedFraction, cfg.pursuer.moveSpeedFraction * b.moveScale))
      ? pass(`Stage 10: everyone moves ×${b.moveScale.toFixed(2)}; the Pursuer at ${b.pursuerFrac.toFixed(2)} of your speed (cap ${cfg.pursuer.maxSpeedFraction})`)
      : fail(`stage 10 movement: ${JSON.stringify(b)}`);
    close(b.spitSpeed, Math.min(cfg.D.projectileMaxSpeed, cfg.targets.spit.speed * per[9].projectileSpeed))
      && close(b.orbSpeed, Math.min(cfg.D.projectileMaxSpeed, cfg.magus.orb.speed * per[9].projectileSpeed))
      && b.orbSpeed <= cfg.D.projectileMaxSpeed
      ? pass(`Stage 10 projectiles: spit ${Math.round(b.spitSpeed)}px/s, orb ${Math.round(b.orbSpeed)}px/s (capped at ${cfg.D.projectileMaxSpeed})`)
      : fail(`stage 10 projectiles: ${JSON.stringify(b)}`);
    close(b.spitCd, curve(cfg.targets.scaling.spitCooldownMs, 10, cfg.targets.spit.cooldownMs))
      && close(b.dashCd, curve(cfg.pursuer.scaling.dashCooldownMs, 10, cfg.pursuer.dash.cooldownMs))
      && close(b.swingCd, curve(cfg.pursuer.scaling.attackCooldownMs, 10, cfg.pursuer.attackCooldownMs))
      && close(b.gap, curve(cfg.magus.scaling.spellGapMs, 10, cfg.magus.spellGapMs))
      ? pass(`Stage 10 cooldowns: spit ${Math.round(b.spitCd)}, dash ${Math.round(b.dashCd)}, swing ${Math.round(b.swingCd)}, Magus gap ${Math.round(b.gap)}ms`)
      : fail(`stage 10 cooldowns: ${JSON.stringify(b)}`);
  }
  // Floors and caps hold far past the authored stages.
  const far = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = 59;   // a hypothetical Stage 60 (no table row, so pips are stubbed)
    d.pipsFor = () => 1;
    const p = d.spawnEnemy('pursuer');
    const b = d.spawnEnemy('basic');
    const out = { diff: d.difficulty, frac: p.speedFraction, dashCd: p.dashCooldownMs, spitCd: b.spitCooldownMs, spitSpeed: b.spitSpeed };
    p.destroy(); b.destroy();
    delete d.pipsFor;
    d.stageIndex = 0;
    return out;
  });
  far.frac === cfg.pursuer.maxSpeedFraction && far.dashCd === cfg.pursuer.scaling.dashCooldownMs.min
    && far.spitCd === cfg.targets.scaling.spitCooldownMs.min && far.spitSpeed === cfg.D.projectileMaxSpeed
    && far.diff.maxAlive === cfg.D.maxAlive.max && far.diff.arrivalGapMs === cfg.D.arrivalGapMs.min
    ? pass(`at Stage 60 every floor and cap holds (Pursuer ${far.frac} of your speed, dash ${far.dashCd}ms, ${far.diff.maxAlive} on the field)`)
    : fail(`stage 60: ${JSON.stringify(far)}`);

  // === 3. Damage scaling =====================================================
  section('3. Damage scaling');
  const hits = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const out = [];
    for (const s of [1, 10]) {
      g.director.stageIndex = s - 1;
      g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
      g.onEnemyHit(25);
      out.push({ stage: s, taken: 100 - g.player.hp, mult: g.director.difficulty.damage });
    }
    g.director.stageIndex = 0;
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    return out;
  });
  hits[0].taken === 25 && hits[1].taken === Math.round(25 * hits[1].mult)
    ? pass(`a 25-damage enemy hit costs ${hits[0].taken} at Stage 1 and ${hits[1].taken} at Stage 10`)
    : fail(`hits: ${JSON.stringify(hits)}`);

  // === 4. Heal on stage clear ================================================
  section('4. Heal on stage clear');
  /** Clear the current wave by killing everything in it; returns the player's HP before and after. */
  const clearWave = (stage, wave, hp) => page.evaluate(({ stage, wave, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    d.stageIndex = stage - 1; d.waveIndex = wave - 1; d.spawnWave(); d.arriveAllNow();
    g.player.hp = hp;
    for (const e of d.enemies) { while (!e.dead) e.takeHit(); d.onEnemyKilled(e, g.clock.now); }
    return { before: hp, after: g.player.hp, phase: d.phase, next: d.nextTransition };
  }, { stage, wave, hp });
  const midStage = await clearWave(4, 1, 50);
  midStage.next === 'wave' && midStage.after === 50
    ? pass('clearing a wave that is not the stage\'s last heals nothing')
    : fail(`wave clear: ${JSON.stringify(midStage)}`);
  const stageEnd = await clearWave(4, 2, 50);
  stageEnd.next === 'stage' && stageEnd.after === 50 + cfg.D.stageClearHeal
    ? pass(`clearing a stage heals ${cfg.D.stageClearHeal} (50 → ${stageEnd.after})`)
    : fail(`stage clear: ${JSON.stringify(stageEnd)}`);
  const capped = await clearWave(2, 1, 90);
  capped.after === 100
    ? pass('never past full HP (90 → 100)')
    : fail(`capped heal: ${JSON.stringify(capped)}`);

  await finish();
});
