import Phaser from 'phaser';
import type { Champion } from '../../champions/types';
import { THEME } from '../../config/theme';
import { ensurePlayerFrames, type PlayerLook } from '../art/look';
import { pixelText } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';

/** Portrait tile size, and the clear space between neighbours' tiles or names (whichever is wider), in screen pixels. */
const TILE = 76;
const GAP = 40;

/**
 * The champion picker on the start screen: one portrait tile per champion
 * (its slime, wearing the player's cosmetics), the picked one framed in gold.
 * Pure view: clicking a tile calls `onPick`; whoever owns the row decides
 * what that means (the profile, a fresh round).
 */
export class ChampionRow {
  readonly container: Phaser.GameObjects.Container;
  private readonly tiles = new Map<string, { frame: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.BitmapText; cx: number; cy: number }>();
  private selected: string;

  constructor(
    scene: Phaser.Scene,
    cx: number,
    cy: number,
    private readonly champions: readonly Champion[],
    selected: string,
    look: PlayerLook,
    private readonly onPick: (id: string) => void,
  ) {
    this.selected = selected;
    const parts: Phaser.GameObjects.GameObject[] = [];
    // Names are wider than tiles ('CASSIOPEIA'), so the row is spaced by the widest of either.
    const names = champions.map((c) => pixelText(scene, 0, cy + TILE / 2 + 12, c.name.toUpperCase(), 2, THEME.ui.dim).setOrigin(0.5));
    const pitch = Math.max(TILE, ...names.map((n) => n.width)) + GAP;
    const left = cx - ((champions.length - 1) * pitch) / 2;

    champions.forEach((champion, i) => {
      const x = Math.round(left + i * pitch);
      const frame = scene.add.graphics();
      const portrait = scene.add
        .image(x, cy - 4, ensurePlayerFrames(scene, champion, look).frames.idle[0])
        .setScale(THEME.art.scale);
      const name = names[i].setX(x);
      const hit = scene.add.rectangle(x, cy, TILE, TILE, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { if (champion.id !== this.selected) this.drawTile(champion.id, 'hover'); });
      hit.on('pointerout', () => { if (champion.id !== this.selected) this.drawTile(champion.id, 'idle'); });
      hit.on('pointerup', () => this.onPick(champion.id));
      this.tiles.set(champion.id, { frame, name, cx: x, cy });
      parts.push(frame, portrait, name, hit);
    });

    this.container = scene.add.container(0, 0, parts);
    this.setSelected(selected);
  }

  get selectedId(): string {
    return this.selected;
  }

  setSelected(id: string): void {
    this.selected = id;
    for (const champion of this.champions) this.drawTile(champion.id, champion.id === id ? 'selected' : 'idle');
  }

  /** The champion `step` tiles along from the picked one, wrapping. */
  neighbour(step: number): string {
    const ids = this.champions.map((c) => c.id);
    const i = Math.max(0, ids.indexOf(this.selected));
    return ids[(i + step + ids.length) % ids.length];
  }

  private drawTile(id: string, state: 'idle' | 'hover' | 'selected'): void {
    const tile = this.tiles.get(id);
    if (!tile) return;
    const edge = state === 'selected' ? THEME.ui.accent : state === 'hover' ? THEME.menu.buttonEdgeHover : THEME.menu.buttonEdge;
    tile.frame.clear();
    pixelPanel(tile.frame, tile.cx - TILE / 2, tile.cy - TILE / 2, TILE, TILE, {
      fill: state === 'selected' ? THEME.menu.buttonHover : THEME.menu.button,
      fillAlpha: 1,
      edge,
      highlight: state === 'selected' ? THEME.ui.panelHighlight : undefined,
      border: 3,
    });
    tile.name.setTint(state === 'selected' ? THEME.ui.accent : THEME.ui.dim);
  }
}
