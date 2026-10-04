import Phaser from 'phaser';
import * as balance from './config/balance';
import { ARENA } from './config/balance';
import { THEME } from './config/theme';
import { GameScene } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';
import { Keybinds } from './game/Keybinds';
import { MouseSpeed } from './game/MouseSpeed';
import { RunHistory } from './game/RunHistory';
import { Settings } from './game/Settings';
import { Profile } from './profile/Profile';
import { CHAMPIONS } from './champions';
import * as ezreal from './champions/ezreal/balance';

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
//   __keybinds.all() / .set('flash', 'CapsLock') / .reset()  // key bindings (saved in this browser)
//   __mouseSpeed.value / .set(2.5) / .reset()                // Mouse Speed (saved in this browser)
//   __settings.all() / .pauseOnFocusLoss = false             // pause-menu settings (saved in this browser)
//   __profile.data / .reset()                                // everything saved, in one place
//   __ezreal.SKILLSHOT_Q.speed = 1400                        // Ezreal's numbers (src/champions/ezreal/balance.ts)
//   __champions                                              // every playable champion
const runs = {
  list: () => RunHistory.list(),
  summary: (growth: number = balance.DIFFICULTY.growth, version: number = balance.BALANCE_VERSION, champion: string = Profile.data.champion) =>
    RunHistory.summary(growth, version, champion),
  clear: () => RunHistory.clear(),
};
Object.assign(window as unknown as Record<string, unknown>, {
  __warmup: game, __balance: balance, __theme: THEME, __runs: runs, __keybinds: Keybinds, __mouseSpeed: MouseSpeed,
  __settings: Settings, __profile: Profile, __ezreal: ezreal, __champions: CHAMPIONS,
});
