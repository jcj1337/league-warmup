import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';

/** Everything one slot needs to draw itself for a frame. */
export interface AbilitySlotState {
  /** Remaining cooldown in ms; 0 means ready. */
  cooldownMs: number;
  /** Full cooldown, for the sweep fraction. */
  cooldownTotalMs: number;
}

/**
 * The bottom-centre ability bar.
 *
 * Purely a view: it is handed the live cooldown numbers every frame and never
 * stores or derives gameplay state of its own. `SkillshotSystem` remains the
 * only authority on whether Q is actually castable.
 *
 * Laid out for N slots and centred as a group, so adding W/E/R later is a
 * matter of constructing more slots — the row re-centres itself.
 */
export class AbilityBar {
  private readonly slots: AbilitySlot[] = [];

  constructor(scene: Phaser.Scene, keys: string[]) {
    const { slotSize, slotGap, bottomMargin } = THEME.ability;
    const total = keys.length * slotSize + (keys.length - 1) * slotGap;
    const left = ARENA.width / 2 - total / 2;
    const centerY = ARENA.height - bottomMargin - slotSize / 2;

    keys.forEach((key, i) => {
      const cx = left + i * (slotSize + slotGap) + slotSize / 2;
      this.slots.push(new AbilitySlot(scene, cx, centerY, key));
    });
  }

  /** `states[i]` corresponds to `keys[i]` from the constructor. */
  update(states: AbilitySlotState[]): void {
    this.slots.forEach((slot, i) => {
      const state = states[i];
      if (state) slot.update(state);
    });
  }
}

/**
 * One square ability slot: frame, procedural icon, keybind label, and — while
 * on cooldown — a dark wash, a draining radial sweep and a large countdown.
 */
class AbilitySlot {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly sweep: Phaser.GameObjects.Graphics;
  private readonly cooldownText: Phaser.GameObjects.Text;
  private readonly keyText: Phaser.GameObjects.Text;

  /** Only redraw the frame when the ready/cooldown state actually flips. */
  private lastReady: boolean | null = null;

  constructor(scene: Phaser.Scene, private readonly cx: number, private readonly cy: number, key: string) {
    const size = THEME.ability.slotSize;

    this.frame = scene.add.graphics().setDepth(100);
    this.icon = scene.add.graphics().setDepth(101);
    this.sweep = scene.add.graphics().setDepth(102);

    // Clip the cooldown sweep to the slot, so the wedge fills the square
    // cleanly instead of spilling a circle out over the arena.
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRoundedRect(
      cx - size / 2,
      cy - size / 2,
      size,
      size,
      THEME.ability.radius,
    );
    this.sweep.setMask(maskShape.createGeometryMask());

    this.cooldownText = scene.add
      .text(cx, cy, '', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '26px',
        color: THEME.ui.text,
      })
      .setOrigin(0.5)
      .setDepth(103);

    // Keybind sits in the bottom-right corner of the slot, like a MOBA HUD.
    this.keyText = scene.add
      .text(cx + size / 2 - 6, cy + size / 2 - 4, key, {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '13px',
        color: THEME.ui.dim,
      })
      .setOrigin(1, 1)
      .setDepth(103);

    this.drawIcon();
  }

  update(state: AbilitySlotState): void {
    const ready = state.cooldownMs <= 0;

    if (ready !== this.lastReady) {
      this.lastReady = ready;
      this.drawFrame(ready);
      this.icon.setAlpha(ready ? 1 : 0.35);
      this.keyText.setColor(ready ? THEME.ui.accent : THEME.ui.dim);
      this.cooldownText.setVisible(!ready);
    }

    if (ready) {
      this.sweep.clear();
      return;
    }

    this.cooldownText.setText(formatCooldown(state.cooldownMs));
    this.drawSweep(state.cooldownMs / Math.max(1, state.cooldownTotalMs));
  }

  /** Slot plate. Brighter border + a faint inner glow line when ready. */
  private drawFrame(ready: boolean): void {
    const size = THEME.ability.slotSize;
    const r = THEME.ability.radius;
    const x = this.cx - size / 2;
    const y = this.cy - size / 2;

    this.frame.clear();
    this.frame.fillStyle(
      ready ? THEME.ability.readyFill : THEME.ability.cooldownFill,
      ready ? 0.95 : 0.97,
    );
    this.frame.fillRoundedRect(x, y, size, size, r);

    this.frame.lineStyle(2, ready ? THEME.ability.readyStroke : THEME.ability.cooldownStroke, ready ? 0.95 : 0.8);
    this.frame.strokeRoundedRect(x, y, size, size, r);

    if (ready) {
      // Subtle inner highlight so "ready" reads without a glow effect.
      this.frame.lineStyle(1, THEME.ability.readyStroke, 0.25);
      this.frame.strokeRoundedRect(x + 4, y + 4, size - 8, size - 8, r - 3);
    }
  }

  /**
   * Procedural Q icon: a forward-pointing energy bolt with a trailing streak —
   * the same visual language as the actual Q projectile, so the slot reads as
   * "straight-line projectile" rather than as a lettered box.
   */
  private drawIcon(): void {
    const g = this.icon;
    const cx = this.cx;
    const cy = this.cy;
    const c = THEME.projectiles.qColor;

    g.clear();

    // Trailing streak lines behind the bolt.
    g.lineStyle(2, c, 0.4);
    g.lineBetween(cx - 20, cy, cx - 8, cy);
    g.lineStyle(1.5, c, 0.22);
    g.lineBetween(cx - 18, cy - 6, cx - 10, cy - 6);
    g.lineBetween(cx - 18, cy + 6, cx - 10, cy + 6);

    // The bolt head: a dart, matching the in-game projectile silhouette.
    g.fillStyle(c, 0.95);
    g.beginPath();
    g.moveTo(cx + 18, cy);
    g.lineTo(cx - 6, cy + 9);
    g.lineTo(cx - 1, cy);
    g.lineTo(cx - 6, cy - 9);
    g.closePath();
    g.fillPath();

    // Hot core.
    g.fillStyle(THEME.projectiles.qCore, 0.9);
    g.fillCircle(cx + 4, cy, 2.6);
  }

  /**
   * Radial sweep showing `fraction` of the cooldown still remaining. Drawn as a
   * dark pie starting at 12 o'clock and sweeping clockwise, so the dark wedge
   * shrinks away as the ability comes back up.
   */
  private drawSweep(fraction: number): void {
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    const size = THEME.ability.slotSize;
    // Oversized on purpose: the geometry mask trims it back to the slot, which
    // is what makes the wedge reach into the corners like a MOBA cooldown.
    const r = size * 0.78;
    const start = -Math.PI / 2;

    this.sweep.clear();

    // Flat wash over the whole slot while unavailable.
    this.sweep.fillStyle(THEME.ability.sweepColor, THEME.ability.cooldownWashAlpha * 0.55);
    this.sweep.fillRoundedRect(
      this.cx - size / 2,
      this.cy - size / 2,
      size,
      size,
      THEME.ability.radius,
    );

    if (f <= 0) return;

    // The draining wedge on top of it.
    this.sweep.fillStyle(THEME.ability.sweepColor, THEME.ability.sweepAlpha);
    this.sweep.slice(this.cx, this.cy, r, start, start + Math.PI * 2 * f, false);
    this.sweep.fillPath();
  }
}

/** Whole seconds above 1s, one decimal below — the last second is the tense one. */
export function formatCooldown(remainingMs: number): string {
  const seconds = remainingMs / 1000;
  return seconds > 1 ? String(Math.ceil(seconds)) : seconds.toFixed(1);
}
