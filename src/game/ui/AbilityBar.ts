import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';

/** Everything one slot needs to draw itself for a frame. */
export interface AbilitySlotState {
  /** Remaining cooldown in ms; 0 means ready. */
  cooldownMs: number;
  /** Full cooldown, for the sweep fraction. */
  cooldownTotalMs: number;
  /** 0..1 while this ability is mid-cast; 0 otherwise. */
  castProgress?: number;
}

/** Which procedural icon a slot draws. */
export type AbilityIcon = 'q' | 'w' | 'e' | 'flash';

export interface AbilitySlotSpec {
  key: string;
  icon: AbilityIcon;
  /** Summoner slots are drawn smaller and set apart from the ability row. */
  summoner?: boolean;
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

  /**
   * The ability row is centred as a group, so adding R later just re-centres
   * it. Summoner slots (Flash) sit to the right of the row with a deliberate
   * gap, because they are not part of the champion kit.
   */
  constructor(scene: Phaser.Scene, specs: AbilitySlotSpec[]) {
    const { slotSize, slotGap, bottomMargin, summonerSize, summonerGap } = THEME.ability;

    const abilities = specs.filter((s) => !s.summoner);
    const summoners = specs.filter((s) => s.summoner);

    const rowWidth = abilities.length * slotSize + (abilities.length - 1) * slotGap;
    const left = ARENA.width / 2 - rowWidth / 2;
    const centerY = ARENA.height - bottomMargin - slotSize / 2;

    for (const spec of specs) {
      if (spec.summoner) continue;
      const i = abilities.indexOf(spec);
      const cx = left + i * (slotSize + slotGap) + slotSize / 2;
      this.slots.push(new AbilitySlot(scene, cx, centerY, spec, slotSize));
    }

    summoners.forEach((spec, i) => {
      const cx = left + rowWidth + summonerGap + i * (summonerSize + 6) + summonerSize / 2;
      this.slots.push(new AbilitySlot(scene, cx, centerY, spec, summonerSize));
    });
  }

  /** `states[i]` corresponds to `specs[i]` from the constructor. */
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
  /** Cast-in-progress highlight, drawn above the cooldown wash. */
  private readonly castGfx: Phaser.GameObjects.Graphics;
  private readonly cooldownText: Phaser.GameObjects.Text;
  private readonly keyText: Phaser.GameObjects.Text;

