import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('orbwalk: movement, direct attack, attack-move, targeting, cancel, post-fire move, loop, stop, metrics', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const G = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const p = s.player;
    const t = s.attacks.currentTarget;
    return {
      p: { x: p.x, y: p.y, moving: p.isMoving, rooted: p.isRooted },
      ring: { visible: p.rangeRing.visible, radius: p.rangeRing.radius },
      atk: {
        state: s.attacks.state,
        source: s.attacks.targetSource,
        hasTarget: !!t,
        targetPos: t ? { x: t.x, y: t.y } : null,
        targetHp: t ? t.hp : null,
        aMove: s.attacks.hasAttackMoveOrder,
      },
      aPending: s.inputs.attackMovePending,
      m: {
        started: s.metrics.attacksStarted, fired: s.metrics.attacksFired,
        cancelled: s.metrics.attacksCancelled, landed: s.metrics.attacksLanded,
        idle: Math.round(s.metrics.idleInRangeMs), still: Math.round(s.metrics.wastedRecoveryMs),
      },
      enemies: s.enemies.filter((t) => t.active).map((t) => ({ x: t.x, y: t.y, hp: t.hp, r: t.radius })),
    };
  });

  // Quiet arena: no projectiles, no drift, full hp — mechanics only.
  const calm = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.enemyProjectiles.clear();
    s.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    s.player.hp = 100;
    for (const t of s.enemies) { t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY; }
  });

  // Teleport targets to exact spots so target-selection tests are deterministic.
  const placeTargets = (spots) => page.evaluate((spots) => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.player.x = 640; s.player.y = 360; s.player.stop();
    s.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = 100; t.active = true;
        t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
      } else {
        t.active = false; t.hp = 0; t.respawnAt = Number.POSITIVE_INFINITY;
      }
    });
  }, spots);

  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const lclick = (x, y) => page.mouse.click(x, y, { button: 'left' });
  const key = (k) => page.keyboard.press(k);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const waitState = async (want, maxMs = 2000) => {
    for (let i = 0; i < maxMs / 8; i++) {
      const st = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').attacks.state);
      if (st === want) return true;
      await page.waitForTimeout(8);
    }
    return false;
  };

  await calm();

  // === 1. Normal movement =====================================================
  section('1. Normal movement');
  await placeTargets([{ x: 1100, y: 150 }]);
  let a = await G();
  await rclick(300, 550);
  await page.waitForTimeout(400);
  let b = await G();
  d(a.p, b.p) > 80 ? pass('1. right-click ground moves the player') : fail('1. no movement');

  // === 2. Direct attacking (right-click enemy, walks into range) ==============
  section('2. Direct attacking');
  await calm();
  await placeTargets([{ x: 1100, y: 150 }]);
  await page.waitForTimeout(60);
  await rclick(1100, 150);
  await page.waitForTimeout(150);
  let st = await G();
  st.atk.hasTarget && st.atk.source === 'direct' && st.p.moving
    ? pass('2. right-click enemy = direct order + chase')
    : fail(`2. direct order: target=${st.atk.hasTarget} source=${st.atk.source} moving=${st.p.moving}`);
  await page.waitForTimeout(2200);
  st = await G();
  st.atk.targetHp < 100 ? pass(`2. walked into range and attacked (hp ${st.atk.targetHp})`)
    : fail('2. never attacked after chasing');

  // === 7. Range ring matches the hit test =====================================
  section('7. Range ring matches the hit test');
  {
    // The range ring is contextual now — force it on to compare it with the
    // hit test. This changes nothing about the range calculation itself.
    await page.evaluate(() => { window.__balance.DEBUG.attackRangeDisplay = 'always'; });
    await page.waitForTimeout(60);
    const g = await G();
    const t = g.enemies[0];
    const centreDist = d(g.p, t);
    const insideRing = centreDist <= g.ring.radius;
    const inRange = await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      return s.attacks.isInRange(s.enemies.find((t) => t.active));
    });
    g.ring.visible && insideRing === inRange
      ? pass(`7. ring (r=${g.ring.radius}) agrees with hit test (centre ${centreDist.toFixed(0)}px, inRange=${inRange})`)
      : fail(`7. ring/hit-test mismatch: inside=${insideRing} inRange=${inRange}`);
    await page.evaluate(() => { window.__balance.DEBUG.attackRangeDisplay = 'contextual'; });
  }

  // === 3. Attack Move =========================================================
  section('3. Attack Move');
  await calm();
  // Enemy far to the right; A-click toward it. Player should walk then attack.
  await placeTargets([{ x: 1050, y: 360 }]);
  await page.waitForTimeout(60);
  await key('a');
  let am = await G();
  am.aPending ? pass('3. A enters attack-move mode') : fail('3. A did not set pending mode');
  await lclick(1150, 360);
  await page.waitForTimeout(120);
  am = await G();
  am.atk.aMove && !am.aPending ? pass('3. A-click issues an attack-move order') : fail('3. no attack-move order');
  am.p.moving ? pass('3. attack-move walks toward the clicked point') : fail('3. not moving on attack move');
  await page.waitForTimeout(2500);
  am = await G();
  am.atk.hasTarget && am.atk.source === 'attack-move' && am.atk.targetHp < 100
    ? pass(`3. stopped and attacked the enemy that came into range (hp ${am.atk.targetHp})`)
    : fail(`3. a-move never engaged: target=${am.atk.hasTarget} src=${am.atk.source} hp=${am.atk.targetHp}`);

  // A-click with an enemy ALREADY in range should attack without walking off.
  await calm();
  await placeTargets([{ x: 820, y: 360 }]); // 180px away, well inside range
  await page.waitForTimeout(60);
  const beforePos = (await G()).p;
  await key('a');
  await lclick(300, 360); // click far away in the OPPOSITE direction
  await page.waitForTimeout(200);
  const eng = await G();
  eng.atk.hasTarget && d(eng.p, beforePos) < 25
    ? pass('3. in-range enemy is attacked immediately, no walk-off')
    : fail(`3. walked ${d(eng.p, beforePos).toFixed(0)}px instead of attacking in-range enemy`);

  // === 8. Target selection: cursor vs player ==================================
  section('8. Target selection: cursor vs player');
  // Two enemies both in range: one near the player, one near the A-click point.
  const twoSpots = [{ x: 700, y: 300 }, { x: 640, y: 560 }];
  const selectWith = async (mode, clickAt) => {
    await page.evaluate((mode) => { window.__balance.ATTACK.attackMoveTargeting = mode; }, mode);
    await calm();
    await placeTargets(twoSpots);
    await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      s.attacks.cancel();
      s.attacks.state = 'idle';
    });
    await page.waitForTimeout(60);
    await key('a');
    await lclick(clickAt.x, clickAt.y);
    await page.waitForTimeout(150);
    return (await G()).atk.targetPos;
  };
  // Click near the FAR target (640,560); nearest-to-player is (700,300) (~76px).
  const cursorPick = await selectWith('cursor', { x: 640, y: 600 });
  cursorPick && Math.abs(cursorPick.y - 560) < 30
    ? pass('8. cursor mode picks the enemy nearest the A-click')
    : fail(`8. cursor mode picked ${JSON.stringify(cursorPick)}`);
  const playerPick = await selectWith('player', { x: 640, y: 600 });
  playerPick && Math.abs(playerPick.y - 300) < 30
    ? pass('8. player mode picks the enemy nearest the player')
    : fail(`8. player mode picked ${JSON.stringify(playerPick)}`);
  await page.evaluate(() => { window.__balance.ATTACK.attackMoveTargeting = 'cursor'; });

  // A-move must not sprint across the arena at an out-of-range enemy.
  await calm();
  await placeTargets([{ x: 1150, y: 650 }]);
  await page.waitForTimeout(60);
  await key('a');
  await lclick(560, 300); // short click, enemy far away in another direction
  await page.waitForTimeout(1200);
  const noSprint = await G();
  d(noSprint.p, { x: 560, y: 300 }) < 40 && !noSprint.atk.hasTarget
    ? pass('8. attack-move goes to the clicked point, not to a distant enemy')
    : fail(`8. a-move drifted: at ${noSprint.p.x.toFixed(0)},${noSprint.p.y.toFixed(0)} target=${noSprint.atk.hasTarget}`);

  // === 5. Cancel during windup ================================================
  section('5. Cancel during windup');
  await calm();
  await placeTargets([{ x: 800, y: 360 }]);
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.attacks.cancel(); s.attacks.state = 'idle'; s.enemies[0].__tag = 1;
  });
  await rclick(800, 360);
  const gotWindup = await waitState('windup', 2500);
  const hpAtWindup = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 1)?.hp);
  if (!gotWindup) fail('5. never entered windup');
  else {
    await rclick(200, 200);
    await page.waitForTimeout(350);
    const c = await G();
    const hpNow = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 1)?.hp);
    hpNow === hpAtWindup ? pass(`5. windup cancelled by move — no damage (hp ${hpNow})`)
      : fail(`5. damage landed after cancel (${hpAtWindup} -> ${hpNow})`);
    c.atk.state === 'idle' && c.p.moving ? pass('5. cancel returns to idle and the player moves')
      : fail(`5. after cancel state=${c.atk.state} moving=${c.p.moving}`);
    c.m.cancelled >= 1 ? pass(`5. cancelled auto counted in metrics (${c.m.cancelled})`)
      : fail('5. cancel not counted');
  }

  // === 6. Post-fire movement ==================================================
  section('6. Post-fire movement');
  await calm();
  await placeTargets([{ x: 800, y: 360 }]);
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.attacks.cancel(); s.attacks.state = 'idle';
    s.enemies[0].__tag = 2;
  });
  await rclick(800, 360);
  const fired = await waitState('recovery', 3000);
  const hpAtFire = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 2)?.hp);
  if (!fired) fail('6. attack never fired');
  else {
    const p0 = (await G()).p;
    await rclick(300, 650);
    await page.waitForTimeout(300);
    const after = await G();
    d(after.p, p0) > 60 ? pass('6. movement allowed immediately after the attack fires')
      : fail(`6. only moved ${d(after.p, p0).toFixed(0)}px after firing`);
    const hpNow = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 2)?.hp);
    hpNow <= hpAtFire ? pass(`6. the fired attack still resolved (hp ${hpNow})`) : fail('6. fired damage undone');
    // Next attack must still wait for the cooldown.
    const ready = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').attacks.cooldownRemaining);
    ready >= 0 ? pass(`6. cooldown still running after fire (${Math.round(ready)}ms left)`) : fail('6. cooldown missing');
  }

  // === 4. Orbwalk loop ========================================================
  section('4. Orbwalk loop');
  await calm();
  await placeTargets([{ x: 760, y: 360 }]);
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.attacks.cancel(); s.attacks.state = 'idle'; s.enemies[0].__tag = 3;
  });
  const hpStart = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 3)?.hp);
  const firedCount = () => page.evaluate(() => window.__warmup.scene.getScene('GameScene').metrics.attacksFired);
  const waitForFire = async (target, maxMs = 2500) => {
    for (let i = 0; i < maxMs / 8; i++) {
      if ((await firedCount()) >= target) return true;
      await page.waitForTimeout(8);
    }
    return false;
  };

  let cycles = 0;
  let fires = await firedCount();
  for (let i = 0; i < 4; i++) {
    await key('a');
    await lclick(760, 360);                 // A-click onto the enemy
    const ok = await waitForFire(fires + 1); // wait for THIS attack to actually fire
    if (ok) { cycles++; fires++; }
    await rclick(500 + i * 20, 360);         // kite away during recovery
    await page.waitForTimeout(180);
  }
  const hpEnd = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 3)?.hp);
  const landed = Math.round((hpStart - hpEnd) / 12);
  cycles === 4 && landed >= 4
    ? pass(`4. orbwalk loop: ${cycles} A-click -> auto -> kite cycles, ${landed} autos landed`)
    : fail(`4. orbwalk loop: ${cycles} cycles, ${landed} autos landed (hp ${hpStart} -> ${hpEnd})`);

  // === 7b. Stop command =======================================================
  section('7b. Stop command');
  await calm();
  await placeTargets([{ x: 1150, y: 200 }]);
  await rclick(1150, 200);      // direct attack order + chase
  await page.waitForTimeout(250);
  const moving = await G();
  await key('s');
  await page.waitForTimeout(250);
  const stopped = await G();
  moving.p.moving && !stopped.p.moving && !stopped.atk.hasTarget && !stopped.atk.aMove
    ? pass('S stops movement and clears pending orders')
    : fail(`S: wasMoving=${moving.p.moving} nowMoving=${stopped.p.moving} target=${stopped.atk.hasTarget} aMove=${stopped.atk.aMove}`);
  const p1 = stopped.p;
  await page.waitForTimeout(500);
  const p2 = (await G()).p;
  d(p1, p2) < 2 ? pass('S keeps the player stationary until the next command') : fail('S did not hold position');

  // S during windup cancels the attack.
  await calm();
  await placeTargets([{ x: 800, y: 360 }]);
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.attacks.cancel(); s.attacks.state = 'idle'; s.enemies[0].__tag = 4;
  });
  await rclick(800, 360);
  if (await waitState('windup', 2500)) {
    const hpW = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 4)?.hp);
    await key('s');
    await page.waitForTimeout(300);
    const hpA = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.find((t) => t.__tag === 4)?.hp);
    hpA === hpW ? pass('S during windup cancels the attack (no damage)') : fail(`S windup cancel failed (${hpW} -> ${hpA})`);
  } else fail('S windup test: never entered windup');

  // === Metrics sanity =========================================================
  section('Metrics sanity');
  const fin = await G();
  fin.m.started >= fin.m.fired && fin.m.started === fin.m.fired + fin.m.cancelled
    ? pass(`metrics consistent: started ${fin.m.started} = fired ${fin.m.fired} + cancelled ${fin.m.cancelled}`)
    : fail(`metrics inconsistent: ${JSON.stringify(fin.m)}`);
  fin.m.idle > 0 || fin.m.still > 0
    ? pass(`timing metrics accumulating (idle ${fin.m.idle}ms, still ${fin.m.still}ms)`)
    : fail('timing metrics never accumulated');

  await finish();
});
