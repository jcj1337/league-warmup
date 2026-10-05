import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('axeman: picked from the profile, Q axes on autos, where the axe lands, catching + W reset, misses, W rush, E shove, R out and back', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400, { champion: 'axeman' });

  const cfg = await page.evaluate(() => ({
    Q: window.__axeMan.Q, W: window.__axeMan.W, E: window.__axeMan.E, R: window.__axeMan.R,
    LEVELS: window.__axeMan.LEVELS, STATS: window.__axeMan.STATS, AUTO: window.__axeMan.AUTO,
  }));
  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    return {
      champion: hud.champion as string,
      now: g.clock.now as number,
      base: g.attacks.baseCooldownMs as number,
      cycle: g.attacks.cooldownMs as number,
      attackState: g.attacks.state as string,
      lastCancelAt: g.attacks.lastCancelAt as number,
      cd: { q: g.cooldowns.remainingMs('q'), w: g.cooldowns.remainingMs('w'), e: g.cooldowns.remainingMs('e'), r: g.cooldowns.remainingMs('r') },
      held: g.kit.held as number,
      shown: g.kit.heldView.shown as number,
      drops: g.kit.drops.map((d) => ({ x: d.x, y: d.y, state: d.state, landsAt: d.landsAt })),
      whirls: g.kit.whirls.length as number,
      stats: g.kit.stats() as Record<string, number>,
      rows: g.kit.statRows().length as number,
      gems: { stacks: hud.passiveStacks as number, max: hud.passiveMaxStacks as number },
      enemies: g.director.enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, active: e.active, slow: e.slowFactor })),
      player: { x: g.player.x, y: g.player.y, speed: g.player.moveSpeed },
      slots: window.__warmup.scene.getScene('UIScene').abilityBar.slots.map((s) => s.keyText.text),
      names: window.__warmup.scene.getScene('UIScene').championRow.container.list.filter((o) => typeof o.text === 'string').map((o) => o.text),
    };
  });
  /** A quiet arena: parked Pursuers with `hp` pips at the given spots, him at (640, 360), every ability ready, hands empty. */
  const stage = (spots: Array<{ x: number; y: number; hp?: number }>) => page.evaluate((spots) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear(); g.kit.clear(); g.projectiles.clear();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    for (const e of d.enemies) e.active = false;
    d.enemies.length = 0;
    d.currentPhase = 'wave';
    for (const s of spots) {
      const e = d.spawnEnemy('pursuer');
      e.x = s.x; e.y = s.y; e.hp = s.hp ?? 3; e.maxHp = e.hp;
      e.nextAttackAt = Number.POSITIVE_INFINITY; e.canDash = false; e.speedFraction = 0;   // parked: no chase
      d.enemies.push(e);
    }
    g.enemies = d.enemies;
    g.player.x = 640; g.player.y = 360; g.player.stop(); g.player.hp = 100;
    g.cast.cancel(); g.cooldowns.reset();
  }, spots);
  const attack = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.attacks.commandAttack(g.director.enemies[0]);
  });
  /** Wait for the thrown axe to bounce (a drop exists) and, in that same frame, issue a move order `dx` px to the side. */
  const dropThenWalk = (dx: number | null) => page.waitForFunction((dx) => {
    const g = window.__warmup.scene.getScene('GameScene');
    if (g.kit.drops.length === 0) return false;
    g.attacks.onStop();
    const origin = { x: g.player.x, y: g.player.y };
    if (dx !== null) g.player.moveTo(g.player.x + dx, g.player.y);
    return origin;
  }, dx, { timeout: 4000 }).then((h) => h.jsonValue() as Promise<{ x: number; y: number }>);
  const settle = (ms: number) => page.waitForTimeout(ms);

  // === 1. Who =================================================================
  section('1. Champion');
  {
    const s = await G();
    s.champion === 'axeman' && s.slots.join('') === 'QWERF' && Math.abs(s.base - cfg.LEVELS.baseAttackCooldownMs) < 1
      ? pass(`playing Axe Man: Q W E R + F on the bar, ${s.base}ms auto cycle at level 1`)
      : fail(`champion: ${JSON.stringify({ champion: s.champion, slots: s.slots, base: s.base })}`);
    s.names.includes('AXE MAN') && s.names.length === 3
      ? pass(`the start screen offers three champions: ${s.names.join(', ')}`)
      : fail(`champion row: ${JSON.stringify(s.names)}`);
    s.gems.max === cfg.Q.maxHeld && s.gems.stacks === 0 && s.rows === 0
      ? pass(`the gems over the bar are his hands: ${s.gems.max} of them, empty; nothing of his on the end screen`)
      : fail(`gems: ${JSON.stringify(s.gems)}, rows ${s.rows}`);
  }

  // === 2. Q: an axe for the next auto ==========================================
  section('2. Q');
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.mouse.move(900, 200);
  await page.keyboard.press('KeyQ');
  await settle(60);
  {
    const s = await G();
    s.held === 1 && s.shown === 1 && s.cd.q > cfg.Q.cooldownMs - 400 && s.gems.stacks === 1
      ? pass(`Q is instant: one spinning axe in hand, drawn at his side, Q on its ${cfg.Q.cooldownMs}ms cooldown`)
      : fail(`after Q: ${JSON.stringify({ held: s.held, shown: s.shown, cd: s.cd.q, gems: s.gems })}`);
  }
  await attack();
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
  {
    const m = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      return { key: g.attacks.missiles[0].view.textureKey as string, held: g.kit.held as number };
    });
    m.key === 'proj_spin_axe' && m.held === 0
      ? pass('the next auto throws it: the missile is the spinning axe, and his hand is empty')
      : fail(`thrown: ${JSON.stringify(m)}`);
  }
  const origin = await dropThenWalk(null);
  {
    const s = await G();
    const d = s.drops[0];
    const off = Math.hypot(d.x - origin.x, d.y - origin.y);
    s.enemies[0].hp === 9 - 1 - cfg.Q.bonusPips && s.stats.axesThrown === 1
      ? pass(`it hits for ${1 + cfg.Q.bonusPips} pips (9 -> ${s.enemies[0].hp})`)
      : fail(`axe hit: hp ${s.enemies[0].hp}, stats ${JSON.stringify(s.stats)}`);
    s.drops.length === 1 && d.state === 'air' && off <= cfg.Q.dropIdlePx + 1
      ? pass(`and bounces up: standing still, it will land ${Math.round(off)}px from him (within ${cfg.Q.dropIdlePx})`)
      : fail(`idle drop: ${JSON.stringify({ drops: s.drops, origin })}`);
  }
  // He is under it when it lands: caught. W, on cooldown, is ready again.
  await page.keyboard.press('KeyW');
  await settle(40);
  const wBefore = (await G()).cd.w;
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length === 0, null, { timeout: 4000 });
  {
    const s = await G();
    s.held === 1 && s.stats.axesCaught === 1 && s.stats.axesMissed === 0
      ? pass('standing in the circle as it lands catches it: the axe is back in his hand')
      : fail(`catch: ${JSON.stringify({ held: s.held, stats: s.stats })}`);
    wBefore > cfg.W.cooldownMs - 2000 && s.cd.w === 0
      ? pass(`catching resets W (${Math.round(wBefore)}ms left -> ready)`)
      : fail(`W reset: ${wBefore} -> ${s.cd.w}`);
  }

  // === 3. Where it lands ========================================================
  section('3. Where the axe lands');
  for (const [dx, label] of [[-400, 'a long click left'], [60, 'a short click right']] as Array<[number, string]>) {
    await stage([{ x: 800, y: 360, hp: 9 }]);
    await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 1; k.holdUntil = Number.POSITIVE_INFINITY; });
    await attack();
    const from = await dropThenWalk(dx);
    await settle(cfg.Q.steerMs + 80);
    const s = await G();
    const d = s.drops[0];
    const want = Math.sign(dx) * Math.min(Math.abs(dx), cfg.Q.dropMaxPx);
    d && Math.abs(d.x - from.x - want) <= 2 && Math.abs(d.y - from.y) <= 2
      ? pass(`${label} (${dx}px): it comes down ${Math.round(d.x - from.x)}px that way${Math.abs(dx) > cfg.Q.dropMaxPx ? `, the furthest it goes (${cfg.Q.dropMaxPx})` : ', as far as the click'}`)
      : fail(`${label}: drop ${JSON.stringify(d)} from ${JSON.stringify(from)}, wanted dx ${want}`);
  }
  // A click that comes after the steer window doesn't move it.
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 1; k.holdUntil = Number.POSITIVE_INFINITY; });
  await attack();
  {
    await dropThenWalk(null);
    await settle(cfg.Q.steerMs + 80);
    const before = (await G()).drops[0];
    await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.moveTo(g.player.x, g.player.y + 300); });
    await settle(150);
    const after = (await G()).drops[0];
    before && after && before.x === after.x && before.y === after.y
      ? pass(`after ${cfg.Q.steerMs}ms the spot is fixed: a later click no longer moves it`)
      : fail(`late click: ${JSON.stringify({ before, after })}`);
    // He walked away from it: it lands, lies there a moment, and is gone.
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length === 0, null, { timeout: 4000 });
    const s = await G();
    s.held === 0 && s.stats.axesMissed === 1 && s.stats.axesCaught === 1
      ? pass('not under it when it lands: the axe is lost (one caught, one missed so far)')
      : fail(`miss: ${JSON.stringify({ held: s.held, stats: s.stats })}`);
  }

  // === 4. Holding ================================================================
  section('4. Holding axes');
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 2; k.holdUntil = Number.POSITIVE_INFINITY; });
  await page.keyboard.press('KeyQ');
  await settle(60);
  {
    const s = await G();
    s.held === cfg.Q.maxHeld && s.cd.q === 0 && s.shown === 2
      ? pass(`he holds ${cfg.Q.maxHeld} at most, one at each side: with both hands full Q does nothing and isn't spent`)
      : fail(`full hands: ${JSON.stringify({ held: s.held, cd: s.cd.q, shown: s.shown })}`);
  }
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.kit.holdUntil = g.clock.now + 80; });
  await settle(200);
  {
    const s = await G();
    s.held === 0 && s.shown === 0
      ? pass(`axes not thrown or caught within ${cfg.Q.holdMs}ms are dropped`)
      : fail(`hold expiry: held ${s.held}, shown ${s.shown}`);
  }
  // Q and W interrupt nothing: pressed mid-windup, the swing carries on, and it is the axe that leaves.
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await attack();
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 3000 });
  {
    const before = await G();
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyW');
    const during = await G();
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
    const key = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').attacks.missiles[0].view.textureKey);
    during.lastCancelAt === before.lastCancelAt && during.cd.q > 0 && during.cd.w > 0 && key === 'proj_spin_axe'
      ? pass('Q and W pressed mid-windup cancel nothing: the swing lands as an axe')
      : fail(`mid-windup: ${JSON.stringify({ before: before.lastCancelAt, during: during.lastCancelAt, cd: during.cd, key })}`);
  }

  // === 5. W ======================================================================
  section('5. W');
  await stage([{ x: 1100, y: 600, hp: 9 }]);
  {
    const rest = await G();
    await page.keyboard.press('KeyW');
    await settle(50);
    const rush = await G();
    rush.player.speed > rest.player.speed * (1 + cfg.W.moveBonus * 0.85) && Math.abs(rush.cycle - rest.cycle / (1 + cfg.W.attackSpeedBonus)) < 2
      ? pass(`W: move speed ${Math.round(rest.player.speed)} -> ${Math.round(rush.player.speed)}, auto cycle ${Math.round(rest.cycle)} -> ${Math.round(rush.cycle)}ms`)
      : fail(`rush: ${JSON.stringify({ rest: [rest.player.speed, rest.cycle], rush: [rush.player.speed, rush.cycle] })}`);
    await settle(cfg.W.moveMs + 80);
    const mid = await G();
    Math.abs(mid.player.speed - rest.player.speed) < 0.5 && mid.cycle < rest.cycle - 50
      ? pass(`the speed is gone after ${cfg.W.moveMs}ms; the attack speed holds on`)
      : fail(`decay: speed ${mid.player.speed}, cycle ${mid.cycle}`);
    await settle(cfg.W.attackMs - cfg.W.moveMs);
    const end = await G();
    Math.abs(end.cycle - rest.cycle) < 1
      ? pass(`and the attack speed after ${cfg.W.attackMs}ms`)
      : fail(`attack speed still up: ${end.cycle} vs ${rest.cycle}`);
  }

  // === 6. E ======================================================================
  section('6. E');
  // Two in the line to his right, one just above it and one just below: both hit, slowed, shoved off it.
  await stage([{ x: 800, y: 340, hp: 5 }, { x: 900, y: 385, hp: 5 }, { x: 800, y: 560, hp: 5 }]);
  await page.mouse.move(1000, 360);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.eHits >= 2, null, { timeout: 4000 });
  {
    const s = await G();
    const [a, b, far] = s.enemies;
    a.hp === 4 && b.hp === 4 && far.hp === 5 && s.stats.eHits === 2
      ? pass('E passes through the line: a pip from each enemy in it, none from the one out of it')
      : fail(`E pips: ${JSON.stringify(s.enemies.map((e) => e.hp))}`);
    Math.abs(a.slow - (1 - cfg.E.slowFraction)) < 0.01 && Math.abs(b.slow - (1 - cfg.E.slowFraction)) < 0.01 && far.slow === 1
      ? pass(`and slows them ${cfg.E.slowFraction * 100}%`)
      : fail(`E slow: ${JSON.stringify(s.enemies.map((e) => e.slow))}`);
    Math.abs(a.y - (340 - cfg.E.knockPx)) < 3 && Math.abs(b.y - (385 + cfg.E.knockPx)) < 3 && Math.abs(a.x - 800) < 3 && far.y === 560
      ? pass(`and shoves each ${cfg.E.knockPx}px off the line, to the side it was on (y 340 -> ${Math.round(a.y)}, 385 -> ${Math.round(b.y)})`)
      : fail(`E shove: ${JSON.stringify(s.enemies.map((e) => [e.x, e.y]))}`);
  }

  // === 7. R ======================================================================
  section('7. R');
  await stage([{ x: 900, y: 360, hp: 5 }]);
  await page.mouse.move(1100, 360);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.rHits >= 1, null, { timeout: 4000 });
  {
    const out = await G();
    out.enemies[0].hp === 5 - cfg.R.pips && out.whirls === 1
      ? pass(`R crosses the arena through everything: ${cfg.R.pips} pip on the way out`)
      : fail(`R out: hp ${out.enemies[0].hp}, whirls ${out.whirls}`);
    // He walks off the line; the axes still come home to him, and hit again on the way.
    await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.moveTo(g.player.x - 60, g.player.y); });
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.whirls.length === 0, null, { timeout: 6000 });
    const back = await G();
    back.enemies[0].hp === 5 - cfg.R.pips - cfg.R.returnPips && back.stats.rHits === 2
      ? pass(`it turns at the edge and flies back to him, wherever he went: ${cfg.R.returnPips} pip again on the way home`)
      : fail(`R back: hp ${back.enemies[0].hp}, stats ${JSON.stringify(back.stats)}`);
  }

  await finish();
});
