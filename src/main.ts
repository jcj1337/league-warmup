import Phaser from 'phaser';
import * as balance from './config/balance';
import { ARENA } from './config/balance';
import { THEME } from './config/theme';
import { GameScene } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';
import { Keybinds } from './game/Keybinds';
import { RunHistory } from './game/RunHistory';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: THEME.battlefield.void,
  // No physics engine: movement and collision are plain math in the systems,
  // which keeps the feel fully under our control while tuning.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    // Pixel art: nearest-neighbour texture filtering, crisp canvas scaling and
    // whole-pixel sprite placement. Gameplay positions stay fractional — only
    // where sprites are DRAWN is rounded.
    pixelArt: true,
  },
  // GameScene simulates; UIScene runs on top of it and only reads state.
  scene: [GameScene, UIScene],
});

// Handy while playtesting, from the browser console:
//   __warmup.scene.getScene('GameScene').getHudState()
//   __balance.ATTACK.range = 400      // most values apply on the next frame
//   __theme.player.attack.windupLeanPx // presentation values
//   __runs.summary()                   // your logged runs on the current growth + balance version
//   __runs.list() / __runs.clear()     // every logged run / delete the log
//   __keybinds.all() / .set('flash', 'CapsLock') / .reset()  // key bindings (this tab's session)
const runs = {
  list: () => RunHistory.list(),
  summary: (growth: number = balance.DIFFICULTY.growth, version: number = balance.BALANCE_VERSION) =>
    RunHistory.summary(growth, version),
  clear: () => RunHistory.clear(),
};
Object.assign(window as unknown as Record<string, unknown>, { __warmup: game, __balance: balance, __theme: THEME, __runs: runs, __keybinds: Keybinds });
