import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('controls: Q quick-cast, T attack-move-click, targeting modes, T orbwalk, T spam vs cooldown', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const setup = (spots, opts: any = {}) => page.evaluate(({ spots, opts }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
    g.player.x = opts.px ?? 640; g.player.y = opts.py ?? 360; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.projectiles.clear();
    if (opts.qReady) g.cooldowns.reduce(999999, ['q']);
    g.enemies.forEach((t, i) => {
      if (i < spots.length) {
        t.x = spots[i].x; t.y = spots[i].y; t.hp = opts.hp ?? 9999; t.ghostHp = t.hp;
        t.active = true; t.__tag = i + 1;
      } else { t.active = false; t.respawnAt = Number.POSITIVE_INFINITY; }
      t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
    });
  }, { spots, opts });

  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t = g.attacks.currentTarget;
    return {
      px: g.player.x, py: g.player.y, moving: g.player.isMoving,
      state: g.attacks.state,
      hasTarget: !!t, targetPos: t ? { x: t.x, y: t.y } : null,
      aMove: g.attacks.hasAttackMoveOrder,
      aPending: g.inputs.attackMovePending,
      qMissiles: g.projectiles.missilesInFlight,
      qFired: g.kit.qFired, qHit: g.kit.qHit,
      qCd: g.cooldowns.remainingMs('q'),
      fired: g.metrics.attacksFired,
    };
  });
  const tagHp = (tag) => page.evaluate((tag) => {
    const g = window.__warmup.scene.getScene('GameScene');
    return g.enemies.find((t) => t.__tag === tag)?.hp ?? null;
  }, tag);
  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const cfg = await page.evaluate(() => ({
    qRange: window.__ezreal.SKILLSHOT_Q.maxRange,
    qSpeed: window.__ezreal.SKILLSHOT_Q.speed,
    qCd: window.__ezreal.SKILLSHOT_Q.cooldownMs,
    atkRange: window.__balance.ATTACK.range,
    targeting: window.__balance.ATTACK.attackMoveTargeting,
    keysT: window.__balance.KEYBINDS.attackMoveClick,
  }));
  section('Q range');
  cfg.qRange / cfg.atkRange >= 1.6 && cfg.qRange / cfg.atkRange <= 1.8
    ? pass(`Q range ${cfg.qRange}px = ${(cfg.qRange / cfg.atkRange).toFixed(2)}x attack range (${cfg.atkRange})`)
    : fail(`Q range ratio ${(cfg.qRange / cfg.atkRange).toFixed(2)}`);

  // === Q: quick-cast ==========================================================
  section('Q: quick-cast');
  await setup([{ x: 1000, y: 360 }], { qReady: true });
  await page.mouse.move(900, 360);           // cursor to the right
  await page.waitForTimeout(60);
  const q0 = await G();
  await page.keyboard.press('q');
  await page.waitForTimeout(40);
  // Q now has a short cast window (SKILLSHOT_Q.castTimeMs) before the bolt
  // leaves — still one keypress, no click.
  await page.waitForTimeout(260);
  const q1 = await G();
  q1.qFired === q0.qFired + 1 && q1.qMissiles > 0
    ? pass('Q fires from one keypress after its short cast — no click needed')
    : fail(`Q did not fire (fired ${q0.qFired}->${q1.qFired}, missiles ${q1.qMissiles})`);
  q1.qCd > 0 ? pass(`Q went on cooldown (${(q1.qCd / 1000).toFixed(1)}s)`) : fail('no Q cooldown');

  // No targeting mode, no indicator objects.
  const noIndicator = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const s = g.projectiles;
    return {
      hasIsTargeting: 'isTargeting' in s,
      hasAimLine: 'aimLine' in s,
      hasRangeRing: 'rangeRing' in s,
    };
  });
  !noIndicator.hasIsTargeting && !noIndicator.hasAimLine && !noIndicator.hasRangeRing
    ? pass('targeting mode, aim line and Q range ring all removed')
    : fail(`leftovers: ${JSON.stringify(noIndicator)}`);

  // Direction: the missile must travel toward where the cursor was.
  const dir = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const m = g.projectiles.missiles[0]?.projectile;
    return m ? { x: m.x, y: m.y, px: g.player.x, py: g.player.y } : null;
  });
  dir && dir.x > dir.px + 5 && Math.abs(dir.y - dir.py) < 30
    ? pass('bolt travels toward the cursor direction')
    : fail(`bolt heading wrong: ${JSON.stringify(dir)}`);

  // Finite range: with no enemy in the way it must die at maxRange.
  await setup([{ x: 200, y: 200 }], { qReady: true });
  await page.mouse.move(1250, 360);
  await page.waitForTimeout(60);
  await page.keyboard.press('q');
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').projectiles.missiles.length > 0,
    null,
    { timeout: 3000 },
  );
  const travel = await page.evaluate((qRange) => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const startX = g.player.x;
    let maxSeen = 0;
    const tick = () => {
      const m = g.projectiles.missiles[0]?.projectile;
      if (m) { maxSeen = Math.max(maxSeen, m.x - startX); requestAnimationFrame(tick); }
      else res({ maxSeen, qRange });
    };
    tick();
  }), cfg.qRange);
  travel.maxSeen <= cfg.qRange + 40 && travel.maxSeen > cfg.qRange - 80
    ? pass(`bolt dies at its max range (travelled ~${Math.round(travel.maxSeen)}px, cap ${cfg.qRange})`)
    : fail(`travelled ${Math.round(travel.maxSeen)}px vs cap ${cfg.qRange}`);

  // Hits the first enemy only — no pierce.
  await setup([{ x: 800, y: 360 }, { x: 900, y: 360 }], { qReady: true, hp: 9999 });
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  await page.keyboard.press('q');
  await page.waitForTimeout(500);
  const hp1 = await tagHp(1);
  const hp2 = await tagHp(2);
  hp1 === 9998 ? pass('Q hit removes exactly 1 pip from the first enemy') : fail(`first enemy pips ${hp1} (expected 9998)`);
  hp2 === 9999 ? pass('bolt did not pierce to the second enemy') : fail(`second enemy hp ${hp2} — pierced`);
  (await G()).qMissiles === 0 ? pass('bolt is consumed on impact') : fail('bolt survived impact');

  // On cooldown, Q does nothing.
  const beforeSpam = await G();
  await page.keyboard.press('q');
  await page.keyboard.press('q');
  await page.waitForTimeout(80);
  const afterSpam = await G();
  afterSpam.qFired === beforeSpam.qFired ? pass('Q on cooldown is a no-op') : fail('Q fired while on cooldown');

  // Casting does not root the player.
  await setup([{ x: 200, y: 200 }], { qReady: true });
  await rclick(900, 600);
  await page.waitForTimeout(100);
  await page.mouse.move(400, 200);
  await page.keyboard.press('q');
  const duringCast = await G();
  // Q roots for its short cast window and, like any cast, drops the current move
  // order. What matters is that control comes straight back afterwards.
  await page.waitForTimeout(320);
  await rclick(300, 200);
  await page.waitForTimeout(120);
  const afterCast = await G();
  afterCast.moving
    ? pass('control returns immediately after the short Q cast (new move order obeyed)')
    : fail('player still locked after the Q cast resolved');
  !duringCast.moving
    ? pass('Q roots the player for its cast window')
    : fail('Q did not root during its cast');

  // === T: attack move click ===================================================
  section('T: attack move click');
  cfg.keysT === 'KeyT' ? pass('T is bound to attack-move-click') : fail(`T binding: ${cfg.keysT}`);

  // T with an enemy already in range -> immediate windup, no click.
  await setup([{ x: 800, y: 360 }]);          // 160px away, inside 260 range
  await page.mouse.move(820, 360);
  await page.waitForTimeout(60);
  const t0 = await G();
  await page.keyboard.press('t');
  await page.waitForTimeout(80);
  const t1 = await G();
  t1.aMove ? pass('T issues an attack-move order') : fail('T did not issue an attack move');
  !t1.aPending ? pass('T creates no targeting mode (no pending state)') : fail('T left a pending mode');
  t1.hasTarget ? pass('T acquired the in-range enemy immediately') : fail('T did not acquire a target');
  (t1.state === 'windup' || t1.fired > t0.fired)
    ? pass(`T began the auto windup with no second click (state ${t1.state})`)
    : fail(`no windup after T (state ${t1.state})`);

  // T uses the same AttackSystem path as A-click: target source is attack-move.
  const source = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').attacks.targetSource);
  source === 'attack-move' ? pass('T flows through the shared attack-move path') : fail(`target source ${source}`);

  // T with nothing in range -> walk to the cursor, engage on arrival.
  await setup([{ x: 1150, y: 360 }], { px: 300, py: 360 });
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  await page.keyboard.press('t');
  await page.waitForTimeout(150);
  const walking = await G();
  walking.moving && !walking.hasTarget
    ? pass('T with nothing in range walks toward the cursor')
    : fail(`T walk: moving=${walking.moving} target=${walking.hasTarget}`);
  await page.waitForTimeout(2600);
  const engaged = await G();
  engaged.hasTarget && (await tagHp(1)) < 9999
    ? pass('player stopped and attacked once the enemy came into range')
    : fail(`never engaged: target=${engaged.hasTarget} hp=${await tagHp(1)}`);

  // Target selection still honours attackMoveTargeting.
  const pick = async (mode, cursor) => {
    await page.evaluate((m) => { window.__balance.ATTACK.attackMoveTargeting = m; }, mode);
    await setup([{ x: 700, y: 300 }, { x: 640, y: 560 }]);
    await page.waitForTimeout(60);
    await page.mouse.move(cursor.x, cursor.y);
    await page.waitForTimeout(40);
    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    return (await G()).targetPos;
  };
  const cursorPick = await pick('cursor', { x: 640, y: 600 });
  cursorPick && Math.abs(cursorPick.y - 560) < 30
    ? pass('T + cursor mode picks the enemy nearest the cursor')
    : fail(`T cursor mode picked ${JSON.stringify(cursorPick)}`);
  const playerPick = await pick('player', { x: 640, y: 600 });
  playerPick && Math.abs(playerPick.y - 300) < 30
    ? pass('T + player mode picks the enemy nearest the player')
    : fail(`T player mode picked ${JSON.stringify(playerPick)}`);
  await page.evaluate(() => { window.__balance.ATTACK.attackMoveTargeting = 'cursor'; });

  // === Orbwalk with T =========================================================
  section('Orbwalk with T');
  await setup([{ x: 760, y: 360 }]);
  await page.mouse.move(760, 360);
  await page.waitForTimeout(60);
  let fires = (await G()).fired;
  let cycles = 0;
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(760, 360);
    await page.keyboard.press('t');
    let ok = false;
    for (let j = 0; j < 250 && !ok; j++) {
      if ((await G()).fired >= fires + 1) ok = true; else await page.waitForTimeout(8);
    }
    if (ok) { cycles++; fires++; }
    await rclick(520 + i * 15, 360);   // kite away during recovery
    await page.waitForTimeout(120);
  }
  cycles === 4 ? pass('T -> auto releases -> right-click away, x4') : fail(`T orbwalk: ${cycles}/4 cycles`);

  // === T spam must not beat the attack cooldown ===============================
  section('T spam must not beat the attack cooldown');
  await setup([{ x: 780, y: 360 }]);
  await page.mouse.move(780, 360);
  await page.waitForTimeout(60);
  // Hammer T far faster than the attack cycle while sampling when autos fire.
  const spamPromise = (async () => {
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('t');
      await page.waitForTimeout(40);
    }
  })();
  const spam = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const start = g.metrics.attacksFired;
    const t0 = performance.now();
    const times = [];
    let last = start;
    const tick = () => {
      if (g.metrics.attacksFired > last) { last = g.metrics.attacksFired; times.push(performance.now() - t0); }
      if (performance.now() - t0 < 2400) requestAnimationFrame(tick);
      else res({ count: last - start, times, cooldown: g.attacks.cooldownMs });
    };
    tick();
  }));
  await spamPromise;
  const gaps = spam.times.slice(1).map((t, i) => t - spam.times[i]);
  const minGap = gaps.length ? Math.min(...gaps) : 0;
  spam.count >= 2
    ? pass(`T spam produced ${spam.count} autos in 2.4s (cooldown ${Math.round(spam.cooldown)}ms)`)
    : fail(`T spam only produced ${spam.count} autos — cannot judge the cooldown`);
  gaps.length > 0 && minGap >= spam.cooldown - 60
    ? pass(`T spam respects the cooldown (min gap ${Math.round(minGap)}ms vs ${Math.round(spam.cooldown)}ms)`)
    : fail(`T spam beat the cooldown: min gap ${Math.round(minGap)}ms vs ${Math.round(spam.cooldown)}ms (${gaps.length} gaps)`);

  // === No tether reintroduced =================================================
  section('No tether reintroduced');
  await rclick(400, 420);
  await page.waitForTimeout(100);
  const tethers = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const px = g.player.x, py = g.player.y;
    return g.children.list.filter((o) => {
      if (o.type !== 'Line' || !o.visible) return false;
      const gm = o.geom;
      const len = Math.hypot(gm.x2 - gm.x1, gm.y2 - gm.y1);
      return len > 40 && Math.hypot(o.x + gm.x1 - px, o.y + gm.y1 - py) < 30;
    }).length;
  });
  tethers === 0 ? pass('no tether line reintroduced') : fail(`${tethers} tether-like lines`);

  await finish();
});
