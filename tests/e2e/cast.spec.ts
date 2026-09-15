import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('cast: Q/W/E cast windows, committed aim, buffered orders, lockout, Flash, pause, HUD', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 400);

  const cfg = await page.evaluate(() => ({
    qCast: window.__balance.SKILLSHOT_Q.castTimeMs,
    autoWindup: window.__warmup.scene.getScene('GameScene').attacks.windupMs,
    wCast: window.__balance.SKILLSHOT_W.castTimeMs,
    eCast: window.__balance.BLINK_E.castTimeMs,
    wCd: window.__balance.SKILLSHOT_W.cooldownMs,
    eCd: window.__balance.BLINK_E.cooldownMs,
    eRange: window.__balance.BLINK_E.range,
  }));

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
        e.x = s.x; e.y = s.y; e.hp = hp; e.clearMark();
        // Basic slimes hold their spot (they now close in on the player); Pursuers still chase.
        e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        d.enemies.push(e);
      }
      g.enemies = d.enemies;
      g.player.x = 640; g.player.y = 360; g.player.hp = 100; g.player.stop();
      g.attacks.cancel(); g.attacks.state = 'idle'; g.attacks.clearMissiles();
      g.skillshot.clear(); g.blink.clear();
      g.cast.cancel(); g.cooldowns.reset(); g.passive.reset();
    }, { spots, hp });

  /**
   * Press a key and sample game state every frame, using the GAME CLOCK for
   * timing so the measurement matches simulated time, not wall time.
   */
  const sampleCast = (key, ms = 700) =>
    page.evaluate(({ key, ms }) => new Promise<any>((res) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const t0 = g.clock.now;
      const out = [];
      const tick = () => {
        out.push({
          t: g.clock.now - t0,
          casting: g.cast.isCasting,
          ability: g.cast.castingAbility,
          progress: g.cast.progress,
          wMissiles: g.skillshot.missiles.length,
          px: g.player.x, py: g.player.y,
          rooted: g.player.isRooted,
          bolts: g.blink.boltsInFlight,
        });
        if (g.clock.now - t0 < ms) requestAnimationFrame(tick);
        else res(out);
      };
      // Fire the key on the next frame so t0 is genuinely pre-cast.
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      tick();
    }), { key, ms });

  // === Timing hierarchy vs the auto windup ===================================
  section('Timing hierarchy vs the auto windup');
  // The whole point of this pass: ability casts live in the same band as the
  // auto-attack windup, with a small, intentional ordering between them.
  cfg.qCast < cfg.wCast && cfg.wCast < cfg.eCast
    ? pass(`cast hierarchy Q ${cfg.qCast} < W ${cfg.wCast} < E ${cfg.eCast} (auto windup ${Math.round(cfg.autoWindup)}ms)`)
    : fail(`hierarchy wrong: Q ${cfg.qCast} W ${cfg.wCast} E ${cfg.eCast}`);
  Math.abs(cfg.qCast - cfg.autoWindup) <= 30
    ? pass(`Q (${cfg.qCast}ms) is within 30ms of the auto windup (${Math.round(cfg.autoWindup)}ms)`)
    : fail(`Q ${cfg.qCast}ms vs auto windup ${Math.round(cfg.autoWindup)}ms`);
  cfg.eCast - cfg.autoWindup <= 60
    ? pass(`E (${cfg.eCast}ms) stays within 60ms of the auto windup — short commitment, not a channel`)
    : fail(`E ${cfg.eCast}ms is ${Math.round(cfg.eCast - cfg.autoWindup)}ms past the auto windup`);

  // === Q cast timing =========================================================
  section('Q cast timing');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  const qSamples = await sampleCast('q', 600);

  const qStart = qSamples.find((s) => s.casting);
  qStart && qStart.t < 40 ? pass('Q enters a cast state on keypress') : fail('Q did not enter a cast state');
  const qAtStart = qSamples.find((s) => s.t >= 0 && s.t < 30);
  qAtStart && qAtStart.wMissiles === 0 ? pass('t=0ms: no Q projectile yet') : fail('Q projectile existed at t=0');

  const qFirst = qSamples.find((s) => s.wMissiles > 0);
  qFirst && Math.abs(qFirst.t - cfg.qCast) <= 40
    ? pass(`Q projectile spawns at ${Math.round(qFirst.t)}ms (configured ${cfg.qCast}ms)`)
    : fail(`Q projectile at ${qFirst ? Math.round(qFirst.t) : 'never'}ms, expected ~${cfg.qCast}`);
  qSamples.filter((s) => s.casting).every((f) => f.rooted)
    ? pass('player is rooted for the Q cast')
    : fail('player not rooted during Q cast');

  // === W cast timing =========================================================
  section('W cast timing');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  const wSamples = await sampleCast('w', 700);

  const wFirstMissile = wSamples.find((s) => s.wMissiles > 0);
  const wCastFrames = wSamples.filter((s) => s.casting && s.ability === 'w');
  const wStart = wSamples.find((s) => s.casting);

  wStart && wStart.t < 40 ? pass('W enters a cast state on keypress') : fail('W did not enter a cast state');
  const atStart = wSamples.find((s) => s.t >= 0 && s.t < 30);
  atStart && atStart.wMissiles === 0 ? pass('t=0ms: no W projectile yet') : fail('W projectile existed at t=0');

  const mid = wSamples.find((s) => s.t >= cfg.wCast / 2 && s.t < cfg.wCast / 2 + 40);
  mid && mid.wMissiles === 0 && mid.casting
    ? pass(`t=~${Math.round(mid.t)}ms: still casting, still no projectile (progress ${mid.progress.toFixed(2)})`)
    : fail(`mid-cast state wrong: ${JSON.stringify(mid)}`);

  wFirstMissile && Math.abs(wFirstMissile.t - cfg.wCast) <= 40
    ? pass(`W projectile spawns at ${Math.round(wFirstMissile.t)}ms (configured ${cfg.wCast}ms)`)
    : fail(`W projectile at ${wFirstMissile ? Math.round(wFirstMissile.t) : 'never'}ms, expected ~${cfg.wCast}`);

  const wProgressMonotonic = wCastFrames.every((f, i, a) => i === 0 || f.progress >= a[i - 1].progress - 0.02);
  wProgressMonotonic ? pass('W cast progress advances monotonically with the clock') : fail('W progress not monotonic');
  wCastFrames.every((f) => f.rooted) ? pass('player is rooted for the whole W cast') : fail('player not rooted during W cast');

  // W cooldown starts at cast START, not at release.
  section('W cooldown starts at cast start');
  const wCdAtStart = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').cooldowns.remainingMs('w'));
  await setup();
  await page.mouse.move(1100, 360);
  const wCdCheck = await page.evaluate((wCd) => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    requestAnimationFrame(() => res({ cd: g.cooldowns.remainingMs('w'), casting: g.cast.isCasting, full: wCd }));
  }), cfg.wCd);
  wCdCheck.casting && wCdCheck.cd > cfg.wCd - 120
    ? pass(`W cooldown starts at cast START (${Math.round(wCdCheck.cd)}ms of ${cfg.wCd}ms while still casting)`)
    : fail(`W cooldown at cast start: ${JSON.stringify(wCdCheck)}`);

  // === W direction is committed at keypress ==================================
  section('W direction is committed at keypress');
  await setup();
  await page.mouse.move(1100, 360);            // aim right
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
  });
  await page.mouse.move(640, 60);              // yank the mouse up mid-cast
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').skillshot.missiles.length > 0, null, { timeout: 2000 });
  const committed = await page.evaluate(() => {
    const m = window.__warmup.scene.getScene('GameScene').skillshot.missiles[0].projectile;
    return { vx: m.vx, vy: m.vy };
  });
  committed.vx > 0 && Math.abs(committed.vy) < Math.abs(committed.vx) * 0.3
    ? pass('W fires along the direction committed at keypress, not the moved cursor')
    : fail(`W direction drifted: vx=${committed.vx.toFixed(0)} vy=${committed.vy.toFixed(0)}`);

  // === E cast timing =========================================================
  section('E cast timing');
  // Enemy sits near the blink DESTINATION so the post-blink bolt can acquire it.
  await setup([{ type: 'basic', x: 1000, y: 360 }]);
  await page.mouse.move(900, 360);             // 260px right, inside E range
  await page.waitForTimeout(60);
  const eSamples = await sampleCast('e', 700);

  const eStart = eSamples.find((s) => s.casting);
  eStart && eStart.t < 40 ? pass('E enters a cast state on keypress') : fail('E did not enter a cast state');

  const eOrigin = eSamples[0];
  const eMid = eSamples.find((s) => s.t >= cfg.eCast / 2 && s.t < cfg.eCast / 2 + 40);
  eMid && Math.abs(eMid.px - eOrigin.px) < 2 && eMid.casting
    ? pass(`t=~${Math.round(eMid.t)}ms: player has NOT moved yet (progress ${eMid.progress.toFixed(2)})`)
    : fail(`E moved the player mid-cast: ${JSON.stringify(eMid)}`);

  const eBlinkFrame = eSamples.find((s) => Math.abs(s.px - eOrigin.px) > 20);
  eBlinkFrame && Math.abs(eBlinkFrame.t - cfg.eCast) <= 45
    ? pass(`E blinks at ${Math.round(eBlinkFrame.t)}ms (configured ${cfg.eCast}ms)`)
    : fail(`E blinked at ${eBlinkFrame ? Math.round(eBlinkFrame.t) : 'never'}ms, expected ~${cfg.eCast}`);

  // The blink is instantaneous, not a glide: one frame covers the whole distance.
  const idx = eSamples.indexOf(eBlinkFrame);
  const jump = idx > 0 ? Math.hypot(eBlinkFrame.px - eSamples[idx - 1].px, eBlinkFrame.py - eSamples[idx - 1].py) : 0;
  jump > 100
    ? pass(`blink is instantaneous — ${Math.round(jump)}px covered in a single frame`)
    : fail(`E appears to glide: only ${Math.round(jump)}px in the blink frame`);

  // Bolt fires only after the blink.
  const boltFrame = eSamples.find((s) => s.bolts > 0);
  boltFrame && eBlinkFrame && boltFrame.t >= eBlinkFrame.t - 1
    ? pass('E bolt is released only after the blink completes')
    : fail(`bolt at ${boltFrame?.t}ms vs blink at ${eBlinkFrame?.t}ms`);

  // === Buffered movement =====================================================
  section('Buffered movement');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  const buffered = await page.evaluate(({ wCast }) => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const t0 = g.clock.now;
    const out = { movedDuringCast: false, castCompleted: false, movingAfter: false, missiles: 0 };
    const startX = g.player.x;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));

    // Issue a move order 80ms into the cast, via the real command surface.
    let issued = false;
    const tick = () => {
      const t = g.clock.now - t0;
      if (!issued && t > 80) {
        issued = true;
        g.commandHandlerForTest
          ? g.commandHandlerForTest.commandMove(200, 360)
          : window.__warmup.scene.getScene('GameScene').inputs.cmd.commandMove(200, 360);
      }
      if (issued && g.cast.isCasting && Math.abs(g.player.x - startX) > 3) out.movedDuringCast = true;
      if (!g.cast.isCasting && t > 100) {
        out.castCompleted = true;
        out.missiles = g.skillshot.missiles.length;
        out.movingAfter = g.player.isMoving;
        res(out);
        return;
      }
      if (t > 1200) { res(out); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }), { wCast: cfg.wCast });

  !buffered.movedDuringCast ? pass('a move order during the cast does NOT move the player yet') : fail('player moved mid-cast');
  buffered.castCompleted && buffered.missiles > 0 ? pass('the move order does not cancel W — it still releases') : fail('W was cancelled by the move order');
  buffered.movingAfter ? pass('buffered movement begins immediately once the cast resolves') : fail('buffered move never started');

  // === Buffered attack orders and Stop =======================================
  section('Buffered attack orders and Stop');
  /**
   * Start a cast with `key`, deliver real `inputs` while it is pending, and
   * sample every frame for 700ms of game time. Capture-phase listeners record
   * whether the game was still casting when each input reached the page, so no
   * check judges an input that actually arrived after the cast resolved.
   */
  const castWithInputs = async (key, inputs) => {
    await page.evaluate((key) => {
      const g = window.__warmup.scene.getScene('GameScene');
      const probe: any = {
        t0: g.clock.now, started: g.metrics.attacksStarted, px: g.player.x, py: g.player.y,
        frames: [], castingAtInput: [], done: false,
      };
      probe.record = () => probe.castingAtInput.push(g.cast.isCasting);
      (window as any).__castProbe = probe;
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      window.addEventListener('pointerdown', probe.record, true);
      window.addEventListener('keydown', probe.record, true);
      const tick = () => {
        const t = g.clock.now - probe.t0;
        probe.frames.push({
          t,
          casting: g.cast.isCasting,
          state: g.attacks.state,
          started: g.metrics.attacksStarted,
          hasTarget: !!g.attacks.currentTarget,
          source: g.attacks.targetSource,
          moving: g.player.isMoving,
          px: g.player.x, py: g.player.y,
          missiles: g.skillshot.missiles.length,
        });
        if (t < 700) requestAnimationFrame(tick); else probe.done = true;
      };
      tick();
    }, key);
    for (const input of inputs) await input();
    await page.waitForFunction(() => (window as any).__castProbe.done, null, { timeout: 5000 });
    return page.evaluate(() => {
      const probe = (window as any).__castProbe;
      window.removeEventListener('pointerdown', probe.record, true);
      window.removeEventListener('keydown', probe.record, true);
      const { record, ...data } = probe;
      return data;
    });
  };
  /** Frames from the first one after the cast resolved. */
  const afterResolve = (probe) => {
    const i = probe.frames.findIndex((f, idx) => idx > 0 && !f.casting && probe.frames[idx - 1].casting);
    return i < 0 ? { resolveT: null, frames: [] } : { resolveT: probe.frames[i].t, frames: probe.frames.slice(i) };
  };
  const checkBufferedAttack = (probe, label) => {
    const during = probe.frames.filter((f) => f.casting);
    const { resolveT, frames: after } = afterResolve(probe);
    const firstWindup = after.find((f) => f.state === 'windup');
    probe.castingAtInput.length === 1 && probe.castingAtInput[0]
      ? pass(`${label} reached the game mid-cast`)
      : fail(`${label} did not arrive mid-cast: ${JSON.stringify(probe.castingAtInput)}`);
    during.length > 0 && during.every((f) => f.state !== 'windup' && f.started === probe.started && !f.hasTarget)
      ? pass(`${label}: no auto starts during the cast (${during.length} cast frames)`)
      : fail(`${label}: auto activity during the cast: ${JSON.stringify(during.find((f) => f.state === 'windup' || f.started !== probe.started || f.hasTarget) ?? during.length)}`);
    firstWindup && resolveT !== null && firstWindup.t - resolveT <= 50 && firstWindup.source === 'direct'
      ? pass(`${label}: buffered attack starts its windup ${Math.round(firstWindup.t - resolveT)}ms after the cast resolves`)
      : fail(`${label}: buffered attack after cast — resolve ${resolveT}ms, first windup ${JSON.stringify(firstWindup)}`);
  };

  // Right-click an in-range enemy during W (aimed straight up, away from it).
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.move(640, 80);
  await page.waitForTimeout(60);
  checkBufferedAttack(
    await castWithInputs('w', [() => page.mouse.click(760, 360, { button: 'right' })]),
    'right-click enemy during W',
  );

  // Left-click the same enemy during Q (also aimed away).
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.move(640, 80);
  await page.waitForTimeout(60);
  checkBufferedAttack(
    await castWithInputs('q', [() => page.mouse.click(760, 360, { button: 'left' })]),
    'left-click enemy during Q',
  );

  // Buffer an attack order, then S, during W: nothing replays, the cast still releases.
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.move(640, 80);
  await page.waitForTimeout(60);
  const stopAttack = await castWithInputs('w', [
    () => page.mouse.click(760, 360, { button: 'right' }),
    () => page.keyboard.press('s'),
  ]);
  stopAttack.castingAtInput.length === 2 && stopAttack.castingAtInput.every(Boolean)
    ? pass('attack order and S both reached the game mid-cast')
    : fail(`attack order / S did not both arrive mid-cast: ${JSON.stringify(stopAttack.castingAtInput)}`);
  stopAttack.frames.every((f) => f.state !== 'windup' && f.started === stopAttack.started && !f.hasTarget)
    ? pass('S mid-cast discards the buffered attack order — no auto after the cast')
    : fail(`buffered attack survived S: ${JSON.stringify(stopAttack.frames.find((f) => f.state === 'windup' || f.hasTarget))}`);
  afterResolve(stopAttack).resolveT !== null && stopAttack.frames.some((f) => f.missiles > 0)
    ? pass('S does not cancel the cast itself — W still releases')
    : fail(`W did not release after S: resolve ${afterResolve(stopAttack).resolveT}, missiles seen ${stopAttack.frames.some((f) => f.missiles > 0)}`);

  // Buffer a move, then S, during W: the player stays put after the cast.
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.move(640, 80);
  await page.waitForTimeout(60);
  const stopMove = await castWithInputs('w', [
    () => page.mouse.click(300, 380, { button: 'right' }),
    () => page.keyboard.press('s'),
  ]);
  const stopMoveAfter = afterResolve(stopMove).frames;
  stopMove.castingAtInput.length === 2 && stopMove.castingAtInput.every(Boolean)
    ? pass('move order and S both reached the game mid-cast')
    : fail(`move order / S did not both arrive mid-cast: ${JSON.stringify(stopMove.castingAtInput)}`);
  stopMoveAfter.length > 0 && stopMoveAfter.every((f) => !f.moving && f.px === stopMove.px && f.py === stopMove.py)
    ? pass(`S mid-cast discards the buffered move — player stays put for ${stopMoveAfter.length} frames after the cast`)
    : fail(`buffered move survived S: ${JSON.stringify(stopMoveAfter.find((f) => f.moving || f.px !== stopMove.px) ?? stopMoveAfter.length)}`);

  // === Ability lockout =======================================================
  section('Ability lockout');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  const lockout = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    requestAnimationFrame(() => {
      const during = { casting: g.cast.isCasting, ability: g.cast.castingAbility };
      // Spam every other ability mid-cast.
      for (const k of ['q', 'w', 'e', 'f']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      }
      requestAnimationFrame(() => {
        res({
          during,
          stillE: g.cast.castingAbility,
          qMissiles: g.skillshot.missiles.length,
          qCd: g.cooldowns.remainingMs('q'),
          flashCd: g.cooldowns.remainingMs('flash'),
        });
      });
    });
  }));
  lockout.during.casting && lockout.stillE === 'e'
    ? pass('spamming Q/W/E/F mid-cast does not overwrite the pending cast')
    : fail(`cast was disturbed: ${JSON.stringify(lockout)}`);
  lockout.qMissiles === 0 && lockout.qCd === 0 ? pass('Q is ignored during a cast') : fail('Q fired during a cast');
  lockout.flashCd === 0 ? pass('Flash is ignored during a cast') : fail('Flash fired during a cast');

  // === Flash stays instant ===================================================
  section('Flash stays instant');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  const flashTiming = await page.evaluate(() => new Promise<any>((res) => {
    const g = window.__warmup.scene.getScene('GameScene');
    const startX = g.player.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    requestAnimationFrame(() => res({ moved: Math.abs(g.player.x - startX), casting: g.cast.isCasting }));
  }));
  flashTiming.moved > 100 && !flashTiming.casting
    ? pass(`Flash is still instant — ${Math.round(flashTiming.moved)}px on the very next frame, no cast state`)
    : fail(`Flash timing: ${JSON.stringify(flashTiming)}`);

  // === Auto interaction ======================================================
  section('Auto interaction');
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.click(760, 360, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup', null, { timeout: 4000 });
  await page.mouse.move(1100, 360);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
  await page.waitForTimeout(80);
  const autoCancel = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { attackState: g.attacks.state, casting: g.cast.isCasting, autoMissiles: g.attacks.missilesInFlight };
  });
  autoCancel.attackState !== 'windup' && autoCancel.casting
    ? pass('W cancels an uncommitted auto windup and begins its cast')
    : fail(`auto/cast interaction: ${JSON.stringify(autoCancel)}`);

  // Already-released auto keeps flying.
  await setup([{ type: 'basic', x: 760, y: 360 }]);
  await page.mouse.click(760, 360, { button: 'right' });
  await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').attacks.missilesInFlight > 0, null, { timeout: 4000 });
  // The missile may land within a frame or two, so assert on the DAMAGE — that
  // is the real question: does a committed auto still resolve through a cast?
  const hpBeforeE = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].hp);
  await page.mouse.move(1100, 360);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })));
  const castingNow = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').cast.isCasting);
  await page.waitForTimeout(500);
  const hpAfterE = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').director.enemies[0].hp);
  castingNow && hpAfterE < hpBeforeE
    ? pass(`an already-released auto still lands through the E cast (${hpBeforeE - hpAfterE} damage)`)
    : fail(`committed auto: casting=${castingNow} damage=${hpBeforeE - hpAfterE}`);

  // === Pause preserves partial cast progress =================================
  section('Pause preserves partial cast progress');
  await setup([{ type: 'basic', x: 200, y: 120 }]);
  await page.mouse.move(900, 360);
  await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })));
  await page.waitForTimeout(110);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  const pz0 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { progress: g.cast.progress, casting: g.cast.isCasting, px: g.player.x, clock: g.clock.now };
  });
  await page.waitForTimeout(2500);          // 2.5 real seconds, 10x the cast time
  const pz1 = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { progress: g.cast.progress, casting: g.cast.isCasting, px: g.player.x, clock: g.clock.now };
  });
  pz1.casting && Math.abs(pz1.progress - pz0.progress) < 1e-6
    ? pass(`cast frozen mid-window while paused (progress held at ${pz0.progress.toFixed(2)})`)
    : fail(`cast advanced while paused: ${pz0.progress} -> ${pz1.progress}, casting=${pz1.casting}`);
  pz1.px === pz0.px ? pass('no blink happened during the pause') : fail('player blinked while paused');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterResume = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return { casting: g.cast.isCasting, px: g.player.x };
  });
  !afterResume.casting && Math.abs(afterResume.px - pz0.px) > 20
    ? pass('the remaining cast completes normally after resuming')
    : fail(`after resume: ${JSON.stringify(afterResume)}`);

  // === HUD cast feedback =====================================================
  section('HUD cast feedback');
  await setup();
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
  await page.waitForTimeout(90);
  const hudCast = await page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    const hud = g.getHudState();
    return {
      hudAbility: hud.castingAbility,
      hudProgress: hud.castProgress,
      slotVisible: ui.abilityBar.slots[1].castGfx.visible,
      qSlotVisible: ui.abilityBar.slots[0].castGfx.visible,
    };
  });
  hudCast.hudAbility === 'w' && hudCast.slotVisible && !hudCast.qSlotVisible
    ? pass(`the W slot fills during its cast (progress ${hudCast.hudProgress.toFixed(2)}), other slots unaffected`)
    : fail(`HUD cast feedback: ${JSON.stringify(hudCast)}`);

  await finish();
});
