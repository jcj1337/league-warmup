import { test } from '@playwright/test';
import { startSuite } from './support/harness';

// Unlike the other suites, smoke plays the real, unsterilized run: live enemy
// fire, random spawns and drift, run completion, restart and death.
test('smoke: movement, attack, Q, enemy fire, context menu, run end + restart, death', async ({ page }, testInfo) => {
  const { pass, fail, warn, section, finish } = await startSuite(page, testInfo, 600, { arriveAll: false });

  const state = () => page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const chat = window.__warmup.scene.getScene('UIScene').chat;
    return {
      hud: s.getHudState(),
      player: { x: s.player.x, y: s.player.y, rooted: s.player.isRooted },
      // Clicks on the chat panel never reach the game, so spawns under it are not clickable.
      enemies: s.enemies.filter((t) => t.active).map((t) => ({ x: t.x, y: t.y, hp: t.hp, underChat: chat.contains(t.x, t.y, 80) })),
      enemyShots: s.enemyProjectiles.activeCount,
      qFired: s.skillshot.shotsFired,
      qHit: s.skillshot.shotsHit,
      result: s.getRoundResult(),
      attackState: s.attacks.state,
    };
  });

  const rclick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const lclick = (x, y) => page.mouse.click(x, y, { button: 'left' });

  // --- 1. right-click movement -------------------------------------------------
  section('1. right-click movement');
  let a = await state();
  await rclick(300, 220);
  await page.waitForTimeout(500);
  let b = await state();
  const moved = Math.hypot(b.player.x - a.player.x, b.player.y - a.player.y);
  moved > 80 ? pass(`movement (${moved.toFixed(0)}px in 0.5s)`) : fail(`movement only ${moved.toFixed(0)}px`);

  // destination override mid-move
  await rclick(1000, 600);
  await page.waitForTimeout(200);
  await rclick(200, 380);
  await page.waitForTimeout(900);
  const c = await state();
  c.player.x < 400 ? pass('re-issued move order overrides destination') : fail('destination override, x=' + c.player.x.toFixed(0));

  // stops at destination
  await page.waitForTimeout(1200);
  const d1 = await state();
  await page.waitForTimeout(400);
  const d2 = await state();
  Math.hypot(d2.player.x - d1.player.x, d2.player.y - d1.player.y) < 2
    ? pass('player stops at destination')
    : fail('player never stops');

  // --- 2. basic attack ---------------------------------------------------------
  section('2. basic attack');
  let s = await state();
  if (!s.enemies.length) fail('no active targets');
  const tgt = s.enemies.find((t) => !t.underChat) ?? s.enemies[0];
  const beforeScore = s.hud.score;
  // Walk toward the target, then click it.
  await rclick(tgt.x - 60, tgt.y);
  await page.waitForTimeout(1600);
  s = await state();
  const clickable = s.enemies.filter((t) => !t.underChat);
  const near = (clickable.length ? clickable : s.enemies).reduce((best, t) =>
    Math.hypot(t.x - s.player.x, t.y - s.player.y) < Math.hypot(best.x - s.player.x, best.y - s.player.y) ? t : best);
  await lclick(near.x, near.y);
  let sawWindup = false;
  for (let i = 0; i < 12 && !sawWindup; i++) {
    const m = await state();
    sawWindup = m.player.rooted || m.attackState === 'windup';
    if (!sawWindup) await page.waitForTimeout(25);
  }
  sawWindup ? pass('attack windup roots the player') : fail('windup never observed');
  await page.waitForTimeout(900);
  const after = await state();
  after.hud.score > beforeScore ? pass(`basic attack landed (score ${beforeScore} -> ${after.hud.score})`) : fail('basic attack did not land');
  !after.player.rooted ? pass('player free to move after windup') : fail('player still rooted after windup');

  // --- 3. Q skillshot (quick-cast) --------------------------------------------
  section('3. Q skillshot (quick-cast)');
  // Deterministic geometry for the hit check. The run is live, so the nearest
  // enemy may be drifting, beyond Q range, or about to die to the autos from
  // section 2 before the bolt arrives. Drop the attack order, put the player at
  // a fixed spot, and park that enemy — frozen, with a deep HP pool — 200px
  // ahead, well inside Q range.
  const qt = await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    const live = s.enemies.filter((t) => t.active);
    if (!live.length) return null;
    const p = s.player;
    const t = live.reduce((best, e) =>
      Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best);
    s.attacks.cancel();
    p.x = 640; p.y = 360; p.stop();
    t.x = 840; t.y = 360; t.hp = 9999;
    t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
    return { x: t.x, y: t.y };
  });
  if (!qt) fail('no live enemy to aim Q at');
  // Aim by moving the cursor, then press Q — no targeting mode, no click.
  await page.mouse.move(qt?.x ?? 840, qt?.y ?? 360);
  await page.waitForTimeout(60);
  await page.keyboard.press('q');
  // Wait for the bolt to resolve (hit, or expired at max range) instead of a
  // fixed sleep. Bounded; on timeout fall through so the checks below report it.
  await page.waitForFunction(() => {
    const sk = window.__warmup.scene.getScene('GameScene').skillshot;
    return sk.shotsFired >= 1 && sk.missilesInFlight === 0;
  }, null, { timeout: 3000 }).catch(() => {});
  const fired = await state();
  fired.qFired === 1 ? pass('Q quick-casts one bolt on keypress') : fail('qFired=' + fired.qFired);
  fired.hud.abilityCooldowns.q.remaining > 0 ? pass(`Q on cooldown (${(fired.hud.abilityCooldowns.q.remaining / 1000).toFixed(1)}s)`) : fail('Q cooldown not applied');
  // The setup above makes the hit deterministic, so a miss is a real failure.
  fired.qHit >= 1
    ? pass('Q hit the target it was aimed at')
    : fail(`Q missed the enemy parked at (${qt?.x},${qt?.y}): qFired=${fired.qFired} qHit=${fired.qHit} player=(${fired.player.x.toFixed(0)},${fired.player.y.toFixed(0)})`);
  // Q on cooldown should not fire again.
  await page.keyboard.press('q');
  await page.waitForTimeout(150);
  const recast = await state();
  recast.qFired === 1 ? pass('Q blocked while on cooldown') : fail('Q fired during cooldown');

  // --- 4. enemy projectiles ----------------------------------------------------
  section('4. enemy projectiles');
  // Edge fire is occasional now (one shot every few seconds): wait for a shot to
  // actually be in the air instead of sampling at a fixed moment.
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').enemyProjectiles.activeCount > 0,
    null,
    { timeout: 8000 },
  ).catch(() => {});
  const proj = await state();
  proj.enemyShots > 0 ? pass(`enemy projectiles spawning (${proj.enemyShots} in flight)`) : fail('no enemy projectiles');

  // Stand still and confirm we eventually take damage from them.
  await page.waitForTimeout(6000);
  const hurt = await state();
  hurt.hud.hp < 100 ? pass(`enemy projectiles damage the player (hp ${hurt.hud.hp.toFixed(0)})`) : warn('player took no damage while idle');
  // Progression only moves on kills: this late in the run, without clearing the
  // wave, it is still Stage 1 Wave 1.
  hurt.hud.stage === 1 && hurt.hud.wave === 1
    ? pass(`still Stage 1 Wave 1 after ${hurt.hud.runTime.toFixed(0)}s — time alone does not advance the run`)
    : fail(`run advanced to stage ${hurt.hud.stage} wave ${hurt.hud.wave} without the wave being cleared`);

  // --- 5. context menu suppressed ---------------------------------------------
  section('5. context menu suppressed');
  const ctxPrevented = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    cv.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ctxPrevented ? pass('right-click context menu suppressed on canvas') : fail('contextmenu not prevented');

  // --- 6. run end + restart ----------------------------------------------------
  section('6. run end + restart');
  // End the run the way it ends for real: jump to the final wave and clear it
  // through the scene's hit funnel.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = d.stageCount - 1;
    d.waveIndex = d.stageDefinition.waves.length - 1;
    d.spawnWave();
    d.arriveAllNow();
    for (const e of d.enemies) {
      while (e.active) g.onTargetHit(e, e.takeHit());
    }
  });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null, null, { timeout: 3000 }).catch(() => {});
  const over = await state();
  over.result && over.result.outcome === 'completed'
    ? pass(`run ends on clearing the final wave (score ${over.result.score}, kills ${over.result.targetsKilled}, hits taken ${over.result.projectileHitsTaken}, Q ${over.result.qHit}/${over.result.qFired})`)
    : fail(`run did not end as completed: ${JSON.stringify(over.result)}`);
  const overlayVisible = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').overlay.visible);
  overlayVisible ? pass('end screen shown') : fail('end screen not shown');

  await page.keyboard.press('r');
  await page.waitForTimeout(700);
  const fresh = await state();
  fresh.result === null && fresh.hud.hp === 100 && fresh.hud.score < over.result.score && fresh.hud.stage === 1 && fresh.hud.wave === 1
    ? pass('restart resets the run to Stage 1 Wave 1')
    : fail(`restart state: hp=${fresh.hud.hp} score=${fresh.hud.score} stage=${fresh.hud.stage} wave=${fresh.hud.wave} result=${JSON.stringify(fresh.result)}`);
  const overlayHidden = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').overlay.visible);
  !overlayHidden ? pass('end screen hidden after restart') : fail('end screen still visible after restart');

  // Movement still works after restart (input rewiring check). Spawns are
  // random, so click empty ground: a right-click that lands on an enemy is an
  // attack order, not a move, and would stop short at attack range.
  const p0 = await state();
  const moveTarget = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const candidates = [{ x: 900, y: 200 }, { x: 460, y: 440 }, { x: 900, y: 560 }, { x: 380, y: 160 }];
    const isEmpty = (c) => g.director.enemies.every((e) => !e.active || Math.hypot(e.x - c.x, e.y - c.y) > e.radius + 60);
    return candidates.find(isEmpty) ?? candidates[0];
  });
  await rclick(moveTarget.x, moveTarget.y);
  await page.waitForTimeout(500);
  const p1 = await state();
  const movedAfterRestart = Math.hypot(p1.player.x - p0.player.x, p1.player.y - p0.player.y);
  movedAfterRestart > 80
    ? pass('input still works after restart')
    : fail(`movement broken after restart: moved ${movedAfterRestart.toFixed(0)}px toward (${moveTarget.x},${moveTarget.y}), player at (${p1.player.x.toFixed(0)},${p1.player.y.toFixed(0)}), attack state ${p1.attackState}`);

  // --- 7. death path -----------------------------------------------------------
  section('7. death path');
  await page.evaluate(() => {
    const s = window.__warmup.scene.getScene('GameScene');
    s.player.hp = 1;
    s.player.lastHitAt = -Infinity;
  });
  await page.waitForTimeout(8000);
  const dead = await state();
  dead.result && dead.result.outcome === 'defeated' ? pass('death ends the run as defeated')
    : warn('player survived at 1hp for 8s (hp=' + dead.hud.hp.toFixed(0) + ')');

  await finish();
});
