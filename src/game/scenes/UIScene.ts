import Phaser from 'phaser';
import { ARENA, DEBUG } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText, setPixelScale } from '../art/font';
import { ensureArt } from '../art/textures';
import { AbilityBar } from '../ui/AbilityBar';
import { ChatBox } from '../ui/ChatBox';
import { missionBriefing, missionComplete, welcomeMessage } from '../ui/missionMessages';
import { PassiveDisplay } from '../ui/PassiveDisplay';
import { PauseMenu } from '../ui/PauseMenu';
import { PixelBar } from '../view/PixelBar';
import { pixelPanel } from '../view/pixelDraw';
import type { GameScene } from './GameScene';

type Hud = ReturnType<GameScene['getHudState']>;

const HP_BAR_WIDTH = 200;

/**
 * HUD + end screen. Runs as a parallel scene on top of GameScene and polls it
 * every frame, so restarting the game scene never breaks the UI wiring.
 */
export class UIScene extends Phaser.Scene {
  private game_!: GameScene;

  private timeText!: Phaser.GameObjects.BitmapText;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private progressText!: Phaser.GameObjects.BitmapText;
  private modeText!: Phaser.GameObjects.BitmapText;
  /** Top-right "APM  180" readout. */
  private apmText!: Phaser.GameObjects.BitmapText;

  private abilityBar!: AbilityBar;
  private passiveDisplay!: PassiveDisplay;
  private pauseMenu!: PauseMenu;
  private stageText!: Phaser.GameObjects.BitmapText;
  /** Last stage / wave the transition banner reacted to. Round-scoped: see beginRound(). */
  private lastStage = 1;
  private lastWave = 1;
  /** The transition banner in effect, and the run-time ms it stays up until. Round-scoped. */
  private bannerText = '';
  private bannerIsStage = false;
  private bannerUntil = 0;
  /** The GameScene round (HudState.round) this HUD last polled. */
  private observedRound = 0;

  /** Bottom-left system messages. Built once, so its dragged position and light/dark mode outlive restarts. */
  private chat!: ChatBox;
  /** Stage the chat last briefed, and the stage it last announced as cleared. Round-scoped. */
  private chatStage = 0;
  private chatClearedStage = 0;

  private hpBar!: PixelBar;
  private hpText!: Phaser.GameObjects.BitmapText;
  private hpBand: 'high' | 'mid' | 'low' | null = null;

  private overlay!: Phaser.GameObjects.Container;
  private resultText!: Phaser.GameObjects.BitmapText;
  private overlayVisible = false;

  constructor() {
    // active: true so the HUD boots alongside GameScene — Phaser only
    // auto-starts the first scene in the config array.
    super({ key: 'UIScene', active: true });
  }

