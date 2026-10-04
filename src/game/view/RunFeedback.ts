import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Player } from '../entities/Player';
import type { RunEvents } from '../RunEvents';
import type { Fx } from './Fx';

/**
 * What the player sees when something happens in the run: kill gold, the
 * level-up ring, the stage-clear popups, the hit shake. Pure presentation,
 * driven entirely by the run's events, so gameplay never calls a visual
 * directly for these.
 *
 * Popups over the slime stack by row above its crown: row 0 is kill gold; the
 * stage-clear heal, the HP bonus and the speed bonus sit on rows 1–3, so the
 * kill that clears a stage never hides them.
 */
export class RunFeedback {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Fx,
    private readonly player: Player,
    events: RunEvents,
  ) {
    // League's last-hit gold: what this kill was worth, riding on the slime's head until it fades.
    events.on('kill', ({ points }) => this.fx.goldPopup(() => ({ x: this.player.x, y: this.overHead(0) }), points));

    events.on('levelUp', ({ level }) => {
      const { x, y, radius } = this.player;
      this.fx.ring(x, y, radius + 4, radius + 46, 420, THEME.ui.accent, 1, 6);
      this.fx.popup(x, this.overHead(0) - 6, `LEVEL ${level}`, THEME.ui.accent, 900, 30);
    });

    events.on('markDetonated', ({ target }) => this.fx.detonation(target.x, target.y));

    events.on('waveCleared', ({ points }) => {
      if (points > 0) this.scorePopup(`+${points} SPEED`, 3);
    });

    events.on('stageCleared', ({ points, flawless, healed }) => {
      if (points > 0) this.scorePopup(`+${points} ${flawless ? 'FLAWLESS' : 'HP'}`, 2);
      if (healed > 0) this.fx.popup(this.player.x, this.overHead(1), `+${healed}`, THEME.ui.good, 800, 26);
    });

    // A hit registers even when your eyes are on the enemy: a shake and a red rim flash.
    events.on('playerHit', () => {
      this.scene.cameras.main.shake(90, 0.004);
      const rim = this.scene.add
        .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width - 8, ARENA.height - 8, 0x000000, 0)
        .setStrokeStyle(8, THEME.ui.hitRim, 0.55)
        .setDepth(THEME.depth.screen);
      this.scene.tweens.add({ targets: rim, alpha: 0, duration: 260, onComplete: () => rim.destroy() });
    });
  }

  /** Where text over the slime starts: just above the crown, `row` popup rows up. */
  private overHead(row: number): number {
    return this.player.y - this.player.radius - 18 - THEME.player.crownPx - row * 24;
  }

  private scorePopup(text: string, row: number): void {
    this.fx.popup(this.player.x, this.overHead(row), text, THEME.ui.accent, 1100, 26);
  }
}
