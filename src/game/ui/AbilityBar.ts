import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText, setPixelScale } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';

/** Everything one slot needs to draw itself for a frame. */
export interface AbilitySlotState {
  /** Remaining cooldown in ms; 0 means ready. */
  cooldownMs: number;
  /** Full cooldown, for the sweep fraction. */
  cooldownTotalMs: number;
  /** 0..1 while this ability is mid-cast; 0 otherwise. */
  castProgress?: number;
  /** Ms since something took time off this cooldown: the slot flashes grey for a moment. */
  sinceReducedMs?: number;
}

export interface AbilitySlotSpec {
  key: string;
  /** Texture key of the slot's pixel icon. */
  icon: string;
  /** Frame colour. */
  accent: number;
  /** Summoner slots are drawn smaller and set apart from the ability row. */
  summoner?: boolean;
}

/**
 * The bottom-centre ability bar.
 *
 * Purely a view: it is handed the live cooldown numbers every frame and never
 * stores or derives gameplay state of its own. AbilityCooldowns remains the
 * only authority on whether an ability is actually castable.
 *
 * Laid out for N slots and centred as a group, so adding R later is a matter
 * of constructing more slots — the row re-centres itself.
 */
export class AbilityBar {
  private readonly slots: AbilitySlot[] = [];

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

  /** Relabel the slots after a rebind: `keys[i]` corresponds to `specs[i]` from the constructor. */
  setKeys(keys: string[]): void {
    this.slots.forEach((slot, i) => {
      if (keys[i] !== undefined) slot.setKey(keys[i]);
    });
  }

  /** `states[i]` corresponds to `specs[i]` from the constructor. */
  update(states: AbilitySlotState[]): void {
    this.slots.forEach((slot, i) => {
      const state = states[i];
      if (state) slot.update(state);
    });
  }

  destroy(): void {
    for (const slot of this.slots) slot.destroy();
    this.slots.length = 0;
  }
}

/**
 * One square ability slot: pixel frame in the ability's colour, pixel icon,
 * keybind label, and — while on cooldown — a dark wash, a draining radial
 * sweep and a large countdown.
 */
class AbilitySlot {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly sweep: Phaser.GameObjects.Graphics;
  /** Cast-in-progress highlight, drawn above the cooldown wash. */
  private readonly castGfx: Phaser.GameObjects.Graphics;
  /** The grey wash when a cooldown is cut short. */
  private readonly reduceGfx: Phaser.GameObjects.Graphics;
  private readonly cooldownText: Phaser.GameObjects.BitmapText;
  private readonly keyText: Phaser.GameObjects.BitmapText;
  private readonly accent: number;

