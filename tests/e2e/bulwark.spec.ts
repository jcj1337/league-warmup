import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('bulwark: capstone roster, walk, Strike + Heavy Strike, Path Maker (unstoppable, winded), All Out, stun breaks a Strike', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    B: window.__balance.BULWARK,
    E: window.__balance.ENEMIES,
    ref: window.__balance.PLAYER.referenceMoveSpeed,
  }));
  const STAGE = cfg.E.bulwark.unlockStage;

  /** Quiet arena on the Bulwark's unlock stage, player parked at (px, py), healthy, free of crowd control. */
  const calm = (px = 640, py = 360) => page.evaluate(({ px, py, stage }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = stage - 1; d.waveIndex = 0; d.currentPhase = 'wave';
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    d.enemies.forEach((e) => e.destroy()); d.enemies.length = 0; d.pending.length = 0;
    g.enemies = d.enemies;
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.stunnedUntil = 0; g.player.slowUntil = 0; g.player.slowFraction = 0;
    g.stunBuffered = null;
    g.player.x = px; g.player.y = py; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.projectiles.clear();
  }, { px, py, stage: STAGE });
  /** A Bulwark at (x, y) with nothing ready; `ready` names what it may start ('strike', 'path'). */
  const place = (x: number, y: number, ready: string[] = [], set: Record<string, number> = {}) => page.evaluate(({ x, y, ready, set }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const b = d.spawnEnemy('bulwark');
    b.x = x; b.y = y;
    b.nextStrikeAt = ready.includes('strike') ? 0 : Number.POSITIVE_INFINITY;
    b.nextPathMakerAt = ready.includes('path') ? 0 : Number.POSITIVE_INFINITY;
    Object.assign(b, set);
    d.enemies.push(b);
    g.enemies = d.enemies;
  }, { x, y, ready, set });
  const watch = (ms: number) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const out = [];
    const tick = () => {
      const b = g.director.enemies.find((e) => e.archetype === 'bulwark');
      out.push({
        t: g.clock.now - t0, hp: g.player.hp, stunned: g.player.isStunned, slowed: g.player.isSlowed,
        state: b?.state, x: b?.x, y: b?.y, pips: b?.hp, heavy: b?.strikeHeavy, allOut: b?.allOut, unstoppable: b?.unstoppable,
        tel: b ? { ...b.view.telegraph } : null,
      });
      if (g.clock.now - t0 >= ms) res(out); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);
  const untilState = (state: string) => page.waitForFunction(
    (s) => window.__warmup.scene.getScene('GameScene').director.enemies.find((e) => e.archetype === 'bulwark')?.state === s,
    state, { timeout: 4000 },
  );
  const hit = (base: number) => page.evaluate((b) => Math.round(b * window.__warmup.scene.getScene('GameScene').director.difficulty.damage), base);
  /** Teleport the player (a sidestep mid-telegraph). */
  const movePlayer = (x: number, y: number) => page.evaluate(({ x, y }) => {
    const p = window.__warmup.scene.getScene('GameScene').player;
    p.x = x; p.y = y; p.stop();
  }, { x, y });

  // === 1. Registry ==========================================================
  section('1. Registry');
  const reg = await page.evaluate((stage) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const waves = (s) => d.describeStage(s - 1).waves;
    return {
      before: waves(stage - 1).map((w) => w.bulwark),
      first: waves(stage).map((w) => w.bulwark),
      pursuersBeside: waves(stage).at(-1).pursuer + waves(stage + 3).at(-1).pursuer,
      others: waves(stage).at(-1).basic + waves(stage).at(-1).magus + waves(stage).at(-1).sovereign,
      late: waves(20).map((w) => w.bulwark),
      pips: [stage, 14, 20, 40].map((s) => d.pipsFor('bulwark', s)),
    };
  }, STAGE);
  reg.before.every((n) => n === 0) && reg.first.join() === '0,0,1'
    ? pass(`a capstone: none before Stage ${STAGE}, then one in each stage's last wave only`)
    : fail(`bulwarks per wave: ${JSON.stringify(reg)}`);
  reg.pursuersBeside === 0 && reg.others > 0
    ? pass(`its wave fields no Pursuers, and ${reg.others} other mobs with what is left of the budget`)
    : fail(`beside it: ${JSON.stringify(reg)}`);
  reg.late.join() === '0,0,2' ? pass('two of them close a stage from about Stage 18') : fail(`Stage 20: ${reg.late}`);
  reg.pips.join() === '14,16,18,18'
    ? pass(`pips: ${reg.pips[0]} at its debut, 16 at Stage 14, 18 from Stage 20`)
    : fail(`pips by stage: ${reg.pips}`);

  // === 2. The body ============================================================
  section('2. The body');
  await calm();
  await place(1000, 360);
  const walk = await watch(1000);
  {
    const speed = ((walk[0].x - walk.at(-1).x) / (walk.at(-1).t - walk[0].t)) * 1000;
    const expected = cfg.ref * cfg.B.moveSpeedFraction * (await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.difficulty.moveSpeed));
    Math.abs(speed - expected) < 6
      ? pass(`it walks straight at you at ${Math.round(speed)}px/s (${cfg.B.moveSpeedFraction}× the reference speed, stage-scaled)`)
      : fail(`walk speed ${speed.toFixed(1)}px/s, expected ${expected.toFixed(1)}`);
    const view = await page.evaluate(() => {
      const b = window.__warmup.scene.getScene('GameScene').director.enemies[0];
      b.takeHit();
      return { radius: b.radius, barWidth: b.view.hpBar.width, pips: b.maxHp };
    });
    view.radius === cfg.B.radius && view.barWidth > 34 && view.pips === 14
      ? pass(`radius ${view.radius}, ${view.pips} pips on a ${view.barWidth}px bar`)
      : fail(`body: ${JSON.stringify(view)}`);
  }

  // === 3. Strike ==============================================================
  section('3. Strike');
  await calm();
  await place(760, 360, ['strike']);
  const strike = await watch(cfg.B.strike.windupMs + 200);
  {
    const winding = strike.filter((f) => f.state === 'strike');
    const dmg = await hit(cfg.B.strike.damage);
    winding.length > 0 && winding.every((f) => f.tel.kind === 'strike' && f.tel.length === cfg.B.strike.length && Math.abs(Math.abs(f.tel.angle) - Math.PI) < 0.01 && f.hp === 100)
      ? pass(`within ${cfg.B.strike.length}px it roots and draws a ${cfg.B.strike.length}px line at you, locked`)
      : fail(`strike windup: ${JSON.stringify(winding[0])}`);
    const windupMs = winding.at(-1).t - winding[0].t;
    Math.abs(windupMs - cfg.B.strike.windupMs) < 60 && strike.at(-1).hp === 100 - dmg && strike.at(-1).slowed && !strike.at(-1).stunned
      ? pass(`it lands after ${cfg.B.strike.windupMs}ms: ${dmg} damage and a slow`)
      : fail(`strike result: ${JSON.stringify({ windupMs, hp: strike.at(-1).hp, slowed: strike.at(-1).slowed })}`);
  }
  // Sidestep during the windup.
  await calm();
  await place(760, 360, ['strike']);
  await untilState('strike');
  await movePlayer(640, 360 + cfg.B.strike.halfWidth + 14 + 6);
  const dodged = await watch(cfg.B.strike.windupMs + 150);
  dodged.at(-1).hp === 100 && !dodged.at(-1).slowed && dodged.some((f) => f.state === 'recover')
    ? pass('step off the line during the windup and it misses: the line never re-aims')
    : fail(`sidestep: ${JSON.stringify({ hp: dodged.at(-1).hp, slowed: dodged.at(-1).slowed })}`);

  // === 4. Heavy Strike ========================================================
  section('4. Heavy Strike');
  await calm();
  await place(640 + cfg.B.heavy.triggerRange - 20, 360, ['strike'], { strikesSinceHeavy: cfg.B.strike.heavyEvery - 1 });
  const heavy = await watch(cfg.B.heavy.windupMs + 200);
  {
    const winding = heavy.filter((f) => f.state === 'strike');
    const dmg = await hit(cfg.B.heavy.damage);
    winding.length > 0 && winding.every((f) => f.heavy && f.tel.kind === 'heavy' && f.tel.length === cfg.B.heavy.length)
      ? pass(`every ${cfg.B.strike.heavyEvery}rd Strike is Heavy: started from ${cfg.B.heavy.triggerRange - 20}px away, a ${cfg.B.heavy.length}px line`)
      : fail(`heavy windup: ${JSON.stringify(winding[0] ?? heavy[0])}`);
    heavy.at(-1).hp === 100 - dmg && heavy.some((f) => f.stunned)
      ? pass(`it lands for ${dmg} and stuns`)
      : fail(`heavy result: ${JSON.stringify({ hp: heavy.at(-1).hp, stunned: heavy.some((f) => f.stunned) })}`);
  }
  // A plain Strike does not reach that far.
  await calm();
  await place(640 + cfg.B.heavy.triggerRange - 20, 360, ['strike']);
  await page.evaluate(() => {
    // Hold it in place: only the trigger range is under test.
    const b = window.__warmup.scene.getScene('GameScene').director.enemies[0];
    b.applySlow('test', 1, window.__warmup.scene.getScene('GameScene').clock.now, 5000);
  });
  (await watch(400)).every((f) => f.state === 'chase')
    ? pass('a plain Strike is not started from there')
    : fail('a plain Strike started beyond its length');

  // === 5. Path Maker ==========================================================
  section('5. Path Maker');
  await calm();
  await place(940, 360, ['path']);
  await untilState('brace');
  const braced = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const b = g.director.enemies[0];
    const before = b.hp;
    const stunTook = b.stun(g.clock.now, 1000);
    b.applySlow('test', 0.9, g.clock.now, 5000);
    b.takeHit();
    return { stunTook, slowFactor: b.slowFactor, lost: before - b.hp, unstoppable: b.unstoppable };
  });
  braced.unstoppable && !braced.stunTook && braced.slowFactor === 1 && braced.lost === 1
    ? pass('braced, it is unstoppable: a stun does not take and a slow does not count, and a hit still removes its pip')
    : fail(`brace: ${JSON.stringify(braced)}`);
  const path = await watch(cfg.B.pathMaker.braceMs + cfg.B.pathMaker.durationMs + cfg.B.pathMaker.windedMs + 300);
  {
    const bracing = path.filter((f) => f.state === 'brace');
    const dmg = await hit(cfg.B.pathMaker.damage);
    bracing.every((f) => f.tel.kind === 'path' && Math.abs(f.x - 940) < 1)
      ? pass('its whole path is drawn while it braces, rooted')
      : fail(`brace telegraph: ${JSON.stringify(bracing[0])}`);
    const caught = path.find((f) => f.stunned);
    caught && caught.hp === 100 - dmg
      ? pass(`the ram catches you standing on the path: ${dmg} damage and a stun`)
      : fail(`ram: ${JSON.stringify({ stunned: !!caught, hp: path.at(-1).hp })}`);
    const winded = path.filter((f) => f.state === 'winded');
    const windedMs = winded.length ? winded.at(-1).t - winded[0].t : 0;
    winded.length > 0 && winded.every((f) => !f.unstoppable && Math.abs(f.x - winded[0].x) < 1) && Math.abs(windedMs - cfg.B.pathMaker.windedMs) < 60
      ? pass(`then it stands winded for ${cfg.B.pathMaker.windedMs}ms, stoppable again`)
      : fail(`winded: ${JSON.stringify({ frames: winded.length, windedMs })}`);
  }
  // Off the path, it runs its full length past you.
  await calm();
  await place(940, 360, ['path']);
  await untilState('brace');
  await movePlayer(640, 520);
  const missed = await watch(cfg.B.pathMaker.braceMs + cfg.B.pathMaker.durationMs + 200);
  {
    const travelled = 940 - missed.at(-1).x;
    missed.at(-1).hp === 100 && !missed.some((f) => f.stunned) && Math.abs(travelled - cfg.B.pathMaker.distance) < 3 && Math.abs(missed.at(-1).y - 360) < 1
      ? pass(`step off the path and it rams ${cfg.B.pathMaker.distance}px straight down it, past you`)
      : fail(`missed ram: ${JSON.stringify({ hp: missed.at(-1).hp, travelled })}`);
  }

  // === 6. All Out ==============================================================
  section('6. All Out');
  await calm();
  await place(1000, 360);
  const allOut = await page.evaluate(() => {
    const b = window.__warmup.scene.getScene('GameScene').director.enemies[0];
    const before = { speed: b.speedFraction, heavyNext: b.heavyNext, at: b.allOutAtPips, max: b.maxHp };
    while (b.hp > b.allOutAtPips + 1) b.takeHit();
    return before;
  });
  const stillArmoured = (await watch(150)).every((f) => !f.allOut);
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].takeHit());
  const flare = await watch(cfg.B.allOut.flareMs + 200);
  {
    const flaring = flare.filter((f) => f.state === 'flare');
    allOut.at === Math.floor(allOut.max * cfg.B.allOut.atPipsFraction) && stillArmoured && flaring.length > 0 && flaring.every((f) => f.unstoppable && f.allOut)
      ? pass(`at ${allOut.at} of ${allOut.max} pips it flares, unstoppable for the flare`)
      : fail(`flare: ${JSON.stringify({ allOut, stillArmoured, flaring: flaring.length })}`);
    const after = await page.evaluate(() => {
      const b = window.__warmup.scene.getScene('GameScene').director.enemies[0];
      b.strikesSinceHeavy = 1;
      return { speed: b.speedFraction, heavyNext: b.heavyNext, unstoppable: b.unstoppable, state: b.state };
    });
    const expected = Math.min(cfg.B.maxSpeedFraction, allOut.speed * cfg.B.allOut.speedMultiplier);
    Math.abs(after.speed - expected) < 1e-6 && after.speed > allOut.speed && after.heavyNext && !after.unstoppable && after.state === 'chase'
      ? pass(`then it is faster (${allOut.speed.toFixed(2)} → ${after.speed.toFixed(2)} of your reference speed) and every ${cfg.B.allOut.heavyEvery}nd Strike is Heavy`)
      : fail(`all out: ${JSON.stringify({ before: allOut, after, expected })}`);
  }

  // === 7. Stuns ================================================================
  section('7. Stuns');
  await calm();
  await place(760, 360, ['strike']);
  await untilState('strike');
  const broke = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const b = g.director.enemies[0];
    return { took: b.stun(g.clock.now, 300), state: b.state };
  });
  const afterStun = await watch(cfg.B.strike.windupMs + 300);
  broke.took && broke.state === 'chase' && afterStun.at(-1).hp === 100 && afterStun.every((f) => f.state !== 'recover')
    ? pass('stunning it mid-windup breaks the Strike: the line never lands')
    : fail(`stun break: ${JSON.stringify({ broke, hp: afterStun.at(-1).hp })}`);
  // Never on a stunned player.
  await calm();
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.stunnedUntil = g.clock.now + 800;
  });
  await place(760, 360, ['strike', 'path']);
  const held = await watch(450);
  held.every((f) => f.state === 'chase')
    ? pass('it starts nothing while you are stunned')
    : fail(`started ${held.find((f) => f.state !== 'chase')?.state} on a stunned player`);

  await finish();
});
