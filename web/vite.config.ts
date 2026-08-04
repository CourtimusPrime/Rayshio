import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    // the API lives on the Express server; same-origin in production
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
