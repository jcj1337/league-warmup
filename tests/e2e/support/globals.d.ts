export {};

declare global {
  interface Window {
    /** The Phaser.Game instance, exposed by src/main.ts. Suites reach scenes through it. */
    __warmup: any;
    /** The live balance config module, exposed by src/main.ts. */
    __balance: any;
    /** The local run log console helper (list / summary / clear), exposed by src/main.ts. */
    __runs: any;
    /** The live key bindings (code / label / set / reset / all), exposed by src/main.ts. */
    __keybinds: any;
    /** The live Mouse Speed setting (value / set / reset / label), exposed by src/main.ts. */
    __mouseSpeed: any;
    /** The saved pause-menu settings (all / pauseOnFocusLoss / cycle…), exposed by src/main.ts. */
    __settings: any;
    /** The player's profile store (data / update / reset): everything saved, exposed by src/main.ts. */
    __profile: any;
    /** Magic Boy's live balance (SKILLSHOT_Q, SKILLSHOT_W, BLINK_E, PASSIVE, LEVELS, STATS), exposed by src/main.ts. */
    __magicBoy: any;
    /** Every playable champion by id, exposed by src/main.ts. */
    __champions: any;
    /** Snake Lady's live balance (Q, W, E, R, POISON, LEVELS, STATS), exposed by src/main.ts. */
    __snakeLady: any;
    /** Axe Man's live balance (Q, W, E, R, AUTO, LEVELS, STATS), exposed by src/main.ts. */
    __axeMan: any;
    /** Not exposed by the game; the hud suite falls back when it is absent. */
    __theme?: any;
  }
}
