import { defineConfig } from 'vite';
import { compressedPublicAssets } from './scripts/compressed-public-assets.ts';

export default defineConfig(({ mode, command }) => ({
  base: './',
  publicDir: command === 'build' ? false : 'public',
  plugins: [compressedPublicAssets()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, hmr: mode !== 'test' },
  build: { target: 'es2022', chunkSizeWarningLimit: 650 },
}));
