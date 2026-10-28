import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const serverUrl = process.env.MINEGUARD_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev only: forward API and realtime traffic to Express so the browser
    // still talks to a single origin.
    proxy: {
      '/api': serverUrl,
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
