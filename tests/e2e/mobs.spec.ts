import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('mobs: passive stacks, Q cooldown refund, Pursuer AI, spawn weights, HP scaling, stage countdown, pause', async ({ page }, testInfo) => {
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
      level: hud.difficultyLevel,
      nextStage: hud.nextStage, untilStage: hud.secondsUntilNextStage,
      hpMult: g.director.hpMultiplier,
      weights: g.director.spawnWeights,
      enemies: g.director.enemies.map((e) => ({ type: e.archetype, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, active: e.active, r: e.radius })),
      px: g.player.x, py: g.player.y, playerHp: g.player.hp,
      paused: g.isPaused,
      clock: g.clock.now,
    };
  });
  const setElapsed = (s) => page.evaluate((s) => {
    window.__warmup.scene.getScene('GameScene').difficulty.elapsedSeconds = s;
  }, s);
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
    d.slots.forEach((s) => s.enemy.destroy());
    d.slots.length = 0;
    const e = d.spawn(type);
    e.x = x; e.y = y;
    if (hp) { e.hp = hp; }
    e.__tag = 1;
    d.slots.push({ enemy: e, respawnAt: null });
    g.enemies = d.enemies;
    g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles(); g.skillshot.clear();
    g.player.x = 640; g.player.y = 360; g.player.stop();
    return { type: e.archetype, hp: e.hp, maxHp: e.maxHp, r: e.radius };
  }, { type, x, y, hp });
  const cfg = await page.evaluate(() => ({
    qCd: window.__balance.SKILLSHOT_Q.cooldownMs,
    qSpeed: window.__balance.SKILLSHOT_Q.speed,
    qRefund: window.__balance.SKILLSHOT_Q.hitCooldownReductionMs,
    passive: window.__balance.PASSIVE,
    pursuer: window.__balance.PURSUER,
    basicHp: window.__balance.TARGETS.maxHp,
    playerSpeed: window.__balance.PLAYER.moveSpeed,
    scaling: window.__balance.ENEMY_SCALING,
  }));

  // === Config sanity =========================================================
  section('Config sanity');
  cfg.qCd === 3000 ? pass(`Q cooldown is ${cfg.qCd}ms (was 4000)`) : fail(`Q cooldown ${cfg.qCd}`);
  cfg.qSpeed === 1250 ? pass(`Q speed ${cfg.qSpeed}px/s (was 1900, -34%)`) : fail(`Q speed ${cfg.qSpeed}`);

  // === PART A: passive =======================================================
  section('PART A: passive');
  await calm();
  await setElapsed(0);
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

  // Cooldown must be base / multiplier — sampled in ONE snapshot so the
  // difficulty ramp cannot advance between the two reads.
  const formula = await page.evaluate(() => {
    const a = window.__warmup.scene.getScene('GameScene').attacks;
    const p = window.__warmup.scene.getScene('GameScene').passive;
    return { cd: a.cooldownMs, base: a.baseCooldownMs, mult: p.attackSpeedMultiplier };
  });
  Math.abs(formula.cd - formula.base / formula.mult) < 1e-6
    ? pass(`cooldown == rampCooldown / passiveMultiplier (${formula.base.toFixed(0)} / ${formula.mult} = ${formula.cd.toFixed(0)}ms)`)
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
  const expectedHp = Math.round(cfg.basicHp * cfg.pursuer.baseHpMultiplier * (await G()).hpMult);
  spawned.maxHp === expectedHp
    ? pass(`pursuer HP ${spawned.maxHp} = basic ${cfg.basicHp} x ${cfg.pursuer.baseHpMultiplier} (x${(await G()).hpMult} scaling)`)
    : fail(`pursuer HP ${spawned.maxHp}, expected ${expectedHp}`);
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
      if (e.state === 'windup' && e.windupRing.visible) res(true);
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
  (await G()).enemies[0].hp < before ? pass('right-click auto-attacks the pursuer') : fail('autos did not damage the pursuer');

  // T attack-move onto it.
  const beforeT = (await G()).enemies[0].hp;
  await page.mouse.move(800, 360);
  await page.keyboard.press('t');
  await page.waitForTimeout(1400);
  (await G()).enemies[0].hp < beforeT ? pass('T attack-move engages the pursuer') : fail('T did not engage the pursuer');

  // Q it -> damage AND a passive stack.
  await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.cooldowns.reduce(999999, ['q']); g.passive.reset();
    g.player.x = 640; g.player.y = 360;
    const e = g.director.enemies[0]; e.x = 900; e.y = 360;
  });
  const beforeQ = (await G()).enemies[0].hp;
  await page.mouse.move(1100, 360);
  await page.keyboard.press('q');
  await page.waitForTimeout(800);
  const afterQ = await G();
  afterQ.enemies[0].hp < beforeQ ? pass('Q damages the pursuer') : fail('Q did not damage the pursuer');
  afterQ.stacks === 1 ? pass('Q hitting a pursuer grants a passive stack') : fail(`stacks after pursuer Q: ${afterQ.stacks}`);

  // Kill it and check the score multiplier.
  const scoreCheck = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const before = g.scoring.score;
    const e = g.director.enemies[0];
    const mult = e.scoreMultiplier;
    e.hp = 1;
    e.takeDamage(1);
    g.onTargetDamaged ? null : null;
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

  // === Spawn weighting by difficulty ========================================
  section('Spawn weighting by difficulty');
  const weightsAt = async (level) => {
    // Drive elapsed to the time that produces this level.
    await page.evaluate((lv) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const D = window.__balance.DIFFICULTY, R = window.__balance.ROUND;
      const tAt = (lv - 1) / D.levels + 0.0001;
      const start = D.rampStartSeconds;
      const end = R.durationSeconds * D.rampCompleteAtRoundFraction;
      g.difficulty.elapsedSeconds = start + (end - start) * Math.pow(tAt, 1 / D.rampCurve);
    }, level);
    await page.waitForTimeout(50);
    const s = await G();
    return { level: s.level, weights: s.weights, hpMult: s.hpMult };
  };
  const w1 = await weightsAt(1);
  const w3 = await weightsAt(3);
  const w4 = await weightsAt(4);
  const w6 = await weightsAt(6);
  const w8 = await weightsAt(8);

  (w1.weights.pursuer ?? 0) === 0 && (w3.weights.pursuer ?? 0) === 0
    ? pass('difficulty 1-3: basic targets only (0% pursuer)')
    : fail(`early pursuer weight: D1 ${w1.weights.pursuer}, D3 ${w3.weights.pursuer}`);
  w4.weights.pursuer > 0
    ? pass(`pursuers appear at difficulty ${w4.level} (${Math.round(w4.weights.pursuer * 100)}%)`)
    : fail('no pursuers at difficulty 4');
  w6.weights.pursuer > w4.weights.pursuer && w8.weights.pursuer >= w6.weights.pursuer
    ? pass(`pursuer share grows: D4 ${Math.round(w4.weights.pursuer * 100)}% -> D6 ${Math.round(w6.weights.pursuer * 100)}% -> D8 ${Math.round(w8.weights.pursuer * 100)}%`)
    : fail('pursuer share did not grow with difficulty');
  w8.weights.basic > 0 ? pass('basic targets never disappear entirely') : fail('basic weight hit zero');

  // === HP scaling ============================================================
  section('HP scaling');
  Math.abs(w1.hpMult - 1) < 1e-9 && Math.abs(w3.hpMult - 1) < 1e-9
    ? pass('difficulty 1-3: 100% enemy HP')
    : fail(`early hp multiplier: ${w1.hpMult}, ${w3.hpMult}`);
  Math.abs(w4.hpMult - 1.05) < 1e-9 && Math.abs(w6.hpMult - 1.15) < 1e-9
    ? pass(`HP scales +${cfg.scaling.hpPerDifficulty * 100}%/level after D${cfg.scaling.hpRampStartDifficulty} (D4 ${w4.hpMult}, D6 ${w6.hpMult})`)
    : fail(`hp multipliers: D4 ${w4.hpMult}, D6 ${w6.hpMult}`);

  // === Stage countdown =======================================================
  section('Stage countdown');
  const countdown = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const D = window.__balance.DIFFICULTY, R = window.__balance.ROUND;
    const start = D.rampStartSeconds;
    const end = R.durationSeconds * D.rampCompleteAtRoundFraction;
    // Sit 2s before difficulty 4 lands.
    const tAt = 3 / D.levels;
    const timeAt4 = start + (end - start) * Math.pow(tAt, 1 / D.rampCurve);
    g.difficulty.elapsedSeconds = timeAt4 - 2;
    const hud = g.getHudState();
    return { until: hud.secondsUntilNextStage, next: hud.nextStage, level: hud.difficultyLevel };
  });
  Math.abs(countdown.until - 2) < 0.3 && countdown.next === 4
    ? pass(`stage countdown reports ${countdown.until.toFixed(1)}s until stage ${countdown.next}`)
    : fail(`countdown: ${JSON.stringify(countdown)}`);
  // Jumping elapsed also fires the "entered stage 3" banner, which correctly
  // takes priority for STAGE.bannerMs. Consume it so the countdown is visible.
  await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    const g = window.__warmup.scene.getScene('GameScene');
    ui.lastStage = g.getHudState().difficultyLevel;
    ui.stageBannerUntil = 0;
  });
  await page.waitForTimeout(120);
  const banner = await page.evaluate(() => {
    const ui = window.__warmup.scene.getScene('UIScene');
    return { visible: ui.stageText.visible, text: ui.stageText.text };
  });
  banner.visible && /STAGE 4 IN \d/.test(banner.text)
    ? pass(`countdown is on screen: "${banner.text}"`)
    : fail(`stage text: visible=${banner.visible} "${banner.text}"`);

  // === PART I: pause freezes the new systems =================================
  section('PART I: pause freezes the new systems');
  // Fresh live enemy: the score test above killed one directly, bypassing the
  // kill callback, so that slot holds a permanently dead enemy.
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