  create(): void {
    ensureArt(this);
    this.game_ = this.scene.get('GameScene') as GameScene;

    const M = 40;

    // ---- top-left: run time + score, on one compact plate ----------------
    this.panel(M, 30, 300, 46);
    this.timeText = pixelText(this, M + 14, 41, '', 3).setDepth(101);
    this.scoreText = pixelText(this, M + 146, 45, '', 2, THEME.ui.accent).setDepth(101);

    // ---- top-centre: stage / wave progress -------------------------------
    this.panel(ARENA.width / 2 - 250, 30, 500, 34);
    this.progressText = pixelText(this, ARENA.width / 2, 47, '', 2).setOrigin(0.5).setDepth(101);

    // ---- top-right: APM ----------------------------------------------------
    const apmW = 130;
    this.panel(ARENA.width - M - apmW, 30, apmW, 34);
    pixelText(this, ARENA.width - M - apmW + 14, 47, 'APM', 2, THEME.ui.dim).setOrigin(0, 0.5).setDepth(101);
    this.apmText = pixelText(this, ARENA.width - M - 14, 47, '0', 2).setOrigin(1, 0.5).setDepth(101);

    // ---- bottom-left: vitals ----------------------------------------------
    const vitalsTop = ARENA.height - 96;
    this.panel(M, vitalsTop, 300, 56);
    pixelText(this, M + 14, vitalsTop + 12, 'HP', 2, THEME.ui.dim).setDepth(101);
    this.hpBar = new PixelBar(this, HP_BAR_WIDTH, { top: THEME.ui.hpTop, bottom: THEME.ui.hpBottom }, 102, 10, 2);
    this.hpText = pixelText(this, M + 14 + 36, vitalsTop + 12, '', 2).setDepth(101);

    // ---- bottom-left, above vitals: system messages ------------------------
    this.chat = new ChatBox(this);
    // Z toggles the feed's light/dark mode, once per physical press. Raw-input
    // APM counts the press on its own.
    this.input.keyboard?.on('keydown-Z', (event: KeyboardEvent) => {
      if (!event.repeat) this.chat.toggleMode();
    });

    // Pending-command banner, sat just above the ability bar where the eyes already are.
    this.modeText = pixelText(this, ARENA.width / 2, ARENA.height - 150, '', 2, THEME.ui.danger)
      .setOrigin(0.5, 0.5)
      .setDepth(101);

    // ---- bottom-right: menu hint -------------------------------------------
    pixelText(this, ARENA.width - M, ARENA.height - 36, 'ESC  MENU', 2, THEME.ui.faint)
      .setOrigin(1, 1)
      .setDepth(101);

    // ---- bottom-centre: ability bar + summoner slot ----------------------
    this.abilityBar = new AbilityBar(this, [
      { key: 'Q', icon: 'q' },
      { key: 'W', icon: 'w' },
      { key: 'E', icon: 'e' },
      { key: 'F', icon: 'flash', summoner: true },
    ]);

    // Passive gems sit just above the bar.
    const slotTop = ARENA.height - THEME.ability.bottomMargin - THEME.ability.slotSize;
    this.passiveDisplay = new PassiveDisplay(this, 5, slotTop - 26);

    // Stage / wave transition banner, centred above the play area.
    this.stageText = pixelText(this, ARENA.width / 2, 92, '', 4, THEME.ui.accent)
      .setOrigin(0.5, 0)
      .setDepth(101)
      .setVisible(false);

    this.buildOverlay();
    this.buildPauseMenu();
  }

  /** Pixel HUD plate that groups a block of HUD content. */
  private panel(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(100);
    pixelPanel(g, x, y, w, h, {
      fill: THEME.ui.panel,
      fillAlpha: THEME.ui.panelAlpha,
      edge: THEME.ui.panelEdge,
      highlight: THEME.ui.panelHighlight,
    });
    return g;
  }

  /**
   * The Escape menu. Settings write straight into the DEBUG config block, which
   * gameplay and HUD code already re-read every frame — so there is no second
   * copy of the settings state to keep in sync.
   */
  private buildPauseMenu(): void {
    this.pauseMenu = new PauseMenu(
      this,
      {
        resume: () => this.game_.setPaused(false),
        restart: () => {
          this.game_.setPaused(false);
          this.game_.restartRound();
        },
      },
      [
        {
          label: 'Range Indicator',
          read: () => DEBUG.attackRangeDisplay.toUpperCase(),
          cycle: () => {
            const order = ['contextual', 'always', 'off'] as const;
            const next = (order.indexOf(DEBUG.attackRangeDisplay) + 1) % order.length;
            DEBUG.attackRangeDisplay = order[next];
          },
        },
        {
          label: 'Damage Numbers',
          read: () => (DEBUG.showDamageNumbers ? 'ON' : 'OFF'),
          cycle: () => {
            DEBUG.showDamageNumbers = !DEBUG.showDamageNumbers;
          },
        },
      ],
      [
        'RMB ground | move',
        'RMB enemy | attack that enemy',
        'T | attack-move at cursor',
        'A + LMB | attack-move at a point',
        'S | stop',
        'Q | damage skillshot',
        'W | mark skillshot',
        'E | blink + homing bolt',
        'F | flash (summoner)',
      ],
    );
  }

  private buildOverlay(): void {
    const bg = this.add.rectangle(0, 0, ARENA.width, ARENA.height, THEME.ui.scrim, 0.8).setOrigin(0, 0);

    const plate = this.add.graphics();
    pixelPanel(plate, ARENA.width / 2 - 380, 56, 760, 616, {
      fill: THEME.ui.panel, fillAlpha: 0.96, edge: THEME.ui.panelEdge, highlight: THEME.ui.panelHighlight, border: 3,
    });

    const title = pixelText(this, ARENA.width / 2, 110, '', 6).setOrigin(0.5);
    title.setName('title');

    this.resultText = pixelText(this, ARENA.width / 2, 368, '', 2).setOrigin(0.5).setLineSpacing(6);

    const button = this.add
      .rectangle(ARENA.width / 2, 626, 280, 48, THEME.menu.button)
      .setStrokeStyle(3, THEME.ui.accent)
      .setInteractive({ useHandCursor: true });

    const buttonText = pixelText(this, ARENA.width / 2, 626, 'PLAY AGAIN  [R]', 2, THEME.ui.accent).setOrigin(0.5);

    button.on('pointerover', () => button.setFillStyle(THEME.menu.buttonHover));
    button.on('pointerout', () => button.setFillStyle(THEME.menu.button));
    button.on('pointerdown', () => this.game_.restartRound());

    this.overlay = this.add
      .container(0, 0, [bg, plate, title, this.resultText, button, buttonText])
      .setDepth(200)
      .setVisible(false);
  }

