export {};

declare global {
  interface Window {
    /** The Phaser.Game instance, exposed by src/main.ts. Suites reach scenes through it. */
    __warmup: any;
    /** The live balance config module, exposed by src/main.ts. */
    __balance: any;
    /** Not exposed by the game; the hud suite falls back when it is absent. */
    __theme?: any;
  }
}