  /** Only redraw the frame when the ready/cooldown state actually flips. */
  private lastReady: boolean | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly cx: number,
    private readonly cy: number,
    readonly spec: AbilitySlotSpec,
    private readonly size: number,
  ) {
    const large = size >= 60;
    this.accent = spec.accent;

    this.frame = scene.add.graphics().setDepth(100);
    this.icon = scene.add.image(Math.round(cx), Math.round(cy), spec.icon).setScale(large ? 3 : 2).setDepth(101);
    this.sweep = scene.add.graphics().setDepth(102);
    this.castGfx = scene.add.graphics().setDepth(104);
    this.reduceGfx = scene.add.graphics().setDepth(102.5);

    // Clip the cooldown sweep to the slot, so the wedge fills the square
    // cleanly instead of spilling a circle out over the arena.
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(cx - size / 2 + 2, cy - size / 2 + 2, size - 4, size - 4);
    this.sweep.setMask(maskShape.createGeometryMask());

    this.cooldownText = pixelText(scene, cx, cy, '', large ? 3 : 2).setOrigin(0.5).setDepth(103);

    // Keybind sits in the bottom-right corner of the slot, like a MOBA HUD.
    this.keyText = pixelText(scene, cx + size / 2 - 4, cy + size / 2 - 2, spec.key, 2, THEME.ui.dim)
      .setOrigin(1, 1)
      .setDepth(103);
    this.setKey(spec.key);
  }

  destroy(): void {
    this.frame.destroy();
    this.icon.destroy();
    this.sweep.clearMask(true).destroy();
    this.castGfx.destroy();
    this.reduceGfx.destroy();
    this.cooldownText.destroy();
    this.keyText.destroy();
  }

  /** Show a new keybind. A long name ('CAPS', 'LSHIFT') drops to the small font so it stays in the corner. */
  setKey(label: string): void {
    this.keyText.setText(label);
    setPixelScale(this.keyText, label.length * 12 <= this.size * 0.6 ? 2 : 1);
  }

  update(state: AbilitySlotState): void {
    this.drawCastProgress(state.castProgress ?? 0);
    this.drawReduceFlash(state.sinceReducedMs ?? Infinity);

    const ready = state.cooldownMs <= 0;

    if (ready !== this.lastReady) {
      this.lastReady = ready;
      this.drawFrame(ready);
      this.icon.setAlpha(ready ? 1 : 0.35);
      this.keyText.setTint(ready ? THEME.ui.text : THEME.ui.faint);
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
   * While casting, the slot fills from the bottom in the ability's colour — a
   * small, local echo of the charge happening on the character.
   */
  private drawCastProgress(progress: number): void {
    const g = this.castGfx;
    if (progress <= 0) {
      if (g.visible) g.clear().setVisible(false);
      return;
    }

    const size = this.size;
    const x = Math.round(this.cx - size / 2);
    const y = Math.round(this.cy - size / 2);
    const fillH = Math.round((size - 4) * Phaser.Math.Clamp(progress, 0, 1));

    g.clear().setVisible(true);
    g.fillStyle(this.accent, 0.3);
    g.fillRect(x + 2, y + size - 2 - fillH, size - 4, fillH);
    g.fillStyle(this.accent, 1);
    g.fillRect(x, y, size, 3);
    g.fillRect(x, y + size - 3, size, 3);
    g.fillRect(x, y, 3, size);
    g.fillRect(x + size - 3, y, 3, size);
  }

  /** A cooldown was just cut short: the slot washes grey, fading out. */
  private drawReduceFlash(sinceMs: number): void {
    const A = THEME.ability;
    const g = this.reduceGfx;
    if (!(sinceMs >= 0 && sinceMs < A.reduceFlashMs)) {
      if (g.visible) g.clear().setVisible(false);
      return;
    }
    const size = this.size;
    g.clear().setVisible(true);
    g.fillStyle(A.reduceFlash, A.reduceFlashAlpha * (1 - sinceMs / A.reduceFlashMs));
    g.fillRect(Math.round(this.cx - size / 2) + 2, Math.round(this.cy - size / 2) + 2, size - 4, size - 4);
  }

  /** Slot plate: accent border when ready, dim border while on cooldown. */
  private drawFrame(ready: boolean): void {
    const size = this.size;
    this.frame.clear();
    pixelPanel(this.frame, this.cx - size / 2, this.cy - size / 2, size, size, {
      fill: THEME.ability.fill,
      fillAlpha: 0.92,
      edge: ready ? this.accent : THEME.ability.cooldownEdge,
      highlight: ready ? THEME.ui.panelHighlight : undefined,
      border: 3,
    });
  }

  /**
   * Radial sweep showing `fraction` of the cooldown still remaining. Drawn as a
   * dark pie starting at 12 o'clock and sweeping clockwise, so the dark wedge
   * shrinks away as the ability comes back up.
   */
  private drawSweep(fraction: number): void {
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    const size = this.size;
    // Oversized on purpose: the geometry mask trims it back to the slot.
    const r = size * 0.78;
    const start = -Math.PI / 2;

    this.sweep.clear();
    this.sweep.fillStyle(THEME.ability.sweepColor, THEME.ability.cooldownWashAlpha * 0.55);
    this.sweep.fillRect(this.cx - size / 2, this.cy - size / 2, size, size);

    if (f <= 0) return;

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
