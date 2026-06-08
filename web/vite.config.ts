/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serves the SPA on :5173 and proxies /api to the Next.js backend on :3100.
// Same-origin from the browser's view -> pop_uid cookie + SSE-over-POST pass through.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
  },
});
