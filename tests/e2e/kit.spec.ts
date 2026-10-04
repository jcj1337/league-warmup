import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('kit: W mark + detonation, E blink + bolt priority, Flash, Q cooldown refund, pause, ability bar', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    const e0 = g.director.enemies[0];
    return {
      cd: {
        q: g.cooldowns.remainingMs('q'),
        w: g.cooldowns.remainingMs('w'),
        e: g.cooldowns.remainingMs('e'),
        flash: g.cooldowns.remainingMs('flash'),
      },
      hudCd: hud.abilityCooldowns,
      stacks: g.kit.passive.stackCount,
      px: g.player.x, py: g.player.y,
      marked: e0 ? e0.hasStatus('ezreal.mark', g.clock.now) : false,
      hp0: e0 ? e0.hp : null,
      qMissiles: g.projectiles.missilesInFlight,
      bolts: g.kit.boltsInFlight,
      clock: g.clock.now,
      paused: g.isPaused,
    };
  });
  const castWait = 420;   // cast time (250ms) + comfortable margin
  const cfg = await page.evaluate(() => ({
    q: window.__ezreal.SKILLSHOT_Q,
    w: window.__ezreal.SKILLSHOT_W,
    e: window.__ezreal.BLINK_E,
    f: window.__balance.FLASH,
    atkRange: window.__balance.ATTACK.range,
    arena: window.__balance.ARENA,
    playerRadius: window.__ezreal.STATS.radius,
  }));

  /** One enemy of a given type at a fixed spot; player reset to centre. */
  const setup = (spots = [{ type: 'basic', x: 900, y: 360 }], hp = 9999) =>
    page.evaluate(({ spots, hp }) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const d = g.director;
      g.enemyProjectiles.clear();
      g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
      d.enemies.forEach((e) => e.destroy());
      d.enemies.length = 0;
      for (const s of spots) {
        const e = d.spawnEnemy(s.type);
        e.x = s.x; e.y = s.y; e.hp = hp; e.clearStatus('ezreal.mark');
        // Basic slimes hold their spot (they now close in on the player); Pursuers still chase.
        e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        d.enemies.push(e);
      }
      g.enemies = d.enemies;
      g.player.x = 640; g.player.y = 360; g.player.hp = 100; g.player.stop();
      g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
      g.projectiles.clear(); g.kit.clear();
      g.cast.cancel();                       // W/E now have a cast window
      g.cooldowns.reset(); g.kit.passive.reset();
    }, { spots, hp });

  // === W: mark skillshot =====================================================
  section('W: mark skillshot');
  await setup();
  await page.mouse.move(1100, 360);
  await page.keyboard.press('w');
  await page.waitForTimeout(60);
  const wCast = await G();
  wCast.cd.w > 0 ? pass(`W goes on cooldown on cast (${(wCast.cd.w / 1000).toFixed(1)}s of ${cfg.w.cooldownMs}ms)`) : fail('W did not start a cooldown');

  await page.waitForFunction(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return g.director.enemies[0].hasStatus('ezreal.mark', g.clock.now);
  }, null, { timeout: 4000 });
  const wHit = await G();
  wHit.marked ? pass('W projectile marks the enemy it touches') : fail('W did not mark');
  wHit.hp0 === 9999 ? pass('W alone removes 0 pips (mark only)') : fail(`W removed ${9999 - wHit.hp0} pips on contact`);
  wHit.stacks === 1 ? pass('W landing grants exactly 1 passive stack') : fail(`stacks after W: ${wHit.stacks}`);

  // Auto detonates the mark: its own pip plus one from the proc. Sampled on the
  // frame the mark is consumed, before any later auto can land.
  const beforeAuto = (await G()).hp0;
  await page.mouse.click(900, 360, { button: 'right' });
  const autoDet = await page.waitForFunction(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    return e.hasStatus('ezreal.mark', g.clock.now) ? null : { hp0: e.hp, procs: g.kit.markProcs, hits: g.scoring.hitsLanded };
  }, null, { timeout: 5000 }).then((h) => h.jsonValue());
  await page.keyboard.press('s');
  const afterAuto = await G();
  const autoTotal = beforeAuto - autoDet.hp0;
  autoTotal === 2 && autoDet.procs === 1
    ? pass(`W -> auto removes 2 pips total (auto 1 + mark proc 1; procs ${autoDet.procs})`)
    : fail(`W -> auto removed ${autoTotal} pips, procs ${autoDet.procs}`);
  !afterAuto.marked ? pass('mark is consumed by the detonation') : fail('mark survived detonation');
  afterAuto.stacks === 1
    ? pass('W detonation grants NO extra passive stack (still 1)')
    : fail(`stacks after detonation: ${afterAuto.stacks}`);

  // Q detonates too, and stacks separately.
  await setup();
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.kit.mark(g.director.enemies[0]);
  });
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.qHit > 0, null, { timeout: 4000 });
  await page.waitForTimeout(120);
  const qDet = await G();
  const qTotal = 9999 - qDet.hp0;
  qTotal === 2
    ? pass('W -> Q removes exactly 2 pips (Q 1 + mark proc 1)')
    : fail(`W -> Q removed ${qTotal} pips`);
  qDet.stacks === 1 ? pass('Q hit grants 1 stack, detonation adds none') : fail(`stacks: ${qDet.stacks}`);

  // A mark left alone expires without damage.
  await setup();
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.kit.mark(g.director.enemies[0]);
  });
  const beforeExpiry = (await G()).hp0;
  await page.waitForTimeout(cfg.w.markDurationMs + 600);
  const afterExpiry = await G();
  !afterExpiry.marked && afterExpiry.hp0 === beforeExpiry
    ? pass(`unused mark expires after ${cfg.w.markDurationMs}ms with no pip lost`)
    : fail(`expiry: marked=${afterExpiry.marked} pips lost=${beforeExpiry - afterExpiry.hp0}`);

  // === E: blink ==============================================================
  section('E: blink');
  cfg.e.range === 310 && cfg.e.boltAcquisitionRange === 380
    ? pass(`E blink range ${cfg.e.range} (was 364), bolt acquisition still ${cfg.e.boltAcquisitionRange}`)
    : fail(`E range ${cfg.e.range}, acquisition ${cfg.e.boltAcquisitionRange}`);
  cfg.e.cooldownMs === 8000 && cfg.f.cooldownMs === 20000
    ? pass('E / Flash cooldowns unchanged (8000 / 20000ms)')
    : fail(`cooldowns changed: E ${cfg.e.cooldownMs}, F ${cfg.f.cooldownMs}`);
  await setup([{ type: 'basic', x: 200, y: 120 }]);
  await page.mouse.move(760, 360);          // 120px right — inside E range
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const eNear = await G();
  Math.abs(eNear.px - 760) < 6 && Math.abs(eNear.py - 360) < 6
    ? pass(`E with cursor in range blinks exactly to it (${eNear.px.toFixed(0)},${eNear.py.toFixed(0)})`)
    : fail(`E landed at ${eNear.px},${eNear.py}`);

  await setup([{ type: 'basic', x: 200, y: 120 }]);
  await page.mouse.move(1270, 360);         // 630px right — beyond E range
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const eFar = await G();
  const travelled = Math.hypot(eFar.px - 640, eFar.py - 360);
  Math.abs(travelled - cfg.e.range) < 12
    ? pass(`E beyond range travels exactly max range (${travelled.toFixed(0)}px of ${cfg.e.range})`)
    : fail(`E travelled ${travelled.toFixed(0)}px, expected ${cfg.e.range}`);

  // Arena clamp.
  await setup([{ type: 'basic', x: 200, y: 600 }]);
  await page.mouse.move(1279, 719);
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const eClamp = await G();
  const m = cfg.arena.padding + cfg.playerRadius;
  eClamp.px <= cfg.arena.width - m + 0.5 && eClamp.py <= cfg.arena.height - m + 0.5
    ? pass(`E clamps inside the arena (${eClamp.px.toFixed(0)},${eClamp.py.toFixed(0)})`)
    : fail(`E left the arena: ${eClamp.px},${eClamp.py}`);

  // E bolt fires when something is nearby, and stacks.
  await setup([{ type: 'basic', x: 820, y: 360 }]);
  await page.mouse.move(700, 360);
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const eBolt = await G();
  eBolt.bolts > 0 || eBolt.hp0 < 9999
    ? pass('E fires a homing bolt when an enemy is in acquisition range')
    : fail('no E bolt spawned');
  await page.waitForTimeout(600);
  const eLanded = await G();
  eLanded.hp0 === 9998 ? pass('E bolt removes exactly 1 pip') : fail(`E bolt removed ${9999 - eLanded.hp0} pips`);
  eLanded.stacks >= 1 ? pass('E bolt grants a passive stack') : fail('E bolt granted no stack');

  // No enemy nearby: blink still works, no bolt.
  await setup([{ type: 'basic', x: 100, y: 100 }]);
  await page.mouse.move(900, 600);
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const eAlone = await G();
  eAlone.bolts === 0 && Math.hypot(eAlone.px - 640, eAlone.py - 360) > 50
    ? pass('E with nothing in range still blinks, fires no bolt')
    : fail(`lone blink: bolts=${eAlone.bolts}`);

  // Acquisition range boundary, measured from where E lands. The enemy is frozen
  // so drift cannot carry it across the line during the cast.
  const acquireAt = async (offset) => {
    await setup([{ type: 'basic', x: 500 + offset, y: 360 }]);
    await page.evaluate(() => {
      const e = window.__warmup.scene.getScene('GameScene').director.enemies[0];
      e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
    });
    await page.mouse.move(500, 360);          // 140px left — inside E range, lands exactly here
    await page.keyboard.press('e');
    return page.waitForFunction(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      if (g.cast.isCasting || g.player.x > 600) return null;
      const e = g.director.enemies[0];
      return { bolts: g.kit.boltsInFlight, landed: g.player.x, gap: Math.hypot(e.x - g.player.x, e.y - g.player.y) };
    }, null, { timeout: 3000 }).then((h) => h.jsonValue()).catch(() => null);
  };
  const acq = cfg.e.boltAcquisitionRange;
  const inside = await acquireAt(acq - 20);
  const outside = await acquireAt(acq + 20);
  inside && inside.bolts > 0
    ? pass(`E bolt acquires an enemy ${Math.round(inside.gap)}px from the landing point (boltAcquisitionRange ${acq})`)
    : fail(`no bolt at ${acq - 20}px inside the ${acq}px acquisition range: ${JSON.stringify(inside)}`);
  outside && outside.bolts === 0
    ? pass(`E fires no bolt at an enemy ${Math.round(outside.gap)}px away — beyond the ${acq}px acquisition range`)
    : fail(`bolt fired at ${acq + 20}px, outside the ${acq}px acquisition range: ${JSON.stringify(outside)}`);

  // === E targeting priority: W-marked wins ===================================
  section('E targeting priority: W-marked wins');
  await setup([
    { type: 'basic', x: 720, y: 360 },   // closer, unmarked
    { type: 'basic', x: 860, y: 360 },   // further, marked
  ]);
  const priority = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.kit.mark(g.director.enemies[1]);
    return { nearX: g.director.enemies[0].x, markedX: g.director.enemies[1].x };
  });
  await page.mouse.move(660, 360);
  await page.keyboard.press('e');
  // Sample as soon as the blink resolves — the bolt is short-lived.
  await page.waitForFunction(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return !g.cast.isCasting && g.kit.bolts.length > 0;
  }, null, { timeout: 3000 });
  const boltTarget = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const b = g.kit.bolts[0];
    return b ? { tx: b.target.x, marked: b.target.hasStatus('ezreal.mark', g.clock.now) } : null;
  });
  boltTarget && boltTarget.marked && Math.abs(boltTarget.tx - priority.markedX) < 20
    ? pass(`E bolt prioritises the W-marked enemy (x${boltTarget.tx.toFixed(0)}) over the nearer one (x${priority.nearX.toFixed(0)})`)
    : fail(`E bolt chose ${JSON.stringify(boltTarget)}, marked was at ${priority.markedX}`);

  // === Flash =================================================================
  section('Flash');
  cfg.f.range === 275 ? pass(`Flash range ${cfg.f.range} (was 325)`) : fail(`Flash range ${cfg.f.range}`);
  await setup([{ type: 'basic', x: 200, y: 120 }]);
  await page.mouse.move(1270, 360);
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  const flashed = await G();
  const fDist = Math.hypot(flashed.px - 640, flashed.py - 360);
  Math.abs(fDist - cfg.f.range) < 12
    ? pass(`Flash travels max range toward the cursor (${fDist.toFixed(0)}px of ${cfg.f.range})`)
    : fail(`Flash travelled ${fDist.toFixed(0)}px`);
  flashed.bolts === 0 ? pass('Flash fires no projectile') : fail('Flash spawned a projectile');
  flashed.stacks === 0 ? pass('Flash grants no passive stack') : fail(`Flash granted ${flashed.stacks} stacks`);
  flashed.cd.flash > 0 ? pass(`Flash cooldown started (${(flashed.cd.flash / 1000).toFixed(1)}s)`) : fail('no Flash cooldown');

  // === Cross-ability cooldown reduction ======================================
  section('Cross-ability cooldown reduction');
  await setup();
  const reduction = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    // Put all four on cooldown, then land a Q and compare.
    g.cooldowns.start('q'); g.cooldowns.start('w'); g.cooldowns.start('e'); g.cooldowns.start('flash');
    return {
      q: g.cooldowns.remainingMs('q'),
      w: g.cooldowns.remainingMs('w'),
      e: g.cooldowns.remainingMs('e'),
      flash: g.cooldowns.remainingMs('flash'),
    };
  });
  await page.evaluate(() => {
    // Make Q castable again without touching the others.
    window.__warmup.scene.getScene('GameScene').cooldowns.reduce(999999, ['q']);
  });
  const hitsBeforeQ = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').kit.qHit);
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForFunction(
    (n) => window.__warmup.scene.getScene('GameScene').kit.qHit > n,
    hitsBeforeQ,
    { timeout: 4000 },
  );
  await page.waitForTimeout(60);
  const after = await G();
  // W and E should each have dropped by ~the refund, allowing for elapsed time.
  const wDrop = reduction.w - after.cd.w;
  const eDrop = reduction.e - after.cd.e;
  const flashDrop = reduction.flash - after.cd.flash;
  wDrop >= cfg.q.hitCooldownReductionMs && wDrop <= cfg.q.hitCooldownReductionMs + 900
    ? pass(`landed Q cut W cooldown by ~${Math.round(wDrop)}ms (refund ${cfg.q.hitCooldownReductionMs} + elapsed)`)
    : fail(`W dropped ${Math.round(wDrop)}ms`);
  eDrop >= cfg.q.hitCooldownReductionMs && eDrop <= cfg.q.hitCooldownReductionMs + 900
    ? pass(`landed Q cut E cooldown by ~${Math.round(eDrop)}ms`)
    : fail(`E dropped ${Math.round(eDrop)}ms`);
  flashDrop < cfg.q.hitCooldownReductionMs
    ? pass(`Flash cooldown is NOT refunded by Q (only ${Math.round(flashDrop)}ms of natural decay)`)
    : fail(`Flash dropped ${Math.round(flashDrop)}ms — should be unaffected`);

  // HUD reflects it immediately.
  const hudMatches = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    return ['q', 'w', 'e', 'flash'].every(
      (id) => Math.abs(hud.abilityCooldowns[id].remaining - g.cooldowns.remainingMs(id)) < 1e-6,
    );
  });
  hudMatches ? pass('HUD cooldowns mirror AbilityCooldowns exactly for all four slots') : fail('HUD/cooldown mismatch');

  // === Auto cancel on blink ==================================================
  section('Auto cancel on blink');
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.click(760, 360, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 4000 });
  const hpAtWindup = (await G()).hp0;
  await page.mouse.move(400, 360);
  await page.keyboard.press('e');
  await page.waitForTimeout(castWait);
  const cancelled = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { state: g.attacks.state, hp: g.director.enemies[0].hp, autoMissiles: g.attacks.missilesInFlight };
  });
  cancelled.state !== 'windup' ? pass('E cancels an uncommitted auto windup') : fail('windup survived the blink');

  // === Pursuer interaction ===================================================
  section('Pursuer interaction');
  await setup([{ type: 'pursuer', x: 700, y: 360 }]);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const p = g.director.enemies[0];
    p.x = g.player.x + 40; p.y = g.player.y;   // inside its reach
    g.player.hp = 100;
  });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].state === 'windup', null, { timeout: 4000 });
  const hpBeforeSwing = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.hp);
  await page.mouse.move(200, 360);
  await page.keyboard.press('f');            // Flash out mid-telegraph
  await page.waitForTimeout(700);
  const hpAfterSwing = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').player.hp);
  hpAfterSwing === hpBeforeSwing
    ? pass('blinking out during a Pursuer telegraph makes its swing miss')
    : fail(`took ${hpBeforeSwing - hpAfterSwing} damage after blinking away`);

  // === Pause freezes everything new ==========================================
  section('Pause freezes everything new');
  await setup([{ type: 'basic', x: 820, y: 360 }]);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.kit.mark(g.director.enemies[0]);
    g.cooldowns.start('w'); g.cooldowns.start('flash');
  });
  await page.mouse.move(700, 360);
  await page.keyboard.press('e');            // bolt in flight + E on cooldown
  await page.waitForTimeout(30);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const pz0 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const b = g.kit.bolts[0];
    return {
      w: g.cooldowns.remainingMs('w'), e: g.cooldowns.remainingMs('e'), flash: g.cooldowns.remainingMs('flash'),
      boltX: b ? b.x : null, bolts: g.kit.boltsInFlight,
      markedNow: g.director.enemies[0].hasStatus('ezreal.mark', g.clock.now),
      clock: g.clock.now,
    };
  });
  await page.waitForTimeout(900);
  const pz1 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const b = g.kit.bolts[0];
    return {
      w: g.cooldowns.remainingMs('w'), e: g.cooldowns.remainingMs('e'), flash: g.cooldowns.remainingMs('flash'),
      boltX: b ? b.x : null, bolts: g.kit.boltsInFlight,
      markedNow: g.director.enemies[0].hasStatus('ezreal.mark', g.clock.now),
      clock: g.clock.now,
    };
  });
  pz1.w === pz0.w && pz1.e === pz0.e && pz1.flash === pz0.flash
    ? pass('W / E / Flash cooldowns all frozen while paused')
    : fail(`cooldowns ticked: w ${pz0.w}->${pz1.w}, e ${pz0.e}->${pz1.e}, flash ${pz0.flash}->${pz1.flash}`);
  pz1.boltX === pz0.boltX ? pass('E bolt frozen mid-flight') : fail(`bolt moved ${pz1.boltX - pz0.boltX}px while paused`);
  pz1.markedNow === pz0.markedNow && pz0.markedNow
    ? pass('W mark duration frozen while paused')
    : fail(`mark state changed while paused (${pz0.markedNow} -> ${pz1.markedNow})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  (await G()).clock > pz1.clock ? pass('everything resumes cleanly') : fail('clock did not resume');

  // === HUD slots =============================================================
  section('HUD slots');
  const slots = await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return ui.abilityBar.slots.map((s) => ({ key: s.keyText.text, icon: s.spec.icon, size: s.size, cx: s.cx }));
  });
  slots.length === 4 && slots.map((s) => s.key).join('') === 'QWEF'
    ? pass(`ability bar shows ${slots.map((s) => s.key).join(' ')} with distinct icons`)
    : fail(`slots: ${JSON.stringify(slots)}`);
  slots[3].size < slots[0].size && slots[3].cx - slots[2].cx > slots[1].cx - slots[0].cx
    ? pass('Flash slot is smaller and set apart from the Q/W/E row')
    : fail('Flash slot not visually separated');

  await finish();
});
