import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: true, hmr: mode !== 'test' },
  build: { target: 'es2022', chunkSizeWarningLimit: 650 },
}));
