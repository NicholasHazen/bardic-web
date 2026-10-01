import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The dev server proxies the API so the browser sees one origin (no CORS in development).
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.BARDIC_SERVER ?? 'http://127.0.0.1:8765' },
  },
  test: { include: ['src/**/*.test.ts'] },
});
