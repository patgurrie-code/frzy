import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  // Local online play: `npm run server` runs the relay on :8787; dev/preview proxy /ws to it.
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  preview: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
