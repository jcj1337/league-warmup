import Phaser from 'phaser';
import { CursorLock } from '../CursorLock';
import { Keybinds } from '../Keybinds';
import { MouseSpeed } from '../MouseSpeed';
import { RunHistory, type RunSummary } from '../RunHistory';
import { Settings } from '../Settings';
import { Profile } from '../../profile/Profile';
import { resolveLook } from '../../cosmetics/catalogue';
import { ChampionRow } from '../ui/ChampionRow';
import { CHAMPIONS, DEFAULT_CHAMPION, isChampionId, SLOTS, type Champion } from '../../champions';
import type { BindableAction } from '../Keybinds';
import { ARENA, DEBUG, BALANCE_VERSION, MOUSE } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText, setPixelScale } from '../art/font';
import { TEX, ensureArt } from '../art/textures';
import { AbilityBar } from '../ui/AbilityBar';
import { ChatBox } from '../ui/ChatBox';
import { missionBriefing, missionComplete, stageThreats, welcomeMessage } from '../ui/missionMessages';
import { PassiveDisplay } from '../ui/PassiveDisplay';
import { PauseMenu } from '../ui/PauseMenu';
import { PixelBar } from '../view/PixelBar';
import { pixelPanel } from '../view/pixelDraw';
import type { GameScene } from './GameScene';

type Hud = ReturnType<GameScene['getHudState']>;