  /** Only redraw the frame when the ready/cooldown state actually flips. */
  private lastReady: boolean | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    private readonly spec: AbilitySlotSpec,
    private readonly size: number,
  ) {

    this.frame = scene.add.graphics().setDepth(100);
    this.icon = scene.add.graphics().setDepth(101);
    this.sweep = scene.add.graphics().setDepth(102);
    this.castGfx = scene.add.graphics().setDepth(104);

    // Clip the cooldown sweep to the slot, so the wedge fills the square
    // cleanly instead of spilling a circle out over the arena.
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, THEME.ability.radius);
    this.sweep.setMask(maskShape.createGeometryMask());

    this.cooldownText = scene.add
      .text(cx, cy, '', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: `${Math.round(size * 0.42)}px`,
        color: THEME.ui.text,
      })
      .setOrigin(0.5)
      .setDepth(103);

    // Keybind sits in the bottom-right corner of the slot, like a MOBA HUD.
    this.keyText = scene.add
      .text(cx + size / 2 - 6, cy + size / 2 - 4, spec.key, {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '13px',
        color: THEME.ui.dim,
      })
      .setOrigin(1, 1)
      .setDepth(103);

    this.drawIcon();
  }

  update(state: AbilitySlotState): void {
    this.drawCastProgress(state.castProgress ?? 0);

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

  /**
   * While casting, the slot fills from the bottom and takes a bright border —
   * a small, local echo of the charge happening on the character, rather than
   * a centre-screen cast bar.
   */
  private drawCastProgress(progress: number): void {
    const g = this.castGfx;
    if (progress <= 0) {
      if (g.visible) g.clear().setVisible(false);
      return;
    }

    const size = this.size;
    const x = this.cx - size / 2;
    const y = this.cy - size / 2;
    const fillH = size * Phaser.Math.Clamp(progress, 0, 1);

    g.clear().setVisible(true);
    g.fillStyle(THEME.ability.readyStroke, 0.22);
    g.fillRect(x, y + size - fillH, size, fillH);
    g.lineStyle(2, THEME.ability.readyStroke, 0.95);
    g.strokeRoundedRect(x, y, size, size, THEME.ability.radius);
  }

  /** Slot plate. Brighter border + a faint inner glow line when ready. */
  private drawFrame(ready: boolean): void {
    const size = this.size;
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
   * Procedural icons — no external art. Each one echoes the ability's actual
   * in-game visual so the slot and the effect read as the same thing:
   *   Q     forward dart with speed lines
   *   W     orb with an orbiting mark ring
   *   E     displacement: two markers with a jump arc
   *   Flash sharp starburst
   */
  private drawIcon(): void {
    const g = this.icon;
    const cx = this.cx;
    const cy = this.cy;
    const s = this.size / 62; // scale relative to the standard slot

    g.clear();

    switch (this.spec.icon) {
      case 'q': {
        const c = THEME.projectiles.qColor;
        g.lineStyle(2, c, 0.4);
        g.lineBetween(cx - 20 * s, cy, cx - 8 * s, cy);
        g.lineStyle(1.5, c, 0.22);
        g.lineBetween(cx - 18 * s, cy - 6 * s, cx - 10 * s, cy - 6 * s);
        g.lineBetween(cx - 18 * s, cy + 6 * s, cx - 10 * s, cy + 6 * s);
        g.fillStyle(c, 0.95);
        g.beginPath();
        g.moveTo(cx + 18 * s, cy);
        g.lineTo(cx - 6 * s, cy + 9 * s);
        g.lineTo(cx - 1 * s, cy);
        g.lineTo(cx - 6 * s, cy - 9 * s);
        g.closePath();
        g.fillPath();
        g.fillStyle(THEME.projectiles.qCore, 0.9);
        g.fillCircle(cx + 4 * s, cy, 2.6 * s);
        break;
      }

      case 'w': {
        const c = THEME.projectiles.wColor;
        // Orbiting mark ticks around a solid orb — the thing W leaves behind.
        g.lineStyle(2, c, 0.75);
        g.strokeCircle(cx, cy, 15 * s);
        g.lineStyle(2.5, THEME.mark.accent, 0.9);
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + Math.PI / 4;
          g.lineBetween(
            cx + Math.cos(a) * 16 * s,
            cy + Math.sin(a) * 16 * s,
            cx + Math.cos(a) * 21 * s,
            cy + Math.sin(a) * 21 * s,
          );
        }
        g.fillStyle(c, 0.95);
        g.fillCircle(cx, cy, 8 * s);
        g.fillStyle(THEME.projectiles.wCore, 0.95);
        g.fillCircle(cx, cy, 3.4 * s);
        break;
      }

      case 'e': {
        const c = THEME.projectiles.eColor;
        // Departure marker, arc, arrival marker: displacement in one glyph.
        g.lineStyle(2, c, 0.45);
        g.strokeCircle(cx - 12 * s, cy + 6 * s, 5 * s);
        g.lineStyle(2, c, 0.35);
        g.beginPath();
        g.moveTo(cx - 12 * s, cy + 2 * s);
        g.lineTo(cx - 2 * s, cy - 12 * s);
        g.lineTo(cx + 11 * s, cy - 4 * s);
        g.strokePath();
        g.fillStyle(c, 0.95);
        g.beginPath();
        g.moveTo(cx + 18 * s, cy - 2 * s);
        g.lineTo(cx + 6 * s, cy + 4 * s);
        g.lineTo(cx + 10 * s, cy - 4 * s);
        g.closePath();
        g.fillPath();
        g.fillStyle(THEME.projectiles.eCore, 0.95);
        g.fillCircle(cx + 12 * s, cy - 2 * s, 3 * s);
        break;
      }

      case 'flash': {
        const c = THEME.projectiles.flashColor;
        g.lineStyle(2, c, 0.95);
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          const inner = i % 2 === 0 ? 4 * s : 3 * s;
          const outer = i % 2 === 0 ? 15 * s : 10 * s;
          g.lineBetween(
            cx + Math.cos(a) * inner,
            cy + Math.sin(a) * inner,
            cx + Math.cos(a) * outer,
            cy + Math.sin(a) * outer,
          );
        }
        g.fillStyle(c, 0.95);
        g.fillCircle(cx, cy, 3.2 * s);
        break;
      }
    }
  }

  /**
   * Radial sweep showing `fraction` of the cooldown still remaining. Drawn as a
   * dark pie starting at 12 o'clock and sweeping clockwise, so the dark wedge
   * shrinks away as the ability comes back up.
   */
  private drawSweep(fraction: number): void {
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    const size = this.size;
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
