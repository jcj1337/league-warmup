import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('scaling: level-based attack speed, measured cycle, passive on top, cancel + orbwalk at max speed, cues', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  /**
   * Put the player on a given level. The base auto cycle is read live from the
   * player's level (Progression), so nothing needs respawning.
   */
  const setLevel = (level) => page.evaluate((l) => {
    const p = window.__warmup.scene.getScene('GameScene').progression;
    p.level = l; p.xp = 0;
  }, level);
  const calm = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
  });
  const place = (spots, hp) => page.evaluate(({ spots, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.x = 640; g.player.y = 360; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = hp ?? t.maxHp; t.active = true; t.__tag = i + 1;
      } else { t.active = false; t.respawnAt = Number.POSITIVE_INFINITY; }
      t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
    });
  }, { spots, hp });
  const atk = () => page.evaluate(() => {
    const a = window.__warmup.scene.getScene('GameScene').attacks;
    return { base: a.baseCooldownMs, cd: a.cooldownMs, windup: a.windupMs, aps: a.attacksPerSecond, state: a.state };
  });
  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });

  const cfg = await page.evaluate(() => ({
    // The first ten stages as played: hand-written ones, then generated ones.
    stages: Array.from({ length: 10 }, (_, s) => window.__warmup.scene.getScene('GameScene').director.describeStage(s)),
    levels: { ...window.__balance.LEVELS, ...window.__magicBoy.LEVELS },
    windupPct: window.__balance.ATTACK.windupPercent,
    minWindup: window.__balance.ATTACK.minWindupMs,
    spawn: window.__balance.ENEMY_PROJECTILES.spawnIntervalMs,
    passive: window.__magicBoy.PASSIVE,
  }));
  /** The level's base auto cycle: LEVELS.baseAttackCooldownMs sped up by attackSpeedPerLevel per level. */
  const baseOf = (level) => cfg.levels.baseAttackCooldownMs / (1 + cfg.levels.attackSpeedPerLevel * (level - 1));
  const last = cfg.levels.max;

  // === 1. Base attack speed scales with stage, not time ======================
  section('1. Base attack speed scales with level, not time');
  await calm();
  await setLevel(1);
  const early = await atk();
  await setLevel(last);
  const late = await atk();
  await setLevel(5);
  const mid = await atk();

  Math.abs(early.cd - baseOf(1)) < 1
    ? pass(`Level 1: cooldown ${early.cd.toFixed(0)}ms (${early.aps.toFixed(2)}/s)`)
    : fail(`Level 1 cooldown ${early.cd} vs ${baseOf(1)}`);
  Math.abs(late.cd - baseOf(last)) < 1
    ? pass(`Level ${last}: cooldown ${late.cd.toFixed(0)}ms (${late.aps.toFixed(2)}/s)`)
    : fail(`Level ${last} cooldown ${late.cd} vs ${baseOf(last)}`);
  mid.cd < early.cd && mid.cd > late.cd
    ? pass(`Level 5 is between the two (${mid.cd.toFixed(0)}ms, ${mid.aps.toFixed(2)}/s)`)
    : fail(`Level 5 cooldown ${mid.cd} not between ${late.cd} and ${early.cd}`);
  late.aps / early.aps > 1.3
    ? pass(`base attack speed rises ${((late.aps / early.aps - 1) * 100).toFixed(0)}% from level 1 to level ${last}`)
    : fail(`ramp only ${(late.aps / early.aps).toFixed(2)}x`);

  // Windup scales with the cycle but respects the floor.
  Math.abs(early.windup - Math.max(cfg.minWindup, baseOf(1) * cfg.windupPct)) < 1
    ? pass(`Level 1 windup ${early.windup.toFixed(0)}ms = ${cfg.windupPct} x cooldown`)
    : fail(`Level 1 windup ${early.windup}`);
  Math.abs(late.windup - Math.max(cfg.minWindup, baseOf(last) * cfg.windupPct)) < 1
    ? pass(`Level ${last} windup ${late.windup.toFixed(0)}ms (floor ${cfg.minWindup}ms respected)`)
    : fail(`Level ${last} windup ${late.windup}`);
  late.windup / late.cd <= cfg.windupPct + 0.02
    ? pass('windup stays a proportional slice of the cycle as speed rises')
    : fail(`windup ratio drifted to ${(late.windup / late.cd).toFixed(2)}`);

  // Run time alone must not speed autos up.
  await setLevel(1);
  const beforeJump = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { clock: g.clock.now, cd: g.attacks.cooldownMs };
  });
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').clock.ms += 120_000; });
  await page.waitForFunction((c) => window.__warmup.scene.getScene('GameScene').clock.now > c + 100, beforeJump.clock + 120_000);
  const afterJump = await atk();
  afterJump.cd === beforeJump.cd
    ? pass(`two extra minutes of run time leave level 1 autos at ${afterJump.cd.toFixed(0)}ms`)
    : fail(`cooldown changed with time: ${beforeJump.cd} -> ${afterJump.cd}`);

  // === 2. Passive stacks multiply the stage base =============================
  section('2. Passive stacks multiply the level base');
  const stacked = await page.evaluate((last) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const p = g.progression;
    const out = [];
    for (const level of [1, last]) {
      p.level = level;
      g.kit.passive.reset();
      const bare = g.attacks.cooldownMs;
      for (let i = 0; i < 5; i++) g.kit.passive.addStack();
      out.push({ level, base: g.attacks.baseCooldownMs, bare, stacked: g.attacks.cooldownMs, mult: g.kit.passive.attackSpeedMultiplier });
    }
    g.kit.passive.reset();
    p.level = 1;
    return out;
  }, last);
  stacked.every((r) => Math.abs(r.stacked - r.base / (1 + 5 * cfg.passive.attackSpeedPerStack)) < 1e-6 && r.stacked < r.bare)
    ? pass(`5 stacks on top of each level base: ${stacked.map((r) => `level ${r.level} ${r.bare.toFixed(0)} -> ${r.stacked.toFixed(0)}ms`).join(', ')}`)
    : fail(`passive over level base: ${JSON.stringify(stacked)}`);

  // === 3. The stage timing is what actually runs =============================
  section('3. The level timing is what actually runs');
  const measureCycle = async (stage) => {
    await calm();
    await setLevel(stage);
    await place([{ x: 800, y: 360 }], 9999);
    await page.waitForTimeout(60);
    await rclick(800, 360);
    return page.evaluate(() => new Promise<any>((res) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        out.push({ t: performance.now() - t0, state: g.attacks.state, m: g.attacks.missilesInFlight, fired: g.metrics.attacksFired });
        if (performance.now() - t0 < 1700) requestAnimationFrame(tick); else res(out);
      };
      tick();
    }));
  };

  const runSpan = (samples) => {
    const fires = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].fired > samples[i - 1].fired) fires.push(samples[i].t);
    }
    const gaps = fires.slice(1).map((t, i) => t - fires[i]);
    return { fires: fires.length, avgGap: gaps.length ? gaps.reduce((a, b) => a + b) / gaps.length : 0 };
  };
  const firstWindup = (samples) => {
    const i = samples.findIndex((s) => s.state === 'windup');
    if (i < 0) return 0;
    let j = i;
    while (j < samples.length && samples[j].state === 'windup') j++;
    return (samples[j]?.t ?? samples[j - 1].t) - samples[i].t;
  };

  const slowRun = await measureCycle(1);
  const fastRun = await measureCycle(last);
  const slow = runSpan(slowRun);
  const fastS = runSpan(fastRun);

  Math.abs(slow.avgGap - baseOf(1)) < 60
    ? pass(`Level 1 autos fire every ${slow.avgGap.toFixed(0)}ms (configured ${baseOf(1)}ms)`)
    : fail(`Level 1 gap ${slow.avgGap.toFixed(0)}ms vs ${baseOf(1)}ms`);
  Math.abs(fastS.avgGap - baseOf(last)) < 60
    ? pass(`Level ${last} autos fire every ${fastS.avgGap.toFixed(0)}ms (configured ${baseOf(last)}ms)`)
    : fail(`Level ${last} gap ${fastS.avgGap.toFixed(0)}ms vs ${baseOf(last)}ms`);
  fastS.fires > slow.fires
    ? pass(`more autos in the same window at level ${last} (${slow.fires} -> ${fastS.fires})`)
    : fail(`auto count did not increase (${slow.fires} vs ${fastS.fires})`);

  const slowWindup = firstWindup(slowRun);
  const fastWindup = firstWindup(fastRun);
  Math.abs(slowWindup - baseOf(1) * cfg.windupPct) < 40
    ? pass(`visual+mechanical windup at level 1: ${slowWindup.toFixed(0)}ms`)
    : fail(`Level 1 windup measured ${slowWindup.toFixed(0)}ms`);
  fastWindup < slowWindup - 20
    ? pass(`windup shortens with level attack speed (${slowWindup.toFixed(0)} -> ${fastWindup.toFixed(0)}ms)`)
    : fail(`windup did not shorten (${slowWindup} -> ${fastWindup})`);

  // === 4. Cancel + orbwalk still work at max attack speed ====================
  section('4. Cancel + orbwalk still work at max attack speed');
  await calm();
  await setLevel(last);
  await place([{ x: 800, y: 360 }], 9999);
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { hp: g.enemies.find((t) => t.__tag === 1).hp, cancelled: g.metrics.attacksCancelled };
  });
  await rclick(800, 360);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 3000 });
  await rclick(300, 200);
  await page.waitForTimeout(250);
  const afterCancel = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { hp: g.enemies.find((t) => t.__tag === 1).hp, cancelled: g.metrics.attacksCancelled, m: g.attacks.missilesInFlight };
  });
  afterCancel.hp === before.hp && afterCancel.cancelled > before.cancelled && afterCancel.m === 0
    ? pass('cancel still works at max attack speed (no damage, no missile)')
    : fail(`cancel at speed: hp ${before.hp}->${afterCancel.hp} cancels ${afterCancel.cancelled} missiles ${afterCancel.m}`);

  // Orbwalk loop at max speed.
  await calm();
  await setLevel(last);
  await place([{ x: 760, y: 360 }], 9999);
  await page.waitForTimeout(60);
  const firedCount = () => page.evaluate(() => window.__warmup.scene.getScene('GameScene').metrics.attacksFired);
  let fires = await firedCount();
  let cycles = 0;
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('a');
    await page.mouse.click(760, 360, { button: 'left' });
    const target = fires + 1;
    let ok = false;
    for (let j = 0; j < 250 && !ok; j++) {
      if ((await firedCount()) >= target) ok = true; else await page.waitForTimeout(8);
    }
    if (ok) { cycles++; fires++; }
    await rclick(520 + i * 15, 360);
    await page.waitForTimeout(120);
  }
  cycles === 4 ? pass('A-click -> release -> kite loop still works at max attack speed')
    : fail(`orbwalk at speed: only ${cycles}/4 cycles`);

  // === 5. Windup/release visual cues =========================================
  await setLevel(1);
  section('5. Windup/release visual cues');
  await calm();
  await setLevel(1);
  await place([{ x: 800, y: 360 }], 9999);
  await page.waitForTimeout(60);
  await rclick(800, 360);
  const vis = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      out.push({
        t: performance.now() - t0,
        state: g.attacks.state,
        prog: g.attacks.windupProgress,
        chargeVisible: g.player.view.chargeRing.visible,
        chargeR: g.player.view.chargeRing.radius,
        releaseVisible: g.player.view.releaseRing.visible,
        releaseR: g.player.view.releaseRing.radius,
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out);
    };
    tick();
  }));
  const windupSamples = vis.filter((s) => s.state === 'windup' && s.chargeVisible);
  const chargeShrinks = windupSamples.length > 3 && windupSamples[0].chargeR > windupSamples[windupSamples.length - 1].chargeR + 5;
  chargeShrinks
    ? pass(`charge ring contracts through the windup (${windupSamples[0].chargeR.toFixed(0)} -> ${windupSamples[windupSamples.length - 1].chargeR.toFixed(0)}px)`)
    : fail(`charge ring did not contract: ${JSON.stringify(windupSamples.slice(0, 2))}`);
  const releaseShown = vis.some((s) => s.releaseVisible && s.state === 'recovery');
  releaseShown ? pass('release ring fires at the commit moment') : fail('no release ring observed');
  const chargeAfter = vis.filter((s) => s.state === 'recovery').every((s) => !s.chargeVisible);
  chargeAfter ? pass('charge ring clears once the auto is committed') : fail('charge ring lingers into recovery');

  // === 6. Pressure / lethality ===============================================
  section('6. Pressure / lethality');
  cfg.stages[0].enemyPips.basic === 1
    ? pass('Stage 1 basic targets die to a single hit (1 pip)')
    : fail(`Stage 1 basic pips ${cfg.stages[0].enemyPips.basic}`);
  cfg.spawn.start >= 2400 && cfg.stages[0].enemyFire === 0
    ? pass(`Stage 1 enemy fire sits at the ramp start: ${cfg.spawn.start}ms interval (calm opening)`)
    : fail(`Stage 1 fire: interval start ${cfg.spawn.start}ms, enemyFire ${cfg.stages[0].enemyFire}`);

  await finish();
});
