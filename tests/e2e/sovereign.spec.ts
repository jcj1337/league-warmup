import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('sovereign: unlock, Dark Sphere + cap + cleanup, Force of Will (sphere and slime), Scatter lines + stun, Q→E', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    S: window.__balance.SOVEREIGN,
    E: window.__balance.ENEMIES,
  }));
  // Exact-aim checks: no random spread (restored for nothing else in this suite).
  await page.evaluate(() => { window.__balance.SOVEREIGN.aimSpreadPx = 0; });

  /** Quiet Stage 9 arena, player parked at (px, py), healthy, free of crowd control. */
  const calm = (px = 640, py = 360) => page.evaluate(({ px, py }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = 8; d.waveIndex = 0; d.currentPhase = 'wave';
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear();
    d.enemies.forEach((e) => e.destroy()); d.enemies.length = 0; d.pending.length = 0;
    g.enemies = d.enemies;
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.stunnedUntil = 0; g.player.slowUntil = 0; g.player.slowFraction = 0;
    g.stunBuffered = null;
    g.player.x = px; g.player.y = py; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.skillshot.clear();
  }, { px, py });
  /** The Sovereign at (x, y), holding still and silent until castNow(); optional harmless basics. */
  const place = (x, y, basics: { x: number; y: number }[] = []) => page.evaluate(({ x, y, basics }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const s = d.spawnEnemy('sovereign');
    s.x = x; s.y = y; s.hp = 99; s.goalX = x; s.goalY = y; s.nextPlanAt = Number.POSITIVE_INFINITY;
    s.nextCastAt = Number.POSITIVE_INFINITY;
    d.enemies.push(s);
    for (const b of basics) {
      const e = d.spawnEnemy('basic');
      e.x = b.x; e.y = b.y; e.hp = 99; e.canSpit = false; e.goalX = b.x; e.goalY = b.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
      d.enemies.push(e);
    }
    g.enemies = d.enemies;
  }, { x, y, basics });
  /** Let her cast now, with only these spells ready. */
  const castNow = (...spells) => page.evaluate((spells) => {
    const s = window.__warmup.scene.getScene('GameScene').director.enemies.find((e) => e.archetype === 'sovereign');
    for (const id of ['sphere', 'will', 'scatter']) s.readyAt[id] = spells.includes(id) ? 0 : Number.POSITIVE_INFINITY;
    s.nextCastAt = 0;
  }, spells);
  /** Put a sphere of hers on the ground at each spot. */
  const spheresAt = (spots) => page.evaluate((spots) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const s = g.director.enemies.find((e) => e.archetype === 'sovereign');
    for (const [x, y] of spots) g.hostileSpells.spheres.push({ id: Math.random(), owner: s, x, y, landedAt: g.clock.now, expiresAt: g.clock.now + 6000 });
  }, spots);
  const watch = (ms) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const out = [];
    const tick = () => {
      const s = g.director.enemies.find((e) => e.archetype === 'sovereign');
      out.push({
        t: g.clock.now - t0, hp: g.player.hp, stunned: g.player.isStunned, slowed: g.player.isSlowed,
        state: s?.state, exits: s?.view.exits.count ?? 0, heldSphere: s?.view.heldSphere.visible ?? false,
        zones: g.hostileSpells.zones.map((z) => ({ kind: z.kind, x: z.x, y: z.y, style: z.style })),
        spheres: g.hostileSpells.spheres.map((p) => ({ x: p.x, y: p.y })), shots: g.hostileSpells.sphereShotCount,
        basics: g.director.enemies.filter((e) => e.archetype === 'basic').map((e) => ({ x: e.x, y: e.y, held: e.held, dazed: e.dazedUntil > g.clock.now })),
      });
      if (g.clock.now - t0 >= ms) res(out); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);
  const hit = (base) => page.evaluate((b) => Math.round(b * window.__warmup.scene.getScene('GameScene').director.difficulty.damage), base);

  // === 1. Registry ==========================================================
  section('1. Registry');
  const unlock = cfg.E.sovereign.unlockStage;
  const reg = await page.evaluate((unlock) => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const count = (s) => d.describeStage(s - 1).waves.map((w) => w.sovereign);
    return { before: count(unlock - 1), first: count(unlock), later: count(15) };
  }, unlock);
  unlock === 7 && reg.before.every((n) => n === 0) && reg.first[0] === 1 && [...reg.first, ...reg.later].every((n) => n <= 1)
    ? pass(`unlocks at Stage ${unlock}: none before, exactly one in Wave 1 of Stage ${unlock}, never more than one per wave`)
    : fail(`sovereigns per wave: ${JSON.stringify(reg)}`);
  cfg.E.pursuer.weight === 1.5 && cfg.E.pursuer.maxShare === 0.5
    ? pass('Pursuers are rarer to make room for her (weight 1.5, share 0.5)')
    : fail(`pursuer weighting: ${cfg.E.pursuer.weight} / ${cfg.E.pursuer.maxShare}`);

  // === 2. Dark Sphere ========================================================
  section('2. Dark Sphere');
  await calm();
  await place(940, 360);
  await castNow('sphere');
  const q = await watch(cfg.S.sphere.delayMs + 150);
  {
    const zone = q.find((f) => f.zones.length)?.zones[0];
    const last = q.at(-1);
    zone?.kind === 'circle' && zone.style === 'void' && Math.abs(zone.x - 640) < 2
      ? pass('a void-edged circle goes down on you (standing still)')
      : fail(`q zone: ${JSON.stringify(zone)}`);
    const dmg = await hit(cfg.S.sphere.damage);
    last.spheres.length === 1 && Math.abs(last.spheres[0].x - 640) < 2 && last.hp === 100 - dmg
      ? pass(`it lands for ${dmg} and leaves a Dark Sphere on the spot`)
      : fail(`after landing: ${JSON.stringify({ spheres: last.spheres, hp: last.hp })}`);
  }
  // No more casts: watch this one sphere run out.
  await page.evaluate(() => {
    window.__warmup.scene.getScene('GameScene').director.enemies.find((e) => e.archetype === 'sovereign').nextCastAt = Number.POSITIVE_INFINITY;
  });
  const expired = await watch(cfg.S.spheres.lifeMs + 200);
  expired.at(-1).spheres.length === 0
    ? pass(`the sphere lasts ${cfg.S.spheres.lifeMs / 1000}s`)
    : fail('sphere outlived its lifetime');
  // Cap: a fourth sphere replaces the oldest.
  await calm();
  await place(940, 360);
  await spheresAt([[700, 200], [700, 300], [700, 500]]);
  await castNow('sphere');
  const capped = (await watch(cfg.S.sphere.delayMs + 150)).at(-1);
  capped.spheres.length === cfg.S.spheres.cap && !capped.spheres.some((p) => p.y === 200)
    ? pass(`at most ${cfg.S.spheres.cap} spheres at Stage 9: a new one replaces her oldest`)
    : fail(`cap: ${JSON.stringify(capped.spheres)}`);
  // Her death clears the board.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const s = g.director.enemies.find((e) => e.archetype === 'sovereign');
    const keep = g.director.spawnEnemy('basic'); keep.x = 100; keep.y = 100; keep.canSpit = false; g.director.enemies.push(keep);
    while (!s.dead) s.takeHit();
  });
  const afterDeath = (await watch(100)).at(-1);
  afterDeath.spheres.length === 0 ? pass('killing her deletes every sphere she has out') : fail(`spheres after her death: ${afterDeath.spheres.length}`);

  // === 3. Force of Will ======================================================
  section('3. Force of Will');
  await calm();
  await place(940, 360);
  await spheresAt([[900, 300]]);
  await castNow('will');
  const w = await watch(cfg.S.will.grabMs + cfg.S.will.delayMs + 150);
  {
    const grabbing = w.filter((f) => f.state === 'grab');
    const thrown = w.find((f) => f.zones.some((z) => z.kind === 'circle'));
    const dmg = await hit(cfg.S.will.damage);
    grabbing.length > 0 && grabbing.every((f) => f.heldSphere && f.spheres.length === 0)
      ? pass('she lifts her sphere off the ground and holds it over her head')
      : fail('no visible grab');
    thrown && Math.abs(thrown.zones[0].x - 640) < 2 && w.at(-1).hp === 100 - dmg && w.at(-1).slowed
      ? pass(`then throws it at you: ${dmg} damage and a slow`)
      : fail(`throw: ${JSON.stringify({ zone: thrown?.zones, hp: w.at(-1).hp, slowed: w.at(-1).slowed })}`);
  }
  // Throwing one of her slimes.
  await calm();
  await page.evaluate(() => { window.__balance.SOVEREIGN.will.slimeChance = 1; });
  await place(940, 360, [{ x: 900, y: 420 }]);
  await castNow('will');
  const slimeThrow = await watch(cfg.S.will.grabMs + cfg.S.will.delayMs + cfg.S.will.slimeDazedMs + 400);
  {
    const held = slimeThrow.filter((f) => f.basics[0]?.held);
    const landed = slimeThrow.find((f, i) => i > 0 && slimeThrow[i - 1].basics[0]?.held && !f.basics[0].held);
    held.length > 0 && landed && Math.hypot(landed.basics[0].x - 640, landed.basics[0].y - 360) < 10 && landed.basics[0].dazed
      ? pass(`with a slime in reach she grabs it and throws it onto you; it lands dazed for ${cfg.S.will.slimeDazedMs}ms`)
      : fail(`slime throw: ${JSON.stringify({ held: held.length, landed: landed?.basics })}`);
    slimeThrow.at(-1).basics[0].dazed === false && !slimeThrow.at(-1).basics[0].held
      ? pass('then it is a live slime again')
      : fail('the thrown slime never woke up');
  }
  // Popping the slime in her hands fizzles the throw.
  await calm();
  await place(940, 360, [{ x: 900, y: 420 }]);
  await castNow('will');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies.some((e) => e.held), null, { timeout: 2000 });
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.held);
    while (!e.dead) e.takeHit();
  });
  const fizzled = await watch(cfg.S.will.grabMs + cfg.S.will.delayMs);
  fizzled.every((f) => f.zones.length === 0) && fizzled.at(-1).hp === 100
    ? pass('pop the slime in her hands and the throw fizzles')
    : fail('a popped slime was still thrown');
  await page.evaluate(() => { window.__balance.SOVEREIGN.will.slimeChance = 0.5; });

  // === 4. Scatter =============================================================
  section('4. Scatter');
  await calm();
  await place(940, 360);
  // One sphere lined up between her and you, one off to the side (outside the cone).
  await spheresAt([[820, 360], [940, 200]]);
  await castNow('scatter');
  const e = await watch(cfg.S.scatter.windupMs + 500);
  {
    const winding = e.filter((f) => f.state === 'scatter');
    winding.length > 0 && winding.every((f) => f.exits === 1) && winding[0].zones.some((z) => z.kind === 'cone' && z.style === 'void')
      ? pass('a void-edged cone fills; only the sphere inside it shows its exit line')
      : fail(`scatter windup: ${JSON.stringify(winding[0])}`);
    const stunned = e.find((f) => f.stunned);
    const dmg = await hit(cfg.S.scatter.launch.damage);
    stunned && stunned.hp === 100 - dmg && e.at(-1).spheres.length === 1 && e.at(-1).spheres[0].y === 200
      ? pass(`the lined-up sphere flies out along her line and stuns you (${dmg} damage); the other stays put`)
      : fail(`scatter result: ${JSON.stringify({ stunned: !!stunned, hp: e.at(-1).hp, spheres: e.at(-1).spheres })}`);
  }
  // Step off the line during the windup and it misses.
  await calm();
  await place(940, 360);
  await spheresAt([[820, 360]]);
  await castNow('scatter');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].state === 'scatter', null, { timeout: 2000 });
  await page.mouse.click(640, 220, { button: 'right' });
  const sidestep = await watch(cfg.S.scatter.windupMs + 500);
  sidestep.every((f) => !f.stunned)
    ? pass('stepping off the exit line during the windup dodges it')
    : fail('stunned despite sidestepping');
  // Close enough to be in the cone itself.
  await calm(640, 360);
  await place(780, 360);
  await castNow('scatter');
  const cone = await watch(cfg.S.scatter.windupMs + 150);
  cone.at(-1).hp === 100 - (await hit(cfg.S.scatter.damage))
    ? pass(`inside the cone itself: ${await hit(cfg.S.scatter.damage)} damage`)
    : fail(`cone damage: hp ${cone.at(-1).hp}`);

  // === 5. Q→E =================================================================
  section('5. Q→E');
  await calm();
  await page.evaluate(() => { window.__balance.SOVEREIGN.scatter.comboChance = 1; });
  await place(960, 360);
  await castNow('sphere', 'scatter');
  const combo = await watch(cfg.S.sphere.delayMs + 1800);
  {
    const placed = combo.find((f) => f.zones.some((z) => z.kind === 'circle'))?.zones[0];
    const scattered = combo.some((f) => f.state === 'scatter');
    const stunned = combo.some((f) => f.stunned);
    placed && placed.x > 640 && placed.x < 960 && Math.abs(placed.y - 360) < 2 && scattered && stunned
      ? pass(`she drops a sphere between you (${Math.round(960 - placed.x)}px from her), then Scatters it into you`)
      : fail(`combo: ${JSON.stringify({ placed, scattered, stunned })}`);
  }
  await page.evaluate(() => { window.__balance.SOVEREIGN.scatter.comboChance = 0.6; });

  await finish();
});
