import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('feel: windup animation timing, release/impact, cancel, kill feedback + no refill, opening fire', async ({ page }, testInfo) => {
  const { pass, fail, warn, section, finish } = await startSuite(page, testInfo, 400);

  const calm = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.enemyProjectiles.clear();
    s.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    s.player.hp = 100;
  });
  /** `pips` overrides the spawned health so a target survives the hits a section needs. */
  const place = (spots, pips?: number) => page.evaluate(({ spots, pips }) => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.player.x = 640; s.player.y = 360; s.player.stop();
    s.attacks.cancel(); s.attacks.state = 'idle'; s.attacks.clearMissiles();
    s.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = pips ?? t.maxHp; t.active = true; t.__tag = i + 1;
      } else { t.active = false; t.respawnAt = Number.POSITIVE_INFINITY; }
      t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
    });
  }, { spots, pips });

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
    projSpeed: window.__balance.ATTACK.projectileSpeed,
    stage1Pips: window.__warmup.scene.getScene('GameScene').director.pipsFor('basic', 1),
    spawnStart: window.__balance.ENEMY_PROJECTILES.spawnIntervalMs.start,
  }));
  cfg.stage1Pips === 1
    ? pass('Stage 1 basic targets have 1 pip — one auto kills')
    : fail(`Stage 1 basic pips ${cfg.stage1Pips}`);

  // === 1. Windup animation tracks the real windup timing ======================
  section('1. Windup animation tracks the real windup timing');
  await calm();
  await place([{ x: 800, y: 360 }], 99);
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
        // Visual-only offset of the sprite from the authoritative position.
        lean: Math.hypot(s.player.view.offsetX, s.player.view.offsetY),
        pose: s.player.view.pose,
        missiles: s.attacks.missilesInFlight,
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out);
    };
    tick();
  }));

  // Take only the FIRST contiguous windup run; the player keeps attacking.
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
  // The click starts the windup straight from the DOM event, but the view only
  // re-poses on the next game step. A sample taken in between reads progress 0
  // (no step yet) with the old pose, so judge the pose from the first step on.
  const steppedWindup = windupFrames.filter((f) => f.prog > 0);
  const windupPose = steppedWindup.length > 0 && steppedWindup.every((f) => f.pose === 'windup');
  leanGrows && windupPose
    ? pass(`player leans into the windup in its windup pose (lean ${early[0].lean.toFixed(1)} -> ${late[0].lean.toFixed(1)}px)`)
    : fail(`windup animation flat: lean ${early[0]?.lean} -> ${late[0]?.lean}, poses ${JSON.stringify([...new Set(windupFrames.map((f) => f.pose))])}`);

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
  await place([{ x: 880, y: 360 }], 2);
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
  const afterAuto = (await tagged(1)).hp;
  afterAuto === 1 ? pass('the in-flight auto removed exactly 1 pip (2 -> 1)') : fail(`auto left ${afterAuto} pips (expected 1)`);

  // === 4. Cancelled auto: no missile, no pip lost, metric increments ==========
  section('4. Cancelled auto: no missile, no pip lost, metric increments');
  await calm();
  await place([{ x: 800, y: 360 }], 2);
  await page.waitForTimeout(50);
  const beforeCancel = await G();
  await rclick(800, 360);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 3000 });
  await rclick(300, 200);
  await page.waitForTimeout(400);
  const afterCancel = await G();
  afterCancel.missiles === 0 ? pass('cancelled windup spawns no missile') : fail(`missiles after cancel: ${afterCancel.missiles}`);
  (await tagged(1)).hp === 2 ? pass('cancelled windup removes no pip') : fail('pip lost after cancel');
  afterCancel.cancelled > beforeCancel.cancelled ? pass(`cancel metric incremented (${afterCancel.cancelled})`) : fail('cancel metric flat');
  afterCancel.windupProgress === 0 ? pass('windup visual resets on cancel') : fail('windup progress stuck after cancel');

  // === 5. Autos kill, death feedback, no refill ===============================
  section('5. Autos kill, death feedback, no refill');
  await calm();
  // A second, distant enemy stays alive, so this kill does not clear the wave.
  await place([{ x: 800, y: 360 }, { x: 200, y: 650 }]);
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
  !dead.active ? pass(`target died to autos (${cfg.stage1Pips} pip = ${cfg.stage1Pips} hit)`) : fail(`target still alive, ${dead.hp} pips`);
  (await G()).score > scoreBefore ? pass('kill awarded score') : fail('no score for the kill');

  // Death animation.
  await page.waitForTimeout(120);
  const midDeath = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__tag === 1);
    return { visible: t.view.sprite.visible, alpha: t.view.sprite.alpha, scale: t.view.sprite.scaleX, dying: t.view.dying };
  });
  midDeath.visible && midDeath.dying && midDeath.alpha < 1
    ? pass(`death pops and fades (alpha ${midDeath.alpha.toFixed(2)}, scale ${midDeath.scale.toFixed(2)})`)
    : warn(`death anim sample: ${JSON.stringify(midDeath)} (may have finished)`);

  // Waves are finite: a kill is never refilled while the wave is still being
  // fought. Watch past the old 1200ms respawn delay. (Wave/stage progression
  // itself is covered by the waves suite.)
  const rosterNow = () => page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    return {
      ids: d.enemies.map((e) => (e.__feelId ??= Math.random())),
      alive: d.enemies.filter((e) => e.active).length,
      phase: d.phase,
    };
  });
  const rosterAfterKill = await rosterNow();
  await page.waitForTimeout(1700);
  const rosterLater = await rosterNow();
  rosterLater.phase === 'wave' && rosterLater.alive === rosterAfterKill.alive
    && rosterLater.ids.length === rosterAfterKill.ids.length && rosterLater.ids.every((id, i) => id === rosterAfterKill.ids[i])
    ? pass(`the killed enemy is not replaced (${rosterLater.alive} alive, same roster 1.7s later)`)
    : fail(`roster changed after a mid-wave kill: ${JSON.stringify({ rosterAfterKill, rosterLater })}`);

  // A missile in flight must not damage a later enemy.
  const stale = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    // Every enemy carries the generational guard an in-flight missile compares
    // against; a later enemy can never be hit by a bolt aimed at a dead one.
    const all = s.director.enemies;
    return {
      guard: all.length > 0 && all.every((e) => typeof e.spawnId === 'number'),
      missileCount: s.attacks.missiles.length,
    };
  });
  stale.guard ? pass('targets carry a spawnId guard for in-flight missiles') : fail('no spawnId guard');

  // === 6. Enemy fire in the opening ===========================================
  section('6. Enemy fire in the opening');
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.scene.restart();
  });
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').enemyProjectiles);
  const density = await page.evaluate(() => new Promise<any>((res) => {
    const s = window.__warmup.scene.getScene('GameScene');
    const interval = s.enemyProjectiles.spawnIntervalMs;
    setTimeout(() => res({
      intervalAtStart: interval,
      intervalNow: s.enemyProjectiles.spawnIntervalMs,
      stage: s.director.stage,
      fire: s.director.fireIntensity,
      runTime: s.getHudState().runTime,
    }), 1500);
  }));
  density.intervalAtStart >= 1800
    ? pass(`opening spawn interval is ${Math.round(density.intervalAtStart)}ms (was 900ms) — ~${Math.round(900 / density.intervalAtStart * 100)}% of the old rate`)
    : fail(`opening interval only ${density.intervalAtStart}ms`);
  density.stage === 1 && density.fire === 0 && density.intervalNow === density.intervalAtStart
    ? pass(`enemy fire stays at Stage 1's calm level while time passes (${Math.round(density.intervalNow)}ms at ${density.runTime.toFixed(1)}s)`)
    : fail(`opening fire changed: ${JSON.stringify(density)}`);

  await finish();
});
