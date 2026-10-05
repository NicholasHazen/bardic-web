import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The dev server proxies the API so the browser sees one origin (no CORS in development).
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.BARDIC_SERVER ?? 'http://127.0.0.1:8765',
        // The proxy is the browser's own origin as far as the server should be concerned: drop the
        // page's Origin so the server's foreign-origin guard (for browsers on other addresses) is not
        // triggered by the proxy hop.
        configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')),
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
