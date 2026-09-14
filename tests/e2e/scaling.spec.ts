import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('scaling: attack-speed ramp, measured cycle, cancel + orbwalk at max speed, windup/release cues', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const setElapsed = (s) => page.evaluate((s) => {
    window.__warmup.scene.getScene('GameScene').difficulty.elapsedSeconds = s;
  }, s);
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
      t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
    });
  }, { spots, hp });
  const atk = () => page.evaluate(() => {
    const a = window.__warmup.scene.getScene('GameScene').attacks;
    return { t: a.attackSpeedT, cd: a.cooldownMs, windup: a.windupMs, aps: a.attacksPerSecond, state: a.state };
  });
  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });

  const cfg = await page.evaluate(() => ({
    base: window.__balance.ATTACK.baseCooldownMs,
    min: window.__balance.ATTACK.minCooldownMs,
    ramp: window.__balance.ATTACK.attackSpeedRampSeconds,
    windupPct: window.__balance.ATTACK.windupPercent,
    minWindup: window.__balance.ATTACK.minWindupMs,
    dmg: window.__balance.ATTACK.damage,
    hp: window.__balance.TARGETS.maxHp,
    spawn: window.__balance.ENEMY_PROJECTILES.spawnIntervalMs,
  }));

  // === 1. Attack speed scales with round time ================================
  section('1. Attack speed scales with round time');
  await calm();
  await setElapsed(0);
  const early = await atk();
  await setElapsed(cfg.ramp + 5);
  const late = await atk();
  await setElapsed(cfg.ramp / 2);
  const mid = await atk();

  Math.abs(early.cd - cfg.base) < 1
    ? pass(`start of round: cooldown ${early.cd.toFixed(0)}ms (${early.aps.toFixed(2)}/s)`)
    : fail(`early cooldown ${early.cd} vs base ${cfg.base}`);
  Math.abs(late.cd - cfg.min) < 1
    ? pass(`end of ramp: cooldown ${late.cd.toFixed(0)}ms (${late.aps.toFixed(2)}/s)`)
    : fail(`late cooldown ${late.cd} vs min ${cfg.min}`);
  mid.cd < early.cd && mid.cd > late.cd
    ? pass(`mid-round is between the two (${mid.cd.toFixed(0)}ms, ${mid.aps.toFixed(2)}/s)`)
    : fail(`mid cooldown ${mid.cd} not between ${late.cd} and ${early.cd}`);
  late.aps / early.aps > 1.3
    ? pass(`attack speed ramps ${((late.aps / early.aps - 1) * 100).toFixed(0)}% over the round`)
    : fail(`ramp only ${(late.aps / early.aps).toFixed(2)}x`);

  // Windup scales with the cycle but respects the floor.
  Math.abs(early.windup - Math.max(cfg.minWindup, cfg.base * cfg.windupPct)) < 1
    ? pass(`early windup ${early.windup.toFixed(0)}ms = ${cfg.windupPct} x cooldown`)
    : fail(`early windup ${early.windup}`);
  Math.abs(late.windup - Math.max(cfg.minWindup, cfg.min * cfg.windupPct)) < 1
    ? pass(`late windup ${late.windup.toFixed(0)}ms (floor ${cfg.minWindup}ms respected)`)
    : fail(`late windup ${late.windup}`);
  late.windup / late.cd <= cfg.windupPct + 0.02
    ? pass('windup stays a proportional slice of the cycle as speed ramps')
    : fail(`windup ratio drifted to ${(late.windup / late.cd).toFixed(2)}`);

  // === 2. The scaled timing is what actually runs ============================
  section('2. The scaled timing is what actually runs');
  const measureCycle = async (elapsed) => {
    await calm();
    await setElapsed(elapsed);
    await place([{ x: 800, y: 360 }], 9999);
    await page.waitForTimeout(60);
    await rclick(800, 360);
    // Sample state transitions for ~1.6s, pinning elapsed so it cannot drift.
    return page.evaluate((elapsed) => new Promise<any>((res) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        g.difficulty.elapsedSeconds = elapsed;
        out.push({ t: performance.now() - t0, state: g.attacks.state, m: g.attacks.missilesInFlight, fired: g.metrics.attacksFired });
        if (performance.now() - t0 < 1700) requestAnimationFrame(tick); else res(out);
      };
      tick();
    }), elapsed);
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

  const slowRun = await measureCycle(0);
  const fastRun = await measureCycle(cfg.ramp + 5);
  const slow = runSpan(slowRun);
  const fastS = runSpan(fastRun);

  Math.abs(slow.avgGap - cfg.base) < 60
    ? pass(`early autos fire every ${slow.avgGap.toFixed(0)}ms (configured ${cfg.base}ms)`)
    : fail(`early gap ${slow.avgGap.toFixed(0)}ms vs ${cfg.base}ms`);
  Math.abs(fastS.avgGap - cfg.min) < 60
    ? pass(`late autos fire every ${fastS.avgGap.toFixed(0)}ms (configured ${cfg.min}ms)`)
    : fail(`late gap ${fastS.avgGap.toFixed(0)}ms vs ${cfg.min}ms`);
  fastS.fires > slow.fires
    ? pass(`more autos in the same window when sped up (${slow.fires} -> ${fastS.fires})`)
    : fail(`auto count did not increase (${slow.fires} vs ${fastS.fires})`);

  const slowWindup = firstWindup(slowRun);
  const fastWindup = firstWindup(fastRun);
  Math.abs(slowWindup - cfg.base * cfg.windupPct) < 40
    ? pass(`visual+mechanical windup at base speed: ${slowWindup.toFixed(0)}ms`)
    : fail(`slow windup measured ${slowWindup.toFixed(0)}ms`);
  fastWindup < slowWindup - 20
    ? pass(`windup shortens with attack speed (${slowWindup.toFixed(0)} -> ${fastWindup.toFixed(0)}ms)`)
    : fail(`windup did not shorten (${slowWindup} -> ${fastWindup})`);

  // === 3. Cancel + orbwalk still work at max attack speed ====================
  section('3. Cancel + orbwalk still work at max attack speed');
  await calm();
  await setElapsed(cfg.ramp + 5);
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
  await setElapsed(cfg.ramp + 5);
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
      await setElapsed(cfg.ramp + 5);
      if ((await firedCount()) >= target) ok = true; else await page.waitForTimeout(8);
    }
    if (ok) { cycles++; fires++; }
    await rclick(520 + i * 15, 360);
    await page.waitForTimeout(120);
  }
  cycles === 4 ? pass('A-click -> release -> kite loop still works at max attack speed')
    : fail(`orbwalk at speed: only ${cycles}/4 cycles`);

  // === 4. Windup/release visual cues =========================================
  section('4. Windup/release visual cues');
  await calm();
  await setElapsed(0);
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
        chargeVisible: g.player.chargeRing.visible,
        chargeR: g.player.chargeRing.radius,
        releaseVisible: g.player.releaseRing.visible,
        releaseR: g.player.releaseRing.radius,
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

  // === 5. Pressure / lethality ===============================================
  section('5. Pressure / lethality');
  Math.round(cfg.hp / cfg.dmg) === 2
    ? pass(`targets die in 2 autos (${cfg.hp} hp / ${cfg.dmg} dmg)`)
    : fail(`targets take ${cfg.hp / cfg.dmg} autos`);
  cfg.spawn.start >= 2400
    ? pass(`enemy projectile interval starts at ${cfg.spawn.start}ms (calmer opening)`)
    : fail(`spawn interval ${cfg.spawn.start}ms`);

  await finish();
});
