// Start screen, driven as a player: the held title card, the champion and difficulty pickers
// (hover, click, arrow keys), both picks surviving a reload, and a run that starts on a key's
// release without that key also casting. Recipe: ../features/start-screen.md
export const name = 'start-screen';

const CARD_TEXTS = ['hands diff', 'CHOOSE YOUR CHAMPION', 'CLICK OR PRESS ANY KEY', 'DESIGNED BY QWER', 'TOP 50'];

/** The held round has been rebuilt as `champion` on `mode` and is waiting on the card again. */
const rebuiltAs = (want) => {
  const g = window.__warmup.scene.getScene('GameScene');
  const h = g.getHudState();
  return g.isAwaitingStart && h.champion === want.champion && h.mode === want.mode;
};

export default async function (hd) {
  const brief = (g) => ({ awaiting: g.awaiting, clockMs: g.clockMs, champion: g.hud.champion, mode: g.hud.mode, profile: g.profile });

  hd.step('1. held card');
  await hd.open();
  {
    const [g, s] = [await hd.game(), await hd.startScreen()];
    hd.check(g.awaiting && s.visible && g.clockMs === 0, 'a fresh page holds the first round at time 0 behind the card', brief(g));
    hd.check(CARD_TEXTS.every((t) => s.texts.includes(t)) && s.texts.length === CARD_TEXTS.length,
      'the card shows the title, the credit with TOP 50, the champion prompt and the start prompt, nothing else', s.texts);
    hd.check(s.champion === 'magicboy' && s.mode === 'normal', 'an empty profile frames Magic Boy and Normal', s);
  }
  await hd.shot('card');

  hd.step('2. champion tooltips');
  const champions = await hd.read(() => Object.fromEntries(Object.entries(window.__champions).map(([id, c]) => [id, c.name])));
  for (const [id, label] of Object.entries(champions)) {
    await hd.move(await hd.tile(id));
    await hd.wait(100);
    const tip = (await hd.startScreen()).championTip;
    hd.check(tip?.[0] === label && tip.length > 1, `hovering the ${label} tile hangs its notes under it`, tip);
  }
  await hd.shot('champion-tooltip');
  await hd.move(640, 690);
  await hd.wait(100);
  {
    const s = await hd.startScreen();
    hd.check(s.championTip === null && s.champion === 'magicboy', 'the tooltip leaves with the mouse and hovering picked nothing', s);
  }

  hd.step('3. pick a champion by click');
  await hd.click(await hd.tile('snakelady'));
  const pickedSnake = await hd.waitFor(rebuiltAs, { champion: 'snakelady', mode: 'normal' }, { label: 'held round rebuilt as Snake Lady' });
  {
    const [g, s] = [await hd.game(), await hd.startScreen()];
    hd.check(pickedSnake && s.champion === 'snakelady' && g.profile.champion === 'snakelady' && g.clockMs === 0,
      'clicking the Snake Lady tile frames her, saves her to the profile and leaves the run held', { ...brief(g), framed: s.champion });
  }
  await hd.shot('picked-snakelady');

  hd.step('4. browse champions with the arrow keys');
  const ids = Object.keys(champions);
  const next = ids[(ids.indexOf('snakelady') + 1) % ids.length];
  await hd.press('ArrowRight');
  const movedRight = await hd.waitFor(rebuiltAs, { champion: next, mode: 'normal' }, { label: `ArrowRight framed ${next}` });
  await hd.press('ArrowLeft');
  const movedBack = await hd.waitFor(rebuiltAs, { champion: 'snakelady', mode: 'normal' }, { label: 'ArrowLeft framed snakelady again' });
  {
    const g = await hd.game();
    hd.check(movedRight && movedBack && g.awaiting && g.clockMs === 0, `Right then Left steps to ${next} and back without starting the run`, brief(g));
  }

  hd.step('5. difficulty');
  await hd.move(await hd.modeButton('hard'));
  await hd.wait(100);
  {
    const s = await hd.startScreen();
    hd.check(s.modeTip?.[0] === 'Hard' && s.mode === 'normal', 'hovering Hard lists what it changes and picks nothing', s.modeTip);
  }
  await hd.shot('mode-tooltip');
  await hd.click(await hd.modeButton('hard'));
  const pickedHard = await hd.waitFor(rebuiltAs, { champion: 'snakelady', mode: 'hard' }, { label: 'held round rebuilt on Hard' });
  await hd.press('ArrowUp');
  const up = await hd.waitFor(rebuiltAs, { champion: 'snakelady', mode: 'normal' }, { label: 'ArrowUp framed Normal' });
  await hd.press('ArrowDown');
  const down = await hd.waitFor(rebuiltAs, { champion: 'snakelady', mode: 'hard' }, { label: 'ArrowDown framed Hard' });
  {
    const [g, s] = [await hd.game(), await hd.startScreen()];
    hd.check(pickedHard && up && down && s.mode === 'hard' && g.profile.mode === 'hard' && g.awaiting && g.clockMs === 0,
      'clicking Hard, then Up / Down, picks and saves the mode with the run still held', { ...brief(g), framed: s.mode });
  }

  hd.step('6. picks survive a reload');
  await hd.reload();
  {
    const [g, s] = [await hd.game(), await hd.startScreen()];
    hd.check(s.visible && g.awaiting && g.clockMs === 0 && s.champion === 'snakelady' && s.mode === 'hard' &&
      g.hud.champion === 'snakelady' && g.hud.mode === 'hard', 'after a reload the card frames Snake Lady on Hard and the held round is hers', { ...brief(g), framed: [s.champion, s.mode] });
  }
  await hd.shot('after-reload');

  hd.step('7. a key starts the run on its release, without casting');
  await hd.move(900, 360);
  await hd.down('q');
  await hd.wait(150);
  {
    const g = await hd.game();
    hd.check(g.awaiting && g.clockMs === 0 && g.hud.abilityCooldowns.q.remaining === 0, 'holding Q keeps the card up, nothing cast', brief(g));
  }
  await hd.up('q');
  const started = await hd.waitFor(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return !g.isAwaitingStart && g.clock.now > 200;
  }, null, { label: 'run clock running after the release' });
  {
    const g = await hd.game();
    const tag = await hd.read(() => window.__warmup.scene.getScene('UIScene').difficultyText.text);
    hd.check(started && !g.startScreen && g.hud.abilityCooldowns.q.remaining === 0 && g.hud.castingAbility === null,
      'releasing Q starts the run, and Q was not also cast', { ...brief(g), q: g.hud.abilityCooldowns.q, casting: g.hud.castingAbility });
    hd.check(g.hud.champion === 'snakelady' && g.hud.mode === 'hard' && tag === 'HARD', 'the run plays Snake Lady on Hard and the HUD tag says HARD', { hud: brief(g), tag });
  }
  await hd.shot('playing');

  hd.step('8. a click starts the run, without a move order');
  await hd.open();
  const before = await hd.game();
  hd.check(before.awaiting && before.clockMs === 0, 'a new page load is held on the card again', brief(before));
  await hd.rclick(1100, 600);
  const clicked = await hd.waitFor(() => {
    const g = window.__warmup.scene.getScene('GameScene');
    return !g.isAwaitingStart && g.clock.now > 300;
  }, null, { label: 'run clock running after the click' });
  {
    const g = await hd.game();
    const moved = Math.hypot(g.player.x - before.player.x, g.player.y - before.player.y);
    hd.check(clicked && !g.startScreen, 'a right-click on the card starts the run', brief(g));
    hd.check(moved < 2 && !g.player.moving, 'the starting click is not also a move order', { moved, player: g.player });
  }
  await hd.shot('click-started');
}
