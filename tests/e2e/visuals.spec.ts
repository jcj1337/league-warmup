import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('visuals: pixel-art setup, no tether line, command markers, sprite units + y-sort, distinct projectiles, battlefield + HUD layers', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const setup = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100; g.player.x = 520; g.player.y = 380; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
    g.enemies.forEach((t, i) => {
      // Stage 1 fields six: the first four are the ones under test, the rest parked out of the way.
      const spots = [{ x: 760, y: 380 }, { x: 980, y: 520 }, { x: 330, y: 200 }, { x: 1060, y: 200 }, { x: 160, y: 560 }, { x: 1140, y: 600 }];
      t.x = spots[i].x; t.y = spots[i].y; t.hp = t.maxHp; t.active = true; t.__tag = i + 1;
      t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Number.POSITIVE_INFINITY;
    });
  });
  await setup();

  // === 0. Pixel-art rendering ================================================
  section('0. Pixel-art rendering');
  const render = await page.evaluate(() => {
    const cfg = window.__warmup.config;
    return { pixelArt: cfg.pixelArt, antialias: cfg.antialias, roundPixels: cfg.roundPixels, scale: window.__theme.art.scale };
  });
  render.pixelArt && !render.antialias && render.roundPixels
    ? pass('game renders in pixel-art mode (nearest-neighbour, no antialias, whole-pixel sprites)')
    : fail(`render config: ${JSON.stringify(render)}`);

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
    ? pass(`no line anchored to the player (${tether.length} line objects in the scene)`)
    : fail(`tether-like line found: ${JSON.stringify(tethers)}`);

  // The player no longer owns a "facing" line object at all.
  const hasFacing = await page.evaluate(() => 'facing' in window.__warmup.scene.getScene('GameScene').player);
  !hasFacing ? pass('Player.facing line object removed entirely') : fail('Player still has a facing line');

  // === 2. Command feedback ===================================================
  section('2. Command feedback');
  await setup();
  const pingNear = (key, x, y) => page.evaluate(({ key, x, y }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    return g.children.list.some((o) => o.visible && o.texture?.key === key && Math.hypot(o.x - x, o.y - y) < 20);
  }, { key, x, y });
  await page.mouse.click(300, 300, { button: 'right' });
  await page.waitForTimeout(60);
  (await pingNear('fx_ping_move', 300, 300))
    ? pass('right-click ground shows a move ping at the click')
    : fail('no move marker');

  await page.keyboard.press('a');
  await page.mouse.click(700, 250, { button: 'left' });
  await page.waitForTimeout(60);
  (await pingNear('fx_ping_attack', 700, 250))
    ? pass('attack-move shows its own distinct crosshair ping')
    : fail('no attack-move marker');

  // Target lock indicator on the current attack target.
  await setup();
  await page.mouse.click(760, 380, { button: 'right' });
  await page.waitForTimeout(200);
  const lock = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { visible: g.attacks.targetMarker.visible, type: g.attacks.targetMarker.type };
  });
  lock.visible ? pass(`current target carries a lock indicator (${lock.type})`) : fail('no target lock indicator');

  // === 3. Units are pixel sprites, drawn over the gameplay position ==========
  section('3. Units are pixel sprites, drawn over the gameplay position');
  await setup();
  await page.waitForTimeout(80);
  // At rest: the last section's auto may still be in its follow-through (a squash and stretch).
  const atRest = () => page.waitForFunction(() => ['idle', 'walk'].includes(window.__warmup.scene.getScene('GameScene').player.view.pose));
  await atRest();
  const units = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const p = g.player;
    const t = g.enemies[0];
    const pursuer = g.director.spawnEnemy('pursuer');
    pursuer.x = 900; pursuer.y = 300;
    pursuer.update(0.016, g.clock.now, { player: { x: p.x, y: p.y, radius: p.radius }, damagePlayer: () => {} });
    const out = {
      player: { type: p.view.sprite.type, key: p.view.sprite.texture.key, scale: p.view.sprite.scaleX, dx: p.view.sprite.x - p.x, dy: p.view.sprite.y - p.y },
      basic: { type: t.view.sprite.type, key: t.view.sprite.texture.key, scale: t.view.sprite.scaleX, w: t.view.sprite.width },
      pursuer: { key: pursuer.view.sprite.texture.key, w: pursuer.view.sprite.width, telegraph: 'telegraph' in pursuer.view },
      shadows: !!p.view.shadow.visible && !!t.view.shadow.visible,
      bars: t.view.hpBar !== undefined && p.view.hpBar !== undefined,
      art: window.__theme.art.scale,
    };
    pursuer.destroy();
    return out;
  });
  units.player.type === 'Image' && /^player_/.test(units.player.key) && units.player.scale === units.art
    ? pass(`player is a pixel sprite (${units.player.key} at ${units.player.scale}x)`)
    : fail(`player sprite: ${JSON.stringify(units.player)}`);
  Math.abs(units.player.dx) <= 1 && Math.abs(units.player.dy) <= 1
    ? pass('player sprite is drawn on the authoritative gameplay position when not attacking')
    : fail(`player sprite offset from gameplay position: ${units.player.dx}, ${units.player.dy}`);
  units.basic.type === 'Image' && /^basic_/.test(units.basic.key) && units.basic.scale >= units.art
    && /^pursuer_/.test(units.pursuer.key) && units.pursuer.telegraph && units.pursuer.w > units.basic.w
    ? pass(`basic (${units.basic.key}) and Pursuer (${units.pursuer.key}, larger, with telegraph) use their own sprites`)
    : fail(`enemy sprites: ${JSON.stringify({ basic: units.basic, pursuer: units.pursuer })}`);
  units.shadows && units.bars ? pass('player and enemies have shadows and health bars') : fail('missing shadows / bars');

  // Y-sort: a unit lower on screen draws in front of one higher up.
  const sort = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const [a, , c] = g.enemies; // y 380 and y 200
    return { lowY: a.y, lowDepth: a.view.sprite.depth, highY: c.y, highDepth: c.view.sprite.depth };
  });
  sort.lowY > sort.highY && sort.lowDepth > sort.highDepth
    ? pass(`units are y-sorted (y ${sort.lowY} depth ${sort.lowDepth.toFixed(4)} > y ${sort.highY} depth ${sort.highDepth.toFixed(4)})`)
    : fail(`y-sort: ${JSON.stringify(sort)}`);

  // The player turns to face its target instead of drawing a line to it.
  await setup();
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.view.facing = 1; });
  await page.mouse.click(330, 200, { button: 'right' }); // enemy up-left
  await page.waitForTimeout(500);
  const facing = await page.evaluate(() => {
    const v = window.__warmup.scene.getScene('GameScene').player.view;
    return { facing: v.facing, flipX: v.sprite.flipX };
  });
  facing.facing === -1 && facing.flipX
    ? pass('player sprite turns to face a target to its left')
    : fail(`player did not turn toward its target: ${JSON.stringify(facing)}`);

  // === 4. Projectiles are distinct ============================================
  section('4. Projectiles are distinct');
  await setup();
  await page.mouse.click(760, 380, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
  const autoShape = await page.evaluate(() => {
    const m = window.__warmup.scene.getScene('GameScene').attacks.missiles[0];
    return { key: m.view.textureKey, rotates: m.view.art.rotate, trail: !!m.view.art.trail };
  });
  autoShape.key === 'proj_auto' && autoShape.rotates && autoShape.trail
    ? pass('auto-attack bolt is an oriented pixel bolt with a trail')
    : fail(`auto bolt: ${JSON.stringify(autoShape)}`);

  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.nextSpawnAt = 0;
    g.enemyProjectiles.spawnVolley();
  });
  await page.mouse.move(980, 520);
  await page.keyboard.press('q');
  // Q has a cast window — wait for the bolt to actually spawn.
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').projectiles.missiles.length > 0,
    null,
    { timeout: 3000 },
  );
  const kinds = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const q = g.projectiles.missiles[0]?.projectile;
    const e = g.enemyProjectiles.missiles[0];
    return {
      q: q ? { r: q.radius, key: q.view.textureKey } : null,
      e: e ? { r: e.radius, key: e.view.textureKey, team: e.team, scale: e.view.sprite.scaleX } : null,
      auto: window.__balance.ATTACK.projectileRadius,
    };
  });
  kinds.q && kinds.e && kinds.q.key === 'proj_q' && /^proj_hostile/.test(kinds.e.key) && kinds.e.team === 'enemy' && kinds.e.r > kinds.auto
    ? pass(`three distinct projectile kinds (auto ${autoShape.key}, Q ${kinds.q.key}, hostile ${kinds.e.key} r${Math.round(kinds.e.r)})`)
    : fail(`projectile kinds: ${JSON.stringify(kinds)}`);

  // W is its own orb, not a recoloured Q.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cast.cancel(); g.cooldowns.reset();
  });
  await page.keyboard.press('w');
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').projectiles.missiles.some((m) => m.kind === 'w'),
    null,
    { timeout: 3000 },
  ).catch(() => {});
  const wKey = await page.evaluate(() => {
    const m = window.__warmup.scene.getScene('GameScene').projectiles.missiles.find((x) => x.kind === 'w');
    return m ? { key: m.projectile.view.textureKey, rotates: m.projectile.view.art.rotate } : null;
  });
  wKey && wKey.key === 'proj_w' && !wKey.rotates
    ? pass('W fires its own violet orb sprite')
    : fail(`W projectile: ${JSON.stringify(wKey)}`);

  // === 5. Battlefield + UI are built, and gameplay still reads ================
  section('5. Battlefield + UI are built, and gameplay still reads');
  const scene = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const bf = g.battlefield;
    return {
      ground: bf?.ground?.texture?.key ?? null,
      groundScale: bf?.ground?.scaleX,
      props: bf ? bf.props.length : 0,
      propsBelowUnits: bf ? bf.props.every((p) => p.depth < g.player.view.sprite.depth && p.depth < g.enemies[0].view.sprite.depth) : false,
      uiPanels: ui.children.list.filter((o) => o.type === 'Graphics').length,
      art: window.__theme.art.scale,
    };
  });
  scene.ground === 'battlefield_ground' && scene.groundScale === scene.art
    ? pass(`battlefield ground painted at ${scene.art}x pixel scale`)
    : fail(`battlefield ground: ${JSON.stringify(scene)}`);
  // Decoration must stay sparse so it never competes with combat cues.
  scene.props > 0 && scene.props <= 10 && scene.propsBelowUnits
    ? pass(`${scene.props} decorative props (sparse), all drawn beneath every combatant`)
    : fail(`props: ${scene.props}, below units: ${scene.propsBelowUnits}`);
  scene.uiPanels >= 3 ? pass(`HUD grouped onto ${scene.uiPanels} panels`) : fail('HUD panels missing');

  // === Looks: the champion's body plus the profile's cosmetics, composed per look ====
  section('Looks');
  const lookOf = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const img = g.player.view.sprite;
    return { key: img.texture.key as string, rows: img.height as number, originY: img.originY as number, headPx: g.player.headPx as number };
  });
  await atRest();
  const crowned = await lookOf();
  /** Equip `equipped` and start a new round wearing it. */
  const restartAs = async (equipped: Record<string, string>) => {
    const round = await page.evaluate((equipped) => {
      window.__profile.update((d) => { d.equipped = equipped; });
      const g = window.__warmup.scene.getScene('GameScene');
      const was = g.getHudState().round;
      g.restartRound();
      return was;
    }, equipped);
    await page.waitForFunction((was) => window.__warmup.scene.getScene('GameScene').getHudState().round !== was, round);
    await page.waitForTimeout(150);
  };
  await restartAs({ hat: 'none' });
  const bare = await lookOf();
  /^player_magicboy_idle_crown-base$/.test(crowned.key) && crowned.rows === 18 && crowned.headPx === 12
    ? pass(`the default look is Magic Boy in the crown: ${crowned.key}, 18 rows, 12px of hat`)
    : fail(`crowned: ${JSON.stringify(crowned)}`);
  /^player_magicboy_idle_none-base$/.test(bare.key) && bare.rows === 14 && bare.headPx === 0 && bare.originY < crowned.originY
    ? pass(`taking the crown off composes a shorter frame under its own key: ${bare.key}, 14 rows`)
    : fail(`bare: ${JSON.stringify(bare)}`);
  await restartAs({});

  await finish();
});
