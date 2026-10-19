import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Phaser is built from its source (src/phaser.js), not its prebuilt bundle. That source
 * tests features with `typeof FLAG`, which Phaser's own build replaces; left alone, an
 * undefined flag's typeof is the truthy string "undefined" and every feature switches on,
 * WEBGL_DEBUG's missing debugger included. Replaced for the build (Rollup) and for the dev
 * server, which pre-bundles dependencies with esbuild.
 */
const PHASER_SOURCE = /[\\/]node_modules[\\/]phaser[\\/]src[\\/].*\.js$/;
const setPhaserFlags = (code: string): string => code
  .replace(/typeof (CANVAS_RENDERER|WEBGL_RENDERER|FEATURE_SOUND)\b/g, 'true')
  .replace(/typeof (WEBGL_DEBUG|PLUGIN_CAMERA3D|PLUGIN_FBINSTANT)\b/g, 'false');

const phaserFlags: Plugin = {
  name: 'phaser-flags',
  enforce: 'pre',
  transform: (code, id) => (PHASER_SOURCE.test(id) ? setPhaserFlags(code) : undefined),
};

export default defineConfig({
  plugins: [phaserFlags],
  resolve: {
    alias: [{ find: /^phaser$/, replacement: fileURLToPath(new URL('./src/phaser.js', import.meta.url)) }],
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [{
        name: 'phaser-flags',
        setup(build) {
          build.onLoad({ filter: PHASER_SOURCE }, async ({ path }) => ({
            contents: setPhaserFlags(await readFile(path, 'utf8')),
            loader: 'js',
          }));
        },
      }],
    },
  },
  server: {
    // Auto-opens the game on `npm run dev`. Set VITE_NO_OPEN=1 to suppress.
    open: process.env.VITE_NO_OPEN !== '1',
  },
  build: { target: 'es2022' },
});
