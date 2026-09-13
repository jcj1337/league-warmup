import Phaser from 'phaser';
import { ARENA, DEBUG, ROUND } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { GameScene } from './GameScene';

/**
 * HUD + end screen. Runs as a parallel scene on top of GameScene and polls it
 * every frame, so restarting the game scene never breaks the UI wiring.
 */
export class UIScene extends Phaser.Scene {
  private game_!: GameScene;

  private timeText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private qText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private stateText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;

  private overlay!: Phaser.GameObjects.Container;
  private resultText!: Phaser.GameObjects.Text;
  private overlayVisible = false;

  constructor() {
    // active: true so the HUD boots alongside GameScene — Phaser only
    // auto-starts the first scene in the config array.
    super({ key: 'UIScene', active: true });
  }

  create(): void {
    this.game_ = this.scene.get('GameScene') as GameScene;

    const label = (x: number, y: number, size: number, color: string) =>
      this.add
        .text(x, y, '', { fontFamily: THEME.ui.fontFamily, fontSize: `${size}px`, color })
        .setDepth(101);

    // Panels are inset from the arena corners so the corner brackets of the
    // field frame stay visible underneath them.
    const M = 56;

    // ---- top-left: the round readout, on its own plate -------------------
    this.panel(M, 40, 320, 50);
    this.timeText = label(M + 16, 51, 24, THEME.ui.text);
    this.scoreText = label(M + 146, 55, 18, THEME.ui.accent);

    // ---- top-centre: difficulty ------------------------------------------
    this.levelText = label(ARENA.width / 2, 52, 14, THEME.ui.faint).setOrigin(0.5, 0);

    // ---- top-right: live mechanics panel ---------------------------------
    const dbgX = ARENA.width - M - 244;
    this.panel(dbgX - 16, 40, 260, 140);
    this.stateText = label(dbgX, 50, 15, THEME.ui.dim);
    this.debugText = label(dbgX, 76, 12, THEME.ui.faint);
    this.debugText.setLineSpacing(6);

    // ---- bottom-left: vitals + abilities ---------------------------------
    const vitalsTop = ARENA.height - 122;
    this.panel(M, vitalsTop, 320, 76);

    const barY = vitalsTop + 52;
    this.add
      .rectangle(M + 16, barY, 240, 14, 0x000000, 0.55)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, THEME.ui.panelStroke)
      .setDepth(101);
    this.hpBar = this.add
      .rectangle(M + 17, barY, 238, 12, 0x62d26f)
      .setOrigin(0, 0.5)
      .setDepth(102);
    this.hpText = label(M + 266, barY - 8, 13, THEME.ui.dim);

    this.qText = label(M + 16, vitalsTop + 16, 15, THEME.ui.text);
    // Pending-command line: Attack Move stance, etc.
    this.modeText = label(M + 126, vitalsTop + 16, 15, THEME.ui.danger);

    // ---- bottom-right: controls ------------------------------------------
    this.hintText = label(ARENA.width - M, ARENA.height - 62, 12, THEME.ui.faint).setOrigin(1, 0);
    this.hintText.setText(
      'RMB move / attack     T attack-move at cursor     A + LMB attack-move     S stop     Q skillshot',
    );

