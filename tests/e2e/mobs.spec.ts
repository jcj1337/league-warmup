import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('mobs: passive stacks, Q cooldown refund, Pursuer AI, stage pips + segmented bars, composition, pause', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const G = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hud = g.getHudState();
    return {
      stacks: g.passive.stackCount,
      passiveMult: g.passive.attackSpeedMultiplier,
      passiveRemaining: g.passive.remainingMs,
      cooldownMs: g.attacks.cooldownMs,
      baseCooldownMs: g.attacks.baseCooldownMs,
      aps: g.attacks.attacksPerSecond,
      qCd: g.skillshot.cooldownRemainingMs,
      qFired: g.skillshot.shotsFired, qHit: g.skillshot.shotsHit,
      stage: hud.stage,
      enemies: g.director.enemies.map((e) => ({ type: e.archetype, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, active: e.active, r: e.radius })),
      px: g.player.x, py: g.player.y, playerHp: g.player.hp,
      paused: g.isPaused,
      clock: g.clock.now,
    };
  });
  const calm = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.enemyProjectiles.clear();
    g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
    g.player.hp = 100;
  });
  /** Replace the roster with one enemy of a given archetype at a fixed spot. */
  const placeOne = (type, x, y, hp?) => page.evaluate(({ type, x, y, hp }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const d = g.director;
    d.enemies.forEach((en) => en.destroy());
    d.enemies.length = 0;
    const e = d.spawnEnemy(type);
    e.x = x; e.y = y;
    // A basic slime holds its spot (it now closes in on the player); a Pursuer still chases.
    e.goalX = x; e.goalY = y; e.nextPlanAt = Number.POSITIVE_INFINITY;
    if (hp) { e.hp = hp; }
    e.__tag = 1;
    d.enemies.push(e);
    g.enemies = d.enemies;
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.skillshot.clear();
    g.player.x = 640; g.player.y = 360; g.player.stop();
    // Pursuer swings cost 25: start each placement healthy so earlier sections can't kill the run.
    g.player.hp = 100;
    return { type: e.archetype, hp: e.hp, maxHp: e.maxHp, r: e.radius };
  }, { type, x, y, hp });
  const cfg = await page.evaluate(() => ({
    qCd: window.__balance.SKILLSHOT_Q.cooldownMs,
    qSpeed: window.__balance.SKILLSHOT_Q.speed,
    qRefund: window.__balance.SKILLSHOT_Q.hitCooldownReductionMs,
    passive: window.__balance.PASSIVE,
    pursuer: window.__balance.PURSUER,
    playerSpeed: window.__balance.PLAYER.moveSpeed,
    // The first ten stages as played: hand-written ones, then generated ones.
    stages: Array.from({ length: 10 }, (_, s) => window.__warmup.scene.getScene('GameScene').director.describeStage(s)),
    obsolete: {
      targetsMaxHp: 'maxHp' in window.__balance.TARGETS,
      pursuerHpMult: 'baseHpMultiplier' in window.__balance.PURSUER,
      autoDamage: 'damage' in window.__balance.ATTACK,
      qDamage: 'damage' in window.__balance.SKILLSHOT_Q,
      wDetonation: 'detonationDamage' in window.__balance.SKILLSHOT_W,
      eDamage: 'damage' in window.__balance.BLINK_E,
      pointsPerDamage: 'pointsPerDamage' in window.__balance.SCORE,
      stageHpMult: window.__balance.STAGES.some((s) => 'enemyHpMultiplier' in s),
    },
  }));

  // === Config sanity =========================================================
  section('Config sanity');
  cfg.qCd === 3000 ? pass(`Q cooldown is ${cfg.qCd}ms (was 4000)`) : fail(`Q cooldown ${cfg.qCd}`);
  cfg.qSpeed === 1250 ? pass(`Q speed ${cfg.qSpeed}px/s (was 1900, -34%)`) : fail(`Q speed ${cfg.qSpeed}`);

  // === PART A: passive =======================================================
  section('PART A: passive');
  await calm();
  // The run stays on Stage 1 throughout, so the base auto cycle is constant.
  await placeOne('basic', 900, 360, 9999);
  await page.waitForTimeout(80);

  const base = await G();
  base.stacks === 0 && Math.abs(base.passiveMult - 1) < 1e-9
    ? pass('passive starts at 0 stacks, x1.00')
    : fail(`start: ${base.stacks} stacks, x${base.passiveMult}`);

  // Land 6 Qs; stacks must cap at 5.
  const landQ = async () => {
    const before = (await G()).qHit;           // capture BEFORE firing
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.cooldowns.reduce(999999, ['q']);
      g.player.x = 640; g.player.y = 360; g.player.stop();
      const e = g.director.enemies[0];
      if (e) { e.x = 900; e.y = 360; e.hp = 9999; e.active = true; }
    });
    await page.mouse.move(900, 360);
    await page.waitForTimeout(30);
    await page.keyboard.press('q');
    await page.waitForFunction(
      (n) => window.__warmup.scene.getScene('GameScene').skillshot.shotsHit > n,
      before,
      { timeout: 4000 },
    );
    await page.waitForTimeout(40);
  };

  const stackTable = [];
  for (let i = 1; i <= 6; i++) {
    await landQ();
    const s = await G();
    stackTable.push({ stacks: s.stacks, mult: s.passiveMult, cd: s.cooldownMs, aps: s.aps });
  }
  stackTable[4].stacks === 5 && stackTable[5].stacks === 5
    ? pass('stacks cap at 5')
    : fail(`stacks went ${stackTable.map((r) => r.stacks).join(',')}`);

  const expected = [1.1, 1.2, 1.3, 1.4, 1.5];
  const multsOk = expected.every((e, i) => Math.abs(stackTable[i].mult - e) < 1e-9);
  multsOk ? pass(`multiplier per stack: ${expected.join(', ')}`) : fail(`mults ${stackTable.map((r) => r.mult).join(',')}`);

  // Attack speed must actually rise at each stack.
  const monotonic = stackTable.slice(0, 5).every((r, i, a) => i === 0 || r.aps > a[i - 1].aps - 1e-9);
  monotonic ? pass(`attack speed rises per stack (${stackTable.map((r) => r.aps.toFixed(2)).join(' -> ')}/s)`)
    : fail('attack speed did not rise with stacks');

  // Cooldown must be stage base / multiplier — sampled in ONE snapshot.
  const formula = await page.evaluate(() => {
    const a = window.__warmup.scene.getScene('GameScene').attacks;
    const p = window.__warmup.scene.getScene('GameScene').passive;
    return { cd: a.cooldownMs, base: a.baseCooldownMs, mult: p.attackSpeedMultiplier };
  });
  Math.abs(formula.cd - formula.base / formula.mult) < 1e-6
    ? pass(`cooldown == stageBaseCooldown / passiveMultiplier (${formula.base.toFixed(0)} / ${formula.mult} = ${formula.cd.toFixed(0)}ms)`)
    : fail(`cooldown formula mismatch: ${formula.cd} vs ${formula.base}/${formula.mult}`);

  // Refresh: the timer goes back to full on every hit.
  const beforeRefresh = (await G()).passiveRemaining;
  await page.waitForTimeout(600);
  const decayed = (await G()).passiveRemaining;
  decayed < beforeRefresh ? pass('passive timer counts down') : fail('passive timer not counting down');
  await landQ();
  const refreshed = (await G()).passiveRemaining;
  refreshed > decayed + 400 ? pass(`hit refreshes the whole buff (${Math.round(refreshed)}ms)`) : fail('no refresh on hit');

  // Expiry: all stacks drop together.
  await page.waitForFunction(
    () => window.__warmup.scene.getScene('GameScene').passive.stackCount === 0,
    null,
    { timeout: cfg.passive.durationMs + 3000 },
  );
  const expiredState = await G();
  expiredState.stacks === 0 && Math.abs(expiredState.passiveMult - 1) < 1e-9
    ? pass(`all stacks expire together after ${cfg.passive.durationMs}ms`)
    : fail(`after expiry: ${expiredState.stacks} stacks`);

  // A miss must not stack.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']);
    g.player.x = 200; g.player.y = 650;
  });
  await page.mouse.move(200, 100);   // aimed into empty space
  await page.keyboard.press('q');
  await page.waitForTimeout(700);
  const missed = await G();
  missed.stacks === 0 ? pass('a missed Q grants no stack') : fail(`miss granted ${missed.stacks} stacks`);

  // === PART B: Q cooldown refund ============================================
  section('PART B: Q cooldown refund');
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']);
    g.player.x = 640; g.player.y = 360;
  });
  await placeOne('basic', 900, 360, 9999);
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(40);
  const justCast = await G();
  Math.abs(justCast.qCd - cfg.qCd) < 120
    ? pass(`Q cast starts a ${cfg.qCd}ms cooldown`)
    : fail(`cooldown after cast ${justCast.qCd}`);

  // Sample the cooldown across the hit: it must DROP by the refund, not restart.
  const refund = await page.evaluate((qRefund) => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const hitsBefore = g.skillshot.shotsHit;
    let prev = g.skillshot.cooldownRemainingMs;
    let jump = null;
    const tick = () => {
      const cd = g.skillshot.cooldownRemainingMs;
      if (g.skillshot.shotsHit > hitsBefore && jump === null) jump = { before: prev, after: cd };
      prev = cd;
      if (jump && g.skillshot.shotsHit > hitsBefore) res({ jump, qRefund });
      else requestAnimationFrame(tick);
    };
    tick();
  }), cfg.qRefund);
  const drop = refund.jump.before - refund.jump.after;
  drop >= cfg.qRefund - 60 && drop <= cfg.qRefund + 120
    ? pass(`landed Q cut the REMAINING cooldown by ~${Math.round(drop)}ms (config ${cfg.qRefund})`)
    : fail(`cooldown drop was ${Math.round(drop)}ms, expected ~${cfg.qRefund}`);
  refund.jump.after < cfg.qCd
    ? pass('refund reduced the existing cooldown rather than restarting it')
    : fail('cooldown appears to have restarted');

  // === PART D/E: Pursuer =====================================================
  section('PART D/E: Pursuer');
  const spawned = await placeOne('pursuer', 1100, 360);
  spawned.type === 'pursuer' ? pass('pursuer archetype spawns') : fail(`spawned ${spawned.type}`);
  const stagePips = cfg.stages[(await G()).stage - 1].enemyPips;
  spawned.maxHp === stagePips.pursuer
    ? pass(`pursuer spawns with ${spawned.maxHp} pips (Stage ${(await G()).stage} table)`)
    : fail(`pursuer pips ${spawned.maxHp}, expected ${stagePips.pursuer}`);
  spawned.r > 18 ? pass(`pursuer is visually larger (r${spawned.r} vs basic r18)`) : fail(`pursuer radius ${spawned.r}`);

  // It chases.
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.x = 300; g.player.y = 360; g.player.stop(); });
  const chase0 = await G();
  await page.waitForTimeout(700);
  const chase1 = await G();
  const d0 = Math.hypot(chase0.enemies[0].x - 300, chase0.enemies[0].y - 360);
  const d1 = Math.hypot(chase1.enemies[0].x - 300, chase1.enemies[0].y - 360);
  d1 < d0 - 60 ? pass(`pursuer closes on the player (${d0.toFixed(0)} -> ${d1.toFixed(0)}px)`) : fail(`pursuer did not chase (${d0} -> ${d1})`);

  // Measured speed must be below the player's.
  const measured = (d0 - d1) / 0.7;
  measured < cfg.playerSpeed * 0.95
    ? pass(`pursuer speed ~${measured.toFixed(0)}px/s < player ${cfg.playerSpeed}px/s (kiteable)`)
    : fail(`pursuer too fast: ${measured.toFixed(0)}px/s`);

  // It changes direction when the player moves.
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.x = 300; g.player.y = 120; });
  await page.waitForTimeout(600);
  const redirected = await G();
  redirected.enemies[0].y < chase1.enemies[0].y - 30
    ? pass('pursuer re-aims at the player position')
    : fail('pursuer did not change direction');

  // Attack: damage once per cooldown, not per frame.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = 100;
    const e = g.director.enemies[0];
    e.x = g.player.x + 30; e.y = g.player.y;  // parked inside its reach
  });
  const hpStart = (await G()).playerHp;
  await page.waitForTimeout(2600);
  const hpEnd = (await G()).playerHp;
  const hits = Math.round((hpStart - hpEnd) / cfg.pursuer.attackDamage);
  hits >= 1 ? pass(`pursuer deals melee damage (${hpStart - hpEnd} hp over 2.6s)`) : fail('pursuer never damaged the player');
  hits <= 3
    ? pass(`damage is cooldown-gated, not per-frame (${hits} hits in 2.6s at ${cfg.pursuer.attackCooldownMs}ms)`)
    : fail(`${hits} hits in 2.6s — cooldown not respected`);

  // Windup telegraph exists and is cancellable by walking out.
  const sawWindup = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    const t0 = performance.now();
    const tick = () => {
      if (e.state === 'windup' && e.view.telegraph.visible) res(true);
      else if (performance.now() - t0 > 2500) res(false);
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  sawWindup ? pass('pursuer telegraphs its swing (windup state + ring)') : fail('no visible windup telegraph');

  // === PART F: works with every offensive mechanic ===========================
  section('PART F: works with every offensive mechanic');
  await placeOne('pursuer', 800, 360, 9999);
  await page.evaluate(() => { const g = window.__warmup.scene.getScene('GameScene'); g.player.x = 640; g.player.y = 360; g.player.stop(); });
  await page.waitForTimeout(60);
  const before = (await G()).enemies[0].hp;
  await page.mouse.click(800, 360, { button: 'right' });   // right-click a pursuer
  await page.waitForTimeout(1400);
  (await G()).enemies[0].hp < before ? pass('right-click auto-attacks the pursuer') : fail('autos did not hit the pursuer');

  // T attack-move onto it.
  const beforeT = (await G()).enemies[0].hp;
  await page.mouse.move(800, 360);
  await page.keyboard.press('t');
  await page.waitForTimeout(1400);
  (await G()).enemies[0].hp < beforeT ? pass('T attack-move engages the pursuer') : fail('T did not engage the pursuer');

  // Q it -> a pip AND a passive stack.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']); g.passive.reset();
    g.player.x = 640; g.player.y = 360; g.player.hp = 100;
    const e = g.director.enemies[0]; e.x = 900; e.y = 360;
  });
  const beforeQ = (await G()).enemies[0].hp;
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(800);
  const afterQ = await G();
  afterQ.enemies[0].hp < beforeQ ? pass('Q hits the pursuer') : fail('Q did not hit the pursuer');
  afterQ.stacks === 1 ? pass('Q hitting a pursuer grants a passive stack') : fail(`stacks after pursuer Q: ${afterQ.stacks}`);

  // Kill it and check the score multiplier.
  const scoreCheck = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const before = g.scoring.score;
    const e = g.director.enemies[0];
    const mult = e.scoreMultiplier;
    e.hp = 1;
    e.takeHit();
    return { before, mult, killsByType: { ...g.scoring.killsByType } };
  });
  await page.waitForTimeout(80);
  const afterKill = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { score: g.scoring.score, killsByType: { ...g.scoring.killsByType } };
  });
  scoreCheck.mult >= 2
    ? pass(`pursuer kill is worth ${scoreCheck.mult}x a basic kill`)
    : fail(`pursuer score multiplier ${scoreCheck.mult}`);

  // === Stage-based enemy pips ================================================
  section('Stage-based enemy pips');
  // Spawn one of each archetype on every stage and compare with the table.
  const pipTable = await page.evaluate(() => {
    const d = window.__warmup.scene.getScene('GameScene').director;
    const out = [];
    for (let s = 0; s < 10; s++) {
      d.stageIndex = s;
      const b = d.spawnEnemy('basic');
      const p = d.spawnEnemy('pursuer');
      out.push({ stage: s + 1, basic: b.maxHp, pursuer: p.maxHp, basicHp: b.hp, pursuerHp: p.hp });
      b.destroy(); p.destroy();
    }
    d.stageIndex = 0;
    return out;
  });
  const wantBasic = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  pipTable.map((r) => r.basic).join('/') === wantBasic.join('/')
    ? pass(`basic pips by stage: ${pipTable.map((r) => r.basic).join('/')} (one hit, always: basics get more numerous, never tougher)`)
    : fail(`basic pips by stage: ${pipTable.map((r) => r.basic).join('/')}, want ${wantBasic.join('/')}`);
  pipTable.every((r) => r.pursuer === r.basic + 1)
    ? pass(`Pursuer = Basic + 1 on every stage (${pipTable.map((r) => r.pursuer).join('/')})`)
    : fail(`pursuer pips: ${JSON.stringify(pipTable)}`);
  pipTable.every((r) => r.basic === cfg.stages[r.stage - 1].enemyPips.basic
    && r.pursuer === cfg.stages[r.stage - 1].enemyPips.pursuer && r.basicHp === r.basic && r.pursuerHp === r.pursuer)
    ? pass('spawned pips come straight from the ENEMIES pip ramps, and enemies spawn full')
    : fail(`table vs spawn mismatch: ${JSON.stringify(pipTable)}`);
  Object.values(cfg.obsolete).every((present) => !present)
    ? pass('obsolete damage/HP config removed (damage values, HP multipliers, pointsPerDamage)')
    : fail(`obsolete config still present: ${JSON.stringify(cfg.obsolete)}`);

  // === Segmented health bars =================================================
  section('Segmented health bars');
  const bar = () => page.evaluate(() => {
    const e = window.__warmup.scene.getScene('GameScene').director.enemies[0];
    const b = e.view.hpBar;
    return { pips: e.hp, max: e.maxHp, segments: b.segments, filled: b.filled, visible: b.visible, width: b.width, cells: b.cells.map((c) => ({ ...c })) };
  });
  const barTheme = await page.evaluate(() => window.__theme.pipBar);
  /** Cells tile the constant width exactly: first at 0, last ending at width, dividers of `gap`, widths within 1px. */
  const tiles = (b) => {
    const ws = b.cells.map((c) => c.w);
    return b.cells.length === b.segments && b.width === barTheme.width
      && b.cells[0].x === 0 && b.cells[b.cells.length - 1].x + b.cells[b.cells.length - 1].w === b.width
      && b.cells.every((c, i) => i === 0 || c.x === b.cells[i - 1].x + b.cells[i - 1].w + barTheme.gap)
      && Math.max(...ws) - Math.min(...ws) <= 1;
  };
  // Stage 11: Pursuers have 3 pips, the Magus 2.
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 10; });
  await placeOne('pursuer', 1000, 200);
  await page.waitForTimeout(80);
  const hidden = await bar();
  hidden.visible === false
    ? pass("an undamaged enemy shows no bar by default (DEBUG.healthBars 'damaged': a swarm is not a wall of bars)")
    : fail(`full bar drawn by default: ${JSON.stringify(hidden)}`);
  // The rest of this section checks bar geometry, so draw every bar.
  await page.evaluate(() => { window.__balance.DEBUG.healthBars = 'always'; });
  await page.waitForTimeout(80);
  const full = await bar();
  full.max === 3 && full.segments === 3 && full.filled === 3 && full.visible
    ? pass("with DEBUG.healthBars 'always', a Stage 11 Pursuer shows 3 segments, all filled [#][#][#]")
    : fail(`full bar: ${JSON.stringify(full)}`);
  // One hit through the scene's real hit funnel.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const e = g.director.enemies[0];
    g.onTargetHit(e, e.takeHit());
  });
  await page.waitForTimeout(80);
  const hit = await bar();
  hit.pips === 2 && hit.segments === 3 && hit.filled === 2
    ? pass('after one hit: 3 segments, 2 filled [#][#][ ]')
    : fail(`bar after one hit: ${JSON.stringify(hit)}`);
  hit.cells.map((c) => c.filled).join() === 'true,true,false' && tiles(hit)
    && hit.cells[2].w === hit.cells[0].w
    ? pass(`the hit emptied exactly one equal-width segment (${hit.cells.map((c) => `${c.w}px${c.filled ? '#' : ' '}`).join(' | ')})`)
    : fail(`segments after one hit: ${JSON.stringify(hit)}`);
  await placeOne('magus', 1000, 200);
  await page.waitForTimeout(80);
  const pBar = await bar();
  pBar.segments === 2 && pBar.filled === 2
    ? pass('a Stage 11 Magus shows 2 segments')
    : fail(`pursuer bar: ${JSON.stringify(pBar)}`);

  // Constant physical width: more pips add dividers, never width.
  const widths = [];
  for (const [stageIndex, type] of [[0, 'basic'], [0, 'pursuer'], [10, 'magus'], [10, 'basic'], [10, 'pursuer']] as const) {
    await page.evaluate((s) => { window.__warmup.scene.getScene('GameScene').director.stageIndex = s; }, stageIndex);
    await placeOne(type, 1000, 200);
    await page.waitForTimeout(80);
    widths.push({ stage: stageIndex + 1, type, ...(await bar()) });
  }
  widths.map((w) => w.max).join('/') === '1/2/2/1/3' && widths.every((w) => w.segments === w.max && w.filled === w.max)
    ? pass(`live bars show one segment per max pip across stages (${widths.map((w) => `S${w.stage} ${w.type} ${w.segments}`).join(', ')})`)
    : fail(`segment counts: ${JSON.stringify(widths.map((w) => ({ stage: w.stage, type: w.type, max: w.max, segments: w.segments })))}`);
  widths.every((w) => w.width === barTheme.width && tiles(w))
    ? pass(`every bar is ${barTheme.width}px wide whatever its pips: ${widths.map((w) => `[${w.cells.map((c) => c.w).join('|')}]`).join(' ')}`)
    : fail(`bar widths: ${JSON.stringify(widths.map((w) => ({ max: w.max, width: w.width, cells: w.cells })))}`);
  widths[0].cells.length === 1 && widths[0].cells[0].w === barTheme.width
    && widths.filter((w) => w.max <= 4).every((w) => w.cells.every((c) => c.w === w.cells[0].w))
    ? pass('1 pip fills the whole bar; 2, 3 and 4 pips split it into exactly equal segments')
    : fail(`even split: ${JSON.stringify(widths.map((w) => w.cells.map((c) => c.w)))}`);

  // The renderer is generic: any pip count tiles the same width, each segment one remaining pip.
  const generic = await page.evaluate(() => {
    const e = window.__warmup.scene.getScene('GameScene').director.enemies[0];
    const b = e.view.hpBar;
    const out = [];
    for (let max = 1; max <= 9; max++) {
      for (let pips = 0; pips <= max; pips++) {
        b.update(500, 100, pips, max, 0);
        out.push({ max, pips, segments: b.segments, filled: b.filled, width: b.width, cells: b.cells.map((c) => ({ ...c })) });
      }
    }
    return out;
  });
  const badGeneric = generic.find((r) => r.segments !== r.max || r.filled !== r.pips || !tiles(r)
    || r.cells.some((c, i) => c.filled !== i < r.pips));
  !badGeneric
    ? pass(`1-9 pips at every fill level: ${barTheme.width}px wide, segments within 1px, filled cells == remaining pips`)
    : fail(`generic bar: ${JSON.stringify(badGeneric)}`);
  await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 0; });

  // === Stage composition =====================================================
  section('Stage composition');
  const pursuersIn = (stage) => stage.waves.reduce((n, w) => n + (w.pursuer ?? 0), 0);
  const basicsIn = (stage) => stage.waves.reduce((n, w) => n + (w.basic ?? 0), 0);
  const share = (stages) => {
    const p = stages.reduce((n, s) => n + pursuersIn(s), 0);
    const b = stages.reduce((n, s) => n + basicsIn(s), 0);
    return p / (p + b);
  };
  pursuersIn(cfg.stages[0]) === 0 && cfg.stages.slice(1).every((s) => pursuersIn(s) > 0)
    ? pass('Stage 1 fields basic targets only; every later stage includes Pursuers')
    : fail(`pursuers per stage: ${cfg.stages.map(pursuersIn).join(', ')}`);
  share(cfg.stages.slice(0, 3)) < share(cfg.stages.slice(-3))
    ? pass(`Pursuer share grows: ${Math.round(share(cfg.stages.slice(0, 3)) * 100)}% in Stages 1-3 -> ${Math.round(share(cfg.stages.slice(-3)) * 100)}% in the last three`)
    : fail('Pursuer share did not grow across the run');
  cfg.stages.every((s) => basicsIn(s) > 0)
    ? pass('basic targets appear in every stage (mixed pressure throughout)')
    : fail(`basics per stage: ${cfg.stages.map(basicsIn).join(', ')}`);

  // === PART I: pause freezes the new systems =================================
  section('PART I: pause freezes the new systems');
  // Fresh live enemy: the score test above killed one directly, bypassing the
  // kill callback, so that enemy is permanently dead.
  await placeOne('pursuer', 900, 360, 9999);
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']); g.passive.reset(); g.player.hp = 100;
    g.player.x = 640; g.player.y = 360;
    const e = g.director.enemies[0];
    if (e) { e.x = 900; e.y = 360; e.hp = 9999; }
  });
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').passive.stackCount > 0, null, { timeout: 4000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const pz0 = await G();
  await page.waitForTimeout(800);
  const pz1 = await G();
  Math.abs(pz1.passiveRemaining - pz0.passiveRemaining) < 1e-6
    ? pass(`passive timer frozen while paused (${Math.round(pz0.passiveRemaining)}ms)`)
    : fail(`passive ticked ${pz0.passiveRemaining - pz1.passiveRemaining}ms while paused`);
  Math.abs(pz1.qCd - pz0.qCd) < 1e-6 ? pass('Q cooldown frozen while paused') : fail('Q cooldown ticked while paused');
  pz1.enemies[0] && pz0.enemies[0] && pz1.enemies[0].x === pz0.enemies[0].x && pz1.enemies[0].y === pz0.enemies[0].y
    ? pass('pursuer movement frozen while paused')
    : fail('enemy moved while paused');
  pz1.playerHp === pz0.playerHp ? pass('no pursuer damage lands while paused') : fail('player took damage while paused');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  (await G()).clock > pz1.clock ? pass('everything resumes after unpause') : fail('clock did not resume');

  await finish();
});