  /**
   * GameScene started a new round. UIScene itself is never restarted, so
   * round-scoped HUD state is re-initialised here from the new round's own
   * snapshot — the first round goes through this exact path too.
   */
  private beginRound(hud: Hud): void {
    this.observedRound = hud.round;
    this.lastStage = hud.stage;
    this.lastWave = hud.wave;
    this.bannerText = '';
    this.bannerIsStage = false;
    this.bannerUntil = 0;

    // A new run gets a fresh history; the panel stays wherever it was dragged.
    this.chat.reset();
    this.chat.push(welcomeMessage(), 'welcome');
    this.chatStage = hud.stage;
    this.chatClearedStage = 0;
    this.chat.push(missionBriefing(hud.stage, hud.wavesInStage, hud.stage === hud.stageCount), 'mission');
  }

  override update(): void {
    const hud = this.game_.getHudState();
    if (hud.round !== this.observedRound) this.beginRound(hud);

    this.timeText.setText(formatRunTime(hud.runTime));
    this.scoreText.setText(`SCORE ${hud.score}`);
    this.progressText.setText(
      `STAGE ${hud.stage} / ${hud.stageCount}    WAVE ${hud.wave} / ${hud.wavesInStage}    ENEMIES ${hud.enemiesRemaining}`,
    );

    const hpPct = Phaser.Math.Clamp(hud.hp / hud.maxHp, 0, 1);
    const band = hpPct > 0.5 ? 'high' : hpPct > 0.25 ? 'mid' : 'low';
    if (band !== this.hpBand) {
      this.hpBand = band;
      const U = THEME.ui;
      this.hpBar.setColors(
        band === 'high' ? { top: U.hpTop, bottom: U.hpBottom }
        : band === 'mid' ? { top: U.hpMidTop, bottom: U.hpMidBottom }
        : { top: U.hpLowTop, bottom: U.hpLowBottom },
      );
    }
    const vitalsTop = ARENA.height - 96;
    this.hpBar.update(40 + 14 + HP_BAR_WIDTH / 2, vitalsTop + 34, hpPct);
    this.hpText.setText(`${Math.ceil(hud.hp)} / ${hud.maxHp}`);

    // Every slot is handed the real numbers from AbilityCooldowns and derives
    // nothing — which is why a Q hit refunding W/E shows up instantly on all three.
    const cd = hud.abilityCooldowns;
    const castOf = (id: string) => (hud.castingAbility === id ? hud.castProgress : 0);
    this.abilityBar.update([
      { cooldownMs: cd.q.remaining, cooldownTotalMs: cd.q.total, castProgress: castOf('q') },
      { cooldownMs: cd.w.remaining, cooldownTotalMs: cd.w.total, castProgress: castOf('w') },
      { cooldownMs: cd.e.remaining, cooldownTotalMs: cd.e.total, castProgress: castOf('e') },
      { cooldownMs: cd.flash.remaining, cooldownTotalMs: cd.flash.total, castProgress: 0 },
    ]);

    this.modeText
      .setText(hud.attackMovePending ? 'ATTACK MOVE - CLICK A LOCATION' : '')
      .setVisible(hud.attackMovePending);

    this.apmText.setText(`${hud.apm}`);

    this.passiveDisplay.update(hud.passiveStacks, hud.passiveFraction);
    this.updateStageBanner(hud);
    this.updateChat(hud);
    this.chat.update();

    this.pauseMenu.setVisible(this.game_.isPaused);

    this.syncOverlay();
  }

