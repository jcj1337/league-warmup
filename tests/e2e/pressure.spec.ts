import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('pressure: wave sizes, staggered arrival + activation window, no premature clear, Basic vs Pursuer AI, Pursuer damage, sparse edge fire', async ({ page }, testInfo) => {
  // The real staggered opening: nothing is forced to arrive early.
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400, { arriveAll: false });

  const cfg = await page.evaluate(() => ({
    // The first ten stages as played: the hand-written intro, then generated stages.
    rosters: Array.from({ length: 10 }, (_, s) => window.__warmup.scene.getScene('GameScene').director.describeStage(s).waves),
    authored: window.__balance.STAGES,
    enemies: window.__balance.ENEMIES,
    endless: window.__balance.ENDLESS,
    difficulty: Array.from({ length: 10 }, (_, s) => { const d = window.__warmup.scene.getScene('GameScene').director; const i = d.stageIndex; d.stageIndex = s; const out = d.difficulty; d.stageIndex = i; return out; }),
    run: window.__balance.RUN,
    fire: window.__balance.ENEMY_PROJECTILES,
    pursuer: window.__balance.PURSUER,
    targets: window.__balance.TARGETS,
    playerRadius: window.__magicBoy.STATS.radius,
  }));
  // Every mob type counts, so a new mob never silently drops out of these totals.
  const sizeOf = (w): number => Object.values(w).reduce((n: number, c) => n + ((c as number) ?? 0), 0) as number;
  const countTypes = (list) => list.reduce((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {});
  const sameCounts = (got, want) => [...new Set([...Object.keys(got), ...Object.keys(want)])].every((k) => (got[k] ?? 0) === (want[k] ?? 0));
  const waitFor = (fn, arg: any = null, timeout = 5000) =>
    page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);

  /** Quiet arena: no edge fire, player parked and durable. */
  const calm = (px = 640, py = 360, hp = 9999) => page.evaluate(({ px, py, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = hp; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    g.player.x = px; g.player.y = py; g.player.stop();
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.projectiles.clear();
  }, { px, py, hp });
  /**
   * Replace the wave with exactly these (already active) enemies, nothing
   * pending. Spit and dash are switched off: these sections pin the movement
   * and melee AI (enemy-attacks.spec covers the attacks).
   */
  const solo = (spots) => page.evaluate((spots) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.enemies.forEach((e) => e.destroy());
    d.enemies.length = 0;
    d.pending.length = 0;
    for (const s of spots) {
      const e = d.spawnEnemy(s.type);
      e.x = s.x; e.y = s.y; e.hp = 9999;
      if ('canSpit' in e) e.canSpit = false;
      if ('canDash' in e) e.canDash = false;
      d.enemies.push(e);
    }
    g.enemies = d.enemies;
  }, spots);
  /** Sample every frame for `ms` of GAME time. */
  const watch = (ms) => page.evaluate((ms) => new Promise<any[]>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const frames = [];
    const tick = () => {
      frames.push({
        clock: g.clock.now, px: g.player.x, py: g.player.y, hp: g.player.hp,
        enemies: g.director.enemies.map((e) => ({
          type: e.archetype, x: e.x, y: e.y, life: e.lifecycle, mode: e.mode ?? null, state: e.state ?? null, windup: e.pose.windup,
        })),
      });
      if (g.clock.now - t0 >= ms) res(frames); else requestAnimationFrame(tick);
    };
    tick();
  }), ms);
  const distTo = (e, f) => Math.hypot(e.x - f.px, e.y - f.py);

  // === 1. Wave sizes and pressure config =====================================
  section('1. Wave sizes and pressure config');
  const sizes = cfg.authored.map((s) => s.waves.map(sizeOf));
  const perStage = cfg.rosters.map((st) => st.length).join('/');
  const wantPerStage = [...cfg.authored.map((s) => s.waves.length), ...Array(10 - cfg.authored.length).fill(cfg.endless.wavesPerStage)].join('/');
  perStage === wantPerStage
    ? pass(`waves per stage: ${perStage} (hand-written, then ${cfg.endless.wavesPerStage} per generated stage)`)
    : fail(`waves per stage: ${perStage}, want ${wantPerStage}`);
  const inBand = (from, to, lo, hi) => sizes.slice(from, to).flat().every((n) => n >= lo && n <= hi);
  inBand(0, 3, 3, 4) && inBand(3, cfg.authored.length, 4, 5)
    ? pass('hand-written mixes: Stages 1-3 field 3-4 enemies, 4-5 field 4-5')
    : fail(`size bands: ${JSON.stringify(sizes)}`);
  {
    const scaled = cfg.rosters.map((st) => st.map(sizeOf));
    scaled.slice(0, cfg.authored.length).every((st, i) => st.every((n, w) => n >= sizes[i][w]))
      ? pass(`the difficulty curve grows hand-written waves without shrinking any (fielded: ${scaled.map((st) => st.join('+')).join(' / ')})`)
      : fail(`scaled sizes: ${JSON.stringify(scaled)}`);
    // A generated wave spends its budget (DIFFICULTY.waveSize) until no mob fits.
    const costOf = (r) => Object.entries(r).reduce((n, [id, c]) => n + (c as number) * cfg.enemies[id].cost, 0);
    const maxCost = Math.max(...Object.values(cfg.enemies).map((e: any) => e.cost));
    const badBudget = cfg.rosters.flatMap((st, i) => st.map((r) => ({ stage: i + 1, cost: costOf(r), budget: cfg.difficulty[i].waveSize })))
      .slice(cfg.authored.reduce((n, st) => n + st.waves.length, 0))
      .find((b) => b.cost > b.budget + 1e-9 || b.cost <= b.budget - maxCost);
    !badBudget
      ? pass('every generated wave spends its budget: within one mob\'s cost of DIFFICULTY.waveSize, never over')
      : fail(`budget: ${JSON.stringify(badBudget)}`);
  }
  const lateMixes = new Set(cfg.rosters.slice(6).flatMap((st) => st.map((w) => `${w.basic ?? 0}B${w.pursuer ?? 0}P${w.magus ?? 0}M`)));
  lateMixes.size >= 3
    ? pass(`late waves vary their mixture (${[...lateMixes].join(', ')})`)
    : fail(`late waves repeat one mixture: ${[...lateMixes].join(', ')}`);
  cfg.run.spawn.manifestMs === 300 && cfg.run.spawn.gapJitter > 0 && cfg.run.spawn.gapJitter < 1
    ? pass(`arrival gaps follow the curve ±${Math.round(cfg.run.spawn.gapJitter * 100)}%; ${cfg.run.spawn.manifestMs}ms arrival window`)
    : fail(`spawn config: ${JSON.stringify(cfg.run.spawn)}`);

  // === 2. Staggered arrival and authoritative activation =====================
  section('2. Staggered arrival and authoritative activation');
  await calm();
  const arrival = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = 6; d.waveIndex = 0;   // Stage 7 Wave 1: fits under its cap
    d.spawnWave();
    const t0 = g.clock.now;
    const gapMs = d.difficulty.arrivalGapMs;
    const initial = { roster: d.enemies.length, pending: d.pendingCount, life: d.enemies.map((e) => e.lifecycle), started: d.enemies.map((e) => e.arrivalStartedAt) };
    let nextId = 1;
    const frames = [];
    const tick = () => {
      frames.push({
        clock: g.clock.now, pending: d.pendingCount, spawning: d.spawningCount, alive: d.aliveCount,
        remaining: g.getHudState().enemiesRemaining,
        enemies: d.enemies.map((e) => ({
          id: (e.__pid ??= nextId++), type: e.archetype, life: e.lifecycle,
          start: e.arrivalStartedAt, activeAt: e.activeAt, x: e.x, y: e.y,
        })),
      });
      const f = frames[frames.length - 1];
      if ((f.pending === 0 && f.spawning === 0) || g.clock.now - t0 > 9000) res({ t0, initial, frames, gapMs });
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  const af = arrival.frames;
  const last = af[af.length - 1];
  const w7 = cfg.rosters[6][0];
  const n7 = sizeOf(w7);
  {
    const i = arrival.initial;
    i.roster === 1 && i.pending === n7 - 1 && i.life[0] === 'spawning' && i.started[0] === arrival.t0
      ? pass(`the first enemy begins arriving the instant the wave starts; the other ${n7 - 1} are still pending`)
      : fail(`wave start: ${JSON.stringify(i)} at ${arrival.t0}`);
  }
  const byId = new Map();
  for (const f of af) for (const e of f.enemies) { if (!byId.has(e.id)) byId.set(e.id, []); byId.get(e.id).push({ ...e, clock: f.clock }); }
  const arrivals = [...byId.values()].map((seen) => seen[0]).sort((a, b) => a.start - b.start);
  last.pending === 0 && last.spawning === 0 && last.alive === n7 && arrivals.length === n7
    && sameCounts(countTypes(arrivals.map((e) => e.type)), w7)
    ? pass(`all ${n7} arrive and are alive together, exactly the scaled ${JSON.stringify(w7)}`)
    : fail(`after arrivals: ${JSON.stringify({ pending: last.pending, spawning: last.spawning, alive: last.alive, types: countTypes(arrivals.map((e) => e.type)) })}`);
  const gaps = arrivals.slice(1).map((e, i) => e.start - arrivals[i].start);
  const sMin = Math.round(arrival.gapMs * (1 - cfg.run.spawn.gapJitter));
  const sMax = Math.round(arrival.gapMs * (1 + cfg.run.spawn.gapJitter));
  gaps.length === n7 - 1 && gaps.every((g) => g >= sMin - 50 && g <= sMax + 50)
    ? pass(`arrivals begin ${gaps.map((g) => Math.round(g)).join(', ')}ms apart (${sMin}-${sMax} at Stage 7, + frame slack)`)
    : fail(`arrival gaps: ${JSON.stringify(gaps)}`);
  arrivals.every((e) => Math.abs(e.activeAt - e.start - cfg.run.spawn.manifestMs) < 1e-6) && new Set(arrivals.map((e) => e.activeAt)).size === n7
    ? pass(`each becomes active exactly ${cfg.run.spawn.manifestMs}ms after its arrival begins, at ${n7} different times`)
    : fail(`activation times: ${JSON.stringify(arrivals.map((e) => ({ start: e.start, activeAt: e.activeAt })))}`);
  af.some((f) => f.alive >= 1 && f.alive < n7 && f.pending + f.spawning > 0)
    ? pass('enemies do not all activate simultaneously (frames with some alive and others still to come)')
    : fail('never saw a partially arrived wave');
  const lateOrEarly = af.flatMap((f) => f.enemies.filter((e) => (e.life === 'spawning') !== (f.clock < e.activeAt)).map((e) => ({ clock: f.clock, ...e })));
  lateOrEarly.length === 0
    ? pass('every frame: spawning exactly while GameClock < activeAt, active from activeAt on')
    : fail(`activation disagrees with the clock: ${JSON.stringify(lateOrEarly.slice(0, 3))}`);
  const spawningSeen = [...byId.values()].map((seen) => seen.filter((s) => s.life === 'spawning'));
  spawningSeen.every((s) => s.length > 0 && s.every((p) => p.x === s[0].x && p.y === s[0].y))
    ? pass('each enemy is seen mid-arrival, and its spawn spot never moves during the window')
    : fail(`spawn spot moved or window unseen: ${JSON.stringify(spawningSeen.map((s) => s.length))}`);
  af.every((f) => f.alive === f.enemies.filter((e) => e.life === 'active').length && f.remaining === f.pending + f.spawning + f.alive)
    ? pass('arriving enemies are not counted alive; HUD ENEMIES counts pending + arriving + alive')
    : fail('alive / remaining counts disagree with the roster');

  // Authored composition is fixed; order and timing are not.
  const shuffles = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    d.stageIndex = 9; d.waveIndex = 0;
    const out = [];
    for (let i = 0; i < 16; i++) {
      d.spawnWave();
      out.push({ order: [...d.enemies.map((e) => e.archetype), ...d.pending.map((p) => p.archetype)], starts: d.pending.map((p) => Math.round(p.startsAt)) });
    }
    return out;
  });
  shuffles.every((s) => sameCounts(countTypes(s.order), cfg.rosters[9][0]))
    && new Set(shuffles.map((s) => s.order.join())).size > 1 && new Set(shuffles.map((s) => s.starts.join())).size > 1
    ? pass(`16 respawns of one wave: ${new Set(shuffles.map((s) => s.order.join())).size} different arrival orders and varied timing, always ${JSON.stringify(cfg.rosters[9][0])}`)
    : fail(`shuffled rosters: ${JSON.stringify(shuffles.slice(0, 4))}`);
  const table = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = [];
    for (let s = 0; s < 10; s++) {
      for (let w = 0; w < d.wavesIn(s); w++) {
        d.stageIndex = s; d.waveIndex = w;
        d.spawnWave();
        d.arriveAllNow();
        out.push({ s, w, types: d.enemies.map((e) => e.archetype), alive: d.aliveCount });
      }
    }
    return out;
  });
  const badTable = table.find((t) => !sameCounts(countTypes(t.types), cfg.rosters[t.s][t.w]) || t.alive !== t.types.length);
  !badTable
    ? pass(`all ${table.length} waves deliver exactly their scaled archetype counts through the shuffled queue`)
    : fail(`archetype counts: ${JSON.stringify(badTable)}`);

  // The field never holds more than the stage's cap; the overflow waits for a slot.
  const capped = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    // The first stage whose Wave 1 fields more enemies than its cap.
    const size = (i) => (Object.values(d.rosterFor(i, 0)) as number[]).reduce((n, c) => n + c, 0);
    let s = 10;
    for (; s < 40; s++) { d.stageIndex = s; if (size(s) > d.difficulty.maxAlive + 2) break; }
    d.stageIndex = s; d.waveIndex = 0;
    d.spawnWave();
    const cap = d.difficulty.maxAlive;
    const t0 = g.clock.now;
    let peak = 0;
    let killedAt = null;
    let refilled = false;
    const tick = () => {
      const onField = d.enemies.filter((e) => !e.dead).length;
      peak = Math.max(peak, onField);
      if (killedAt === null && d.pendingCount > 0 && onField === cap && g.clock.now - t0 > 3000) {
        const e = d.enemies.find((x) => x.active);
        e.hp = 1; e.takeHit(); d.onEnemyKilled(e, g.clock.now);
        killedAt = g.clock.now;
      } else if (killedAt !== null && !refilled) {
        refilled = d.enemies.filter((x) => !x.dead).length === cap;
      }
      if (refilled || g.clock.now - t0 > 6000) res({ stage: d.stage, cap, peak, pendingAtCap: killedAt !== null, refilled });
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  capped.peak === capped.cap && capped.pendingAtCap && capped.refilled
    ? pass(`Stage ${capped.stage} fields at most ${capped.cap} at once; the rest wait, and one arrives as soon as a slot frees`)
    : fail(`cap: ${JSON.stringify(capped)}`);

  // === 3. An arriving enemy is untargetable, undamageable and inert ==========
  section('3. An arriving enemy is untargetable, undamageable and inert');
  // Stretch the window so real inputs have time to try it. Activation still
  // follows the configured value; restored below.
  await page.evaluate(() => { window.__balance.RUN.spawn.manifestMs = 5000; });
  await calm(640, 360, 100);
  const probe = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const chat = window.__warmup.scene.getScene('UIScene').chat;
    d.stageIndex = 2; d.waveIndex = 0;      // 2B + 2P
    let tries = 0;
    do { d.spawnWave(); tries++; } while ((d.enemies[0].archetype !== 'pursuer' || chat.contains(d.enemies[0].x, d.enemies[0].y, 80)) && tries < 60);
    d.pending.length = 0;                   // just this one arrival
    // The cap wave above is gone only now: drop what it still had in flight,
    // and take the health reading from here, so a late spit cannot land on it.
    g.hostileSpells.clear();
    g.player.hp = 100; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    const e = d.enemies[0];
    e.__probe = 1;
    g.player.x = e.x - 40; g.player.y = e.y; g.player.stop();   // inside its melee reach
    const hpBefore = e.hp;
    const hit = e.takeHit();
    g.kit.mark(e);
    const marked = e.hasStatus('magicboy.mark', g.clock.now);
    e.clearStatus('magicboy.mark');
    g.attacks.commandAttack(e);
    return {
      type: e.archetype, life: e.lifecycle, hit, hpBefore, hpAfter: e.hp, marked,
      picked: g.targetAt(e.x, e.y) !== null, targetSet: !!g.attacks.currentTarget, inRange: g.attacks.hasTargetInRange(d.enemies),
      alive: d.aliveCount, spawning: d.spawningCount, x: e.x, y: e.y, activeAt: e.activeAt, clock: g.clock.now,
    };
  });
  probe.type === 'pursuer' && probe.life === 'spawning' && probe.activeAt - probe.clock > 3000
    ? pass(`probe: an arriving Pursuer at (${Math.round(probe.x)},${Math.round(probe.y)}), player inside its reach`)
    : fail(`probe setup: ${JSON.stringify(probe)}`);
  !probe.hit && probe.hpAfter === probe.hpBefore && !probe.marked
    ? pass('takeHit removes no pip and a W mark does not stick while arriving')
    : fail(`damage while arriving: ${JSON.stringify(probe)}`);
  !probe.picked && !probe.targetSet && !probe.inRange
    ? pass('not clickable, not accepted as an attack target, not "in range" for autos')
    : fail(`targetable while arriving: ${JSON.stringify(probe)}`);
  probe.alive === 0 && probe.spawning === 1
    ? pass('counted as arriving, not as an alive threat')
    : fail(`counts: alive ${probe.alive}, spawning ${probe.spawning}`);

  const inert = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    const t0 = g.clock.now;
    const frames = [];
    const tick = () => {
      frames.push({ life: e.lifecycle, x: e.x, y: e.y, state: e.state, windup: e.pose.windup, tel: e.view.telegraph.visible, hp: g.player.hp, sprite: e.view.sprite.visible, bar: e.view.hpBar.visible });
      if (g.clock.now - t0 >= 1500) res(frames); else requestAnimationFrame(tick);
    };
    tick();
  }));
  inert.every((f) => f.life === 'spawning' && f.x === probe.x && f.y === probe.y && f.state === 'chase' && f.windup === -1 && !f.tel && f.hp === 100)
    ? pass(`1.5s beside the player: no movement, no windup, no telegraph, no damage (${inert.length} frames)`)
    : fail(`arriving Pursuer acted: ${JSON.stringify(inert.find((f) => f.life !== 'spawning' || f.x !== probe.x || f.state !== 'chase' || f.windup !== -1 || f.hp !== 100))}`);
  inert.every((f) => !f.sprite && !f.bar)
    ? pass('placeholder cue only: body and health bar stay hidden during the window')
    : fail('body or bar drawn while arriving');

  // Real inputs pass straight through it.
  await page.mouse.click(probe.x, probe.y, { button: 'right' });
  await page.waitForTimeout(80);
  const clicked = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const out = { target: !!g.attacks.currentTarget, moving: g.player.isMoving };
    g.player.stop();
    return out;
  });
  !clicked.target && clicked.moving
    ? pass('right-clicking it is a plain move order, not an attack')
    : fail(`right-click on an arriving enemy: ${JSON.stringify(clicked)}`);
  const qFrom = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    g.cooldowns.reduce(999999, ['q']);
    g.player.x = e.x + (e.x > 640 ? -200 : 200); g.player.y = e.y; g.player.stop();
    return { shots: g.kit.qHit };
  });
  await page.mouse.move(probe.x, probe.y);
  await page.keyboard.press('q');
  await waitFor(() => {
    const sk = window.__warmup.scene.getScene('GameScene');
    return sk.kit.qFired >= 1 && sk.projectiles.missilesInFlight === 0;
  }, null, 3000);
  const afterQ = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    return { fired: g.kit.qFired, hits: g.kit.qHit, hp: e.hp, life: e.lifecycle };
  });
  afterQ.fired >= 1 && afterQ.hits === qFrom.shots && afterQ.hp === probe.hpBefore && afterQ.life === 'spawning'
    ? pass('a Q aimed straight at it flies through without a hit')
    : fail(`Q vs arriving enemy: ${JSON.stringify(afterQ)}`);

  // The window freezes with the pause.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const paused0 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    return { paused: g.isPaused, clock: g.clock.now, left: e.activeAt - g.clock.now, life: e.lifecycle };
  });
  await page.waitForTimeout(700);
  const paused1 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    return { paused: g.isPaused, clock: g.clock.now, left: e.activeAt - g.clock.now, life: e.lifecycle };
  });
  await page.keyboard.press('Escape');
  paused0.paused && paused1.paused && paused1.clock === paused0.clock && paused1.left === paused0.left && paused1.life === 'spawning'
    ? pass(`pausing freezes the arrival window (${Math.round(paused0.left)}ms left, unchanged)`)
    : fail(`arrival while paused: ${JSON.stringify({ paused0, paused1 })}`);

  // Activation lands on the GameClock deadline, and then it is a normal enemy.
  const activation = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies.find((x) => x.__probe);
    g.player.x = e.x + (e.x > 640 ? -200 : 200); g.player.y = e.y; g.player.stop(); g.player.hp = 100;
    e.activeAt = g.clock.now + 400;
    const frames = [];
    const tick = () => {
      frames.push({ clock: g.clock.now, life: e.lifecycle });
      if (g.clock.now < e.activeAt + 150) { requestAnimationFrame(tick); return; }
      const hpBefore = e.hp;
      const picked = g.targetAt(e.x, e.y) === e;
      g.onTargetHit(e, e.takeHit());
      res({ activeAt: e.activeAt, frames, picked, lost: hpBefore - e.hp, x: e.x, y: e.y });
    };
    tick();
  }));
  const beforeDeadline = activation.frames.filter((f) => f.clock < activation.activeAt);
  const afterDeadline = activation.frames.filter((f) => f.clock >= activation.activeAt);
  beforeDeadline.length > 0 && afterDeadline.length > 0
    && beforeDeadline.every((f) => f.life === 'spawning') && afterDeadline.every((f) => f.life === 'active')
    ? pass(`spawning on all ${beforeDeadline.length} frames before activeAt, active on all ${afterDeadline.length} from it`)
    : fail(`activation frames: ${JSON.stringify(activation.frames)}`);
  activation.picked && activation.lost === 1
    ? pass('once active it is clickable and a hit removes one pip')
    : fail(`after activation: ${JSON.stringify(activation)}`);
  await page.evaluate(() => { window.__balance.RUN.spawn.manifestMs = 300; });

  // === 4. Basic slimes track the player ======================================
  section('4. Basic slimes track the player');
  const band = cfg.targets.pressureBand;
  await calm(300, 200);
  await solo([{ type: 'basic', x: 1100, y: 600 }]);
  const approach = await watch(1500);
  const a0 = distTo(approach[0].enemies[0], approach[0]);
  const a1 = distTo(approach[approach.length - 1].enemies[0], approach[approach.length - 1]);
  a0 - a1 > 120 && approach.some((f) => f.enemies[0].mode === 'approach')
    ? pass(`from far away it walks in: ${Math.round(a0)} -> ${Math.round(a1)}px in 1.5s`)
    : fail(`basic did not approach: ${Math.round(a0)} -> ${Math.round(a1)}px`);
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.x = 1000; g.player.y = 200; g.player.stop(); });
  const retarget = await watch(1500);
  const r0 = distTo(retarget[0].enemies[0], retarget[0]);
  const r1 = distTo(retarget[retarget.length - 1].enemies[0], retarget[retarget.length - 1]);
  r0 - r1 > 100
    ? pass(`it re-targets when the player relocates: ${Math.round(r0)} -> ${Math.round(r1)}px`)
    : fail(`basic did not follow the player: ${Math.round(r0)} -> ${Math.round(r1)}px`);
  await calm(640, 360);
  const settle = await watch(4500);
  const late = settle.filter((f) => f.clock - settle[0].clock >= 2000);
  const lateDists = late.map((f) => distTo(f.enemies[0], f));
  let path = 0;
  for (let i = 1; i < late.length; i++) path += Math.hypot(late[i].enemies[0].x - late[i - 1].enemies[0].x, late[i].enemies[0].y - late[i - 1].enemies[0].y);
  Math.min(...lateDists) >= band.min - 25 && Math.max(...lateDists) <= band.max + 25
    ? pass(`it then holds a pressure band around the player (${Math.round(Math.min(...lateDists))}-${Math.round(Math.max(...lateDists))}px, band ${band.min}-${band.max})`)
    : fail(`band not held: ${Math.round(Math.min(...lateDists))}-${Math.round(Math.max(...lateDists))}px`);
  path > 40 && late.some((f) => f.enemies[0].mode === 'strafe')
    ? pass(`and keeps repositioning around the player instead of parking (${Math.round(path)}px of sidestepping in 2.5s)`)
    : fail(`no strafing: path ${Math.round(path)}px, modes ${[...new Set(late.map((f) => f.enemies[0].mode))]}`);
  settle.every((f) => f.hp === settle[0].hp && f.enemies[0].windup === -1 && f.enemies[0].state === null)
    ? pass('with its spit off, it never winds up or deals damage')
    : fail('a basic slime damaged the player or wound up');

  // === 5. Basic and Pursuer stay distinct ====================================
  section('5. Basic and Pursuer stay distinct');
  await calm(640, 360);
  await solo([{ type: 'basic', x: 1100, y: 160 }, { type: 'pursuer', x: 1000, y: 560 }]);
  const duo = await watch(4000);
  const reach = cfg.pursuer.radius + cfg.playerRadius + cfg.pursuer.attackRange;
  const basicMin = Math.min(...duo.map((f) => distTo(f.enemies[0], f)));
  const pursuerMin = Math.min(...duo.map((f) => distTo(f.enemies[1], f)));
  pursuerMin <= reach + 2 && duo.some((f) => f.enemies[1].state === 'windup')
    ? pass(`the Pursuer commits to melee (closest ${Math.round(pursuerMin)}px <= reach ${reach}) and winds up`)
    : fail(`pursuer closest ${Math.round(pursuerMin)}px, windup seen ${duo.some((f) => f.enemies[1].state === 'windup')}`);
  basicMin >= band.min - 40 && duo.every((f) => f.enemies[0].windup === -1)
    ? pass(`the basic slime never follows it in (closest ${Math.round(basicMin)}px) and never swings`)
    : fail(`basic closest ${Math.round(basicMin)}px`);
  const drops = duo.slice(1).map((f, i) => duo[i].hp - f.hp).filter((d) => d !== 0);
  // Enemy damage scales with the stage (DIFFICULTY.damage).
  const swing = await page.evaluate((base) => Math.round(base * window.__warmup.scene.getScene('GameScene').director.difficulty.damage), cfg.pursuer.attackDamage);
  drops.length > 0 && drops.every((d) => d === swing)
    ? pass(`all damage came from Pursuer swings of ${swing} (${cfg.pursuer.attackDamage} scaled to this stage; ${drops.length} hit(s))`)
    : fail(`player hp drops: ${JSON.stringify(drops)}`);

  // === 6. A Pursuer hit costs a quarter of the player's HP ===================
  section("6. A Pursuer hit costs a quarter of the player's HP");
  cfg.pursuer.attackDamage === 25 && cfg.pursuer.windupMs === 400
    ? pass('PURSUER.attackDamage is 25 with the 400ms telegraph kept')
    : fail(`pursuer config: damage ${cfg.pursuer.attackDamage}, windup ${cfg.pursuer.windupMs}`);
  await calm(640, 360, 100);
  // Stage 1: enemy damage is unscaled there.
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 0; });
  // Just outside touching distance, so the hit is its swing, not body contact.
  await solo([{ type: 'pursuer', x: 700, y: 360 }]);
  const struck = await waitFor(() => window.__warmup.scene.getScene('GameScene').player.hp < 100, null, 3000);
  const hpAfterSwing = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hp = g.player.hp;
    g.player.x = 150; g.player.y = 150;   // step away before a second swing
    return hp;
  });
  struck && hpAfterSwing === 75
    ? pass('one landed Stage 1 swing takes the player from 100 to exactly 75')
    : fail(`after one swing: hp ${hpAfterSwing}`);

  // === 7. Edge fire is sparse, one shot at a time ============================
  section('7. Edge fire is sparse, one shot at a time');
  cfg.fire.spawnIntervalMs.start === 4500 && cfg.fire.spawnIntervalMs.end === 3000
    && cfg.fire.volleySize.start === 1 && cfg.fire.volleySize.end === 1
    ? pass('interval 4500 -> 3000ms (was 2600 -> 700), volley always 1 (was 1 -> 1.5)')
    : fail(`fire config: ${JSON.stringify(cfg.fire)}`);
  const ramp = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    const out = [];
    for (let s = 0; s < 10; s++) {
      d.stageIndex = s;
      out.push({ interval: g.enemyProjectiles.spawnIntervalMs, volley: g.enemyProjectiles.volleySize });
    }
    return out;
  });
  ramp.every((r, i) => r.volley === 1 && r.interval >= 3000 && r.interval <= 4500 && (i === 0 || r.interval <= ramp[i - 1].interval))
    ? pass(`per-stage interval ${ramp.map((r) => Math.round(r.interval)).join(' / ')}ms, volley 1 on every stage`)
    : fail(`fire ramp: ${JSON.stringify(ramp)}`);
  await calm(640, 360);
  await solo([{ type: 'basic', x: 1150, y: 650 }]);
  const volleys = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ep = g.enemyProjectiles;
    g.director.stageIndex = 9;              // full-strength fire: the shortest interval
    g.director.enemies[0].nextPlanAt = Number.POSITIVE_INFINITY;
    const shots = [];
    const original = ep.spawnOne;
    // Count every individual shot a volley fires.
    ep.spawnOne = function () { shots.push(g.clock.now); return original.call(this); };
    const t0 = g.clock.now;
    ep.nextSpawnAt = t0 + 100;
    const tick = () => {
      g.player.hp = 9999;
      if (g.clock.now - t0 < 6500) { requestAnimationFrame(tick); return; }
      delete ep.spawnOne;
      ep.nextSpawnAt = Number.POSITIVE_INFINITY;
      ep.clear();
      res({ shots, stage: g.director.stage, interval: ep.spawnIntervalMs });
    };
    tick();
  }));
  const shotGaps = volleys.shots.slice(1).map((t, i) => t - volleys.shots[i]);
  const expectedShots = Math.floor(6400 / volleys.interval) + 1;
  volleys.shots.length === expectedShots && shotGaps.every((gap) => Math.abs(gap - volleys.interval) <= 40)
    ? pass(`Stage ${volleys.stage}, 6.5s of live fire: ${volleys.shots.length} single shots ${shotGaps.map((g) => Math.round(g)).join(', ')}ms apart (interval ${Math.round(volleys.interval)}ms)`)
    : fail(`live fire: ${volleys.shots.length} shots, gaps ${JSON.stringify(shotGaps)}, interval ${volleys.interval}`);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 0; });

  // === 8. Pending and arriving enemies block the wave clear ==================
  section('8. Pending and arriving enemies block the wave clear');
  await calm(640, 360);
  const clear = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.stageIndex = 0; d.waveIndex = 0;
    d.spawnWave();
    const size = d.enemies.length + d.pendingCount;
    const kills = [];
    let idleGaps = 0;
    const t0 = g.clock.now;
    // Kill every enemy the moment it becomes active.
    const tick = () => {
      for (const e of d.enemies) {
        if (!e.active) continue;
        while (e.active) g.onTargetHit(e, e.takeHit());
        kills.push({ clock: g.clock.now, pending: d.pendingCount, spawning: d.spawningCount, alive: d.aliveCount, phase: d.phase, remaining: g.getHudState().enemiesRemaining });
      }
      if (d.phase === 'wave' && d.aliveCount === 0 && d.pendingCount + d.spawningCount > 0 && kills.length > 0) idleGaps++;
      if (d.phase !== 'wave' || g.clock.now - t0 > 8000) res({ size, kills, idleGaps, phase: d.phase });
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  const early = clear.kills.slice(0, -1);
  const final = clear.kills[clear.kills.length - 1];
  clear.kills.length === clear.size && early.length > 0
    && early.every((k) => k.phase === 'wave' && k.pending + k.spawning > 0 && k.remaining === k.pending + k.spawning)
    ? pass(`${early.length} kill(s) wiped every active enemy while more were scheduled — the wave stayed in progress each time`)
    : fail(`early kills: ${JSON.stringify(clear.kills)}`);
  clear.idleGaps > 0
    ? pass(`${clear.idleGaps} frames with zero alive enemies but arrivals still due, and no clear`)
    : fail('never observed an empty field with arrivals still due');
  final && final.pending === 0 && final.spawning === 0 && final.phase === 'intermission' && clear.phase === 'intermission'
    ? pass(`only the kill of the last arrival (${clear.size} of ${clear.size}) clears the wave`)
    : fail(`final kill: ${JSON.stringify(final)}, phase ${clear.phase}`);

  await finish();
});
