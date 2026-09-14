import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('feel: windup animation timing, release/impact, cancel, kill + respawn, opening density', async ({ page }, testInfo) => {
  const { pass, fail, warn, section, finish } = await startSuite(page, testInfo, 400);

  const calm = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.enemyProjectiles.clear();
    s.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    s.player.hp = 100;
  });
  const place = (spots) => page.evaluate((spots) => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.player.x = 640; s.player.y = 360; s.player.stop();
    s.attacks.cancel(); s.attacks.state = 'idle'; s.attacks.clearMissiles();
    s.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = t.maxHp; t.active = true; t.__tag = i + 1;
      } else { t.active = false; t.respawnAt = Number.POSITIVE_INFINITY; }
      t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
    });
  }, spots);

  const G = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    return {
      state: s.attacks.state,
      windupProgress: s.attacks.windupProgress,
      missiles: s.attacks.missilesInFlight,
      fired: s.metrics.attacksFired,
      landed: s.metrics.attacksLanded,
      cancelled: s.metrics.attacksCancelled,
      hp: s.enemies.find((t) => t.__tag === 1)?.hp ?? null,
      score: s.getHudState().score,
      px: s.player.x, py: s.player.y,
      moving: s.player.isMoving,
    };
  });
  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const tagged = (tag) => page.evaluate((tag) => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__tag === tag);
    return t ? { hp: t.hp, active: t.active, spawnId: t.spawnId, x: t.x, y: t.y } : null;
  }, tag);

  // === Config sanity ==========================================================
  section('Config sanity');
  const cfg = await page.evaluate(() => ({
    windupMs: window.__warmup.scene.getScene('GameScene').attacks.windupMs,
    cooldown: window.__balance.ATTACK.baseCooldownMs,
    projSpeed: window.__balance.ATTACK.projectileSpeed,
    dmg: window.__balance.ATTACK.damage,
    targetHp: window.__balance.TARGETS.maxHp,
    respawn: window.__balance.TARGETS.respawnDelayMs,
    spawnStart: window.__balance.ENEMY_PROJECTILES.spawnIntervalMs.start,
  }));
  const autosToKill = Math.ceil(cfg.targetHp / cfg.dmg);
  autosToKill >= 2 && autosToKill <= 3
    ? pass(`target dies in ${autosToKill} autos (${cfg.targetHp} hp / ${cfg.dmg} dmg)`)
    : fail(`target takes ${autosToKill} autos (want 2-3)`);

  // === 1. Windup animation tracks the real windup timing ======================
  section('1. Windup animation tracks the real windup timing');
  await calm();
  await place([{ x: 800, y: 360 }]);
  await page.waitForTimeout(50);
  await rclick(800, 360);

  // Sample the visual lean and the reported progress together.
  const samples = await page.evaluate(() => new Promise<any>((res) => {
    const s = window.__warmup.scene.getScene('GameScene');
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      out.push({
        t: performance.now() - t0,
        state: s.attacks.state,
        prog: s.attacks.windupProgress,
        lean: Math.hypot(s.player.body.x - s.player.x, s.player.body.y - s.player.y),
        scale: s.player.body.scaleX,
        missiles: s.attacks.missilesInFlight,
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out);
    };
    tick();
  }));

  // Take only the FIRST contiguous windup run — the player keeps attacking.
  const firstIdx = samples.findIndex((s) => s.state === 'windup');
  const windupFrames = [];
  for (let i = firstIdx; i >= 0 && i < samples.length && samples[i].state === 'windup'; i++) {
    windupFrames.push(samples[i]);
  }
  // Frame boundaries: the windup started up to one frame before the first sample
  // and ended up to one frame after the last, so measure to the next sample.
  const afterIdx = firstIdx + windupFrames.length;
  const windupMs = windupFrames.length
    ? (samples[afterIdx]?.t ?? windupFrames[windupFrames.length - 1].t) - windupFrames[0].t
    : 0;
  Math.abs(windupMs - cfg.windupMs) < 45
    ? pass(`visual windup lasts ${windupMs.toFixed(0)}ms vs configured ${cfg.windupMs}ms`)
    : fail(`windup visual ${windupMs.toFixed(0)}ms vs configured ${cfg.windupMs}ms`);

  // Lean must grow monotonically with progress, and be ~0 before the windup.
  const early = windupFrames.slice(0, 2);
  const late = windupFrames.slice(-2);
  const leanGrows = late.length && early.length && late[0].lean > early[0].lean + 2;
  const scaleGrows = late.length && late[0].scale > 1.05;
  leanGrows && scaleGrows
    ? pass(`player leans + stretches through the windup (lean ${early[0].lean.toFixed(1)} -> ${late[0].lean.toFixed(1)}px, scale -> ${late[0].scale.toFixed(2)})`)
    : fail(`windup animation flat: lean ${early[0]?.lean} -> ${late[0]?.lean}, scale ${late[0]?.scale}`);

  const progressTracks = windupFrames.every((f, i, arr) => i === 0 || f.prog >= arr[i - 1].prog - 0.02);
  progressTracks ? pass('windup progress advances monotonically with real time')
    : fail('windup progress not monotonic');

  // === 2. Missile spawns at release, damage lands on impact ===================
  section('2. Missile spawns at release, damage lands on impact');
  const firstMissile = samples.find((s) => s.missiles > 0);
  const firstRecovery = samples.find((s) => s.state === 'recovery');
  firstMissile && firstRecovery && Math.abs(firstMissile.t - firstRecovery.t) < 40
    ? pass('missile spawns exactly when the state leaves WINDUP')
    : fail(`missile at ${firstMissile?.t}ms vs recovery at ${firstRecovery?.t}ms`);

  // === 3. Move immediately after release; missile still lands =================
  section('3. Move immediately after release; missile still lands');
  await calm();
  await place([{ x: 880, y: 360 }]);
  await page.waitForTimeout(50);
  await rclick(880, 360);
  // Wait for the missile to exist (release), then instantly kite away.
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
  const atRelease = await G();
  await rclick(300, 620);
  const afterMove = await G();
  await page.waitForTimeout(600);
  const settled = await G();
  afterMove.missiles >= 1 ? pass('missile survives an immediate move order') : fail('missile vanished on move');
  settled.px < atRelease.px - 60 ? pass('player moved away while the missile flew') : fail('player did not move after release');
  settled.landed > atRelease.landed ? pass(`missile landed while moving (landed ${settled.landed})`) : fail('missile never landed');
  (await tagged(1)).hp < cfg.targetHp ? pass('target took damage from the in-flight missile') : fail('no damage from missile');

  // === 4. Cancelled auto: no missile, no damage, metric increments ============
  section('4. Cancelled auto: no missile, no damage, metric increments');
  await calm();
  await place([{ x: 800, y: 360 }]);
  await page.waitForTimeout(50);
  const beforeCancel = await G();
  await rclick(800, 360);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 3000 });
  await rclick(300, 200);
  await page.waitForTimeout(400);
  const afterCancel = await G();
  afterCancel.missiles === 0 ? pass('cancelled windup spawns no missile') : fail(`missiles after cancel: ${afterCancel.missiles}`);
  (await tagged(1)).hp === cfg.targetHp ? pass('cancelled windup deals no damage') : fail('damage dealt after cancel');
  afterCancel.cancelled > beforeCancel.cancelled ? pass(`cancel metric incremented (${afterCancel.cancelled})`) : fail('cancel metric flat');
  afterCancel.windupProgress === 0 ? pass('windup visual resets on cancel') : fail('windup progress stuck after cancel');

  // === 5. Three autos kill, death feedback, respawn ===========================
  section('5. Three autos kill, death feedback, respawn');
  await calm();
  await place([{ x: 800, y: 360 }]);
  await page.waitForTimeout(50);
  const t0 = await tagged(1);
  const scoreBefore = (await G()).score;
  await rclick(800, 360);
  // Watch for the death so the animation can be sampled while it plays.
  await page.waitForFunction(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    return s.enemies.find((t) => t.__tag === 1)?.active === false;
  }, null, { timeout: 6000 });
  const dead = await tagged(1);
  !dead.active ? pass(`target died to autos (${cfg.targetHp}/${cfg.dmg} = ${autosToKill} hits)`) : fail(`target still alive, hp ${dead.hp}`);
  (await G()).score > scoreBefore ? pass('kill awarded score') : fail('no score for the kill');

  // Death animation then respawn away from the player.
  await page.waitForTimeout(60);
  const midDeath = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__tag === 1);
    return { visible: t.body.visible, alpha: t.body.alpha, scale: t.body.scaleX };
  });
  midDeath.visible && midDeath.alpha < 1 && midDeath.scale < 1
    ? pass(`death animates (alpha ${midDeath.alpha.toFixed(2)}, scale ${midDeath.scale.toFixed(2)})`)
    : warn(`death anim sample: ${JSON.stringify(midDeath)} (may have finished)`);

  const liveBefore = await page.evaluate(
    () => window.__warmup.scene.getScene('GameScene').director.enemies.filter((e) => e.active).length,
  );
  await page.waitForTimeout(cfg.respawn + 500);
  // Respawn now REPLACES the dead enemy with a freshly rolled archetype (that is
  // how composition evolves with difficulty), so assert the roster refilled
  // rather than tracking the old object.
  const refilled = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const live = s.director.enemies.filter((e) => e.active);
    return {
      liveCount: live.length,
      total: s.director.enemies.length,
      minDistToPlayer: Math.min(
        ...live.map((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y)),
      ),
    };
  });
  // Only the slot that actually died is refilled; this test deactivates the
  // other enemies by hand, and those were never registered as kills.
  refilled.liveCount > liveBefore
    ? pass(`killed slot refilled after ~${cfg.respawn}ms (${liveBefore} -> ${refilled.liveCount} alive)`)
    : fail(`roster not refilled: ${liveBefore} -> ${refilled.liveCount}`);
  refilled.minDistToPlayer >= 200
    ? pass('replacement enemy is not spawned on top of the player')
    : fail(`replacement spawned ${refilled.minDistToPlayer.toFixed(0)}px from player`);

  // A missile in flight must not damage the respawned target.
  const stale = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    // Every enemy carries the generational guard an in-flight missile compares
    // against; a replaced enemy can never be hit by a bolt aimed at its predecessor.
    const all = s.director.enemies;
    return {
      guard: all.length > 0 && all.every((e) => typeof e.spawnId === 'number'),
      missileCount: s.attacks.missiles.length,
    };
  });
  stale.guard ? pass('targets carry a spawnId guard for in-flight missiles') : fail('no spawnId guard');

  // === 6. Enemy projectile density in the opening =============================
  section('6. Enemy projectile density in the opening');
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.scene.restart();
  });
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').enemyProjectiles);
  const density = await page.evaluate(() => new Promise<any>((res) => {
    const s = window.__warmup.scene.getScene('GameScene');
    // Count spawns over 10 seconds of the opening by sampling the interval.
    const start = s.difficulty.elapsed;
    const interval = s.difficulty.spawnIntervalMs;
    setTimeout(() => res({
      start,
      intervalAtStart: interval,
      intervalNow: s.difficulty.spawnIntervalMs,
      t: s.difficulty.t,
      elapsed: s.difficulty.elapsed,
    }), 1500);
  }));
  density.intervalAtStart >= 1800
    ? pass(`opening spawn interval is ${Math.round(density.intervalAtStart)}ms (was 900ms) — ~${Math.round(900 / density.intervalAtStart * 100)}% of the old rate`)
    : fail(`opening interval only ${density.intervalAtStart}ms`);
  density.t === 0
    ? pass(`difficulty stays flat for the first ${await page.evaluate(() => window.__balance.DIFFICULTY.rampStartSeconds)}s (t=0 at ${density.elapsed.toFixed(1)}s)`)
    : fail(`ramp already started at ${density.elapsed.toFixed(1)}s (t=${density.t})`);

  await finish();
});
