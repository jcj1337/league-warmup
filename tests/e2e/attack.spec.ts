import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('attack: ground move, direct attack + chase, windup/recovery, cancel, post-fire move', async ({ page }, testInfo) => {
  const { pass, fail, warn, section, finish } = await startSuite(page, testInfo, 500);

  // Keep the mechanical test isolated: no incoming projectiles, no target drift.
  const sterilize = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.enemyProjectiles.clear();
    s.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    s.player.hp = 100;
    for (const t of s.enemies) {
      t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
      // Deep pool: targets now die in 3 autos, and this suite needs a live
      // dummy across many attack cycles.
      if (t.active) t.hp = 999;
    }
  });

  const state = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const chat = window.__warmup.scene.getScene('UIScene').chat;
    const p = s.player;
    const t = s.attacks.currentTarget;
    return {
      player: { x: p.x, y: p.y, rooted: p.isRooted, moving: p.isMoving },
      ring: { visible: p.view.rangeRing.visible, radius: p.view.rangeRing.radius },
      attack: {
        state: s.attacks.state,
        windupMs: s.attacks.windupMs,
        hasTarget: !!t,
        targetHp: t ? t.hp : null,
        markerVisible: s.attacks.targetMarker.visible,
      },
      // Clicks on the chat panel never reach the game, so spawns under it are not clickable.
      enemies: s.enemies.filter((t) => t.active).map((t) => ({ x: t.x, y: t.y, hp: t.hp, r: t.radius, underChat: chat.contains(t.x, t.y, 30) })),
      range: 260,
    };
  });
  const clickable = (list) => {
    const ok = list.filter((t) => !t.underChat);
    return ok.length ? ok : list;
  };

  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  await sterilize();

  // --- 1. right-click ground moves --------------------------------------------
  section('1. right-click ground moves');
  let s0 = await state();
  await rclick(320, 380);
  await page.waitForTimeout(400);
  let s1 = await state();
  dist(s0.player, s1.player) > 40 ? pass('right-click ground issues a move order')
    : fail('ground move did not happen');
  await page.waitForTimeout(1200);

  // --- 8. range ring visible ---------------------------------------------------
  section('8. range ring visible');
  // Contextual ring: force it visible so its geometry can be checked.
  await page.evaluate(() => { window.__balance.DEBUG.attackRangeDisplay = 'always'; });
  await page.waitForTimeout(60);
  const ring = (await state()).ring;
  // The ring is drawn at the full reach (range + target radius), i.e. the locus
  // of attackable target CENTERS — see attackReach() in balance.ts.
  const expectedRing = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    return window.__balance.attackReach(window.__balance.TARGETS.radius, s.player.radius);
  });
  ring.visible && Math.abs(ring.radius - expectedRing) < 0.01
    ? pass(`attack range ring visible at exactly attackReach (${ring.radius}px)`)
    : fail(`range ring visible=${ring.visible} radius=${ring.radius} expected=${expectedRing}`);
  await page.evaluate(() => { window.__balance.DEBUG.attackRangeDisplay = 'contextual'; });

  // --- 2/3. right-click a far target: walk toward it, stop at range ------------
  section('2/3. right-click a far target: walk toward it, stop at range');
  await sterilize();
  // Park one target at a fixed far spot so the chase has a known length (about
  // 470px from where section 1 left the player), instead of depending on where
  // the random spawns landed. The live enemy nearest the spot is the one moved,
  // so no other enemy can be sitting on top of it.
  const farSpot = { x: 1000, y: 200 };
  await page.evaluate((spot) => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.filter((t) => t.active)
      .reduce((a, b) => (Math.hypot(b.x - spot.x, b.y - spot.y) < Math.hypot(a.x - spot.x, a.y - spot.y) ? b : a));
    t.x = spot.x; t.y = spot.y; t.goalX = spot.x; t.goalY = spot.y;
  }, farSpot);
  let s = await state();
  const far = s.enemies.reduce((a, b) => (dist(b, farSpot) < dist(a, farSpot) ? b : a));
  const startDist = dist(far, s.player);
  startDist > 260 + far.r
    ? pass(`chosen target is out of range to start (${startDist.toFixed(0)}px)`)
    : warn(`target already in range (${startDist.toFixed(0)}px) — chase not exercised`);

  await page.evaluate((pos) => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.active && Math.hypot(t.x - pos.x, t.y - pos.y) < 5);
    if (t) t.__chased = 1;
  }, { x: far.x, y: far.y });
  await rclick(far.x, far.y);
  await page.waitForTimeout(250);
  const chasing = await state();
  chasing.player.moving ? pass('right-click on an out-of-range enemy starts a chase')
    : fail('player did not move toward the target');
  chasing.attack.hasTarget && chasing.attack.markerVisible
    ? pass('attack target is set and marked')
    : fail('no attack target / marker after right-clicking an enemy');

  // Let the chase resolve: wait until the chased target takes its first auto —
  // proof the player arrived, stopped and attacked — instead of a fixed 2.5s
  // sleep sized against the chase length. Bounded; on timeout fall through so
  // the checks below report what happened.
  await page.waitForFunction(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__chased === 1);
    return !!t && t.hp < 999;
  }, null, { timeout: 8000 }).catch(() => {});
  const arrived = await state();
  const chased = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__chased === 1);
    return t ? { x: t.x, y: t.y, r: t.radius, active: t.active } : null;
  });
  const liveTarget = chased ?? arrived.enemies.reduce((a, b) => (dist(b, arrived.player) < dist(a, arrived.player) ? b : a));
  const stopDist = dist(liveTarget, arrived.player);
  const reach = await page.evaluate((r) => window.__balance.attackReach(r, window.__warmup.scene.getScene('GameScene').player.radius), liveTarget.r);
  stopDist <= reach + 2
    ? pass(`stopped inside attack range (${stopDist.toFixed(0)}px <= reach ${reach}px)`)
    : fail(`still out of range after chase: ${stopDist.toFixed(0)}px`);
  stopDist > reach - 60
    ? pass('stopped at the edge of range instead of walking onto the target')
    : fail(`walked too far in: ${stopDist.toFixed(0)}px (expected ~${reach})`);

  // --- 4/5. attacks, and keeps attacking without a new command -----------------
  section('4/5. attacks, and keeps attacking without a new command');
  const hpAfterArrival = arrived.attack.targetHp;
  // 999 is the deep pool set by sterilize(); any drop means autos landed.
  hpAfterArrival !== null && hpAfterArrival < 999
    ? pass(`attacked automatically on arrival (target hp ${hpAfterArrival})`)
    : fail(`no automatic attack on arrival (hp ${hpAfterArrival})`);

  await sterilize();
  const before = (await state()).attack.targetHp;
  await page.waitForTimeout(1900);
  const afterRepeat = await state();
  // One auto = one pip.
  const hits = before - (afterRepeat.attack.targetHp ?? 0);
  hits >= 2
    ? pass(`keeps attacking with no new command (${hits} more autos in 1.9s)`)
    : fail(`only ${hits} autos in 1.9s (hp ${before} -> ${afterRepeat.attack.targetHp})`);

  // --- separated cycle: windup roots, recovery does not ------------------------
  section('separated cycle: windup roots, recovery does not');
  await sterilize();
  let sawWindup = false, sawRecovery = false, rootedInWindup = false, rootedInRecovery = false;
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      return { state: s.attacks.state, rooted: s.player.isRooted };
    });
    if (st.state === 'windup') { sawWindup = true; rootedInWindup = st.rooted; }
    if (st.state === 'recovery') { sawRecovery = true; if (st.rooted) rootedInRecovery = true; }
    await page.waitForTimeout(20);
  }
  sawWindup && sawRecovery ? pass('cycle exposes distinct windup and recovery states')
    : fail(`states seen: windup=${sawWindup} recovery=${sawRecovery}`);
  rootedInWindup ? pass('windup roots the player') : fail('windup did not root');
  !rootedInRecovery ? pass('recovery leaves the player free to move (orbwalk window)')
    : fail('player still rooted during recovery');

  // --- 6. cancel during windup -------------------------------------------------
  section('6. cancel during windup');
  await sterilize();
  // Re-acquire a live target (the previous one may have died) and tag it.
  {
    const st = await state();
    const near = clickable(st.enemies).reduce((a, b) => (dist(b, st.player) < dist(a, st.player) ? b : a));
    await rclick(near.x, near.y);
    await page.waitForTimeout(1800); // let the chase + first autos settle
    await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      const t = s.attacks.currentTarget;
      if (t) t.__tag = 1;
    });
  }
  await sterilize();

  const tagHp = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const t = s.enemies.find((t) => t.__tag === 1);
    return t ? t.hp : null;
  });

  // Catch a windup at its START, checking every frame inside the page, so the
  // whole (short) windup is still ahead when the cancel click is sent. Polling
  // from the test side could first land late in a windup already in progress
  // and race the commit.
  let hpAtWindup = null;
  const caught = await page.waitForFunction(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    if (s.attacks.state !== 'windup' || s.attacks.windupProgress > 0.25) return null;
    return { hp: s.enemies.find((t) => t.__tag === 1)?.hp ?? null };
  }, null, { polling: 'raf', timeout: 3000 }).then((h) => h.jsonValue()).catch(() => null);
  if (caught) hpAtWindup = caught.hp;
  if (hpAtWindup === null) {
    fail('never caught a windup to cancel');
  } else {
    // Record the attack state at the instant the click reaches the page. A
    // window capture-phase listener runs before Phaser's canvas mousedown
    // handler, which applies the move order synchronously — so this shows
    // whether the cancel really arrived during the windup or after the commit.
    await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      window.addEventListener('pointerdown', () => {
        (window as any).__attackStateAtClick = s.attacks.state;
      }, { capture: true, once: true });
    });
    await rclick(80, 80); // empty corner
    const stateAtClick = await page.evaluate(() => (window as any).__attackStateAtClick);
    stateAtClick === 'windup'
      ? pass('cancel click reached the game while the swing was still in windup')
      : fail(`cancel click reached the game in state "${stateAtClick}", after the commit — the cancel below was not exercised`);
    await page.waitForTimeout(400);
    const cancelled = await state();
    const hpNow = await tagHp();
    hpNow === hpAtWindup
      ? pass(`windup cancelled by a move order — no pip lost (still ${hpNow})`)
      : fail(`target lost pips after cancel (${hpAtWindup} -> ${hpNow})`);
    cancelled.attack.state === 'idle' ? pass('cancel returns the state to idle')
      : fail('state after cancel: ' + cancelled.attack.state);
    !cancelled.attack.hasTarget ? pass('move order clears the attack target')
      : fail('attack target survived a move order');
    cancelled.player.moving || dist(cancelled.player, { x: 80, y: 80 }) < 40
      ? pass('player moves on the cancelling command')
      : fail('player did not move after cancelling');
  }

  // --- 7. move immediately after the attack fires ------------------------------
  section('7. move immediately after the attack fires');
  await sterilize();
  let hpAtFire = null;
  let target0 = null;
  {
    const s = await state();
    target0 = clickable(s.enemies).reduce((a, b) => (dist(b, s.player) < dist(a, s.player) ? b : a));
    await rclick(target0.x, target0.y);
  }
  // Wait for the transition into recovery (attack has fired).
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => {
      const s = window.__warmup.scene.getScene('GameScene');
      return { state: s.attacks.state, hp: s.attacks.currentTarget?.hp ?? null };
    });
    if (st.state === 'recovery') { hpAtFire = st.hp; break; }
    await page.waitForTimeout(10);
  }
  if (hpAtFire === null) {
    fail('never reached recovery to test post-fire movement');
  } else {
    const p0 = (await state()).player;
    await rclick(1150, 620);
    await page.waitForTimeout(350);
    const p1 = await state();
    dist(p0, p1.player) > 60 ? pass('can move immediately after the attack fires')
      : fail(`did not move after firing (${dist(p0, p1.player).toFixed(0)}px)`);
    const hpsNow = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').enemies.map((t) => t.hp));
    hpsNow.some((h) => h <= hpAtFire)
      ? pass('the fired attack\'s hit persisted through the move order')
      : fail('fired hit was undone');
  }

  await finish();
});