    this.buildOverlay();
  }

  /** Rounded, semi-transparent plate that groups a block of HUD text. */
  private panel(x: number, y: number, w: number, h: number): void {
    const g = this.add.graphics().setDepth(100);
    g.fillStyle(THEME.ui.panelColor, THEME.ui.panelAlpha);
    g.fillRoundedRect(x, y, w, h, THEME.ui.panelRadius);
    g.lineStyle(1, THEME.ui.panelStroke, 0.9);
    g.strokeRoundedRect(x, y, w, h, THEME.ui.panelRadius);
  }

  private buildOverlay(): void {
    const bg = this.add
      .rectangle(0, 0, ARENA.width, ARENA.height, 0x05070b, 0.86)
      .setOrigin(0, 0);

    const title = this.add
      .text(ARENA.width / 2, 110, '', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '42px',
        color: THEME.ui.text,
      })
      .setOrigin(0.5);
    title.setName('title');

    this.resultText = this.add
      .text(ARENA.width / 2, 340, '', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '17px',
        color: THEME.ui.text,
        align: 'left',
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    const button = this.add
      .rectangle(ARENA.width / 2, 630, 260, 52, 0x16202e)
      .setStrokeStyle(2, 0x5fb0ff)
      .setInteractive({ useHandCursor: true });

    const buttonText = this.add
      .text(ARENA.width / 2, 630, 'PLAY AGAIN  [R]', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '19px',
        color: THEME.ui.accent,
      })
      .setOrigin(0.5);

    button.on('pointerover', () => button.setFillStyle(0x23354c));
    button.on('pointerout', () => button.setFillStyle(0x16202e));
    button.on('pointerdown', () => this.game_.restartRound());

    this.overlay = this.add
      .container(0, 0, [bg, title, this.resultText, button, buttonText])
      .setDepth(200)
      .setVisible(false);
  }

  override update(): void {
    const hud = this.game_.getHudState();

    this.timeText.setText(hud.timeRemaining.toFixed(1));
    this.timeText.setColor(hud.timeRemaining <= 10 ? THEME.ui.warn : THEME.ui.text);
    this.scoreText.setText(`SCORE  ${hud.score}`);
    this.levelText.setText(
      `DIFFICULTY ${hud.difficultyLevel}      ${hud.elapsed.toFixed(0)}s ELAPSED`,
    );

    const hpPct = Phaser.Math.Clamp(hud.hp / hud.maxHp, 0, 1);
    this.hpBar.width = 238 * hpPct;
    this.hpBar.setFillStyle(hpPct > 0.5 ? 0x62d26f : hpPct > 0.25 ? 0xffd166 : 0xff6b6b);
    this.hpText.setText(`${Math.ceil(hud.hp)} / ${hud.maxHp}`);

    // Q is quick-cast, so the only states are ready and cooling down.
    if (hud.qCooldownMs <= 0) {
      this.qText.setText('Q  READY').setColor(THEME.ui.good);
    } else {
      this.qText.setText(`Q  ${(hud.qCooldownMs / 1000).toFixed(1)}s`).setColor(THEME.ui.faint);
    }

    this.modeText
      .setText(hud.attackMovePending ? 'A  ATTACK MOVE — click a location' : '')
      .setVisible(hud.attackMovePending);

    // READY / WINDUP / RECOVERY — the system's own view of the attack cycle, so
    // you can compare what you feel against what the state machine thinks.
    const stateLabel = hud.attackState === 'idle' ? 'READY' : hud.attackState.toUpperCase();
    const stateColor =
      hud.attackState === 'windup' ? THEME.ui.warn
      : hud.attackState === 'recovery' ? THEME.ui.good
      : THEME.ui.dim;

    this.debugText.setVisible(DEBUG.showAttackState);
    this.stateText.setVisible(DEBUG.showAttackState).setText(`STATE  ${stateLabel}`).setColor(stateColor);

    this.debugText.setText([
      `AS       ${hud.attacksPerSecond.toFixed(2)}/s  (${Math.round(hud.attackCooldownMs)}ms)`,
      `AUTOS    ${hud.attacksLanded}/${hud.attacksFired}  cancel ${hud.attacksCancelled}`,
      `MISSILES ${hud.missilesInFlight} in flight`,
      `IDLE     ${(hud.idleInRangeMs / 1000).toFixed(1)}s in range`,
      `STILL    ${(hud.wastedRecoveryMs / 1000).toFixed(1)}s in recovery`,
    ].join('\n'));

    this.syncOverlay();
  }

  private syncOverlay(): void {
    const result = this.game_.getRoundResult();
    const shouldShow = result !== null;

    if (shouldShow === this.overlayVisible) return;
    this.overlayVisible = shouldShow;
    this.overlay.setVisible(shouldShow);
    if (!result) return;

    const accuracy = result.qFired > 0 ? Math.round((result.qHit / result.qFired) * 100) : 0;
    const title = this.overlay.getByName('title') as Phaser.GameObjects.Text;
    title
      .setText(result.survived ? 'ROUND COMPLETE' : 'DEFEATED')
      .setColor(result.survived ? THEME.ui.accent : THEME.ui.danger);

    const row = (label: string, value: string) => `${label.padEnd(24, ' ')}${value}`;
    const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

    this.resultText.setText(
      [
        row('SCORE', `${result.score}`),
        row('TARGETS KILLED', `${result.targetsKilled}`),
        row('DAMAGE DEALT', `${result.damageDealt}`),
        row('PROJECTILES HIT BY', `${result.projectileHitsTaken}`),
        row('Q ACCURACY', `${result.qHit}/${result.qFired}  (${accuracy}%)`),
        row('SURVIVED', `${result.timeSurvived.toFixed(1)}s / ${ROUND.durationSeconds}s`),
        '',
        '--- MECHANICS (raw, not scored yet) ---',
        row('AUTOS STARTED', `${result.attacksStarted}`),
        row('AUTOS FIRED / LANDED', `${result.attacksFired} / ${result.attacksLanded}`),
        row('AUTOS CANCELLED', `${result.attacksCancelled}`),
        row('IDLE, TARGET IN RANGE', secs(result.idleInRangeMs)),
        row('STILL IN RECOVERY', secs(result.wastedRecoveryMs)),
      ].join('\n'),
    );
  }
}
