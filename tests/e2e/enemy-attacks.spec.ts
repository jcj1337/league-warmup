import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('enemy attacks: unlock stages, basic spit + attack tokens, Pursuer dash', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    spit: window.__balance.TARGETS.spit,
    dash: window.__balance.PURSUER.dash,
    pursuer: window.__balance.PURSUER,
    playerRadius: window.__magicBoy.STATS.radius,
  }));

  /**
   * Quiet arena on a given stage: no edge fire, player parked and healthy.
   * Returns that stage's scaled numbers (damage multiplier, attack tokens).
   */
  const calm = (stage = 10, px = 640, py = 360) => page.evaluate(({ stage, px, py }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.director.stageIndex = stage - 1;
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    g.attackTokens.clear();
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.stunnedUntil = 0; g.stunBuffered = null;
    g.player.x = px; g.player.y = py; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.projectiles.clear();
    return g.director.difficulty;
  }, { stage, px, py });
  /** Damage an enemy hit really deals on the current stage. */
  const hitFor = (base, diff) => Math.round(base * diff.damage);

  /**
   * Replace the wave with exactly these active enemies, nothing pending. Basics
   * hold still (no repositioning) and spit as soon as they can; a Pursuer may
   * dash at once but its swing waits.
   */
  const place = (spots) => page.evaluate((spots) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.enemies.forEach((e) => e.destroy());
    d.enemies.length = 0;
    d.pending.length = 0;
    for (const s of spots) {
      const e = d.spawnEnemy(s.type);
      e.x = s.x; e.y = s.y; e.hp = 9999;
      if (s.type === 'basic') {
        e.goalX = s.x; e.goalY = s.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        e.nextSpitAt = s.spitAt ?? 0;
      } else {
        e.nextDashAt = s.dashAt ?? 0;
        e.nextAttackAt = s.swingAt ?? Number.POSITIVE_INFINITY;
      }
      d.enemies.push(e);
    }
    g.enemies = d.enemies;
  }, spots);

  /** Sample every frame for `ms` of GAME time. */
  const watch = (ms) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const frames = [];
    const tick = () => {
      frames.push({
        t: g.clock.now - t0, hp: g.player.hp, px: g.player.x, py: g.player.y,
        globs: g.hostileSpells.globCount, tokens: g.attackTokens.inUse,
        enemies: g.director.enemies.map((e) => ({
          type: e.archetype, x: e.x, y: e.y, dead: e.dead,
          spitting: e.spitting ?? false, aim: e.view.aim?.visible ?? false, windup: e.pose.windup,
          state: e.state ?? null, dashAngle: e.dashAngle ?? null, dashPath: e.view.dashPath?.visible ?? false,
        })),
      });
      if (g.clock.now - t0 >= ms) res(frames); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);

  // === 1. Unlock stages ======================================================
  section('1. Unlock stages');
  const unlocks = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = {};
    for (const s of [1, 2, 3, 4]) {
      d.stageIndex = s - 1;
      const b = d.spawnEnemy('basic');
      const p = d.spawnEnemy('pursuer');
      out[s] = { spit: b.canSpit, dash: p.canDash };
      b.destroy(); p.destroy();
    }
    d.stageIndex = 0;
    return out;
  });
  !unlocks[1].spit && unlocks[2].spit && unlocks[4].spit
    ? pass(`basics spit from Stage ${cfg.spit.fromStage} (Stage 1 stays a pure kiting warm-up)`)
    : fail(`spit unlocks: ${JSON.stringify(unlocks)}`);
  !unlocks[3].dash && unlocks[4].dash
    ? pass(`Pursuers dash from Stage ${cfg.dash.fromStage}`)
    : fail(`dash unlocks: ${JSON.stringify(unlocks)}`);

  // === 2. Basic spit =========================================================
  section('2. Basic spit');
  const d10 = await calm();
  await place([{ type: 'basic', x: 840, y: 360 }]);
  const spit = await watch(cfg.spit.windupMs + 900);
  {
    const winding = spit.filter((f) => f.enemies[0].spitting);
    const fired = spit.find((f) => f.globs > 0);
    winding.length > 0 && winding.every((f) => f.enemies[0].aim && f.enemies[0].windup >= 0)
      ? pass(`winds up for ~${Math.round(winding.at(-1).t - winding[0].t)}ms with the aim tick and glowing-mouth frame`)
      : fail('no visible spit windup');
    winding.every((f) => f.enemies[0].x === 840 && f.enemies[0].y === 360)
      ? pass('rooted while winding up')
      : fail('moved during the windup');
    fired && fired.t >= cfg.spit.windupMs - 40
      ? pass(`the glob leaves at ~${Math.round(fired.t)}ms, not before`)
      : fail(`glob timing: ${fired ? fired.t : 'never'}`);
    spit.at(-1).hp === 100 - hitFor(cfg.spit.damage, d10)
      ? pass(`standing still, the glob hits for ${hitFor(cfg.spit.damage, d10)} (${cfg.spit.damage} × ${d10.damage.toFixed(2)} at Stage 10)`)
      : fail(`hp after spit: ${spit.at(-1).hp}`);
  }
  // It aims where you are when it FIRES, and never re-aims after.
  await calm();
  await place([{ type: 'basic', x: 840, y: 360 }]);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].spitting, null, { timeout: 3000 });
  await page.evaluate(() => { const p = window.__warmup.scene.getScene('GameScene').player; p.y = 300; });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.globCount > 0, null, { timeout: 3000 });
  await page.mouse.click(640, 160, { button: 'right' });
  const dodged = await watch(1000);
  dodged.every((f) => f.hp === 100)
    ? pass('it aims at where you are when it fires; walking off the line dodges it')
    : fail(`glob tracked or hit after a sidestep: hp ${dodged.at(-1).hp}`);
  // Cooldown: the next spit waits a full (jittered) cooldown.
  {
    const { next, cooldown } = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const e = g.director.enemies[0];
      return { next: e.nextSpitAt - g.clock.now, cooldown: e.spitCooldownMs };
    });
    const lo = cooldown * (1 - cfg.spit.cooldownJitter) - 1500;
    const hi = cooldown * (1 + cfg.spit.cooldownJitter);
    cooldown < cfg.spit.cooldownMs && next > lo && next <= hi
      ? pass(`the next spit is ~${Math.round(next)}ms away (Stage 10 cooldown ${Math.round(cooldown)}, down from ${cfg.spit.cooldownMs}, ±${cfg.spit.cooldownJitter * 100}%)`)
      : fail(`next spit in ${Math.round(next)}ms`);
  }

  // === 3. Attack tokens ======================================================
  section('3. Attack tokens');
  const d4 = await calm(4);   // Stage 4: the smallest token pool on a spitting stage
  const tokens = d4.attackTokens;
  await place([
    { type: 'basic', x: 840, y: 360 }, { type: 'basic', x: 440, y: 360 }, { type: 'basic', x: 640, y: 560 },
    { type: 'basic', x: 640, y: 160 }, { type: 'basic', x: 800, y: 220 },
  ]);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 9999; });
  const crowd = await watch(2500);
  {
    const maxAtOnce = Math.max(...crowd.map((f) => f.enemies.filter((e) => e.spitting).length));
    const everyone = crowd[0].enemies.map((_, i) => crowd.some((f) => f.enemies[i].spitting));
    maxAtOnce === tokens
      ? pass(`five ready basics: at most ${maxAtOnce} wind up at once (${tokens} tokens at Stage 4)`)
      : fail(`max simultaneous windups ${maxAtOnce}, tokens ${tokens}`);
    everyone.every(Boolean)
      ? pass('they take turns: every basic gets to spit')
      : fail(`some never spat: ${JSON.stringify(everyone)}`);
  }
  // A basic killed mid-windup gives its token back.
  await calm(4);
  await place([{ type: 'basic', x: 840, y: 360 }, { type: 'basic', x: 440, y: 360 }, { type: 'basic', x: 640, y: 560, spitAt: 1e9 }]);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attackTokens.inUse === 2, null, { timeout: 3000 });
  const reclaimed = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    e.hp = 1; e.takeHit();
    const third = g.director.enemies[2];
    third.nextSpitAt = 0;
    return new Promise<any>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ inUse: g.attackTokens.inUse, third: third.spitting }))));
  });
  reclaimed.third
    ? pass('a basic killed mid-windup frees its token for the next one')
    : fail(`token not reclaimed: ${JSON.stringify(reclaimed)}`);
  // Globs fizzle when the wave is cleared.
  await calm(4);
  await place([{ type: 'basic', x: 1000, y: 360 }]);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.globCount > 0, null, { timeout: 3000 });
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    e.hp = 1; e.takeHit(); g.director.onEnemyKilled(e, g.clock.now);
  });
  const fizzle = await watch(600);
  fizzle.at(-1).globs === 0 && fizzle.every((f) => f.hp === 100)
    ? pass('a glob in flight fizzles when the wave is cleared')
    : fail(`after clear: globs ${fizzle.at(-1).globs}, hp ${fizzle.at(-1).hp}`);
  await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = 0; d.waveIndex = 0; d.spawnWave(); d.arriveAllNow();
  });
  // The pool grows with the stage.
  {
    const pools = await page.evaluate(() => {
      const d = window.__warmup.scene.getScene('GameScene').director;
      const out = [];
      for (let s = 0; s < 10; s++) { d.stageIndex = s; out.push(d.difficulty.attackTokens); }
      d.stageIndex = 0;
      return out;
    });
    pools[0] === 2 && pools.every((n, i) => i === 0 || n >= pools[i - 1]) && pools[9] > pools[0]
      ? pass(`the token pool grows with the stage (${pools.join(' / ')})`)
      : fail(`token pools: ${pools.join(' / ')}`);
  }

  // === 4. Pursuer dash =======================================================
  section('4. Pursuer dash');
  await calm();
  await place([{ type: 'pursuer', x: 880, y: 360 }]);
  const dash = await watch(cfg.dash.windupMs + cfg.dash.durationMs + 300);
  {
    const crouch = dash.filter((f) => f.enemies[0].state === 'dashWindup');
    const lunge = dash.filter((f) => f.enemies[0].state === 'dash');
    crouch.length > 0 && crouch.every((f) => f.enemies[0].dashPath && f.enemies[0].x === 880)
      ? pass(`crouches rooted for ~${Math.round(crouch.at(-1).t - crouch[0].t)}ms with its locked path drawn`)
      : fail('no visible, rooted dash windup');
    const start = crouch.at(-1)?.enemies[0];
    // Where the lunge ended: the first frame back in CHASE after it.
    const end = dash.find((f, i) => i > 0 && dash[i - 1].enemies[0].state === 'dash' && f.enemies[0].state !== 'dash')?.enemies[0] ?? dash.at(-1).enemies[0];
    const moved = start ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
    const span = lunge.length > 1 ? lunge.at(-1).t - lunge[0].t : 0;
    lunge.length > 0 && Math.abs(moved - cfg.dash.distance) < 12 && span <= cfg.dash.durationMs + 40
      ? pass(`then lunges ${Math.round(moved)}px in ~${Math.round(span)}ms`)
      : fail(`lunge: moved ${Math.round(moved)}px over ${Math.round(span)}ms`);
    dash.every((f) => f.hp === 100)
      ? pass('the dash itself deals no damage')
      : fail('the dash dealt damage');
  }
  // The path is locked at the start of the windup.
  await calm();
  await place([{ type: 'pursuer', x: 880, y: 360 }]);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].state === 'dashWindup', null, { timeout: 3000 });
  await page.evaluate(() => { const p = window.__warmup.scene.getScene('GameScene').player; p.y = 200; });
  const locked = await watch(cfg.dash.windupMs + cfg.dash.durationMs + 100);
  {
    const angles = new Set(locked.filter((f) => f.enemies[0].state === 'dashWindup' || f.enemies[0].state === 'dash').map((f) => f.enemies[0].dashAngle.toFixed(4)));
    const end = locked.find((f, i) => i > 0 && locked[i - 1].enemies[0].state === 'dash' && f.enemies[0].state !== 'dash')?.enemies[0] ?? locked.at(-1).enemies[0];
    angles.size === 1 && Math.abs(end.y - 360) < 2
      ? pass('the path stays locked when you move: sidestepping makes it lunge past you')
      : fail(`angles ${[...angles].join(',')}, ended at y ${end.y}`);
  }
  // It stops early once you are in reach, then swings as normal.
  const dSwing = await calm();
  await place([{ type: 'pursuer', x: 780, y: 360, swingAt: 0 }]);
  const close = await watch(cfg.dash.windupMs + cfg.dash.durationMs + cfg.pursuer.windupMs + 200);
  {
    const reach = cfg.pursuer.radius + cfg.playerRadius + cfg.pursuer.attackRange;
    const landed = close.find((f, i) => i > 0 && close[i - 1].enemies[0].state === 'dash' && f.enemies[0].state !== 'dash');
    const d = landed ? Math.hypot(landed.enemies[0].x - 640, landed.enemies[0].y - 360) : -1;
    landed && d <= reach + 1 && d >= reach - 25
      ? pass(`from 140px it stops at swing range (${Math.round(d)}px, reach ${reach}) instead of running through you`)
      : fail(`lunge end distance ${Math.round(d)}`);
    close.some((f) => f.enemies[0].state === 'windup') && close.at(-1).hp === 100 - hitFor(cfg.pursuer.attackDamage, dSwing)
      ? pass(`…and its normal swing follows (${hitFor(cfg.pursuer.attackDamage, dSwing)} at Stage 10 if you stay)`)
      : fail(`after the dash: hp ${close.at(-1).hp}`);
  }
  // Out of band: no dash too far away or already in reach; never at a stunned player.
  await calm();
  await place([{ type: 'pursuer', x: 1000, y: 360 }]);
  const far = await watch(300);
  far.every((f) => f.enemies[0].state === 'chase')
    ? pass(`no dash from ${360}px (band ${cfg.dash.minRange}-${cfg.dash.maxRange})`)
    : fail('dashed from outside its band');
  await calm();
  await place([{ type: 'pursuer', x: 840, y: 360, dashAt: 1e9 }]);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.stunPlayer(600);
    g.director.enemies[0].nextDashAt = 0;   // ready only once the stun is on
  });
  const stunned = await watch(500);
  stunned.every((f) => f.enemies[0].state !== 'dashWindup')
    ? pass('never starts a dash at a stunned player')
    : fail('dashed at a stunned player');
  // Cooldown from the start of the previous dash.
  await calm();
  await place([{ type: 'pursuer', x: 840, y: 360 }]);
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].state === 'dashWindup', null, { timeout: 3000 });
  const { cd, full } = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    return { cd: e.nextDashAt - g.clock.now, full: e.dashCooldownMs };
  });
  full < cfg.dash.cooldownMs && cd > full - 60 && cd <= full + 1
    ? pass(`next dash ${Math.round(full)}ms after this one starts (Stage 10; ${cfg.dash.cooldownMs} at base)`)
    : fail(`dash cooldown remaining ${cd} of ${full}`);

  await finish();
});
