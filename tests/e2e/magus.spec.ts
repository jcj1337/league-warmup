import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('magus: roster + pips, spacing, Lance / Eye / Orb / Rite, stun rules, zones outlive caster, wave-clear fizzle, pause', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    magus: window.__balance.MAGUS,
    // The first ten stages as played: hand-written ones, then generated ones.
    stages: Array.from({ length: 10 }, (_, s) => window.__warmup.scene.getScene('GameScene').director.describeStage(s)),
    playerSpeed: window.__balance.PLAYER.moveSpeed,
  }));
  // Most checks below need exact aim: switch the random spread off, and back on in 4c.
  const spread = { ...cfg.magus.aimSpreadPx };
  const setSpread = (s) => page.evaluate((s) => { Object.assign(window.__balance.MAGUS.aimSpreadPx, s); }, s);
  await setSpread({ spell: 0, orb: 0 });

  /** Quiet arena: no edge fire, player parked at (px, py), healthy, free of crowd control. */
  const calm = (px = 640, py = 360, hp = 100) => page.evaluate(({ px, py, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    g.player.hp = hp; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.stunnedUntil = 0; g.player.slowUntil = 0; g.player.slowFraction = 0;
    g.stunBuffered = null;
    g.player.x = px; g.player.y = py; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.skillshot.clear();
    g.cast.cancel(); g.cooldowns.reset();
  }, { px, py, hp });

  /**
   * Replace the wave with exactly these (already active) enemies. A Magus is
   * held quiet (no spell until `cast` says which) and its Rite is spent unless
   * `rite` is set; other enemies are frozen in place.
   */
  const place = (spots) => page.evaluate((spots) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.enemies.forEach((e) => e.destroy());
    d.enemies.length = 0;
    d.pending.length = 0;
    for (const s of spots) {
      const e = d.spawnEnemy(s.type);
      e.x = s.x; e.y = s.y;
      if (s.hp) e.hp = s.hp;
      if (s.type === 'magus') {
        e.riteUsed = !s.rite;
        e.nextCastAt = Number.POSITIVE_INFINITY;
        e.nextPlanAt = Number.POSITIVE_INFINITY;
        e.goalX = s.x; e.goalY = s.y;
      } else {
        e.goalX = s.x; e.goalY = s.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        e.nextAttackAt = Number.POSITIVE_INFINITY;
      }
      d.enemies.push(e);
    }
    g.enemies = d.enemies;
  }, spots);

  /** Let the Magus cast now, with only these spells ready (the others stay on cooldown). */
  const castNow = (...spells) => page.evaluate((spells) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const m = g.director.enemies.find((e) => e.archetype === 'magus');
    for (const id of ['lance', 'eye', 'orb']) m.readyAt[id] = spells.includes(id) ? 0 : Number.POSITIVE_INFINITY;
    m.nextCastAt = 0;
  }, spells);

  /** Sample every frame for `ms` of GAME time. */
  const watch = (ms) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const frames = [];
    const tick = () => {
      const m = g.director.enemies.find((e) => e.archetype === 'magus');
      frames.push({
        t: g.clock.now - t0, hp: g.player.hp, px: g.player.x, py: g.player.y,
        stunned: g.player.isStunned, stunLeft: g.player.stunnedUntil - g.clock.now, slowed: g.player.isSlowed, speed: g.player.moveSpeed,
        zones: g.hostileSpells.zones.map((z) => ({ kind: z.kind, x: z.x, y: z.y, centre: !!z.centre })),
        orbs: g.hostileSpells.orbCount, resolved: g.hostileSpells.zonesResolved,
        magus: m ? { state: m.state, x: m.x, y: m.y, dead: m.dead, charge: m.view.charge.visible, runes: m.view.runes.every((r) => r.visible) } : null,
        enemies: g.director.enemies.map((e) => ({ type: e.archetype, state: e.state ?? null, windup: e.pose.windup })),
        attack: g.attacks.state, casting: g.cast.isCasting,
      });
      if (g.clock.now - t0 >= ms) res(frames); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);
  const now = () => page.evaluate(() => window.__warmup.scene.getScene('GameScene').clock.now);

  // === 1. Roster and pips ====================================================
  section('1. Roster and pips');
  const firstStage = cfg.stages.findIndex((s) => s.waves.some((w) => (w.magus ?? 0) > 0)) + 1;
  firstStage === 5
    ? pass('the Magus first appears in Stage 5')
    : fail(`first Magus stage: ${firstStage}`);
  cfg.stages.every((s) => s.waves.every((w) => (w.magus ?? 0) <= 1))
    ? pass('at most one Magus per wave')
    : fail('a wave fields more than one Magus');
  cfg.stages.every((s) => s.enemyPips.magus === s.enemyPips.basic)
    ? pass(`Magus pips match the basic enemy's on every stage (${cfg.stages.map((s) => s.enemyPips.magus).join('/')})`)
    : fail(`magus pips: ${cfg.stages.map((s) => `${s.enemyPips.magus} vs ${s.enemyPips.basic}`).join(', ')}`);
  const spawned = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = 10;
    const m = d.spawnEnemy('magus');
    const out = { type: m.archetype, hp: m.hp, maxHp: m.maxHp, r: m.radius };
    m.destroy();
    d.stageIndex = 0;
    return out;
  });
  spawned.type === 'magus' && spawned.maxHp === 2 && spawned.hp === 2 && spawned.r === cfg.magus.radius
    ? pass(`a Stage 11 Magus spawns with 2 pips, radius ${spawned.r}`)
    : fail(`spawned: ${JSON.stringify(spawned)}`);

  // === 2. Spacing ============================================================
  section('2. Spacing');
  await calm();
  await place([{ type: 'magus', x: 840, y: 360 }]);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.enemies[0].nextPlanAt = 0; });
  const backOff = await watch(1500);
  {
    const d0 = Math.hypot(backOff[0].magus.x - 640, backOff[0].magus.y - 360);
    const d1 = Math.hypot(backOff.at(-1).magus.x - 640, backOff.at(-1).magus.y - 360);
    d1 > d0 + 120 && d1 >= cfg.magus.spacing.min - 10
      ? pass(`dived at ${Math.round(d0)}px, it backs off to ${Math.round(d1)}px`)
      : fail(`back-off: ${Math.round(d0)} -> ${Math.round(d1)}`);
    const maxStep = Math.max(...backOff.slice(1).map((f, i) => Math.hypot(f.magus.x - backOff[i].magus.x, f.magus.y - backOff[i].magus.y) / Math.max(1, f.t - backOff[i].t) * 1000));
    maxStep <= cfg.playerSpeed * cfg.magus.moveSpeedFraction * 1.15
      ? pass(`it retreats at most ~${Math.round(maxStep)}px/s — slower than you (${cfg.playerSpeed})`)
      : fail(`retreat speed ${Math.round(maxStep)}px/s`);
  }
  await place([{ type: 'magus', x: 1200, y: 600 }]);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.enemies[0].nextPlanAt = 0; });
  const walkIn = await watch(1500);
  {
    const d1 = Math.hypot(walkIn.at(-1).magus.x - 640, walkIn.at(-1).magus.y - 360);
    d1 <= cfg.magus.spacing.max + 10
      ? pass(`from far away it walks in to ${Math.round(d1)}px (band ${cfg.magus.spacing.min}-${cfg.magus.spacing.max})`)
      : fail(`walk-in ended at ${Math.round(d1)}px`);
  }
  walkIn[0].magus.runes ? pass('rune tablets orbit the Magus') : fail('rune tablets not drawn');

  // === 3. Lance ==============================================================
  section('3. Lance');
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('lance');
  const lance = await watch(cfg.magus.lance.chargeMs + cfg.magus.lance.lockMs + 250);
  {
    const charging = lance.filter((f) => f.magus.state === 'lance');
    const locked = lance.find((f) => f.zones.some((z) => z.kind === 'line'));
    charging.length > 0 && charging.every((f) => f.magus.charge)
      ? pass(`charges for ~${Math.round(charging.at(-1).t - charging[0].t)}ms with the tracking line drawn`)
      : fail('no visible Lance charge');
    charging.every((f) => f.zones.length === 0) && locked && locked.t >= cfg.magus.lance.chargeMs - 40
      ? pass(`the line locks at ~${Math.round(locked.t)}ms, not before`)
      : fail(`lock timing: ${locked ? locked.t : 'never'}`);
    const moved = lance.some((f) => f.magus.state !== 'reposition' && (f.magus.x !== lance[0].magus.x || f.magus.y !== lance[0].magus.y));
    !moved ? pass('rooted while charging and locked') : fail('the Magus moved mid-cast');
    lance.at(-1).hp === 100 - cfg.magus.lance.damage
      ? pass(`standing in the line costs ${cfg.magus.lance.damage}`)
      : fail(`hp after Lance: ${lance.at(-1).hp}`);
  }
  // Dodge: wait for the lock, then sidestep with a real right-click.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('lance');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 4000 });
  await page.mouse.click(640, 470, { button: 'right' });
  const dodge = await watch(cfg.magus.lance.lockMs + 200);
  dodge.at(-1).resolved > dodge[0].resolved && dodge.at(-1).hp === 100
    ? pass('sidestepping after the lock dodges it')
    : fail(`dodge: hp ${dodge.at(-1).hp}, resolved ${dodge[0].resolved}->${dodge.at(-1).resolved}`);

  // === 4. Eye ================================================================
  section('4. Eye');
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('eye');
  // Targeting first (castMs, a reticle tracking you), then the circle's delay.
  const eye = await watch(cfg.magus.eye.castMs + cfg.magus.eye.delayMs + 150);
  {
    const placed = eye.find((f) => f.zones.some((z) => z.kind === 'circle'));
    const z = placed?.zones[0];
    z && Math.abs(z.x - 640) < 2 && Math.abs(z.y - 360) < 2 && z.centre
      ? pass('the Eye goes down centred on you, with a sweet spot')
      : fail(`eye zone: ${JSON.stringify(z)}`);
    const last = eye.at(-1);
    last.hp === 100 - cfg.magus.eye.centreDamage && last.slowed && Math.abs(last.speed - cfg.playerSpeed * (1 - cfg.magus.eye.slowFraction)) < 0.5
      ? pass(`dead centre: ${cfg.magus.eye.centreDamage} damage and slowed to ${Math.round(last.speed)}px/s`)
      : fail(`centre: ${JSON.stringify({ hp: last.hp, slowed: last.slowed, speed: last.speed })}`);
  }
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.y += 55; });
  const edge = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  edge.hp === 100 - cfg.magus.eye.damage && !edge.slowed
    ? pass(`on the edge: ${cfg.magus.eye.damage} damage, no slow`)
    : fail(`edge: ${JSON.stringify({ hp: edge.hp, slowed: edge.slowed })}`);
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  await page.mouse.click(640, 200, { button: 'right' });
  const out = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  out.hp === 100 ? pass('walking out of the circle in time takes nothing') : fail(`walked out, hp ${out.hp}`);

  // === 5. Orb and the stun ===================================================
  // === 4b. It aims where you are heading =====================================
  section('4b. It aims where you are heading');
  // Running in a straight line: the Eye goes down ahead of you and you run into it.
  await calm(640, 160);
  await place([{ type: 'magus', x: 1040, y: 200 }]);
  await page.mouse.click(640, 700, { button: 'right' });
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].view.reticle.visible, null, { timeout: 2000 });
  const reticleSeen = true;
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  const ahead = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { zoneY: g.hostileSpells.zones[0].y, py: g.player.y };
  });
  const ranInto = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  reticleSeen && ahead.zoneY > ahead.py + 60
    ? pass(`a reticle tracks first, then the Eye goes down ahead of a running player (${Math.round(ahead.zoneY - ahead.py)}px ahead)`)
    : fail(`eye lead: ${JSON.stringify(ahead)}`);
  ranInto.hp < 100
    ? pass(`keep running straight and you run into it (hp ${ranInto.hp})`)
    : fail('a straight-line runner was not hit by the led Eye');
  // Changing direction once it's down dodges it.
  await calm(640, 160);
  await place([{ type: 'magus', x: 1040, y: 200 }]);
  await page.mouse.click(640, 700, { button: 'right' });
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  await page.mouse.click(640, 60, { button: 'right' });
  const juked = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  juked.hp === 100 ? pass('turning back once it is placed dodges it') : fail(`reversed but hit: hp ${juked.hp}`);
  // The Lance leads too: running straight through its lock gets you hit.
  await calm(640, 150);
  await place([{ type: 'magus', x: 900, y: 200 }]);
  await page.mouse.click(640, 700, { button: 'right' });
  await castNow('lance');
  const ranLance = (await watch(cfg.magus.lance.chargeMs + cfg.magus.lance.lockMs + 150)).at(-1);
  ranLance.hp === 100 - cfg.magus.lance.damage
    ? pass(`the Lance locks where a runner is heading: hit for ${cfg.magus.lance.damage}`)
    : fail(`led lance: hp ${ranLance.hp}`);

  // === 4c. Aim spread ==========================================================
  section('4c. Aim spread');
  await setSpread(spread);
  const offsets = await page.evaluate((r) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const m = d.spawnEnemy('magus');
    const out = [];
    for (let i = 0; i < 600; i++) { m.rollAimOffset(r); out.push({ ...m.aimOffset }); }
    m.destroy();
    return out;
  }, spread.spell);
  {
    const radii = offsets.map((o) => Math.hypot(o.x, o.y));
    const quadrants = new Set(offsets.map((o) => `${o.x >= 0}${o.y >= 0}`));
    const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
    Math.max(...radii) <= spread.spell + 1e-9 && quadrants.size === 4 && Math.abs(meanR - (2 / 3) * spread.spell) < spread.spell * 0.06
      ? pass(`each cast rolls an offset uniformly within ${spread.spell}px (600 rolls: max ${Math.max(...radii).toFixed(0)}px, mean ${meanR.toFixed(0)}px ≈ ⅔ r)`)
      : fail(`offsets: max ${Math.max(...radii)}, mean ${meanR}, quadrants ${quadrants.size}`);
  }
  // Live: three Eyes on a standing player land near, but not exactly on, them.
  const eyeSpots = [];
  for (let i = 0; i < 3; i++) {
    await calm();
    await place([{ type: 'magus', x: 1040, y: 360 }]);
    await castNow('eye');
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
    eyeSpots.push(await page.evaluate(() => {
      const z = window.__warmup.scene.getScene('GameScene').hostileSpells.zones[0];
      return { x: z.x, y: z.y };
    }));
  }
  {
    const off = eyeSpots.map((p) => Math.hypot(p.x - 640, p.y - 360));
    off.every((d) => d <= spread.spell + 0.5) && new Set(eyeSpots.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size === 3
      ? pass(`three Eyes on a standing player land at different spots within ${spread.spell}px (${off.map((d) => Math.round(d)).join(', ')}px off)`)
      : fail(`eye spots: ${JSON.stringify(eyeSpots)}`);
  }
  // The reticle holds its offset while it tracks: it doesn't jitter frame to frame.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('eye');
  const steady = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const m = g.director.enemies[0];
    const seen = [];
    const tick = () => {
      if (m.state === 'eye' && m.eyeTarget) seen.push(`${m.eyeTarget.x.toFixed(2)},${m.eyeTarget.y.toFixed(2)}`);
      if (g.hostileSpells.zones.length > 0 || seen.length > 60) res(seen); else requestAnimationFrame(tick);
    };
    tick();
  }));
  steady.length > 3 && new Set(steady).size === 1
    ? pass(`the reticle stays put on a standing player across ${steady.length} targeting frames`)
    : fail(`reticle moved: ${new Set(steady).size} distinct spots`);
  await setSpread({ spell: 0, orb: 0 });

  section('5. Orb and the stun');
  await calm();
  await place([{ type: 'magus', x: 880, y: 360 }]);
  await castNow('lance', 'orb');
  const orb = await watch(cfg.magus.orb.windupMs + 700);
  {
    const states = new Set(orb.map((f) => f.magus.state));
    states.has('orb') && !states.has('lance')
      ? pass('dived inside its trigger range, it answers with the Orb first')
      : fail(`states: ${[...states].join(', ')}`);
    orb.some((f) => f.orbs > 0) ? pass('the orb is a visible projectile') : fail('no orb in flight');
    const hit = orb.find((f) => f.stunned);
    hit && hit.hp === 100 - cfg.magus.orb.damage
      ? pass(`it connects: ${cfg.magus.orb.damage} damage and a stun`)
      : fail(`orb hit: ${JSON.stringify(hit ?? orb.at(-1))}`);
  }
  const stunLen = orb.find((f) => f.stunned)?.stunLeft ?? 0;
  {
    // Fired from ~240px out: about a third of the way up the stun ramp.
    const { stunMinMs, stunMaxMs } = cfg.magus.orb;
    stunLen > 0 && stunLen < stunMinMs + (stunMaxMs - stunMinMs) * 0.6
      ? pass(`a close-range orb stuns briefly (~${Math.round(stunLen)}ms left of ${stunMinMs}-${stunMaxMs})`)
      : fail(`stun remaining ${stunLen}`);
  }
  // A long orb stuns longer: fire one directly at full range.
  await calm();
  await place([{ type: 'basic', x: 100, y: 100, hp: 9999 }]);
  const longStun = await page.evaluate((O) => new Promise<number>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.hostileSpells.fireOrb({ x: 640 + O.range - 20, y: 360, angle: Math.PI, speed: O.speed, radius: O.radius, range: O.range, damage: O.damage, stunMinMs: O.stunMinMs, stunMaxMs: O.stunMaxMs });
    const tick = () => {
      if (g.player.isStunned) res(g.player.stunnedUntil - g.clock.now);
      else if (g.hostileSpells.orbCount === 0) res(0);
      else requestAnimationFrame(tick);
    };
    tick();
  }), cfg.magus.orb);
  longStun > cfg.magus.orb.stunMaxMs * 0.8
    ? pass(`a full-range orb stuns for ~${Math.round(longStun)}ms`)
    : fail(`long orb stun ${longStun}`);

  // While stunned: no movement, no abilities (Flash included); orders buffer.
  await calm();
  await place([{ type: 'basic', x: 100, y: 100, hp: 9999 }]);
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.stunPlayer(900); });
  await page.mouse.move(400, 360);
  await page.mouse.click(400, 360, { button: 'right' });
  await page.keyboard.press('q');
  await page.keyboard.press('f');
  const during = await watch(500);
  const afterKeys = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { q: g.cooldowns.remainingMs('q'), flash: g.cooldowns.remainingMs('flash'), buffered: !!g.stunBuffered, x: g.player.x };
  });
  during.every((f) => f.px === 640 && f.py === 360 && f.stunned)
    ? pass('stunned: the player does not move')
    : fail(`moved while stunned: ${JSON.stringify(during.find((f) => f.px !== 640))}`);
  afterKeys.q === 0 && afterKeys.flash === 0
    ? pass('Q and Flash do nothing while stunned (no cooldown spent)')
    : fail(`cooldowns after presses: ${JSON.stringify(afterKeys)}`);
  afterKeys.buffered ? pass('the right-click is held') : fail('the right-click was not buffered');
  const freed = await watch(900);
  freed.at(-1).px < 600 && !freed.at(-1).stunned
    ? pass(`when the stun ends the held move replays (x ${Math.round(freed.at(-1).px)})`)
    : fail(`after stun: ${JSON.stringify(freed.at(-1))}`);

  // A stun interrupts a cast window and refunds it.
  await calm();
  await place([{ type: 'basic', x: 100, y: 100, hp: 9999 }]);
  await page.mouse.move(900, 360);
  const qFired0 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').skillshot.shotsFired);
  await page.keyboard.press('q');
  const interrupted = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const wasCasting = g.cast.isCasting;
    g.stunPlayer(300);
    return { wasCasting, casting: g.cast.isCasting, q: g.cooldowns.remainingMs('q') };
  });
  await watch(500);
  const qFired1 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').skillshot.shotsFired);
  interrupted.wasCasting && !interrupted.casting && interrupted.q === 0 && qFired1 === qFired0
    ? pass('a stun mid-cast cancels the Q (never fires) and refunds its cooldown')
    : fail(`cast interrupt: ${JSON.stringify({ ...interrupted, qFired0, qFired1 })}`);

  // A stun cancels an uncommitted auto windup; the attack order resumes after.
  await calm();
  await place([{ type: 'basic', x: 820, y: 360, hp: 9999 }]);
  await page.mouse.click(820, 360, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 2000 });
  const windupCut = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.stunPlayer(400);
    return { state: g.attacks.state, target: !!g.attacks.currentTarget };
  });
  const resumed = await watch(800);
  windupCut.state === 'idle' && windupCut.target && resumed.some((f) => !f.stunned && f.attack === 'windup') && resumed.every((f) => !f.stunned || f.attack !== 'windup')
    ? pass('a stun cancels the windup, no auto starts while stunned, and the attack order resumes after')
    : fail(`windup interrupt: ${JSON.stringify({ windupCut, states: resumed.map((f) => `${Math.round(f.t)}:${f.attack}`).join(' ') })}`);

  // No guaranteed Pursuer follow-up: it will not start a swing on a stunned player.
  await calm();
  await place([{ type: 'pursuer', x: 690, y: 360, hp: 9999 }]);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.director.enemies[0].nextAttackAt = 0;
    g.stunPlayer(700);
  });
  const brawl = await watch(1300);
  {
    const pursuerWindups = brawl.filter((f) => f.enemies[0].windup >= 0);
    const duringStun = pursuerWindups.filter((f) => f.stunned);
    duringStun.length === 0 && brawl.filter((f) => f.stunned).every((f) => f.hp === 100)
      ? pass('a Pursuer never starts a swing on a stunned player')
      : fail(`pursuer swung during stun: ${duringStun.length} frames`);
    pursuerWindups.length > 0
      ? pass('…and swings again once the stun ends')
      : fail('pursuer never swung after the stun');
  }

  // === 6. Rite ===============================================================
  section('6. Rite');
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360, rite: true }]);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.enemies[0].nextCastAt = 0; });
  const R = cfg.magus.rite;
  const rite = await watch(R.leadInMs + (R.shots - 1) * R.intervalMs + R.delayMs + 200);
  {
    const resolved = rite.at(-1).resolved - rite[0].resolved;
    rite.some((f) => f.magus.state === 'rite') && resolved === R.shots
      ? pass(`as the last enemy standing it channels its Rite: ${resolved} circles`)
      : fail(`rite: states ${[...new Set(rite.map((f) => f.magus.state))].join(',')}, resolved ${resolved}`);
    rite.filter((f) => f.magus.state === 'rite').every((f) => f.magus.x === rite[0].magus.x)
      ? pass('rooted through the whole channel')
      : fail('moved during the Rite');
  }
  const riteAgain = await page.evaluate(() => {
    const m = window.__warmup.scene.getScene('GameScene').director.enemies[0];
    m.nextCastAt = 0;
    return m.riteUsed;
  });
  const after = await watch(400);
  riteAgain && after.every((f) => f.magus.state !== 'rite')
    ? pass('once per life')
    : fail('the Rite fired twice');

  // === 7. Spells vs. caster death, wave clear and pause =====================
  section('7. Spells vs. caster death, wave clear and pause');
  const killMagus = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const m = g.director.enemies.find((e) => e.archetype === 'magus');
    while (!m.dead) m.takeHit();
    g.director.onEnemyKilled(m, g.clock.now);
  });
  // A placed Eye still lands after its caster dies.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }, { type: 'basic', x: 100, y: 100, hp: 9999 }]);
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  await killMagus();
  const orphan = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  orphan.hp < 100 ? pass(`a placed Eye still lands after the Magus dies (hp ${orphan.hp})`) : fail('orphaned Eye never landed');

  // A Lance still charging dies with its caster.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }, { type: 'basic', x: 100, y: 100, hp: 9999 }]);
  await castNow('lance');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].state === 'lance', null, { timeout: 3000 });
  await killMagus();
  const fizzled = await watch(cfg.magus.lance.chargeMs + cfg.magus.lance.lockMs + 100);
  fizzled.every((f) => f.zones.length === 0) && fizzled.at(-1).hp === 100
    ? pass('a Lance still charging dies with the Magus')
    : fail('a dead Magus still placed its Lance');

  // Clearing the wave fizzles every pending spell.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }]);
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  await killMagus();
  const cleared = await watch(cfg.magus.eye.delayMs + 100);
  cleared.at(-1).zones.length === 0 && cleared.every((f) => f.hp === 100)
    ? pass('clearing the wave fizzles a pending Eye')
    : fail(`after clear: ${JSON.stringify(cleared.at(-1))}`);
  // Back to a fighting wave for the last check.
  await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = 0; d.waveIndex = 0; d.spawnWave(); d.arriveAllNow();
  });

  // Pause freezes a pending zone exactly.
  await calm();
  await place([{ type: 'magus', x: 1040, y: 360 }, { type: 'basic', x: 100, y: 100, hp: 9999 }]);
  await castNow('eye');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').hostileSpells.zones.length > 0, null, { timeout: 3000 });
  const t0 = await now();
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').setPaused(true));
  await page.waitForTimeout(cfg.magus.eye.delayMs + 300);
  const paused = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { zones: g.hostileSpells.zones.length, hp: g.player.hp };
  });
  const t1 = await now();
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').setPaused(false));
  const resumedEye = (await watch(cfg.magus.eye.delayMs + 100)).at(-1);
  paused.zones === 1 && paused.hp === 100 && t1 - t0 < 60 && resumedEye.hp < 100
    ? pass('pause holds a pending Eye exactly; it lands after resume')
    : fail(`pause: ${JSON.stringify({ paused, dt: t1 - t0, hp: resumedEye.hp })}`);

  await finish();
});
