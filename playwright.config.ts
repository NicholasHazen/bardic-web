import { defineConfig } from '@playwright/test';

// Flows run against a real bardic-server (see e2e/harness.ts). Build first: `npm run build`.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [['list']],
  use: { viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
});
