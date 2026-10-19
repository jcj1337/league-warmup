// The quickest look: a fresh page, the start screen it opens on, one screenshot and its state.
export const name = 'look';

export default async function (hd) {
  hd.step('look');
  await hd.open();
  const g = await hd.game();
  const s = await hd.startScreen();
  hd.check(g.awaiting && s.visible && g.clockMs === 0, 'a fresh page opens on the start screen with the round held at time 0', { g, s });
  await hd.shot('start-screen');
}