  /**
   * Stage / wave transition feedback, derived purely from the polled snapshot:
   *   a new stage begins → big "STAGE N" for THEME.banners.stageMs
   *   a later wave begins → smaller "WAVE N" for THEME.banners.waveMs
   *   breather after a clear → "WAVE CLEAR" / "STAGE CLEAR" until the next spawn
   * Timed on run time from the HUD snapshot, so it freezes with a pause.
   */
  private updateStageBanner(hud: Hud): void {
    const nowMs = hud.runTime * 1000;

    if (hud.stage !== this.lastStage) {
      this.lastStage = hud.stage;
      this.lastWave = hud.wave;
      this.bannerText = `STAGE ${hud.stage}`;
      this.bannerIsStage = true;
      this.bannerUntil = nowMs + THEME.banners.stageMs;
    } else if (hud.wave !== this.lastWave) {
      this.lastWave = hud.wave;
      this.bannerText = `WAVE ${hud.wave}`;
      this.bannerIsStage = false;
      this.bannerUntil = nowMs + THEME.banners.waveMs;
    }

    if (nowMs < this.bannerUntil) {
      setPixelScale(this.stageText.setVisible(true).setText(this.bannerText), this.bannerIsStage ? 5 : 3)
        .setTint(this.bannerIsStage ? THEME.ui.accent : THEME.ui.text);
      return;
    }

    if (hud.wavePhase === 'intermission') {
      setPixelScale(
        this.stageText.setVisible(true).setText(hud.nextTransition === 'stage' ? 'STAGE CLEAR' : 'WAVE CLEAR'),
        3,
      ).setTint(THEME.ui.good);
      return;
    }

    this.stageText.setVisible(false);
  }

  /**
   * Mission messages, derived purely from the polled snapshot (the same state
   * the stage banner reads — no gameplay events):
   *   hud.stage changes            → "Mission N: Clear W waves." (W = hud.wavesInStage,
   *                                  i.e. the live STAGES row; final stage worded as such)
   *   the stage's last wave clears → "Mission N complete!" — the breather before the
   *                                  next stage, or the run completing
   * Kills, hits and ordinary wave clears say nothing.
   */
  private updateChat(hud: Hud): void {
    if (hud.stage !== this.chatStage) {
      this.chatStage = hud.stage;
      this.chatClearedStage = 0;
      this.chat.push(missionBriefing(hud.stage, hud.wavesInStage, hud.stage === hud.stageCount), 'mission');
    }

    const stageCleared =
      (hud.wavePhase === 'intermission' && hud.nextTransition === 'stage') || hud.wavePhase === 'complete';
    if (stageCleared && this.chatClearedStage !== hud.stage) {
      this.chatClearedStage = hud.stage;
      this.chat.push(missionComplete(hud.stage), 'complete');
    }
  }

  private syncOverlay(): void {
    const result = this.game_.getRoundResult();
    const shouldShow = result !== null;

    if (shouldShow === this.overlayVisible) return;
    this.overlayVisible = shouldShow;
    this.overlay.setVisible(shouldShow);
    if (!result) return;

    const completed = result.outcome === 'completed';
    const accuracy = result.qFired > 0 ? Math.round((result.qHit / result.qFired) * 100) : 0;
    const title = this.overlay.getByName('title') as Phaser.GameObjects.BitmapText;
    title
      .setText(completed ? 'RUN COMPLETE' : 'DEFEATED')
      .setTint(completed ? THEME.ui.accent : THEME.ui.danger);

    const row = (label: string, value: string) => `${label.padEnd(24, ' ')}${value}`;
    const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

    this.resultText.setText(
      [
        row(
          'STAGE REACHED',
          `${result.stageReached} / ${result.stageCount}   (wave ${result.waveReached} / ${result.wavesInStage})`,
        ),
        row('WAVES CLEARED', `${result.wavesCleared} / ${result.wavesTotal}`),
        row('RUN TIME', formatRunTime(result.runTimeSeconds)),
        row('SCORE', `${result.score}`),
        row(
          'KILLS',
          `${result.targetsKilled}   (basic ${result.killsByType.basic ?? 0}, pursuer ${result.killsByType.pursuer ?? 0}, magus ${result.killsByType.magus ?? 0})`,
        ),
        row('HITS LANDED', `${result.hitsLanded}   (mark procs ${result.markProcs})`),
        row('PROJECTILES HIT BY', `${result.projectileHitsTaken}`),
        row('Q ACCURACY', `${result.qHit}/${result.qFired}  (${accuracy}%)`),
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

/** 65.34 → "1:05.3". Run time is a statistic, not a countdown. */
export function formatRunTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}
