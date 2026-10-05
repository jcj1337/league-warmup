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
      streak: g.kit.catchStreak as number,
      shown: g.kit.heldView.shown as number,
      drops: g.kit.drops.map((d) => ({ x: d.x, y: d.y, state: d.state, landsAt: d.landsAt })),
      whirls: g.kit.whirls.length as number,
      stats: g.kit.stats() as Record<string, number>,
      kitScore: g.scoring.scoreFrom.kit as number,
      rows: g.kit.statRows().length as number,
      gems: { stacks: hud.passiveStacks as number, max: hud.passiveMaxStacks as number },
      enemies: g.director.enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, active: e.active, slow: e.slowFactor })),
      player: { x: g.player.x, y: g.player.y, speed: g.player.moveSpeed, hp: g.player.hp as number },
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
  /**
   * Throw the axe in hand at the first enemy. Once it is in the air the attack order is dropped and, with `dx`,
   * he is sent walking `dx` px to the side, so that is his move order as the axe hits.
   * @returns where he stood in the frame the axe bounced.
   */
  const throwAxe = async (dx: number | null) => {
    await attack();
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 3000 });
    await page.evaluate((dx) => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.attacks.onStop();
      if (dx !== null) g.player.moveTo(640 + dx, 360);
    }, dx);
    const h = await page.waitForFunction(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      return g.kit.drops.length > 0 ? { x: g.player.x, y: g.player.y } : false;
    }, null, { timeout: 4000 });
    return h.jsonValue() as Promise<{ x: number; y: number }>;
  };
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
      g.attacks.onStop();
      return { key: g.attacks.missiles[0].view.textureKey as string, held: g.kit.held as number };
    });
    m.key === 'proj_spin_axe' && m.held === 0
      ? pass('the next auto throws it: the missile is the spinning axe, and his hand is empty')
      : fail(`thrown: ${JSON.stringify(m)}`);
  }
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length > 0, null, { timeout: 4000 });
  const origin = { x: 640, y: 360 };
  {
    const s = await G();
    const d = s.drops[0];
    const off = Math.hypot(d.x - origin.x, d.y - origin.y);
    s.enemies[0].hp === 9 - 1 - cfg.Q.bonusPips && s.stats.axesThrown === 1
      ? pass(`it hits for ${1 + cfg.Q.bonusPips} pips (9 -> ${s.enemies[0].hp})`)
      : fail(`axe hit: hp ${s.enemies[0].hp}, stats ${JSON.stringify(s.stats)}`);
    s.drops.length === 1 && d.state === 'air' && off <= cfg.Q.dropIdlePx + 1 && cfg.Q.dropIdlePx < cfg.Q.catchRadius
      ? pass(`and bounces up: standing still, it will land ${Math.round(off)}px from him (within ${cfg.Q.dropIdlePx}, inside the ${cfg.Q.catchRadius}px circle)`)
      : fail(`idle drop: ${JSON.stringify({ drops: s.drops, origin })}`);
  }
  // He is under it when it lands: caught. W, on cooldown, is ready again, and he heals.
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').player.hp = 50; });
  await page.keyboard.press('KeyW');
  await settle(40);
  const wBefore = (await G()).cd.w;
  const landsAt = (await G()).drops[0].landsAt;
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length === 0, null, { timeout: 4000 });
  {
    const s = await G();
    s.held === 1 && s.stats.axesCaught === 1 && s.stats.axesMissed === 0
      ? pass('standing in the circle as it lands catches it: the axe is back in his hand')
      : fail(`catch: ${JSON.stringify({ held: s.held, stats: s.stats })}`);
    s.kitScore === cfg.Q.catchScoreBonus
      ? pass(`the catch scores +${s.kitScore} (Q.catchScoreBonus, Stage 1)`)
      : fail(`kit score after a catch: ${s.kitScore}, expected ${cfg.Q.catchScoreBonus}`);
    // Caught as the drawn axe reaches him, not a beat later: by its landing time it is already in his hand.
    s.now <= landsAt + 60 && cfg.Q.catchEarlyMs > 0
      ? pass(`he has it as it reaches him, up to ${cfg.Q.catchEarlyMs}ms before it would touch the ground (${Math.round(landsAt - s.now)}ms to spare when checked)`)
      : fail(`catch timing: checked ${Math.round(s.now - landsAt)}ms after landing`);
    wBefore > cfg.W.cooldownMs - 2000 && s.cd.w === 0
      ? pass(`catching resets W (${Math.round(wBefore)}ms left -> ready)`)
      : fail(`W reset: ${wBefore} -> ${s.cd.w}`);
    s.player.hp === 50 + cfg.Q.catchHeal.base && s.streak === 1
      ? pass(`and heals ${cfg.Q.catchHeal.base} HP, the first of a streak (50 -> ${s.player.hp})`)
      : fail(`catch heal: hp ${s.player.hp}, streak ${s.streak}`);
    // Each catch in a row heals more, to a cap.
    const heals = await page.evaluate(() => {
      const k = window.__warmup.scene.getScene('GameScene').kit;
      const out = [];
      const keep = k.catchStreak;
      for (k.catchStreak = 0; k.catchStreak < 7; k.catchStreak++) out.push(k.nextCatchHeal);
      k.catchStreak = keep;
      return out as number[];
    });
    heals.join(',') === '5,10,15,20,20,20,20'
      ? pass(`a streak of catches heals ${heals.slice(0, 4).join(', ')}, then stays at ${cfg.Q.catchHeal.max}`)
      : fail(`streak heals: ${heals.join(',')}`);
    // A catch that would pass full HP fills him up and says so, instead of a fraction.
    const capped = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const k = g.kit;
      const keep = { hp: g.player.hp, streak: k.catchStreak, held: k.held, caught: k.axesCaught };
      g.player.hp = g.player.maxHp - 2.6;
      k.catchAxe({ x: g.player.x, y: g.player.y, finish() {} });
      const texts = g.children.list.filter((o: { text?: unknown }) => typeof o.text === 'string').map((o: { text: string }) => o.text);
      const out = { hp: g.player.hp, max: g.player.maxHp, said: texts.includes('MAX'), fraction: texts.some((t: string) => /^\+\d+\.\d/.test(t)) };
      g.player.hp = keep.hp; k.catchStreak = keep.streak; k.held = keep.held; k.axesCaught = keep.caught;
      return out;
    });
    capped.hp === capped.max && capped.said && !capped.fraction
      ? pass('a catch that tops him up reads MAX, not a fractional +N')
      : fail(`capped catch: ${JSON.stringify(capped)}`);
  }

  // === 3. Where it lands ========================================================
  section('3. Where the axe lands');
  // Walking far to the left as it hits: it lands the furthest it goes that way, from where he stood then.
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 1; k.holdUntil = Number.POSITIVE_INFINITY; });
  {
    const from = await throwAxe(-400);
    const d = (await G()).drops[0];
    // `from` is read a frame after the bounce at most, so allow that much walking.
    d && Math.abs(d.x - (from.x - cfg.Q.dropMaxPx)) <= 10 && Math.abs(d.y - 360) <= 1
      ? pass(`walking far to the left as it hits: it comes down ${Math.round(from.x - d.x)}px to his left, the furthest it goes (${cfg.Q.dropMaxPx})`)
      : fail(`long click: drop ${JSON.stringify(d)} from ${JSON.stringify(from)}`);
  }
  // A short click: it lands on the click, and he walks onto it and catches it.
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 1; k.holdUntil = Number.POSITIVE_INFINITY; });
  {
    await throwAxe(60);
    const first = await G();
    const d = first.drops[0];
    d && Math.abs(d.x - 700) <= 1 && Math.abs(d.y - 360) <= 1
      ? pass('a short click 60px to the right: it comes down on the click, 60px away')
      : fail(`short click: drop ${JSON.stringify(d)}`);
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length === 0, null, { timeout: 4000 });
    const s = await G();
    s.stats.axesCaught === first.stats.axesCaught + 1 && s.held === 1
      ? pass('he walks onto the spot and catches it')
      : fail(`walk-on catch: ${JSON.stringify({ held: s.held, stats: s.stats })}`);
  }
  // Once the circle is shown, that is where it lands: no later click moves it.
  await stage([{ x: 800, y: 360, hp: 9 }]);
  await page.evaluate(() => { const k = window.__warmup.scene.getScene('GameScene').kit; k.held = 1; k.holdUntil = Number.POSITIVE_INFINITY; });
  {
    await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').kit.catchStreak = 3; });
    await throwAxe(null);
    const start = await G();
    const before = start.drops[0];
    await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.moveTo(g.player.x, g.player.y + 300); });
    await settle(150);
    const after = (await G()).drops[0];
    before && after && before.x === after.x && before.y === after.y
      ? pass('once its circle is shown the spot is fixed: a click right after the hit does not move it')
      : fail(`late click: ${JSON.stringify({ before, after })}`);
    // He walked away from it: it lands, lies there a moment, and is gone.
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.drops.length === 0, null, { timeout: 4000 });
    const s = await G();
    s.held === 0 && s.stats.axesMissed === start.stats.axesMissed + 1 && s.streak === 0
      ? pass('not under it when it lands: the axe is lost, and the heal streak with it')
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
  // Two in the line to his right, one above it and one below: both hit, slowed, shoved off it. One past its reach.
  await stage([{ x: 760, y: 320, hp: 5 }, { x: 850, y: 400, hp: 5 }, { x: 1040, y: 360, hp: 5 }]);
  await page.mouse.move(1000, 360);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.eHits >= 2, null, { timeout: 4000 });
  {
    const s = await G();
    const [a, b, far] = s.enemies;
    await settle(400);
    const late = await G();
    a.hp === 4 && b.hp === 4 && late.enemies[2].hp === 5 && late.stats.eHits === 2 && cfg.E.maxRange <= cfg.AUTO.range
      ? pass(`E is wide (${cfg.E.radius}px either side) and short (${cfg.E.maxRange}px, about his auto range): a pip from each enemy in it, none from one 400px away`)
      : fail(`E pips: ${JSON.stringify(s.enemies.map((e) => e.hp))}`);
    Math.abs(a.slow - (1 - cfg.E.slowFraction)) < 0.01 && Math.abs(b.slow - (1 - cfg.E.slowFraction)) < 0.01 && far.slow === 1
      ? pass(`and slows them ${cfg.E.slowFraction * 100}%`)
      : fail(`E slow: ${JSON.stringify(s.enemies.map((e) => e.slow))}`);
    Math.abs(a.y - (320 - cfg.E.knockPx)) < 3 && Math.abs(b.y - (400 + cfg.E.knockPx)) < 3 && Math.abs(a.x - 760) < 3 && far.y === 360
      ? pass(`and shoves each ${cfg.E.knockPx}px off the line, to the side it was on (y 320 -> ${Math.round(a.y)}, 400 -> ${Math.round(b.y)})`)
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
      ? pass(`R flies down its line through everything: ${cfg.R.pips} pip on the way out`)
      : fail(`R out: hp ${out.enemies[0].hp}, whirls ${out.whirls}`);
    // It carries on a little past the first enemy, then turns. He walks off the line; it still comes home, hitting again.
    await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.moveTo(g.player.x - 60, g.player.y); });
    const furthest = await page.evaluate(() => new Promise<number>((res) => {
      const g = window.__warmup.scene.getScene('GameScene');
      let far = 0;
      const tick = () => {
        const w = g.kit.whirls[0];
        if (!w) return res(far);
        far = Math.max(far, w.x);
        requestAnimationFrame(tick);
      };
      tick();
    }));
    const back = await G();
    const hitAt = 900 - cfg.R.radius - 28;
    furthest > 900 && furthest <= hitAt + cfg.R.overshootPx + 40
      ? pass(`it turns ~${cfg.R.overshootPx}px past the first enemy it hits (reached x ${Math.round(furthest)}, the enemy at 900), not at the arena's edge`)
      : fail(`R turn: furthest x ${furthest}, hit near ${hitAt}`);
    back.enemies[0].hp === 5 - cfg.R.pips - cfg.R.returnPips && back.stats.rHits === 2
      ? pass(`and flies back to him, wherever he went: ${cfg.R.returnPips} pip again on the way home`)
      : fail(`R back: hp ${back.enemies[0].hp}, stats ${JSON.stringify(back.stats)}`);
  }
  // R again while it is still going out: it turns at once. The second press is not a new cast.
  await stage([{ x: 300, y: 620, hp: 5 }]);
  await page.mouse.move(1100, 360);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.whirls.length === 1, null, { timeout: 4000 });
  await settle(120);
  {
    const cdBefore = (await G()).cd.r;
    await page.keyboard.press('KeyR');
    const r = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const w = g.kit.whirls[0];
      return { leg: w?.leg, x: w?.x, count: g.kit.whirls.length, cd: g.cooldowns.remainingMs('r') };
    });
    r.leg === 'back' && r.count === 1 && r.x < 1000 && r.cd > 0 && r.cd <= cdBefore
      ? pass(`pressing R again recalls it early (turned at x ${Math.round(r.x)}, well short of the edge); the cooldown carries on`)
      : fail(`recast: ${JSON.stringify({ r, cdBefore })}`);
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').kit.whirls.length === 0, null, { timeout: 6000 });
    await page.keyboard.press('KeyR');
    const s = await G();
    s.whirls === 0 && s.cd.r > 0
      ? pass('with nothing out, R on cooldown does nothing')
      : fail(`R on cooldown: ${JSON.stringify({ whirls: s.whirls, cd: s.cd.r })}`);
  }

  await finish();
});
