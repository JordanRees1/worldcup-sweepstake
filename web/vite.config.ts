import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Resolve `@sweepstake/shared` to its TypeScript source so Vite transpiles it directly
// (rather than treating the symlinked workspace as an external dependency).
const sharedEntry = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@sweepstake/shared': sharedEntry,
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the Express server so the browser never needs the API key or CORS.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