const HP_BAR_WIDTH = 200;
/** End screen: panel width and the text's left / right margin inside it. */
const END_PANEL_WIDTH = 920;
const END_PANEL_MARGIN = 64;

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

  /** Built per champion (see buildKitHud): the slots and the passive readout. */
  private abilityBar: AbilityBar | null = null;
  private passiveDisplay: PassiveDisplay | null = null;
  private hudChampion: Champion | null = null;
  private unsubscribeKeys: (() => void) | null = null;
  private pauseMenu!: PauseMenu;
  private cursorLock!: CursorLock;
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
  private levelText!: Phaser.GameObjects.BitmapText;
  private xpBar!: PixelBar;
  private shownLevel = 1;
  private hpBand: 'high' | 'mid' | 'low' | null = null;

  private overlay!: Phaser.GameObjects.Container;
  private resultText!: Phaser.GameObjects.BitmapText;
  private overlayVisible = false;

  /** Title card over a held round (page load, "Change champion"); a click or key starts the run. */
  private startScreen!: Phaser.GameObjects.Container;
  private championRow!: ChampionRow;

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
    // Wide enough for an 8-digit score; stops short of the centre plate (x 390).
    this.panel(M, 30, 340, 46);
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
    // Level and XP to the next one: a slim gold bar under the HP bar.
    this.levelText = pixelText(this, M + 300 - 14, vitalsTop + 12, '', 2, THEME.ui.level).setOrigin(1, 0).setDepth(101);
    this.xpBar = new PixelBar(this, HP_BAR_WIDTH, { top: THEME.ui.xpTop, bottom: THEME.ui.xpBottom }, 102, 3, 1);

    // ---- bottom-left, above vitals: system messages ------------------------
    this.chat = new ChatBox(this);
    // Z (rebindable) toggles the feed's light/dark mode, once per physical
    // press. Raw-input APM counts the press on its own.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!event.repeat && event.code === Keybinds.code('chatMode')) this.chat.toggleMode();
    });

    // Pending-command banner, sat just above the ability bar where the eyes already are.
    this.modeText = pixelText(this, ARENA.width / 2, ARENA.height - 150, '', 2, THEME.ui.danger)
      .setOrigin(0.5, 0.5)
      .setDepth(101);

    // ---- bottom-right: menu hint -------------------------------------------
    pixelText(this, ARENA.width - M, ARENA.height - 36, 'ESC  MENU', 2, THEME.ui.faint)
      .setOrigin(1, 1)
      .setDepth(101);

    // ---- bottom-centre: ability bar + summoner slot, per champion ---------
    this.buildKitHud(championOf(this.game_.getHudState().champion));

    // Stage / wave transition banner, centred above the play area.
    this.stageText = pixelText(this, ARENA.width / 2, 92, '', 4, THEME.ui.accent)
      .setOrigin(0.5, 0)
      .setDepth(101)
      .setVisible(false);

    this.buildOverlay();
    this.buildPauseMenu();
    this.buildStartScreen();

    // Mouse Speed: UIScene outlives every round, so the lock is built once, here.
    this.cursorLock = new CursorLock(this.game.canvas, {
      wantsLock: () => this.game_.ownsMouse,
      onLockLost: () => this.game_.onCursorLockLost(),
    });

    // Pause on Focus Loss: alt-tab, clicking another window, or switching tabs
    // opens the pause menu instead of letting the run play on unattended.
    // UIScene is never restarted, so these are added once.
    const pauseIfUnfocused = (): void => {
      if (Settings.pauseOnFocusLoss && this.game_.ownsMouse) this.game_.setPaused(true);
    };
    window.addEventListener('blur', pauseIfUnfocused);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseIfUnfocused();
    });
  }

  /**
   * The champion-specific HUD: a slot per ability (plus Flash) with the keys
   * bound to them, and the passive readout above the bar for a champion with
   * stacks. Rebuilt when a round starts as someone else.
   */
  private buildKitHud(champion: Champion): void {
    if (this.hudChampion === champion) return;
    this.hudChampion = champion;
    this.unsubscribeKeys?.();
    this.abilityBar?.destroy();
    this.passiveDisplay?.destroy();

    const slots = SLOTS.filter((slot) => champion.slots[slot] !== undefined);
    const actionOf = (slot: (typeof SLOTS)[number]): BindableAction => `ability${slot.toUpperCase()}` as BindableAction;
    const slotKeys = () => [...slots.map((slot) => Keybinds.label(actionOf(slot))), Keybinds.label('flash')];
    const keys = slotKeys();
    this.abilityBar = new AbilityBar(this, [
      ...slots.map((slot, i) => {
        const def = champion.slots[slot]!;
        return { key: keys[i], icon: def.icon, accent: def.accent };
      }),
      { key: keys[slots.length], icon: TEX.icons.flash, accent: THEME.ability.accents.flash, summoner: true },
    ]);
    this.unsubscribeKeys = Keybinds.onChange(() => this.abilityBar?.setKeys(slotKeys()));

    // Passive gems sit just above the bar.
    const passive = this.game_.getHudState();
    const slotTop = ARENA.height - THEME.ability.bottomMargin - THEME.ability.slotSize;
    this.passiveDisplay = passive.passiveMaxStacks > 0 ? new PassiveDisplay(this, passive.passiveMaxStacks, slotTop - 26) : null;

    this.pauseMenu?.setLabels((action) => {
      const slot = SLOTS.find((s) => actionOf(s) === action);
      if (!slot) return null;
      const def = champion.slots[slot];
      return `${slot.toUpperCase()}: ${def ? def.label : 'no ultimate'}`;
    });
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
   * The Escape menu. Range Indicator and Damage Numbers go through `Settings`,
   * which writes the DEBUG config block that gameplay and HUD code already
   * re-read every frame and saves it for the next visit.
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
        changeChampion: () => {
          this.game_.setPaused(false);
          this.game_.returnToStart();
        },
      },
      [
        {
          // League's Mouse Speed: a multiplier on cursor movement (CursorLock applies it).
          label: 'Mouse Speed',
          slider: { min: MOUSE.minSpeed, max: MOUSE.maxSpeed, step: MOUSE.step },
          value: () => MouseSpeed.value,
          set: (v: number) => {
            MouseSpeed.set(v);
          },
          read: () => MouseSpeed.label(),
        },
        {
          label: 'Range Indicator',
          read: () => DEBUG.attackRangeDisplay.toUpperCase(),
          cycle: () => Settings.cycleRangeIndicator(),
        },
        {
          label: 'Damage Numbers',
          read: () => (DEBUG.showDamageNumbers ? 'ON' : 'OFF'),
          cycle: () => Settings.toggleDamageNumbers(),
        },
        {
          label: 'Pause on Focus Loss',
          read: () => (Settings.pauseOnFocusLoss ? 'ON' : 'OFF'),
          cycle: () => Settings.togglePauseOnFocusLoss(),
        },
      ],
      // Mouse controls are fixed; every key below them is rebindable in the menu.
      [
        'RMB ground | Move',
        'RMB enemy | Attack that enemy',
      ],
    );
    // Name the slot rows after the champion now that the menu exists.
    const labelled = this.hudChampion;
    this.hudChampion = null;
    if (labelled) this.buildKitHud(labelled);
  }

  private buildOverlay(): void {
    const bg = this.add.rectangle(0, 0, ARENA.width, ARENA.height, THEME.ui.scrim, 0.8).setOrigin(0, 0);

    // Wide enough for the longest rows (kills by every mob type); the text is
    // left-aligned at a fixed margin so a long row can never push the columns
    // off the panel, and anything longer still wraps inside it.
    const panelW = END_PANEL_WIDTH;
    const panelX = ARENA.width / 2 - panelW / 2;
    const plate = this.add.graphics();
    pixelPanel(plate, panelX, 56, panelW, 616, {
      fill: THEME.ui.panel, fillAlpha: 0.96, edge: THEME.ui.panelEdge, highlight: THEME.ui.panelHighlight, border: 3,
    });

    const title = pixelText(this, ARENA.width / 2, 110, '', 6).setOrigin(0.5);
    title.setName('title');

    this.resultText = pixelText(this, panelX + END_PANEL_MARGIN, 368, '', 2)
      .setOrigin(0, 0.5)
      .setLineSpacing(2)
      .setMaxWidth(panelW - END_PANEL_MARGIN * 2);

    const endButton = (cx: number, label: string, onClick: () => void): Phaser.GameObjects.GameObject[] => {
      const button = this.add
        .rectangle(cx, 626, 280, 48, THEME.menu.button)
        .setStrokeStyle(3, THEME.ui.accent)
        .setInteractive({ useHandCursor: true });
      const text = pixelText(this, cx, 626, label, 2, THEME.ui.accent).setOrigin(0.5);
      button.on('pointerover', () => button.setFillStyle(THEME.menu.buttonHover));
      button.on('pointerout', () => button.setFillStyle(THEME.menu.button));
      button.on('pointerdown', onClick);
      return [button, text];
    };
    const buttons = [
      ...endButton(ARENA.width / 2 - 160, 'PLAY AGAIN  [R]', () => this.game_.restartRound()),
      ...endButton(ARENA.width / 2 + 160, 'CHANGE CHAMPION', () => this.game_.returnToStart()),
    ];

    this.overlay = this.add
      .container(0, 0, [bg, plate, title, this.resultText, ...buttons])
      .setDepth(200)
      .setVisible(false);
  }

  /**
   * The title card shown over a held round (the first after a page load, or
   * after "Change champion"), while GameScene holds it at time 0. A click
   * anywhere or any key starts the run; the champion row picks who plays it
   * (a click on a tile, or the arrow keys) without starting.
   * It starts on the release, not the press: the press reaches GameScene while
   * the run is still held, so it is never also a move order or a cast, and it
   * already counts as the user gesture CursorLock needs for a non-1.0 Mouse
   * Speed (Escape is the one key the browser doesn't count; the lock then
   * waits for the next click).
   */
  private buildStartScreen(): void {
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;

    const scrim = this.add
      .rectangle(0, 0, ARENA.width, ARENA.height, THEME.ui.scrim, THEME.startScreen.scrimAlpha)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    // A click starts the run only if it was pressed on the card too: Change
    // Champion acts on the press, and the release of that same click lands on
    // this card a moment later. (The keys below follow the same rule.)
    let pressedOnCard = false;
    scrim.on('pointerdown', () => {
      pressedOnCard = true;
    });
    scrim.on('pointerup', () => {
      if (pressedOnCard) this.game_.startRun();
      pressedOnCard = false;
    });

    // Any key, on its release. Only a key pressed while the card is up counts,
    // so the release of the F5 / Ctrl+R that reloaded the page can't start the run.
    // Read straight from the window: a champion pick restarts GameScene, and
    // Phaser's per-frame key queue can drop a press that lands in that frame.
    // UIScene lives for the page, so these are added once.
    const pressed = new Set<string>();
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if (!this.game_?.isAwaitingStart) return;
      // The arrow keys browse champions instead of starting.
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        if (!event.repeat) this.pickChampion(this.championRow.neighbour(event.code === 'ArrowLeft' ? -1 : 1));
        return;
      }
      pressed.add(event.code);
    });
    window.addEventListener('keyup', (event: KeyboardEvent) => {
      if (pressed.delete(event.code) && this.game_?.isAwaitingStart) this.game_.startRun();
    });

    const panelW = 620;
    const panelH = 350;
    const plate = this.add.graphics();
    pixelPanel(plate, cx - panelW / 2, cy - panelH / 2, panelW, panelH, {
      fill: THEME.ui.panel, fillAlpha: 0.97, edge: THEME.ui.panelEdge, highlight: THEME.ui.panelHighlight, border: 3,
    });
    plate.fillStyle(THEME.ui.accent, 0.9);
    plate.fillRect(cx - panelW / 2 + 28, cy - 80, panelW - 56, 3);

    const title = pixelText(this, cx, cy - 120, "QWER'S BACKYARD", 6, THEME.ui.accent).setOrigin(0.5);
    const choose = pixelText(this, cx, cy - 58, 'CHOOSE YOUR CHAMPION', 2, THEME.ui.faint).setOrigin(0.5);
    this.championRow = new ChampionRow(
      this, cx, cy - 6, Object.values(CHAMPIONS), championOf(Profile.data.champion).id, resolveLook(Profile.data),
      (id) => this.pickChampion(id),
    );
    const prompt = pixelText(this, cx, cy + 84, 'CLICK OR PRESS ANY KEY', 3, THEME.ui.text).setOrigin(0.5);
    const credit = pixelText(this, cx, cy + 136, 'DESIGNED BY 2.1K LP, TOP 50 MID QWER', 2, THEME.ui.faint).setOrigin(0.5);

    // UIScene's tweens never pause, so the prompt keeps breathing while the run is held.
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: THEME.startScreen.promptMinAlpha },
      duration: THEME.startScreen.promptPulseMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.startScreen = this.add
      .container(0, 0, [scrim, plate, title, choose, this.championRow.container, prompt, credit])
      .setDepth(300)
      .setVisible(false);
  }

  /** The start screen's pick: saved to the profile, and the held round is rebuilt as that champion. */
  private pickChampion(id: string): void {
    if (!isChampionId(id) || !this.game_.isAwaitingStart) return;
    this.championRow.setSelected(id);
    if (Profile.data.champion === id) return;
    Profile.update((data) => {
      data.champion = id;
    });
    this.game_.returnToStart();
  }

  /**
   * GameScene started a new round. UIScene itself is never restarted, so
   * round-scoped HUD state is re-initialised here from the new round's own
   * snapshot — the first round goes through this exact path too.
   */
  private beginRound(hud: Hud): void {
    this.observedRound = hud.round;
    this.buildKitHud(championOf(hud.champion));
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
    this.chat.push(missionBriefing(hud.stage, hud.wavesInStage), 'mission');
    for (const threat of stageThreats(hud.stage)) this.chat.push(threat, 'threat');
  }

  override update(): void {
    const hud = this.game_.getHudState();
    if (hud.round !== this.observedRound) this.beginRound(hud);

    this.timeText.setText(formatRunTime(hud.runTime));
    this.scoreText.setText(`SCORE ${hud.score}`);
    this.progressText.setText(
      `STAGE ${hud.stage}    WAVE ${hud.wave} / ${hud.wavesInStage}    ENEMIES ${hud.enemiesRemaining}`,
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
    this.levelText.setText(`LV ${hud.level}`);
    this.xpBar.update(40 + 14 + HP_BAR_WIDTH / 2, vitalsTop + 48, hud.levelProgress);
    if (hud.level !== this.shownLevel) {
      // A level-up pops the readout once; a new run quietly resets it.
      if (hud.level > this.shownLevel) {
        this.tweens.add({ targets: this.levelText, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.Out' });
      }
      this.shownLevel = hud.level;
    }

    // Every slot is handed the real numbers from AbilityCooldowns and derives
    // nothing — which is why a Q hit refunding W/E shows up instantly on all three.
    const cd = hud.abilityCooldowns;
    const castOf = (id: string) => (hud.castingAbility === id ? hud.castProgress : 0);
    const champion = this.hudChampion ?? CHAMPIONS[DEFAULT_CHAMPION];
    this.abilityBar?.update([
      ...SLOTS.filter((slot) => champion.slots[slot] !== undefined).map((slot) => ({
        cooldownMs: cd[slot].remaining, cooldownTotalMs: cd[slot].total, castProgress: castOf(slot),
        sinceReducedMs: cd[slot].sinceReduced,
      })),
      { cooldownMs: cd.flash.remaining, cooldownTotalMs: cd.flash.total, castProgress: 0 },
    ]);

    this.modeText
      .setText(hud.attackMovePending ? 'ATTACK MOVE - CLICK A LOCATION' : '')
      .setVisible(hud.attackMovePending);

    this.apmText.setText(`${hud.apm}`);

    this.passiveDisplay?.update(hud.passiveStacks, hud.passiveFraction);
    this.updateStageBanner(hud);
    this.updateChat(hud);
    this.chat.update();

    this.pauseMenu.setVisible(this.game_.isPaused);
    this.startScreen.setVisible(this.game_.isAwaitingStart);
    this.cursorLock.update();

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
   *   hud.stage changes            → "Mission N: Clear W waves." (W = hud.wavesInStage),
   *                                  then a "New threat: …" line for each mob or attack
   *                                  that stage introduces
   *   the stage's last wave clears → "Mission N complete!" — the breather before the
   *                                  next stage
   * Kills, hits and ordinary wave clears say nothing.
   */
  private updateChat(hud: Hud): void {
    if (hud.stage !== this.chatStage) {
      this.chatStage = hud.stage;
      this.chatClearedStage = 0;
      this.chat.push(missionBriefing(hud.stage, hud.wavesInStage), 'mission');
      for (const threat of stageThreats(hud.stage)) this.chat.push(threat, 'threat');
    }

    const stageCleared = hud.wavePhase === 'intermission' && hud.nextTransition === 'stage';
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

    const title = this.overlay.getByName('title') as Phaser.GameObjects.BitmapText;
    title.setText('DEFEATED').setTint(THEME.ui.danger);

    // Only what tells you how the run went. Tuning data (damage per source, the
    // score breakdown, the raw attack metrics) stays in the result and the run
    // log (__runs), off the screen.
    const row = (label: string, value: string) => `${label.padEnd(16, ' ')}${value}`;

    this.resultText.setText(
      [
        row(
          'STAGE REACHED',
          `${result.stageReached}  (wave ${result.waveReached}/${result.wavesInStage})  LV ${result.level}${result.newBest ? '  NEW BEST!' : ''}`,
        ),
        row('SCORE', `${result.score}`),
        row('KILLS', `${result.targetsKilled}`),
        row('KILLS BY TYPE', killsLine(result.killsByType)),
        ...result.kitRows.map((stat) => row(stat.label, stat.value)),
        row('KILLED BY', result.killedBy ? sourceName(result.killedBy) : '-'),
        row('YOUR BEST', bestLine(RunHistory.summary(result.growth, BALANCE_VERSION, result.champion))),
      ].join('\n\n'),
    );
  }
}

/** The registered champion with this id, or the default for an unknown one. */
function championOf(id: string): Champion {
  return isChampionId(id) ? CHAMPIONS[id] : CHAMPIONS[DEFAULT_CHAMPION];
}

const SOURCE_NAMES: Record<string, string> = {
  pursuer: 'pursuer', basic: 'spit', magus: 'magus', edgeFire: 'fire',
  basicContact: 'slime touch', pursuerContact: 'pursuer touch', magusContact: 'magus touch',
  sovereign: 'sovereign', sovereignContact: 'sovereign touch',
};

/** "basic 12  pursuer 3  sovereign 1": only the mobs actually killed, most first. */
function killsLine(kills: Record<string, number>): string {
  const parts = Object.entries(kills).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`);
  return parts.length ? parts.join('  ') : 'none';
}
const sourceName = (source: string) => SOURCE_NAMES[source] ?? source;

/** "STAGE 9  SCORE 45200  (8 RUNS)": your best on the current balance version. */
function bestLine(s: RunSummary): string {
  if (s.runs === 0) return 'not logged';
  const score = s.bestScore !== null ? `  SCORE ${s.bestScore}` : '';
  return `STAGE ${s.best}${score}  (${s.runs} ${s.runs === 1 ? 'RUN' : 'RUNS'})`;
}

/** 65.34 → "1:05.3". Run time is a statistic, not a countdown. */
export function formatRunTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}
