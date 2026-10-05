import { test } from '@playwright/test';
import { startSuite } from './support/harness';

test('modes: the profile picks the mode, damage, stage-clear bonus, rosters (when specials debut, how many, wave size), run log per mode, start-screen picker + HUD tag', async ({ page }, testInfo) => {
  const { pass, fail, section, finish } = await startSuite(page, testInfo, 200, { mode: 'hard' });

  /** Save a mode to the profile and restart into a fresh round on it, arena quiet. */
  const playOn = async (mode: string) => {
    const round = await page.evaluate((mode) => {
      window.__profile.update((d: { mode: string }) => { d.mode = mode; });
      const g = window.__warmup.scene.getScene('GameScene');
      const before = g.getHudState().round;
      g.restartRound();
      return before;
    }, mode);
    await page.waitForFunction((r) => {
      const g = window.__warmup.scene.getScene('GameScene');
      return g.getHudState().round !== r && g.clock.now > 50;
    }, round);
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.enemyProjectiles.clear(); g.enemyProjectiles.nextSpawnAt = Number.POSITIVE_INFINITY;
      g.director.arriveAllNow();
      for (const e of g.director.enemies) {
        e.x = 1150; e.y = 100; e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Number.POSITIVE_INFINITY;
        if ('canSpit' in e) e.canSpit = false;
        if ('nextAttackAt' in e) e.nextAttackAt = Number.POSITIVE_INFINITY;
      }
      g.player.x = 300; g.player.y = 500; g.player.stop();
    });
  };
  /** HP lost to one scripted hit of `damage` from full health. */
  const hpLostTo = (damage: number, viaEnemy: boolean) => page.evaluate(({ damage, viaEnemy }) => {
    const g = window.__warmup.scene.getScene('GameScene');
    g.player.hp = g.player.maxHp; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
    if (viaEnemy) g.onEnemyHit(damage, 'pursuer'); else g.onPlayerHit(damage, 'edgeFire');
    return g.player.maxHp - g.player.hp;
  }, { damage, viaEnemy });
  /** Die on the spot; returns the round result once the run is over. */
  const die = async () => {
    await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      g.player.hp = 1; g.player.lastHitAt = Number.NEGATIVE_INFINITY;
      g.onPlayerHit(5, 'edgeFire');
    });
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null);
    return page.evaluate(() => window.__warmup.scene.getScene('GameScene').getRoundResult());
  };

  const cfg = await page.evaluate(() => ({ modes: window.__balance.MODES, defaultMode: window.__balance.DEFAULT_MODE }));

  // === 1. The mode is the profile's ===========================================
  section('1. The profile picks the mode');
  {
    const s = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      return { mode: g.mode.id, hud: g.getHudState().mode, profile: window.__profile.data.mode };
    });
    s.mode === 'hard' && s.hud === 'hard' && s.profile === 'hard'
      ? pass('a saved mode is the one the run plays on')
      : fail(`seeded mode: ${JSON.stringify(s)}`);
    cfg.defaultMode === 'normal' && Object.keys(cfg.modes).join() === 'easy,normal,hard'
      ? pass('three modes (easy, normal, hard); Normal is the default')
      : fail(`modes: ${JSON.stringify({ ids: Object.keys(cfg.modes), def: cfg.defaultMode })}`);
  }
  await playOn('nightmare');
  {
    const id = await page.evaluate(() => window.__warmup.scene.getScene('GameScene').mode.id);
    id === 'normal' ? pass('an unknown saved mode plays as Normal') : fail(`unknown mode played as ${id}`);
  }

  // === 2. Damage ==============================================================
  section('2. Damage');
  for (const mode of ['easy', 'normal', 'hard']) {
    await playOn(mode);
    const want = cfg.modes[mode].damageMultiplier;
    const direct = await hpLostTo(10, false);
    const swing = await hpLostTo(10, true);       // Stage 1: the stage's own damage scaling is ×1
    direct === 10 * want && swing === 10 * want
      ? pass(`${mode}: a 10-damage hit costs ${direct} HP (edge fire and enemy attacks alike)`)
      : fail(`${mode}: lost ${direct} / ${swing}, want ${10 * want}`);
  }
  cfg.modes.hard.damageMultiplier === 2 && cfg.modes.normal.damageMultiplier === 1 && cfg.modes.easy.damageMultiplier === 1
    ? pass('Hard doubles damage; Easy and Normal leave it alone')
    : fail(`multipliers: ${JSON.stringify(cfg.modes)}`);

  // === 2b. Stage-clear bonus ==================================================
  section('2b. Stage-clear bonus');
  const perStage = await page.evaluate(() => window.__balance.SCORE.stageMultiplierPerStage);
  for (const mode of ['easy', 'normal', 'hard']) {
    await playOn(mode);
    // Clear Stage 3's last wave through the real hit funnel.
    const got = await page.evaluate(() => {
      const g = window.__warmup.scene.getScene('GameScene');
      const d = g.director;
      d.stageIndex = 2; d.waveIndex = d.wavesInStage - 1; d.currentPhase = 'wave';
      d.spawnWave(); d.arriveAllNow();
      const before = { ...g.scoring.scoreFrom };
      for (const e of d.enemies) while (e.active) g.onTargetHit(e, e.takeHit());
      const from = g.scoring.scoreFrom;
      const popups = g.children.list
        .filter((o: { text?: unknown }) => typeof o.text === 'string' && /CLEAR$/.test(o.text as string))
        .map((o: { text: string }) => o.text);
      return { clear: from.clear - before.clear, hp: from.hp - before.hp, score: g.scoring.score, parts: from.kills + from.speed + from.hp + from.clear + from.kit, popups };
    });
    const want = Math.round(cfg.modes[mode].stageClearBonus * (1 + perStage * 2));
    got.clear === want && got.hp > 0 && got.score === got.parts
      ? pass(`${mode}: clearing Stage 3 pays +${got.clear} on top of the HP bonus`)
      : fail(`${mode}: ${JSON.stringify(got)}, want clear ${want}`);
    (want > 0 ? got.popups.join() === `+${want} CLEAR` : got.popups.length === 0)
      ? pass(`${mode}: ${want > 0 ? `it pops as "+${want} CLEAR"` : 'no bonus, no popup'}`)
      : fail(`${mode}: popups ${JSON.stringify(got.popups)}`);
  }
  cfg.modes.easy.stageClearBonus === 0 && cfg.modes.normal.stageClearBonus === 500 && cfg.modes.hard.stageClearBonus === 1500
    ? pass('the bonus is none on Easy, 500 on Normal, 1500 on Hard, × the stage multiplier')
    : fail(`bonuses: ${JSON.stringify(cfg.modes)}`);

  // === 2c. Rosters ============================================================
  section('2c. Rosters');
  const STAGES_READ = 20;
  type StageRead = { waves: Record<string, number>[]; waveSize: number; generated: boolean; unlocks: string[] };
  const rosters: Record<string, StageRead[]> = {};
  for (const mode of ['easy', 'normal', 'hard']) {
    await playOn(mode);
    rosters[mode] = await page.evaluate((n) => {
      const d = window.__warmup.scene.getScene('GameScene').director;
      const at = d.stageIndex;
      const out = [];
      for (let s = 0; s < n; s++) {
        const described = d.describeStage(s);
        d.stageIndex = s;
        out.push({ waves: described.waves, waveSize: d.difficulty.waveSize, generated: described.generated, unlocks: d.unlocksOn(s + 1) });
      }
      d.stageIndex = at;
      return out;
    }, STAGES_READ);
  }
  /** First 1-based stage that fields `mob`, and whether it is only ever in a stage's last wave. */
  const debut = (mode: string, mob: string) => rosters[mode].findIndex((st) => st.waves.some((w) => (w[mob] ?? 0) > 0)) + 1;
  const count = (mode: string, mobs: string[], from: number) => rosters[mode].slice(from - 1)
    .reduce((n, st) => n + st.waves.reduce((m, w) => m + mobs.reduce((k, mob) => k + (w[mob] ?? 0), 0), 0), 0);
  const want = { easy: { magus: 7, sovereign: 8, bulwark: 11 }, normal: { magus: 5, sovereign: 5, bulwark: 8 }, hard: { magus: 3, sovereign: 4, bulwark: 5 } };
  for (const mode of ['easy', 'normal', 'hard'] as const) {
    const got = { magus: debut(mode, 'magus'), sovereign: debut(mode, 'sovereign'), bulwark: debut(mode, 'bulwark') };
    JSON.stringify(got) === JSON.stringify(want[mode])
      ? pass(`${mode}: Magus from Stage ${got.magus}, Sovereign from ${got.sovereign}, Bulwark from ${got.bulwark}`)
      : fail(`${mode} debuts: ${JSON.stringify(got)}, want ${JSON.stringify(want[mode])}`);
    const announced = Object.entries(want[mode]).every(([mob, stage]) => rosters[mode][stage - 1].unlocks.includes(mob));
    announced ? pass(`${mode}: each is announced as a new threat on that stage`) : fail(`${mode} unlocks: ${JSON.stringify(rosters[mode].map((s) => s.unlocks))}`);
    // The capstone closes every stage from its debut, and appears nowhere else.
    const capstone = rosters[mode].every((st, i) => st.waves.every((w, wi) =>
      (w.bulwark ?? 0) > 0 === (i + 1 >= want[mode].bulwark && wi === st.waves.length - 1)));
    capstone
      ? pass(`${mode}: a Bulwark closes every stage from Stage ${want[mode].bulwark}, and only there`)
      : fail(`${mode} bulwarks: ${JSON.stringify(rosters[mode].map((st) => st.waves.map((w) => w.bulwark ?? 0)))}`);
  }
  {
    const sizes = (mode: string) => rosters[mode].map((s) => s.waveSize);
    const [e, n, h] = [sizes('easy'), sizes('normal'), sizes('hard')];
    e.every((v, i) => v === Math.max(1, Math.round(n[i] * cfg.modes.easy.waveSizeMultiplier)) && v < n[i]) && h.join() === n.join()
      ? pass(`Easy waves are ${cfg.modes.easy.waveSizeMultiplier * 100}% of Normal's (Stage 10: ${e[9]} vs ${n[9]}); Hard's are Normal's`)
      : fail(`wave sizes: ${JSON.stringify({ e, n, h })}`);
    const bodies = (mode: string, stage: number) => rosters[mode][stage - 1].waves.map((w) => Object.values(w).reduce((a, b) => a + b, 0));
    bodies('easy', 1)[0] === e[0] && bodies('normal', 1)[0] === n[0]
      ? pass(`Stage 1 fields ${e[0]} slimes on Easy, ${n[0]} on Normal`)
      : fail(`stage 1 bodies: ${JSON.stringify({ easy: bodies('easy', 1), normal: bodies('normal', 1) })}`);
    // Generated waves spend a budget: the mode's wave size.
    const cost = await page.evaluate(() => Object.fromEntries(Object.entries(window.__balance.ENEMIES).map(([id, v]) => [id, (v as { cost: number }).cost])));
    const over = ['easy', 'normal', 'hard'].flatMap((mode) => rosters[mode].flatMap((st, i) => st.generated
      ? st.waves.map((w) => ({ mode, stage: i + 1, cost: Object.entries(w).reduce((c, [id, k]) => c + cost[id] * k, 0), budget: st.waveSize })).filter((x) => x.cost > x.budget + 1e-9)
      : []));
    over.length === 0 ? pass('no generated wave overspends its mode\'s budget') : fail(`overspent: ${JSON.stringify(over.slice(0, 5))}`);
    const generatedFrom = (mode: string) => rosters[mode].findIndex((s) => s.generated) + 1;
    generatedFrom('easy') === 7 && generatedFrom('normal') === 6 && generatedFrom('hard') === 5
      ? pass('the hand-written intro is 6 stages on Easy, 5 on Normal, 4 on Hard')
      : fail(`generated from: ${['easy', 'normal', 'hard'].map(generatedFrom)}`);
  }
  {
    // Over Stages 8-20 (every mode fields both casters by then), casters are rarer on Easy and commoner on Hard.
    const casters = ['easy', 'normal', 'hard'].map((mode) => count(mode, ['magus', 'sovereign'], 8));
    casters[0] < casters[1] && casters[1] < casters[2]
      ? pass(`casters over Stages 8-${STAGES_READ}: ${casters[0]} on Easy, ${casters[1]} on Normal, ${casters[2]} on Hard`)
      : fail(`casters easy/normal/hard: ${casters}`);
    const twoBulwarks = (mode: string) => rosters[mode].findIndex((st) => st.waves.some((w) => (w.bulwark ?? 0) >= 2)) + 1;
    twoBulwarks('easy') === 0 && twoBulwarks('hard') > 0 && twoBulwarks('hard') < twoBulwarks('normal')
      ? pass(`a second Bulwark: from Stage ${twoBulwarks('hard')} on Hard, ${twoBulwarks('normal')} on Normal, never on Easy`)
      : fail(`second bulwark: ${['easy', 'normal', 'hard'].map(twoBulwarks)}`);
  }
  // The intro's casters really take the field on Hard: Stage 3 spawns a Magus.
  await playOn('hard');
  {
    const fielded = await page.evaluate(() => {
      const d = window.__warmup.scene.getScene('GameScene').director;
      d.stageIndex = 2; d.waveIndex = 0; d.currentPhase = 'wave';
      d.spawnWave(); d.arriveAllNow();
      return d.enemies.map((e: { archetype: string }) => e.archetype);
    });
    fielded.includes('magus') ? pass(`Hard Stage 3 Wave 1 fields a Magus (${fielded.length} enemies)`) : fail(`hard stage 3: ${fielded}`);
  }

  // === 3. The run log is per mode =============================================
  section('3. Run log');
  await page.evaluate(() => window.__runs.clear());
  await playOn('hard');
  const hardRun = await die();
  {
    const s = await page.evaluate(() => ({
      last: window.__runs.list().at(-1),
      hard: window.__runs.summary(),
      normal: window.__runs.summary(undefined, undefined, undefined, 'normal'),
    }));
    hardRun.mode === 'hard' && s.last.mode === 'hard'
      ? pass('a Hard run is logged as Hard')
      : fail(`logged: ${JSON.stringify({ result: hardRun.mode, last: s.last })}`);
    s.hard.runs === 1 && s.hard.mode === 'hard' && s.normal.runs === 0
      ? pass('it counts toward the Hard summary only (the console summary follows the current mode)')
      : fail(`summaries: ${JSON.stringify(s)}`);
    hardRun.newBest && hardRun.previousBest === null
      ? pass('the first run in a mode is that mode\'s best')
      : fail(`first hard run: ${JSON.stringify({ newBest: hardRun.newBest, previousBest: hardRun.previousBest })}`);
  }
  await playOn('normal');
  const normalRun = await die();
  {
    const s = await page.evaluate(() => ({ normal: window.__runs.summary(), screen: window.__warmup.scene.getScene('UIScene').endScreen.text as string }));
    normalRun.mode === 'normal' && normalRun.previousBest === null && s.normal.runs === 1
      ? pass('a Normal run after it has no earlier best: bests never cross modes')
      : fail(`normal after hard: ${JSON.stringify({ normalRun: { mode: normalRun.mode, previousBest: normalRun.previousBest }, s })}`);
    /YOUR BEST\s+STAGE 1\s+SCORE \d+\s+\(1 RUN\)/.test(s.screen)
      ? pass('the end screen\'s YOUR BEST counts this mode\'s runs only')
      : fail(`end screen:\n${s.screen}`);
  }
  // A run logged before modes existed has no mode: it is a Normal run.
  {
    const s = await page.evaluate(() => {
      window.__profile.update((d: { runs: Record<string, unknown>[] }) => {
        const old = { ...d.runs[d.runs.length - 1] };
        delete old.mode;
        d.runs.push(old);
      });
      return window.__runs.summary(undefined, undefined, undefined, 'normal').runs;
    });
    s === 2 ? pass('a run logged without a mode counts as Normal') : fail(`normal runs with a legacy record: ${s}`);
  }

  // === 4. The start-screen picker =============================================
  section('4. Picker');
  await page.reload({ waitUntil: 'load' });       // the suite's seed puts the profile back on Hard
  await page.waitForFunction(() => window.__warmup?.scene?.getScene('UIScene')?.startScreen?.visible);
  await page.waitForTimeout(150);
  const picker = () => page.evaluate(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    const ui = window.__warmup.scene.getScene('UIScene');
    return {
      selected: ui.modeRow.selectedId as string,
      buttons: Object.fromEntries([...ui.modeRow.buttons].map(([id, b]: [string, { cx: number; cy: number }]) => [id, { x: b.cx, y: b.cy }])) as Record<string, { x: number; y: number }>,
      profile: window.__profile.data.mode as string,
      playing: g.mode.id as string,
      champion: window.__profile.data.champion as string,
      awaiting: g.isAwaitingStart as boolean,
      now: g.clock.now as number,
      tag: ui.difficultyText.text as string,
    };
  });
  const held = (s: { awaiting: boolean; now: number }) => s.awaiting && s.now === 0;
  {
    const s = await picker();
    s.selected === 'hard' && Object.keys(s.buttons).join() === 'easy,normal,hard' && held(s)
      ? pass('the card shows a button per mode with the profile\'s pick framed')
      : fail(`picker: ${JSON.stringify(s)}`);
    // Hovering a button says what that mode changes, read off MODES; it picks nothing.
    const tip = () => page.evaluate(() => window.__warmup.scene.getScene('UIScene').modeRow.tooltipText as string[] | null);
    const tips: Record<string, string> = {};
    for (const id of ['easy', 'normal', 'hard']) {
      await page.mouse.move(s.buttons[id].x, s.buttons[id].y);
      await page.waitForTimeout(80);
      tips[id] = ((await tip()) ?? []).join(' | ');
    }
    tips.easy === 'Easy | Waves 25% smaller | Enemy aim 20% slower | Magus from stage 7, Sovereign 8, Bulwark 11 | Casters appear less often | No stage clear bonus'
      && tips.normal === 'Normal | The standard run | Stage clear bonus 500'
      && tips.hard === 'Hard | Damage taken x2 | Enemy aim 25% faster | Magus from stage 3, Sovereign 4, Bulwark 5 | Casters appear more often | Stage clear bonus 1500'
      ? pass('hovering a mode shows what it changes against Normal')
      : fail(`tooltips: ${JSON.stringify(tips)}`);
    await page.mouse.move(s.buttons.easy.x, s.buttons.easy.y + 120);
    await page.waitForTimeout(80);
    (await tip()) === null && (await picker()).selected === 'hard'
      ? pass('the tooltip leaves with the mouse, and hovering picked nothing')
      : fail(`after hover: tip ${JSON.stringify(await tip())}`);
    // Champion tiles do the same: each says what is the trainer's own about that champion.
    const champTips = await page.evaluate(async () => {
      const row = window.__warmup.scene.getScene('UIScene').championRow;
      return [...row.tiles].map(([id, t]: [string, { cx: number; cy: number }]) => ({ id, x: t.cx, y: t.cy }));
    });
    const said: Record<string, string> = {};
    for (const t of champTips) {
      await page.mouse.move(t.x, t.y);
      await page.waitForTimeout(80);
      said[t.id] = ((await page.evaluate(() => window.__warmup.scene.getScene('UIScene').championRow.tooltipText as string[] | null)) ?? []).join(' | ');
    }
    /^Magic Boy \| E's bolt scores \+10 when it hits/.test(said.magicboy) && /^Snake Lady \| E on a poisoned enemy takes 500ms off R's cooldown/.test(said.snakelady) && /A kill with E scores \+10/.test(said.snakelady)
      && !/comes back through/.test(said.magicboy) && /A catch also readies W and scores \+10/.test(said.axeman)
      && /^Axe Man \| .*heals more: 5, 10, 15, 20 HP/.test(said.axeman) && (await picker()).champion === s.champion
      ? pass('hovering a champion shows its own rules, with the live numbers; hovering picks nothing')
      : fail(`champion tooltips: ${JSON.stringify(said)}`);
    await page.mouse.move(s.buttons.easy.x, s.buttons.easy.y + 120);
    await page.waitForTimeout(80);
    await page.mouse.click(s.buttons.easy.x, s.buttons.easy.y);
    await page.waitForTimeout(200);
    const after = await picker();
    after.selected === 'easy' && after.profile === 'easy' && after.playing === 'easy' && after.tag === 'EASY' && held(after)
      ? pass('clicking a mode picks it, rebuilds the held round on it, and does not start the run')
      : fail(`click easy: ${JSON.stringify(after)}`);
  }
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const down = await picker();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  {
    const up = await picker();
    down.selected === 'normal' && down.playing === 'normal' && up.selected === 'hard' && up.playing === 'hard' && held(down) && held(up)
      ? pass('Down / Up step through the modes (wrapping) without starting the run')
      : fail(`arrows: ${JSON.stringify({ down, up })}`);
    up.champion === 'magicboy' ? pass('the champion pick is untouched') : fail(`champion became ${up.champion}`);
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  {
    const s = await picker();
    !s.awaiting && s.now > 0 && s.playing === 'hard' && s.tag === 'HARD'
      ? pass('any other key starts the run on the picked mode; the HUD names it')
      : fail(`started: ${JSON.stringify(s)}`);
  }
  await die();
  await page.waitForTimeout(100);
  {
    const screen = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').endScreen.text as string);
    /DIFFICULTY\s+HARD\n/.test(screen) ? pass('the end screen names the mode') : fail(`end screen:\n${screen}`);
    screen.startsWith("qwer would've won that...\n")
      ? pass('an early death on Hard gets the plain taunt')
      : fail(`taunt:\n${screen}`);
    // From Stage 9 on Hard, qwer only probably wins.
    await page.evaluate(() => window.__warmup.scene.getScene('GameScene').restartRound());
    await page.waitForFunction(() => window.__warmup.scene.getScene('GameScene').getRoundResult() === null);
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.__warmup.scene.getScene('GameScene').director.stageIndex = 8; });
    await die();
    await page.waitForTimeout(100);
    const late = await page.evaluate(() => window.__warmup.scene.getScene('UIScene').endScreen.text as string);
    late.startsWith("qwer would've won that... probably...\n")
      ? pass('a death on Hard at Stage 9 or later gets "probably"')
      : fail(`late taunt:\n${late}`);
  }

  await page.evaluate(() => window.__profile.reset());
  await finish();
});
