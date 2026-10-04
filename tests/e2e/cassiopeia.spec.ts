import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('cassiopeia: picked from the profile, slow autos, Q blast + poison ticks, W cloud wall, E twin fang, R gaze by facing, R cooldown from poisoned fangs, speed per level', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400, { champion: 'cassiopeia' });

  const cfg = await page.evaluate(() => ({
    Q: window.__cassiopeia.Q, W: window.__cassiopeia.W, E: window.__cassiopeia.E, R: window.__cassiopeia.R,
    POISON: window.__cassiopeia.POISON, LEVELS: window.__cassiopeia.LEVELS, STATS: window.__cassiopeia.STATS,
    AUTO: window.__cassiopeia.AUTO, ezrealRange: window.__balance.ATTACK.range,
  }));
  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return {
      champion: g.getHudState().champion as string,
      now: g.clock.now as number,
      base: g.attacks.baseCooldownMs as number,
      attackRange: g.attackRange as number,
      cd: { q: g.cooldowns.remainingMs('q'), w: g.cooldowns.remainingMs('w'), e: g.cooldowns.remainingMs('e'), r: g.cooldowns.remainingMs('r') },
      zones: g.kit.zones.zones.length as number,
      clouds: g.kit.zones.clouds.length as number,
      bolts: g.kit.bolts.length as number,
      stats: g.kit.stats() as Record<string, number>,
      enemies: g.director.enemies.map((e) => ({
        type: e.archetype, x: e.x, y: e.y, hp: e.hp, active: e.active, heading: e.heading, slow: e.slowFactor, dazed: g.clock.now < e.dazedUntil,
        poisoned: e.hasStatus('cassiopeia.poison', g.clock.now), petrified: e.hasStatus('cassiopeia.petrify', g.clock.now),
      })),
      player: { x: g.player.x, y: g.player.y, speed: g.player.moveSpeed, level: g.progression.level },
      slots: window.__warmup.scene.getScene('UIScene').abilityBar.slots.map((s) => s.keyText.text),
    };
  });
  /** A quiet arena: one parked Pursuer with `hp` pips at (x, y), nothing else, every ability ready. */
  const stage = (x: number, y: number, hp = 3, heading = Math.PI) => page.evaluate(({ x, y, hp, heading }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.hostileSpells.clear(); g.kit.clear();
    for (const e of d.enemies) e.active = false;
    d.enemies.length = 0;
    d.currentPhase = 'wave';
    const e = d.spawnEnemy('pursuer');
    e.x = x; e.y = y; e.hp = hp; e.maxHp = hp;
    e.heading = heading; e.hadHeading = true;            // arrival would set it toward her; we preset ours
    e.nextAttackAt = Number.POSITIVE_INFINITY; e.canDash = false; e.speedFraction = 0;   // parked: no chase
    e.goalX = x; e.goalY = y; e.nextPlanAt = Number.POSITIVE_INFINITY;
    d.enemies.push(e);
    g.player.x = 640; g.player.y = 360; g.player.stop(); g.player.hp = 100;
    g.cast.cancel(); g.cooldowns.reset();
    return { hp: e.hp };
  }, { x, y, hp, heading });

  // === 1. Who, and the auto cycle =============================================
  section('1. Champion');
  {
    const s = await G();
    s.champion === 'cassiopeia' && s.slots.join('') === 'QWERF' && Math.abs(s.base - cfg.LEVELS.baseAttackCooldownMs) < 1
      ? pass(`playing Cassiopeia: Q W E R + F on the bar, ${s.base}ms auto cycle at level 1`)
      : fail(`champion: ${JSON.stringify({ champion: s.champion, slots: s.slots, base: s.base })}`);
    s.attackRange === cfg.AUTO.range && cfg.AUTO.range < cfg.ezrealRange && cfg.Q.range < 450 && cfg.E.range < cfg.ezrealRange
      ? pass(`a battle mage's reach: auto ${s.attackRange} (Ezreal's ${cfg.ezrealRange}), Q ${cfg.Q.range}, E ${cfg.E.range}, W ${cfg.W.range}`)
      : fail(`ranges: ${JSON.stringify({ auto: s.attackRange, cfg: cfg.AUTO, q: cfg.Q.range, e: cfg.E.range })}`);
  }

  // === 2. Q: a delayed blast, then poison ticks ===============================
  section('2. Q');
  await stage(900, 360, 4);
  await page.mouse.move(900, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(cfg.Q.castTimeMs + 60);
  const placed = await G();
  placed.zones === 1 && placed.enemies[0].hp === 4 && placed.cd.q > 0
    ? pass('Q places a telegraphed blast at the cursor; nothing lands yet')
    : fail(`Q placed: ${JSON.stringify({ zones: placed.zones, hp: placed.enemies[0]?.hp, cd: placed.cd })}`);
  await page.waitForTimeout(cfg.Q.delayMs + 120);
  const landed = await G();
  landed.zones === 0 && landed.enemies[0].hp === 3 && landed.enemies[0].poisoned
    ? pass(`the blast lands ${cfg.Q.delayMs}ms later: one pip, and poison`)
    : fail(`Q landed: ${JSON.stringify(landed.enemies[0])}`);
  await page.waitForTimeout(cfg.POISON.tickMs + 150);
  const tick1 = await G();
  await page.waitForTimeout(cfg.POISON.tickMs);
  const tick2 = await G();
  await page.waitForTimeout(cfg.POISON.tickMs);
  const tick3 = await G();
  tick1.enemies[0].hp === 2 && tick2.enemies[0].hp === 1 && tick3.enemies[0].hp === 1 && !tick3.enemies[0].poisoned && tick3.stats.poisonTicks === 2
    ? pass(`poison ticks a pip every ${cfg.POISON.tickMs}ms for ${cfg.POISON.durationMs}ms, then lapses`)
    : fail(`ticks: ${JSON.stringify({ t1: tick1.enemies[0].hp, t2: tick2.enemies[0].hp, t3: tick3.enemies[0], stats: tick3.stats })}`);

  // Q is clamped to its range: aimed far away, it lands at most Q.range from her.
  await stage(900, 360, 3);
  await page.mouse.move(1270, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(cfg.Q.castTimeMs + 60);
  const far = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const z = g.kit.zones.zones[0];
    return z ? { x: z.x, y: z.y, px: g.player.x } : null;
  });
  far && Math.abs(far.x - far.px - cfg.Q.range) < 1
    ? pass(`a far Q lands at its max range (${cfg.Q.range}px)`)
    : fail(`range clamp: ${JSON.stringify(far)}`);

  // A spellcaster can't be poisoned to death from above one pip: tagging it with Q and running doesn't kill it.
  const caster = (hp: number) => page.evaluate((hp) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    g.enemyProjectiles.clear(); g.hostileSpells.clear(); g.kit.clear();
    for (const e of d.enemies) e.active = false;
    d.enemies.length = 0;
    d.currentPhase = 'wave';
    const e = d.spawnEnemy('sovereign');
    e.x = 1000; e.y = 200; e.hp = hp; e.maxHp = hp;
    d.enemies.push(e);
    g.player.x = 640; g.player.y = 360; g.player.stop(); g.player.hp = 100;
    g.kit.poison(e);
  }, hp);
  const sovereign = async () => (await G()).enemies.find((e) => e.type === 'sovereign');
  await caster(2);
  await page.waitForTimeout(cfg.POISON.durationMs + 300);
  const worn = await sovereign();
  worn && worn.active && worn.hp === 1 && !worn.poisoned
    ? pass('a spellcaster poisoned at 2 pips is worn down to 1, and the poison stops there')
    : fail(`spellcaster at 2: ${JSON.stringify(worn)}`);
  await caster(1);
  await page.waitForTimeout(cfg.POISON.tickMs + 300);
  const finished = await sovereign();
  !finished || !finished.active ? pass('poisoned at 1 pip, the poison may kill it') : fail(`spellcaster at 1: ${JSON.stringify(finished)}`);

  // === 3. W: a cloud that slows and poisons, no pip of its own ================
  section('3. W');
  await stage(800, 360, 3);
  await page.mouse.move(800, 360);
  await page.keyboard.press('w');
  await page.waitForTimeout(cfg.W.castTimeMs + cfg.W.tickMs + 80);
  const cloud = await G();
  cloud.clouds === 1 && cloud.enemies[0].hp === 3 && cloud.enemies[0].poisoned && Math.abs(cloud.enemies[0].slow - (1 - cfg.W.slowFraction)) < 1e-6
    ? pass(`W lingers: inside it the enemy is slowed ×${(1 - cfg.W.slowFraction).toFixed(2)} and poisoned, no pip from the cloud itself`)
    : fail(`W: ${JSON.stringify({ clouds: cloud.clouds, e: cloud.enemies[0] })}`);
  await page.evaluate(() => { const e = window.__warmup.scene.getScene('GameScene').director.enemies[0]; e.x = 1100; e.goalX = 1100; });
  await page.waitForTimeout(cfg.W.slowMs + 150);
  const left = await G();
  left.enemies[0].slow === 1 && !left.enemies[0].poisoned && left.enemies[0].hp === 3
    ? pass('leaving the cloud, the slow and the poison lapse, with no pip: W poisons only while you stand in it')
    : fail(`after leaving: ${JSON.stringify(left.enemies[0])}`);
  await page.waitForTimeout(cfg.W.durationMs);
  (await G()).clouds === 0 ? pass(`the cloud expires after ${cfg.W.durationMs}ms`) : fail('cloud still there');

  // The clouds are thrown: bolts lobbed from her body, and nothing happens until they land.
  await stage(800, 360, 3);
  await page.mouse.move(800, 360);
  await page.keyboard.press('w');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.zones.clouds.length === 1, null, { timeout: 2000 });
  const thrown = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const c = g.kit.zones.clouds[0];
    return {
      from: c.thrownFrom, px: g.player.x, py: g.player.y, inFlight: c.landsAt > g.clock.now,
      flightMs: c.landsAt - c.placedAt, poisoned: g.director.enemies[0].hasStatus('cassiopeia.poison', g.clock.now),
    };
  });
  thrown.from && Math.abs(thrown.from.x - thrown.px) < 1 && Math.abs(thrown.from.y - thrown.py) < 1 && thrown.inFlight && !thrown.poisoned
    ? pass(`W's bolts leave her body and land ${Math.round(thrown.flightMs)}ms later; nothing is poisoned while they fly`)
    : fail(`W thrown: ${JSON.stringify(thrown)}`);
  await page.waitForTimeout(thrown.flightMs + 80);
  (await G()).enemies[0].poisoned ? pass('once the bolts land, the cloud takes hold') : fail('not poisoned after the bolts landed');

  // W-Flash: Flash during the cast and W comes out of her where she lands, aimed the same way.
  await stage(1100, 600, 3);
  await page.mouse.move(800, 360);
  await page.keyboard.press('w');
  await page.mouse.move(640, 540);            // 180px down, inside Flash range
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.zones.clouds.length === 1, null, { timeout: 2000 });
  const wf = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const c = g.kit.zones.clouds[0];
    return { x: c.x, y: c.y, from: c.thrownFrom, px: g.player.x, py: g.player.y, flashCd: g.cooldowns.remainingMs('flash') };
  });
  wf.flashCd > 0 && Math.abs(wf.py - 540) < 1 && Math.abs(wf.x - (wf.px + 160)) < 1 && Math.abs(wf.y - wf.py) < 1 &&
    wf.from && Math.abs(wf.from.y - wf.py) < 1
    ? pass(`W-Flash: Flash mid-cast and the bolts leave from where she lands, the cloud 160px ahead of her as aimed`)
    : fail(`W-Flash: ${JSON.stringify(wf)}`);

  // The field is a wall across her aim, not a disc: an enemy off to the side of
  // the aim point is inside, one the same distance straight behind it is not.
  await stage(800, 440, 3);                   // 80px to the side of the aim point
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const behind = d.spawnEnemy('pursuer');   // 80px past the aim point, along her aim
    behind.x = 880; behind.y = 360; behind.hp = 3; behind.maxHp = 3;
    behind.nextAttackAt = Number.POSITIVE_INFINITY; behind.canDash = false; behind.speedFraction = 0;
    behind.goalX = 880; behind.goalY = 360; behind.nextPlanAt = Number.POSITIVE_INFINITY;
    d.enemies.push(behind);
  });
  await page.mouse.move(800, 360);
  await page.keyboard.press('w');
  await page.waitForTimeout(cfg.W.castTimeMs + cfg.W.tickMs + 80);
  const wall = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const c = g.kit.zones.clouds[0];
    const xs = c ? c.puffs.map((p) => p.x) : [];
    const ys = c ? c.puffs.map((p) => p.y) : [];
    return {
      puffs: c ? c.puffs.length : 0,
      across: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
      along: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      side: g.director.enemies[0].hasStatus('cassiopeia.poison', g.clock.now),
      behind: g.director.enemies[1].hasStatus('cassiopeia.poison', g.clock.now),
    };
  });
  wall.puffs === cfg.W.puffs && wall.across > wall.along * 3 && wall.side && !wall.behind
    ? pass(`W lays ${wall.puffs} clouds in a wall across her aim (${Math.round(wall.across)}px across, ${Math.round(wall.along)}px deep): the side is inside, straight behind is not`)
    : fail(`W shape: ${JSON.stringify(wall)}`);

  // === 4. E: point-and-click, two pips on a poisoned target ===================
  section('4. E');
  await stage(900, 360, 4);
  await page.mouse.move(900, 360);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0]?.hp < 4, null, { timeout: 2000 });
  const fang1 = await G();
  fang1.enemies[0].hp === 3 && fang1.stats.fangs === 1 && fang1.cd.e > 0 && fang1.cd.e <= cfg.E.cooldownMs
    ? pass(`E bites the enemy under the cursor for one pip (${Math.round(fang1.cd.e)}ms cooldown)`)
    : fail(`E: ${JSON.stringify({ e: fang1.enemies[0], stats: fang1.stats, cd: fang1.cd })}`);
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.kit.poison(g.director.enemies[0]); g.cooldowns.reset(); });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0]?.hp < 3, null, { timeout: 2000 });
  await page.waitForTimeout(50);
  const fang2 = await G();
  fang2.enemies[0].hp === 1 && fang2.stats.fangsOnPoisoned === 1
    ? pass('on a poisoned target E takes two pips')
    : fail(`poisoned E: ${JSON.stringify({ e: fang2.enemies[0], stats: fang2.stats })}`);
  // Out of range: the cursor is on an enemy, but too far away, so no cast and no cooldown.
  await stage(1200, 360, 3);
  await page.mouse.move(1200, 360);
  await page.keyboard.press('e');
  await page.waitForTimeout(cfg.E.castTimeMs + 100);
  const none = await G();
  none.cd.e === 0 && none.bolts === 0 && none.enemies[0].hp === 3
    ? pass(`on an enemy beyond ${cfg.E.range}px, E doesn't cast and keeps its cooldown`)
    : fail(`E out of range: ${JSON.stringify({ cd: none.cd, bolts: none.bolts })}`);
  // Point-and-click: an enemy in range but not under the cursor is not a target.
  await stage(900, 360, 3);
  await page.mouse.move(900, 430);            // 70px off its centre: beside it, not on it
  await page.keyboard.press('e');
  await page.waitForTimeout(cfg.E.castTimeMs + 100);
  const beside = await G();
  beside.cd.e === 0 && beside.bolts === 0 && beside.enemies[0].hp === 3
    ? pass('with the cursor beside an enemy in range, not on it, E does not cast')
    : fail(`E beside: ${JSON.stringify({ cd: beside.cd, bolts: beside.bolts, hp: beside.enemies[0].hp })}`);

  // === 5. R: the cone reads facing ============================================
  section('5. R');
  await stage(820, 300, 3, Math.PI);          // heading left: toward her at (640, 360)
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const away = d.spawnEnemy('pursuer');       // heading right: away from her
    away.x = 820; away.y = 420; away.hp = 3; away.maxHp = 3; away.heading = 0; away.hadHeading = true;
    away.nextAttackAt = Number.POSITIVE_INFINITY; away.canDash = false; away.speedFraction = 0;
    away.goalX = 820; away.goalY = 420; away.nextPlanAt = Number.POSITIVE_INFINITY;
    d.enemies.push(away);
  });
  await page.mouse.move(900, 360);
  await page.keyboard.press('r');
  // She's rooted until the gaze strikes: a move order mid-cast waits for it.
  await page.mouse.click(400, 200, { button: 'right' });        // clear of the HUD panels
  await page.waitForTimeout(cfg.R.castTimeMs / 2);
  const midR = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { x: g.player.x, y: g.player.y, casting: g.cast.castingAbility, hp: g.director.enemies.map((e) => e.hp) };
  });
  midR.casting === 'r' && Math.abs(midR.x - 640) < 1 && Math.abs(midR.y - 360) < 1 && midR.hp.every((h) => h === 3)
    ? pass(`R: ${cfg.R.castTimeMs}ms cast, rooted throughout; a move order waits and nothing is hit yet`)
    : fail(`R mid-cast: ${JSON.stringify(midR)}`);
  await page.waitForTimeout(cfg.R.castTimeMs / 2 + 120);
  const gaze = await G();
  Math.hypot(gaze.player.x - 640, gaze.player.y - 360) > 1
    ? pass('the gaze strikes and the waiting move order goes')
    : fail(`no move after R: ${JSON.stringify(gaze.player)}`);
  const [facing, away] = gaze.enemies;
  facing.hp === 2 && facing.dazed && facing.petrified && facing.slow === 1 &&
    away.hp === 2 && !away.dazed && Math.abs(away.slow - (1 - cfg.R.slowFraction)) < 1e-6 && gaze.stats.gazeStuns === 1
    ? pass('R: one pip to both; the enemy facing her is petrified, the one walking away is slowed')
    : fail(`R: ${JSON.stringify({ facing, away, stats: gaze.stats })}`);
  gaze.cd.r > cfg.R.cooldownMs * 0.9 ? pass(`R on its ${cfg.R.cooldownMs}ms cooldown`) : fail(`R cd: ${gaze.cd.r}`);
  await page.evaluate(() => window.__warmup.scene.getScene('GameScene').combat.stageCleared());
  (await G()).cd.r > cfg.R.cooldownMs * 0.8 ? pass('a stage clear no longer gives R back') : fail('R refreshed by the stage clear');
  await page.waitForTimeout(cfg.R.stunMs + 100);
  (await G()).enemies[0].dazed === false ? pass(`the petrify wears off after ${cfg.R.stunMs}ms`) : fail('still petrified');

  // Instead, every Twin Fang on a poisoned enemy takes time off R.
  await stage(800, 360, 4);
  const rFang0 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.start('r');
    g.kit.poison(g.director.enemies[0]);
    return { r: g.cooldowns.remainingMs('r'), now: g.clock.now };
  });
  await page.mouse.move(800, 360);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0]?.hp < 4, null, { timeout: 2000 });
  const rFang1 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { r: g.cooldowns.remainingMs('r'), now: g.clock.now };
  });
  const rFangShaved = rFang0.r - rFang1.r - (rFang1.now - rFang0.now);
  Math.abs(rFangShaved - cfg.R.poisonedFangCooldownReductionMs) < 30
    ? pass(`a poisoned Twin Fang takes ${Math.round(rFangShaved)}ms off R's cooldown`)
    : fail(`fang on R: ${JSON.stringify({ rFang0, rFang1, rFangShaved })}`);

  // === 6. Heading comes from movement ========================================
  section('6. Heading');
  const moved = await page.evaluate(async () => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    for (const e of d.enemies) e.active = false;
    d.enemies.length = 0;
    const e = d.spawnEnemy('basic');                 // a basic walks to its goal; a Pursuer chases
    e.x = 900; e.y = 360; e.heading = 0; e.hadHeading = true; e.canSpit = false;
    e.goalX = 400; e.goalY = 360; e.nextPlanAt = Number.POSITIVE_INFINITY;   // walk left, toward her
    d.enemies.push(e);
    await new Promise((r) => setTimeout(r, 300));
    return { heading: e.heading, x: e.x };
  });
  moved.x < 900 && Math.abs(Math.cos(moved.heading) + 1) < 0.2
    ? pass('an enemy walking toward her heads her way (facing is read from movement)')
    : fail(`heading: ${JSON.stringify(moved)}`);

  // === 7. Serpentine Grace ===================================================
  section('7. Passive');
  const speed1 = (await G()).player.speed;
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.progression.addXp(1e6, g.clock.now); });
  const sped = await G();
  Math.abs(speed1 - cfg.STATS.moveSpeed) < 1e-6 && sped.player.level === 18 &&
    Math.abs(sped.player.speed - cfg.STATS.moveSpeed * (1 + cfg.LEVELS.moveSpeedPerLevel * 17)) < 1e-6
    ? pass(`move speed ${speed1} at level 1, ${sped.player.speed.toFixed(1)} at 18 (+${cfg.LEVELS.moveSpeedPerLevel * 100}% per level)`)
    : fail(`passive: ${JSON.stringify({ speed1, sped: sped.player })}`);
  await finish();
});
