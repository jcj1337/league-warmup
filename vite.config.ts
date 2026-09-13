import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Auto-opens the game on `npm run dev`. Set VITE_NO_OPEN=1 to suppress.
    open: process.env.VITE_NO_OPEN !== '1',
  },
  build: { target: 'es2022' },
});
