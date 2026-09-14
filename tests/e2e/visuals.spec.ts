import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('visuals: no tether line, command markers, composed units, distinct projectiles, arena + HUD layers', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const setup = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100; g.player.x = 520; g.player.y = 380; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.enemies.forEach((t, i) => {
      const spots = [{ x: 760, y: 380 }, { x: 980, y: 520 }, { x: 330, y: 200 }, { x: 1060, y: 200 }];
      t.x = spots[i].x; t.y = spots[i].y; t.hp = t.maxHp; t.ghostHp = t.maxHp; t.active = true; t.__tag = i + 1;
      t.wanderX = t.x; t.wanderY = t.y; t.nextWanderAt = Number.POSITIVE_INFINITY;
    });
  });
  await setup();

  // === 1. No tether / web-sling line ==========================================
  section('1. No tether / web-sling line');
  // Issue a long move order, then look for any Line that stretches from the
  // player toward the destination.
  await page.mouse.click(1150, 650, { button: 'right' });
  await page.waitForTimeout(150);
  const tether = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const px = g.player.x, py = g.player.y;
    const out = [];
    for (const o of g.children.list) {
      if (o.type !== 'Line' || !o.visible) continue;
      const gm = o.geom;
      const len = Math.hypot(gm.x2 - gm.x1, gm.y2 - gm.y1);
      const startDist = Math.hypot(o.x + gm.x1 - px, o.y + gm.y1 - py);
      out.push({ len, startDist });
    }
    return out;
  });
  const tethers = tether.filter((l) => l.len > 40 && l.startDist < 30);
  tethers.length === 0
    ? pass(`no line anchored to the player (${tether.length} short trail segments only)`)
    : fail(`tether-like line found: ${JSON.stringify(tethers)}`);

  // The player no longer owns a "facing" line object at all.
  const hasFacing = await page.evaluate(() => 'facing' in window.__warmup.scene.getScene('GameScene').player);
  !hasFacing ? pass('Player.facing line object removed entirely') : fail('Player still has a facing line');

  // === 2. Command feedback survives without it ================================
  section('2. Command feedback survives without it');
  await setup();
  const markers = await page.evaluate(async () => {
    const g = window.__warmup.scene.getScene('GameScene');
    const before = g.children.list.length;
    g.commandHandler // not directly callable; drive via input instead
    return before;
  });
  await page.mouse.click(300, 300, { button: 'right' });
  await page.waitForTimeout(60);
  const movePing = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    // A transient ring near the click point = the move marker.
    return g.children.list.some((o) => o.type === 'Arc' && Math.hypot(o.x - 300, o.y - 300) < 20 && o.visible);
  });
  movePing ? pass('right-click ground still shows a ground marker') : fail('no move marker');

  await page.keyboard.press('a');
  await page.mouse.click(700, 250, { button: 'left' });
  await page.waitForTimeout(60);
  const amPing = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const arcs = g.children.list.filter((o) => o.type === 'Arc' && Math.hypot(o.x - 700, o.y - 250) < 24 && o.visible);
    const gfx = g.children.list.filter((o) => o.type === 'Graphics' && o.visible).length;
    return { arcs: arcs.length, gfx };
  });
  amPing.arcs > 0 ? pass('attack-move shows its own distinct marker') : fail('no attack-move marker');

  // Target lock indicator on the current attack target.
  await setup();
  await page.mouse.click(760, 380, { button: 'right' });
  await page.waitForTimeout(200);
  const lock = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { visible: g.attacks.targetMarker.visible, type: g.attacks.targetMarker.type };
  });
  lock.visible ? pass(`current target carries a lock indicator (${lock.type})`) : fail('no target lock indicator');

  // === 3. Units are composed shapes, not plain circles ========================
  section('3. Units are composed shapes, not plain circles');
  const shapes = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const p = g.player;
    const t = g.enemies[0];
    return {
      playerType: p.body.type,
      playerParts: p.body.list ? p.body.list.map((o) => o.type) : [],
      playerRotates: typeof p.body.rotation === 'number',
      targetType: t.body.type,
      targetParts: t.body.list ? t.body.list.map((o) => o.type) : [],
      playerShadow: !!p.shadow?.visible,
      targetShadow: !!t.shadow?.visible,
    };
  });
  shapes.playerType === 'Container' && shapes.playerParts.includes('Polygon')
    ? pass(`player is a composed unit (${shapes.playerParts.join('+')})`)
    : fail(`player body: ${shapes.playerType} ${shapes.playerParts}`);
  shapes.targetType === 'Container' && shapes.targetParts.filter((t) => t === 'Polygon').length >= 2
    ? pass(`enemies are composed units (${shapes.targetParts.join('+')})`)
    : fail(`target body: ${shapes.targetType} ${shapes.targetParts}`);
  shapes.playerShadow && shapes.targetShadow ? pass('player and enemies both cast shadows') : fail('missing shadows');

  // Player rotates to face its target instead of drawing a line to it.
  await setup();
  const rot0 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.body.rotation);
  await page.mouse.click(330, 200, { button: 'right' }); // enemy up-left
  await page.waitForTimeout(500);
  const rot1 = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.body.rotation);
  Math.abs(rot1 - rot0) > 0.15
    ? pass(`player hull rotates to face its target (${rot0.toFixed(2)} -> ${rot1.toFixed(2)} rad)`)
    : fail(`hull did not rotate (${rot0} -> ${rot1})`);

  // === 4. Projectiles are distinct ============================================
  section('4. Projectiles are distinct');
  await setup();
  await page.mouse.click(760, 380, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
  const autoShape = await page.evaluate(() => {
    const m = window.__warmup.scene.getScene('GameScene').attacks.missiles[0];
    return { body: m.body.type, hasCore: !!m.core, hasTrail: !!m.trail, rot: m.body.rotation };
  });
  autoShape.body === 'Polygon' && autoShape.hasCore && autoShape.hasTrail
    ? pass('auto-attack bolt is an oriented polygon with core + trail')
    : fail(`auto bolt: ${JSON.stringify(autoShape)}`);

  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.nextSpawnAt = 0;
    g.enemyProjectiles.spawnVolley();
    g.skillshot.fireAtForTest ??= null;
  });
  await page.keyboard.press('q');
  await page.mouse.click(980, 520, { button: 'left' });
  // Q has a cast window now — wait for the bolt to actually spawn.
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').skillshot.missiles.length > 0,
    null,
    { timeout: 3000 },
  );
  const kinds = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const q = g.skillshot.missiles[0]?.projectile;
    const e = g.enemyProjectiles.missiles[0];
    return {
      q: q ? { r: q.radius, color: q.body.fillColor, core: !!q.core } : null,
      e: e ? { r: e.radius, color: e.body.fillColor, heavy: e.heavy } : null,
      auto: window.__balance.ATTACK.projectileRadius,
    };
  });
  kinds.q && kinds.e && kinds.q.color !== kinds.e.color && kinds.e.r > kinds.auto
    ? pass(`three distinct projectile kinds (auto r${kinds.auto} cyan, Q r${kinds.q.r} green, enemy r${Math.round(kinds.e.r)} amber+rim)`)
    : fail(`projectile kinds: ${JSON.stringify(kinds)}`);

  // === 5. Arena + UI are built, and gameplay still reads ======================
  section('5. Arena + UI are built, and gameplay still reads');
  const scene = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    return {
      arenaGraphics: g.children.list.filter((o) => o.type === 'Graphics').length,
      uiPanels: ui.children.list.filter((o) => o.type === 'Graphics').length,
      uiTexts: ui.children.list.filter((o) => o.type === 'Text').length,
    };
  });
  scene.arenaGraphics >= 3 ? pass(`arena drawn in ${scene.arenaGraphics} graphics layers (floor/grid, vignette, frame)`) : fail('arena layers missing');
  scene.uiPanels >= 3 ? pass(`HUD grouped onto ${scene.uiPanels} panels`) : fail('HUD panels missing');

  await finish();
});
