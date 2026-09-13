import Phaser from 'phaser';
import * as balance from './config/balance';
import { ARENA } from './config/balance';
import { GameScene } from './game/scenes/GameScene';
import { UIScene } from './game/scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: ARENA.backgroundColor,
  // No physics engine: movement and collision are plain math in the systems,
  // which keeps the feel fully under our control while tuning.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  // GameScene simulates; UIScene runs on top of it and only reads state.
  scene: [GameScene, UIScene],
});

// Handy while playtesting, from the browser console:
//   __warmup.scene.getScene('GameScene').getHudState()
//   __balance.ATTACK.range = 400      // most values apply on the next frame
Object.assign(window as unknown as Record<string, unknown>, { __warmup: game, __balance: balance });
